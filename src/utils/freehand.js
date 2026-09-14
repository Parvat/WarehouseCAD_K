import { getStroke } from 'perfect-freehand'

/* ═══════════════════════════════════════════════════════════════════════════
   FREEHAND — point-stream simplification and path generation.

   Everything here is WORLD units. The raw stream is captured in world coords
   at source, so a stroke keeps its shape under pan and zoom and survives
   save/load without a conversion step anywhere.

   Pure functions only: no React, no store, no DOM. That keeps the geometry
   testable on its own and lets the recogniser in Phase 3 reuse it.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Ramer–Douglas–Peucker ─────────────────────────────────────────────────
   A pointermove stream is 200-600 points for a short stroke, nearly all of
   them redundant. Committing raw would bloat every .wcad and slow hit
   testing. Tolerance is in WORLD units so simplification is consistent
   regardless of the zoom the stroke happened to be drawn at. */

function perpDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  /* clamped projection — a true segment distance, not an infinite-line one,
     so endpoints of a tight curl are not discarded */
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/* RDP alone is O(n²) in the worst case — a zigzag keeps every point, so the
   inner scan reruns over the full span. A pointermove stream also arrives
   with many near-duplicate samples. Both are handled before RDP sees the
   data: a linear radial pass drops samples closer together than the
   tolerance, then a uniform decimation caps the input so the quadratic term
   can never run away on a pathological stroke. */
const MAX_RDP_POINTS = 4000

function radialPass(points, tolerance) {
  const t2 = tolerance * tolerance
  const out = [points[0]]
  let prev = points[0]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const dx = p.x - prev.x, dy = p.y - prev.y
    if (dx * dx + dy * dy > t2) { out.push(p); prev = p }
  }
  out.push(points[points.length - 1])
  return out
}

function decimate(points, max) {
  if (points.length <= max) return points
  const step = points.length / max
  const out = []
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)])
  out.push(points[points.length - 1])
  return out
}

/** Iterative RDP — recursion would blow the stack on a long stroke. */
export function simplify(points, tolerance = 1.2) {
  if (!points || points.length < 3) return points ? [...points] : []

  points = decimate(radialPass(points, tolerance), MAX_RDP_POINTS)
  const n = points.length
  if (n < 3) return [...points]

  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack = [[0, n - 1]]

  while (stack.length) {
    const [first, last] = stack.pop()
    let maxDist = 0, idx = -1
    for (let i = first + 1; i < last; i++) {
      const d = perpDistance(points[i], points[first], points[last])
      if (d > maxDist) { maxDist = d; idx = i }
    }
    if (maxDist > tolerance && idx !== -1) {
      keep[idx] = 1
      stack.push([first, idx], [idx, last])
    }
  }
  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i])
  return out
}

/* ── live stroke accumulator ──────────────────────────────────────────────
   Two problems this solves, both of which make a stroke "dance" while drawing.

   1. Raw pointermove fires on sub-pixel movement, so hand tremor lands in the
      point array as noise. `add` drops a sample that has not travelled far
      enough from the previous one.

   2. RDP is a GLOBAL algorithm — its output changes as the input grows, so
      re-simplifying the whole stream each frame can drop or restore points
      near the start and visibly shift parts of the line you drew seconds ago.
      Everything except the tip is therefore frozen: once a chunk is folded
      into `frozen` it is never recomputed, and only the short tail is
      re-smoothed each frame.

   The rendered array is exactly what gets committed, so freezing costs no
   fidelity and the stroke cannot re-shape on pointerup.                     */
export function createStrokeAccumulator() {
  /* APPEND-ONLY. Nothing recorded is ever recomputed, re-simplified or
     reordered, so a point cannot move once it has been drawn.

     An earlier version re-simplified a rolling tail each frame. That still
     let RDP drop and restore points inside the tail window: measured, an
     already-drawn point moved on 9 of 29 frames — visible as the line
     shifting under the cursor. Thinning is now done entirely by the distance
     gate on the way in, which is a local decision about one sample and can
     never disturb its neighbours. */
  const pts = []

  return {
    /** @param minDist world-unit gate; caller passes screenPx / zoom.
     *  @param force  bypass the gate (used for the final pointerup sample). */
    add(p, minDist = 0, force = false) {
      const prev = pts[pts.length - 1]
      /* An exact repeat is always rejected, force or not. pointerup forces the
         final sample in, and without this it would duplicate a point the gate
         had already accepted — leaving the committed array one longer than the
         last drawn frame, and a zero-length segment in the saved file. */
      if (prev && prev.x === p.x && prev.y === p.y) return false
      if (!force && prev && minDist > 0 &&
          Math.hypot(p.x - prev.x, p.y - prev.y) <= minDist) return false
      pts.push(p)
      return true
    },
    /**
     * What to DRAW. `live` is the current pointer position: the gate means the
     * last recorded sample can trail the cursor by up to minDist, which reads
     * as the tip lagging and snapping forward. Drawing to the live position
     * keeps the stroke under the cursor without recording tremor. It is a
     * display-only point — pointerup records the final position for real, so
     * the committed array still matches the last frame exactly.
     */
    points(live) {
      if (!live) return pts.slice()
      const prev = pts[pts.length - 1]
      if (prev && prev.x === live.x && prev.y === live.y) return pts.slice()
      return pts.concat([live])
    },
    get size() { return pts.length },
  }
}

