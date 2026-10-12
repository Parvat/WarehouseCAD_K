// baySides.js — bays of a back-to-back row picked and deleted ONE SIDE at a time.
//
// A click on a bay of a pair picks that bay on the half clicked (face 0, the rack's local top band; face 1 its bottom
// band — render/bayGeom.js bayRectForIndex draws them in that order); a click in the flue picks both. Shift+click and a
// bay marquee carry the side the same way. Delete removes the picked bays from that side only: the pair splits at
// that upright and the other half carries on as a single row sharing it (generate/faceReach.js piecesFromStates — the
// reverse of a pair taking over its single's bay, utils/pairCarryOn.js). A bay picked on both sides, or with no side
// (a whole rack, a single row), goes whole. One undo step. The selection itself is the store's: `activeBayIdx` /
// `activeBaySide` on the rack for a single click, `{ objId, bayIdx, side }` entries in activeBaySelection otherwise.
// Per-bay beam changes and the bay panel act on the whole bay — both sides share the pair's one beam list.

import { piecesFromStates } from '../generate/faceReach'
import { rebuildAisles } from './aisleRebuild'

const isPair = (o) => o?.type === 'rack_double_row'

/** Which half of pair `obj` a world point is in: 0 (its local top band), 1 (bottom), or null (the flue, or not a pair). */
export function bayHalfAt(obj, worldX, worldY, gridSize = 40) {
  if (!isPair(obj)) return null
  const rot = (((obj.rotation || 0) % 360) + 360) % 360
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const t = -(rot * Math.PI) / 180, dx = worldX - cx, dy = worldY - cy
  const ly = cy + dx * Math.sin(t) + dy * Math.cos(t)
  const flue = ((obj.flueSpaceIn ?? 9) / 12) * gridSize, rowH = (obj.height - flue) / 2
  if (ly <= obj.y + rowH) return 0
  if (ly >= obj.y + obj.height - rowH) return 1
  return null
}

/** The bay selection now, as entries: the marquee / Shift+click entries, or a selected rack's single clicked bay. */
export function selectedBays(state) {
  if (state.activeBaySelection && state.activeBaySelection.length) return state.activeBaySelection
  const ids = new Set(state.selectedIds || [])
  return (state.objects || []).filter(o => ids.has(o.id) && o.activeBayIdx != null && (o.type === 'rack_row' || o.type === 'rack_double_row'))
    .map(o => ({ objId: o.id, bayIdx: o.activeBayIdx, ...(o.activeBaySide === 0 || o.activeBaySide === 1 ? { side: o.activeBaySide } : {}) }))
}

/** Does the selection take any pair's bay on ONE side only (the case this file handles; the rest is the store's own)? */
export function hasOneSide(objects, entries) {
  const byRack = new Map()
  for (const e of entries) { if (!byRack.has(e.objId)) byRack.set(e.objId, []); byRack.get(e.objId).push(e) }
  for (const [id, list] of byRack) {
    const r = objects.find(o => o.id === id)
    if (!isPair(r)) continue
    for (const e of list) if ((e.side === 0 || e.side === 1) && !list.some(f => f.bayIdx === e.bayIdx && (f.side == null || f.side === 1 - e.side))) return true
  }
  return false
}

/** `objects` with the bays of `entries` deleted, each pair's on its own side: { objects, removed (rack ids gone),
 *  became: Map(rack id → its piece ids) }. */
export function planBaySideDelete(objects, entries, { gridSize = 40, newId }) {
  const byRack = new Map()
  for (const e of entries) { if (!byRack.has(e.objId)) byRack.set(e.objId, []); byRack.get(e.objId).push(e) }
  const replace = new Map(), became = new Map()
  for (const [id, list] of byRack) {
    const r = objects.find(o => o.id === id)
    if (!r || !Array.isArray(r.beams)) continue
    const gone = r.beams.map(() => new Set())                      // per bay: the faces removed
    for (const e of list) {
      if (!(e.bayIdx >= 0 && e.bayIdx < r.beams.length)) continue
      if (isPair(r) && (e.side === 0 || e.side === 1)) gone[e.bayIdx].add(e.side)
      else { gone[e.bayIdx].add(0); gone[e.bayIdx].add(1) }
    }
    const state = gone.map(g => (g.size === 0 ? 'D' : g.size === 2 || !isPair(r) ? '-' : g.has(0) ? 'B' : 'A'))
    if (state.every(x => x === '-')) continue                     // never every bay of a rack, as the store's own delete
    const pieces = state.every(s => s === 'D') ? [r] : piecesFromStates(r, state, { gridSize, newId })
    replace.set(id, pieces)
    became.set(id, pieces.map(p => p.id))
  }
  const next = objects.flatMap(o => (replace.has(o.id) ? replace.get(o.id) : [o]))
  return { objects: next, became, removed: [...became].filter(([, ids]) => !ids.length).map(([id]) => id) }
}

/** Delete the bay selection in `store` — each pair's bays on the side picked — as ONE history entry, then clear the
 *  selection. Returns false (and does nothing) when no pair bay is picked on one side only: the store's own bay
 *  delete handles that. */
export function deleteBaySelection(store, newId) {
  const st = store.getState(), entries = selectedBays(st)
  if (!entries.length || !hasOneSide(st.objects, entries)) return false
  const { objects, became } = planBaySideDelete(st.objects, entries, { gridSize: st.gridSize || 40, newId })
  const anchor = [...became.values()].flat()[0] || objects.find(o => typeof o.type === 'string' && o.type.startsWith('fp_'))?.id
  store.setState({ objects: rebuildAisles(objects, newId).objects, activeBaySelection: [] })
  if (anchor) store.getState().commitObjectUpdate(anchor, {})
  store.getState().clearSelection()
  return true
}
