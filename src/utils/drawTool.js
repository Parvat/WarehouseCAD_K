// drawTool.js — the drawing tools (D1, docs/EPICS.md; design/drawbar.png): Line, Polyline, Rectangle, Circle, Polygon
// and Text, one shared handler. The Draw bar (canvas2/DrawBar.jsx) opens in the Add door bar's place.
//   Line, Rectangle   a drag, or two clicks
//   Circle            the centre, then the radius (a drag or two clicks)
//   Polyline, Polygon a click per point; a double-click or Enter finishes; Backspace takes the last point off
// Live lengths on every segment; a length typed + Enter sets the one being drawn (a bare number is feet, as every length
// typed in the app; a rectangle takes "W x H" too). Shift keeps 0 / 45 / 90° (a rectangle: a square). Points snap onto
// walls, section and zone edges and rack ends (utils/sectionSnap.js, as the Section tool's), else the grid when it is on;
// Alt held: no snap. Esc ends the tool (a polyline or polygon with enough points is kept). Each shape is ONE undo step.
// (d1-fixes) One shape, then Select (the shape selected): a tool picked with a double-click stays on until Esc (`keep`).
// A polyline / polygon snaps to its first point near it (a closing marker); a click there closes it and finishes it.
// The tool's settings are presentation state (this store), never the canvas store; the shapes themselves are document
// objects on the Notes layer (render/drawnShapes.js draws them, on the canvas and the PDF alike).

import { create } from 'zustand'
import { TOOLS } from '../constants'
import { HOME_TOOL } from './homeTool'
import { snapToGrid } from './canvas'
import { sectionSnapLines, snapSectionEdges, SECTION_SNAP_PX } from './sectionSnap'
import { TEXT_FONT_DEFAULT } from '../theme/tokens'
import { rackFootprint } from '../generate/rackFootprint'

/** The tool ids: the existing ones (Line, Rectangle, Circle, Polygon) and Polyline — all in the rail's Draw flyout. */
export const POLYLINE_TOOL = 'polyline'
export const DRAW_SHAPES = [
  { id: 'line', tool: TOOLS.LINE, label: 'Line' },
  { id: 'polyline', tool: POLYLINE_TOOL, label: 'Polyline' },
  { id: 'rect', tool: TOOLS.SQUARE, label: 'Rectangle' },
  { id: 'circle', tool: TOOLS.CIRCLE, label: 'Circle' },
  { id: 'polygon', tool: TOOLS.POLYGON, label: 'Polygon' },
]
const BY_TOOL = new Map(DRAW_SHAPES.map(s => [s.tool, s.id]))
/** The shape a tool draws ('line' … 'polygon'), or null when it is not a drawing tool. */
export const shapeOfTool = (tool) => BY_TOOL.get(tool) || null
export const isDrawTool = (tool) => BY_TOOL.has(tool)
export const isTextTool = (tool) => tool === TOOLS.TEXT
export const toolOfShape = (id) => DRAW_SHAPES.find(s => s.id === id)?.tool || TOOLS.LINE

/** The swatches the Stroke, Fill and Colour pickers offer (a colour typed is taken too). */
export const DRAW_COLORS = ['#1F2321', '#6B7280', '#E5484D', '#E07B22', '#C9A100', '#27AE60', '#2F80ED', '#9B51E0']

/** The settings (the bar's) and the shape being drawn: `pts` its points so far (world), `at` the pointer's snapped
 *  point, `press` a press not yet released ({ sx, sy } screen), `typed` a length being typed, `guides` the snap guides. */
export const useDrawTool = create(() => ({
  stroke: '#1F2321', strokeWidth: 2, fill: null, dashed: false, closed: false,
  pts: [], at: null, press: null, typed: null, guides: [],
  keep: false,                                        // picked with a double-click: the tool stays on after a shape, until Esc
  closing: false,                                     // the pointer on the first point (a polyline / polygon closes there)
  // the Text tool
  text: null,                                         // { x, y (world: the anchor and the first line's baseline), value }
  textIn: 18, bold: false, italic: false, color: '#1F2321', align: 'left',
}))

/** Drop the shape being drawn (and a text being typed is kept: commitText ends it). */
export function cancelDraw() {
  const s = useDrawTool.getState()
  if (!s.pts.length && !s.press && s.typed == null && !s.guides.length && !s.at && !s.closing) return false
  useDrawTool.setState({ pts: [], at: null, press: null, typed: null, guides: [], closing: false })
  return true
}

/** Pick a drawing tool (the rail's Draw flyout, the Draw bar's shape switch): `keep` — a double-click — leaves it on after
 *  each shape until Esc; a single pick draws one shape, then Select. (Any other tool change clears keep: toolSwitch.js.) */
