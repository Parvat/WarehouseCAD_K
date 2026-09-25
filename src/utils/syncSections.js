// syncSections.js — "Sync all sections": after adjusting ROW POSITIONS in
// one section (spacing across the aisles, where each row starts along the
// run), apply the same positions to every other section. Positions only:
// beams, depth, levels, rotation are untouched. Pure: the right panel
// commits the result as one undo.
//
// Sections = the beam-rack rows in one building with the same run direction,
// grouped by overlapping run (the rows between the same two cross-aisles, or
// a wall and a cross-aisle), ordered along the run. Rows are matched across
// sections by NEAREST position across the aisles, within half an aisle
// (matchRows), so a section missing a middle row keeps its other rows with
// their true partners. A matched row gets the source row's position across the aisles (its near
// edge) and the source row's offset from the section's start edge along the
// run, the start edge being the run start of the section's earliest row
// before the sync. Rows with no partner within half an aisle stay put and are
// reported, as are source rows with no partner in a section (gaps).
//
// Warnings never block: a moved row that overlaps another rack, runs into a
// cross-aisle (past its section's run envelope toward the next section), or
// passes the building's inner wall is listed.

import { rackFootprint } from '../generate/columnCheck'
import { changeIssues } from './bayBeam'

const BEAM_RACKS = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6
const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])

/** Every section of `sourceId`'s building and run direction, ordered along
 *  the run, each { rows (in order across the aisles), start, end } where
 *  start/end are the section's run envelope (px). `index` = the source's. */
export function buildingSections(objects, sourceId) {
  const src = objects.find(o => o.id === sourceId)
  if (!src || !BEAM_RACKS.has(src.type) || !Array.isArray(src.beams) || !rightAngle(src)) return { sections: [], index: -1 }
  const rotated = rackFootprint(src).rotated
  const racks = objects.filter(o => BEAM_RACKS.has(o.type) && Array.isArray(o.beams) && rightAngle(o)
    && (o.parentId || null) === (src.parentId || null) && rackFootprint(o).rotated === rotated)
  /* Rows grouped by overlapping run: on one axis that is merging sorted
     intervals (the same components groupBySegment's pairwise union finds,
     in n log n — this runs on every panel render). */
  const byRun = racks.map(r => ({ r, run: runOf(rackFootprint(r)) })).sort((a, b) => a.run[0] - b.run[0])
  const groups = []
  for (const q of byRun) {
    const g = groups[groups.length - 1]
    if (g && q.run[0] < g.end - EPS) { g.items.push(q); g.end = Math.max(g.end, q.run[1]) }
    else groups.push({ items: [q], start: q.run[0], end: q.run[1] })
  }
  const sections = groups.map(g => ({
    rows: g.items.map(q => q.r).sort((a, b) => crossOf(rackFootprint(a))[0] - crossOf(rackFootprint(b))[0]),
    start: g.start, end: g.end,
  }))
  return { sections, index: sections.findIndex(s => s.rows.some(r => r.id === sourceId)) }
}

const crossMidOf = (r) => { const [a, b] = crossOf(rackFootprint(r)); return (a + b) / 2 }

/** Pair a section's rows with the source section's rows by NEAREST position
 *  across the aisles (row centres), one to one, nearest pairs first, only
 *  within `tol` px. A section missing a middle row therefore keeps every
 *  other row with its true partner instead of shifting them all by one.
 *  Returns Map(targetIndex -> sourceIndex). */
export function matchRows(targets, sources, tol) {
  const pairs = []
  targets.forEach((t, i) => sources.forEach((s, j) => {
    const d = Math.abs(crossMidOf(t) - crossMidOf(s))
    if (d <= tol + EPS) pairs.push({ i, j, d })
  }))
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j)
  const byT = new Map(), usedS = new Set()
  for (const p of pairs) {
    if (byT.has(p.i) || usedS.has(p.j)) continue
    byT.set(p.i, p.j); usedS.add(p.j)
  }
  return byT
}

