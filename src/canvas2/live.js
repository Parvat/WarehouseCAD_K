// live.js — the ONE way an overlay on the canvas gets positions (tally-2): the objects where they are drawn NOW, and the
// view the canvas is drawn with NOW. Never the store's saved positions during a pan or a drag.
//
// Why: a plain drag moves the Konva nodes of what it drags directly and writes the canvas store only on mouseup
// (useCanvasInteraction.js, dragPreview.js), and a pan or zoom moves the Stage at once but writes the store's
// zoom / panX / panY one animation frame later (Canvas2.jsx syncStore). An overlay that drew from the store's objects
// stayed where the racks were until the drop, then jumped; one placed in screen px from the store's pan trailed the
// plan by a frame. So:
//   - a Konva overlay (inside the Stage) is drawn in world px from useLiveObjects() — the store's objects with the
//     current drag's offset applied (previewObjects) — and the Stage's transform does the rest;
//   - a DOM overlay (screen px over the canvas: the selection bar, the column line gaps, the section rename box) places
//     itself with useLiveView() — the transform Canvas2 applies to the Stage, published in the same call (publishView)
//     — or toScreen(view, p).
// src/__test__/plan/LV_liveOverlays.test.js fails when an overlay reads positions any other way.

import { useMemo } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useDragPreview, previewObjects } from './dragPreview'

/** The view the Stage is drawn with right now: { zoom, panX, panY } (Canvas2 apply → publishView). */
export const useLiveView = create(() => ({ zoom: 1, panX: 0, panY: 0, ready: false }))
/** Canvas2's apply(): the Stage's transform, published in the same call that sets it. */
export function publishView(v) {
  const s = useLiveView.getState()
  if (s.ready && s.zoom === v.zoom && s.panX === v.panX && s.panY === v.panY) return
  useLiveView.setState({ zoom: v.zoom, panX: v.panX, panY: v.panY, ready: true })
}
/** The live view for a DOM overlay (before the canvas first draws: the store's). */
export function useView() {
  const live = useLiveView(useShallow(s => s))
  const st = useCanvasStore(useShallow(s => (live.ready ? null : { zoom: s.zoom || 1, panX: s.panX || 0, panY: s.panY || 0 })))   // live-ok: before the first draw
  return live.ready ? live : st
}
/** World px → screen px (relative to the canvas container) in view `v`. */
export const toScreen = (v, p) => ({ x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY })

/** The objects as drawn now: the store's, with the current drag's offset on what it moves. */
export function useLiveObjects() {
  const objects = useCanvasStore(s => s.objects)
  const { ids, dx, dy } = useDragPreview(useShallow(s => ({ ids: s.ids, dx: s.dx, dy: s.dy })))
  return useMemo(() => previewObjects(objects, { ids, dx, dy }), [objects, ids, dx, dy])
}
/** The current drag's offset for things kept by id (a highlight's shapes): (dx, dy) when every one of `ids` moves. */
export function useLiveOffset(ids) {
  const { moved, dx, dy } = useDragPreview(useShallow(s => ({ moved: s.ids, dx: s.dx, dy: s.dy })))
  if (!moved || !ids || !ids.length || !ids.every(id => moved.has(id))) return { dx: 0, dy: 0 }
  return { dx, dy }
}
