// copyChange.js — the geometry behind copying row changes across sections
// (utils/sectionCopy.js keeps the per-section pending set, utils/copyPrompt.js
// the bar and the question):
//   - planAcrossAll: rows moved ACROSS the aisles (net delta), added and
//     deleted, copied to the same row (rowIndex) in every other section by
//     the replay engine (utils/rowEdits.js planReplay), each copy checked on
//     its own;
//   - the checks: HARD (skipped, reported: overlapping a rack, outside the
//     building, in a cross-aisle; moves stop at the walls) and SOFT (copied
//     with a warning: a narrow aisle, a column in the row);
//   - bayRuns, the preview rects and applyPlan.
// Bay changes and moves ALONG a row are never copied to other sections.
// Pure: no store, no React.

import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { layoutColumns } from '../generate/usableCapacity'
import { rackIssues } from './bayBeam'
import { buildingSections } from './syncSections'
import { makeBaseline, planReplay } from './rowEdits'
import { uprightXs } from '../render/rackOps'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const EPS = 1e-6
const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
const reversedRack = (o) => { const t = norm(o.rotation); return t === 180 || t === 270 }
/** A beam-rack row (the only kind a change is copied for). */
export const isRow = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && rightAngle(o)
const rotatedOf = (o) => rackFootprint(o).rotated
const runOf = (f, rot) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f, rot) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
export const rowKey = (o) => (o.genSection != null && o.rowIndex != null ? o.genSection + '|' + o.rowIndex : null)
const sameBeams = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
const GEO = { x: 0, y: 0, width: 0, height: 0, rotation: 0, uprightWidth: 3, flueSpaceIn: 9 }
const sameShape = (a, b) => ['width', 'height', 'rotation', 'uprightWidth', 'flueSpaceIn'].every(k => Math.abs((a[k] ?? GEO[k]) - (b[k] ?? GEO[k])) < EPS) && sameBeams(a.beams, b.beams)
const geoDiff = (a, b) => !sameShape(a, b) || Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS
/* A drag of a double row re-seats its flue on the columns it passes (the
   live auto-flue, canvas2/liveFlue.js): its depth and flue change with the
   move. That is still a move — measured at the rack's centre. */
const sameShapeButFlue = (a, b) => ['width', 'rotation', 'uprightWidth'].every(k => Math.abs((a[k] ?? GEO[k]) - (b[k] ?? GEO[k])) < EPS) && sameBeams(a.beams, b.beams)
  && (a.type === 'rack_double_row' || (Math.abs((a.height ?? 0) - (b.height ?? 0)) < EPS && Math.abs((a.flueSpaceIn ?? 9) - (b.flueSpaceIn ?? 9)) < EPS))
const centre = (o) => ({ x: o.x + o.width / 2, y: o.y + o.height / 2 })

/** "6' 3"" from world px. */
export function fmtLen(px, gridSize = 40) {
  const inches = Math.round((Math.abs(px) / gridSize) * 12)
  const f = Math.floor(inches / 12), i = inches % 12
  return f && i ? `${f}' ${i}"` : f ? `${f}'` : `${i}"`
}

/** Every bay of a rack along the building's run, in world px:
 *  [{ i (local bay index), lo, hi, beam }] in world order. */
export function bayRuns(o, gridSize = 40) {
  const { xs, upW, beams } = uprightXs(o, gridSize)
  const t = norm(o.rotation), cx = o.x + o.width / 2, cy = o.y + o.height / 2
  const map = (u) => (t === 0 ? u : t === 180 ? 2 * cx - u : t === 90 ? cy + (u - cx) : cy - (u - cx))
  return beams.map((beam, i) => { const p = map(xs[i] + upW), q = map(xs[i + 1]); return { i, lo: Math.min(p, q), hi: Math.max(p, q), beam, id: o.id } })
    .sort((a, b) => a.lo - b.lo)
}

/** The building's own row direction (its generated rows'), or null. */
function buildingRotated(objects, fpId) {
  const rows = objects.filter(o => isRow(o) && o.parentId === fpId)
  const gen = rows.filter(o => o.genSection != null)
  const pool = gen.length ? gen : rows
  if (!pool.length) return null
  return pool.filter(rotatedOf).length * 2 > pool.length
}

/* ── shared checks ────────────────────────────────────────────────────────── */

/** The cross-aisles of a building's rows: the gaps between its sections
 *  along the run, [{ lo, hi, between: [a, b] }] in world px. */
