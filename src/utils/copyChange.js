// copyChange.js — "Copy this change": after each row / bay action the change
// stays where it was made, and ONE copy is offered, depending on the change:
//
//   ACROSS SECTIONS  "Copy to all sections" — the same row (rowIndex) in
//     every other section:
//       - a row moved ACROSS the aisles: only the delta, across;
//       - a row deleted;
//       - a row added (paste, duplicate, left panel).
//   WITHIN THE SECTION  "Copy to this section's rows" — every other row in
//     that section, at the same spot:
//       - a row moved ALONG its run: only the delta, along;
//       - bays added, deleted (end or middle) or given a new beam length.
//
// The change is read from the layout just before the action and just after
// it (readChange) — nothing is logged and nothing piles up. planCopy
// then works out every copy, and checks each one on its own:
//   - HARD (the copy is skipped, and the note says which section / row and
//     why): overlapping a rack, outside the building, in a cross-aisle.
//     Moves stop at the walls rather than being skipped.
//   - SOFT (copied, with a warning): an aisle narrower than the forklift
//     aisle, a column in the row.
// A full-length added row matches each section's row length; a shorter one
// keeps its own (utils/rowEdits.js planReplay, reused here for the
// across-sections copies with a baseline taken from the "before" layout).
// Pure: no store, no React.

import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { layoutColumns } from '../generate/usableCapacity'
import { rackIssues } from './bayBeam'
import { buildingSections } from './syncSections'
import { makeBaseline, planReplay } from './rowEdits'
import { splitRackForBayDelete } from './baySplit'
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
const rowKey = (o) => (o.genSection != null && o.rowIndex != null ? o.genSection + '|' + o.rowIndex : null)
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

/* ── classify ─────────────────────────────────────────────────────────────── */

const TOL = (gridSize) => 0.02 * gridSize          // half an inch, world px
const matches = (a, b, tol) => Math.abs(a.lo - b.lo) < tol && Math.abs(a.hi - b.hi) < tol

/** One row's bay change from its racks before and after: { type: 'delete',
 *  removed: [{lo, hi}] } | { type: 'add', side: 'lo'|'hi', beams (world
 *  order) } | { type: 'beam', anchor: 'lo'|'hi', changes: [{ lo, hi, beam }] }
 *  or null when it is none of those. */
function bayOp(beforeRacks, afterRacks, gridSize) {
  const tol = TOL(gridSize)
  const B = beforeRacks.flatMap(o => bayRuns(o, gridSize)).sort((a, b) => a.lo - b.lo)
  const A = afterRacks.flatMap(o => bayRuns(o, gridSize)).sort((a, b) => a.lo - b.lo)
  const aInB = A.every(a => B.some(b => matches(a, b, tol)))
  const bInA = B.every(b => A.some(a => matches(a, b, tol)))
  if (aInB && A.length < B.length) return { type: 'delete', removed: B.filter(b => !A.some(a => matches(a, b, tol))).map(b => ({ lo: b.lo, hi: b.hi })) }
  if (bInA && A.length > B.length) {
    const added = A.filter(a => !B.some(b => matches(a, b, tol)))
    const lo = Math.min(...B.map(b => b.lo)), hi = Math.max(...B.map(b => b.hi))
    const side = added.every(a => a.lo >= hi - tol) ? 'hi' : added.every(a => a.hi <= lo + tol) ? 'lo' : null
    return side ? { type: 'add', side, beams: added.map(a => a.beam) } : null
  }
  if (A.length === B.length && A.length) {
    const changes = B.map((b, k) => ({ lo: b.lo, hi: b.hi, beam: A[k].beam, was: b.beam })).filter(c => c.beam !== c.was)
    if (!changes.length) return null
    const anchor = Math.abs(A[0].lo - B[0].lo) < tol ? 'lo' : Math.abs(A[A.length - 1].hi - B[B.length - 1].hi) < tol ? 'hi' : null
    return anchor ? { type: 'beam', anchor, changes: changes.map(({ lo, hi, beam }) => ({ lo, hi, beam })) } : null
  }
  return null
}

