// drawTool.js — the drawing tools (D1, docs/EPICS.md; design/drawbar.png and the d1-final mockups — Rectangle, Line,
// Polyline): Line, Polyline, Rectangle, Circle and Text, one shared handler. The Draw bar (canvas2/DrawBar.jsx) opens in
// the Add door bar's place.
//   Line, Rectangle   a drag, or two clicks (a rectangle dragged under 6″ is a click: the second click ends it)
//   Circle            the centre, then the radius (a drag or two clicks); "R 9" or "D 18" typed (a bare number: the radius)
//   Polyline          a click per point; a double-click or Enter finishes; Backspace takes the last point off; near the
//                     first point it snaps there (a green ring, "close") and a click closes it
// Live lengths on every segment, the angle at the pointer; a length typed + Enter sets the one being drawn (a bare
// number is feet, as every length typed in the app; "30<45" is 30 ft at 45°; a rectangle takes "W x H"). Shift keeps
// 0 / 45 / 90° (a rectangle: a square). Points snap onto walls, section and zone edges, rack ends and faces, drawn
// shapes' edges and their endpoints — a ring and what it snapped to ("wall face") — else the grid when it is on; Alt
// held: no snap. Lines under 3″ and circles under 3″ radius are refused (a notice). Esc cancels the shape being drawn
// and ends the tool (Done keeps a polyline drawn so far). Each shape is ONE undo step; one shape, then Select (the shape selected) — a tool picked with
// a double-click stays on until Esc (`keep`). The Polygon tool is gone (d1-final): a closed polyline is the shape; a
// saved polygon loads as one (utils/saveLoad.js).
// The tool's settings are presentation state (this store), never the canvas store; the shapes themselves are document
// objects on the Notes layer (render/drawnShapes.js draws them, on the canvas and the PDF alike).

import { create } from 'zustand'
import { TOOLS } from '../constants'
import { HOME_TOOL } from './homeTool'
import { snapToGrid, getObjectBounds } from './canvas'
import { SECTION_SNAP_PX } from './sectionSnap'
import { TEXT_FONT_DEFAULT } from '../theme/tokens'
import { rackFootprint } from '../generate/rackFootprint'
import { innerOutline } from './floorGeom'
import { isSection, polygonOf } from './sectionAreas'
import { notify } from './notice'
import { isDrawn, drawnGeom, withPoints, shapePoints, BLOCK_FT } from '../render/drawnShapes'

/** The tool ids: Line, Polyline, Rectangle, Circle — all in the rail's Draw flyout, with Text. */
export const POLYLINE_TOOL = 'polyline'
/** (d2-arrows) Arrow (a line with an arrowhead), Elbow arrow (two right-angle segments), Block arrow (a wide filled one) */
export const ARROW_TOOL = 'draw_arrow', ELBOW_TOOL = 'elbow_arrow', BLOCK_TOOL = 'block_arrow'
export const DRAW_SHAPES = [
  { id: 'line', tool: TOOLS.LINE, label: 'Line' },
  { id: 'arrow', tool: ARROW_TOOL, label: 'Arrow' },
  { id: 'elbow', tool: ELBOW_TOOL, label: 'Elbow arrow' },
  { id: 'block', tool: BLOCK_TOOL, label: 'Block arrow' },
  { id: 'polyline', tool: POLYLINE_TOOL, label: 'Polyline' },
  { id: 'rect', tool: TOOLS.SQUARE, label: 'Rectangle' },
  { id: 'circle', tool: TOOLS.CIRCLE, label: 'Circle' },
]
const BY_TOOL = new Map(DRAW_SHAPES.map(s => [s.tool, s.id]))
/** The shape a tool draws ('line' … 'circle'), or null when it is not a drawing tool. */
export const shapeOfTool = (tool) => BY_TOOL.get(tool) || null
export const isDrawTool = (tool) => BY_TOOL.has(tool)
export const isTextTool = (tool) => tool === TOOLS.TEXT
export const toolOfShape = (id) => DRAW_SHAPES.find(s => s.id === id)?.tool || TOOLS.LINE

