// ── Geometric Snapping Utility ────────────────────────────────────────────────
//
// Provides wall-snapping logic for warehouse objects (dock doors, egress doors,
// windows, charging stations) that must anchor to floor plan wall segments.
//
// Core concepts:
//   Point-to-Line Projection  — finds the nearest point on a wall to a given pt
//   Proximity Threshold       — "magnet reach" in screen px (converted to world)
//   Axis Constraint           — once snapped, object slides along wall only
//   Bounding Box Alignment    — snaps the correct face of the object to the wall
//
// All coordinates are in WORLD SPACE (pixels at zoom=1, scaled by gridSize).

import { getObjectBounds } from './canvas'
import { getFpWallSegments } from './canvas'

// ── Constants ─────────────────────────────────────────────────────────────────
export const WALL_SNAP_THRESHOLD_PX = 15   // screen pixels — converted to world below
export const WALL_SNAP_TYPES = new Set([
  'struct_loading_dock',
  'struct_egress',
  'struct_window',
  'util_charging',
  'mhe_dock_leveler',
])

// ── Point-to-Line Projection ─────────────────────────────────────────────────
// Given segment A→B and point P, returns:
//   nearest: the closest point on the LINE (infinite)
//   clamped: the closest point on the SEGMENT (finite, clamped to A..B)
//   t:       parametric position along segment [0..1]
//   dist:    distance from P to the segment
//   axis:    'x' (vertical wall) | 'y' (horizontal wall) | 'diagonal'
//   normal:  unit vector pointing outward from wall (perpendicular)
export function projectPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  if (lenSq < 0.001) {
    // Degenerate segment — return point A
    return {
      nearest: { x: ax, y: ay },
      clamped: { x: ax, y: ay },
      t: 0,
      dist: Math.hypot(px - ax, py - ay),
      axis: 'point',
      normal: { x: 0, y: -1 },
    }
  }

  // t = dot(AP, AB) / |AB|²
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq

  // Nearest point on infinite line
  const nearest = {
    x: ax + t * dx,
    y: ay + t * dy,
  }

  // Clamped to segment [0..1]
  const tc = Math.max(0, Math.min(1, t))
  const clamped = {
    x: ax + tc * dx,
    y: ay + tc * dy,
  }

  const dist = Math.hypot(px - clamped.x, py - clamped.y)

  // Wall axis classification
  const wallAngle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI)
  const axis = wallAngle < 10 || wallAngle > 170
    ? 'y'   // horizontal wall → slides along x
    : (wallAngle > 80 && wallAngle < 100)
      ? 'x'  // vertical wall → slides along y
      : 'diagonal'

  // Outward normal (perpendicular to wall, 90° CCW)
  const len = Math.sqrt(lenSq)
  const normal = { x: -dy / len, y: dx / len }

  return { nearest, clamped, t: tc, dist, axis, normal }
}

// ── Find Nearest Wall Snap ────────────────────────────────────────────────────
// Given a dragging object and all floor plan objects, finds the best wall snap.
// Returns a WallSnap result or null if nothing within threshold.
//
// WallSnap: {
//   x, y          — world position the object's snap-face should move to
//   wallSeg       — the segment that was matched
//   axis          — 'x' | 'y' — which axis the object can slide along
//   normal        — outward unit vector of the wall
//   snapFace      — 'left'|'right'|'top'|'bottom' — which face of the obj snapped
//   fpObj         — the floor plan object
//   t             — parametric position along segment
// }
export function findWallSnap(draggedObj, allObjects, zoom = 1, gridSize = 40) {
  const threshold = WALL_SNAP_THRESHOLD_PX / zoom  // world-space threshold

  const FP_TYPES = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
  const fpObjects = allObjects.filter(o => FP_TYPES.has(o.type) && o.id !== draggedObj.id)

  if (fpObjects.length === 0) return null

  const b = getObjectBounds(draggedObj)
  // The "snap probe point" is the center of the object
  const cx = b.x + b.width  / 2
  const cy = b.y + b.height / 2

  // Also check each face center — whichever is closest to a wall wins
  const probes = [
    { x: cx,                y: cy,                face: 'center' },
    { x: cx,                y: b.y,               face: 'top'    },
    { x: cx,                y: b.y + b.height,    face: 'bottom' },
    { x: b.x,               y: cy,                face: 'left'   },
    { x: b.x + b.width,     y: cy,                face: 'right'  },
  ]

  let best = null
  let bestDist = threshold

  for (const fp of fpObjects) {
    const wallSegs = getFpWallSegments(fp, gridSize)
    const wallThicknessPx = (fp.wallThicknessFt || 0.5) * gridSize

    for (const seg of wallSegs) {
      for (const probe of probes) {
        const proj = projectPointToSegment(
          probe.x, probe.y,
          seg.a.x, seg.a.y,
          seg.b.x, seg.b.y
        )

        if (proj.dist > bestDist) continue

        // Compute where the object should be positioned so its face sits
        // flush against the wall (on the inside surface)
        const aligned = computeAlignedPosition(b, probe.face, proj, wallThicknessPx)
        if (!aligned) continue

        bestDist = proj.dist
        best = {
          x:        aligned.x,
          y:        aligned.y,
          wallSeg:  seg,
          axis:     proj.axis,
          normal:   proj.normal,
          snapFace: probe.face,
          fpObj:    fp,
          t:        proj.t,
          proj,
          wallThicknessPx,
        }
      }
    }
  }

  return best
}

