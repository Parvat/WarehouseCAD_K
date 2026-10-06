// pairCarryOn.js — a back-to-back pair whose half carries on as a single (the fill's "free half"): when the
// pair grows a bay at that end, it takes that bay over from its single instead of standing on it.
//
//   Section 2, row 12 of the hand-check layout: the pair runs 9' → 108.25', its single carries on from the
//   pair's end upright on one half, 108' → 124.75'. "+ bay" on the pair grew both halves to 116.5', so one
//   half stood on the single's first bay — "an overlap", and the BOM counted that bay twice.
//
// The rule: for each bay the pair grew at that end, outward from its old end upright, the single gives up
// its matching bay — the same uprights (within ½") and the same beam — so the pair +1 bay, the single −1
// bay from that end; a single left with no bays is removed. It stops at the first bay that doesn't match,
// and a single with other levels or depth gives up nothing: there the overlap (and its warning) stays.
// Deleting the pair's end bay is not mirrored: both halves go, the gap is left.
//
// Pure. Run on a hand edit by installPairKeeper (folded into that edit's own history entry: one undo step)
// and on a Row group apply (utils/rowGroupTool.js), so both get the same result.

import { geom, uprightsOf, withRun, isRowRack, UP_TOL_FT } from './rowGroup'
import { autoSave, serializeScene } from './saveLoad'

const EPS = 1e-6
const upPx = (o, gridSize) => ((o.uprightWidth || 3) / 12) * gridSize
const turn = (o) => ((((o.rotation || 0) % 360) + 360) % 360)
const sameStamp = (a, b) => (a.rowIndex ?? null) === (b.rowIndex ?? null) && (a.genSection ?? null) === (b.genSection ?? null)

/** The racks of `after` with each grown pair's bays taken over from its carried-on single, given `before`
 *  (the layout the edit started from). Returns { objects, taken: [{ pair, single, bays, removed }] } —
 *  `objects` is `after` itself when nothing was taken. */
export function takeOverCarriedBays(before, after, gridSize = 40) {
  const tol = UP_TOL_FT * gridSize
  const B = new Map(before.filter(isRowRack).map(o => [o.id, o]))
  const replace = new Map(), remove = new Set(), taken = []
  for (const p of after) {
    if (p.type !== 'rack_double_row' || !isRowRack(p) || !B.has(p.id)) continue
    const was = geom(B.get(p.id)), now = geom(p), up = upPx(p, gridSize), n = was.beams.length, m = now.beams.length
    if (m <= n || Math.abs(now.s0 - was.s0) > EPS || Math.abs(now.s1 - was.s1) > EPS) continue
    // which end grew: the old bays kept, in place, at the other end
    let hi
    if (Math.abs(now.r0 - was.r0) < tol && was.beams.every((b, i) => b === now.beams[i])) hi = true
    else if (Math.abs(now.r1 - was.r1) < tol && was.beams.every((b, i) => b === now.beams[m - n + i])) hi = false
    else continue
    const shared = hi ? was.r1 - up : was.r0                                   // the pair's old end upright (near face)
    const grown = hi ? now.beams.slice(n) : now.beams.slice(0, m - n).reverse()  // outward from that upright
    const pUps = uprightsOf(now.r0, now.beams, up, gridSize)
    const pOut = hi ? pUps.slice(n) : pUps.slice(0, m - n + 1).reverse()        // the pair's uprights outward from it
    // its carried-on single: in line on one half, from that upright, in the same row, the same levels and depth
    const single = after.find(o => {
      if (o.type !== 'rack_row' || !isRowRack(o) || !B.has(o.id) || replace.has(o.id) || remove.has(o.id)) return false
      if ((turn(o) % 180) !== (turn(p) % 180) || (o.parentId ?? null) !== (p.parentId ?? null) || !sameStamp(o, p)) return false
      if (o.levels !== p.levels || o.depthIn !== p.depthIn || (o.uprightWidth || 3) !== (p.uprightWidth || 3)) return false
      const g = geom(o)
      const onHalf = (Math.abs(g.s0 - now.s0) < 0.5 || Math.abs(g.s1 - now.s1) < 0.5) && g.s0 >= now.s0 - 0.5 && g.s1 <= now.s1 + 0.5 && g.s1 - g.s0 < now.s1 - now.s0 - 0.5
      return onHalf && (hi ? Math.abs(g.r0 - shared) < tol : Math.abs(g.r1 - up - shared) < tol)
    })
    if (!single) continue
    const g = geom(single), sUps = uprightsOf(g.r0, g.beams, up, gridSize)
    const sBeams = hi ? g.beams : [...g.beams].reverse(), sOut = hi ? sUps : [...sUps].reverse()
    // the single's bays outward from the shared upright, while they match the pair's new ones
    let k = 0
    while (k < grown.length && k < sBeams.length && grown[k] === sBeams[k] && Math.abs(pOut[k + 1] - sOut[k + 1]) <= tol) k++
    if (!k) continue
    const left = sBeams.slice(k)
    if (!left.length) remove.add(single.id)
    else replace.set(single.id, hi ? withRun(single, sUps[k], left, gridSize) : withRun(single, g.r0, [...left].reverse(), gridSize))
    taken.push({ pair: p.id, single: single.id, bays: k, removed: !left.length })
  }
  if (!taken.length) return { objects: after, taken }
  return { objects: after.filter(o => !remove.has(o.id)).map(o => replace.get(o.id) || o), taken }
}

/** For a store: after each action (a new history entry following the one seen), a pair that grew into its
 *  carried-on single takes that bay over — written into the SAME history entry, so one Ctrl+Z undoes the
 *  edit and the takeover together. Undo / redo are left alone. Returns the unsubscribe. */
export function installPairKeeper(store) {
  let lastHistory = store.getState().history, lastIndex = store.getState().historyIndex, busy = false
  return store.subscribe((st) => {
    if (busy) return
    if (st.history === lastHistory && st.historyIndex === lastIndex) return
    const prevTop = lastIndex >= 0 && lastHistory ? lastHistory[lastIndex] : undefined
    const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
    lastHistory = st.history; lastIndex = st.historyIndex
    if (!action) return
    let before
    try { before = JSON.parse(prevTop).objects } catch { return }
    if (!before) return
    const { objects, taken } = takeOverCarriedBays(before, st.objects, st.gridSize || 40)
    if (!taken.length) return
    const history = st.history.slice(0, st.historyIndex + 1)
    history[history.length - 1] = JSON.stringify({ objects, groups: st.groups || [], layers: st.layers })
    busy = true
    try { store.setState({ objects, history, historyIndex: history.length - 1 }) } finally { busy = false }
    try { autoSave(serializeScene(store.getState())) } catch { /* storage full or absent */ }
    lastHistory = store.getState().history; lastIndex = store.getState().historyIndex
  })
}
