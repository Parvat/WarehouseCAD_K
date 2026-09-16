// canvas2/groupRotate.js
// ─────────────────────────────────────────────────────────────────────────────
// Multi-object group rotate — geometry ported from CanvasUI.jsx's
// GroupOutline, rotation math ported from useCanvasStore's rotateGroup, NOT
// reinvented. canvas2 has no formal "groups" concept here: this operates on
// whatever 2+ objects are currently SELECTED, per the task spec, rather than
// the SVG engine's persisted groups array — the geometry/math themselves are
// unchanged, only what feeds them (selectedIds instead of a group's ids).
//
// Two pivots, kept deliberately separate because that is what the SVG source
// itself does:
//   - the ANGLE pivot (P below) — used for both the visual handle position
//     and the atan2() driving the drag.
//   - the POSITION-ROTATION pivot recomputed inside applyGroupRotation, from
//     each object's own raw x1/x/cx fields — exactly what rotateGroup (the
//     store action) recomputes internally rather than accepting P.
// rotateGroup never receives GroupOutline's centre; applyGroupRotation
// mirrors that structure rather than unifying the two pivots into one.
//
// TWO departures from a literal GroupOutline port, both from bugs found
// testing BUG 19's first cut:
//
// BUG 20 (first attempt, superseded): summing each member's RAW
// getObjectBounds gave a box that never moved once a member actually had
// rotation !== 0 — fixed by folding each member's OWN rotation into an
// axis-aligned bounding box of their rotated corners. That tracked, but
// grew/shrank as an AABB of rotated content always does, instead of
// staying a tight, oriented box that turns WITH the group — unlike the
// single-object SelectionOutline, which rotates a Konva Group (spin())
// around the object's own UNROTATED bounds rather than recomputing an
// AABB every frame.
//
// BUG 21 (this fix): match that approach. Every member of a completed or
// in-progress group rotate shares the SAME rotation R (applyGroupRotation
// adds the identical angleDeg to every member — see the store's own
// rotateGroup, ported above), which means the WHOLE selection is a single
// rigid body turning by R around ONE point — exactly what spin() does for
// one object, just generalised to many. getGroupOutline below:
//   1. finds P, the mean of every member's CURRENT bounds-centre (their
//      true current position, already reflecting any live/committed
//      rotation) — recomputed fresh on every call, not cached from
//      drag-start, which is what keeps it exactly correct through a live
//      drag without needing to know applyGroupRotation's own internal
//      pivot (proven below, "why P works regardless of the true pivot").
//   2. de-rotates each member's current centre by -R around P — this
//      reconstructs the group's TRUE relative arrangement (each member's
//      position relative to the others) exactly, for ANY choice of
//      reference point, because rotating a rigid formation's relative
//      vectors by R and then undoing that same R always cancels exactly;
//      P only has to be used CONSISTENTLY for the de-rotation and the
//      final placement, not equal any "true" pivot.
//   3. folds those de-rotated (now axis-aligned again) member rects into
//      one tight AABB — the box's own LOCAL, unrotated shape.
//   4. hands that box to the caller alongside a SINGLE Konva transform,
//      { x: P, y: P, offsetX: P, offsetY: P, rotation: R } — offset EQUAL
//      to position, so the local content rotates in place around P with
//      no net translation, the exact spin() pattern (position a Group at
//      a pivot, rotate around itself) generalised from "one object's own
//      bounds-centre" to "the group's shared centroid P".
//
// Why step 1's fresh P is safe even though applyGroupRotation's own
// internal pivot C is generally a DIFFERENT point (a different formula,
// over raw x1/x/cx corners rather than a mean of centres): for a member A,
// worldPositionOfLocalPoint(lx,ly) = P + Rot(R)*((lx,ly) - P). Substituting
// localCentreA = P + Rot(-R)*(currentCentreA - P) (step 2's own
// definition) collapses to exactly currentCentreA for ANY P — the Rot(-R)
// and Rot(R) cancel algebraically regardless of what point they're taken
// around, as long as it's the SAME point both times. P need not match C;
// it only has to be reused, which it always is within one computeGroupOutline
// call.
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds } from '../utils/canvas'

/** Rotate world point `p` by `angleDeg` about `pivot`. */
function rotateAround(p, angleDeg, pivot) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const dx = p.x - pivot.x, dy = p.y - pivot.y
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  }
}

