// canvas2/columnPick.js — one column picked out of its column grid (STUDIO.md §7), the way a bay is picked out of its
// row: a click on a column selects that column — even with the Columns layer locked (locked: it cannot be moved, not
// that it cannot be clicked); the same column clicked again, or Esc, steps up to the whole grid. The store holds the
// grid as the selection (selectedIds [gridId]); which of its columns is picked — and whether its bar's Show clearances
// is on — is presentation state here, never the store. A selection that is no longer that grid alone ends the pick.
// Ctrl+A still skips locked layers (utils/layers.js selectAllIds).

import { create } from 'zustand'
import { useCanvasStore } from '../store/useCanvasStore'
import { expandColumnGrid } from '../generate/columnCheck'
import { isShown } from '../utils/layers'

/** { gridId, x, y, w, h } — the column's square (world px) — and `show`: its clearances on the plan. */
export const useColumnPick = create(() => ({ pick: null, show: true }))

/** The column under world (wx, wy), on any shown column grid (locked or not): { gridId, x, y, w, h } or null. */
export function columnAt(objects, layers, wx, wy, zoom = 1, gridSize = 40) {
  const pad = 4 / zoom
  for (const g of objects || []) {
    if (!g || g.type !== 'column_grid' || g.showGrid === false || !isShown(layers, g)) continue
    for (const c of expandColumnGrid(g, gridSize)) {
      if (wx >= c.x - pad && wx <= c.x + c.w + pad && wy >= c.y - pad && wy <= c.y + c.h + pad) return { gridId: g.id, x: c.x, y: c.y, w: c.w, h: c.h }
    }
  }
  return null
}

const same = (a, b) => !!a && !!b && a.gridId === b.gridId && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
/** The column picked, while its grid alone is the selection; else null. */
export function pickedColumn(st = useCanvasStore.getState()) {
  const p = useColumnPick.getState().pick
  if (!p || (st.selectedIds || []).length !== 1 || st.selectedIds[0] !== p.gridId) return null
  return (st.objects || []).some(o => o.id === p.gridId) ? p : null
}
export const clearColumnPick = () => { if (useColumnPick.getState().pick) useColumnPick.setState({ pick: null, show: true }) }
export const setColumnClearances = (on) => useColumnPick.setState({ show: !!on })

/** A plain click on column `col` (columnAt): that column — the grid is the selection, nothing else (no bay); the
 *  column already picked: back to the whole grid. */
export function clickColumn(store, col) {
  const again = same(pickedColumn(store.getState()), col)
  const st = store.getState()
  const objects = st.objects.some(o => o.activeBayIdx != null || o.activeTowerIdx != null)
    ? st.objects.map(o => (o.activeBayIdx != null || o.activeTowerIdx != null ? { ...o, activeBayIdx: null, activeBaySide: null, activeTowerIdx: null } : o))
    : st.objects
  store.setState({ selectedIds: [col.gridId], activeBaySelection: [], objects })
  st.setActiveWall?.(null)
  if (again) clearColumnPick()
  else useColumnPick.setState({ pick: { gridId: col.gridId, x: col.x, y: col.y, w: col.w, h: col.h }, show: true })
}

/* the selection moved off the grid: the pick is over */
useCanvasStore.subscribe((s, prev) => {
  if (s.selectedIds === prev.selectedIds) return
  const p = useColumnPick.getState().pick
  if (p && !(s.selectedIds.length === 1 && s.selectedIds[0] === p.gridId)) clearColumnPick()
})
