// floorClamp.js — racking-area boxes and zones stay inside their building.
//
// An edge being dragged out stops at the first wall it meets from inside —
// the wall's inner face (the outline inset by the wall thickness, as drawn),
// on any rectilinear building: rectangle, L, T, custom — and snaps onto that
// face when it comes within `snap` of it. "From inside": where a part of the
// edge that is on the floor would leave it. A part still over the notch of an
// L (an area box drawn across it) coming onto the floor never stops it. Only
// growth is checked; pulling an edge in is always free. A body drag is the
// same two sweeps, one per axis, for its leading edges.
//
// Pure: world px in, world px out. Used live by the canvas (resize and drag)
// and by the racking-area resize itself (utils/rackingAreaTool.js).

import { buildingForBox } from '../generate/fillRacking'
import { innerOutline, floorSection, cornersBetween, boxOnFloor } from './floorGeom'

export { boxOnFloor }

const E = 1e-6
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

/** How far an edge at `from` (along `axis`, spanning [c0, c1] across) can travel toward `to`:
 *  `to`, or the wall face where a part of it that is on the floor would leave the floor. A part
 *  coming onto the floor from outside (an area box over the notch of an L, a wall face met from
 *  its outer side) never stops it; only a wall met from inside does. */
export function edgeReach(poly, axis, from, to, c0, c1) {
  const dir = Math.sign(to - from)
  if (!dir) return from
  // every part on the floor just behind the edge must stay on the floor, strip by strip
  let prev = floorSection(poly, axis, from - dir * 1e-3, c0, c1), at = from
  const within = (A, B) => A.every(([lo, hi]) => B.some(([p, q]) => p <= lo + E && q >= hi - E))
  for (const u of [...cornersBetween(poly, axis, from, to), to]) {
    const cur = floorSection(poly, axis, (at + u) / 2, c0, c1)
    if (!within(prev, cur)) return at
    prev = cur; at = u
  }
  return to
}

/** An edge moved from `from` to `to`, `outward` (+1 / -1) the way that grows the box: stopped at
 *  the wall face it would cross, and snapped onto a face within `snap` beyond it. Moving in: `to`. */
function stopEdge(poly, axis, from, to, c0, c1, outward, snap) {
  if (Math.sign(to - from) !== outward) return to
  const far = to + outward * snap
  const r = edgeReach(poly, axis, from, far, c0, c1)
  return Math.abs(r - far) < E ? to : r
}

/** The box `next` ({ x, y, w, h }) grown from `prev`, every edge that moved out stopped at the
 *  wall face it meets: the side edges swept across `prev`'s height, then the top and bottom
 *  across the new width (together they cover all the new floor). */
export function clampGrowth(poly, prev, next, snap = 0) {
  const o = { l: prev.x, r: prev.x + prev.w, t: prev.y, b: prev.y + prev.h }
  const n = { l: next.x, r: next.x + next.w, t: next.y, b: next.y + next.h }
  n.r = stopEdge(poly, 'x', o.r, n.r, o.t, o.b, 1, snap)
  n.l = stopEdge(poly, 'x', o.l, n.l, o.t, o.b, -1, snap)
  n.b = stopEdge(poly, 'y', o.b, n.b, n.l, n.r, 1, snap)
  n.t = stopEdge(poly, 'y', o.t, n.t, n.l, n.r, -1, snap)
  return { x: n.l, y: n.t, w: n.r - n.l, h: n.b - n.t }
}

/** A box moved by (dx, dy), stopped (and snapped) at the walls its leading edges meet. */
export function clampMove(poly, box, dx, dy, snap = 0) {
  const o = { l: box.x, r: box.x + box.w, t: box.y, b: box.y + box.h }
  if (dx > 0) dx = stopEdge(poly, 'x', o.r, o.r + dx, o.t, o.b, 1, snap) - o.r
  else if (dx < 0) dx = stopEdge(poly, 'x', o.l, o.l + dx, o.t, o.b, -1, snap) - o.l
  if (dy > 0) dy = stopEdge(poly, 'y', o.b, o.b + dy, o.l + dx, o.r + dx, 1, snap) - o.b
  else if (dy < 0) dy = stopEdge(poly, 'y', o.t, o.t + dy, o.l + dx, o.r + dx, -1, snap) - o.t
  return { dx, dy }
}

const isAreaOrZone = (o) => o?.type === 'racking_area' || (typeof o?.type === 'string' && o.type.startsWith('zone_'))
const boxOf = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })

/** The inner outline (world px) a racking area or zone is kept inside, or null: a zone only once
 *  it is on the floor (one still outside the building, or straddling a wall, moves freely). */
export function floorFor(objects, obj, gridSize = 40) {
  if (!isAreaOrZone(obj)) return null
  const fp = objects.find(o => o.id === obj.parentId && FP.has(o.type)) || buildingForBox(objects, boxOf(obj))
  if (!fp) return null
  const poly = innerOutline(fp, gridSize)
  if (obj.type !== 'racking_area' && !boxOnFloor(poly, boxOf(obj))) return null
  return poly
}

/** A resize's updates ({ x, y, width, height }) for a racking area or zone, kept inside the building. */
export function clampResizeUpdates(objects, orig, updates, { gridSize = 40, snap = 0 } = {}) {
  const poly = floorFor(objects, orig, gridSize)
  if (!poly) return updates
  const next = { x: updates.x ?? orig.x, y: updates.y ?? orig.y, w: updates.width ?? orig.width, h: updates.height ?? orig.height }
  const b = clampGrowth(poly, boxOf(orig), next, snap)
  return { ...updates, x: b.x, y: b.y, width: b.w, height: b.h }
}

/** A body drag's (dx, dy) for a racking area or zone, kept inside the building. */
export function clampDragDelta(objects, orig, dx, dy, { gridSize = 40, snap = 0 } = {}) {
  const poly = floorFor(objects, orig, gridSize)
  return poly ? clampMove(poly, boxOf(orig), dx, dy, snap) : { dx, dy }
}