/** What one action did to the rows, from the layout before and after it.
 *    null — no row / bay change to talk about (not a row, a generated
 *      layout, a building deleted with its rows);
 *    { changes: [change, ...] } — what can be copied: one change, or two for
 *      a row dragged both across and along (each copies only its own part);
 *    { blocked: 'sentence' } — a row / bay change that can't be copied, and
 *      why (rows in several sections, an upright width, a mixed edit, ...).
 *  A change: { scope: 'sections', kind: 'move' (axis 'cross') | 'delete' |
 *  'add', ... } or { scope: 'section', kind: 'move' (axis 'run') | 'bays',
 *  ... }; `d` = the delta on the axis copied, `dOther` = the other axis. */
export function readChange(before, after, gridSize = 40) {
  if (!Array.isArray(before) || !Array.isArray(after) || before === after) return null
  const B = new Map(before.filter(isRow).map(o => [o.id, o])), A = new Map(after.filter(isRow).map(o => [o.id, o]))
  const removed = [...B.values()].filter(o => !A.has(o.id))
  const added = [...A.values()].filter(o => !B.has(o.id))
  const changed = [...A.values()].filter(o => B.has(o.id) && geoDiff(B.get(o.id), o))
  if (!removed.length && !added.length && !changed.length) return null
  const involved = [...removed, ...added, ...changed]
  // a generated layout (every new rack stamped, nothing else touched): not an edit
  if (!removed.length && !changed.length && added.every(o => o.genSection != null && !o.pieceOf)) return null
  const fpIds = new Set(involved.map(o => o.parentId || null))
  if (fpIds.has(null)) return null                                    // rows outside any building: nothing to copy to
  if (fpIds.size > 1) return blocked(`This change affects rows in ${fpIds.size} buildings, so it can't be copied. Make the change in one building, then copy it.`)
  const fpId = involved[0].parentId
  const fp = after.find(o => o.id === fpId), fpB = before.find(o => o.id === fpId)
  if (!fp || !fpB || !FP.has(fp.type)) return null                   // the building itself went (or came)
  // the building moved, turned or reshaped (its rows ride along), or cleared of its rows: not a row edit
  const fpGeo = (o) => JSON.stringify([o.x, o.y, o.width, o.height, o.rotation || 0, o.fpVerts || null])
  if (fpGeo(fp) !== fpGeo(fpB)) return null
  if (removed.length && !added.length && ![...A.values()].some(o => o.parentId === fpId)) return null
  // rows in more than one section
  const secOf = (o, list) => {
    if (o.genSection != null) return 'g' + o.genSection
    const { sections, index } = buildingSections(list, o.id)
    return index >= 0 ? (sections[index].key != null ? 'g' + sections[index].key : 'r' + index) : 'r?'
  }
  const secs = new Set([...removed.map(o => secOf(o, before)), ...added.map(o => secOf(o, after)), ...changed.map(o => secOf(o, after))])
  if (secs.size > 1) return { ...blocked(`This change affects rows in ${secs.size} sections, so it can't be copied. Make the change in one section, then copy it.`), fpId, sections: secs.size }
  if (changed.some(o => norm(o.rotation) !== norm(B.get(o.id).rotation))) return cant('a turned row')
  const rotated = rotatedOf(involved[0])
  const bRot = buildingRotated(before, fpId)
  if (involved.some(o => rotatedOf(o) !== rotated) || (bRot != null && bRot !== rotated)) return cant("the row runs the other way from the building's rows")
  if (changed.some(o => Math.abs((o.uprightWidth ?? 3) - (B.get(o.id).uprightWidth ?? 3)) > EPS)) return cant('an upright width change')
  const base = { fpId, rotated }

  // a split piece: a new rack whose pieceOf chain leads back to a rack that was there
  const rootOf = (o) => {
    let q = o
    const seen = new Set()
    while (q && q.pieceOf && !B.has(q.id) && !seen.has(q.id)) { seen.add(q.id); q = A.get(q.pieceOf) || B.get(q.pieceOf) || null }
    return q && B.has(q.id) ? q.id : null
  }
  const pieces = added.filter(o => o.pieceOf && rootOf(o))
  const fresh = added.filter(o => !pieces.includes(o))

  if (fresh.length) {
    // a row added by hand (paste, duplicate, left panel)
    if (pieces.length || removed.length || changed.length) return cant('it adds a row and changes others in one go')
    if (fresh.some(o => o.genSection != null)) return cant('the new row carries another row\'s number')
    return ok({ ...base, scope: 'sections', kind: 'add', ids: fresh.map(o => o.id) })
  }

  if (removed.length && !pieces.length && !changed.length) {
    const keys = new Set(removed.map(rowKey))
    const whole = [...keys].every(k => k && ![...A.values()].some(o => rowKey(o) === k))
    if (whole) {
      const rows = [...keys].map(k => { const o = removed.find(r => rowKey(r) === k); return { section: o.genSection, rowIndex: o.rowIndex } })
      return ok({ ...base, scope: 'sections', kind: 'delete', rows, ids: removed.map(o => o.id) })
    }
    if (removed.some(o => rowKey(o) == null) && [...keys].every(k => k == null)) return cant('the row was added by hand and never copied, so the other sections have no row to match it')
    // part of a row (one piece of a split row) — a bay change, below
  }

  if (changed.length && !removed.length && !pieces.length && changed.every(o => sameShapeButFlue(B.get(o.id), o))) {
    const d = changed.map(o => { const a = centre(o), b = centre(B.get(o.id)); return { dx: a.x - b.x, dy: a.y - b.y } })
    if (!d.every(q => Math.abs(q.dx - d[0].dx) < EPS && Math.abs(q.dy - d[0].dy) < EPS)) return cant('the rows moved by different amounts')
    const dRun = rotated ? d[0].dy : d[0].dx, dCross = rotated ? d[0].dx : d[0].dy
    if (Math.abs(dRun) < EPS && Math.abs(dCross) < EPS) return cant('a flue or depth change')
    const ids = changed.map(o => o.id)
    const rowsOf = () => [...new Map(changed.map(o => [rowKey(o) ?? o.id, { section: o.genSection ?? null, rowIndex: o.rowIndex ?? null }])).values()]
    const across = { ...base, scope: 'sections', kind: 'move', axis: 'cross', d: dCross, dOther: dRun, rows: rowsOf(), ids }
    const along = { ...base, scope: 'section', kind: 'move', axis: 'run', d: dRun, dOther: dCross, rows: rowsOf(), ids }
    const unnumbered = changed.some(o => rowKey(o) == null)
    const MIN = gridSize / 12                                         // a part under an inch is drag noise
    if (Math.abs(dCross) >= MIN && Math.abs(dRun) >= MIN) {
      // moved both ways: each part is its own copy
      if (unnumbered) return { changes: [along], notes: ['The across part can\'t be copied: the row was added by hand and never copied, so the other sections have no row to match it.'] }
      return { changes: [across, along] }
    }
    if (Math.abs(dCross) >= Math.abs(dRun)) {
      if (unnumbered) return cant('the row was added by hand and never copied, so the other sections have no row to match it')
      return ok(across)
    }
    return ok(along)
  }

  // a bay change never moves a row across the aisles: both at once is a mixed edit
  if (changed.some(o => { const b = crossOf(rackFootprint(B.get(o.id)), rotated), c = crossOf(rackFootprint(o), rotated); return Math.abs(b[0] - c[0]) > EPS || Math.abs(b[1] - c[1]) > EPS }))
    return cant('it moves the row across the aisles and changes its bays in one go')
  // bays: every row touched, before and after, by its row number (or the rack it was split from)
  const idOf = (o, map) => rowKey(o) ?? ('#' + (map === B ? o.id : (rootOf(o) || o.id)))
  const rowIds = new Set([...removed.map(o => idOf(o, B)), ...changed.map(o => idOf(o, A)), ...pieces.map(o => idOf(o, A))])
  const ops = []
  for (const rid of rowIds) {
    const bR = [...B.values()].filter(o => o.parentId === fpId && idOf(o, B) === rid)
    const aR = [...A.values()].filter(o => o.parentId === fpId && idOf(o, A) === rid)
    if (!bR.length || !aR.length) return cant('it mixes different kinds of edit')
    const op = bayOp(bR, aR, gridSize)
    if (!op) return cant('this bay change can\'t be matched in the other rows (bays added in the middle, or several kinds of bay change at once)')
    ops.push({ rid, op, ids: aR.map(o => o.id), rowIndex: bR[0].rowIndex ?? null, section: bR[0].genSection ?? null })
  }
  if (!ops.length || ops.some(x => x.op.type !== ops[0].op.type)) return cant('different rows had different bay changes')
  const t = ops[0].op.type
  let op = ops[0].op
  if (t === 'delete') op = { type: 'delete', removed: ops.flatMap(x => x.op.removed) }
  if (t === 'add' && ops.some(x => x.op.side !== op.side)) return cant('bays were added at different ends')
  if (t === 'beam') op = { type: 'beam', anchor: op.anchor, changes: ops.flatMap(x => x.op.changes) }
  return ok({ ...base, scope: 'section', kind: 'bays', op, ids: ops.flatMap(x => x.ids), rows: ops.map(x => ({ section: x.section, rowIndex: x.rowIndex })) })
}
const ok = (change) => ({ changes: [change] })
const blocked = (text) => ({ blocked: text })
const cant = (why) => blocked(`This change can't be copied: ${why}.`)

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
function withBays(o, worldBeams, anchor, gridSize) {
  const f = rackFootprint(o), rot = f.rotated
  const [lo, hi] = runOf(f, rot)
  const upIn = o.uprightWidth || 3
  const width = ((upIn * (worldBeams.length + 1) + worldBeams.reduce((a, b) => a + b, 0)) / 12) * gridSize
  const m = anchor === 'lo' ? lo + width / 2 : hi - width / 2
  const cx = rot ? o.x + o.width / 2 : m, cy = rot ? m : o.y + o.height / 2
  const beams = reversedRack(o) ? [...worldBeams].reverse() : [...worldBeams]
  return { beams, width, x: cx - width / 2, y: cy - o.height / 2 }
}
const worldBeamsOf = (o) => (reversedRack(o) ? [...o.beams].reverse() : [...o.beams])
const overlapLen = (a, b) => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo)

