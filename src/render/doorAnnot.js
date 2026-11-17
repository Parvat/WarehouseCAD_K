// render/doorAnnot.js — the doors as drawn (doors-edit; STUDIO.md, Doors; mockup doors5.png — the source of truth), shared
// by the canvas (canvas2/DoorAnnot.jsx) and the PDF (export/pdfExport.js), so both draw the same thing:
//
//   - the door: a thin bar ON the wall at its true width (a light shade of the door's colour, its colour as the outline),
//     centred on the wall, 1.5 ft deep (or the wall's thickness, if more); no filled door box, no tag on it;
//   - its clear space: the dashed box in the door's colour (utils/doorClear.js);
//   - its number: just the number (1, 2, 3 … — utils/doorWall.js doorNumbers: one sequence, per wall) in a small round
//     badge at the clear space's top-right corner (away from the wall, at its right end; a wall along y: its top end):
//     inside with a clear margin when every door's on the wall fits, else centred ON that corner — the same on every door
//     of the wall; the circle a light shade of the door's colour, snug round its number, a ring a mid shade, the number
//     medium in the dark shade at 0.8 of the width text (never under 11 px); one bigger than its box is not drawn;
//   - its width: a dimension line across the door's own width (ticks at its ends) about 1 ft past the door bar
//     (WIDTH_OFF_FT), the value bold just past it; the badge never overlaps the line or the value: a box too shallow for
//     both (a man door's 44 in, or any box zoomed out) puts the badge just past its far edge, still inside the building;
//   - the gaps: plain text inside the building between the boxes, on the widths' row, no line, regular — EVERY gap: the
//     corner to the first door, door to door, the last door to the far corner; one too narrow for its text centred just
//     above it (a row further from the wall). A gap never hides while its wall's other labels show (Rule 8's exception).
// Nothing for doors outside the wall. Every label is the SAME drawing size as the aisle width labels (AISLE_LABEL_FONT_PX
// label px — doors-aisle round), and follows Rule 8 as they do: the canvas lays the doors out at the size they are drawn
// (`lz` from floorUnit — 11 px on screen at least), so they show wherever the aisle labels show and never overlap; a width
// or a badge bigger than its box is not drawn, and on the canvas one that would cover another object hides (minText) —
// both return as you zoom in. Never grouped into ranges.

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
export const WIDTH_OFF_FT = 1                    // the width's dimension line: this far past the door bar (ft)

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
  const out = { bars: [], boxes: [], labels: [] }
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
    const barIn = mid + inward * bd / 2, line = barIn + inward * WIDTH_OFF_FT * gridSize
    // the sizes: the widths and the gaps at the aisle labels' size; the badge's number BADGE_K of it — never under 11 px on
    // screen (`minFs`, world px: the canvas's) — its circle snug round it
    const fsV = DOOR_FS * u, fsB = Math.max(BADGE_K * fsV, minFs || 0), tick = fsV * 0.35, margin = fsB * 0.3
    // a value (a width, a gap) of font fs: its text box, and its row just past the width line (its centre)
    const across = (text, fs, bold) => { const bw = textW(text, fs, bold) + fs * 0.4, bh = fs * 1.4; return { bw, bh, ext: X ? bh : bw, al: X ? bw : bh } }
    const rowOf = (ext, fs) => line + inward * (fs * 0.25 + ext / 2)
    const nearOf = (c) => (X ? (inward > 0 ? c.y : c.y + c.h) : (inward > 0 ? c.x : c.x + c.w))
    const placed = []                                   // the wall's label boxes: a gap keeps off them
    const hit = (b) => placed.some(q => b.x < q.x + q.w - 1e-6 && q.x < b.x + b.w - 1e-6 && b.y < q.y + q.h - 1e-6 && q.y < b.y + b.h - 1e-6)
    const per = ds.map((d, i) => {
      const color = d.stroke || '#6366f1', S = doorShades(color), [s0, s1] = spanOf(d), c = main[i]
      const b0 = P(s0, mid - bd / 2), b1 = P(s1, mid + bd / 2)
      out.bars.push({ id: d.id, x: Math.min(b0.x, b1.x), y: Math.min(b0.y, b1.y), w: Math.abs(b1.x - b0.x), h: Math.abs(b1.y - b0.y), fill: S.light, stroke: color })
      for (const cc of clears[i]) out.boxes.push({ id: d.id, x: cc.x, y: cc.y, w: cc.w, h: cc.h, stroke: color })
      // the width: a dimension line across the door's own width ~1 ft past the bar, the value bold just past it (even where
      // that crosses the box's dashed edge — a man door's 44 in box zoomed out); not drawn when wider than its box
      const text = ftIn(((s1 - s0) / gridSize) * 12), { bw, bh, ext, al } = across(text, fsV, true)
      const near = nearOf(c), row = rowOf(ext, fsV), reach = (row - near) * inward + ext / 2
      let valueFar = null
      if (al <= hi(c) - lo(c) + 1e-6 && (line - near) * inward - tick >= -1e-6) {
        const m = (s0 + s1) / 2, at = P(m, row), box = { x: at.x - bw / 2, y: at.y - bh / 2, w: bw, h: bh }
        const ln = (p, q) => ({ op: 'line', points: [p.x, p.y, q.x, q.y], stroke: DIM_INK, strokeWidth: u })
        const ops = [ln(P(s0, line), P(s1, line)), ln(P(s0, line - tick), P(s0, line + tick)), ln(P(s1, line - tick), P(s1, line + tick)),
          { op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text, fontSize: fsV, fill: DIM_INK, fontFamily: FONT, fontStyle: '700' }]
        out.labels.push({ kind: 'width', key: 'w:' + d.id, id: d.id, fs: fsV, at, box, ops, stop: { kind: 'door', id: d.id, lo: s0, hi: s1 }, wallKey: key, w })
        const l0 = P(s0, line - tick), l1 = P(s1, line + tick)
        placed.push(box, { x: Math.min(l0.x, l1.x), y: Math.min(l0.y, l1.y), w: Math.abs(l1.x - l0.x), h: Math.abs(l1.y - l0.y) })
        valueFar = reach
      }
      const num = String(nums.get(d.id) || '').replace(/^[A-Z]+/, '')
      const r = Math.max(0.6 * fsB, textW(num, fsB) / 2 + 0.16 * fsB)
      const clearOf = Math.max(valueFar ?? 0, (line - near) * inward + tick) + margin
      const fitsIn = depthOf(c) - margin - 2 * r >= clearOf - 1e-6 && 2 * (r + margin) <= hi(c) - lo(c) + 1e-6
      return { d, c, S, num, r, near, valueFar, fitsIn }
    })
    // the badges: the box's top-right corner (away from the wall, at its right end — a wall along y: its top end) — inside
    // it with a clear margin when every door's fits; otherwise centred ON that corner — the same on every door of the wall,
    // so a row reads uniform (past the width value, if that reaches further). Never over the width; one bigger than its
    // door's box is not drawn (Rule 8 — it returns as you zoom in)
    const allIn = per.every(p => !p.num || p.fitsIn)
    for (const p of per) {
      const { d, c, S, num, r, near } = p
      if (!num || 2 * r > Math.min(hi(c) - lo(c), depthOf(c)) + 1e-6) continue
      const edge = near + inward * depthOf(c)
      // (on the corner: past the width value only where the two would meet)
      const sq = (q) => ({ x: q.x - r, y: q.y - r, w: 2 * r, h: 2 * r })
      let bc = allIn ? P(X ? hi(c) - r - margin : lo(c) + r + margin, edge - inward * (r + margin)) : P(X ? hi(c) : lo(c), edge)
      if (!allIn && hit(sq(bc))) bc = P(X ? hi(c) : lo(c), near + inward * Math.max(depthOf(c), (p.valueFar ?? 0) + r + margin))
      const tb = sq(bc)
      out.labels.push({ kind: 'badge', key: 'b:' + d.id, id: d.id, fs: fsB, at: bc, box: tb, wallKey: key, ops: [
        { op: 'circle', x: bc.x, y: bc.y, r, fill: S.light, stroke: S.mid, strokeWidth: u },
        { op: 'text', x: tb.x, y: tb.y, w: tb.w, h: tb.h, text: num, fontSize: fsB, fill: S.dark, fontFamily: FONT, fontStyle: '500' },
      ] })
      placed.push(tb)
    }
    // the gaps — every one, while the wall's other labels show: the corner to the first door, door to door, the last door
    // to the far corner. Plain text, regular, no line, between the boxes; a gap too narrow for its text: centred on the gap
    // just above it (a row further from the wall, clear of the other labels). Never hidden (`keep` — Rule 8's exception)
    if (!out.labels.some(l => l.wallKey === key && l.kind !== 'gap')) continue
    const gaps = wallGaps(objects, w, { gs: gridSize, withEnd: true })
    // (between the boxes when it fits there clear of the other labels; else just above it — a row further from the wall,
    // stepping out only past another label. The door-to-door gaps of a wall go up together, on one row — or two, alternating,
    // when their texts are wider than the doors' spacing — so they read as a line; the two end gaps decide on their own)
    const G = gaps.map((g, i) => {
      if (!(g.hi - g.lo > 0.5)) return null
      const a = i === 0 ? w.lo : hi(main[i - 1]), b = i < main.length ? lo(main[i]) : w.hi
      const pad = fsV * 0.25, text = ftIn(((g.hi - g.lo) / gridSize) * 12), { bw, bh, ext, al } = across(text, fsV, false)
      const boxAt = (at) => ({ x: at.x - bw / 2, y: at.y - bh / 2, w: bw, h: bh }), row1 = rowOf(ext, fsV), step = ext + fsV * 0.35
      const low = P((a + b) / 2, row1), m = (g.lo + g.hi) / 2, up = (j) => P(m, row1 + inward * j * step)
      return { g, i, text, boxAt, low, up, fits: al + 2 * pad <= b - a + 1e-6 && !hit(boxAt(low)), end: i === 0 || i === main.length }
    }).filter(Boolean)
    const put = (q, at) => {
      const box = q.boxAt(at)
      placed.push(box)
      out.labels.push({ kind: 'gap', key: 'g:' + key + ':' + q.i, fs: fsV, at, box, keep: true, stop: { kind: 'gap', gap: q.g, lo: q.g.lo, hi: q.g.hi }, wallKey: key, w,
        ops: [{ op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text: q.text, fontSize: fsV, fill: DIM_INK, fontFamily: FONT, fontStyle: '400' }] })
    }
    const mids = G.filter(q => !q.end), midUp = mids.some(q => !q.fits)
    for (const q of G) if (q.fits && !(midUp && !q.end)) put(q, q.low)
    if (midUp) {
      const clash = (bs) => bs.some((p, k) => hit(p) || bs.some((r, l) => l > k && p.x < r.x + r.w - 1e-6 && r.x < p.x + p.w - 1e-6 && p.y < r.y + r.h - 1e-6 && r.y < p.y + p.h - 1e-6))
      let rows = null
      for (let j = 1; !rows && j <= 8; j++) {
        for (const alt of [0, 1]) { const js = mids.map((q, k) => j + (alt && k % 2 ? 1 : 0)); if (!clash(mids.map((q, k) => q.boxAt(q.up(js[k]))))) { rows = js; break } }
        if (!rows && j === 8) rows = mids.map((q, k) => j + (k % 2))
      }
      mids.forEach((q, k) => put(q, q.up(rows[k])))
    }
    for (const q of G) if (q.end && !q.fits) { let at = null; for (let j = 1; !at && j <= 8; j++) { const p = q.up(j); if (!hit(q.boxAt(p)) || j === 8) at = p } put(q, at) }
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
  return boxes.join('') + bars.join('') + D.labels.flatMap(l => l.ops).map(opToSVG).join('')
}
