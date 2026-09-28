// render/pixelSnap.js — rack lines on whole device pixels.
//
// Rack borders and upright frames are drawn at their ACTUAL size (world
// units, so they scale with the zoom) but never thinner than 1 screen px, so
// bay lines and rack outlines stay visible zoomed out. Every edge is snapped
// to a whole device pixel, so a line is either fully painted or not painted —
// crisp at every zoom, never a two-pixel grey smear.
//
// Works in DEVICE space: `m` is the canvas's full transform (stage pan and
// zoom, the rack's own rotation, the pixel ratio), as { a, b, c, d, e, f }
// mapping world (x, y) -> (a·x + c·y + e, b·x + d·y + f). Snapping only
// makes sense when that transform keeps rects axis-aligned (rotation a
// multiple of 90°); the caller falls back to world-space drawing otherwise.
// Pure: no canvas, no React.

const EPS = 1e-9

/** True when the transform maps axis-aligned rects to axis-aligned rects. */
export function isAxisAligned(m) {
  return (Math.abs(m.b) < EPS && Math.abs(m.c) < EPS) || (Math.abs(m.a) < EPS && Math.abs(m.d) < EPS)
}

/** World px -> device px scale of the transform. */
export function deviceScale(m) {
  return Math.hypot(m.a, m.b)
}

/** The 1-screen-px floor in device px: one CSS pixel, a whole device pixel. */
export function minDevicePx(pixelRatio = 1) {
  return Math.max(1, Math.round(pixelRatio))
}

/** A world rect's box in device space, for an axis-aligned transform (the
 *  only kind that is snapped): two opposite corners fix it exactly. No
 *  arrays — this runs for every upright of every rack on every redraw. */
export function deviceBox(m, x, y, w, h) {
  const ax = m.a * x + m.c * y + m.e, ay = m.b * x + m.d * y + m.f
  const X = x + w, Y = y + h
  const bx = m.a * X + m.c * Y + m.e, by = m.b * X + m.d * Y + m.f
  return { x0: ax < bx ? ax : bx, y0: ay < by ? ay : by, x1: ax < bx ? bx : ax, y1: ay < by ? by : ay }
}

/** A line's device width: its actual width, rounded to whole device px,
 *  never under the floor. */
export function lineDevicePx(widthWorld, scale, minPx = 1) {
  return Math.max(minPx, Math.round(widthWorld * scale))
}

/** A stroked border (centred on the rect's edges, `widthWorld` wide) as
 *  whole-device-pixel fill rects: top, bottom, left, right strips — or one
 *  solid rect when the rack is too small on screen to have an inside. */
export function snapBorderRects(m, rect, widthWorld, minPx = 1) {
  const b = deviceBox(m, rect.x, rect.y, rect.w, rect.h)
  const px = lineDevicePx(widthWorld, deviceScale(m), minPx)
  const L = Math.round(b.x0 - px / 2), R = Math.round(b.x1 - px / 2)
  const T = Math.round(b.y0 - px / 2), B = Math.round(b.y1 - px / 2)
  const W = R + px - L, H = B + px - T
  if (R - L <= px || B - T <= px) return [{ x: L, y: T, w: Math.max(W, px), h: Math.max(H, px) }]
  return [
    { x: L, y: T, w: W, h: px },                // top
    { x: L, y: B, w: W, h: px },                // bottom
    { x: L, y: T + px, w: px, h: B - T - px },  // left
    { x: R, y: T + px, w: px, h: B - T - px },  // right
  ]
}

/** A filled rect (an upright frame) at its actual size on whole device
 *  pixels, each side at least the floor wide. */
export function snapFillRect(m, rect, minPx = 1) {
  const b = deviceBox(m, rect.x, rect.y, rect.w, rect.h)
  const axis = (lo, hi) => {
    let a = Math.round(lo), z = Math.round(hi)
    if (z - a < minPx) { a = Math.round((lo + hi) / 2 - minPx / 2); z = a + minPx }
    return [a, z]
  }
  const [x0, x1] = axis(b.x0, b.x1), [y0, y1] = axis(b.y0, b.y1)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
