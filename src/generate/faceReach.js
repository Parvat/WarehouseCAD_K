// faceReach.js — no pick face without an aisle.
//
// A back-to-back pair has a pick face on each long side. Where one face runs
// against a wall or a zone — less than a forklift aisle of clear floor in
// front of it — nobody can pick from it, so the bays of that face are dropped
// along that stretch only: the rack stays back-to-back where both faces have
// their aisle and becomes a single row (the half that can be reached) beside
// the wall or zone. A bay neither face can reach goes. A single row keeps a
// bay while either of its sides has an aisle. Where a double piece meets a
// single one, the single carries straight on from the double's last upright
// frame: the two share that frame, as a real rack does (utils/bayBeam.js does
// not count a shared end frame as an overlap).
//
// "Clear floor" is the building's floor (its inner wall face) with no zone on
// it, an aisle deep, over the bay's whole length. Other racks are not read:
// the fill and Generate already keep their aisles off them. Pieces keep every
// field of the rack (stamps, area, layer); the first keeps its id.
//
// Used by racking areas (the last step of the pattern clip, fillRacking.js
// patternFill) and by Generate (traceGenerate.js buildQueue). Pure.

import { uprightXs } from '../render/rackOps'
import { boxOnFloor } from '../utils/floorGeom'

const E = 1e-6
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > E && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > E

/** The rack's local (unrotated) point → world, around its own centre. */
function toWorld(r) {
  const t = ((r.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  return (lx, ly) => ({ x: cx + (lx - cx) * c - (ly - cy) * s, y: cy + (lx - cx) * s + (ly - cy) * c })
}
const worldBox = (T, x0, y0, x1, y1) => {
  const p = [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)]
  const xs = p.map(q => q.x), ys = p.map(q => q.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** `racks` with every pick face that has no aisle dropped (see the file comment).
 *  `poly`: the building's inner wall face (world px); `zones`: world px boxes;
 *  `aislePx`: the forklift aisle. */
export function dropUnreachableFaces(racks, { poly, zones = [], aislePx, gridSize = 40, newId }) {
  if (!poly || !(aislePx > 0)) return racks
  const clear = (b) => boxOnFloor(poly, b) && !zones.some(z => overlaps(z, b))
  const out = []
  for (const r of racks) {
    const rot = (((r.rotation || 0) % 360) + 360) % 360
    if ((r.type !== 'rack_double_row' && r.type !== 'rack_row') || rot % 90 !== 0 || !(r.width > 0) || !(r.height > 0)) { out.push(r); continue }
    const T = toWorld(r)
    const { xs, upW, beams } = uprightXs(r, gridSize)
    const top = r.y, bot = r.y + r.height
    // per bay: which faces have their aisle — face A on the local top side, face B on the bottom
    const state = beams.map((_, i) => {
      const a = xs[i], b = xs[i + 1] + upW
      const A = clear(worldBox(T, a, top - aislePx, b, top)), B = clear(worldBox(T, a, bot, b, bot + aislePx))
      if (r.type === 'rack_row') return A || B ? 'D' : '-'
      return A && B ? 'D' : A ? 'A' : B ? 'B' : '-'
    })
    if (state.every(s => s === 'D')) { out.push(r); continue }
    const upIn = r.uprightWidth || 3
    const depthPx = ((r.depthIn ?? 42) / 12) * gridSize
    let first = true
    for (let i = 0; i < state.length;) {
      let j = i
      while (j + 1 < state.length && state[j + 1] === state[i]) j++
      const st = state[i]
      if (st !== '-') {
        const pieceBeams = beams.slice(i, j + 1)
        const width = ((upIn * (pieceBeams.length + 1) + pieceBeams.reduce((p, q) => p + q, 0)) / 12) * gridSize
        const [ly0, ly1] = st === 'A' ? [top, top + depthPx] : st === 'B' ? [bot - depthPx, bot] : [top, bot]
        const c = T(xs[i] + width / 2, (ly0 + ly1) / 2), h = ly1 - ly0
        out.push({
          ...r,
          id: first ? r.id : newId(),
          ...(first ? {} : { pieceOf: r.id }),
          beams: pieceBeams, width, height: h, x: c.x - width / 2, y: c.y - h / 2, activeBayIdx: null,
          ...(st === 'A' || st === 'B' ? { type: 'rack_row', label: 'Rack Row', flueSpaceIn: 0, flueBaseIn: 0 } : {}),
        })
        first = false
      }
      i = j + 1
    }
  }
  return out
}