export function crossAisleGaps(objects, fpId, rotated) {
  const ref = objects.find(o => isRow(o) && o.parentId === fpId && rotatedOf(o) === rotated)
  if (!ref) return []
  const { sections } = buildingSections(objects, ref.id)
  const out = []
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i], b = sections[i + 1]
    if (b.start - a.end > EPS) out.push({ lo: a.end, hi: b.start, between: [a.key ?? i + 1, b.key ?? i + 2] })
  }
  return out
}

/** The cross-aisles between GENERATED sections only — a layout placed by
 *  hand has none, so there is nothing to warn about there. */
export function generatedCrossAisleGaps(objects, fpId, rotated) {
  const ref = objects.find(o => isRow(o) && o.parentId === fpId && o.genSection != null && rotatedOf(o) === rotated)
  if (!ref) return []
  const sections = buildingSections(objects, ref.id).sections.filter(s => s.key != null)
  const out = []
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i], b = sections[i + 1]
    if (b.start - a.end > EPS) out.push({ lo: a.end, hi: b.start, between: [a.key, b.key] })
  }
  return out
}

/** Hard problems for one rack where it would stand in `world`: a reason
 *  string, or null. */
export function hardProblem(rack, world, gaps, rotated, gridSize = 40, fmtRow = rowName) {
  const fp = rack.parentId ? world.find(o => o.id === rack.parentId) : null
  if (!fp) return 'outside the building'
  const iss = rackIssues(rack, world, gridSize)
  if (iss.wallOutIn > 0) return `outside the building by ${fmtLen((iss.wallOutIn / 12) * gridSize, gridSize)}`
  if (iss.overlaps.length) {
    const other = world.find(o => o.id === iss.overlaps[0])
    const fa = rackFootprint(rack), fb = rackFootprint(other)
    const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0)
    const by = Math.min(ov(fa.x, fa.x + fa.w, fb.x, fb.x + fb.w), ov(fa.y, fa.y + fa.h, fb.y, fb.y + fb.h))
    return `overlaps ${fmtRow(other)} by ${fmtLen(by, gridSize)}`
  }
  const [r0, r1] = runOf(rackFootprint(rack), rotated)
  const g = gaps.find(q => Math.min(r1, q.hi) - Math.max(r0, q.lo) > 0.5)
  if (g) return `in the cross-aisle between sections ${g.between[0]} and ${g.between[1]}`
  return null
}
const rowName = (o) => (o && o.rowIndex != null ? `row ${o.rowIndex}` : 'a rack')

/** Soft problems for one rack: an aisle narrower than the forklift aisle on
 *  either side, a column in the row. [text]. */
export function softProblems(rack, world, rotated, gridSize = 40, profile = MHE_PROFILES.reach, columns = null) {
  const out = []
  const f = rackFootprint(rack), [r0, r1] = runOf(f, rotated), [c0, c1] = crossOf(f, rotated)
  const need = profile.aisleFt * gridSize
  let below = Infinity, above = Infinity
  for (const o of world) {
    if (o.id === rack.id || !isRow(o) || o.parentId !== rack.parentId || rotatedOf(o) !== rotated) continue
    const g = rackFootprint(o), [s0, s1] = runOf(g, rotated), [d0, d1] = crossOf(g, rotated)
    if (Math.min(r1, s1) - Math.max(r0, s0) <= EPS) continue
    if (d1 <= c0 + EPS) below = Math.min(below, c0 - d1)
    if (d0 >= c1 - EPS) above = Math.min(above, d0 - c1)
  }
  const narrow = [below, above].filter(g => g > 2 * gridSize && g < need - gridSize / 24)
  if (narrow.length) out.push(`aisle ${fmtLen(Math.min(...narrow), gridSize)} (the forklift needs ${fmtLen(need, gridSize)})`)
  // a column inside the row itself (a double row's flue is where columns belong)
  const cols = columns || layoutColumns(world, gridSize)
  const flue = rack.type === 'rack_double_row' ? ((rack.flueSpaceIn || 9) / 12) * gridSize : 0
  const mid = (c0 + c1) / 2
  const inRow = cols.some(col => {
    const cf = { x: col.x, y: col.y, w: col.w, h: col.h }
    const [q0, q1] = runOf(cf, rotated), [e0, e1] = crossOf(cf, rotated)
    if (Math.min(r1, q1) - Math.max(r0, q0) <= 0.5 || Math.min(c1, e1) - Math.max(c0, e0) <= 0.5) return false
    return !(flue > 0 && e0 >= mid - flue / 2 - 0.5 && e1 <= mid + flue / 2 + 0.5)
  })
  if (inRow) out.push('a column stands in the row')
  return out
}

