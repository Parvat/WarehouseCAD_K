// hoverTarget.js — hover highlights exactly what a click would select (STUDIO.md §7a Tools). One pure prediction of
// a plain click (no Shift) at a world point, with Pan or Select, made the way canvas2/useCanvasInteraction.js decides
// a press — a handle keeps the selection, then a column, a wall, a rack (its row; on the selected row or the row whose
// bays are picked: the bay under it, both sides in a pair's flue), any other object, the building's blank floor (the
// building), the canvas outside (nothing). `key` is the same canonical string selectionKey() makes of the selection
// a click leaves, so the two can be compared. Presentation state only.

import { create } from 'zustand'
import { hitTest, hitTestBay, fpWallHitTest, wallBeatsPadding } from './hitTest'
import { handleHitTest, hasResizeHandles } from './handleGeometry'
import { PORTED_RACK_TYPES } from '../render/rackOps'
import { fpRotateHandleHitTest } from './fpRotate'
import { fpHandleHit } from './fpHandles'
import { columnAt, pickedColumn } from './columnPick'
import { sectionIds } from './sections'
import { selectionLevel, pickedBays, isBayRack } from './selectionLevel'
import { bayHalfAt } from '../utils/baySides'
import { pickableIn, isPickable } from '../utils/layers'

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const round = (v) => Math.round(v * 10) / 10

/** `{ key, target }` under the pointer: target { kind, ids, bays?, column? } (null: nothing). */
export const useHoverTarget = create(() => ({ key: 'none', target: null }))
export function setHoverTarget(t) {
  const key = t ? t.key : 'none', cur = useHoverTarget.getState()
  if (cur.key !== key) useHoverTarget.setState({ key, target: t || null })
}
export const clearHoverTarget = () => setHoverTarget(null)

const sortedKey = (kind, ids) => kind + ':' + [...ids].sort().join(',')
const bayKey = (entries) => 'bays:' + entries.map(e => e.objId + ':' + e.bayIdx + ':' + (e.side === 0 || e.side === 1 ? e.side : 'both')).sort().join(',')
const kindOfType = (t) => (FP.has(t) ? 'building' : t.startsWith('rack_') ? 'rows' : t === 'column_grid' ? 'grid' : t.startsWith('zone_') ? 'zones' : t)

/** The selection in store state `st` as a canonical key: 'none' · 'building:id' · 'rows:ids' · 'bays:…' ·
 *  'column:gridId:x:y' (one column picked) · 'grid:id' · '<kind>:ids'. */
export function selectionKey(st) {
  const col = pickedColumn(st)
  if (col) return 'column:' + col.gridId + ':' + round(col.x) + ':' + round(col.y)
  if (selectionLevel(st) === 'bays') return bayKey(pickedBays(st))
  const ids = st.selectedIds || []
  if (!ids.length) return 'none'
  const kinds = new Set(ids.map(id => kindOfType(st.objects.find(o => o.id === id)?.type || '')))
  return sortedKey(kinds.size === 1 ? [...kinds][0] : 'mixed', ids)
}

/** What a plain click at world `w` would select, as `{ key, kind, ids, bays, column }` (key 'none': nothing). */
export function predictClick(st, w, zoom) {
  const gs = st.gridSize || 40
  const keep = () => ({ key: selectionKey(st), kind: 'keep', ids: st.selectedIds || [] })
  // a handle of the selection: a click there selects nothing new
  if ((st.selectedIds || []).length === 1) {
    const s = st.objects.find(o => o.id === st.selectedIds[0])
    if (s && hasResizeHandles(s.type, PORTED_RACK_TYPES) && handleHitTest(s, w.x, w.y, zoom)) return keep()
    if (s && FP.has(s.type) && (fpRotateHandleHitTest(s, gs, zoom, w.x, w.y) || (isPickable(st.layers, s) && fpHandleHit(s, w.x, w.y, zoom)))) return keep()
  } else if ((st.selectedIds || []).length >= 2) {
    /* the group rotate handle is checked by the press too; it is small and rare: left as the plain pick */
  }
  let hitId = hitTest(st.objects, st.layers, w.x, w.y, zoom, gs)
  let hit = hitId ? st.objects.find(o => o.id === hitId) : null
  // a column (one column picked out of its grid: columnPick.js)
  if (!hit || hit.type === 'column_grid' || FP.has(hit.type)) {
    const col = columnAt(st.objects, st.layers, w.x, w.y, zoom, gs)
    if (col) {
      const p = pickedColumn(st), again = p && p.gridId === col.gridId && Math.abs(p.x - col.x) < 1e-6 && Math.abs(p.y - col.y) < 1e-6
      return again ? { key: 'grid:' + col.gridId, kind: 'grid', ids: [col.gridId] } : { key: 'column:' + col.gridId + ':' + round(col.x) + ':' + round(col.y), kind: 'column', ids: [col.gridId], column: col }
    }
  }
  // a wall: the building
  const padWall = wallBeatsPadding(st.objects, st.layers, w.x, w.y, zoom, gs, hit)
  if (!hit || FP.has(hit.type) || padWall) {
    const wall = padWall || fpWallHitTest(st.objects, st.layers, w.x, w.y, zoom, gs)
    if (wall) return { key: 'building:' + wall.objId, kind: 'building', ids: [wall.objId] }
  }
  // the building's blank floor: the building
  if (hit && FP.has(hit.type)) return { key: 'building:' + hit.id, kind: 'building', ids: [hit.id] }
  if (!hit) return { key: 'none', kind: 'none', ids: [] }
  const ok = pickableIn(st.layers)
  // a rack: its row (section); on the row selected — or the row whose bays are picked — the bay under it
  if (isBayRack(hit)) {
    const sec = sectionIds(st.objects, hit.id, gs), level = selectionLevel(st), sel = st.selectedIds || []
    const sameRow = level === 'rows' && sel.length === sec.length && sec.every(id => sel.includes(id))
    const owns = level === 'bays' && pickedBays(st).some(e => sec.includes(e.objId))
    if (sameRow || owns) {
      const bay = hitTestBay(hit, w.x, w.y, gs)
      const rows = sectionIds(st.objects, hit.id, gs)
      if (bay == null) return { key: sortedKey('rows', rows), kind: 'rows', ids: rows }
      const side = bayHalfAt(hit, w.x, w.y, gs)
      const cur = pickedBays(st), e = { objId: hit.id, bayIdx: bay, side: side ?? null }
      const again = cur.length === 1 && cur[0].objId === e.objId && cur[0].bayIdx === e.bayIdx && (cur[0].side ?? null) === e.side
      if (again) return { key: sortedKey('rows', rows), kind: 'rows', ids: rows }
      return { key: bayKey([e]), kind: 'bays', ids: [hit.id], bays: [e] }
    }
    const g = (st.groups || []).find(x => x.ids && x.ids.includes(hit.id))
    const ids = (g ? g.ids : sec).filter(id => { const o = st.objects.find(x => x.id === id); return o && ok(o) })
    return { key: sortedKey('rows', ids), kind: 'rows', ids }
  }
  // any other object: it (its group's members)
  const g = (st.groups || []).find(x => x.ids && x.ids.includes(hit.id))
  const ids = (g ? g.ids : [hit.id]).filter(id => { const o = st.objects.find(x => x.id === id); return o && ok(o) })
  const kinds = new Set(ids.map(id => kindOfType(st.objects.find(o => o.id === id)?.type || '')))
  return { key: ids.length ? sortedKey(kinds.size === 1 ? [...kinds][0] : 'mixed', ids) : 'none', kind: 'object', ids }
}

