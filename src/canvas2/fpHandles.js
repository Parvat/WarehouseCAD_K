// fpHandles.js — a building is resized ONLY from its handles (STUDIO.md §7): the corner and side squares drawn while it
// is selected (FpRotateHandleOverlay.jsx draws them, this decides where — one function, so a square is never drawn
// where a press can't reach it). A press on a wall or an edge selects or moves the building; it never resizes.
//   - a side square on every wall's midpoint: it moves that wall along its own axis ('wall_<i>');
//   - a corner square on every vertex: it moves both walls that meet there ('corner_<i>': walls i-1 and i).
// Squares are drawn the size of a rack's (handleGeometry.js HANDLE_PX) and hit within FP_HANDLE_HIT_PX — 8 screen px,
// no larger, so a press beside a wall is the wall's.

import { applyFpWallDrag, getFpVertices } from '../utils/canvas'
import { HANDLE_PX } from './handleGeometry'

const vertsOf = (fp) => (fp && (fp.fpVerts || getFpVertices(fp))) || []

export const FP_HANDLE_PX = HANDLE_PX
export const FP_HANDLE_HIT_PX = 8

/** The building's handles: [{ id, x, y, kind: 'corner' | 'side' }] (world px). */
export function fpHandlePoints(fp) {
  const v = vertsOf(fp)
  if (v.length < 3) return []
  const out = []
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length]
    out.push({ id: 'corner_' + i, x: a.x, y: a.y, kind: 'corner' })
    out.push({ id: 'wall_' + i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'side' })
  }
  return out
}

/** The handle under world (wx, wy) at `zoom` — a square FP_HANDLE_HIT_PX across on screen — or null. A corner wins
 *  over a side (they never overlap at a usable size). */
export function fpHandleHit(fp, wx, wy, zoom = 1) {
  const r = FP_HANDLE_HIT_PX / 2 / zoom
  const hit = fpHandlePoints(fp).filter(h => Math.abs(wx - h.x) <= r && Math.abs(wy - h.y) <= r)
  if (!hit.length) return null
  return (hit.find(h => h.kind === 'corner') || hit[0]).id
}

/** A corner handle's drag to `pos`: both walls meeting at vertex `i` follow (each along its own axis). */
export function applyFpCornerDrag(fp, i, pos) {
  const n = vertsOf(fp).length
  if (n < 3) return {}
  const a = applyFpWallDrag(fp, (i - 1 + n) % n, pos)
  if (!a.fpVerts) return {}
  const b = applyFpWallDrag({ ...fp, ...a }, i, pos)
  return b.fpVerts ? b : a
}