/** Every copy of `change` (one of readChange's changes), checked one by one.
 *  `after` = the layout now (the change made), `before` = just before it.
 *  Returns { change, updates (Map id -> partial), deletes (Set), adds,
 *  copies: [{ section, rowIndex, name, ids, gone }], skipped / held /
 *  warnings: [{ section, rowIndex, name, reason }] }. */
export function planCopy(before, after, change, gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12), { profile = MHE_PROFILES.reach } = {}) {
  if (!change) return null
  /* the cross-aisles as the user's own change left them: a row moved (or a
     bay added) into one moves that section's edge, and its copies follow it
     there — a copy is blocked only where it would pass that edge */
  const gaps = crossAisleGaps(after, change.fpId, change.rotated)
  const plan = change.scope === 'sections'
    ? planAcross(before, after, change, gridSize, newId, gaps)
    : planWithin(before, after, change, gridSize, newId, gaps)
  // soft problems the copies bring (not ones the row already had)
  const world = applyPlan(after, plan)
  const cols = layoutColumns(world, gridSize)
  for (const c of plan.copies) {
    if (c.gone) continue
    const had = new Set(), texts = new Set()
    for (const id of c.ids) { const r = after.find(o => o.id === id); if (r) for (const t of softProblems(r, after, change.rotated, gridSize, profile, cols)) had.add(t.replace(/d.*$/, '')) }
    for (const id of c.ids) { const r = world.find(o => o.id === id); if (r) for (const t of softProblems(r, world, change.rotated, gridSize, profile, cols)) if (!had.has(t.replace(/d.*$/, ''))) texts.add(t) }
    for (const t of texts) plan.warnings.push({ section: c.section, rowIndex: c.rowIndex, name: c.name, reason: t })
  }
  return plan
}