/** The swatches the Stroke, Fill and Colour pickers offer (a colour typed is taken too). */
// (d1-bar, design/selbar.png) two rows of six: ink, grey, red, orange, yellow, green / sky, blue, purple, pink, white, light grey
export const DRAW_COLORS = ['#1F2321', '#6B7280', '#E5484D', '#E07B22', '#C9A100', '#27AE60', '#0EA5E9', '#2F80ED', '#9B51E0', '#EC4899', '#FFFFFF', '#9CA3AF']

/** The smallest a line may be and a circle's radius (inches), and a rectangle drag that is still a click. */
export const MIN_LINE_IN = 3, MIN_RADIUS_IN = 3, RECT_CLICK_IN = 6

/** The settings (the bar's) and the shape being drawn: `pts` its points so far (world), `at` the pointer's snapped
 *  point, `snap` what it snapped to ('wall face' … or null), `press` a press not yet released ({ sx, sy } screen),
 *  `typed` a length being typed, `guides` the snap guides. */
export const useDrawTool = create(() => ({
  stroke: '#1F2321', strokeWidth: 2, fill: null, dashed: false, closed: false,
  pts: [], at: null, snap: null, press: null, typed: null, guides: [],
  keep: false,                                        // picked with a double-click: the tool stays on after a shape, until Esc
  closing: false,                                     // the pointer on the first point (a polyline closes there)
  // the Text tool
  text: null,                                         // { x, y (world: the anchor and the first line's baseline), value, width?, id? (a text edited) }
  textPress: null,                                    // a press of the Text tool not yet released: { w (world), sx, sy } — a drag sets a wrap width
  textIn: 18, bold: false, italic: false, color: '#1F2321', align: 'left',
  // (d2-arrows) a block arrow's body width (ft, real size) and fill; an elbow's first leg ('h' | 'v' — the way the pointer
  // first leaves its start), null until it does
  blockFt: BLOCK_FT, blockFill: '#E07B22', lead: null,
}))
/** (d2-arrows) The elbow being drawn: its first leg, from the way the pointer first leaves the start (6 screen px). */
export function noteLead(shape, zoom = 1) {
  const s = useDrawTool.getState()
  if (shape !== 'elbow' || s.pts.length !== 1 || s.lead || !s.at) return
  const dx = s.at.x - s.pts[0].x, dy = s.at.y - s.pts[0].y
  if (Math.hypot(dx, dy) * (zoom || 1) >= 6) useDrawTool.setState({ lead: Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v' })
}

/** (d1-final) The point picked on a selected polyline (a click on it): Delete takes it off. */
export const useShapePoint = create(() => ({ id: null, i: null }))
export const clearShapePoint = () => { if (useShapePoint.getState().id) useShapePoint.setState({ id: null, i: null }) }

/** Drop the shape being drawn (and a text being typed is kept: commitText ends it). */
export function cancelDraw() {
  const s = useDrawTool.getState()
  if (!s.pts.length && !s.press && s.typed == null && !s.guides.length && !s.at && !s.closing && !s.snap) return false
  useDrawTool.setState({ pts: [], at: null, snap: null, press: null, typed: null, guides: [], closing: false, lead: null })
  return true
}

/** Pick a drawing tool (the rail's Draw flyout, the Draw bar's shape switch): `keep` — a double-click — leaves it on after
 *  each shape until Esc; a single pick draws one shape, then Select. (Any other tool change clears keep: toolSwitch.js.) */
export function pickDrawTool(store, tool, keep = false) {
  store.getState().setActiveTool(tool)
  useDrawTool.setState({ keep: !!keep })
}
/** The pixels within which a polyline point snaps to its first point (and closes there). */
export const CLOSE_SNAP_PX = 10
/** Does the shape being drawn close at world `w`: a polyline with 3 points or more, `w` within CLOSE_SNAP_PX of its
 *  first point? */
export function closesAt(shape, pts, w, zoom = 1) {
  if (shape !== 'polyline' || pts.length < 3 || !w) return false
  return Math.hypot(w.x - pts[0].x, w.y - pts[0].y) <= CLOSE_SNAP_PX / (zoom || 1)
}

/* ── snapping ── */
const E = 1e-9
/** What the drawing tools snap to, each with the words the ring's label shows: lines { v, a, b, kind } along x and y
 *  (walls' inner faces, section and zone edges, rack ends and faces, drawn rectangles' edges) and points { x, y, kind }
 *  (drawn shapes' endpoints and corners). `skip`: an object left out (the one being edited). */
export function drawSnapTargets(objects, gs = 40, skip = null) {
  const x = [], y = [], pts = []
  const seg = (p, q, kind) => {
    if (Math.abs(p.x - q.x) < E) x.push({ v: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y), kind })
    else if (Math.abs(p.y - q.y) < E) y.push({ v: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x), kind })
  }
  const ring = (P, kind) => P.forEach((c, i) => seg(c, P[(i + 1) % P.length], kind))
  for (const o of objects || []) {
    if (!o || o.id === skip || typeof o.type !== 'string') continue
    if (isSection(o)) ring(polygonOf(o).map(([px, py]) => ({ x: px, y: py })), 'section edge')
    else if (o.type.startsWith('fp_')) { const P = innerOutline(o, gs); if (P && P.length) ring(P, 'wall face') }
    else if (o.type.startsWith('zone_') && o.width > 0 && o.height > 0) ring([{ x: o.x, y: o.y }, { x: o.x + o.width, y: o.y }, { x: o.x + o.width, y: o.y + o.height }, { x: o.x, y: o.y + o.height }], 'zone edge')
    else if (o.type.startsWith('rack_') && o.width > 0 && o.height > 0) {
      const f = rackFootprint(o), xs = [f.x, f.x + f.w], ys = [f.y, f.y + f.h]
      for (const v of xs) x.push({ v, a: f.y, b: f.y + f.h, kind: f.rotated ? 'rack face' : 'rack end' })
      for (const v of ys) y.push({ v, a: f.x, b: f.x + f.w, kind: f.rotated ? 'rack end' : 'rack face' })
    } else if (o.type === 'block_arrow' && Number.isFinite(o.x1)) {
      pts.push({ x: o.x1, y: o.y1, kind: 'endpoint' }, { x: o.x2, y: o.y2, kind: 'endpoint' })   // (d2-arrows) its tail and head
    } else if (isDrawn(o)) {
      const g = drawnGeom(o)
      if (g.kind === 'ellipse') { pts.push({ x: g.cx, y: g.cy, kind: 'centre' }); continue }
      for (const [px, py] of g.pts) pts.push({ x: px, y: py, kind: 'endpoint' })
      if (o.type === 'rect') ring(g.pts.map(([px, py]) => ({ x: px, y: py })), 'edge')
    }
  }
  return { x, y, pts }
}
let snapCache = { objects: null, gs: 0, skip: null, t: null }
const targetsFor = (objects, gs, skip) => {
  if (snapCache.objects !== objects || snapCache.gs !== gs || snapCache.skip !== skip) snapCache = { objects, gs, skip, t: drawSnapTargets(objects, gs, skip) }
  return snapCache.t
}
/** The point for the pointer at world `w`: Shift — on the 0 / 45 / 90° line from `last` (a rectangle: its diagonal at
 *  45°, a square); else onto an endpoint within 8 screen px, else onto the lines that run past the pointer within 8 px
 *  (a dashed guide through it — only lines whose extent the pointer is beside: a face 30 ft along its own line pulls
 *  nothing), else the grid when it is on. `st`: { objects, gridSize, snapToGrid, snapUnit }; `alt`: no snap; `skip`: an
 *  object not snapped to. → { p, guides, snap: what it snapped to ('wall face', 'endpoint' … or null) } */
