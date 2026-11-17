// render/doorAnnot.js — the doors as drawn (doors-edit; STUDIO.md, Doors; mockups doors5.png, then chain.png — the source
// of truth for the dimensions), shared by the canvas (canvas2/DoorAnnot.jsx) and the PDF (export/pdfExport.js):
//
//   - the door: a thin bar ON the wall at its true width (a light shade of the door's colour, its colour as the outline),
//     centred on the wall, 1.5 ft deep (or the wall's thickness, if more); no filled door box, no tag on it;
//   - its clear space: the dashed box in the door's colour (utils/doorClear.js);
//   - its number: just the number (1, 2, 3 … — utils/doorWall.js doorNumbers: one sequence, per wall) in a small round
//     badge at the clear space's top-right corner (away from the wall, at its right end; a wall along y: its top end):
//     inside with a clear margin when every door's on the wall fits clear of the chain, else centred ON that corner — the
//     same on every door of the wall; the circle a light shade of the door's colour, snug round its number, a ring a mid
//     shade, the number medium in the dark shade at 0.8 of the values (never under 11 px); one bigger than its box hides;
//   - THE CHAIN (chain.png): one dimension line per wall with doors, just above the door bars, corner to far corner —
//     gap, door width, gap, door width … the last door to the far corner — a tick at every door edge and both corners.
//     Each value centred on its own segment, in a break of the line: a width bold in the door's colour, a gap regular in
//     the dimension blue. Only a value too wide for its segment lifts STRAIGHT UP on a short leader, above the boxes —
//     never sideways. A click on a value types it (DoorGapEdit.jsx); the chain follows a door while it is dragged.
// Nothing for doors outside the wall. Every value is the SAME drawing size as the aisle width labels (AISLE_LABEL_FONT_PX
// label px), laid out at the size it is drawn (`lz` from floorUnit — 11 px on screen at least); on the canvas a grown width
// that would cover another object hides (minText — Rule 8), a gap never does while its wall's other labels show.

import { DIM_INK } from './buildingDims'
import { AISLE_LABEL_FONT_PX } from '../canvas2/hitTest'
import { ftIn } from '../utils/bom'
import { doorWall, doorNumbers, doorFoot, wallKey, doorsOnWall, spanOf, wallGaps } from '../utils/doorWall'
import { isDoor } from '../utils/doorTool'
import { doorClearOf } from '../utils/doorClear'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
export const BAR_FT = 1.5                       // the door bar's depth across the wall (ft), the wall's thickness if more
export const DOOR_FS = AISLE_LABEL_FONT_PX       // label px: every door label (the badge's number, a width, a gap) — the aisle labels' size
export const BADGE_K = 0.8                       // the badge's number, x the width text's font (never under 11 px on screen)
export const WIDTH_OFF_FT = 1                    // the chain: this far past the door bars (ft), or more for its values

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
 * `lz`: the label scale (render/labelSize.js) — one label px is 1 / lz world px. `minFs`: the smallest font (world px) — the
 * canvas's 11 px at its zoom (the badge's number is BADGE_K of the values', never under it).
 */