const secName = (section, rowIndex) => `section ${section}, row ${rowIndex}`

/* ACROSS SECTIONS — the replay engine (utils/rowEdits.js) with a baseline
   taken from the layout just before this action, so only this change is
   seen. Racks with no row number (rows added earlier and never copied) are
   given a temporary one of their own for the planning, so they count as
   rows standing where they are — never as rows added by this action. */
function planAcross(before, after, change, gridSize, newId, gaps) {
  const plan = emptyPlan(change)
  const fpB = before.find(o => o.id === change.fpId)
  const src = new Set(change.ids)
  // temporary row numbers for loose racks, the same before and after
  const secs = buildingSections(before, (before.find(o => isRow(o) && o.parentId === change.fpId && o.genSection != null && rotatedOf(o) === change.rotated) || {}).id)
  const envs = (secs.sections || []).filter(s => s.key != null)
  const fake = new Map()
  let k = 0
  for (const o of [...before, ...after]) {
    if (!isRow(o) || o.parentId !== change.fpId || o.genSection != null || src.has(o.id) || fake.has(o.id)) continue
    const [r0, r1] = runOf(rackFootprint(o), change.rotated)
    const home = [...envs].sort((a, b) => (Math.min(r1, b.end) - Math.max(r0, b.start)) - (Math.min(r1, a.end) - Math.max(r0, a.start)))[0]
    if (!home) continue
    fake.set(o.id, { genSection: home.key, rowIndex: 1e6 + (++k), genRunFt: 0, genCrossFt: 0 })
  }
  const tag = (list) => list.map(o => (fake.has(o.id) ? { ...o, ...fake.get(o.id) } : o))
  const beforeT = tag(before), baseline = makeBaseline(beforeT, beforeT.find(o => o.id === change.fpId) || fpB, gridSize)
  let objs = tag(after).map(o => (o.id === change.fpId ? { ...o, rowBaseline: baseline } : o))
  /* only the across delta is copied: for the planning the moved row is its
     shape from before (a flue the drag re-seated left out) moved by exactly
     that delta */
  if (change.kind === 'move') {
    const was = new Map(before.map(o => [o.id, o]))
    objs = objs.map(o => (src.has(o.id) && was.has(o.id) ? { ...o, ...pick(was.get(o.id)), ...(change.rotated ? { x: was.get(o.id).x + change.d } : { y: was.get(o.id).y + change.d }) } : o))
  }
  const rp = planReplay(objs, change.fpId, gridSize, newId, [])
  const realNext = Math.max(0, ...after.filter(o => o.parentId === change.fpId && o.rowIndex != null).map(o => o.rowIndex)) + 1

  if (change.kind === 'delete') {
    for (const d of rp.deleted) {
      d.ids.forEach(id => plan.deletes.add(id))
      plan.copies.push({ section: d.section, rowIndex: d.rowIndex, name: secName(d.section, d.rowIndex), ids: d.ids, gone: true })
    }
    return plan
  }
  if (change.kind === 'move') {
    const rowsOf = new Map(rp.moved.map(m => [m.section + '|' + m.rowIndex, m]))
    let world = after
    for (const m of rowsOf.values()) {
      if (m.ids.some(id => src.has(id))) continue
      const ups = m.ids.map(id => [id, rp.updates.get(id)]).filter(([, u]) => u)
      const moved = ups.map(([id, u]) => ({ ...world.find(o => o.id === id), ...u }))
      const next = world.map(o => { const u = rp.updates.get(o.id); return u && m.ids.includes(o.id) ? { ...o, ...u } : o })
      const why = moved.map(r => hardProblem(r, next, gaps, change.rotated, gridSize)).find(Boolean)
      const name = secName(m.section, m.rowIndex)
      if (why) { plan.skipped.push({ section: m.section, rowIndex: m.rowIndex, name, reason: why }); continue }
      for (const [id, u] of ups) plan.updates.set(id, { x: u.x, y: u.y })
      plan.copies.push({ section: m.section, rowIndex: m.rowIndex, name, ids: m.ids })
      world = next
    }
    for (const h of rp.held) {
      if (h.ids.some(id => src.has(id))) continue
      plan.held.push({ section: h.section, rowIndex: h.rowIndex, name: secName(h.section, h.rowIndex), reason: `stopped at the wall, ${fmtLen((h.shortIn / 12) * gridSize, gridSize)} short` })
    }
    for (const m of rp.missing) plan.skipped.push({ section: m.section, rowIndex: m.rowIndex, name: secName(m.section, m.rowIndex), reason: 'this section has no such row' })
    return plan
  }
  // add: only this action's row (anything else loose was given a row of its own above)
  const mine = rp.added.find(a => a.ids.some(id => src.has(id)))
  if (!mine) return plan
  const rowIndex = realNext
  const stamp = (o) => ({ ...o, rowIndex })
  for (const id of mine.ids) {
    const u = rp.updates.get(id)
    if (u) plan.updates.set(id, { rowIndex, genSection: u.genSection, genRunFt: u.genRunFt, genCrossFt: u.genCrossFt })
  }
  for (const c of rp.adds.filter(a => a.rowIndex === mine.rowIndex)) {
    const copy = stamp(c)
    plan.adds.push(copy)
    const e = plan.copies.find(q => q.section === copy.genSection)
    if (e) e.ids.push(copy.id)
    else plan.copies.push({ section: copy.genSection, rowIndex, name: secName(copy.genSection, rowIndex), ids: [copy.id] })
  }
  for (const s of rp.skipped.filter(q => q.rowIndex === mine.rowIndex)) plan.skipped.push({ section: s.section, rowIndex, name: `section ${s.section}`, reason: s.reason })
  plan.home = mine.section
  plan.patterns = mine.patterns
  return plan
}

