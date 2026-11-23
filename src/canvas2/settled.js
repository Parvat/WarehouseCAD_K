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
import { useDragPreview } from './dragPreview'
import { useLiveObjects } from './live'

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
  const live = useLiveObjects(), settled = useSettledObjects()
  const dragging = useDragPreview(s => s.dragging), ids = useDragPreview(s => s.ids)
  const carriesAll = useMemo(() => !!ids && settled.every(o => !feedsLabels(o) || ids.has(o.id)), [settled, ids])
  return dragging && !carriesAll ? settled : live
}