export function snapPoint(w, { st, zoom = 1, last = null, shift = false, alt = false, shape = 'line', skip = null }) {
  const gs = st.gridSize || 40
  if (shift && last) {
    const dx = w.x - last.x, dy = w.y - last.y, r = Math.hypot(dx, dy)
    if (r > E) {
      if (shape === 'rect') { const s = Math.max(Math.abs(dx), Math.abs(dy)); return { p: { x: last.x + Math.sign(dx || 1) * s, y: last.y + Math.sign(dy || 1) * s }, guides: [], snap: null } }
      const a = Math.atan2(dy, dx), k = Math.round(a / (Math.PI / 4)) * (Math.PI / 4), t = dx * Math.cos(k) + dy * Math.sin(k)
      return { p: { x: last.x + Math.cos(k) * t, y: last.y + Math.sin(k) * t }, guides: [], snap: null }
    }
  }
  if (alt) return { p: w, guides: [], snap: null }
  const tol = SECTION_SNAP_PX / (zoom || 1), T = targetsFor(st.objects, gs, skip)
  // an endpoint first
  let bp = null
  for (const q of T.pts) { const d = Math.hypot(q.x - w.x, q.y - w.y); if (d <= tol && (!bp || d < bp.d)) bp = { ...q, d } }
  if (bp) return { p: { x: bp.x, y: bp.y }, guides: [], snap: bp.kind }
  // the lines running past the pointer
  const best = (ls, v, along) => {
    let b = null
    for (const l of ls) { if (along < l.a - tol || along > l.b + tol) continue; const d = Math.abs(l.v - v); if (d <= tol && (!b || d < b.d)) b = { ...l, d } }
    return b
  }
  const bx = best(T.x, w.x, w.y), by = best(T.y, w.y, w.x)
  const grid = (v) => (st.snapToGrid ? snapToGrid(v, gs, st.snapUnit) : v)
  const p = { x: bx ? bx.v : grid(w.x), y: by ? by.v : grid(w.y) }
  const guides = []
  if (bx) guides.push({ axis: 'x', val: bx.v, from: Math.min(bx.a, p.y), to: Math.max(bx.b, p.y) })
  if (by) guides.push({ axis: 'y', val: by.v, from: Math.min(by.a, p.x), to: Math.max(by.b, p.x) })
  return { p, guides, snap: (bx || by)?.kind || null }
}

