// sectionCopy.js — the per-section PENDING SET behind "Copy to other
// sections" (utils/copyPrompt.js shows it; utils/copyChange.js copies).
//
// The user makes any number of changes in ONE section; nothing is copied
// or locked meanwhile. The set is the difference between that section's
// racks as they were just before its first change (a snapshot kept on the
// building as `copyPending` — saved with the layout, and undo takes changes
// back out of it because every undo step carries the building as it was)
// and the section now:
//   COPIED to the same row in every other section — rows moved ACROSS the
//     aisles (the net delta per row), added rows, deleted rows;
//   STAYS in the section — bay changes and moves ALONG the row (section-
//     specific, e.g. a column fix), and any other change to a row's shape.
// The set also keeps a LOG, one line per action ("Row 5: moved 2' across",
// "Row 5: bays changed — stays in section 3"): the bar's count and tooltip.
// It rides on the building too, so undo takes an action back out of it.
// Pure: no store, no React.

import { rackFootprint } from '../generate/columnCheck'
import { buildingSections, rowLines } from './syncSections'
import { isRow, rowKey, bayRuns, fmtLen, planAcrossAll, addSoftWarnings, crossAisleGaps } from './copyChange'

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const EPS = 1e-6
export const PENDING = 'copyPending'
const rotatedOf = (o) => rackFootprint(o).rotated
const runOf = (o, rot) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
const crossOf = (o, rot) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
const span = (list, fn, rot) => { let lo = Infinity, hi = -Infinity; for (const o of list) { const [a, b] = fn(o, rot); lo = Math.min(lo, a); hi = Math.max(hi, b) } return [lo, hi] }
const GEO = { width: 0, rotation: 0, uprightWidth: 3 }
/* A double row's flue widens and narrows by itself as it passes a column
   (live flue: flueSpaceIn and the depth follow, flueBaseIn stays). That is
   not a change the user made, so the shape is compared at the BASE flue. */
const baseFlue = (o) => o.flueBaseIn ?? o.flueSpaceIn ?? 9
const baseDepth = (o, gridSize) => (o.height || 0) - ((o.flueSpaceIn ?? baseFlue(o)) - baseFlue(o)) * (gridSize / 12)
const sameShape = (a, b, gridSize = 40) => Object.keys(GEO).every(k => Math.abs((a[k] ?? GEO[k]) - (b[k] ?? GEO[k])) < EPS)
  && Math.abs(baseDepth(a, gridSize) - baseDepth(b, gridSize)) < EPS && Math.abs(baseFlue(a) - baseFlue(b)) < EPS
  && a.beams.length === b.beams.length && a.beams.every((v, i) => v === b.beams[i])

/** A section as the user reads it: "3" for generated section 3, and "1" —
 *  never "run 1" — for the first run of racks placed by hand. */
export const sectionLabel = (s) => (typeof s === 'string' && s.startsWith('run ') ? s.slice(4) : String(s))

/** How many GENERATED sections building `fpId` has (rows of one direction).
 *  Copying goes to the same row in every other generated section, so fewer
 *  than two means there is nowhere to copy to — a layout placed by hand has
 *  none. */
export function generatedSectionCount(objects, fpId) {
  const ref = objects.find(o => isRow(o) && o.parentId === fpId && o.genSection != null)
  if (!ref) return 0
  return buildingSections(objects, ref.id).sections.filter(s => s.key != null).length
}

/** The section a rack belongs to: its generated section, else the section
 *  whose run it shares (utils/syncSections.js). */
export function sectionOf(objects, rack) {
  if (rack.genSection != null) return rack.genSection
  const { sections, index } = buildingSections(objects, rack.id)
  return index >= 0 ? (sections[index].key ?? `run ${index + 1}`) : null
}

/** A new pending set for `section` of building `fpId`: its rows as they are
 *  in `before`. */
export function startPending(before, fpId, section) {
  const racks = before.filter(o => isRow(o) && o.parentId === fpId && sectionOf(before, o) === section)
  const ref = racks[0] || before.find(o => isRow(o) && o.parentId === fpId)
  return { section, rotated: ref ? rotatedOf(ref) : false, racks: JSON.parse(JSON.stringify(racks)), log: [] }
}

/** One action's lines for the log: what it did to the rows of `section`
 *  (the same words as the pending list). */
