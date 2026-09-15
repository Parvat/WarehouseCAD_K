// canvas2/handleGeometry.js
// ─────────────────────────────────────────────────────────────────────────────
// Resize/rotate handle geometry, ported from CanvasUI.jsx's ResizeHandles —
// NOT reinvented. Pure functions: no React, no Konva, no DOM, so the same
// numbers that decide what gets PAINTED (ResizeHandlesOverlay.jsx) also decide
// what a click HITS (useCanvasInteraction.js's onStageMouseDown) — one set of
// formulas, not two that could drift.
//
// CanvasUI.jsx never needs to un-rotate a click: its handles are DOM elements
// inside a `<g transform="rotate(...)">` ancestor, so the browser's own hit
// testing does that job for free. canvas2 has no such ancestor doing picking
// for it (CANVAS2.md rule 4 — geometry decides, not the renderer's scene
// graph), so `handleHitTest` below does explicitly what the SVG gets for
// free: un-rotate the world point around the object's own bounds centre
// before comparing it to the same UNROTATED positions CanvasUI computes.
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds, getHandlePositions, HANDLES } from '../utils/canvas'

/* CanvasUI.jsx's own per-type suppression, verbatim:
     - beam racks (bays/towers only stretch along their length) -> ml/mr only
     - lane racks (drive-in/through, pushback, pallet-flow) -> suppress tc
     - aisle -> nothing at all */
const ML_MR_ONLY = new Set(['rack_row', 'rack_double_row', 'rack_cantilever'])
const SUPPRESS_TC = new Set(['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])

export function enabledHandlesFor(type) {
  if (type === 'aisle') return []
  if (ML_MR_ONLY.has(type)) return ['ml', 'mr']
  if (SUPPRESS_TC.has(type)) return HANDLES.filter(h => h !== 'tc')
  return HANDLES.slice()
}

export function rotateEnabledFor(type) {
  return type !== 'aisle'
}

/** World point -> local (pre-rotation) point around the object's own bounds
 *  centre. Same un-rotate CanvasArea's hitTestBay port already does in
 *  hitTest.js — kept as its own small copy here rather than imported,
 *  because that one is scoped to bay picking on RACK_BAY_TYPES and this one
 *  runs for every rack regardless of whether it answers a bay pick at all. */
function toLocal(bounds, rotation, wx, wy) {
  const rot = ((rotation || 0) % 360 + 360) % 360
  if (rot === 0) return { x: wx, y: wy }
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const rad = -(rot * Math.PI) / 180
  const dx = wx - cx, dy = wy - cy
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

/** The rotate handle's LOCAL (pre-rotation) position — CanvasUI.jsx's own
 *  `rx = bounds.x + bounds.width/2, ry = bounds.y - 70/zoom`. Exported so the
 *  painter and the hit-test can never disagree on where it sits. */
export function rotateHandlePos(bounds, zoom) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y - 70 / zoom }
}

/** getHandlePositions' own pad, screen-constant like everything else here.
 *  CanvasUI.jsx calls getHandlePositions(bounds) with no override, taking
 *  the default pad=6 — a fixed 6 SVG-user-units gap that shrinks right along
 *  with the view at low zoom, same as any other unscaled SVG length. That is
 *  harmless there: the handle SQUARE itself (hs=6/zoom) is drawn ON TOP of
 *  the object at 7% zoom regardless, and a real click still resolves through
 *  the DOM's own top-most-element-wins stacking, never through a world-space
 *  distance check. canvas2 has no such free ride (rule 4 — geometry decides,
 *  not the renderer) — handleHitTest below compares WORLD distances, so a
 *  tiny fixed pad paired with a screen-constant hs would make the hit box's
 *  INNER edge reach deep into the object at low zoom (confirmed: at 7% zoom
 *  a pad of the literal default 6 put the 'ml' hit box's inner edge over
 *  100 world px inside a beam rack's own body, swallowing a click meant to
 *  clear its active bay). Scaling the pad by the SAME 1/zoom as hs keeps the
 *  hit box's inner edge flush with the object's true edge at every zoom,
 *  matching what a real screen-space "handle sits just outside the object"
 *  is actually supposed to mean. */
export function handlePad(zoom) {
  return 6 / zoom
}

/** CanvasUI.jsx's cursorMap, verbatim: each handle's resize cursor rotates
 *  through the 8 compass directions in 45° steps as the object itself
 *  rotates, so a handle that reads "stretch this edge" keeps pointing the
 *  same way visually even once the object is turned. 'rotate' always shows
 *  CanvasUI's own 'alias' cursor regardless of rotation. */
const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const HANDLE_DIR_INDEX = { tl: 7, tc: 0, tr: 1, ml: 6, mr: 2, bl: 5, bc: 4, br: 3 }

export function cursorForHandle(handle, rotation) {
  if (handle === 'rotate') return 'alias'
  const base = HANDLE_DIR_INDEX[handle]
  if (base === undefined) return 'default'
  const steps = Math.round((rotation || 0) / 45) % 8
  const i = (base + steps + 8) % 8
  return COMPASS[i] + '-resize'
}

/** Every number ResizeHandlesOverlay needs to PAINT the handles, computed
 *  once so the painter (a React render) and the imperative live-tracking
 *  sync (useCanvasInteraction's resize/rotate mousemove — see BUG 6's
 *  collectDragNodes for the same idea applied to plain object drag) can
 *  never disagree on where a handle belongs mid-gesture, before React's
 *  own re-render has caught up. */
export function computeHandleLayout(obj, zoom) {
  const bounds = getObjectBounds(obj)
  const enabled = enabledHandlesFor(obj.type)
  const canRotate = rotateEnabledFor(obj.type)
  const positions = getHandlePositions(bounds, handlePad(zoom))
  const hs = 6 / zoom
  let rotateHandle = null
  if (canRotate) {
    const { x: rx, y: ry } = rotateHandlePos(bounds, zoom)
    rotateHandle = { rx, ry, lineY: bounds.y - 6 / zoom, r: 8 / zoom }
  }
  return { bounds, enabled, positions, hs, canRotate, rotateHandle }
}

/** Which handle (a HANDLES entry, or 'rotate') a world point falls on, or
 *  null. Sizes match CanvasUI.jsx exactly: 6px half-size resize squares,
 *  8px-radius rotate circle, both screen-constant via /zoom — the same
 *  reason CanvasUI divides by zoom for its own SVG geometry (a screen-space
 *  target size needs a WORLD size that shrinks as the view zooms in). */
export function handleHitTest(obj, worldX, worldY, zoom) {
  const bounds = getObjectBounds(obj)
  const local = toLocal(bounds, obj.rotation, worldX, worldY)
  const hs = 6 / zoom

  if (rotateEnabledFor(obj.type)) {
    const { x: rx, y: ry } = rotateHandlePos(bounds, zoom)
    const r = 8 / zoom
    if (Math.hypot(local.x - rx, local.y - ry) <= r) return 'rotate'
  }

  const enabled = enabledHandlesFor(obj.type)
  if (!enabled.length) return null
  const positions = getHandlePositions(bounds, handlePad(zoom))
  for (const h of enabled) {
    const hp = positions[h]
    if (!hp) continue
    if (local.x >= hp.x - hs && local.x <= hp.x + hs &&
        local.y >= hp.y - hs && local.y <= hp.y + hs) return h
  }
  return null
}