/* ── plan ─────────────────────────────────────────────────────────────────── */

const pick = (o) => ({ x: o.x, y: o.y, width: o.width, height: o.height, flueSpaceIn: o.flueSpaceIn, beams: o.beams })
const emptyPlan = (change) => ({ change, updates: new Map(), deletes: new Set(), adds: [], copies: [], skipped: [], held: [], warnings: [] })

/** The objects with a plan applied (deletes, updates, added copies); aisles
 *  on a deleted rack go with it. */
export function applyPlan(objects, plan) {
  const gone = plan.deletes
  return objects.filter(o => !gone.has(o.id) && !(o.type === 'aisle' && (gone.has(o.row1Id) || gone.has(o.row2Id))))
    .map(o => (plan.updates.has(o.id) ? { ...o, ...plan.updates.get(o.id) } : o))
    .concat(plan.adds)
}

/** A rack laid out to a new world-order bay list, one end held. */

const secName = (section, rowIndex) => `section ${section}, row ${rowIndex}`
const FAKE = 1e6

/** ACROSS SECTIONS: every row change between `before` and `after` in one
 *  building — rows moved across the aisles, deleted, added — copied to the
 *  same row (rowIndex) in every other section, by the replay engine
 *  (utils/rowEdits.js planReplay) with a baseline taken from `before`.
 *  The caller hands in an `after` in which the source section shows ONLY
 *  what may be copied (bays and along-moves already taken back out).
 *  `src` = the ids of rows added by hand (they get a new row number shared
 *  by their copies). Racks with no row number that stand where they stood
 *  are given a temporary one for the planning, so they count as rows in
 *  place, never as added ones. Each copy is checked on its own; a copy that
 *  cannot go in is skipped with the reason; moves stop at the walls. */
