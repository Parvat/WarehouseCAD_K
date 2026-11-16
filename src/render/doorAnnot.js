// render/doorAnnot.js — the doors as drawn (doors-edit; STUDIO.md, Doors; mockup doors5.png — the source of truth), shared
// by the canvas (canvas2/DoorAnnot.jsx) and the PDF (export/pdfExport.js), so both draw the same thing:
//
//   - the door: a thin bar ON the wall at its true width (a light shade of the door's colour, its colour as the outline),
//     centred on the wall, 1.5 ft deep (or the wall's thickness, if more); no filled door box, no tag on it;
//   - its clear space: the dashed box in the door's colour (utils/doorClear.js);
//   - its number: just the number (1, 2, 3 … — utils/doorWall.js doorNumbers: one sequence, per wall) in a small round
//     badge in the clear space's corner away from the wall, at its right end (a wall along y: its top end) — a box too
//     shallow for it (a man door's 44 in), just past its far edge, still inside the building — the circle a
//     light shade of the door's colour, a 1 px ring a mid shade, the number 11 medium in the dark shade;
//   - its width: inside the box, on a short dimension line across the door's own width (ticks at its ends, the value in a
//     break), bold — the line never leaves the box;
//   - the gaps: plain text inside the building between the boxes, no line, regular — the first from the corner to the first
//     door, then door to door (none past the last door, as the mockup).
// Nothing for doors outside the wall. Every label is DRAWING-SCALE (CLAUDE.md Rule 8, the door exception): a size in label
// px (1 / lz world px), shrinking with the drawing; the canvas hides each one once under 11 px on screen (canvas2/minText.js
// `hide`), never grows it, never groups doors into ranges. A label that does not fit where it goes (a width wider than its
// box, a gap wider than the floor between two boxes) is not drawn at any zoom.

import { DIM_INK } from './buildingDims'
import { ftIn } from '../utils/bom'
import { doorWall, doorNumbers, doorFoot, wallKey, doorsOnWall, spanOf, wallGaps } from '../utils/doorWall'
import { isDoor } from '../utils/doorTool'
import { doorClearOf } from '../utils/doorClear'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
export const BAR_FT = 1.5                       // the door bar's depth across the wall (ft), the wall's thickness if more
const BADGE_FS = 11, VALUE_FS = 12               // label px: the badge's number; a width or a gap

/** `hex` mixed toward white (t > 0) or black (t < 0) by |t| — the door colour's shades. */
export function shade(hex, t) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return hex
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)))
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}
export const doorShades = (color) => ({ light: shade(color, 0.82), mid: shade(color, 0.45), dark: shade(color, -0.25) })

const textW = (text, fs, bold = false) => String(text).length * fs * (bold ? 0.64 : 0.6)

/** Every wall with doors (one per wall): [w]. */
export function doorWalls(objects, gridSize = 40) {
  const seen = new Map()
  for (const d of (objects || []).filter(isDoor)) { const w = doorWall(d, objects, gridSize); if (w && !seen.has(wallKey(w))) seen.set(wallKey(w), w) }
  return [...seen.values()]
}

/**
 * The doors' drawing → { bars: [{ id, x, y, w, h, fill, stroke }], boxes: [{ id, x, y, w, h, stroke }] (clear spaces),
 * labels: [{ kind: 'badge' | 'width' | 'gap', key, fs, at: { x, y }, box (its text, world px), ops (label ops, a 'circle'
 * op for a badge), stop (a width or gap: { kind: 'door', id, lo, hi } | { kind: 'gap', gap, lo, hi }), wallKey, w }] }.
 * `lz`: the label scale (render/labelSize.js) — one label px is 1 / lz world px.
 */