/* ── pen types ────────────────────────────────────────────────────────────
   Width ranges and feel per the CAD spec. `alpha` is baked as a flat opacity
   rather than mix-blend-mode: this project has no export path yet, and a
   blend mode that survives on screen but not in an exported drawing is worse
   than one that never varies. Revisit if export lands as a raster pipeline. */
export const PEN_TYPES = {
  pencil:      { label:'Pencil',      min:1,  max:5,  width:2,   thinning:0.35, smoothing:0.35, streamline:0.20, alpha:1,   pressure:true  },
  marker:      { label:'Marker',      min:4,  max:16, width:8,   thinning:0.22, smoothing:0.45, streamline:0.25, alpha:1,   pressure:true  },
  highlighter: { label:'Highlighter', min:12, max:32, width:20,  thinning:0,    smoothing:0.5,  streamline:0.30, alpha:0.4, pressure:false },
  technical:   { label:'Technical',   min:1,  max:4,  width:1.5, thinning:0,    smoothing:0.4,  streamline:0.25, alpha:1,   pressure:false },
}
export const PEN_ORDER = ['pencil', 'marker', 'highlighter', 'technical']
export const clampPenWidth = (pen, w) => {
  const p = PEN_TYPES[pen] || PEN_TYPES.pencil
  return Math.max(p.min, Math.min(p.max, w))
}
/** Default width for a preset — used when switching pens, so the slider lands
 *  somewhere sensible in the new range instead of pinning to a clamped edge. */
export const penDefaultWidth = pen => (PEN_TYPES[pen] || PEN_TYPES.pencil).width

/**
 * Outline path for a pressure-style pen.
 * perfect-freehand returns a polygon hugging the stroke, which we render as a
 * FILLED path — that is what gives variable width. Technical Vector does not
 * use this; it is a constant-width stroked polyline instead (see linePath).
 */
export function strokeOutlinePath(points, { pen = 'pencil', width, cap = 'round', simulatePressure = true } = {}) {
  if (!points || points.length === 0) return ''
  const cfg = PEN_TYPES[pen] || PEN_TYPES.pencil
  const size = width ?? cfg.width
  /* A variable-width mesh stroke has no strokeLinecap — the cap is baked into
     the outline polygon. perfect-freehand offers rounded or flat only, so
     'round' maps to a rounded cap and butt/square both flatten it. */
  const rounded = cap === 'round'
  const input = points.map(p => [p.x, p.y, p.pressure ?? 0.5])

  const outline = getStroke(input, {
    size,
    thinning:   cfg.pressure ? cfg.thinning : 0,
    smoothing:  cfg.smoothing,
    streamline: cfg.streamline,
    simulatePressure: cfg.pressure && simulatePressure,
    last: true,
    start: { cap: rounded },
    end:   { cap: rounded },
  })
  if (!outline.length) return ''

  /* quadratic mid-point smoothing round the outline, then close it */
  let d = `M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)}`
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[(i + 1) % outline.length]
    d += ` Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`
  }
  return d + ' Z'
}

/** Constant-width polyline — Technical Vector, and the recogniser's raw view. */
export function linePath(points) {
  if (!points || points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }
  return points.reduce((d, p, i) =>
    d + `${i ? ' L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`, '')
}

/** Axis-aligned bounds of a point stream, for hit testing and selection. */
export function pointsBounds(points) {
  if (!points?.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) }
}

/* ── tool defaults ────────────────────────────────────────────────────────
   Presentation state — what the next stroke will look like. localStorage,
   never the canvas store. The style of a committed stroke lives on it. */
export const PEN_PREFS_KEY = 'trace.pen.v1'
export const DEFAULT_PEN_PREFS = {
  pen:       'pencil',
  width:     2,   // = PEN_TYPES.pencil.width
  color:     null,      // null = fall through to the store's strokeColor
  cap:       'round',   // round | square | butt
  join:      'round',   // round | miter | bevel
  simplify:  0.6,       // RDP tolerance, world units — gentle on purpose
  recognize: false,     // Phase 3 — smart shape recognition, opt-in
}
export function loadPenPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PEN_PREFS_KEY))
    return raw && typeof raw === 'object' ? { ...DEFAULT_PEN_PREFS, ...raw } : { ...DEFAULT_PEN_PREFS }
  } catch { return { ...DEFAULT_PEN_PREFS } }
}
export function savePenPrefs(p) {
  try { localStorage.setItem(PEN_PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
}