export function doorDrawing(objects, gridSize = 40, lz = 1, { minFs = 0 } = {}) {
  const u = 1 / lz, doors = (objects || []).filter(isDoor)
  const out = { bars: [], boxes: [], labels: [], chains: [] }
  if (!doors.length) return out
  const nums = doorNumbers(objects, gridSize)
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
    // the bar: on the wall, centred on its middle, BAR_FT deep (the wall's thickness, if more); its inner edge on the floor
    const fp = fpOf(w), wt = fp ? Math.abs((w.outer ?? w.at) - w.at) : 0
    const mid = fp ? (w.at + (w.outer ?? w.at)) / 2 : w.at, bd = Math.max(BAR_FT * gridSize, wt)
    // the sizes: the values at the aisle labels' size; the badge's number BADGE_K of it — never under 11 px on screen
    // (`minFs`, world px: the canvas's) — its circle snug round it
    const fsV = DOOR_FS * u, fsB = Math.max(BADGE_K * fsV, minFs || 0), tick = fsV * 0.4, margin = fsB * 0.3
    const barIn = mid + inward * bd / 2
    const nearOf = (c) => (X ? (inward > 0 ? c.y : c.y + c.h) : (inward > 0 ? c.x : c.x + c.w))
    const placed = []                                   // the wall's label boxes (a badge, a lifted value keep off them)
    const hit = (b) => placed.some(q => b.x < q.x + q.w - 1e-6 && q.x < b.x + b.w - 1e-6 && b.y < q.y + q.h - 1e-6 && q.y < b.y + b.h - 1e-6)
    const ln = (p, q, stroke = DIM_INK) => ({ op: 'line', points: [p.x, p.y, q.x, q.y], stroke, strokeWidth: u })
    ds.forEach((d, i) => {
      const color = d.stroke || '#6366f1', S = doorShades(color), [s0, s1] = spanOf(d)
      const b0 = P(s0, mid - bd / 2), b1 = P(s1, mid + bd / 2)
      out.bars.push({ id: d.id, x: Math.min(b0.x, b1.x), y: Math.min(b0.y, b1.y), w: Math.abs(b1.x - b0.x), h: Math.abs(b1.y - b0.y), fill: S.light, stroke: color })
      for (const cc of clears[i]) out.boxes.push({ id: d.id, x: cc.x, y: cc.y, w: cc.w, h: cc.h, stroke: color })
    })
    // its segments, corner to corner: gap, door width, gap … the last door to the far corner; a tick at every stop
    const segs = []
    for (const g of wallGaps(objects, w, { gs: gridSize, withEnd: true })) {
      const d = g.after ? ds.find(q => q.id === g.after) : null
      if (g.hi - g.lo > 0.5) segs.push({ kind: 'gap', lo: g.lo, hi: g.hi, g })
      if (d) { const [s0, s1] = spanOf(d); segs.push({ kind: 'width', lo: s0, hi: s1, d }) }
    }
    // THE CHAIN (chain.png): one line just above the door bars — WIDTH_OFF_FT past them, or enough that every value centred
    // on it clears the bar (a wall along y: its values stand upright, so their widths run across the wall)
    const extOf = (q) => { const t = ftIn(((q.hi - q.lo) / gridSize) * 12); return X ? fsV * 1.4 : textW(t, fsV, q.kind === 'width') + fsV * 0.4 }
    const line = barIn + inward * Math.max(WIDTH_OFF_FT * gridSize, Math.max(fsV * 1.4, ...segs.map(extOf)) / 2 + fsV * 0.15)
    const stops = [...new Set([w.lo, w.hi, ...segs.flatMap(q => [q.lo, q.hi])].map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
    // each value centred on its own segment, in a break of the line; one too wide for its segment lifts STRAIGHT UP on a
    // short leader, above the boxes (never sideways — a row further out only past another lifted value)
    const above = Math.max(...main.map(c => (nearOf(c) - w.at) * inward + depthOf(c)))
    const lifts = [], breaks = []
    for (const q of segs) {
      const W = q.kind === 'width', text = ftIn(((q.hi - q.lo) / gridSize) * 12), bw = textW(text, fsV, W) + fsV * 0.4, bh = fsV * 1.4
      const al = X ? bw : bh, ext = X ? bh : bw, m = (q.lo + q.hi) / 2, color = W ? (q.d.stroke || '#6366f1') : DIM_INK
      const boxAt = (at) => ({ x: at.x - bw / 2, y: at.y - bh / 2, w: bw, h: bh })
      const base = W ? { kind: 'width', key: 'w:' + q.d.id, id: q.d.id, stop: { kind: 'door', id: q.d.id, lo: q.lo, hi: q.hi } }
        : { kind: 'gap', key: 'g:' + key + ':' + (q.g.after || 'end'), keep: true, stop: { kind: 'gap', gap: q.g, lo: q.lo, hi: q.hi } }
      const textOp = (box) => ({ op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text, fontSize: fsV, fill: color, fontFamily: FONT, fontStyle: W ? '700' : '400' })
      if (al + fsV * 0.5 <= q.hi - q.lo + 1e-6) {
        const at = P(m, line), box = boxAt(at)
        breaks.push([m - al / 2 - fsV * 0.15, m + al / 2 + fsV * 0.15])
        placed.push(box)
        out.labels.push({ ...base, fs: fsV, at, box, ops: [textOp(box)], wallKey: key, w })
      } else lifts.push({ q, base, ext, m, boxAt, textOp })
    }
    // the line, broken round the values on it, and its ticks
    const cops = []
    let from = stops[0]
    for (const [a, b] of breaks.sort((p, q) => p[0] - q[0])) { if (a > from) cops.push(ln(P(from, line), P(a, line))); from = Math.max(from, b) }
    if (stops[stops.length - 1] > from) cops.push(ln(P(from, line), P(stops[stops.length - 1], line)))
    for (const v of stops) cops.push(ln(P(v, line - tick), P(v, line + tick)))
    out.chains.push({ wallKey: key, ops: cops })
    // the badges: the box's top-right corner (away from the wall, at its right end — a wall along y: its top end) — inside
    // with a clear margin when every door's on the wall fits clear of the chain; otherwise centred ON that corner — the same
    // on every door of the wall. One bigger than its door's box is not drawn (Rule 8 — it returns as you zoom in)
    const chainFar = (line - w.at) * inward + Math.max(tick, fsV * 0.7)
    const per = ds.map((d, i) => {
      const c = main[i], near = nearOf(c), num = String(nums.get(d.id) || '').replace(/^[A-Z]+/, '')
      const r = Math.max(0.6 * fsB, textW(num, fsB) / 2 + 0.16 * fsB)
      const fitsIn = (near - w.at) * inward + depthOf(c) - margin - 2 * r >= chainFar + margin - 1e-6 && 2 * (r + margin) <= hi(c) - lo(c) + 1e-6
      return { d, c, S: doorShades(d.stroke || '#6366f1'), num, r, near, fitsIn }
    })
    const allIn = per.every(p => !p.num || p.fitsIn)
    for (const p of per) {
      const { d, c, S, num, r, near } = p
      if (!num || 2 * r > Math.min(hi(c) - lo(c), depthOf(c)) + 1e-6) continue
      const edge = near + inward * depthOf(c), sq = (q) => ({ x: q.x - r, y: q.y - r, w: 2 * r, h: 2 * r })
      const bc = allIn ? P(X ? hi(c) - r - margin : lo(c) + r + margin, edge - inward * (r + margin)) : P(X ? hi(c) : lo(c), edge)
      const tb = sq(bc)
      out.labels.push({ kind: 'badge', key: 'b:' + d.id, id: d.id, fs: fsB, at: bc, box: tb, wallKey: key, ops: [
        { op: 'circle', x: bc.x, y: bc.y, r, fill: S.light, stroke: S.mid, strokeWidth: u },
        { op: 'text', x: tb.x, y: tb.y, w: tb.w, h: tb.h, text: num, fontSize: fsB, fill: S.dark, fontFamily: FONT, fontStyle: '500' },
      ] })
      placed.push(tb)
    }
    // (the lifted values last: straight up past the boxes, and past a badge on a corner)
    for (const L of lifts) {
      let at = null
      for (let j = 0; !at && j <= 8; j++) { const p = P(L.m, w.at + inward * (above + fsV * 0.5 + L.ext / 2 + j * (L.ext + fsV * 0.3))); if (!hit(L.boxAt(p)) || j === 8) at = p }
      const box = L.boxAt(at), tip = P(L.m, (X ? at.y : at.x) - inward * L.ext / 2)
      placed.push(box)
      out.labels.push({ ...L.base, fs: fsV, at, box, ops: [ln(P(L.m, line), tip), L.textOp(box)], wallKey: key, w })
    }
  }
  // a door on no wall: its footprint as the bar
  for (const d of doors) if (!out.bars.some(b => b.id === d.id)) { const f = doorFoot(d), S = doorShades(d.stroke || '#6366f1'); out.bars.push({ id: d.id, x: f.x0, y: f.y0, w: f.x1 - f.x0, h: f.y1 - f.y0, fill: S.light, stroke: d.stroke || '#6366f1' }) }
  return out
}

/** The live gap while placing (DoorBar.jsx): plain text inside the building between `lo` and `hi` along wall `w`, as the
 *  gaps are; `u` one label px (with the 11 px floor — it is the tool's feedback, read while typing). → { ops, box }.
 *  `cursor`: a thin text cursor after the value (a gap being typed). */
export function gapOps(w, lo, hi, text, u = 1, { cursor = false } = {}) {
  const fs = DOOR_FS * u, X = w.axis === 'x', inward = w.inward || 1, row = w.at + inward * fs * 1.75, m = (lo + hi) / 2
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
  return boxes.join('') + bars.join('') + D.chains.flatMap(c => c.ops).map(opToSVG).join('') + D.labels.flatMap(l => l.ops).map(opToSVG).join('')
}
