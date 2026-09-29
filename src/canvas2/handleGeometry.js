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

/* Handle sizes are DRAWING size, like labels and columns: a resize square
   is 6", the rotate grip 10" across on a 10" stem, so they scale with the
   zoom — but they never draw smaller than a visible minimum (6 px square,
   10 px grip) zoomed out, nor bigger than a maximum (12 px square, 18 px
   grip) zoomed in. The click
   area is the drawn size but never under 12 px on screen. One set for every
   handle: the resize squares and the rotate grip of a rack, a selection
   group and a building (handleSizes). */
export const HANDLE_IN = 6           // a resize square's side, inches
export const GRIP_IN = 10            // the rotate grip's diameter (and its stem), inches
export const HANDLE_MIN_PX = 6       // a square never draws smaller than this on screen
export const GRIP_MIN_PX = 10        // nor the grip
export const HANDLE_MAX_PX = 12      // a square never draws bigger than this on screen
export const GRIP_MAX_PX = 18        // nor the grip
export const HIT_MIN_PX = 12         // a click area is never smaller than this on screen
export const HANDLE_FILL = '#ffffff'
export const HANDLE_ACCENT = '#4a9eff'

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

/** Every handle size in WORLD units for a zoom: `handle` (a square's side),
 *  `grip` (the rotate grip's diameter), `stem`, `pad` (the gap from the
 *  object's edge to a square's centre, and to the stem's foot), `hitHalf` /
 *  `hitR` (the click areas). */
export function handleSizes(zoom = 1, gridSize = 40) {
  const inch = gridSize / 12
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
  const handle = clamp(HANDLE_IN * inch, HANDLE_MIN_PX / zoom, HANDLE_MAX_PX / zoom)
  const grip = clamp(GRIP_IN * inch, GRIP_MIN_PX / zoom, GRIP_MAX_PX / zoom)
  const floor = HIT_MIN_PX / zoom
  return { handle, grip, stem: grip, pad: handle * 0.75, hitHalf: Math.max(handle, floor) / 2, hitR: Math.max(grip, floor) / 2 }
}

/** The rotate handle's LOCAL (pre-rotation) position: centred over the
 *  object, a stem above its top edge. Exported so the painter and the
 *  hit-test can never disagree on where it sits. */
export function rotateHandlePos(bounds, zoom, gridSize = 40) {
  const z = handleSizes(zoom, gridSize)
  return { x: bounds.x + bounds.width / 2, y: bounds.y - (z.pad + z.stem + z.grip / 2) }
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
export function handlePad(zoom, gridSize = 40) {
  return handleSizes(zoom, gridSize).pad
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
export function computeHandleLayout(obj, zoom, gridSize = 40) {
  const bounds = getObjectBounds(obj)
  const enabled = enabledHandlesFor(obj.type)
  const canRotate = rotateEnabledFor(obj.type)
  const z = handleSizes(zoom, gridSize)
  const positions = getHandlePositions(bounds, z.pad)
  const hs = z.handle / 2
  let rotateHandle = null
  if (canRotate) {
    const { x: rx, y: ry } = rotateHandlePos(bounds, zoom, gridSize)
    rotateHandle = { rx, ry, lineY: bounds.y - z.pad, r: z.grip / 2 }
  }
  return { bounds, enabled, positions, hs, canRotate, rotateHandle }
}

/** Which handle (a HANDLES entry, or 'rotate') a world point falls on, or
 *  null. The click areas are the drawn handles, but never under HIT_MIN_PX
 *  on screen (handleSizes). */
export function handleHitTest(obj, worldX, worldY, zoom, gridSize = 40) {
  const bounds = getObjectBounds(obj)
  const local = toLocal(bounds, obj.rotation, worldX, worldY)
  const z = handleSizes(zoom, gridSize)
  const hs = z.hitHalf

  if (rotateEnabledFor(obj.type)) {
    const { x: rx, y: ry } = rotateHandlePos(bounds, zoom, gridSize)
    const r = z.hitR
    if (Math.hypot(local.x - rx, local.y - ry) <= r) return 'rotate'
  }

  const enabled = enabledHandlesFor(obj.type)
  if (!enabled.length) return null
  const positions = getHandlePositions(bounds, z.pad)
  for (const h of enabled) {
    const hp = positions[h]
    if (!hp) continue
    if (local.x >= hp.x - hs && local.x <= hp.x + hs &&
        local.y >= hp.y - hs && local.y <= hp.y + hs) return h
  }
  return null
}
