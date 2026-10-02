// floorGeom.js — a building's floor as a polygon, and what lies on it.
//
// The floor is the building's inner wall face: its drawn outline inset by the
// wall thickness, exactly as the canvas draws the wall ring. Buildings are
// rectilinear (rectangle, L, T, U, cross, custom), which keeps every test here
// exact: a segment or box is on the floor when every strip of it, between the
// outline's corners, lies inside the outline's cross-section there.
//
// Pure, no app imports beyond the polygon inset: shared by Fill racking,
// racking areas, the face rule (generate/faceReach.js) and the wall clamp
// (utils/floorClamp.js).

import { insetPolygon } from './canvas'

const E = 1e-6

/** The building's outline as world px points (its drawn walls' outer line). */
export function buildingOutline(fp) {
  if (Array.isArray(fp.fpVerts) && fp.fpVerts.length >= 4) return fp.fpVerts.map(v => ({ x: v.x, y: v.y }))
  return [{ x: fp.x, y: fp.y }, { x: fp.x + fp.width, y: fp.y }, { x: fp.x + fp.width, y: fp.y + fp.height }, { x: fp.x, y: fp.y + fp.height }]
}

/** The building's inner wall face as world px points: the outline inset by the
 *  wall thickness (the same inset the canvas draws the wall ring with). */
export function innerOutline(fp, gridSize = 40) {
  const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : (fp.strokeWidth || 10)
  return insetPolygon(buildingOutline(fp), wt)
}

const along = (axis, p) => (axis === 'x' ? p.x : p.y)
const across = (axis, p) => (axis === 'x' ? p.y : p.x)

/** The parts of the segment [c0, c1] (across) at position u along `axis` that lie on the
 *  floor, as sorted [lo, hi] intervals. */
export function floorSection(poly, axis, u, c0, c1) {
  const cuts = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(across(axis, a) - across(axis, b)) > E) continue     // only edges running along the axis cut the segment's line
    const u0 = Math.min(along(axis, a), along(axis, b)), u1 = Math.max(along(axis, a), along(axis, b))
    if (u > u0 + E && u < u1 - E) cuts.push(across(axis, a))
  }
  cuts.sort((p, q) => p - q)
  const out = []
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const lo = Math.max(cuts[i], c0), hi = Math.min(cuts[i + 1], c1)
    if (hi - lo > E) out.push([lo, hi])
  }
  return out
}

/** Whether the outline holds the whole segment [c0, c1] (across) at position u along `axis`. */
export function holdsSegment(poly, axis, u, c0, c1) {
  const s = floorSection(poly, axis, u, c0, c1)
  return s.length === 1 && s[0][0] <= c0 + E && s[0][1] >= c1 - E
}

/** The outline's corner positions along `axis`, in travel order from `from` toward `to` (exclusive). */
export function cornersBetween(poly, axis, from, to) {
  const dir = Math.sign(to - from)
  return [...new Set(poly.map(p => along(axis, p)))]
    .filter(u => (dir > 0 ? u > from + E && u < to - E : u < from - E && u > to + E))
    .sort((p, q) => dir * (p - q))
}

/** Whether the whole box ({ x, y, w, h }, world px) lies on the floor. */
export function boxOnFloor(poly, box) {
  const xs = [box.x, ...cornersBetween(poly, 'x', box.x, box.x + box.w), box.x + box.w]
  for (let i = 0; i + 1 < xs.length; i++) if (!holdsSegment(poly, 'x', (xs[i] + xs[i + 1]) / 2, box.y, box.y + box.h)) return false
  return true
}