/* ── the shapes as document objects ── */
// (d2-labels) a new shape is Square (corners, line ends) — written down, so a shape saved without it is one from before (saveLoad.js: Round)
const style = (s) => ({ stroke: s.stroke, strokeWidth: s.strokeWidth, dashed: !!s.dashed, layerId: 'notes', opacity: 1, rotation: 0, corners: 'square' })
const filled = (s) => (s.fill ? { fill: s.fill, noFill: false } : { fill: null, noFill: true })

/** Why the shape through `pts` is refused — a line under 3″, a circle under 3″ radius — or null. */
export function refusal(shape, pts, gs = 40) {
  if (pts.length < 2) return null
  const [a, b] = pts, d = Math.hypot(b.x - a.x, b.y - a.y)
  if ((shape === 'line' || shape === 'arrow' || shape === 'elbow' || shape === 'block') && d > E && d < (MIN_LINE_IN / 12) * gs) return (shape === 'line' ? 'A line' : 'An arrow') + ' under 3″ is not drawn'
  if (shape === 'circle' && d > E && d < (MIN_RADIUS_IN / 12) * gs) return 'A circle under 3″ radius is not drawn'
  return null
}

/** The object for shape `shape` through points `pts` (world), or null when it is too small (under 2 screen px; a line
 *  under 3″; a circle under 3″ radius). */
export function shapeObject(shape, pts, s, zoom = 1, gs = 40) {
  const min = 2 / (zoom || 1)
  if (refusal(shape, pts, gs)) return null
  if (shape === 'line') {
    if (pts.length < 2) return null
    let [a, b] = pts
    if (Math.hypot(b.x - a.x, b.y - a.y) < min) return null
    if (b.x < a.x || (b.x === a.x && b.y < a.y)) [a, b] = [b, a]      // left to right: the left handles move the left end
    return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...style(s), noFill: true }
  }
  // (d2-arrows) an Arrow: a line with its head at the end (its direction kept: tail to head)
  if (shape === 'arrow' || shape === 'elbow' || shape === 'block') {
    if (pts.length < 2) return null
    const [a, b] = pts
    if (Math.hypot(b.x - a.x, b.y - a.y) < min) return null
    if (shape === 'arrow') return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...style(s), noFill: true, ends: 'end' }
    if (shape === 'elbow') {
      const dir = s.lead || (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v')
      return { type: 'elbow', x1: a.x, y1: a.y, x2: b.x, y2: b.y, dir, bend: null, ...style(s), noFill: true, ends: 'end' }
    }
    return { type: 'block_arrow', x1: a.x, y1: a.y, x2: b.x, y2: b.y, bodyW: (s.blockFt > 0 ? s.blockFt : BLOCK_FT) * gs, fill: s.blockFill || '#E07B22', noFill: false, text: '', layerId: 'notes', opacity: 1, rotation: 0 }
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
  if (shape === 'polyline') {
    const closed = !!s.closed
    if (pts.length < (closed ? 3 : 2)) return null
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    if (Math.max(...xs) - Math.min(...xs) < min && Math.max(...ys) - Math.min(...ys) < min) return null
    return { type: 'polyline', ...withPoints(pts.map(p => [p.x, p.y])), closed, ...style(s), ...(closed ? filled(s) : { fill: null, noFill: true }) }
  }
  return null
}