/* WITHIN THE SECTION — every other row of the source row's section. */
function planWithin(before, after, change, gridSize, newId, gaps) {
  const plan = emptyPlan(change)
  const src = new Set(change.ids)
  const ref = after.find(o => src.has(o.id))
  if (!ref) return plan
  const { sections, index } = buildingSections(after, ref.id)
  const sec = sections[index]
  if (!sec) return plan
  const secLabel = sec.key ?? index + 1
  const fp = after.find(o => o.id === change.fpId)
  const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : 10
  const runBox = change.rotated ? [fp.y + wt, fp.y + fp.height - wt] : [fp.x + wt, fp.x + fp.width - wt]
  const targets = sec.lines.filter(l => !l.pieces.some(p => src.has(p.id)))
  let world = after
  targets.forEach((line) => {
    const rowIndex = line.pieces[0].rowIndex ?? sec.lines.indexOf(line) + 1
    const name = `row ${rowIndex}`
    const ups = new Map(), adds = [], dels = new Set()
    let why = null, held = null
    if (change.kind === 'move') {
      let d = change.d
      const lo = line.runStart, hi = line.runEnd
      if (hi + d > runBox[1]) d = Math.min(d, Math.max(0, runBox[1] - hi))
      if (lo + d < runBox[0]) d = Math.max(d, Math.min(0, runBox[0] - lo))
      if (Math.abs(d - change.d) > EPS) held = `stopped at the wall, ${fmtLen(change.d - d, gridSize)} short`
      if (Math.abs(d) < EPS) { plan.held.push({ section: secLabel, rowIndex, name, reason: held }); return }
      for (const p of line.pieces) ups.set(p.id, change.rotated ? { y: p.y + d } : { x: p.x + d })
    } else {
      const op = change.op
      if (op.type === 'delete') {
        const per = line.pieces.map(p => ({ p, idx: bayRuns(p, gridSize).filter(b => op.removed.some(r => overlapLen(b, r) > (b.hi - b.lo) / 2)).map(b => b.i) }))
        const total = per.reduce((n, x) => n + x.idx.length, 0), all = line.pieces.reduce((n, p) => n + p.beams.length, 0)
        if (!total) why = 'no bay at that spot'
        else if (total >= all) why = 'it would remove every bay of the row'
        else for (const { p, idx } of per) {
          if (!idx.length) continue
          if (idx.length >= p.beams.length) { dels.add(p.id); continue }
          const out = splitRackForBayDelete(p, new Set(idx), newId, gridSize)
          if (!out) continue
          const [first, ...rest] = out
          ups.set(p.id, { beams: first.beams, width: first.width, x: first.x, y: first.y, activeBayIdx: null })
          adds.push(...rest)
        }
      } else if (op.type === 'add') {
        const end = [...line.pieces].sort((a, b) => (op.side === 'hi'
          ? runOf(rackFootprint(b), change.rotated)[1] - runOf(rackFootprint(a), change.rotated)[1]
          : runOf(rackFootprint(a), change.rotated)[0] - runOf(rackFootprint(b), change.rotated)[0]))[0]
        const wb = worldBeamsOf(end)
        ups.set(end.id, withBays(end, op.side === 'hi' ? [...wb, ...op.beams] : [...op.beams, ...wb], op.side === 'hi' ? 'lo' : 'hi', gridSize))
      } else if (op.type === 'beam') {
        const bays = line.pieces.flatMap(p => bayRuns(p, gridSize))
        const byPiece = new Map()
        for (const c of op.changes) {
          const best = bays.map(b => ({ b, ov: overlapLen(b, c) })).filter(x => x.ov > (x.b.hi - x.b.lo) / 2).sort((a, b) => b.ov - a.ov)[0]
          if (!best) continue
          if (!byPiece.has(best.b.id)) byPiece.set(best.b.id, [])
          byPiece.get(best.b.id).push({ b: best.b, beam: c.beam })
        }
        if (!byPiece.size) why = 'no bay at that spot'
        for (const [id, list] of byPiece) {
          const p = line.pieces.find(q => q.id === id)
          const wb = worldBeamsOf(p), runs = bayRuns(p, gridSize)
          for (const { b, beam } of list) wb[runs.indexOf(runs.find(r => r.i === b.i))] = beam
          ups.set(id, withBays(p, wb, op.anchor, gridSize))
        }
      }
    }
    if (!why && !ups.size && !adds.length && !dels.size) return
    let next = world.filter(o => !dels.has(o.id)).map(o => (ups.has(o.id) ? { ...o, ...ups.get(o.id) } : o)).concat(adds)
    const mine = [...ups.keys(), ...adds.map(a => a.id)].map(id => next.find(o => o.id === id)).filter(Boolean)
    if (!why) why = mine.map(r => hardProblem(r, next, gaps, change.rotated, gridSize)).find(Boolean) || null
    if (why) { plan.skipped.push({ section: secLabel, rowIndex, name, reason: why }); return }
    for (const [id, u] of ups) plan.updates.set(id, u)
    plan.adds.push(...adds)
    dels.forEach(id => plan.deletes.add(id))
    plan.copies.push({ section: secLabel, rowIndex, name, ids: mine.map(r => r.id) })
    if (held) plan.held.push({ section: secLabel, rowIndex, name, reason: held })
    world = next
  })
  plan.section = secLabel
  return plan
}

