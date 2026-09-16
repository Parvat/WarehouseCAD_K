// canvas2/hitTest.js
// ─────────────────────────────────────────────────────────────────────────────
// Object and bay picking, ported from CanvasArea.jsx / utils/canvas.js — NOT
// reinvented. The SVG canvas's picking is proven: it is what every existing
// user has always clicked against, it is type-agnostic (a rack_row and a
// rack_double_row are just "an object with objectContains", no special case
// for either), and it does not depend on any renderer's own scene graph.
//
// This module owns none of the geometry logic itself — objectContains is
// imported from utils/canvas.js (the frozen brain) unchanged. What is ported
// here is the SELECTION ALGORITHM around it: the z-priority sort, the three
// passes (regular objects, then column-grid squares, then floor plans), and
// bay/lane/tower picking — copied statement for statement from CanvasArea's
// hitTest/hitTestBay, with React state turned into explicit arguments so the
// same function runs identically in either canvas.
// ─────────────────────────────────────────────────────────────────────────────

import { objectContains, getFpWallSegments, distToSegment } from '../utils/canvas'

const FP_SET = new Set(['fp_rect', 'fp_l', 'fp_t', 'fp_u', 'fp_cross', 'fp_l_mirror'])
const COL_GRID = new Set(['column_grid'])

/** Which rack-ish types answer a bay/lane/tower pick at all. Copied verbatim
 *  from CanvasArea's RACK_BAY_TYPES — note this is BROADER than the set
 *  render/rackOps.js draws bay dividers for: pushback, pallet-flow and
 *  drive-through all answer a lane pick here even though their own drawing
 *  consolidates lanes into one path, and drive-in deliberately does not (you
 *  reverse the whole rack out of one open face; there is no per-lane pick that
 *  means anything for it). Kept exactly as-is rather than narrowed to "what
 *  canvas2 currently draws dividers for" — the picking behaviour and the
 *  drawing are two different concerns and this file is not the place to
 *  reconcile them. */
const RACK_BAY_TYPES = new Set([
  'rack_row', 'rack_double_row', 'rack_cantilever',
  'rack_pushback', 'rack_pallet_flow', 'rack_drive_through',
])

const isLayerUsable = (layerMap, obj) => {
  const l = layerMap.get(obj.layerId)
  return !!l && l.visible && !l.locked && !obj.locked
}

/** The object under a world point, or null.
 *
 *  Three passes, priority order matching visual z-order — copied from
 *  CanvasArea.hitTest, including the exact tie-break within a pass
 *  (annotations/text checked before plain shapes) and the two deliberate
 *  exceptions to "just sort and take the first hit":
 *    • a column grid is only hit ON an actual column square, not its bounding
 *      box — the grid usually spans the whole building, and a naive bbox test
 *      would swallow every click meant for whatever the columns overlap;
 *    • floor plans are checked LAST — they are the building itself, and
 *      everything else standing inside it must win first.
 *
 *  `layers` is the store's layer list; an object on a hidden or locked layer,
 *  or itself locked, can never be picked — matching CanvasArea exactly. */
export function hitTest(objects, layers, wx, wy, zoom, gridSize = 40) {
  const layerMap = new Map((layers || []).map(l => [l.id, l]))
  const priority = o =>
    (o.type?.startsWith('annot_') || o.type === 'text') ? 2
      : FP_SET.has(o.type) ? 0
      : COL_GRID.has(o.type) ? 0.5
      : 1
  const sorted = [...objects].sort((a, b) => priority(b) - priority(a))

  // Pass 1 — everything except the grid and the building.
  for (const obj of sorted) {
    if (!isLayerUsable(layerMap, obj)) continue
    if (COL_GRID.has(obj.type) || FP_SET.has(obj.type)) continue
    if (objectContains(obj, wx, wy, zoom)) return obj.id
  }

  // Pass 2 — column_grid, hit only ON a column square.
  for (const obj of sorted) {
    if (!isLayerUsable(layerMap, obj)) continue
    if (!COL_GRID.has(obj.type)) continue
    const spacingX = obj.spacingX || [obj.width || 40 * 40]
    const spacingY = obj.spacingY || [obj.height || 40 * 40]
    const colW = obj.columnW || (12 / 12) * gridSize
    const colH = obj.columnH || (12 / 12) * gridSize
    const colXs = [obj.x]; spacingX.forEach(s => colXs.push(colXs[colXs.length - 1] + s))
    const colYs = [obj.y]; spacingY.forEach(s => colYs.push(colYs[colYs.length - 1] + s))
    const pad = 4 / zoom
    const hit = colYs.some(cy => colXs.some(cx =>
      wx >= cx - pad && wx <= cx + colW + pad &&
      wy >= cy - pad && wy <= cy + colH + pad))
    if (hit) return obj.id
  }

  // Pass 3 — floor plans, last.
  for (const obj of sorted) {
    if (!isLayerUsable(layerMap, obj)) continue
    if (!FP_SET.has(obj.type)) continue
    if (objectContains(obj, wx, wy, zoom)) return obj.id
  }

  return null
}

