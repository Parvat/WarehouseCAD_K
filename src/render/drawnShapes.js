// drawnShapes.js — the drawn shapes (D1, utils/drawTool.js): Line, Rectangle, Circle, Polyline, Polygon — one geometry
// each, drawn the same on the canvas (canvas2/shapes.jsx DrawnShape) and the PDF (export/pdfExport.js), and picked
// from it (canvas2/hitTest.js): an open shape or an unfilled one on its line; a filled one also inside.
// A polyline / polygon keeps its points relative to its box (x, y, width, height) as drawn (w0 × h0): a move moves the
// box, a resize scales the points with it — the store and the resize code handle it as any box.
// The stroke width is screen px on the canvas (as every drawn line); on paper 1 px = 0.25 mm.

import { distToSegment, getObjectBounds } from '../utils/canvas'
import { layoutText, makeMeasure, fontSpec } from '../utils/textLayout'
import { textInches, textLz, useTextSizes } from '../utils/textSizes'
import { isDefaultUnits, fmtLength, unitsNow } from '../utils/units'   // (units) the project's units

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Feet and inches as every plan label writes them (utils/bom.js ftIn's format: 13′-9″) — kept here, no BOM import. */
const ftIn = (inches) => { if (!isDefaultUnits()) return fmtLength(inches, 'plan', 'dash'); const v = Math.round(inches), f = Math.floor(v / 12), i = v - f * 12; return i ? `${f}′-${i}″` : `${f}′` }   // (units)

export const DRAWN_TYPES = new Set(['line', 'rect', 'circle', 'polyline', 'polygon', 'elbow', 'block_arrow'])
/** (d2-arrows) The two-ended ones: a line (an Arrow is a line with an arrowhead), an elbow arrow, a block arrow — x1, y1
 *  (the tail) to x2, y2 (the head); the store moves them by their ends. */
export const TWO_ENDED = new Set(['line', 'elbow', 'block_arrow'])
/** A drawn shape — a line with its two ends, or a shape with its box / centre. */
export const isDrawn = (o) => !!o && DRAWN_TYPES.has(o.type) && (!TWO_ENDED.has(o.type) || Number.isFinite(o.x1)) && (o.type !== 'circle' || Number.isFinite(o.cx))
export const isTwoEnded = (o) => !!o && TWO_ENDED.has(o.type) && Number.isFinite(o.x1)

/* ── (d2-arrows) arrows, elbows, block arrows, corners ── */
/** A line's / open polyline's / elbow's arrowheads: none, end, start or both. */
export const END_STYLES = ['none', 'end', 'start', 'both']
export const endsOf = (o) => (END_STYLES.includes(o?.ends) ? o.ends : 'none')
/** Can it carry arrowheads: a line, an open polyline, an elbow arrow. */
export const hasEnds = (o) => !!o && (o.type === 'line' || o.type === 'elbow' || (o.type === 'polyline' && !o.closed))
/** The arrowhead's length (world px — real size, with the drawing): 9″ per px of stroke width; its half width 0.45 of it. */
export const headLen = (o, gs = 40) => (o.strokeWidth || 2) * (9 / 12) * gs
/** Can it have round corners (a rectangle, a polyline, an elbow) — or round line ends (a line, an arrow)? */
export const hasCorners = (o) => !!o && (o.type === 'rect' || o.type === 'polyline' || o.type === 'polygon' || o.type === 'elbow' || o.type === 'line')
export const roundOn = (o) => o?.corners === 'round'
/** The corner radius (world px): its own (cornerFt, default 1 ft — real size) when Round, else 0 (a line: its ends only). */
export const cornerR = (o, gs = 40) => (roundOn(o) && o.type !== 'line' ? Math.max(0, Number.isFinite(o.cornerFt) ? o.cornerFt : 1) * gs : 0)
/** An elbow arrow's route: two right-angle segments — horizontal then vertical ('h') or vertical then horizontal ('v') —
 *  three once its bend is moved (`bend`: the middle segment's offset from the start along the first leg; null: at the
 *  end — two segments). → [[x, y]…] */
export function elbowRoute(o) {
  const v = o.dir === 'v'
  const m = o.bend == null ? (v ? o.y2 : o.x2) : (v ? o.y1 : o.x1) + o.bend
  const P = v ? [[o.x1, o.y1], [o.x1, m], [o.x2, m], [o.x2, o.y2]] : [[o.x1, o.y1], [m, o.y1], [m, o.y2], [o.x2, o.y2]]
  return P.filter((p, i) => i === 0 || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 1e-6)
}
/** Where its bend dot sits: the middle of its middle segment. */
export function elbowBendAt(o) {
  const v = o.dir === 'v', m = o.bend == null ? (v ? o.y2 : o.x2) : (v ? o.y1 : o.x1) + o.bend
  return v ? { x: (o.x1 + o.x2) / 2, y: m } : { x: m, y: (o.y1 + o.y2) / 2 }
}
/** The elbow with its bend dot dragged to world (x, y): the middle segment moves across itself. */
export const elbowBendTo = (o, x, y) => ({ bend: o.dir === 'v' ? y - o.y1 : x - o.x1 })
/* ── (d1-polish) a selected line's, arrow's or elbow arrow's length label — a click on it types a new length ── */
/** Its length (world px): a line's, an elbow's route's. */
export function drawnLength(o) {
  if (o.type === 'line') return Math.hypot(o.x2 - o.x1, o.y2 - o.y1)
  const P = elbowRoute(o)
  let L = 0
  for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
  return L
}
/** The label's text height (world px): the door chain's real height at the 10 px design size (CLAUDE.md Rule 8). */
export const lengthFs = (gs = 40, sizes) => 10 / textLz('doorValue', gs, null, sizes || useTextSizes.getState().sizes)
/** Where the label sits (world px) for its words `text`: beside the middle of a line (above it), or of an elbow's longest
 *  segment; turned along it, never upside down. → { x, y (its centre), w, h, rot } */
export function lengthLabelAt(o, fs, text) {
  let a, b
  if (o.type === 'line') { a = [o.x1, o.y1]; b = [o.x2, o.y2] }
  else { const P = elbowRoute(o); let best = -1; for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (d > best) { best = d; a = P[i - 1]; b = P[i] } } }
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, side = ny > 0 ? -1 : 1
  let rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  if (rot > 90) rot -= 180
  if (rot < -90) rot += 180
  const w = String(text).length * fs * 0.6 + fs, h = fs * 1.4
  return { x: (a[0] + b[0]) / 2 + nx * side * fs * 1.2, y: (a[1] + b[1]) / 2 + ny * side * fs * 1.2, w, h, rot }
}
/** Is world (wx, wy) on the label `g` (lengthLabelAt's)? */
export function onLengthLabel(g, wx, wy, pad = 0) {
  const t = (-g.rot * Math.PI) / 180, dx = wx - g.x, dy = wy - g.y
  const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t)
  return Math.abs(lx) <= g.w / 2 + pad && Math.abs(ly) <= g.h / 2 + pad
}

