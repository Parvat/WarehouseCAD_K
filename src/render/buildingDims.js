// buildingDims.js — the building's size labels as dimension lines (col-grid round; STUDIO.md §7 Building size): a thin
// blue line outside the wall, short ticks at its ends, short dashed extension lines from the corners, and the length in
// bold in a break in the line (feet-inches). A rectangle gets two — its bottom and its right wall, the overall size — so
// the top and the left stay free for a column grid's chain and nothing sits under the rotate handle; an L or a custom
// shape gets one outside every wall. Pure layout in the building's own (unrotated) world px at label scale `lz`
// (render/labelSize.js): the canvas draws it while the building is selected (canvas2/DimensionLabels.jsx FpDimLabels),
// a click on a value types it (canvas2/FpDimEdit.jsx), and the PDF always draws it (export/pdfExport.js).

import { getFpWallSegments, pxToFtIn } from '../utils/canvas'

export const DIM_INK = '#3B6FB5'

const isRect = (walls) => walls.length === 4 && walls.every(s => Math.abs(s.a.x - s.b.x) < 0.5 || Math.abs(s.a.y - s.b.y) < 0.5)

/** Building `fp`'s dimension lines → [{ wallIdx, line: [[x1, y1, x2, y2] …] (the line either side of the break),
 *  ticks: [[x1, y1, x2, y2] …], ext: [[x1, y1, x2, y2] …] (dashed), text, tx, ty, angle (deg), fs, tw (the text's
 *  length), box: { x, y, w, h } (the value's box, axis-aligned), lenFt }]. */
export function buildingDims(fp, gridSize = 40, lz = 1) {
  const walls = getFpWallSegments(fp, gridSize)
  if (!walls?.length) return []
  let area = 0
  for (let i = 0; i < walls.length; i++) { const j = (i + 1) % walls.length; area += walls[i].a.x * walls[j].a.y - walls[j].a.x * walls[i].a.y }
  const ws = area >= 0 ? 1 : -1
  const fs = 11 / lz, off = 22 / lz, tick = 3 / lz, extGap = 4 / lz, extOver = 4 / lz, pad = 4 / lz
  const rect = isRect(walls)
  const out = []
  walls.forEach((seg, i) => {
    const edx = seg.b.x - seg.a.x, edy = seg.b.y - seg.a.y, len = Math.hypot(edx, edy)
    if (len < 0.5) return
    const ux = edx / len, uy = edy / len, nx = ws * uy, ny = ws * -ux
    if (rect && !(ny > 0.5 || nx > 0.5)) return   // a rectangle: the bottom and the right wall only
    const d1 = [seg.a.x + nx * off, seg.a.y + ny * off], d2 = [seg.b.x + nx * off, seg.b.y + ny * off]
    const cx = (d1[0] + d2[0]) / 2, cy = (d1[1] + d2[1]) / 2
    const text = pxToFtIn(seg.lenPx, gridSize), tw = text.length * fs * 0.62
    const g = Math.min(tw / 2 + pad, len / 2)
    let angle = Math.atan2(uy, ux) * 180 / Math.PI
    if (angle >= 90 - 1e-6) angle -= 180
    if (angle < -90 - 1e-6) angle += 180
    const th = fs * 1.4, ca = Math.abs(Math.cos(angle * Math.PI / 180)), sa = Math.abs(Math.sin(angle * Math.PI / 180))
    const bw = tw * ca + th * sa, bh = tw * sa + th * ca
    out.push({
      wallIdx: i,
      line: [[d1[0], d1[1], cx - ux * g, cy - uy * g], [cx + ux * g, cy + uy * g, d2[0], d2[1]]],
      ticks: [d1, d2].map(([x, y]) => [x - nx * tick, y - ny * tick, x + nx * tick, y + ny * tick]),
      ext: [seg.a, seg.b].map(p => [p.x + nx * extGap, p.y + ny * extGap, p.x + nx * (off + extOver), p.y + ny * (off + extOver)]),
      text, tx: cx, ty: cy, angle, fs, tw, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }, lenFt: seg.lenFt,
    })
  })
  return out
}

/** How far the dimension lines reach outside the building's box on each side (world px at `lz`) — the legend sits
 *  below the bottom one, the selection bar clears them. A rectangle: bottom and right only. */
export function dimReach(fp, gridSize = 40, lz = 1) {
  const walls = getFpWallSegments(fp, gridSize)
  const r = (22 + 11 * 0.7 + 2) / lz
  if (!walls?.length) return { top: 0, left: 0, right: 0, bottom: 0 }
  // (the top kept clear as before even with no size line there: the side handle, the rotate handle and a column chain)
  return isRect(walls) ? { top: r, left: 0, right: r, bottom: r } : { top: r, left: r, right: r, bottom: r }
}