/** Visual outline + handle geometry: an ORIENTED box that rotates rigidly
 *  with the group (see the file header for the derivation), tight around
 *  the selection the same way a single object's SelectionOutline is —
 *  never an axis-aligned box that grows/shrinks as the group turns.
 *  Returns the box in its own LOCAL (pre-rotation) coordinates plus the
 *  ONE transform ({P, R}) that places it — a caller draws minX/minY/
 *  maxX/maxY/hx/hy/ly/r exactly as given, inside a Konva Group positioned
 *  at P, offset at P, rotated by R (spin()'s own pattern, generalised). */
export function computeGroupOutline(objs, zoom) {
  if (!objs || !objs.length) return null
  const R = objs[0].rotation || 0

  const centres = objs.map(obj => {
    const b = getObjectBounds(obj)
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
  })
  const P = {
    x: centres.reduce((s, c) => s + c.x, 0) / centres.length,
    y: centres.reduce((s, c) => s + c.y, 0) / centres.length,
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  centres.forEach(({ x, y, b }) => {
    const lc = rotateAround({ x, y }, -R, P)
    minX = Math.min(minX, lc.x - b.width / 2); minY = Math.min(minY, lc.y - b.height / 2)
    maxX = Math.max(maxX, lc.x + b.width / 2); maxY = Math.max(maxY, lc.y + b.height / 2)
  })

  const pad = 10
  const hx = (minX + maxX) / 2
  const hy = minY - pad - 44 / zoom
  const ly = minY - pad - 8 / zoom
  const r = 10 / zoom
  return { minX, minY, maxX, maxY, pad, hx, hy, ly, r, P, R }
}

/** Whether a world point falls on the group rotate handle — CanvasUI.jsx's
 *  own hit circle radius, r*2.5 (bigger than the drawn circle, same as its
 *  invisible <circle> hit target). The handle's LOCAL (hx,hy) has to be
 *  carried through the SAME {P,R} transform the paint side uses, or a
 *  click would miss wherever the rotated handle actually renders. */
export function groupRotateHandleHitTest(objs, zoom, worldX, worldY) {
  const g = computeGroupOutline(objs, zoom)
  if (!g) return false
  const world = rotateAround({ x: g.hx, y: g.hy }, g.R, g.P)
  return Math.hypot(worldX - world.x, worldY - world.y) <= g.r * 2.5
}

/** Per-object rotation updates for a whole group, ported verbatim from
 *  useCanvasStore's rotateGroup. `base` is a Map of id -> object SNAPSHOT
 *  taken at drag-start (mirrors CanvasArea.onGroupRotateStart's
 *  basePositions) — every frame recomputes from that same fixed start, not
 *  from the previous frame's already-rotated result, which is what keeps
 *  many mousemove frames from drifting. Returns a Map of id -> partial
 *  updates, meant for useCanvasStore's own updateObject/commitObjectUpdate
 *  (this module makes no store calls itself). */
export function applyGroupRotation(base, angleDeg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  base.forEach(b => {
    const x = b.cx ?? b.x1 ?? b.x ?? 0
    const y = b.cy ?? b.y1 ?? b.y ?? 0
    const bw = b.cx ? b.cx + (b.rx || 0) : b.x2 ?? ((b.x ?? 0) + (b.width ?? 0))
    const bh = b.cy ? b.cy + (b.ry || 0) : b.y2 ?? ((b.y ?? 0) + (b.height ?? 0))
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, bw); maxY = Math.max(maxY, bh)
  })
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const rotPt = (px, py) => ({
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  })
  const updates = new Map()
  base.forEach((b, id) => {
    const baseRot = b.rotation ?? 0
    const u = { rotation: (baseRot + angleDeg) % 360 }
    if (b.type === 'circle') {
      const np = rotPt(b.cx, b.cy); u.cx = np.x; u.cy = np.y
    } else if ('x1' in b) {
      const p1 = rotPt(b.x1, b.y1); const p2 = rotPt(b.x2, b.y2)
      u.x1 = p1.x; u.y1 = p1.y; u.x2 = p2.x; u.y2 = p2.y
    } else if (b.fpVerts) {
      const np = rotPt((b.x || 0) + (b.width || 0) / 2, (b.y || 0) + (b.height || 0) / 2)
      u.x = np.x - (b.width || 0) / 2; u.y = np.y - (b.height || 0) / 2
      u.fpVerts = b.fpVerts.map(v => { const rp = rotPt(v.x, v.y); return { x: rp.x, y: rp.y } })
    } else if ('x' in b && 'width' in b) {
      const np = rotPt((b.x || 0) + (b.width || 0) / 2, (b.y || 0) + (b.height || 0) / 2)
      u.x = np.x - (b.width || 0) / 2; u.y = np.y - (b.height || 0) / 2
    }
    updates.set(id, u)
  })
  return updates
}
