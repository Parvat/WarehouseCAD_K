// columnAnnot.js — a column grid's gridlines, their names and its dimension chains (col-grid round; STUDIO.md §7a
// Columns). The gridlines run through the building, thin and dashed; each is named in a bubble outside the building —
// A, B, C … across its top, 1, 2, 3 … down its left; along the top and the left a dimension chain: the wall to the first
// gridline (the offset — none when 0), each spacing, the last gridline to the far wall (the last bay), each value
// upright in a break in the chain. Pure layout in world px at label scale `lz` (render/labelSize.js): the canvas draws
// it while the grid is selected (canvas2/ColumnGridAnnot.jsx), the PDF always (export/pdfExport.js).
// Every value from the colgrid mockup (measured on it, ÷ 2.13 — its card's 64px field is the card's 30): the chain
// 14 off the wall, ticks 5.5 either side, its values 10.5 / 600 in the dimension blue; the bubbles r 9.5, centred 40
// off the wall, white with a 1px #2B2F2C ring and 11 / 600 #2B2F2C names; the gridlines 1px #9AA29C, dashed 4 · 4.

import { gridLines, gridBuilding, lineName } from '../utils/columnGrid'
import { buildingOutline } from '../utils/floorGeom'
import { ftIn } from '../utils/bom'
import { DIM_INK } from './buildingDims'
import { dimChain } from './dimChain'

export const ANNOT = { line: '#9AA29C', ink: DIM_INK, bubble: '#2B2F2C', bubbleFill: '#FFFFFF' }

/** The annotation of grid `cg` → { lines: [{ x1, y1, x2, y2 }], bubbles: [{ x, y, r, fs, text, axis, i (the gridline it names) }], chain: [{ segs:
 *  [[x1, y1, x2, y2] …] (the chain either side of the value's break — or, a value too long for its bay, the whole bay and
 *  no text: render/dimChain.js), ticks: [[x1, y1, x2, y2] …], text ('' when left out), tw (its width), tx, ty, out }],
 *  fs, dash, u (one label px) } or null (no building). At its drawing size (labels-final); the canvas hides a value or a
 *  bubble under 11 px on screen. */
export function columnAnnot(cg, objects, gridSize = 40, lz = 1, clear = null) {
  const fp = gridBuilding(objects, cg)
  if (!fp || !Array.isArray(cg?.spacingX) || !Array.isArray(cg?.spacingY)) return null
  const p = buildingOutline(fp), x0 = Math.min(...p.map(q => q.x)), x1 = Math.max(...p.map(q => q.x)), y0 = Math.min(...p.map(q => q.y)), y1 = Math.max(...p.map(q => q.y))
  const { xs, ys } = gridLines(cg)
  const u = 1 / lz
  const fs = 10.5 * u, r = 9.5 * u, pad = 3 * u
  const words = (px) => ftIn((px / gridSize) * 12)
  const tw = (t) => t.length * fs * 0.6
  // the chain 14 off the wall — or, where something already sits outside that wall (`clear`: how far the row numbers
  // reach past it, world px — canvas2/ColumnGridAnnot.jsx), just past that, its values clear of it; the bubbles move
  // out with it
  const stopsY = [y0, ...ys.filter(y => y > y0 + 0.5 && y < y1 - 0.5), y1].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.5)
  const halfW = Math.max(0, ...stopsY.slice(1).map((v, i) => tw(words(v - stopsY[i])) / 2))
  const topOff = Math.max(14 * u, clear?.top ? clear.top + pad + fs * 0.6 : 0), leftOff = Math.max(14 * u, clear?.left ? clear.left + pad + halfW : 0)
  const lines = [], bubbles = [], chain = []
  // the chains (render/dimChain.js): a value too long for its bay is left out (labels-final); the bubbles past them
  const stopsX = [x0, ...xs.filter(x => x > x0 + 0.5 && x < x1 - 0.5), x1].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.5)
  const side = (stops, axis, at) => {
    const c = dimChain(stops.slice(1).map((b, i) => ({ lo: stops[i], hi: b, text: words(b - stops[i]), style: '600' })), { axis, at, out: -1, u, ink: DIM_INK })
    for (const it of c.items) {
      const lns = it.ops.filter(o => o.op === 'line').map(o => o.points)
      chain.push({ segs: lns, ticks: [], text: it.hidden ? '' : it.stop.text, tw: tw(it.stop.text), tx: it.box.x + it.box.w / 2, ty: it.box.y + it.box.h / 2, axis, lo: it.stop.lo, hi: it.stop.hi, out: it.out })
    }
    return c.hidden ? 0 : c.reach
  }
  const topReach = side(stopsX, 'x', y0 - topOff), leftReach = side(stopsY, 'y', x0 - leftOff)
  const topB = topOff + Math.max(26 * u, topReach + 4 * u + r), leftB = leftOff + Math.max(26 * u, leftReach + 4 * u + r)
  xs.forEach((x, i) => { lines.push({ x1: x, y1: y0 - topB + r, x2: x, y2: y1, axis: 'x', i }); bubbles.push({ x, y: y0 - topB, r, fs: 11 * u, text: lineName(i, 'x'), axis: 'x', i }) })
  ys.forEach((y, i) => { lines.push({ x1: x0 - leftB + r, y1: y, x2: x1, y2: y, axis: 'y', i }); bubbles.push({ x: x0 - leftB, y, r, fs: 11 * u, text: lineName(i, 'y'), axis: 'y', i }) })
  return { lines, bubbles, chain, fs, dash: 4 * u, u }
}