export function actionLines(before, after, fpId, section, gridSize = 40) {
  const P = startPending(before, fpId, section)
  const fp = after.find(o => o.id === fpId)
  if (!fp) return []
  const ch = pendingChanges(after, { ...fp, [PENDING]: P }, gridSize)
  // a bay change also notes its row (rowIndex, rack ids): the bar's "Match bays" takes the last one as its source
  return ch ? [...ch.copy.map(c => ({ text: c.text, copies: true })), ...ch.stays.map(s => ({ text: s.text, copies: false, ...(s.bays ? { bays: true, rowIndex: s.rowIndex, ids: s.ids } : {}) }))] : []
}

/** The pending set of building `fp` now: { section, copy: [{ kind: 'move' |
 *  'delete' | 'add', rowIndex, text, d? }], stays: [{ rowIndex, text }],
 *  count, rows (for the copy) }, or null. */
export function pendingChanges(objects, fp, gridSize = 40) {
  const P = fp && fp[PENDING]
  if (!P || !Array.isArray(P.racks)) return null
  const rot = P.rotated
  const base = P.racks, baseIds = new Set(base.map(r => r.id))
  const cur = objects.filter(o => isRow(o) && o.parentId === fp.id)
  const byId = new Map(cur.map(o => [o.id, o]))
  const rootOf = (o) => {
    let q = o
    const seen = new Set()
    while (q && !baseIds.has(q.id)) {
      if (!q.pieceOf || seen.has(q.id)) return null
      seen.add(q.id)
      q = byId.get(q.pieceOf) || (baseIds.has(q.pieceOf) ? { id: q.pieceOf } : null)
    }
    return q ? q.id : null
  }
  const rowOf = (r) => rowKey(r) ?? ('#' + r.id)
  const baseById = new Map(base.map(r => [r.id, r]))
  const baseRows = new Map()
  for (const r of base) { const k = rowOf(r); if (!baseRows.has(k)) baseRows.set(k, []); baseRows.get(k).push(r) }
  const curRows = new Map(), fresh = []
  for (const o of cur) {
    const root = rootOf(o)
    if (root) { const k = rowOf(baseById.get(root)); if (!curRows.has(k)) curRows.set(k, []); curRows.get(k).push(o) }
    else if (sectionOf(objects, o) === P.section) fresh.push(o)
  }
  const copy = [], stays = [], rows = []
  const name = (b) => (b[0].rowIndex != null ? `Row ${b[0].rowIndex}` : 'A row added by hand')
  for (const [k, b] of baseRows) {
    const c = curRows.get(k) || []
    const numbered = !k.startsWith('#')
    if (!c.length) {
      if (numbered) copy.push({ kind: 'delete', rowIndex: b[0].rowIndex, text: `${name(b)}: deleted` })
      else stays.push({ rowIndex: null, text: `${name(b)}: deleted` })
      rows.push({ key: k, base: b, cur: c, delete: true, numbered })
      continue
    }
    const [b0, b1] = span(b, crossOf, rot), [c0, c1] = span(c, crossOf, rot)
    const d = (c0 + c1) / 2 - (b0 + b1) / 2
    const moved = Math.abs(d) > EPS
    if (moved) {
      if (numbered) copy.push({ kind: 'move', rowIndex: b[0].rowIndex, d, text: `${name(b)}: moved ${fmtLen(d, gridSize)} across` })
      else stays.push({ rowIndex: null, text: `${name(b)}: moved ${fmtLen(d, gridSize)} across (no matching row in the other sections)` })
    }
    // what stays: bays, along, anything else about the row's shape
    const bb = b.flatMap(o => bayRuns(o, gridSize)).map(x => [x.lo, x.hi, x.beam])
    const cb = c.flatMap(o => bayRuns(o, gridSize)).map(x => [x.lo, x.hi, x.beam])
    const sorted = (l) => [...l].sort((p, q) => p[0] - q[0])
    const [bs, cs] = [sorted(bb), sorted(cb)]
    const sameBays = bs.length === cs.length && bs.every((x, i) => Math.abs(x[0] - cs[i][0]) < EPS && Math.abs(x[1] - cs[i][1]) < EPS && x[2] === cs[i][2])
    if (!sameBays) {
      const shift = cs.length === bs.length && b.length === c.length && bs.every((x, i) => x[2] === cs[i][2]) ? cs[0][0] - bs[0][0] : null
      const along = shift != null && bs.every((x, i) => Math.abs(cs[i][0] - x[0] - shift) < EPS && Math.abs(cs[i][1] - x[1] - shift) < EPS)
      stays.push({ rowIndex: b[0].rowIndex ?? null, text: along ? `${name(b)}: moved ${fmtLen(shift, gridSize)} along — stays in section ${sectionLabel(P.section)}` : `${name(b)}: bays changed — stays in section ${sectionLabel(P.section)}`, ...(along ? {} : { bays: true, ids: c.map(o => o.id) }) })
    } else if (b.length === c.length && !b.every(x => { const y = c.find(q => q.id === x.id); return y && sameShape(x, y, gridSize) })) {
      stays.push({ rowIndex: b[0].rowIndex ?? null, text: `${name(b)}: changed (depth, flue or upright) — stays in section ${sectionLabel(P.section)}` })
    }
    rows.push({ key: k, base: b, cur: c, d: moved && numbered ? d : 0, numbered })
  }
  for (const l of rowLines(fresh)) copy.push({ kind: 'add', rowIndex: null, ids: l.pieces.map(p => p.id), text: 'A row added' })
  const count = copy.length + stays.length
  if (!count) return { section: P.section, copy, stays, count, rows, fresh }
  return { section: P.section, copy, stays, count, rows, fresh }
}

