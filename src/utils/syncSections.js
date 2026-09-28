// syncSections.js — rows and sections of a building, shared by "Match bays in
// this section" (utils/syncSection.js), "Apply my changes to all sections"
// (utils/rowEdits.js) and the aisle rebuild (utils/aisleRebuild.js).
//
// Sections = the beam-rack rows of one building with the same run direction:
// generated racks by their stamped section (genSection), hand-placed racks by
// overlapping run. A ROW is a line across the aisles: the pieces of a split
// row (a middle-bay delete leaves two racks on one line) are one row
// (rowLines). The generator stamps each rack with rowIndex (its row number
// across the aisles, the same in every section), genSection, and where it was
// generated (genRunFt / genCrossFt, feet from the building's corner).

import { rackFootprint } from '../generate/columnCheck'

const BEAM_RACKS = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6
const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])

/** A section's ROWS as lines across the aisles: the pieces of one row (a
 *  rack split by a middle-bay delete leaves two racks on the same line) are
 *  one row, not several. Each line: { pieces, crossLo, crossHi, runStart,
 *  runEnd, rowIndex, genRunFt, genCrossFt }, in order across the aisles. The
 *  gen* fields are the generator's stamps when every piece carries the same
 *  row number (null for hand-placed or mixed lines). */
export function rowLines(racks) {
  const items = racks.map(r => { const f = rackFootprint(r); return { r, cross: crossOf(f), run: runOf(f) } })
    .sort((a, b) => a.cross[0] - b.cross[0])
  const lines = []
  for (const q of items) {
    const l = lines[lines.length - 1]
    if (l && q.cross[0] < l.crossHi - EPS) {
      l.pieces.push(q.r); l.crossHi = Math.max(l.crossHi, q.cross[1])
      l.runStart = Math.min(l.runStart, q.run[0]); l.runEnd = Math.max(l.runEnd, q.run[1])
    } else lines.push({ pieces: [q.r], crossLo: q.cross[0], crossHi: q.cross[1], runStart: q.run[0], runEnd: q.run[1] })
  }
  for (const l of lines) {
    const p0 = l.pieces[0]
    const same = p0.rowIndex != null && Number.isFinite(p0.genRunFt) && Number.isFinite(p0.genCrossFt)
      && l.pieces.every(p => p.rowIndex === p0.rowIndex && p.genRunFt === p0.genRunFt && p.genCrossFt === p0.genCrossFt)
    l.rowIndex = same ? p0.rowIndex : null
    l.genRunFt = same ? p0.genRunFt : null
    l.genCrossFt = same ? p0.genCrossFt : null
  }
  return lines
}

/** Every section of `sourceId`'s building and run direction, ordered along
 *  the run, each { rows (racks, in order across the aisles), lines (see
 *  rowLines), start, end } where start/end are the section's run envelope
 *  (px). `index` = the source's section.
 *
 *  Generated racks belong to the section the generator stamped
 *  (`genSection`), wherever they have been moved since: a section dragged
 *  far along the run never merges with its neighbour. Racks without a stamp
 *  (hand-placed) join the stamped section whose run they overlap; the rest
 *  are grouped by overlapping run (merging sorted intervals — the same
 *  components groupBySegment's pairwise union finds, in n log n). */
export function buildingSections(objects, sourceId) {
  const src = objects.find(o => o.id === sourceId)
  if (!src || !BEAM_RACKS.has(src.type) || !Array.isArray(src.beams) || !rightAngle(src)) return { sections: [], index: -1 }
  const rotated = rackFootprint(src).rotated
  const racks = objects.filter(o => BEAM_RACKS.has(o.type) && Array.isArray(o.beams) && rightAngle(o)
    && (o.parentId || null) === (src.parentId || null) && rackFootprint(o).rotated === rotated)
  const groups = []
  const bySection = new Map()
  const loose = []
  for (const r of racks) {
    const run = runOf(rackFootprint(r))
    if (r.genSection == null) { loose.push({ r, run }); continue }
    if (!bySection.has(r.genSection)) { const g = { items: [], start: Infinity, end: -Infinity, key: r.genSection }; bySection.set(r.genSection, g); groups.push(g) }
    const g = bySection.get(r.genSection)
    g.items.push({ r, run }); g.start = Math.min(g.start, run[0]); g.end = Math.max(g.end, run[1])
  }
  const stamped = [...groups]
  loose.sort((a, b) => a.run[0] - b.run[0])
  const extra = []
  for (const q of loose) {
    const home = stamped.find(g => q.run[0] < g.end - EPS && q.run[1] > g.start + EPS)
      || extra.find(g => q.run[0] < g.end - EPS)
    if (home) { home.items.push(q); home.start = Math.min(home.start, q.run[0]); home.end = Math.max(home.end, q.run[1]) }
    else extra.push({ items: [q], start: q.run[0], end: q.run[1], key: null })
  }
  groups.push(...extra)
  groups.sort((a, b) => a.start - b.start || (a.key ?? Infinity) - (b.key ?? Infinity))
  const sections = groups.map(g => {
    const rows = g.items.map(q => q.r).sort((a, b) => crossOf(rackFootprint(a))[0] - crossOf(rackFootprint(b))[0])
    return { rows, lines: rowLines(rows), start: g.start, end: g.end, key: g.key }
  })
  return { sections, index: sections.findIndex(s => s.rows.some(r => r.id === sourceId)) }
}

