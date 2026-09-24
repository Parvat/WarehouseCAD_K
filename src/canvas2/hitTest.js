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

import { objectContains, getFpWallSegments, distToSegment, getObjectBounds, pxToFtIn } from '../utils/canvas'
import { rackFootprint } from '../generate/columnCheck'

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

/** An aisle's own rect — the actual gap between its two referenced rows,
 *  clipped to their overlapping span — ported verbatim from ShapeGeometry.jsx's
 *  'aisle' case. An aisle object carries no x/y/width/height of its own; its
 *  geometry is entirely derived, live, from `row1Id`/`row2Id` every time this
 *  is called. Exported so canvas2's AisleShape (the paint) and this file's own
 *  hitTest (the pick) can never disagree about where an aisle physically is —
 *  the same reason DimensionLabels' AisleLabel and this shared the same math
 *  before BUG 16, just not through one function.
 *
 *  `rackFootprint` (BUG 49), not raw x/y/width/height — a row rotated 90°
 *  (GENERATOR_SPEC_V10's vertical orientation) still stores the PRE-rotation
 *  local box (traceGenerate never changes how one is built, only how it's
 *  placed/spun), so measuring the gap between two rows from their raw fields
 *  is only correct at rotation 0/180; at 90/270 it measures the wrong
 *  rectangle entirely — which is exactly why a vertical aisle couldn't be
 *  clicked or deleted before this fix: `aw <= 0 || ah <= 0` below almost
 *  always held against the WRONG rectangle, so this returned null and
 *  `hitTest`'s 'aisle' case never matched. `outlineBounds` and `AisleShape`
 *  (shapes.jsx) both call this same function, so the fix reaches the
 *  selection outline and the Konva hit region too, not just the pick — the
 *  same single-source-of-truth reasoning BUG 45 already applied to
 *  AisleLabel. Harmless no-op for an unrotated rack (rot=0 returns the same
 *  box). */
/** An object's world bounds for selection chrome — marquee, group outline,
 *  smart guides. An aisle has no box of its own, so utils/canvas.js's
 *  getObjectBounds falls through to {x 0, y 0, w 0, h 0} for it: the world
 *  origin, which is the MIDDLE of a generated building. Every group outline
 *  holding an aisle stretched to that point, every marquee across the
 *  building's centre caught every aisle, and every aisle offered a smart-
 *  guide snap at x = 0 / y = 0. Here an aisle measures as its own gap
 *  (aisleRect) — null if its rows can't be found, so callers skip it —
 *  and every other type is getObjectBounds unchanged. */
export function boundsOf(obj, objects = []) {
  if (!obj) return null
  if (obj.type === 'aisle') {
    const r = aisleRect(obj, objects)
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
  }
  return getObjectBounds(obj)
}

/** An object's box in WORLD space, rotation included — what a marquee
 *  must test against. canvas2 spins every object about its own centre
 *  (shapes.jsx's spin()), but its stored x/y/width/height are the
 *  pre-rotation box: a 90° (vertical-layout) rack stores a wide box while
 *  it is drawn tall. Testing a marquee against the stored box made vertical
 *  racks get caught only when their unturned box happened to overlap —
 *  the "sometimes a group, sometimes not" marquee. Here the box is turned
 *  with the object (its axis-aligned bounds; exact for 0/90/180/270°). An
 *  aisle is its gap. Unlike boundsOf, which the group outline needs in the
 *  object's own unrotated frame. */
export function worldBoundsOf(obj, objects = []) {
  const b = boundsOf(obj, objects)
  if (!b || obj.type === 'aisle') return b
  const rot = ((((obj.rotation || 0) % 360) + 360) % 360)
  if (!rot) return b
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  const t = rot * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t))
  const w = b.width * c + b.height * s, h = b.width * s + b.height * c
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

export function aisleRect(aisle, objects) {
  const g = aisleGeom(aisle, objects)
  return g ? g.rect : null
}

/* aisleRect plus which way the aisle runs: `isHoriz` = the two rows are
   stacked along Y (rows run along X), so the gap is measured along Y. */
