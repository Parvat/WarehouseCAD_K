/* ═══════════════════════════════════════════════════════════════════════════
   ARROWHEAD GEOMETRY — pure functions, WORLD units throughout.

   Nothing here knows about zoom. The canvas renders objects inside a group
   that already carries the zoom transform, so a number returned from this
   file IS a world unit: an arrowhead keeps its size relative to the drawing
   instead of the screen, which is what a CAD drawing needs.

   Caps are per-END (`startCap` / `endCap`), so a double-ended arrow or a
   reversed one falls out of the same code rather than needing its own type.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CAP_KINDS = ['none', 'arrow', 'triangle', 'open-arrow', 'bar', 'circle']

/** Default head length in WORLD units, and the half-angle of the barbs. */
export const HEAD_LEN_WORLD = 12
export const HEAD_ANGLE_DEG = 30

/**
 * Head length for a given stroke weight.
 * A fixed 12 would be swallowed by a heavy stroke, so the head grows once the
 * stroke gets thick enough to clip it. At the 1.5 default this returns 12.
 */
export function headLength(strokeWidth = 1.5, baseLen = HEAD_LEN_WORLD) {
  return Math.max(baseLen, Math.max(strokeWidth, 0.1) * 5)
}

/** Unit vector p1→p2, with a safe fallback when the points coincide. */
export function unitVec(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  return len < 1e-6 ? { ux: 1, uy: 0, len: 0 } : { ux: dx / len, uy: dy / len, len }
}

/** Vector angle, the θ = atan2(Δy, Δx) the heads are built from. */
export const vectorAngle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1)

/* arcPath() places its control point on the chord's perpendicular bisector at
   `bend` × chord length. The tangent at each end therefore points at that
   control point, so an arc's heads follow the curve rather than the chord. */
export function arcTangent(x1, y1, x2, y2, bend = 0.35, atEnd = false) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const { ux, uy, len } = unitVec(x1, y1, x2, y2)
  const cx = mx - uy * bend * len
  const cy = my + ux * bend * len
  return atEnd ? unitVec(cx, cy, x2, y2) : unitVec(x1, y1, cx, cy)
}

/**
 * One end cap, in the object's LOCAL space.
 *
 * On rotation: the caller draws this inside the same group that carries the
 * object's rotate() transform, so the head rotates with the body and stays
 * oriented. Working in local space is the counter-rotation — we never leave
 * it. (Counter-rotating a *screen* point into local space is the hit-test
 * problem, and objectContains already solves that.)
 *
 * `ux,uy` must point OUTWARD along the stroke at that end.
 * Returns null for 'none', else { kind, filled, d } or a circle spec.
 */
export function capGeometry(kind, x, y, ux, uy, strokeWidth = 1.5, baseLen = HEAD_LEN_WORLD) {
  if (!kind || kind === 'none') return null
  const w = Math.max(strokeWidth, 0.1)
  const L = headLength(w, baseLen)
  const H = L * Math.tan((HEAD_ANGLE_DEG * Math.PI) / 180)   // half-width at 30°

  const bx = x - ux * L, by = y - uy * L      // base of the head, back along θ
  const px = -uy * H,    py = ux * H          // perpendicular half-span

  switch (kind) {
    case 'arrow':          // filled, barbed — notched base reads as an arrow
    case 'triangle': {     // filled, flat base
      const notch = kind === 'arrow' ? L * 0.28 : 0
      const nx = bx + ux * notch, ny = by + uy * notch
      return { kind, filled: true,
        d: `M ${x} ${y} L ${bx + px} ${by + py} L ${nx} ${ny} L ${bx - px} ${by - py} Z` }
    }
    case 'open-arrow':     // two unfilled barbs
      return { kind, filled: false,
        d: `M ${bx + px} ${by + py} L ${x} ${y} L ${bx - px} ${by - py}` }
    case 'bar':            // perpendicular tick
      return { kind, filled: false,
        d: `M ${x + px} ${y + py} L ${x - px} ${y - py}` }
    case 'circle':
      return { kind, filled: true, circle: true, cx: x, cy: y, r: w * 1.8 }
    default:
      return null
  }
}

/**
 * Outward directions at both ends of a two-point object.
 * Straight lines use the chord; arcs use the curve tangent.
 */
export function endDirections(obj) {
  const { x1, y1, x2, y2 } = obj
  if (obj.type === 'arc') {
    const bend = obj.bend ?? 0.35
    const s = arcTangent(x1, y1, x2, y2, bend, false)
    const e = arcTangent(x1, y1, x2, y2, bend, true)
    return { start: { ux: -s.ux, uy: -s.uy }, end: { ux: e.ux, uy: e.uy } }
  }
  const f = unitVec(x1, y1, x2, y2)
  return { start: { ux: -f.ux, uy: -f.uy }, end: { ux: f.ux, uy: f.uy } }
}

/* ── tool defaults ─────────────────────────────────────────────────────────
   Presentation state: what the NEXT stroke will look like, not document
   state, so localStorage rather than the canvas store. */
export const ARROW_PREFS_KEY = 'trace.arrow.v1'
export const DEFAULT_ARROW_PREFS = {
  headLen:  HEAD_LEN_WORLD,   // world units
  filled:   true,             // filled triangle vs open barbs
  startCap: 'none',
  endCap:   'arrow',
}
export function loadArrowPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARROW_PREFS_KEY))
    return raw && typeof raw === 'object' ? { ...DEFAULT_ARROW_PREFS, ...raw } : { ...DEFAULT_ARROW_PREFS }
  } catch { return { ...DEFAULT_ARROW_PREFS } }
}
export function saveArrowPrefs(p) {
  try { localStorage.setItem(ARROW_PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
}