export function pickDrawTool(store, tool, keep = false) {
  store.getState().setActiveTool(tool)
  useDrawTool.setState({ keep: !!keep })
}
/** The pixels within which a polyline / polygon point snaps to its first point (and closes there). */
export const CLOSE_SNAP_PX = 10
/** Does the shape being drawn close at world `w`: a polyline or polygon with 3 points or more, `w` within
 *  CLOSE_SNAP_PX of its first point? */
export function closesAt(shape, pts, w, zoom = 1) {
  if ((shape !== 'polyline' && shape !== 'polygon') || pts.length < 3 || !w) return false
  return Math.hypot(w.x - pts[0].x, w.y - pts[0].y) <= CLOSE_SNAP_PX / (zoom || 1)
}

/* ── snapping ── */
const E = 1e-9
let linesCache = { objects: null, gs: 0, lines: null }
const linesFor = (objects, gs) => {
  if (linesCache.objects !== objects || linesCache.gs !== gs) {
    const L = sectionSnapLines(objects, new Set(), gs)
    // (dealer audit) drawing snaps to a rack's long faces too, not only its ends — a walkway or a note along a row
    for (const o of objects || []) {
      if (!o || typeof o.type !== 'string' || !o.type.startsWith('rack_') || !(o.width > 0) || !(o.height > 0)) continue
      const f = rackFootprint(o)
      if (f.rotated) { L.x.push({ v: f.x, a: f.y, b: f.y + f.h }); L.x.push({ v: f.x + f.w, a: f.y, b: f.y + f.h }) }
      else { L.y.push({ v: f.y, a: f.x, b: f.x + f.w }); L.y.push({ v: f.y + f.h, a: f.x, b: f.x + f.w }) }
    }
    linesCache = { objects, gs, lines: L }
  }
  return linesCache.lines
}
/** The point for the pointer at world `w`: Shift — on the 0 / 45 / 90° line from `last` (a rectangle: its diagonal at
 *  45°, a square); else onto an edge within 8 screen px (a dashed guide through it), else the grid when it is on.
 *  `st`: { objects, gridSize, snapToGrid, snapUnit }; `alt`: no snap. → { p, guides } */
export function snapPoint(w, { st, zoom = 1, last = null, shift = false, alt = false, shape = 'line' }) {
  const gs = st.gridSize || 40
  if (shift && last) {
    const dx = w.x - last.x, dy = w.y - last.y, r = Math.hypot(dx, dy)
    if (r > E) {
      if (shape === 'rect') { const s = Math.max(Math.abs(dx), Math.abs(dy)); return { p: { x: last.x + Math.sign(dx || 1) * s, y: last.y + Math.sign(dy || 1) * s }, guides: [] } }
      const a = Math.atan2(dy, dx), k = Math.round(a / (Math.PI / 4)) * (Math.PI / 4), t = dx * Math.cos(k) + dy * Math.sin(k)
      return { p: { x: last.x + Math.cos(k) * t, y: last.y + Math.sin(k) * t }, guides: [] }
    }
  }
  if (alt) return { p: w, guides: [] }
  /* (dealer audit) only the lines that run past the pointer (within the snap distance of their extent): a rack face or a
     wall 30 ft away along its own line pulls nothing (was: every line snapped as if endless) */
  const tol = SECTION_SNAP_PX / (zoom || 1), all = linesFor(st.objects, gs)
  const near = { x: all.x.filter(l => w.y >= l.a - tol && w.y <= l.b + tol), y: all.y.filter(l => w.x >= l.a - tol && w.x <= l.b + tol) }
  const r = snapSectionEdges({ x: [w.x], y: [w.y] }, near, tol)
  const grid = (v) => (st.snapToGrid ? snapToGrid(v, gs, st.snapUnit) : v)
  const p = { x: r.dx || r.guides.some(g => g.axis === 'x') ? w.x + r.dx : grid(w.x), y: r.dy || r.guides.some(g => g.axis === 'y') ? w.y + r.dy : grid(w.y) }
  return { p, guides: r.guides }
}

/* ── the shapes as document objects ── */
const style = (s) => ({ stroke: s.stroke, strokeWidth: s.strokeWidth, dashed: !!s.dashed, layerId: 'notes', opacity: 1, rotation: 0 })
const filled = (s) => (s.fill ? { fill: s.fill, noFill: false } : { fill: null, noFill: true })