/* ── words ────────────────────────────────────────────────────────────────── */

const rowsWord = (rows) => {
  const n = [...new Set((rows || []).map(r => r.rowIndex).filter(v => v != null))]
  return n.length === 1 ? `Row ${n[0]}` : n.length ? `Rows ${n.join(', ')}` : 'The row'
}
/** What the change was, in a few words (one change, or a diagonal drag's two parts). */
export function describeChange(change, gridSize = 40) {
  if (Array.isArray(change)) {
    if (change.length === 2 && change.every(c => c.kind === 'move')) {
      const x = change.find(c => c.axis === 'cross'), r = change.find(c => c.axis === 'run')
      return `${rowsWord(x.rows)} moved ${fmtLen(x.d, gridSize)} across the aisles and ${fmtLen(r.d, gridSize)} along the row`
    }
    return describeChange(change[0], gridSize)
  }
  if (!change) return ''
  const w = rowsWord(change.rows)
  if (change.kind === 'add') return 'Row added'
  if (change.kind === 'delete') return `${w} deleted`
  if (change.kind === 'move') return `${w} moved ${fmtLen(change.d, gridSize)} ${change.axis === 'cross' ? 'across the aisles' : 'along the row'}`
  const op = change.op
  if (op.type === 'delete') { const n = op.removed.length; return `${n} bay${n > 1 ? 's' : ''} removed from ${w.toLowerCase()}` }
  if (op.type === 'add') { const n = op.beams.length; return `${n} bay${n > 1 ? 's' : ''} added to ${w.toLowerCase()}` }
  return `Beam length changed in ${w.toLowerCase()}`
}
/** The button's words for a change. */
export const copyButtonLabel = (change) => (change && change.scope === 'sections' ? 'Copy to all sections' : "Copy to this section's rows")

/** Where the copies would land, for the hover preview: [{ x, y, w, h, gone }]
 *  in world px — each copied rack's footprint after the copy, or (gone) the
 *  footprint of a rack the copy would delete. Changes nothing. */
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