/** Add the shape — one undo step (the store's addObject); `closed`: a polyline closed on its first point. Then, unless
 *  the tool is kept on (a double-click), Select with the new shape selected. A shape refused (too small) gives a notice.
 *  → the new object, or null. */
export function commitShape(store, shape, pts, zoom = 1, newId = null, closed = false) {
  const s = useDrawTool.getState(), gs = store.getState().gridSize || 40
  // closed: true closes it; 'open' keeps it open whatever the bar's Close says (Esc on a polyline — d1-bar)
  const o = shapeObject(shape, pts, closed === true ? { ...s, closed: true } : closed === 'open' ? { ...s, closed: false } : s, zoom, gs)
  useDrawTool.setState({ pts: [], typed: null, press: null, guides: [], closing: false, snap: null, lead: null })
  const why = refusal(shape, pts, gs)
  if (why) notify(why)
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

/** How many points finish the shape: Line, Rectangle, Circle 2 — a polyline a double-click / Enter / its first point. */
export const twoPoint = (shape) => shape === 'line' || shape === 'rect' || shape === 'circle' || shape === 'arrow' || shape === 'elbow' || shape === 'block'

/** The angle of the segment a → b, in degrees counter-clockwise from the right (as a protractor reads the plan: up is
 *  positive) — 0 … 359. */
export const angleOf = (a, b) => { const d = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI; return Math.round(((d % 360) + 360) % 360 * 10) / 10 }

/** A length typed for the segment being drawn, from the last point (feet): toward the pointer, or "L<A" — L feet at A°
 *  (counter-clockwise from the right); a rectangle "W x H" or "W,H"; a circle "R 9" / "D 18" (a bare number: the
 *  radius) → the point that ends it, or null when it is not one. */
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
  let ft = null, ang = null
  if (shape === 'circle') {
    const m = t.match(/^([rd])?\s*(.+)$/i)
    if (!m) return null
    ft = feetOf(m[2])
    if (ft != null && m[1] && m[1].toLowerCase() === 'd') ft /= 2
  } else {
    const m = t.split('<')
    ft = feetOf(m[0])
    if (m.length > 1) { ang = Number(m[1].trim()); if (!Number.isFinite(ang)) return null }
  }
  if (!(ft > 0)) return null
  let dx, dy
  if (ang != null) { dx = Math.cos((ang * Math.PI) / 180); dy = -Math.sin((ang * Math.PI) / 180) }
  else {
    dx = (at?.x ?? last.x + 1) - last.x; dy = (at?.y ?? last.y) - last.y
    const r = Math.hypot(dx, dy)
    if (r < E) { dx = 1; dy = 0 } else { dx /= r; dy /= r }
  }
  return { x: last.x + dx * ft * gs, y: last.y + dy * ft * gs }
}

/** The end of the tool: Done (`finish`) keeps a polyline with enough points; Esc and ✕ cancel the shape being drawn
 *  (CLAUDE.md Rule 9 — Esc cancels; d1-final, was: Esc kept it). */
/* (d1-bar) Esc on a polyline with 2 points or more keeps them, an open polyline (the one exception to Rule 9's "Esc
   cancels"); Done finishes it as the bar says (Close); the bar's ✕ cancels (cancelDraw first). */
