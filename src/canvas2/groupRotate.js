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
//   - the ANGLE pivot (gcx/gcy below) — GroupOutline's own getObjectBounds
//     bounding-box centre, used for both the visual handle position and the
//     atan2() driving the drag.
//   - the POSITION-ROTATION pivot recomputed inside applyGroupRotation, from
//     each object's own raw x1/x/cx fields — exactly what rotateGroup (the
//     store action) recomputes internally rather than accepting gcx/gcy.
// rotateGroup never receives GroupOutline's centre; applyGroupRotation
// mirrors that structure rather than unifying the two pivots into one.
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds } from '../utils/canvas'

/** Visual outline + handle geometry, CanvasUI.jsx's GroupOutline ported
 *  verbatim: pad=10, stalk to -44/zoom, handle circle r=10/zoom. Also the
 *  angle-drag pivot (gcx/gcy). */
export function computeGroupOutline(objs, zoom) {
  if (!objs || !objs.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  objs.forEach(obj => {
    const b = getObjectBounds(obj)
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
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
