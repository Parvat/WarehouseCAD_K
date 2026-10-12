// pairCarryOn.js — a back-to-back pair whose half carries on as a single (the fill's "free half"): when the
// pair grows bays over that half, it takes those bays over from its singles instead of standing on them.
//
//   Section 2, row 12 of the hand-check layout: the pair runs 9' → 108.25', its single carries on from the
//   pair's end upright on one half, 108' → 124.75'. "+ bay" on the pair grew both halves to 116.5', so one
//   half stood on the single's first bay — "an overlap", and the BOM counted that bay twice.
//
// The rule: for each bay the pair grew, EVERY single of its own row standing on that half gives up the bay it
// has there — the same uprights (within ½") and the same beam — so the pair +1 bay, the single −1. Not only
// the single that starts at the pair's end upright: a single split in two (a zone moved over it, a middle bay
// deleted, the Split tool) gives up its bays piece by piece, and a piece the pair grows past a gap to reaches
// it too. A piece left with no bays is removed; one losing bays in its middle is split there
// (splitRackForBayDelete). A bay that doesn't line up, or a single with other levels or depth, gives up
// nothing: there the overlap (and its warning) stays. Deleting the pair's end bay is not mirrored: both halves
// go, the gap is left.
//
// Pure. Run on a hand edit by installPairKeeper (folded into that edit's own history entry: one undo step)
// and on a Row group apply (utils/rowGroupTool.js), so both get the same result.

import { nanoid } from 'nanoid'
import { geom, uprightsOf, isRowRack, UP_TOL_FT } from './rowGroup'
import { splitRackForBayDelete } from './baySplit'
import { autoSave, serializeScene } from './saveLoad'

const EPS = 1e-6
const upPx = (o, gridSize) => ((o.uprightWidth || 3) / 12) * gridSize
const turn = (o) => ((((o.rotation || 0) % 360) + 360) % 360)
const sameStamp = (a, b) => (a.rowIndex ?? null) === (b.rowIndex ?? null) && (a.genSection ?? null) === (b.genSection ?? null)

/** The racks of `after` with each grown pair's bays taken over from the singles of its row on the half it
 *  grew over, given `before` (the layout the edit started from). Returns { objects, taken: [{ pair, single,
 *  bays, removed }] } — `objects` is `after` itself when nothing was taken. */
export function takeOverCarriedBays(before, after, gridSize = 40, newId = nanoid) {
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
    // the pair's new bays, as run intervals between its uprights' outer edges, with their beams
    const pUps = uprightsOf(now.r0, now.beams, up, gridSize)
    const fresh = (hi ? now.beams.map((b, i) => i).slice(n) : now.beams.map((b, i) => i).slice(0, m - n)).map(i => ({ a: pUps[i], c: pUps[i + 1] + up, beam: now.beams[i] }))
    const lo = Math.min(...fresh.map(q => q.a)), hiR = Math.max(...fresh.map(q => q.c))
    // every single of its row on one half that the new bays reach: the same row, levels and depth
    for (const o of after) {
      if (o.type !== 'rack_row' || !isRowRack(o) || !B.has(o.id) || replace.has(o.id) || remove.has(o.id)) continue
      if ((turn(o) % 180) !== (turn(p) % 180) || (o.parentId ?? null) !== (p.parentId ?? null) || !sameStamp(o, p)) continue
      if (o.levels !== p.levels || o.depthIn !== p.depthIn || (o.uprightWidth || 3) !== (p.uprightWidth || 3)) continue
      const g = geom(o)
      const onHalf = (Math.abs(g.s0 - now.s0) < 0.5 || Math.abs(g.s1 - now.s1) < 0.5) && g.s0 >= now.s0 - 0.5 && g.s1 <= now.s1 + 0.5 && g.s1 - g.s0 < now.s1 - now.s0 - 0.5
      if (!onHalf || g.r1 <= lo + tol || g.r0 >= hiR - tol) continue
      // its bays (run order) that one of the pair's new bays covers exactly: the same uprights, the same beam
      const sUps = uprightsOf(g.r0, g.beams, up, gridSize)
      const give = g.beams.map((b, i) => i).filter(i => fresh.some(q => q.beam === g.beams[i] && Math.abs(q.a - sUps[i]) <= tol && Math.abs(q.c - (sUps[i + 1] + up)) <= tol))
      if (!give.length) continue
      // run order → the rack's own bay order (a reversed rack counts its bays from the other end)
      const k = g.beams.length, flip = turn(o) === 180 || turn(o) === 270
      const pieces = splitRackForBayDelete(o, new Set(give.map(i => (flip ? k - 1 - i : i))), newId, gridSize)
      if (!pieces) remove.add(o.id)
      else replace.set(o.id, pieces)
      taken.push({ pair: p.id, single: o.id, bays: give.length, removed: !pieces })
    }
  }
  if (!taken.length) return { objects: after, taken }
  return { objects: after.filter(o => !remove.has(o.id)).flatMap(o => replace.get(o.id) || [o]), taken }
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