export function endDraw(store, shape, zoom = 1, finish = false) {
  const s = useDrawTool.getState()
  const keep = shape === 'polyline' && (finish ? s.pts.length > 0 : s.pts.length >= 2)
  const made = keep ? commitShape(store, shape, s.pts, zoom, null, finish ? false : 'open') : null
  cancelDraw()
  useDrawTool.setState({ keep: false })
  // a shape finished by it: Select, the shape selected (as any shape finished); else the home tool
  if (made) { store.getState().setActiveTool(TOOLS.SELECT); store.getState().selectObject(made.id, false) }
  else store.getState().setActiveTool(HOME_TOOL)
}

/* ── editing a shape after it is drawn (its card, its points) ── */
/** (d1-final) A line's length (feet) typed: its start (x1, y1) held, the same angle. Under 3″ refused. One undo. */
export function setLineLength(store, id, ft) {
  const st = store.getState(), o = st.objects.find(q => q.id === id), gs = st.gridSize || 40
  if (!o || o.type !== 'line' || !(ft > 0)) return false
  if (ft * 12 < MIN_LINE_IN) { notify('A line under 3″ is not drawn'); return false }
  const L = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) || 1, ux = (o.x2 - o.x1) / L, uy = (o.y2 - o.y1) / L
  st.commitObjectUpdate(id, { x2: o.x1 + ux * ft * gs, y2: o.y1 + uy * ft * gs })
  return true
}
/** (d1-final) A line's angle (degrees, counter-clockwise from the right) typed: its start and length held. One undo. */
export function setLineAngle(store, id, deg) {
  const st = store.getState(), o = st.objects.find(q => q.id === id)
  if (!o || o.type !== 'line' || !Number.isFinite(deg)) return false
  const L = Math.hypot(o.x2 - o.x1, o.y2 - o.y1), a = (deg * Math.PI) / 180
  st.commitObjectUpdate(id, { x2: o.x1 + Math.cos(a) * L, y2: o.y1 - Math.sin(a) * L })
  return true
}
/** (d1-final) A circle's radius (feet) typed — its centre held; under 3″ refused. One undo. */
export function setCircleRadius(store, id, ft) {
  const st = store.getState(), o = st.objects.find(q => q.id === id), gs = st.gridSize || 40
  if (!o || o.type !== 'circle' || !(ft > 0)) return false
  if (ft * 12 < MIN_RADIUS_IN) { notify('A circle under 3″ radius is not drawn'); return false }
  const r = ft * gs
  st.commitObjectUpdate(id, { r, rx: r, ry: r })
  return true
}
/** (d1-final) A polyline opened or closed (closing joins its last point to its first: 3 points at least). One undo. */
export function setPolylineClosed(store, id, closed) {
  const st = store.getState(), o = st.objects.find(q => q.id === id)
  if (!o || o.type !== 'polyline') return false
  if (closed && (o.pts || []).length < 3) { notify('A closed shape needs 3 points'); return false }
  st.commitObjectUpdate(id, { closed: !!closed })
  return true
}
/** The fewest points a polyline keeps: 2 open, 3 closed. */
const minPts = (o) => (o.closed ? 3 : 2)
/** (d1-final) A point added to a polyline on side i (point i to i+1) at world `w` (projected onto the side). One undo. */
export function addPolylinePoint(store, id, i, w) {
  const st = store.getState(), o = st.objects.find(q => q.id === id)
  if (!o || o.type !== 'polyline') return false
  const P = shapePoints(o), n = P.length, a = P[i], b = P[(i + 1) % n]
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1
  const t = Math.max(0.02, Math.min(0.98, ((w.x - a[0]) * dx + (w.y - a[1]) * dy) / L2))
  const Q = [...P.slice(0, i + 1), [a[0] + dx * t, a[1] + dy * t], ...P.slice(i + 1)]
  st.commitObjectUpdate(id, withPoints(Q))
  return true
}
/** (d1-final) Point i of a polyline taken off (Delete with the point picked) — refused below its fewest points. One undo. */
export function removePolylinePoint(store, id, i) {
  const st = store.getState(), o = st.objects.find(q => q.id === id)
  if (!o || o.type !== 'polyline') return false
  const P = shapePoints(o)
  if (P.length - 1 < minPts(o)) { notify(o.closed ? 'A closed shape needs 3 points' : 'A polyline needs 2 points'); return false }
  st.commitObjectUpdate(id, withPoints(P.filter((_, k) => k !== i)))
  clearShapePoint()
  return true
}
/** (d1-final) Point i dropped onto its neighbour (within `tol`, world px): the two merge — the moved point goes. → the
 *  fields, or null when it is not on a neighbour (or the polyline would have too few points). */