/** The default body width of a block arrow (feet). */
export const BLOCK_FT = 4
/** (d1-polish) A block arrow's size: a plain number, its body width in inches (6 8 12 18 24 36 48 — as a text size), no
 *  feet; one drawn before (d2-arrows) has its width in world px (bodyW). */
export const BLOCK_SIZES = [6, 8, 12, 18, 24, 36, 48]
export const blockSize = (o, gs = 40) => (o.size > 0 ? o.size : o.bodyW > 0 ? Math.round((o.bodyW / gs) * 12 * 100) / 100 : BLOCK_FT * 12)
/** A block arrow's body width (world px). */
export const blockW = (o, gs = 40) => (o.size > 0 ? (o.size / 12) * gs : o.bodyW > 0 ? o.bodyW : BLOCK_FT * gs)
/** A block arrow's outline (world px): its body as wide as its size from its tail; (d1-polish) its head twice as wide as the
 *  body, as long as the body is wide (at most 60 % of the arrow). */
export function blockOutline(o) {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux
  const W = blockW(o), w = W / 2, hw = W, hl = Math.min(W, L * 0.6)
  const bx = o.x2 - ux * hl, by = o.y2 - uy * hl
  return [[o.x1 + nx * w, o.y1 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [o.x2, o.y2], [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [o.x1 - nx * w, o.y1 - ny * w]]
}
/** A block arrow's words: centred on its body, along it (never upside down), white, bold, at its real text height
 *  (`labelSizeIn`, default 18″ — CLAUDE.md Rule 8). → { text, x, y, fs, rot } or null */
export function blockText(o, gs = 40) {
  const t = String(o.text || '').trim()
  if (!t) return null
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1
  const hl = Math.min(blockW(o), L * 0.6), k = (L - hl) / 2 / L
  let rot = (Math.atan2(dy, dx) * 180) / Math.PI
  if (rot > 90) rot -= 180
  if (rot <= -90) rot += 180
  return { text: t, x: o.x1 + dx * k, y: o.y1 + dy * k, fs: ((o.labelSizeIn > 0 ? o.labelSizeIn : 18) / 12) * gs, rot }
}
/** (d1-polish) Where a two-ended shape's end handles sit (world px): on its ends — but an end with an arrowhead has its
 *  handle just behind the tip (where the stroke stops under the head), so a selected arrow still shows its head.
 *  → { a: { x, y } (the start's), b: { x, y } (the end's) } */
export function endHandlePts(o, gs = 40) {
  const P = o.type === 'elbow' ? elbowRoute(o) : [[o.x1, o.y1], [o.x2, o.y2]], n = P.length
  const e = hasEnds(o) ? endsOf(o) : 'none'
  const back = (tip, from) => {
    const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1, l = Math.min(headLen(o, gs), L * 0.9) * 0.9
    return { x: tip[0] - (dx / L) * l, y: tip[1] - (dy / L) * l }
  }
  const at = (p) => ({ x: p[0], y: p[1] })
  return { a: n > 1 && (e === 'start' || e === 'both') ? back(P[0], P[1]) : at(P[0]), b: n > 1 && (e === 'end' || e === 'both') ? back(P[n - 1], P[n - 2]) : at(P[n - 1]) }
}
/** The stroked path of a line-like shape and its arrowheads: the path's ends pulled back under each head; each head a
 *  filled triangle [tip, left, right] in the stroke colour. → { P, heads } */
export function withHeads(o, P, gs = 40) {
  const e = hasEnds(o) ? endsOf(o) : 'none'
  if (e === 'none' || P.length < 2) return { P, heads: [] }
  const hl = headLen(o, gs), hw = hl * 0.45, Q = P.map(p => [...p]), heads = []
  const head = (tip, from, at) => {
    const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L
    const l = Math.min(hl, L * 0.9), bx = tip[0] - ux * l, by = tip[1] - uy * l
    heads.push([tip, [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw]])
    Q[at] = [tip[0] - ux * l * 0.9, tip[1] - uy * l * 0.9]
  }
  const n = P.length
  if (e === 'end' || e === 'both') head(P[n - 1], P[n - 2], n - 1)
  if (e === 'start' || e === 'both') head(P[0], P[1], 0)
  return { P: Q, heads }
}
/** A path through `P` with its corners rounded to `r` (each at most half its shorter side): commands
 *  [['M', x, y] | ['L', x, y] | ['Q', cx, cy, x, y] | ['Z']]. */
export function roundedPath(P, closed, r) {
  const n = P.length, out = []
  if (n < 2) return out
  if (!(r > 0) || n < 3) { P.forEach((p, i) => out.push([i ? 'L' : 'M', p[0], p[1]])); if (closed) out.push(['Z']); return out }
  const cut = (i) => {
    const c = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n]
    const d1 = Math.hypot(a[0] - c[0], a[1] - c[1]) || 1, d2 = Math.hypot(b[0] - c[0], b[1] - c[1]) || 1, rr = Math.min(r, d1 / 2, d2 / 2)
    return { p1: [c[0] + ((a[0] - c[0]) / d1) * rr, c[1] + ((a[1] - c[1]) / d1) * rr], c, p2: [c[0] + ((b[0] - c[0]) / d2) * rr, c[1] + ((b[1] - c[1]) / d2) * rr] }
  }
  if (closed) {
    const k0 = cut(0)
    out.push(['M', k0.p2[0], k0.p2[1]])
    for (let i = 1; i < n; i++) { const k = cut(i); out.push(['L', k.p1[0], k.p1[1]], ['Q', k.c[0], k.c[1], k.p2[0], k.p2[1]]) }
    out.push(['L', k0.p1[0], k0.p1[1]], ['Q', k0.c[0], k0.c[1], k0.p2[0], k0.p2[1]], ['Z'])
    return out
  }
  out.push(['M', P[0][0], P[0][1]])
  for (let i = 1; i < n - 1; i++) { const k = cut(i); out.push(['L', k.p1[0], k.p1[1]], ['Q', k.c[0], k.c[1], k.p2[0], k.p2[1]]) }
  out.push(['L', P[n - 1][0], P[n - 1][1]])
  return out
}
/** The commands as SVG path data. */
export const pathD = (cmds) => cmds.map(c => c[0] + (c.length > 1 ? ' ' + c.slice(1).join(' ') : '')).join(' ')
/** The commands traced on a canvas context (Konva's sceneFunc, a clip). */
export function tracePath(ctx, cmds) {
  ctx.beginPath()
  for (const c of cmds) {
    if (c[0] === 'M') ctx.moveTo(c[1], c[2])
    else if (c[0] === 'L') ctx.lineTo(c[1], c[2])
    else if (c[0] === 'Q') ctx.quadraticCurveTo(c[1], c[2], c[3], c[4])
    else ctx.closePath()
  }
}
/** How a shape is drawn (the canvas and the PDF alike): its stroked path (corners rounded, ends pulled back under its
 *  arrowheads), its arrowheads, its fill outline, its line cap and join (Square: flat ends and sharp corners; Round:
 *  round). → { cmds, heads, fillCmds, cap, join } — cmds null for a circle. */
export function drawnPaths(o, gs = 40) {
  const g = drawnGeom(o), round = roundOn(o)
  const cap = round ? 'round' : 'butt', join = round ? 'round' : 'miter'
  if (g.kind !== 'line') return { cmds: null, heads: [], fillCmds: null, cap, join }
  if (o.type === 'block_arrow') { const c = roundedPath(g.pts, true, 0); return { cmds: c, heads: [], fillCmds: c, cap, join } }
  const h = withHeads(o, g.pts, gs)
  let r = cornerR(o, gs)
  if (o.type === 'rect') r = Math.min(r, o.width / 2, o.height / 2)
  return { cmds: roundedPath(h.P, g.closed, r), heads: h.heads, fillCmds: g.closed ? roundedPath(g.pts, true, r) : null, cap, join }
}


/** The shape's outline: { kind: 'line' | 'ellipse', pts: [[x, y]…], closed } in world px. */
export function drawnGeom(o) {
  if (o.type === 'line') return { kind: 'line', pts: [[o.x1, o.y1], [o.x2, o.y2]], closed: false }
  if (o.type === 'circle') {
    const rx = Number.isFinite(o.rx) ? o.rx : o.r, ry = Number.isFinite(o.ry) ? o.ry : o.r
    return { kind: 'ellipse', cx: o.cx, cy: o.cy, rx: rx || 0, ry: ry || 0, closed: true }
  }
  if (o.type === 'rect') return { kind: 'line', pts: [[o.x, o.y], [o.x + o.width, o.y], [o.x + o.width, o.y + o.height], [o.x, o.y + o.height]], closed: true }
  if (o.type === 'elbow') return { kind: 'line', pts: elbowRoute(o), closed: false }
  if (o.type === 'block_arrow') return { kind: 'line', pts: blockOutline(o), closed: true }
  const sx = o.w0 > 0 ? o.width / o.w0 : 1, sy = o.h0 > 0 ? o.height / o.h0 : 1
  return { kind: 'line', pts: (o.pts || []).map(([px, py]) => [o.x + px * sx, o.y + py * sy]), closed: o.type === 'polygon' || !!o.closed }
}
export const isFilled = (o) => !!o.fill && !o.noFill && drawnGeom(o).closed
/** (d1-final, the Rectangle mockup) How a closed shape's inside is painted: none, tinted (its fill colour, light — the
 *  "filled, tinted" swatch) or hatched (its fill colour's 45° lines — the "no racking" look). → { kind, color, alpha } */
export const FILL_TINT = 0.15
export function fillPaint(o) {
  if (o.type === 'block_arrow') return { kind: 'solid', color: o.fill || '#E07B22', alpha: 1 }   // (d2-arrows) filled solid
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
  // (shape-dims) its dimensions on: they show its size and area — the name alone here, centred (the area sits under it)
  if (o.showDims) {
    const fsN = (textInches('names', null, sizes) / 12) * gs
    const wN = makeMeasure(fontSpec({ fontSize: fsN, bold: true, fontFamily: "'Plus Jakarta Sans', sans-serif" }), fsN)(name)
    return { inside: true, width: wN, height: fsN * 1.25, lines: [{ text: name, x: o.x + o.width / 2, y: o.y + o.height / 2 - fsN * 1.15, fs: fsN, bold: true }] }
  }
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
/* ── (shape-dims) a drawn shape's dimensions — its ruler toggle (`showDims`, off by default; the bar and the card) ──
   Display only, never typed. A line's or an arrow's length above its middle; each segment's length on an elbow arrow or a
   polyline, and the area inside a closed one; a rectangle's width on top, its length on its right and its area inside; a
   circle's diameter. Real text heights (CLAUDE.md Rule 8 — the Shape sizes type, 12″): fixed in drawing units, the same at
   every zoom; each sits a fixed drawing offset off its edge, so the labels of one shape never overlap. The project's
   units (utils/units.js: ft-in, or metres on the plan). The plan (canvas2/shapes.jsx DrawnBody — the drag preview too)
   and the PDF (drawnSVG) draw these same labels. */
export const DIM_TYPES = new Set(['line', 'elbow', 'polyline', 'polygon', 'rect', 'circle'])
export const DIM_BLUE = '#1B4FD8'
export const canDim = (o) => !!o && DIM_TYPES.has(o.type) && isDrawn(o)
const areaText = (ft2) => (unitsNow().metric ? `${Math.round(ft2 * 0.09290304 * 10) / 10} m²` : `${Math.round(ft2).toLocaleString('en-US')} sq ft`)
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
function polyCentroid(P) {
  const A = polyArea(P)
  if (Math.abs(A) < 1e-9) return [P.reduce((t, p) => t + p[0], 0) / P.length, P.reduce((t, p) => t + p[1], 0) / P.length]
  let cx = 0, cy = 0
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], k = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k }
  return [cx / (6 * A), cy / (6 * A)]
}
/** The dimension labels of `o` (world px): [{ key, text, x, y (the text's centre — or its left middle when anchor 'left'),
 *  rot (degrees, never upside down), fs, color, anchor }] — [] when its ruler is off or it has none. */