function aisleGeom(aisle, objects) {
  const row1 = objects.find(o => o.id === aisle.row1Id)
  const row2 = objects.find(o => o.id === aisle.row2Id)
  if (!row1 || !row2) return null
  const f1 = rackFootprint(row1), f2 = rackFootprint(row2)
  const b1 = { x: f1.x, y: f1.y, r: f1.x + f1.w, b: f1.y + f1.h }
  const b2 = { x: f2.x, y: f2.y, r: f2.x + f2.w, b: f2.y + f2.h }

  const yGap = Math.max(b2.x - b1.r, b1.x - b2.r)
  const xGap = Math.max(b2.y - b1.b, b1.y - b2.b)
  const isHoriz = xGap >= yGap

  let ax, ay, aw, ah
  if (isHoriz) {
    const top = b1.b < b2.y ? b1 : b2
    const bot = b1.b < b2.y ? b2 : b1
    ax = Math.max(top.x, bot.x)
    ay = top.b
    aw = Math.min(top.r, bot.r) - ax
    ah = bot.y - top.b
  } else {
    const lft = b1.r < b2.x ? b1 : b2
    const rgt = b1.r < b2.x ? b2 : b1
    ax = lft.r
    ay = Math.max(lft.y, rgt.y)
    aw = rgt.x - lft.r
    ah = Math.min(lft.b, rgt.b) - ay
  }
  if (aw <= 0 || ah <= 0) return null
  return { rect: { x: ax, y: ay, width: aw, height: ah }, isHoriz }
}

/** Where an aisle's dimension labels sit — one to three stations along the
 *  aisle, each an arrow across the gap with a pill at its middle. Shared by
 *  the drawing (DimensionLabels.jsx's AisleLabel) and the pick below, so
 *  what you can click is exactly what you can see. World px. */
export function aisleLabelLayout(aisle, objects, gridSize = 40) {
  const g = aisleGeom(aisle, objects)
  if (!g) return null
  const { rect: r, isHoriz } = g
  const gapLo = isHoriz ? r.y : r.x, gapHi = isHoriz ? r.y + r.height : r.x + r.width
  const runLo = isHoriz ? r.x : r.y, runLen = isHoriz ? r.width : r.height
  const positions = runLen < 20 * gridSize ? [runLo + runLen * 0.5]
    : runLen < 60 * gridSize ? [runLo + runLen * 0.25, runLo + runLen * 0.75]
    : [runLo + runLen * 0.15, runLo + runLen * 0.5, runLo + runLen * 0.85]
  const userLabel = aisle.label ? `${aisle.label} · ` : ''
  return {
    isHoriz, gapLo, gapHi, labelMid: (gapLo + gapHi) / 2, positions,
    text: `${userLabel}${pxToFtIn(gapHi - gapLo, gridSize)}`,
  }
}

/* Screen-constant label metrics — the same numbers AisleLabel draws with. */
export const AISLE_LABEL_FONT_PX = 10
export const AISLE_LABEL_PADX_PX = 3.5

/** Is a world point on one of the aisle's labels — a pill, or the arrow
 *  across the gap it sits on (±5 screen px)? The ONLY way to pick an aisle:
 *  its empty floor belongs to the building, so a press there grabs and
 *  drags the layout instead of selecting the aisle. */
export function aisleLabelHit(aisle, objects, wx, wy, zoom = 1, gridSize = 40) {
  const L = aisleLabelLayout(aisle, objects, gridSize)
  if (!L) return false
  const fs = AISLE_LABEL_FONT_PX / zoom
  const w = L.text.length * fs * 0.62 + (AISLE_LABEL_PADX_PX / zoom) * 2
  const h = fs * 1.5
  const tol = 3 / zoom, lineTol = 5 / zoom
  // (along the run, across the gap) for the point
  const run = L.isHoriz ? wx : wy, gap = L.isHoriz ? wy : wx
  const pillRun = L.isHoriz ? w : h, pillGap = L.isHoriz ? h : w   // text is always horizontal
  return L.positions.some(pos =>
    (Math.abs(run - pos) <= pillRun / 2 + tol && Math.abs(gap - L.labelMid) <= pillGap / 2 + tol) ||
    (Math.abs(run - pos) <= lineTol && gap >= L.gapLo - tol && gap <= L.gapHi + tol))
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
    /* An aisle carries no x/y/width/height of its own — objectContains
       (utils/canvas.js, frozen brain) has no case for it and degenerates to
       a 0×0 box at the origin, never hittable. Its real geometry is the gap
       rect between its two referenced rows (aisleRect above), so it gets its
       own point-in-rect test here instead of objectContains — the one place
       this module already carries geometry objectContains doesn't know
       (fpWallHitTest is the other). */
    if (obj.type === 'aisle') {
      /* Only its labels pick an aisle. The whole gap used to: a press on
         empty aisle floor selected the aisle, so the building behind it
         could hardly be grabbed to move the layout. */
      if (aisleLabelHit(obj, objects, wx, wy, zoom, gridSize)) return obj.id
      continue
    }
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