export function mergedOnNeighbour(o, i, tol) {
  const P = shapePoints(o), n = P.length, me = P[i]
  const nb = [i - 1, i + 1].filter(k => (o.closed ? true : k >= 0 && k < n)).map(k => P[(k + n) % n])
  if (!nb.some(q => Math.hypot(q[0] - me[0], q[1] - me[1]) <= tol)) return null
  if (n - 1 < minPts(o)) return null
  return withPoints(P.filter((_, k) => k !== i))
}
/** (d1-final) A closed polyline's area (world px², null when its sides cross) and perimeter (world px). */
export function polyMeasures(o) {
  const P = shapePoints(o), n = P.length
  let per = 0
  for (let i = 0; i < n - (o.closed ? 0 : 1); i++) { const a = P[i], b = P[(i + 1) % n]; per += Math.hypot(b[0] - a[0], b[1] - a[1]) }
  if (!o.closed || n < 3) return { area: null, perimeter: per, crossing: false }
  const cross = (p, q, r, s) => {
    const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const d1 = d(p, q, r), d2 = d(p, q, s), d3 = d(r, s, p), d4 = d(r, s, q)
    return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E))
  }
  let crossing = false
  for (let i = 0; i < n && !crossing; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (cross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) { crossing = true; break }
  }
  let a2 = 0
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a2 += p[0] * q[1] - q[0] * p[1] }
  return { area: crossing ? null : Math.abs(a2) / 2, perimeter: per, crossing }
}

/** (d1-final) A drawn rectangle turned into an office-style zone (the same box; the zone rules apply as to any zone
 *  placed — the bays under it go: utils/rackingAreaTool.js installAreaKeeper). One undo. → the zone's id, or null. */