export function dimLabels(o, gs = 40, sizes) {
  if (!o || !o.showDims || !canDim(o)) return []
  const fs = (textInches('shape', null, sizes) / 12) * gs, len = (px) => fmtLength((px / gs) * 12, 'plan', 'dash')
  const ink = o.stroke || '#1F2321', gap = fs * 0.85 + ((o.strokeWidth || 2) / 2)
  const out = []
  /** a segment's length, off its middle on the side `away` points to (or above it: up, else left) */
  const seg = (a, b, key, away = null) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!(L > 1e-6)) return
    let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    const flip = away ? (nx * (mx - away[0]) + ny * (my - away[1]) < 0) : (ny > 1e-9 || (Math.abs(ny) <= 1e-9 && nx > 0))
    if (flip) { nx = -nx; ny = -ny }
    let rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    if (rot > 90) rot -= 180
    if (rot <= -90) rot += 180
    out.push({ key, text: len(L), x: mx + nx * gap, y: my + ny * gap, rot, fs, color: DIM_BLUE, anchor: 'center' })
  }
  const g = drawnGeom(o)
  if (o.type === 'circle') {
    const t = Math.abs(g.rx - g.ry) < 1e-6 ? '⌀ ' + len(g.rx * 2) : `${len(g.rx * 2)} × ${len(g.ry * 2)}`
    out.push({ key: 'dia', text: t, x: g.cx, y: g.cy, rot: 0, fs, color: DIM_BLUE, anchor: 'center' })
    return out
  }
  if (o.type === 'rect') {
    const named = !!String(o.name || '').trim()
    out.push({ key: 'w', text: len(o.width), x: o.x + o.width / 2, y: o.y - gap, rot: 0, fs, color: DIM_BLUE, anchor: 'center' })
    out.push({ key: 'h', text: len(o.height), x: o.x + o.width + gap * 0.6, y: o.y + o.height / 2, rot: 0, fs, color: DIM_BLUE, anchor: 'left' })
    out.push({ key: 'area', text: areaText((o.width / gs) * (o.height / gs)), x: o.x + o.width / 2, y: o.y + o.height / 2 + (named ? fs * 0.75 : 0), rot: 0, fs, color: ink, anchor: 'center' })
    return out
  }
  const P = g.pts
  if (g.closed) {
    const c = polyCentroid(P)
    for (let i = 0; i < P.length; i++) seg(P[i], P[(i + 1) % P.length], 's' + i, c)
    out.push({ key: 'area', text: areaText(Math.abs(polyArea(P)) / (gs * gs)), x: c[0], y: c[1], rot: 0, fs, color: ink, anchor: 'center' })
    return out
  }
  if (o.type === 'line') { seg(P[0], P[1], 'len'); return out }
  for (let i = 1; i < P.length; i++) seg(P[i - 1], P[i], 's' + (i - 1))
  return out
}
/** A dimension label's width (world px) as drawn. */
export const dimWidth = (l) => makeMeasure(fontSpec({ fontSize: l.fs, fontFamily: "'Plus Jakarta Sans', sans-serif" }), l.fs)(l.text)

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
  const dp = drawnPaths(o, gs)
  const paint = `stroke="${o.stroke || '#1F2321'}" stroke-width="${sw}"${dash} stroke-linejoin="${dp.join}" stroke-linecap="${dp.cap}" ${fill}`
  if (g.kind === 'ellipse') return `${defs}<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" ${paint}/>` + dimLabels(o, gs, sizes).map(l => `<text data-dim="${l.key}" x="${l.x}" y="${l.y + l.fs * 0.35}" font-size="${l.fs}" font-family="'Plus Jakarta Sans', sans-serif" fill="${l.color}" text-anchor="middle">${esc(l.text)}</text>`).join('')
  // (d2-arrows) a block arrow: filled solid, its words in white along it
  if (o.type === 'block_arrow') {
    const t = blockText(o, gs)
    const words = t ? `<text x="${t.x}" y="${t.y + t.fs * 0.35}" font-size="${t.fs}" font-family="'Plus Jakarta Sans', sans-serif" font-weight="700" fill="#FFFFFF" text-anchor="middle" transform="rotate(${t.rot} ${t.x} ${t.y})">${esc(t.text)}</text>` : ''
    return `<path data-block-arrow d="${pathD(dp.cmds)}" fill="${fp.color}" stroke="none"/>` + words
  }
  const lab = rectLabel(o, gs, sizes)
  const words = lab ? lab.lines.map(l => `<text x="${l.x}" y="${l.y + l.fs * 0.85}" font-size="${l.fs}" font-family="'Plus Jakarta Sans', sans-serif"${l.bold ? ' font-weight="600"' : ''} fill="${o.stroke || '#1F2321'}" text-anchor="middle">${esc(l.text)}</text>`).join('') : ''
  const heads = dp.heads.map(h => `<polygon data-arrow-head points="${h.map(p => p.join(',')).join(' ')}" fill="${o.stroke || '#1F2321'}" stroke="none"/>`).join('')
  // (shape-dims) its dimensions, as on the plan
  const dims = dimLabels(o, gs, sizes).map(l => `<text data-dim="${l.key}" x="${l.x}" y="${l.y + l.fs * 0.35}" font-size="${l.fs}" font-family="'Plus Jakarta Sans', sans-serif" fill="${l.color}" text-anchor="${l.anchor === 'left' ? 'start' : 'middle'}"${l.rot ? ` transform="rotate(${l.rot} ${l.x} ${l.y})"` : ''}>${esc(l.text)}</text>`).join('')
  // the fill under the stroke when the stroke is pulled back (a head) or rounded: its own outline
  const pts = g.pts.map(p => p.join(',')).join(' '), plain = !dp.heads.length && !(cornerR(o, gs) > 0)
  const body = plain ? (g.closed ? `<polygon points="${pts}" ${paint}/>` : `<polyline points="${pts}" ${paint}/>`) : `<path d="${pathD(dp.cmds)}" ${paint}/>`
  return defs + body + heads + words + dims
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
