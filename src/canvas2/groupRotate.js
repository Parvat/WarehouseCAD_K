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
//   - the ANGLE pivot (gcx/gcy below) — the selection's bounding-box centre,
//     used for both the visual handle position and the atan2() driving the
//     drag.
//   - the POSITION-ROTATION pivot recomputed inside applyGroupRotation, from
//     each object's own raw x1/x/cx fields — exactly what rotateGroup (the
//     store action) recomputes internally rather than accepting gcx/gcy.
// rotateGroup never receives GroupOutline's centre; applyGroupRotation
// mirrors that structure rather than unifying the two pivots into one.
//
// ONE deliberate departure from a literal GroupOutline port: BUG 19's first
// cut summed each member's RAW getObjectBounds (its own unrotated local
// rect), which is what a spin()-wrapped Konva Group also starts from for a
// SINGLE object — but a single object's Group then physically rotates via
// spin(), while this box never did, so a member's own rotation (set by a
// completed or in-progress group rotate) left the box motionless while the
// racks visibly turned under it (BUG 20). getGroupCorners below rotates
// each member's own 4 corners about its own centre by ITS OWN
// obj.rotation — the same transform spin() applies to the object itself —
// before folding them into the shared AABB, so the box always encloses
// what is actually painted, live during the drag and after commit, for any
// 2+ selection regardless of how it got its current rotation.
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds } from '../utils/canvas'

/** obj's own 4 corners, rotated about ITS OWN centre by its own
 *  obj.rotation — the exact transform spin() applies when painting the
 *  object itself, so this always matches what is actually on screen. */
function rotatedCorners(bounds, rotation) {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ]
  const rot = rotation || 0
  if (!rot) return corners
  const rad = (rot * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return corners.map(p => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }))
}

/** Visual outline + handle geometry, CanvasUI.jsx's GroupOutline ported
 *  (pad=10, stalk to -44/zoom, handle circle r=10/zoom), but folding in
 *  each member's own rotation (see the file header) so the box tracks the
 *  group live through a rotate instead of lagging at its pre-rotate
 *  footprint. Also the angle-drag pivot (gcx/gcy). */
export function computeGroupOutline(objs, zoom) {
  if (!objs || !objs.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  objs.forEach(obj => {
    const b = getObjectBounds(obj)
    for (const c of rotatedCorners(b, obj.rotation)) {
      minX = Math.min(minX, c.x); minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y)
    }
  })
  const pad = 10
  const gcx = (minX + maxX) / 2
  const gcy = (minY + maxY) / 2
  const hx = gcx
  const hy = minY - pad - 44 / zoom
  const ly = minY - pad - 8 / zoom
  const r = 10 / zoom
  return { minX, minY, maxX, maxY, pad, gcx, gcy, hx, hy, ly, r }
}

/** Whether a world point falls on the group rotate handle — CanvasUI.jsx's
 *  own hit circle radius, r*2.5 (bigger than the drawn circle, same as its
 *  invisible <circle> hit target). */
export function groupRotateHandleHitTest(objs, zoom, worldX, worldY) {
  const g = computeGroupOutline(objs, zoom)
  if (!g) return false
  return Math.hypot(worldX - g.hx, worldY - g.hy) <= g.r * 2.5
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
