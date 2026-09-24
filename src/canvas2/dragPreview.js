import { create } from 'zustand'

/* ── Live drag preview for overlays ───────────────────────────────────────────
   A plain object drag moves Konva nodes directly and writes the canvas store
   only on mouseup (BUG 12's node-move trick), so anything DERIVED from the
   store — the column check's aisle warnings and clearance labels — would sit
   at the pre-drag layout until the drop. This holds just the drag's current
   offset and the set of object ids it moves (the selection plus any floor
   plan's children), so an overlay can derive a previewed layout per frame.
   Presentation state only: never the canvas store, never history. */
export const useDragPreview = create(() => ({ ids: null, dx: 0, dy: 0 }))

export const setDragPreview = (ids, dx, dy) => useDragPreview.setState({ ids, dx, dy })
export const clearDragPreview = () => {
  if (useDragPreview.getState().ids) useDragPreview.setState({ ids: null, dx: 0, dy: 0 })
}

/** Objects as they'd sit mid-drag: the moved ids shifted by (dx, dy),
 *  including a floor plan's own wall vertices. Same array when idle. */
export function previewObjects(objects, preview) {
  const { ids, dx, dy } = preview || {}
  if (!ids || (!dx && !dy)) return objects
  return objects.map(o => {
    if (!o || !ids.has(o.id)) return o
    const moved = { ...o, x: o.x + dx, y: o.y + dy }
    if (Array.isArray(o.fpVerts)) moved.fpVerts = o.fpVerts.map(v => ({ x: v.x + dx, y: v.y + dy }))
    return moved
  })
}
