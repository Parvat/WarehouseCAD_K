// drawnShapes.js — the drawn shapes (D1, utils/drawTool.js): Line, Rectangle, Circle, Polyline, Polygon — one geometry
// each, drawn the same on the canvas (canvas2/shapes.jsx DrawnShape) and the PDF (export/pdfExport.js), and picked
// from it (canvas2/hitTest.js): an open shape or an unfilled one on its line; a filled one also inside.
// A polyline / polygon keeps its points relative to its box (x, y, width, height) as drawn (w0 × h0): a move moves the
// box, a resize scales the points with it — the store and the resize code handle it as any box.
// The stroke width is screen px on the canvas (as every drawn line); on paper 1 px = 0.25 mm.

import { distToSegment, getObjectBounds } from '../utils/canvas'
import { layoutText, makeMeasure, fontSpec } from '../utils/textLayout'
import { textInches } from '../utils/textSizes'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Feet and inches as every plan label writes them (utils/bom.js ftIn's format: 13′-9″) — kept here, no BOM import. */
const ftIn = (inches) => { const v = Math.round(inches), f = Math.floor(v / 12), i = v - f * 12; return i ? `${f}′-${i}″` : `${f}′` }

export const DRAWN_TYPES = new Set(['line', 'rect', 'circle', 'polyline', 'polygon'])
/** A drawn shape — a line with its two ends, or a shape with its box / centre. */
export const isDrawn = (o) => !!o && DRAWN_TYPES.has(o.type) && (o.type !== 'line' || Number.isFinite(o.x1)) && (o.type !== 'circle' || Number.isFinite(o.cx))

/** The shape's outline: { kind: 'line' | 'ellipse', pts: [[x, y]…], closed } in world px. */
export function drawnGeom(o) {
  if (o.type === 'line') return { kind: 'line', pts: [[o.x1, o.y1], [o.x2, o.y2]], closed: false }
  if (o.type === 'circle') {
    const rx = Number.isFinite(o.rx) ? o.rx : o.r, ry = Number.isFinite(o.ry) ? o.ry : o.r
    return { kind: 'ellipse', cx: o.cx, cy: o.cy, rx: rx || 0, ry: ry || 0, closed: true }
  }
  if (o.type === 'rect') return { kind: 'line', pts: [[o.x, o.y], [o.x + o.width, o.y], [o.x + o.width, o.y + o.height], [o.x, o.y + o.height]], closed: true }
  const sx = o.w0 > 0 ? o.width / o.w0 : 1, sy = o.h0 > 0 ? o.height / o.h0 : 1
  return { kind: 'line', pts: (o.pts || []).map(([px, py]) => [o.x + px * sx, o.y + py * sy]), closed: o.type === 'polygon' || !!o.closed }
}
export const isFilled = (o) => !!o.fill && !o.noFill && drawnGeom(o).closed
/** (d1-final, the Rectangle mockup) How a closed shape's inside is painted: none, tinted (its fill colour, light — the
 *  "filled, tinted" swatch) or hatched (its fill colour's 45° lines — the "no racking" look). → { kind, color, alpha } */
export const FILL_TINT = 0.15
export function fillPaint(o) {
  if (!isFilled(o)) return { kind: 'none' }
  if (o.fillStyle === 'hatch') return { kind: 'hatch', color: o.fill, alpha: 0.55 }
  return { kind: 'tint', color: o.fill, alpha: Number.isFinite(o.fillOpacity) ? o.fillOpacity : FILL_TINT }
}
/** The hatch's line spacing (world px): 2′, at any zoom (the drawing's, not the screen's). */
export const hatchGap = (gs = 40) => 2 * gs
/** The hatch lines (45°, world px segments) over box `b` — clipped to the shape where drawn. */
export function hatchSegments(b, gs = 40) {
  const g = hatchGap(gs), out = []
  for (let k = -b.height; k < b.width; k += g) out.push([b.x + k, b.y + b.height, b.x + k + b.height, b.y])
  return out
}
/** A shape's box (world px). */
export function drawnBox(o) {
  const g = drawnGeom(o)
  if (g.kind === 'ellipse') return { x: g.cx - g.rx, y: g.cy - g.ry, width: g.rx * 2, height: g.ry * 2 }
  const xs = g.pts.map(p => p[0]), ys = g.pts.map(p => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

/** (d1-final, the Rectangle mockup) A named rectangle's label: its name over its size and area ("25′ × 13′-9″ · 344 sq
 *  ft"), in its stroke colour, centred inside — or just above its top edge when it does not fit. Real text heights
 *  (CLAUDE.md Rule 8): the name at the zone and section names' height, the size at the aisle widths'. → { lines: [{ text,
 *  x, y (top), fs, bold }], inside } or null (no name). */
export function rectLabel(o, gs = 40, sizes) {
  const name = String(o.name || '').trim()
  if (o.type !== 'rect' || !name) return null
  const fsN = (textInches('names', null, sizes) / 12) * gs, fsS = (textInches('aisle', null, sizes) / 12) * gs * 0.75
  const ftOf = (px) => ftIn((px / gs) * 12)
  const area = Math.round((o.width / gs) * (o.height / gs))
  const size = `${ftOf(o.width)} × ${ftOf(o.height)} · ${area.toLocaleString('en-US')} sq ft`
  const wN = makeMeasure(fontSpec({ fontSize: fsN, bold: true, fontFamily: "'Plus Jakarta Sans', sans-serif" }), fsN)(name)
  const wS = makeMeasure(fontSpec({ fontSize: fsS, fontFamily: "'Plus Jakarta Sans', sans-serif" }), fsS)(size)
  const W = Math.max(wN, wS), H = fsN * 1.25 + fsS * 1.3, pad = fsS * 0.5
  const inside = W <= o.width - 2 * pad && H <= o.height - 2 * pad
  const top = inside ? o.y + (o.height - H) / 2 : o.y - H - pad
  const cx = o.x + o.width / 2
  return { inside, width: W, height: H, lines: [
    { text: name, x: cx, y: top, fs: fsN, bold: true },
    { text: size, x: cx, y: top + fsN * 1.25, fs: fsS, bold: false },
  ] }
}
/** The dash (screen px) for a dashed shape. */
export const dashOf = (o) => (o.dashed ? [Math.max(4, (o.strokeWidth || 2) * 3), Math.max(3, (o.strokeWidth || 2) * 2)] : null)

/** Is world point (wx, wy) on the shape — its line within `tol` (world px), or inside a closed one (filled or not —
 *  d1-fixes: a click inside a rectangle, circle, polygon or closed polyline picks it)? → 'line' | 'inside' | null */
export function drawnHit(o, wx, wy, tol) {
  const g = drawnGeom(o)
  if (g.kind === 'ellipse') {
    if (!(g.rx > 0) || !(g.ry > 0)) return null
    const d = Math.hypot((wx - g.cx) / g.rx, (wy - g.cy) / g.ry), r = Math.min(g.rx, g.ry)
    if (Math.abs(d - 1) * r <= tol) return 'line'
    return d < 1 ? 'inside' : null
  }
  const P = g.pts, n = P.length
  for (let i = 0; i < n - (g.closed ? 0 : 1); i++) {
    const a = P[i], b = P[(i + 1) % n]
    if (distToSegment({ x: wx, y: wy }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= tol) return 'line'
  }
  if (g.closed && n >= 3 && inPoly(P, wx, wy)) return 'inside'
  return null
}
/* ── a polyline's / polygon's points edited (d1-fixes, as the building outline: a corner dragged moves that point, a side
   dragged moves that side; the box handles still scale the whole shape) ── */
export const isPointShape = (o) => !!o && (o.type === 'polyline' || o.type === 'polygon') && Array.isArray(o.pts)
/** Its points in world px. */
export const shapePoints = (o) => drawnGeom(o).pts
/** The fields for a polyline / polygon through world points `P` (its box re-fitted, its points relative to it). */
export function withPoints(P) {
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys)
  const width = Math.max(Math.max(...xs) - x, 1), height = Math.max(Math.max(...ys) - y, 1)
  return { x, y, width, height, w0: width, h0: height, pts: P.map(([px, py]) => [px - x, py - y]) }
}
/** Which point of `o` is within `r` (world px) of (wx, wy) → its index, or -1. */
export function pointAt(o, wx, wy, r) {
  const P = shapePoints(o)
  let best = -1, bd = Infinity
  P.forEach(([x, y], i) => { const d = Math.hypot(wx - x, wy - y); if (d <= r && d < bd) { bd = d; best = i } })
  return best
}
/** Which side of `o` (point i to point i+1) is within `tol` of (wx, wy) → i, or -1. */
export function sideAt(o, wx, wy, tol) {
  const g = drawnGeom(o), P = g.pts, n = P.length
  for (let i = 0; i < n - (g.closed ? 0 : 1); i++) {
    const a = P[i], b = P[(i + 1) % n]
    if (distToSegment({ x: wx, y: wy }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= tol) return i
  }
  return -1
}
/** `o` with point i at (x, y). */
export const movePointTo = (o, i, x, y) => withPoints(shapePoints(o).map((p, k) => (k === i ? [x, y] : p)))
/** `o` with side i (point i to point i+1) moved by (dx, dy) across itself — the part of the move square to the side. */
export function moveSideBy(o, i, dx, dy) {
  const P = shapePoints(o), n = P.length, a = P[i], b = P[(i + 1) % n]
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, t = dx * nx + dy * ny
  return withPoints(P.map((p, k) => (k === i || k === (i + 1) % n ? [p[0] + nx * t, p[1] + ny * t] : p)))
}

function inPoly(P, x, y) {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) c = !c
  }
  return c
}

/** The shape as SVG for the PDF (world px; `u` world px per paper mm). */
export function drawnSVG(o, u, gs = 40, sizes) {
  const g = drawnGeom(o), sw = (o.strokeWidth || 2) * 0.25 * u, d = dashOf(o), fp = fillPaint(o)
  const dash = d ? ` stroke-dasharray="${d[0] * 0.25 * u} ${d[1] * 0.25 * u}"` : ''
  const pid = 'hatch-' + String(o.id || Math.random()).replace(/[^w-]/g, '')
  const defs = fp.kind === 'hatch' ? `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="${hatchGap(gs)}" height="${hatchGap(gs)}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${hatchGap(gs)}" stroke="${fp.color}" stroke-opacity="${fp.alpha}" stroke-width="${sw * 0.6}"/></pattern></defs>` : ''
  const fill = fp.kind === 'tint' ? `fill="${fp.color}" fill-opacity="${fp.alpha}"` : fp.kind === 'hatch' ? `fill="url(#${pid})"` : 'fill="none"'
  const paint = `stroke="${o.stroke || '#1F2321'}" stroke-width="${sw}"${dash} stroke-linejoin="round" stroke-linecap="round" ${fill}`
  if (g.kind === 'ellipse') return `${defs}<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" ${paint}/>`
  const pts = g.pts.map(p => p.join(',')).join(' ')
  const lab = rectLabel(o, gs, sizes)
  const words = lab ? lab.lines.map(l => `<text x="${l.x}" y="${l.y + l.fs * 0.85}" font-size="${l.fs}" font-family="'Plus Jakarta Sans', sans-serif"${l.bold ? ' font-weight="600"' : ''} fill="${o.stroke || '#1F2321'}" text-anchor="middle">${esc(l.text)}</text>`).join('') : ''
  return defs + (g.closed ? `<polygon points="${pts}" ${paint}/>` : `<polyline points="${pts}" ${paint}/>`) + words
}

/** A text object's lines and box, as drawn (getObjectBounds — the selection outline's — and layoutText):
 *  { box: { x, y, width, height }, lines, lineH, anchor } */
export function textGeom(o) {
  const L = layoutText(o), box = getObjectBounds(o)
  return { box, lines: L.lines, lineH: L.lineH, fontSize: o.fontSize || 14 }
}
/** (d1-final) A text's Box (its card's Box option): the frame round its words, a quarter of its height clear. → { x, y,
 *  width, height } or null. */
export function textBox(o) {
  if (!o.boxed) return null
  const T = textGeom(o), pad = T.fontSize * 0.25
  return { x: T.box.x - pad, y: T.box.y - pad, width: T.box.width + 2 * pad, height: T.lines.length * T.lineH + 2 * pad }
}
/** A text object as SVG for the PDF: one line under the other, aligned as on the canvas. */
export function textSVG(o) {
  const T = textGeom(o), a = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start'
  const x = o.align === 'center' ? T.box.x + T.box.width / 2 : o.align === 'right' ? T.box.x + T.box.width : T.box.x
  const weight = o.bold ? ' font-weight="700"' : '', style = o.italic ? ' font-style="italic"' : ''
  // (d1-fixes) turned in 90° steps about its box's centre, as on the canvas (shapes.jsx spin)
  const turn = o.rotation ? ` transform="rotate(${o.rotation} ${T.box.x + T.box.width / 2} ${T.box.y + T.box.height / 2})"` : ''
  const bx = textBox(o)
  const frame = bx ? `<rect${turn} x="${bx.x}" y="${bx.y}" width="${bx.width}" height="${bx.height}" fill="${o.boxFill || 'none'}" stroke="${o.boxStroke || o.fill || '#1F2321'}" stroke-width="${(o.fontSize || 14) * 0.06}"/>` : ''
  return frame + `<text${turn} x="${x}" y="${o.y}" font-size="${T.fontSize}" font-family="'${o.fontFamily || 'Plus Jakarta Sans'}', sans-serif"${weight}${style} fill="${o.fill || '#1F2321'}" text-anchor="${a}">` +
    T.lines.map((l, i) => `<tspan x="${x}" y="${o.y + i * T.lineH}">${esc(l) || ' '}</tspan>`).join('') + '</text>'
}
