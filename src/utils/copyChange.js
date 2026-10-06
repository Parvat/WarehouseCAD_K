// copyChange.js — the checks a row placed among others must pass, shared by placing a row (utils/placement.js),
// pasting (utils/pasteAt.js), Fill racking and Check layout, and the Row group's skips:
//   - HARD (it can't go: overlapping a rack, outside the building, in a cross-aisle) and SOFT (it goes, with
//     a warning: a narrow aisle, a column in the row);
//   - the cross-aisles between a building's sections; bayRuns; length and section labels.
// (Copying row changes across sections lived here too; the Row group replaced it — utils/rowGroup.js.)
// Pure: no store, no React.

import { rackFootprint, MHE_PROFILES, aisleLevel } from '../generate/columnCheck'
import { layoutColumns } from '../generate/usableCapacity'
import { rackIssues } from './bayBeam'
import { buildingSections } from './syncSections'
import { uprightXs } from '../render/rackOps'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const EPS = 1e-6
const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
/** A beam-rack row, turned a right angle. */
export const isRow = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && rightAngle(o)
const rotatedOf = (o) => rackFootprint(o).rotated
const runOf = (f, rot) => (rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f, rot) => (rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h])

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
  // the one aisle-width rule (columnCheck's aisleLevel), a hair forgiven for rounding
  const narrow = [below, above].filter(g => g > 2 * gridSize && aisleLevel(g, profile, gridSize, gridSize / 24) < 3)
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

/** A section as the user reads it: "3" for generated section 3, and "1" — never "run 1" — for the first
 *  run of racks placed by hand. */
export const sectionLabel = (s) => (typeof s === 'string' && s.startsWith('run ') ? s.slice(4) : String(s))