// ── Compute Aligned Position ──────────────────────────────────────────────────
// Given which face of the object snapped to a wall projection, compute
// the new x,y for the object's top-left corner so that face is flush with the wall.
function computeAlignedPosition(bounds, face, proj, wallThicknessPx) {
  const { clamped, normal } = proj
  const { width: w, height: h } = bounds

  // Wall inner surface = clamped point + normal direction
  // The object face should sit ON the wall inner surface
  switch (face) {
    case 'top':
      return { x: clamped.x - w / 2, y: clamped.y }
    case 'bottom':
      return { x: clamped.x - w / 2, y: clamped.y - h }
    case 'left':
      return { x: clamped.x, y: clamped.y - h / 2 }
    case 'right':
      return { x: clamped.x - w, y: clamped.y - h / 2 }
    case 'center':
      return { x: clamped.x - w / 2, y: clamped.y - h / 2 }
    default:
      return null
  }
}

// ── Apply Axis Constraint ─────────────────────────────────────────────────────
// Once snapped, this constrains movement to only slide along the wall.
// Call this every mousemove tick while snapped.
//
// wallSnap:   the snap result from findWallSnap
// mousePosX/Y: current world mouse position
// Returns: { x, y } — constrained world position for the object top-left corner
export function applyAxisConstraint(wallSnap, mousePosX, mousePosY) {
  const { wallSeg, snapFace, proj: initProj, fpObj } = wallSnap
  const ax = wallSeg.a.x, ay = wallSeg.a.y
  const bx = wallSeg.b.x, by = wallSeg.b.y

  // Project the current mouse position onto the wall line
  const currentProj = projectPointToSegment(mousePosX, mousePosY, ax, ay, bx, by)

  // The object center should track along the wall
  // Clamp t to [0..1] so object can't slide past the wall ends
  const tc = currentProj.t

  const snapPoint = {
    x: ax + tc * (bx - ax),
    y: ay + tc * (by - ay),
  }

  // Re-compute aligned position from new snap point
  const b = { width: wallSnap.x, height: wallSnap.y }  // stored dims on wallSnap

  // Return the clamped snap point for the caller to position the object
  return {
    snapPoint,
    t: tc,
    dist: currentProj.dist,
  }
}

// ── Check if Still Within Snap Threshold ─────────────────────────────────────
// Returns true if the mouse is still close enough to stay snapped
export function isWithinSnapThreshold(mousePosX, mousePosY, wallSnap, zoom = 1) {
  const threshold = (WALL_SNAP_THRESHOLD_PX * 3) / zoom  // 3x threshold to release (hysteresis)
  const { wallSeg } = wallSnap
  const proj = projectPointToSegment(
    mousePosX, mousePosY,
    wallSeg.a.x, wallSeg.a.y,
    wallSeg.b.x, wallSeg.b.y
  )
  return proj.dist <= threshold
}

// ── Full Snap Pipeline (call this in mousemove) ───────────────────────────────
// Combines findWallSnap + axis constraint into one call.
// Returns { snapped: bool, x, y, wallSnap } or { snapped: false }
//
// Usage in CanvasArea mousemove:
//   const result = computeWallSnappedPosition(draggedObj, allObjects, mouseX, mouseY, zoom, gridSize)
//   if (result.snapped) {
//     // move object to result.x, result.y
//   }
export function computeWallSnappedPosition(
  draggedObj,
  allObjects,
  mouseX,
  mouseY,
  zoom       = 1,
  gridSize   = 40,
  activeSnap = null   // pass previous snap result to apply hysteresis
) {
  // If already snapped, check hysteresis before trying to re-snap
  if (activeSnap && isWithinSnapThreshold(mouseX, mouseY, activeSnap, zoom)) {
    // Still snapped — slide along wall axis
    const ax = activeSnap.wallSeg.a.x, ay = activeSnap.wallSeg.a.y
    const bx = activeSnap.wallSeg.b.x, by = activeSnap.wallSeg.b.y
    const proj = projectPointToSegment(mouseX, mouseY, ax, ay, bx, by)

    const b = getObjectBounds(draggedObj)
    const aligned = computeAlignedPosition(b, activeSnap.snapFace, proj, activeSnap.wallThicknessPx)
    if (!aligned) return { snapped: false }

    return {
      snapped:    true,
      x:          aligned.x,
      y:          aligned.y,
      wallSnap:   activeSnap,
      sliding:    true,
    }
  }

  // Not currently snapped (or released) — check for new snap
  const snap = findWallSnap(draggedObj, allObjects, zoom, gridSize)
  if (!snap) return { snapped: false }

  return {
    snapped:  true,
    x:        snap.x,
    y:        snap.y,
    wallSnap: snap,
    sliding:  false,
  }
}

// ── Visual Helper: Snap Indicator Data ───────────────────────────────────────
// Returns SVG data for rendering a snap indicator on the canvas
// Draw this as an overlay in CanvasArea when snapResult.snapped === true
//
// Returns: { lineX1, lineY1, lineX2, lineY2, dotX, dotY }
export function getWallSnapVisual(wallSnap) {
  if (!wallSnap) return null
  const { wallSeg, proj } = wallSnap
  return {
    // Highlight the wall segment
    wallX1:  wallSeg.a.x,
    wallY1:  wallSeg.a.y,
    wallX2:  wallSeg.b.x,
    wallY2:  wallSeg.b.y,
    // Snap dot on the wall
    dotX:    proj.clamped.x,
    dotY:    proj.clamped.y,
    // Normal arrow (shows which direction the object will attach)
    normalX: proj.normal.x,
    normalY: proj.normal.y,
  }
}