/** Which floor plan's wall a world point falls on, as { objId, wallIdx }, or
 *  null — ported from CanvasUI.jsx's FpWallHitAreas hit band, NOT reinvented:
 *  the same distance-to-segment test, the same ~24-screen-px band (a real
 *  wall is a few inches thick, under a screen px at most zooms nobody could
 *  reliably grab). getFpWallSegments does the actual vertex/segment math, the
 *  same function the render (FpDimLabels) and the drag (applyFpWallDrag) both
 *  already key off — one source for "where are this building's walls".
 *
 *  Checked over EVERY floor plan regardless of what's currently selected
 *  (matching CanvasUI: a wall is always live, dragging it selects its
 *  building), so the caller must resolve this before it resolves the plain
 *  hitTest() pass — a rack standing on top of a wall must still win, which
 *  the caller does by checking hitTest() first and only falling back to this
 *  when that pass found nothing or found the floor plan itself. */
export function fpWallHitTest(objects, layers, wx, wy, zoom, gridSize = 40) {
  const layerMap = new Map((layers || []).map(l => [l.id, l]))
  const hitW = Math.max(18, 24 / zoom)
  for (const obj of objects) {
    if (!FP_SET.has(obj.type)) continue
    if (!isLayerUsable(layerMap, obj)) continue
    const walls = getFpWallSegments(obj, gridSize)
    for (const seg of walls) {
      if (distToSegment({ x: wx, y: wy }, seg.a, seg.b) < hitW) {
        return { objId: obj.id, wallIdx: seg.index }
      }
    }
  }
  return null
}

/** Which bay, lane or tower a world point falls in, or null — the object
 *  itself, no upright/post dead zone (a click on a divider resolves to
 *  whichever bay it borders, per the un-rotate-then-scan math below).
 *
 *  Un-rotates the click around the object's own centre before testing, which
 *  render/rackOps.js's own bayAtPoint does NOT do — a rotated rack_row could
 *  not be bay-picked correctly before this; it can now, for free, by using
 *  the same math the SVG already relies on. */
export function hitTestBay(obj, worldX, worldY, gridSize = 40) {
  if (!RACK_BAY_TYPES.has(obj.type)) return null

  const rot = ((obj.rotation || 0) % 360 + 360) % 360
  const cx = obj.x + obj.width / 2
  const cy = obj.y + obj.height / 2
  const rad = -(rot * Math.PI) / 180
  const dx = worldX - cx
  const dy = worldY - cy
  const localX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)

  if (obj.type === 'rack_cantilever') {
    if (!obj.towers) return null
    const tCount = obj.towers.length
    const spacePx = tCount > 1 ? obj.width / (tCount - 1) : obj.width
    const armThickPx = ((obj.armThicknessIn || 3) / 12) * gridSize
    for (let i = 0; i < tCount; i++) {
      const towerCx = obj.x + i * spacePx
      if (localX >= towerCx - armThickPx / 2 && localX <= towerCx + armThickPx / 2) return i
    }
    return null
  }

  if (!obj.beams) return null
  const upW = ((obj.uprightWidth || 3) / 12) * gridSize
  let cursor = obj.x + upW
  for (let i = 0; i < obj.beams.length; i++) {
    const beamPx = (obj.beams[i] / 12) * gridSize
    if (localX >= cursor && localX <= cursor + beamPx) return i
    cursor += beamPx + upW
  }
  return null   // landed on an upright/post
}