export const ZONE_FROM_RECT = { type: 'zone_office', color: '#7c3aed', label: 'Office' }
export function convertRectToZone(store, id, newId) {
  const st = store.getState(), o = st.objects.find(q => q.id === id)
  if (!o || o.type !== 'rect' || o.locked) return null
  const z = {
    id: newId(), type: ZONE_FROM_RECT.type, x: o.x, y: o.y, width: o.width, height: o.height, rotation: 0,
    fill: ZONE_FROM_RECT.color + '22', stroke: ZONE_FROM_RECT.color, strokeWidth: 1.5, opacity: 1, noFill: false,
    label: (o.name && String(o.name).trim()) || ZONE_FROM_RECT.label, layerId: 'zones', ...(o.parentId ? { parentId: o.parentId } : {}),
  }
  store.setState({ objects: st.objects.map(q => (q.id === id ? z : q)), selectedIds: [z.id] })
  store.getState().commitObjectUpdate(z.id, {})
  return z.id
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
/** (d1-bar) A style change on drawn shapes and texts `ids` (the selection bar's, the card's): `patch` (an object, or a
 *  function of the object giving one) on every unlocked one — ONE undo step. → how many changed. */
export function styleDrawn(store, ids, patch) {
  const st = store.getState()
  const objs = ids.map(id => st.objects.find(o => o.id === id)).filter(o => o && !o.locked)
  let last = null
  for (const o of objs) {
    const u = typeof patch === 'function' ? patch(o) : patch
    if (!u || Object.keys(u).every(k => o[k] === u[k])) continue
    st.updateObject(o.id, u); last = o.id
  }
  if (last) store.getState().commitObjectUpdate(last, {})
  return last ? 1 : 0
}
/** (d1-bar) A text's alignment: its lines move inside its box, the box never moves — its anchor (x) goes to the box's
 *  left, centre or right edge as the alignment needs (getObjectBounds reads x as the anchor of the alignment). */
export function alignPatch(o, align) {
  if (!o || o.type !== 'text' || (o.align || 'left') === align) return null
  const b = getObjectBounds(o)
  if (!b) return { align }
  return { align, x: align === 'center' ? b.x + b.width / 2 : align === 'right' ? b.x + b.width : b.x }
}
/** Align texts `ids` (left | center | right): one undo step, every box where it was. */
export const alignTexts = (store, ids, align) => styleDrawn(store, ids, (o) => alignPatch(o, align))

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
/** Start a text at world `w` (its anchor; the first line's baseline one text height below the click); `width` (world px):
 *  a box dragged — the text wraps at it (d1-final). */
export function startText(w, gs = 40, width = null) {
  const s = useDrawTool.getState()
  const x = width ? (s.align === 'center' ? w.x + width / 2 : s.align === 'right' ? w.x + width : w.x) : w.x
  useDrawTool.setState({ text: { x, y: w.y + (s.textIn / 12) * gs, value: '', ...(width ? { width } : {}) } })
}
/** (d1-final) A text placed edited again (a double-click on it): its words in the editor, at its own style. */
export function editText(store, id) {
  const o = store.getState().objects.find(q => q.id === id)
  if (!o || o.type !== 'text' || o.locked) return false
  store.getState().setActiveTool(TOOLS.TEXT)
  useDrawTool.setState({ text: { x: o.x, y: o.y, value: o.text || '', id: o.id, ...(o.width ? { width: o.width } : {}) } })
  return true
}
/** The text being typed added — one undo step — or dropped when empty; a text edited again: its words changed (one
 *  undo), or the text deleted when they are all gone (d1-final). → the text (new or edited), or null. */
export function commitText(store, newId = null) {
  const s = useDrawTool.getState(), t = s.text
  useDrawTool.setState({ text: null })
  if (!t) return null
  const words = String(t.value ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  if (t.id) {
    const st = store.getState(), o = st.objects.find(q => q.id === t.id)
    if (!o) return null
    if (!words.trim()) { st.selectObject(t.id, false); store.getState().deleteSelected(); return null }
    if (words !== o.text) st.commitObjectUpdate(t.id, { text: words })
    return store.getState().objects.find(q => q.id === t.id) || null
  }
  if (!words.trim()) return null
  const gs = store.getState().gridSize || 40
  store.getState().addObject({ type: 'text', x: t.x, y: t.y, text: words, ...textFields(s, gs), ...(t.width ? { width: t.width } : {}), layerId: 'notes', opacity: 1, rotation: 0, ...(newId ? { id: newId() } : null) })
  const all = store.getState().objects
  return all[all.length - 1]
}

/** (D1) A text resized by a handle — the canvas's resize (canvas2/useCanvasInteraction.js) asks this instead of the box
 *  resize a text has no fields for: a corner scales its text height with the box (the opposite corner stays); a side
 *  dot (d1-final) sets its wrap width (the opposite side stays; the height follows the lines). */
export function resizeText(o, handle, dx, dy, bounds) {
  const b = bounds, fs = o.fontSize || 14
  if (!b || !(b.height > 0)) return {}
  if (handle === 'ml' || handle === 'mr') {
    const w = Math.max(fs, handle === 'mr' ? b.width + dx : b.width - dx)
    const x0 = handle === 'ml' ? b.x + b.width - w : b.x
    return { width: w, x: o.align === 'center' ? x0 + w / 2 : o.align === 'right' ? x0 + w : x0 }
  }
  const grow = (handle.includes('b') ? dy : -dy) / b.height, growX = (handle.includes('r') ? dx : -dx) / Math.max(b.width, 1)
  const k = Math.max(0.1, 1 + (Math.abs(growX) > Math.abs(grow) ? growX : grow))
  const nw = b.width * k, nh = b.height * k, nf = fs * k
  const x0 = handle.includes('l') ? b.x + b.width - nw : b.x, y0 = handle.includes('t') ? b.y + b.height - nh : b.y
  const x = o.align === 'center' ? x0 + nw / 2 : o.align === 'right' ? x0 + nw : x0
  const textIn = Math.round((o.textIn || (fs / 40) * 12) * k * 100) / 100
  return { x, y: y0 + nf, fontSize: nf, textIn, ...(o.width ? { width: o.width * k } : {}) }
}