/** The object for shape `shape` through points `pts` (world), or null when it is too small (under 2 screen px). */
export function shapeObject(shape, pts, s, zoom = 1) {
  const min = 2 / (zoom || 1)
  if (shape === 'line') {
    if (pts.length < 2) return null
    let [a, b] = pts
    if (Math.hypot(b.x - a.x, b.y - a.y) < min) return null
    if (b.x < a.x || (b.x === a.x && b.y < a.y)) [a, b] = [b, a]      // left to right: the left handles move the left end
    return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...style(s), noFill: true }
  }
  if (shape === 'rect') {
    if (pts.length < 2) return null
    const [a, b] = pts, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), width = Math.abs(b.x - a.x), height = Math.abs(b.y - a.y)
    if (width < min || height < min) return null
    return { type: 'rect', x, y, width, height, ...style(s), ...filled(s) }
  }
  if (shape === 'circle') {
    if (pts.length < 2) return null
    const [c, e] = pts, r = Math.hypot(e.x - c.x, e.y - c.y)
    if (r < min) return null
    return { type: 'circle', cx: c.x, cy: c.y, r, rx: r, ry: r, ...style(s), ...filled(s) }
  }
  if (shape === 'polyline' || shape === 'polygon') {
    const closed = shape === 'polygon' || !!s.closed
    if (pts.length < (closed ? 3 : 2)) return null
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x = Math.min(...xs), y = Math.min(...ys)
    const width = Math.max(Math.max(...xs) - x, 1), height = Math.max(Math.max(...ys) - y, 1)
    if (Math.max(...xs) - x < min && Math.max(...ys) - y < min) return null
    return { type: shape, x, y, width, height, w0: width, h0: height, pts: pts.map(p => [p.x - x, p.y - y]), closed, ...style(s), ...(closed ? filled(s) : { fill: null, noFill: true }) }
  }
  return null
}

/** Add the shape — one undo step (the store's addObject); `closed`: a polyline closed on its first point. Then, unless
 *  the tool is kept on (a double-click), Select with the new shape selected. → the new object, or null. */
export function commitShape(store, shape, pts, zoom = 1, newId = null, closed = false) {
  const s = useDrawTool.getState()
  const o = shapeObject(shape, pts, closed ? { ...s, closed: true } : s, zoom)
  useDrawTool.setState({ pts: [], typed: null, press: null, guides: [], closing: false })
  if (!o) return null
  store.getState().addObject(newId ? { ...o, id: newId() } : o)
  const all = store.getState().objects, made = all[all.length - 1]
  if (!s.keep) { store.getState().setActiveTool(TOOLS.SELECT); if (made) store.getState().selectObject(made.id, false) }
  return made
}

/** Feet from a typed length — 25, 25', 25 ft, 24' 9", 24′-9″, 9" (a bare number is feet, as every length typed in the
 *  app — the same reading as ColumnGridPanel's feetOf, kept here so the tool switch needs no panel) — or null. */
export function feetOf(t) {
  const s = String(t ?? '').trim().replace(/′/g, "'").replace(/″/g, '"').replace(/\s*ft\b\.?/gi, "'").replace(/\s*in\b\.?/gi, '"')
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/)
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*"$/))) return Number(m[1]) / 12
  m = s.match(/^(\d+(?:\.\d+)?)$/)
  return m ? Number(m[1]) : null
}

/** How many points finish the shape: Line, Rectangle, Circle 2 — the polylines a double-click / Enter. */
export const twoPoint = (shape) => shape === 'line' || shape === 'rect' || shape === 'circle'

/** A length typed for the segment being drawn, from the last point toward the pointer (feet; a rectangle "W x H" or
 *  "W,H"; a circle its radius) → the point that ends it, or null when it is not a length. */
export function typedPoint(shape, last, at, typed, gs = 40) {
  const t = String(typed || '').trim()
  if (!last || !t) return null
  if (shape === 'rect') {
    const m = t.split(/\s*[x×,*]\s*/i)
    const w = feetOf(m[0]), h = m.length > 1 ? feetOf(m[1]) : null
    if (!(w > 0) || (m.length > 1 && !(h > 0))) return null
    const sx = Math.sign((at?.x ?? last.x + 1) - last.x) || 1, sy = Math.sign((at?.y ?? last.y + 1) - last.y) || 1
    const hh = h != null ? h * gs : (at && Math.abs(at.y - last.y) > E ? Math.abs(at.y - last.y) : w * gs)
    return { x: last.x + sx * w * gs, y: last.y + sy * hh }
  }
  const ft = feetOf(t)
  if (!(ft > 0)) return null
  let dx = (at?.x ?? last.x + 1) - last.x, dy = (at?.y ?? last.y) - last.y
  const r = Math.hypot(dx, dy)
  if (r < E) { dx = 1; dy = 0 } else { dx /= r; dy /= r }
  return { x: last.x + dx * ft * gs, y: last.y + dy * ft * gs }
}

