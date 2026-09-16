// utils/canvasContainer.js
// ─────────────────────────────────────────────────────────────────────────────
// canvas2's real on-screen container — the one DOM fact every "drop this new
// object at the centre of the current view" call site needs. Before this file
// existed, four of them (FloatingToolbar's placeObject, TopBar's doZoom,
// ObjectLibrary, WarehouseObjectPicker) each hardcoded `#canvas-container`,
// the OLD SVG engine's own id — wrong once canvas2 became the only renderer,
// since canvas2 mounts as `#canvas2-container`. See CANVAS2_BUGLOG.md (the
// bug this fixed, and the entry retiring the SVG engine this file's own
// engine-branching used to read from).
//
// One function, so "what is the live canvas's container" is answered in
// exactly one place regardless of how many more call sites turn up later.
// ─────────────────────────────────────────────────────────────────────────────

/** canvas2's own container element, or null if it hasn't mounted yet (a real
 *  possibility on first paint — every caller already had its own
 *  hardcoded-size fallback for exactly this case, which this deliberately
 *  leaves the caller free to keep). */
export function getCanvasContainerEl() {
  return document.getElementById('canvas2-container')
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
