// settled.js — (drag-perf-bar) the canvas store as it stands between gestures. While a drag is under way (dragPreview's
// `dragging`: a plain drag, a live-flue drag, a resize, a Row group, a section, a door, a wall) a component reading the
// store through useSettledStore keeps the value it had when the drag began — it does not re-render on the drag's
// per-frame writes — and catches up once, on the drop. The aisle labels and marks, the cards, Check, the BOM, the
// Tally and the summary read the store this way, so a drag pays only for drawing what moves; after the drop every one
// of them shows exactly what it showed before (the same store, read once). The dragged objects themselves, their
// selection outline and the snap guides follow the drag as before (useCanvasStore / useLiveObjects).
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { shallow } from 'zustand/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useMemo } from 'react'
import { useDragPreview, previewObjects } from './dragPreview'

const isDragging = () => useDragPreview.getState().dragging
/** useCanvasStore(selector) — shallow-compared — held still during a drag. */
export function useSettledStore(selector) {
  useDragPreview(s => s.dragging)                      // the drop re-renders it (and the selector reads the store again)
  return useStoreWithEqualityFn(useCanvasStore, selector, (a, b) => isDragging() || shallow(a, b))
}
/** The store's objects, held still during a drag. */
export const useSettledObjects = () => useSettledStore(s => s.objects)

/* The labels' objects (the row numbers; the aisle labels and marks hold the same way in Overlays.jsx): the live ones
   (useLiveObjects — the drag's offset on what it moves) between drags and while a drag carries everything they come
   from (a building with all its racks, everything selected — they ride it rigidly); during any other drag the store's as
   it stood when the drag began, so nothing is re-placed per frame — on the drop they are placed once, as before. */
const feedsLabels = (o) => o && typeof o.type === 'string' && (o.type.startsWith('rack_') || o.type === 'aisle' || o.type === 'column_grid' || o.type.startsWith('fp_'))
export function useLabelObjects() {
  const settled = useSettledObjects()
  const dragging = useDragPreview(s => s.dragging), ids = useDragPreview(s => s.ids)
  const carriesAll = useMemo(() => !!ids && settled.every(o => !feedsLabels(o) || ids.has(o.id)), [settled, ids])
  /* (gen-lock) held: the drag's offset is not even read — a label component re-rendered every frame redrew its whole
     layer (every row number) though nothing in it moved */
  const follow = !dragging || carriesAll
  const dx = useDragPreview(s => (follow ? s.dx : 0)), dy = useDragPreview(s => (follow ? s.dy : 0))
  return useMemo(() => (follow ? previewObjects(settled, { ids, dx, dy }) : settled), [follow, settled, ids, dx, dy])
}
/** (rack-round2 4) Are the labels' objects held (useLabelObjects: a drag that does not carry everything)? Then a label of
 *  what is moving must be moved by the drag itself (or not drawn), never left at its old place. */
export function useLabelsHeld() {
  const settled = useSettledObjects()
  const dragging = useDragPreview(s => s.dragging), ids = useDragPreview(s => s.ids)
  const carriesAll = useMemo(() => !!ids && settled.every(o => !feedsLabels(o) || ids.has(o.id)), [settled, ids])
  return !!dragging && !carriesAll
}