export function doorDrawing(objects, gridSize = 40, lz = 1) {
  const u = 1 / lz, doors = (objects || []).filter(isDoor)
  const out = { bars: [], boxes: [], labels: [] }
  if (!doors.length) return out
  const nums = doorNumbers(objects, gridSize)
  const fsB = BADGE_FS * u, fsV = VALUE_FS * u, r = fsB * 0.85, inset = 3 * u, tick = 4 * u, pad = 3 * u
  const fpOf = (w) => (w.kind === 'fp' ? (objects || []).find(o => o.id === w.id) : null)
  for (const w of doorWalls(objects, gridSize)) {
    const key = wallKey(w), ds = doorsOnWall(objects, w, gridSize), X = w.axis === 'x'
    const inward = w.inward || 1
    const P = (along, across) => (X ? { x: along, y: across } : { x: across, y: along })
    // each door's clear space on the floor side (a section door: the +1 side's carries its labels; both are drawn)
    const clears = ds.map(d => doorClearOf(d, objects, gridSize))
    const main = clears.map((cs, i) => {
      const c = cs.find(q => (X ? (q.y + q.h / 2 - w.at) : (q.x + q.w / 2 - w.at)) * inward > 0) || cs[0]
      if (!c) { const [s0, s1] = spanOf(ds[i]); return X ? { x: s0, y: Math.min(w.at, w.at + inward * 8 * gridSize), w: s1 - s0, h: 8 * gridSize } : { x: Math.min(w.at, w.at + inward * 8 * gridSize), y: s0, w: 8 * gridSize, h: s1 - s0 } }
      return c
    })
    const lo = (c) => (X ? c.x : c.y), hi = (c) => (X ? c.x + c.w : c.y + c.h)
    const depthOf = (c) => (X ? c.h : c.w)
    // the value row: a little in from the wall's inner face, inside every box
    const minDepth = Math.min(...main.map(depthOf))
    // (a wall along y: the values stand upright, so the row keeps half the widest one's width in from the wall)
    const widest = X ? 0 : Math.max(...ds.map(d => textW(ftIn(((spanOf(d)[1] - spanOf(d)[0]) / gridSize) * 12), fsV, true)), ...wallGaps(objects, w, { gs: gridSize }).map(g => textW(ftIn(((g.hi - g.lo) / gridSize) * 12), fsV))) + fsV * 0.4
    const need = X ? fsV * 0.8 : widest / 2 + pad
    const rowOff = Math.min(Math.max(fsV * 1.75, need), Math.max(need, minDepth - need))
    const row = w.at + inward * rowOff
    ds.forEach((d, i) => {
      const color = d.stroke || '#6366f1', S = doorShades(color), [s0, s1] = spanOf(d), c = main[i]
      // the bar: on the wall, centred on its middle, at the door's true width
      const fp = fpOf(w), wt = fp ? Math.abs((w.outer ?? w.at) - w.at) : 0
      const mid = fp ? (w.at + (w.outer ?? w.at)) / 2 : w.at, bd = Math.max(BAR_FT * gridSize, wt)
      const b0 = P(s0, mid - bd / 2), b1 = P(s1, mid + bd / 2)
      out.bars.push({ id: d.id, x: Math.min(b0.x, b1.x), y: Math.min(b0.y, b1.y), w: Math.abs(b1.x - b0.x), h: Math.abs(b1.y - b0.y), fill: S.light, stroke: color })
      for (const cc of clears[i]) out.boxes.push({ id: d.id, x: cc.x, y: cc.y, w: cc.w, h: cc.h, stroke: color })
      // the badge: in the box's corner away from the wall, at its right end (a wall along y: its top end)
      // (a box too shallow for it — a man door's 44 in: just past the box's far edge instead, still inside the building)
      const edge = X ? (inward > 0 ? c.y + c.h : c.y) : (inward > 0 ? c.x + c.w : c.x), fitsIn = 2 * (r + inset) <= depthOf(c) + 1e-6
      const far = edge + (fitsIn ? -1 : 1) * inward * (r + inset)
      const along = X ? hi(c) - r - inset : lo(c) + r + inset
      const bc = P(along, far), num = String(nums.get(d.id) || '').replace(/^[A-Z]+/, '')
      if (num && 2 * (r + inset) <= (X ? c.w : c.h) + 1e-6) {
        const tb = { x: bc.x - r, y: bc.y - r, w: 2 * r, h: 2 * r }
        out.labels.push({ kind: 'badge', key: 'b:' + d.id, id: d.id, fs: fsB, at: bc, box: tb, ops: [
          { op: 'circle', x: bc.x, y: bc.y, r, fill: S.light, stroke: S.mid, strokeWidth: 1 * u },
          { op: 'text', x: tb.x, y: tb.y, w: tb.w, h: tb.h, text: num, fontSize: fsB, fill: S.dark, fontFamily: FONT, fontStyle: '500' },
        ] })
      }
      // the width: a short dimension line across the door's own width, the value bold in a break — inside the box
      const text = ftIn(((s1 - s0) / gridSize) * 12), tw = textW(text, fsV, true), bw = tw + fsV * 0.4, bh = fsV * 1.4
      const alongExt = X ? bw : bh
      if (alongExt <= hi(c) - lo(c) + 1e-6) {
        const m = (s0 + s1) / 2, at = P(m, row), box = { x: at.x - bw / 2, y: at.y - bh / 2, w: bw, h: bh }
        const ops = [], brk = alongExt / 2 + pad
        const ln = (a, b2) => ({ op: 'line', points: [a.x, a.y, b2.x, b2.y], stroke: DIM_INK, strokeWidth: 1 * u })
        if (s1 - s0 > 2 * brk) ops.push(ln(P(s0, row), P(m - brk, row)), ln(P(m + brk, row), P(s1, row)), ln(P(s0, row - tick), P(s0, row + tick)), ln(P(s1, row - tick), P(s1, row + tick)))
        ops.push({ op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text, fontSize: fsV, fill: DIM_INK, fontFamily: FONT, fontStyle: '700' })
        out.labels.push({ kind: 'width', key: 'w:' + d.id, id: d.id, fs: fsV, at, box, ops, stop: { kind: 'door', id: d.id, lo: s0, hi: s1 }, wallKey: key, w })
      }
    })
    // the gaps: plain text between the boxes (the first: the corner to the first box), regular, no line
    const gaps = wallGaps(objects, w, { gs: gridSize })
    gaps.forEach((g, i) => {
      if (!(g.hi - g.lo > 0.5)) return
      const a = i === 0 ? w.lo : hi(main[i - 1]), b = lo(main[i])
      const text = ftIn(((g.hi - g.lo) / gridSize) * 12), tw = textW(text, fsV), bw = tw + fsV * 0.4, bh = fsV * 1.4
      if ((X ? bw : bh) + 2 * pad > b - a + 1e-6) return
      const at = P((a + b) / 2, row), box = { x: at.x - bw / 2, y: at.y - bh / 2, w: bw, h: bh }
      out.labels.push({ kind: 'gap', key: 'g:' + key + ':' + i, fs: fsV, at, box, stop: { kind: 'gap', gap: g, lo: g.lo, hi: g.hi }, wallKey: key, w,
        ops: [{ op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text, fontSize: fsV, fill: DIM_INK, fontFamily: FONT, fontStyle: '400' }] })
    })
  }
  // a door on no wall: its footprint as the bar
  for (const d of doors) if (!out.bars.some(b => b.id === d.id)) { const f = doorFoot(d), S = doorShades(d.stroke || '#6366f1'); out.bars.push({ id: d.id, x: f.x0, y: f.y0, w: f.x1 - f.x0, h: f.y1 - f.y0, fill: S.light, stroke: d.stroke || '#6366f1' }) }
  return out
}