/** Half an aisle: half the narrowest gap between neighbouring rows of the
 *  source section, across the aisles (px). One row alone -> no limit. */
export function matchTolerance(rows) {
  let gap = Infinity
  for (let i = 1; i < rows.length; i++) {
    const g = crossOf(rackFootprint(rows[i]))[0] - crossOf(rackFootprint(rows[i - 1]))[1]
    if (g > EPS) gap = Math.min(gap, g)
  }
  return gap / 2
}

/** The sync as { updates: Map(id -> { x, y }), sections, index, unmatched,
 *  gaps }: `unmatched` = rows left alone, no source row within half an
 *  aisle; `gaps` = source rows with no partner in a section (e.g. a row
 *  deleted there). Row numbers are 1-based, in order across the aisles. */
export function planSectionsSync(objects, sourceId) {
  const { sections, index } = buildingSections(objects, sourceId)
  const updates = new Map()
  const unmatched = [], gaps = []
  if (index < 0) return { updates, sections, index, unmatched, gaps }
  const src = sections[index]
  const pattern = src.rows.map(r => {
    const f = rackFootprint(r)
    return { crossLo: crossOf(f)[0], offset: runOf(f)[0] - src.start }
  })
  const tol = matchTolerance(src.rows)
  const clean = (v) => (Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-9 ? Math.round(v * 1e6) / 1e6 : v)
  sections.forEach((sec, k) => {
    if (k === index) return
    const match = matchRows(sec.rows, src.rows, tol)
    const matchedSrc = new Set(match.values())
    src.rows.forEach((_, j) => { if (!matchedSrc.has(j)) gaps.push({ section: k + 1, row: j + 1 }) })
    sec.rows.forEach((t, i) => {
      if (!match.has(i)) { unmatched.push({ id: t.id, section: k + 1, row: i + 1 }); return }
      const p = pattern[match.get(i)]
      const f = rackFootprint(t)
      const runLen = runOf(f)[1] - runOf(f)[0], crossLen = crossOf(f)[1] - crossOf(f)[0]
      const runMid = sec.start + p.offset + runLen / 2
      const crossMid = p.crossLo + crossLen / 2
      const cx = f.rotated ? crossMid : runMid, cy = f.rotated ? runMid : crossMid
      const x = clean(cx - t.width / 2), y = clean(cy - t.height / 2)
      if (Math.abs(x - t.x) > EPS || Math.abs(y - t.y) > EPS) updates.set(t.id, { x, y })
    })
  })
  return { updates, sections, index, unmatched, gaps }
}

/** Rows the sync would put in trouble: [{ id, section, row, overlaps,
 *  wallOutIn, crossAisleIn }] — crossAisleIn = how far (inches) the row now
 *  reaches past its section's run envelope into a cross-aisle. */
export function sectionsSyncWarnings(objects, plan, gridSize = 40) {
  const { updates, sections } = plan
  const { byId } = changeIssues(objects, updates, gridSize)
  const out = []
  sections.forEach((sec, k) => {
    sec.rows.forEach((r, i) => {
      if (!updates.has(r.id)) return
      const f = rackFootprint({ ...r, ...updates.get(r.id) })
      const [a, b] = runOf(f)
      let into = 0
      if (k > 0 && a < sec.start - EPS) into = Math.max(into, sec.start - a)                     // toward the previous section
      if (k < sections.length - 1 && b > sec.end + EPS) into = Math.max(into, b - sec.end)       // toward the next section
      const crossAisleIn = into > 0 ? Math.round(((into / gridSize) * 12) * 100) / 100 : 0
      const iss = byId.get(r.id) || { overlaps: [], wallOutIn: 0 }
      if (iss.overlaps.length || iss.wallOutIn > 0 || crossAisleIn > 0) {
        out.push({ id: r.id, section: k + 1, row: i + 1, overlaps: iss.overlaps, wallOutIn: iss.wallOutIn, crossAisleIn })
      }
    })
  })
  return out
}
