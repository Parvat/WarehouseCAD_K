// render/doorAnnot.js — a door's tag and the gap chain along its wall (doors-edit round; STUDIO.md, Doors; mockup
// doors2.png), as label ops (render/labelOps.js): the canvas paints them with LabelOps (the 11 px floor applies —
// CLAUDE.md Rule 8), the PDF writes the same ops as SVG.
//
//   - The tag: the door's number (D1 … dock and drive-in, M1 … man doors — utils/doorWall.js doorNumbers) on a white
//     pill outlined in the door's colour, at the door's centre.
//   - The gap chain: inside the building, a little in from the wall's inner face — from the wall's low corner (left, or
//     top) to the first door, then between each door and the next — styled as the other dimension chains (the column
//     grid's: a line in the dimension blue, a tick at each end, the value in a break of the line; no box, no chip).
//     Each gap's full length is in its ops too (an invisible line), so a value longer than its gap hides instead of
//     shrinking. The canvas shows it for the wall of a selected door; the PDF for every wall with doors.

import { pillOps } from './labelOps'
import { DIM_INK } from './buildingDims'
import { ftIn } from '../utils/bom'
import { doorWall, wallGaps, doorNumbers, doorFoot, wallKey } from '../utils/doorWall'
import { isDoor } from '../utils/doorTool'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/** Door `d`'s tag ops (`num`: its number). `lz`: the label scale (render/labelSize.js). */
export function doorTagOps(d, num, lz = 1) {
  if (!num) return []
  const f = doorFoot(d), u = 1 / lz, color = d.stroke || '#6366f1'
  return pillOps((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, num, 10.5 * u, lz, { color, bg: '#FFFFFF', stroke: color, strokeWidth: 1 * u, opacity: 1, padX: 4 * u, rx: 3 * u })
}

/** One gap of wall `w`, from `lo` to `hi` (world px along it), its value `text` → { ops, box } — the chain's look (the
 *  column grid's): a line in the dimension blue a little in from the wall's inner face, a tick at each end, the value in a
 *  break of the line; the gap's full length kept invisible in the ops (its room). `cursor`: a thin text cursor after
 *  the value (a gap being typed). */
export function gapOps(w, lo, hi, text, lz = 1, { cursor = false } = {}) {
  const u = 1 / lz, fs = 10.5 * u, tick = 5.5 * u, pad = 3 * u
  // in from the wall's inner face (a section edge: on its +1 side)
  const side = w.inward || 1, at = w.at + side * 26 * u
  const L = hi - lo, tw = text.length * fs * 0.6, m = (lo + hi) / 2, brk = Math.min(tw / 2 + pad, L / 2)
  const P = (q, c) => (w.axis === 'x' ? [q, c] : [c, q])
  const seg = (p, q) => ({ op: 'line', points: [...P(p, at), ...P(q, at)], stroke: DIM_INK, strokeWidth: 1 * u })
  const tk = (q) => ({ op: 'line', points: [...P(q, at - tick), ...P(q, at + tick)], stroke: DIM_INK, strokeWidth: 1 * u })
  const [bx, by] = P(m, at), bw = tw + fs * 0.4, bh = fs * 1.4
  const box = { x: bx - bw / 2, y: by - bh / 2, w: bw, h: bh }
  const ops = [
    { op: 'line', points: [...P(lo, at), ...P(hi, at)], stroke: DIM_INK, strokeWidth: 0, opacity: 0 },
    ...(L - 2 * brk > 0.01 ? [seg(lo, m - brk), seg(m + brk, hi)] : []), tk(lo), tk(hi),
    { op: 'text', x: box.x, y: box.y, w: box.w, h: box.h, text, fontSize: fs, fill: DIM_INK, fontFamily: FONT, fontStyle: '600' },
  ]
  if (cursor) { const cx = bx + tw / 2 + fs * 0.08; ops.push({ op: 'line', points: [cx, by - fs * 0.55, cx, by + fs * 0.55], stroke: DIM_INK, strokeWidth: 0.8 * u }) }
  return { ops, box }
}

/** The gap chain of wall `w` → [{ gap (wallGaps), ops, box (the value's box, world px — a click on it types it) }]. */
export function gapChain(objects, w, gridSize = 40, lz = 1) {
  if (!w) return []
  const out = []
  for (const g of wallGaps(objects, w, { gs: gridSize })) {
    if (!(g.hi - g.lo > 0.5)) continue
    const text = ftIn(((g.hi - g.lo) / gridSize) * 12), { ops, box } = gapOps(w, g.lo, g.hi, text, lz)
    out.push({ gap: g, box, text, ops })
  }
  return out
}

/** Every wall with doors (one per wall): [w] — the PDF's chains. */
export function doorWalls(objects, gridSize = 40) {
  const seen = new Map()
  for (const d of (objects || []).filter(isDoor)) { const w = doorWall(d, objects, gridSize); if (w && !seen.has(wallKey(w))) seen.set(wallKey(w), w) }
  return [...seen.values()]
}

/** Every door's tag ops and every wall's gap chain ops — the PDF (always both). */
export function doorAnnotOps(objects, gridSize = 40, lz = 1) {
  const nums = doorNumbers(objects, gridSize), out = []
  for (const d of (objects || []).filter(isDoor)) out.push(...doorTagOps(d, nums.get(d.id), lz))
  for (const w of doorWalls(objects, gridSize)) for (const c of gapChain(objects, w, gridSize, lz)) out.push(...c.ops)
  return out
}