/** The pending set after "Match bays": the section's racks as matched —
 *  their bays and their start along the run — but each where the set had it
 *  ACROSS, with its own depth. So the bay changes (and moves along) Match bays
 *  resolved stop counting, while a row moved across still counts, and its
 *  copy still carries exactly the net delta across. */
export function rebaseAfterMatch(P, objects, gridSize = 40) {   // eslint-disable-line no-unused-vars
  const byId = new Map(objects.map(o => [o.id, o]))
  const racks = P.racks.map(b => {
    const c = byId.get(b.id)
    if (!c || !Array.isArray(c.beams)) return b
    const r = { ...JSON.parse(JSON.stringify(b)), beams: [...c.beams], width: c.width }
    if (rotatedOf(b)) {
      // along = y: the footprint's start along as matched; across = x: the base centre
      const along0 = c.y + c.height / 2 - c.width / 2
      r.y = along0 - b.height / 2 + c.width / 2
      r.x = b.x + b.width / 2 - c.width / 2
    } else {
      r.x = c.x                                             // along = x, as matched; y (across) is the base's
    }
    return r
  })
  return { ...P, racks }
}

/** The copy of building `fpId`'s pending set to every other section: a
 *  plan (utils/copyChange.js) for the layout as it is now. Only rows moved
 *  across (net delta), deleted and added are copied. */
export function planPending(objects, fpId, gridSize = 40, newId, profile) {
  const fp = objects.find(o => o.id === fpId)
  const ch = pendingChanges(objects, fp, gridSize)
  const P = fp && fp[PENDING]
  if (!ch || !ch.copy.length) return null
  const rot = P.rotated
  // the section's racks now, and what the planning sees in their place
  const nowIn = new Set([...ch.rows.flatMap(r => r.cur.map(o => o.id)), ...ch.fresh.map(o => o.id)])
  const rest = objects.filter(o => !nowIn.has(o.id))
  const shift = (o, d) => (rot ? { ...o, x: o.x + d } : { ...o, y: o.y + d })
  const syn = []
  for (const r of ch.rows) {
    if (r.delete) continue
    // the row as it was, moved by its net delta across: its bays and along-moves never travel
    for (const o of r.base) syn.push(r.d ? shift(o, r.d) : o)
  }
  const before = [...rest, ...P.racks]
  const after = [...rest, ...syn, ...ch.fresh]
  const src = new Set(ch.fresh.map(o => o.id))
  const gaps = crossAisleGaps(objects, fpId, rot)
  const plan = planAcrossAll(before, after, fpId, rot, src, gridSize, newId, gaps)
  if (profile) addSoftWarnings(plan, objects, rot, gridSize, profile)
  plan.fpId = fpId
  plan.section = P.section
  return plan
}

/** Every building of `objects` with a pending set, and its changes. */
export function allPending(objects, gridSize = 40) {
  return objects.filter(o => FP.has(o.type) && o[PENDING]).map(fp => ({ fpId: fp.id, log: fp[PENDING].log || [], ...pendingChanges(objects, fp, gridSize) })).filter(p => p.section != null)
}