/** The live gap while placing (DoorBar.jsx): plain text inside the building between `lo` and `hi` along wall `w`, as the
 *  gaps are; `u` one label px (with the 11 px floor — it is the tool's feedback, read while typing). → { ops, box }.
 *  `cursor`: a thin text cursor after the value (a gap being typed). */
export function gapOps(w, lo, hi, text, u = 1, { cursor = false } = {}) {
  const fs = VALUE_FS * u, X = w.axis === 'x', inward = w.inward || 1, row = w.at + inward * fs * 1.75, m = (lo + hi) / 2
  const at = X ? { x: m, y: row } : { x: row, y: m }, tw = textW(text, fs), bw = tw + fs * 0.4, bh = fs * 1.4
  const box = { x: at.x - bw / 2, y: at.y - bh / 2, w: bw, h: bh }
  const ops = [{ op: 'text', x: box.x, y: box.y, w: bw, h: bh, text, fontSize: fs, fill: DIM_INK, fontFamily: FONT, fontStyle: '400' }]
  if (cursor) { const cx = at.x + tw / 2 + fs * 0.08; ops.push({ op: 'line', points: [cx, at.y - fs * 0.55, cx, at.y + fs * 0.55], stroke: DIM_INK, strokeWidth: 0.8 * u }) }
  return { ops, box }
}

/** The PDF: the doors as on the canvas zoomed in — the clear boxes dashed, the bars, every label (`lz`: its label scale). */
export function doorDrawingSVG(objects, gridSize = 40, lz = 1, opToSVG) {
  const D = doorDrawing(objects, gridSize, lz), sw = 1 / lz
  const boxes = D.boxes.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${b.stroke}" stroke-width="${sw}" stroke-dasharray="${6 / lz} ${4 / lz}"/>`)
  const bars = D.bars.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${b.fill}" stroke="${b.stroke}" stroke-width="${sw}"/>`)
  return boxes.join('') + bars.join('') + D.labels.flatMap(l => l.ops).map(opToSVG).join('')
}