/** The end of the tool (Esc, Done, ✕): a polyline / polygon with enough points is kept, the rest dropped. */
export function endDraw(store, shape, zoom = 1) {
  const s = useDrawTool.getState()
  const made = (shape === 'polyline' || shape === 'polygon') && s.pts.length ? commitShape(store, shape, s.pts, zoom) : null
  cancelDraw()
  useDrawTool.setState({ keep: false })
  // a shape finished by it: Select, the shape selected (as any shape finished); else the home tool
  if (made) { store.getState().setActiveTool(TOOLS.SELECT); store.getState().selectObject(made.id, false) }
  else store.getState().setActiveTool(HOME_TOOL)
}

/** (dealer audit) A drawn circle resized by a handle: it stays a circle, the side (or corner) opposite the handle held —
 *  a side handle sets the diameter along its axis, a corner the larger of the two (was: the box resize made it an
 *  ellipse about a fixed centre). → { cx, cy, r, rx, ry } */
export function resizeCircle(o, handle, dx, dy) {
  const r0 = Number.isFinite(o.rx) ? o.rx : o.r || 0
  const x0 = o.cx - r0, x1 = o.cx + r0, y0 = o.cy - r0, y1 = o.cy + r0
  const L = handle.includes('l'), R = handle.includes('r'), T = handle.includes('t'), Bm = handle.includes('b')
  const w = R ? x1 + dx - x0 : L ? x1 - (x0 + dx) : null, h = Bm ? y1 + dy - y0 : T ? y1 - (y0 + dy) : null
  const d = Math.max(1, w != null && h != null ? Math.max(Math.abs(w), Math.abs(h)) : Math.abs(w ?? h ?? r0 * 2))
  const cx = L ? x1 - d / 2 : R ? x0 + d / 2 : o.cx, cy = T ? y1 - d / 2 : Bm ? y0 + d / 2 : o.cy
  return { cx, cy, r: d / 2, rx: d / 2, ry: d / 2 }
}

/* ── the Text tool ── */
/** (d1-fixes) Turn the texts `ids` a quarter turn clockwise (90° steps: 0, 90, 180, 270) — one undo step. */
export function rotateTexts(store, ids) {
  const st = store.getState(), texts = ids.map(id => st.objects.find(o => o.id === id)).filter(o => o && o.type === 'text' && !o.locked)
  if (!texts.length) return false
  for (const t of texts) st.updateObject(t.id, { rotation: ((Math.round((t.rotation || 0) / 90) * 90 + 90) % 360 + 360) % 360 })
  store.getState().commitObjectUpdate(texts[texts.length - 1].id, {})
  return true
}
/** A text object's fields from the Text bar's settings (`textIn`: the real text height, inches — CLAUDE.md Rule 8). */
export function textFields(s, gs = 40) {
  return { fontSize: (s.textIn / 12) * gs, textIn: s.textIn, bold: !!s.bold, italic: !!s.italic, fill: s.color, align: s.align, lineHeight: 1.25, fontFamily: TEXT_FONT_DEFAULT }
}
/** Start a text at world `w` (its anchor; the first line's baseline one text height below the click). */
export function startText(w, gs = 40) {
  const s = useDrawTool.getState()
  useDrawTool.setState({ text: { x: w.x, y: w.y + (s.textIn / 12) * gs, value: '' } })
}
/** The text being typed added — one undo step — or dropped when empty. → the new object, or null. */
export function commitText(store, newId = null) {
  const s = useDrawTool.getState(), t = s.text
  useDrawTool.setState({ text: null })
  if (!t || !String(t.value).trim()) return null
  const gs = store.getState().gridSize || 40
  store.getState().addObject({ type: 'text', x: t.x, y: t.y, text: String(t.value).replace(/\s+$/, ''), ...textFields(s, gs), layerId: 'notes', opacity: 1, rotation: 0, ...(newId ? { id: newId() } : null) })
  const all = store.getState().objects
  return all[all.length - 1]
}

/** (D1) A text resized by a corner handle: its text height scales with the box (the opposite corner stays) — the
 *  canvas's resize (canvas2/useCanvasInteraction.js) asks this instead of the box resize a text has no fields for. */
export function resizeText(o, handle, dx, dy, bounds) {
  const b = bounds, fs = o.fontSize || 14
  if (!b || !(b.height > 0)) return {}
  const grow = (handle.includes('b') ? dy : -dy) / b.height, growX = (handle.includes('r') ? dx : -dx) / Math.max(b.width, 1)
  const k = Math.max(0.1, 1 + (Math.abs(growX) > Math.abs(grow) ? growX : grow))
  const nw = b.width * k, nh = b.height * k, nf = fs * k
  const x0 = handle.includes('l') ? b.x + b.width - nw : b.x, y0 = handle.includes('t') ? b.y + b.height - nh : b.y
  const x = o.align === 'center' ? x0 + nw / 2 : o.align === 'right' ? x0 + nw : x0
  const textIn = Math.round((o.textIn || (fs / 40) * 12) * k * 100) / 100
  return { x, y: y0 + nf, fontSize: nf, textIn }
}
