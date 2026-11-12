// columnAnnot.js — a column grid's gridlines, their names and its dimension chains (col-grid round; STUDIO.md §7a
// Columns). The gridlines run through the building, thin and dashed; each is named in a bubble outside the building —
// A, B, C … across its top, 1, 2, 3 … down its left; along the top and the left a dimension chain: the wall to the first
// gridline (the offset — none when 0), each spacing, the last gridline to the far wall (the last bay). Pure layout in
// world px at label scale `lz` (render/labelSize.js): the canvas draws it while the grid is selected
// (canvas2/ColumnGridAnnot.jsx), the PDF always (export/pdfExport.js).

import { gridLines, gridBuilding, lineName } from '../utils/columnGrid'
import { buildingOutline } from '../utils/floorGeom'
import { ftIn } from '../utils/bom'

export const ANNOT = { line: '#8A9AB0', ink: '#3B6FB5', bubbleFill: '#FFFFFF' }

/** The annotation of grid `cg` → { lines: [{ x1, y1, x2, y2 }], bubbles: [{ x, y, r, text }], chain: [{ x1, y1, x2, y2,
 *  ticks: [[x, y]], text, tx, ty, vert }], fs } or null (no building). */
export function columnAnnot(cg, objects, gridSize = 40, lz = 1) {
  const fp = gridBuilding(objects, cg)
  if (!fp || !Array.isArray(cg?.spacingX) || !Array.isArray(cg?.spacingY)) return null
  const p = buildingOutline(fp), x0 = Math.min(...p.map(q => q.x)), x1 = Math.max(...p.map(q => q.x)), y0 = Math.min(...p.map(q => q.y)), y1 = Math.max(...p.map(q => q.y))
  const { xs, ys } = gridLines(cg)
  const fs = 10 / lz, r = 8 / lz, chainOff = 18 / lz, bubbleOff = chainOff + 16 / lz + r, tick = 3 / lz
  const lines = [], bubbles = [], chain = []
  xs.forEach((x, i) => { lines.push({ x1: x, y1: y0 - bubbleOff + r, x2: x, y2: y1 }); bubbles.push({ x, y: y0 - bubbleOff, r, text: lineName(i, 'x') }) })
  ys.forEach((y, i) => { lines.push({ x1: x0 - bubbleOff + r, y1: y, x2: x1, y2: y }); bubbles.push({ x: x0 - bubbleOff, y, r, text: lineName(i, 'y') }) })
  const words = (px) => ftIn((px / gridSize) * 12)
  // the chain along the top: wall, gridlines, far wall
  const stopsX = [x0, ...xs.filter(x => x > x0 + 0.5 && x < x1 - 0.5), x1].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.5)
  const cy = y0 - chainOff
  for (let i = 0; i + 1 < stopsX.length; i++) chain.push({ x1: stopsX[i], y1: cy, x2: stopsX[i + 1], y2: cy, ticks: [[stopsX[i], cy], [stopsX[i + 1], cy]], text: words(stopsX[i + 1] - stopsX[i]), tx: (stopsX[i] + stopsX[i + 1]) / 2, ty: cy - fs * 0.75, vert: false, tick })
  // and down the left
  const stopsY = [y0, ...ys.filter(y => y > y0 + 0.5 && y < y1 - 0.5), y1].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.5)
  const cx = x0 - chainOff
  for (let i = 0; i + 1 < stopsY.length; i++) chain.push({ x1: cx, y1: stopsY[i], x2: cx, y2: stopsY[i + 1], ticks: [[cx, stopsY[i]], [cx, stopsY[i + 1]]], text: words(stopsY[i + 1] - stopsY[i]), tx: cx - fs * 0.75, ty: (stopsY[i] + stopsY[i + 1]) / 2, vert: true, tick })
  return { lines, bubbles, chain, fs }
}
