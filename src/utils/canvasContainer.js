// utils/canvasContainer.js
// ─────────────────────────────────────────────────────────────────────────────
// Which canvas is actually mounted, and its real on-screen container — the one
// DOM fact every "drop this new object at the centre of the current view" call
// site needs and, before this file existed, four of them (FloatingToolbar's
// placeObject, TopBar's doZoom, ObjectLibrary, WarehouseObjectPicker) each
// hardcoded to `#canvas-container`, the SVG engine's own id. Under canvas2 that
// id belongs to nothing — canvas2 mounts as `#canvas2-container` — so every one
// of those lookups returned null and silently fell back to a guessed 900x600
// viewport, placing new objects off the true centre. See CANVAS2_BUGLOG.md.
//
// One function, so "which id is the live canvas" is answered in exactly one
// place regardless of how many more of these call sites turn up later.
// ─────────────────────────────────────────────────────────────────────────────

import { isCanvas2Enabled } from '../canvas2/flag'

/** The DOM element the currently-active canvas engine actually renders into,
 *  or null if neither is mounted yet (a real possibility on first paint,
 *  before either canvas commits — every caller already had its own
 *  hardcoded-size fallback for exactly this case, which this deliberately
 *  leaves the caller free to keep). */
export function getCanvasContainerEl() {
  const id = isCanvas2Enabled() ? 'canvas2-container' : 'canvas-container'
  return document.getElementById(id)
}

/** The live container's on-screen size — what every "centre of the current
 *  viewport" placement calculation actually needs — with the SAME fallback
 *  shape (`{ w: 900, h: 600 }`) every call site already used for "no
 *  container yet", so swapping this in changes WHICH element gets measured,
 *  never what happens when measuring fails. */
export function getCanvasContainerSize(fallback = { w: 900, h: 600 }) {
  const el = getCanvasContainerEl()
  return el ? { w: el.clientWidth, h: el.clientHeight } : fallback
}
