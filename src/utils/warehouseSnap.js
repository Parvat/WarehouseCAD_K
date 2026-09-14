// ── Warehouse Snap Utilities ──────────────────────────────────────────────────
// Plugs into CanvasArea's existing doSnap() pipeline.
// Called during mousemove when dragging a warehouse object.

import { WAREHOUSE_OBJECT_MAP, MHE_TYPES, END_SNAP_TYPES } from '../constants/warehouseObjects'
import { getObjectBounds } from './canvas'

const WAREHOUSE_TYPES = new Set(Object.keys(WAREHOUSE_OBJECT_MAP))

// ── Is this a warehouse object? ───────────────────────────────────────────────
export function isWarehouseType(type) {
  return WAREHOUSE_TYPES.has(type)
}

// ── Get snap points for an object (in px) ────────────────────────────────────
// Returns array of { id, x, y, role } in world-space pixels
export function getSnapPoints(obj, gridSize = 40) {
  const def = WAREHOUSE_OBJECT_MAP[obj.type]
  if (!def?.getSnapPoints) return []
  const bounds = getObjectBounds(obj)
  return def.getSnapPoints({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
  })
}

// ── End-to-end snap ───────────────────────────────────────────────────────────
// When dragging a rack/conveyor/wall, find the nearest matching snap point
// on another object of the same snap-type within threshold pixels.
// Returns { dx, dy } offset to apply, or null if no snap.
export function findEndSnap(draggedObj, allObjects, gridSize = 40, threshold = 20) {
  if (!END_SNAP_TYPES.has(draggedObj.type)) return null

  const dragPts = getSnapPoints(draggedObj, gridSize)
  let best = null
  let bestDist = threshold

  for (const other of allObjects) {
    if (other.id === draggedObj.id) continue
    if (!END_SNAP_TYPES.has(other.type)) continue

    const otherPts = getSnapPoints(other, gridSize)

    for (const dp of dragPts) {
      for (const op of otherPts) {
        // Only snap matching axes (end-to-end: x-axis; back-to-back: y-axis)
        if (dp.axis && op.axis && dp.axis !== op.axis) continue
        // Only snap compatible roles
        if (!rolesCompatible(dp.role, op.role)) continue

        const dist = Math.hypot(dp.x - op.x, dp.y - op.y)
        if (dist < bestDist) {
          bestDist = dist
          best = { dx: op.x - dp.x, dy: op.y - dp.y, snapPt: op, dragPt: dp }
        }
      }
    }
  }

  return best
}

function rolesCompatible(a, b) {
  // end-to-end: two 'end' points meet
  if (a === 'end' && b === 'end') return true
  // back-to-back: two 'back' points meet (with flue space already baked into dims)
  if (a === 'back' && b === 'back') return true
  // front-to-front (aisle alignment)
  if (a === 'front' && b === 'front') return true
  return false
}

// ── Column / grid snap ────────────────────────────────────────────────────────
// Snaps the center of a column-type object to the nearest column grid intersection.
// columnGrid: array of { x, y } world-px positions of existing columns
export function findGridSnap(draggedObj, columnGrid, gridSize = 40, threshold = 30) {
  const def = WAREHOUSE_OBJECT_MAP[draggedObj.type]
  if (def?.snapType !== 'grid') return null

  const bounds = getObjectBounds(draggedObj)
  const cx = bounds.x + bounds.width  / 2
  const cy = bounds.y + bounds.height / 2

  let best = null, bestDist = threshold

  for (const pt of columnGrid) {
    const dist = Math.hypot(cx - pt.x, cy - pt.y)
    if (dist < bestDist) {
      bestDist = dist
      best = {
        dx: pt.x - cx,
        dy: pt.y - cy,
      }
    }
  }

  return best
}

// ── Clearance / aisle violation check ────────────────────────────────────────
// For MHE objects: checks if any solid warehouse object is too close.
// Returns array of { objId, side, gap, required } violations.
// "gap" = actual clear space in ft, "required" = aisleMin in ft.
export function checkClearanceViolations(mheObj, allObjects, gridSize = 40) {
  if (!MHE_TYPES.has(mheObj.type)) return []
  const def = WAREHOUSE_OBJECT_MAP[mheObj.type]
  if (!def?.clearance) return []

  const mb = getObjectBounds(mheObj)
  const cl = def.clearance
  const aisleMin = (def.aisleMin || 0) * gridSize  // convert ft → px

  const violations = []

  // Expand MHE bounds by clearance on each side
  const halo = {
    left:   mb.x - cl.sides * gridSize,
    right:  mb.x + mb.width  + cl.sides * gridSize,
    top:    mb.y - cl.front  * gridSize,
    bottom: mb.y + mb.height + cl.back  * gridSize,
  }

  for (const other of allObjects) {
    if (other.id === mheObj.id) continue
    if (MHE_TYPES.has(other.type)) continue  // MHE vs MHE not checked here

    const ob = getObjectBounds(other)
    // AABB overlap with halo
    const overlapsHalo = (
      ob.x < halo.right &&
      ob.x + ob.width  > halo.left &&
      ob.y < halo.bottom &&
      ob.y + ob.height > halo.top
    )

    if (!overlapsHalo) continue

    // Compute actual gap on each axis
    const gapLeft   = (mb.x - (ob.x + ob.width))  / gridSize
    const gapRight  = (ob.x - (mb.x + mb.width))  / gridSize
    const gapTop    = (mb.y - (ob.y + ob.height)) / gridSize
    const gapBottom = (ob.y - (mb.y + mb.height)) / gridSize

    // Aisle = gap on widest open axis
    const aisleGap = Math.max(gapLeft, gapRight, gapTop, gapBottom)

    if (aisleGap >= 0 && aisleGap * gridSize < aisleMin) {
      violations.push({
        objId:    other.id,
        gap:      Math.round(aisleGap * 10) / 10,   // ft, 1dp
        required: def.aisleMin,
      })
    }
  }

  return violations
}

// ── Generate column grid array positions ─────────────────────────────────────
// Given origin (px), spacing (ft), count x/y — returns array of { x, y } in px.
export function generateColumnGrid({ originX, originY, spacingX, spacingY, countX, countY, gridSize = 40 }) {
  const pts = []
  const spxPx = spacingX * gridSize
  const spyPx = spacingY * gridSize
  for (let row = 0; row < countY; row++) {
    for (let col = 0; col < countX; col++) {
      pts.push({
        x: originX + col * spxPx,
        y: originY + row * spyPx,
      })
    }
  }
  return pts
}

// ── Snap point hit test (for hover indicators) ────────────────────────────────
// Returns the nearest snap point within threshold, or null.
export function nearestSnapPoint(wx, wy, obj, gridSize = 40, threshold = 15) {
  const pts = getSnapPoints(obj, gridSize)
  let best = null, bestDist = threshold
  for (const pt of pts) {
    const dist = Math.hypot(wx - pt.x, wy - pt.y)
    if (dist < bestDist) { bestDist = dist; best = pt }
  }
  return best
}