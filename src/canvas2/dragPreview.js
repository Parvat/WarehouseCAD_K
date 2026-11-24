import { create } from 'zustand'
import { useMemo } from 'react'

/* ── Live drag preview for overlays ───────────────────────────────────────────
   A plain object drag moves Konva nodes directly and writes the canvas store
   only on mouseup (BUG 12's node-move trick), so anything DERIVED from the
   store — the column check's aisle warnings and clearance labels — would sit
   at the pre-drag layout until the drop. This holds just the drag's current
   offset and the set of object ids it moves (the selection plus any floor
   plan's children), so an overlay can derive a previewed layout per frame.
   Presentation state only: never the canvas store, never history. */
export const useDragPreview = create(() => ({ ids: null, dx: 0, dy: 0, dragging: false, flue: null }))

/* (gen-lock) A back-to-back pair dragged with its live flue (liveFlue.js): its place and its flue as they are now —
   { id, x, y, height, flueSpaceIn } — held here, not written to the canvas store every frame (a store write per frame
   re-rendered the whole canvas). The pair's own drawing (its rack, outline, handles, labels: useFlued) and every live
   overlay (previewObjects) draw it from here; the drop writes it to the store once. */
export const setFluePreview = (flue) => useDragPreview.setState({ flue })
/** `obj` with the dragged pair's live flue on it, when it is that pair. */
export const withFlue = (obj, flue) => (flue && obj && obj.id === flue.id ? { ...obj, x: flue.x, y: flue.y, height: flue.height, flueSpaceIn: flue.flueSpaceIn } : obj)
/** `obj` as drawn now: re-renders only the component of the pair being dragged with its live flue. */
export function useFlued(obj) {
  const f = useDragPreview(s => (obj && s.flue && s.flue.id === obj.id ? s.flue : null))
  return useMemo(() => withFlue(obj, f), [obj, f])
}

/* A gesture that moves or reshapes objects is under way (a plain drag, a
   live-flue drag, a resize, a rotate, a wall drag). The column check holds
   its last full result while this is on and re-runs only its cheap aisle
   part per frame; the full check runs once, on the drop. */
export const setDragging = (on) => { if (useDragPreview.getState().dragging !== on) useDragPreview.setState({ dragging: on }) }

export const setDragPreview = (ids, dx, dy) => useDragPreview.setState({ ids, dx, dy })
export const clearDragPreview = () => {
  const s = useDragPreview.getState()
  if (s.ids || s.flue) useDragPreview.setState({ ids: null, dx: 0, dy: 0, flue: null })
}

/** Objects as they'd sit mid-drag: the moved ids shifted by (dx, dy),
 *  including a floor plan's own wall vertices. Same array when idle. */
/* (gen-lock) the last result kept: every live overlay asks for the same objects with the same drag each frame — worked
   out once, not once per overlay */
let lastPreview = null
export function previewObjects(objects, preview) {
  const { ids, dx, dy, flue } = preview || {}
  const l = lastPreview
  if (l && l.objects === objects && l.ids === ids && l.dx === dx && l.dy === dy && l.flue === flue) return l.out
  const out = previewObjectsNow(objects, ids, dx, dy, flue)
  lastPreview = { objects, ids, dx, dy, flue, out }
  return out
}
function previewObjectsNow(objects, ids, dx, dy, flue) {
  if (flue) objects = objects.map(o => withFlue(o, flue))
  if (!ids || (!dx && !dy)) return objects
  return objects.map(o => {
    if (!o || !ids.has(o.id)) return o
    const moved = { ...o, x: o.x + dx, y: o.y + dy }
    if (Array.isArray(o.fpVerts)) moved.fpVerts = o.fpVerts.map(v => ({ x: v.x + dx, y: v.y + dy }))
    return moved
  })
}
