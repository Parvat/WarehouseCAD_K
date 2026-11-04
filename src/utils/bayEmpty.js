// bayEmpty.js — a back-to-back pair is ONE object (STUDIO.md §7). A bay deleted on one side of a pair leaves that bay
// position EMPTY on that side: the pair keeps its outline and its shared uprights, the side has no beams and no pallet
// positions there, and is drawn as an empty bay (no bay lines). Only when BOTH facing bays at a position are gone does
// the pair become two objects (a gap); a single row splits at a middle bay as before.
//
// Stored on the pair as `bayEmpty: [[side 0 per bay], [side 1 per bay]]` (true = empty), in the rack's own bay order,
// next to `elevBays` — carried through every piece, join and replay by utils/elevations.js carryElev / withElev, so
// it stays aligned with `beams`. Absent when no bay is empty. Pure.

export const EMPTY_FIELD = 'bayEmpty'
const isPair = (o) => !!o && o.type === 'rack_double_row'

/** Is bay `b` of rack `r` empty on side `s`? (A single row's bays never are.) */
export const isEmptySide = (r, b, s) => isPair(r) && !!(r.bayEmpty && r.bayEmpty[s === 1 ? 1 : 0] && r.bayEmpty[s === 1 ? 1 : 0][b])
/** Does pair `r` have any empty bay side? */
export const hasEmpty = (r) => isPair(r) && Array.isArray(r.bayEmpty) && r.bayEmpty.some(a => Array.isArray(a) && a.some(Boolean))
/** How many bay-sides of `r` hold racking: a pair's 2 per bay less its empty ones; a single row's 1 per bay. */
export const filledSides = (r) => {
  const n = Array.isArray(r?.beams) ? r.beams.length : 0
  if (!isPair(r)) return n
  let k = 0
  for (let b = 0; b < n; b++) for (const s of [0, 1]) if (!isEmptySide(r, b, s)) k++
  return k
}
/** The `bayEmpty` field for `r` (n bays) with `marks` [{ b, s }] set empty — normalised: absent when nothing is. */
export function withEmpty(r, marks) {
  const n = r.beams.length
  const grid = [0, 1].map(s => Array.from({ length: n }, (_, b) => isEmptySide(r, b, s)))
  for (const m of marks) if (m.b >= 0 && m.b < n) grid[m.s === 1 ? 1 : 0][m.b] = true
  return normEmpty({ ...r, bayEmpty: grid })
}
/** `r` with `bayEmpty` trimmed to its bays and dropped when nothing is empty (or it is no pair). */
export function normEmpty(r) {
  if (!r || r.bayEmpty == null) return r
  const n = Array.isArray(r.beams) ? r.beams.length : 0
  const grid = [0, 1].map(s => Array.from({ length: n }, (_, b) => !!(r.bayEmpty[s] && r.bayEmpty[s][b])))
  const o = { ...r }
  if (!isPair(r) || !grid.some(a => a.some(Boolean))) delete o.bayEmpty
  else o.bayEmpty = grid
  return o
}
/** The empty marks of `src`'s bays `idx` (null = a new bay: not empty), for a piece — or undefined when none. A half
 *  kept as a single row (`keepSide` 0 / 1) has none. */
export function carryEmpty(src, idx, keepSide = null) {
  if (!hasEmpty(src) || keepSide === 0 || keepSide === 1) return undefined
  const grid = [0, 1].map(s => idx.map(i => (i == null ? false : isEmptySide(src, i, s))))
  return grid.some(a => a.some(Boolean)) ? grid : undefined
}