export function planAcrossAll(before, after, fpId, rotated, src, gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12), gaps = []) {
  const plan = emptyPlan(null)
  const fpB = before.find(o => o.id === fpId)
  if (!fpB) return plan
  const secs = buildingSections(before, (before.find(o => isRow(o) && o.parentId === fpId && o.genSection != null && rotatedOf(o) === rotated) || {}).id)
  const envs = (secs.sections || []).filter(s => s.key != null)
  const fake = new Map()
  let k = 0
  for (const o of [...before, ...after]) {
    if (!isRow(o) || o.parentId !== fpId || o.genSection != null || src.has(o.id) || fake.has(o.id)) continue
    const [r0, r1] = runOf(rackFootprint(o), rotated)
    const home = [...envs].sort((a, b) => (Math.min(r1, b.end) - Math.max(r0, b.start)) - (Math.min(r1, a.end) - Math.max(r0, a.start)))[0]
    if (!home) continue
    fake.set(o.id, { genSection: home.key, rowIndex: FAKE + (++k), genRunFt: 0, genCrossFt: 0 })
  }
  const tag = (list) => list.map(o => (fake.has(o.id) ? { ...o, ...fake.get(o.id) } : o))
  const beforeT = tag(before), baseline = makeBaseline(beforeT, beforeT.find(o => o.id === fpId), gridSize)
  const objs = tag(after).map(o => (o.id === fpId ? { ...o, rowBaseline: baseline } : o))
  const rp = planReplay(objs, fpId, gridSize, newId, [])
  const real = (r) => r != null && r < FAKE

  for (const d of rp.deleted) {
    if (!real(d.rowIndex)) continue
    d.ids.forEach(id => plan.deletes.add(id))
    plan.copies.push({ section: d.section, rowIndex: d.rowIndex, name: secName(d.section, d.rowIndex), ids: d.ids, gone: true })
  }
  let world = after.filter(o => !plan.deletes.has(o.id))
  for (const m of rp.moved) {
    if (!real(m.rowIndex) || m.ids.some(id => src.has(id))) continue
    const ups = m.ids.map(id => [id, rp.updates.get(id)]).filter(([, u]) => u)
    const moved = ups.map(([id, u]) => ({ ...world.find(o => o.id === id), ...u }))
    const next = world.map(o => { const u = rp.updates.get(o.id); return u && m.ids.includes(o.id) ? { ...o, ...u } : o })
    const why = moved.map(r => hardProblem(r, next, gaps, rotated, gridSize)).find(Boolean)
    const name = secName(m.section, m.rowIndex)
    if (why) { plan.skipped.push({ section: m.section, rowIndex: m.rowIndex, name, reason: why }); continue }
    for (const [id, u] of ups) plan.updates.set(id, { x: u.x, y: u.y })
    plan.copies.push({ section: m.section, rowIndex: m.rowIndex, name, ids: m.ids })
    world = next
  }
  for (const h of rp.held) {
    if (!real(h.rowIndex) || h.ids.some(id => src.has(id))) continue
    plan.held.push({ section: h.section, rowIndex: h.rowIndex, name: secName(h.section, h.rowIndex), reason: `stopped at the wall, ${fmtLen((h.shortIn / 12) * gridSize, gridSize)} short` })
  }
  for (const m of rp.missing) if (real(m.rowIndex)) plan.skipped.push({ section: m.section, rowIndex: m.rowIndex, name: secName(m.section, m.rowIndex), reason: 'this section has no such row' })
  // added rows: each gets the next real row number, shared with its copies
  let next = Math.max(0, ...after.filter(o => o.parentId === fpId && o.rowIndex != null && real(o.rowIndex)).map(o => o.rowIndex)) + 1
  for (const a of rp.added) {
    if (!a.ids.some(id => src.has(id))) continue
    const rowIndex = next++
    for (const id of a.ids) {
      const u = rp.updates.get(id)
      if (u) plan.updates.set(id, { rowIndex, genSection: u.genSection, genRunFt: u.genRunFt, genCrossFt: u.genCrossFt })
    }
    for (const c of rp.adds.filter(q => q.rowIndex === a.rowIndex)) {
      const copy = { ...c, rowIndex }
      plan.adds.push(copy)
      const e = plan.copies.find(q => q.section === copy.genSection && q.rowIndex === rowIndex)
      if (e) e.ids.push(copy.id)
      else plan.copies.push({ section: copy.genSection, rowIndex, name: secName(copy.genSection, rowIndex), ids: [copy.id] })
    }
    for (const s of rp.skipped.filter(q => q.rowIndex === a.rowIndex)) plan.skipped.push({ section: s.section, rowIndex, name: `section ${s.section}, new row ${rowIndex}`, reason: s.reason })
  }
  return plan
}

/** Soft problems the copies in `plan` bring (not ones the rows already had):
 *  added to plan.warnings. */
export function addSoftWarnings(plan, after, rotated, gridSize = 40, profile = MHE_PROFILES.reach) {
  const world = applyPlan(after, plan)
  const cols = layoutColumns(world, gridSize)
  for (const c of plan.copies) {
    if (c.gone) continue
    const had = new Set(), texts = new Set()
    for (const id of c.ids) { const r = after.find(o => o.id === id); if (r) for (const t of softProblems(r, after, rotated, gridSize, profile, cols)) had.add(t.replace(/\d.*$/, '')) }
    for (const id of c.ids) { const r = world.find(o => o.id === id); if (r) for (const t of softProblems(r, world, rotated, gridSize, profile, cols)) if (!had.has(t.replace(/\d.*$/, ''))) texts.add(t) }
    for (const t of texts) plan.warnings.push({ section: c.section, rowIndex: c.rowIndex, name: c.name, reason: t })
  }
  return plan
}


/** Where the copies would land, for the hover preview: [{ x, y, w, h, gone }]
 *  in world px — each copied rack's footprint after the copy, or (gone) the
 *  footprint of a rack the copy would delete. Changes nothing. */
/** The hover preview's React key for rect `i`: every added copy carries the
 *  same placeholder id while previewing, so the position keeps them apart. */
export const previewKey = (r, i) => (r.gone ? 'd' : 'c') + i + ':' + r.id

export function copyPreviewRects(objects, plan) {
  if (!plan) return []
  const world = applyPlan(objects, plan)
  const now = new Map(world.map(o => [o.id, o])), was = new Map(objects.map(o => [o.id, o]))
  const out = []
  for (const c of plan.copies) for (const id of c.ids) {
    const o = c.gone ? was.get(id) : now.get(id)
    if (o) { const f = rackFootprint(o); out.push({ id, x: f.x, y: f.y, w: f.w, h: f.h, gone: !!c.gone }) }
  }
  return out
}
