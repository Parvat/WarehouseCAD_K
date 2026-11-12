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
import { rackFootprint, rowAisleLevel, MHE_PROFILES, expandColumnGrid } from '../generate/columnCheck'
import { fmtLenDown } from '../utils/copyChange'
import { getColumnCheckView } from '../generate/columnCheckView'
import { aisleLabelScale } from '../render/labelSize'
import { useLabelPrefs } from './labelPrefs'
import { isSelectable, layerShown } from '../utils/layers'
import { onOutline, onLabel, isSection, polygonOf, pointInPolygon } from '../utils/sectionAreas'
import { nameShown } from './sectionNameShown'
import { equipmentResolver } from '../utils/equipment'

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

/* Hidden or locked layer: never picked. An object locked on its own is still clicked (selected, its bar shows
   Unlock) — what it cannot do, move, resize, delete, cut, is refused where those start (utils/layers.js isPickable). */
const isLayerUsable = (layerMap, obj) => isSelectable(layerMap, obj)

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

/** Where an aisle's dimension label sits — ONE station, centred along the
 *  aisle (an aisle is one section's pair of facing rows), an arrow across the
 *  gap with a pill at its middle. It used to repeat at up to three stations on
 *  long aisles; one is enough to read and a third of the nodes. Shared by the
 *  drawing (DimensionLabels.jsx's AisleLabel) and the pick below, so what you
 *  can click is exactly what you can see. World px. */
export function aisleLabelLayout(aisle, objects, gridSize = 40, { profile = null, columns, lz } = {}) {
  const g = aisleGeom(aisle, objects)
  if (!g) return null
  const { rect: r, isHoriz } = g
  const gapLo = isHoriz ? r.y : r.x, gapHi = isHoriz ? r.y + r.height : r.x + r.width
  const runLo = isHoriz ? r.x : r.y, runLen = isHoriz ? r.width : r.height
  const userLabel = aisle.label ? `${aisle.label} · ` : ''
  /* With a forklift `profile` (the warning colours on: Checks layer shown, markings on) the label is graded
     as Check layout grades the aisle — rowAisleLevel, the same function — and a failing width reads rounded
     DOWN to the inch, as Check layout lists it (10.49 ft is 10' 5", never the 10' 6" it needs). */
  const w = gapHi - gapLo
  // graded against the aisle's own equipment: its two rows' (their sections'), the stricter (utils/equipment.js)
  const level = profile ? rowAisleLevel(w, equipmentResolver(objects, profile).pair(aisle.row1Id, aisle.row2Id), gridSize) : 3
  const text = `${userLabel}${level < 3 ? fmtLenDown(w, gridSize) : pxToFtIn(w, gridSize)}`
  const labelMid = (gapLo + gapHi) / 2
  /* The label sits mid-run unless a column is there: then its pill and arrow slide along the aisle to the
     nearest spot clear of every column (aisleLabelStation). `columns`: the column squares (world px); left
     out, they are read from `objects` — the whole layout's column grids, as the column check reads them.
     `lz`: the size it is drawn at (left out: the aisle's own Label size, as the canvas draws it). */
  const cols = columns === undefined ? columnRectsOf(objects, gridSize) : (columns || [])
  const scale = lz || aisleLabelScale(aisle, useLabelPrefs.getState().labelSize, gridSize)
  const pos = aisleLabelStation({ isHoriz, gapLo, gapHi, labelMid, runLo, runLen, text }, cols, scale)
  return { isHoriz, gapLo, gapHi, labelMid, positions: [pos], level, text }
}

/* ── which gaps get a width label (labels-sections, STUDIO.md §7a) ──
   A width label measures a gap between racks. It never crosses a section edge — it measures only between racks in the
   same section (or both in none): a gap whose span, at the label's station, crosses a section's edge (or runs through
   a section) is between sections, and is labelled only when it is a real aisle — racks facing each other across the
   edge (an aisle's two rows), closer than GAP_TRAVEL_TIMES × the travel width (Space to move) of the stricter equipment
   of the two sides. Anywhere, a gap wider than that is open floor, not an aisle: no label. */
export const GAP_TRAVEL_TIMES = 3
const segHits = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}
/** Is the label of gap `L` ({ isHoriz, gapLo, gapHi, positions | pos }) shown? `objects`: the whole layout (its
 *  sections); `profile`: the stricter equipment of the two sides (its travelFt); `facing`: the two sides are racks
 *  facing each other (an aisle), not run ends (a cross-aisle) or a rack and a wall or zone. */
export function gapShown(L, objects, gridSize = 40, profile = null, facing = false) {
  if (!L) return false
  const travel = (profile && Number.isFinite(profile.travelFt) && profile.travelFt > 0 ? profile.travelFt : (MHE_PROFILES.reach.travelFt || 8)) * gridSize
  const w = L.gapHi - L.gapLo
  if (w > GAP_TRAVEL_TIMES * travel + 1e-6) return false
  const secs = (objects || []).filter(isSection)
  if (!secs.length) return true
  const pos = L.pos ?? (L.positions && L.positions[0])
  const e = Math.min(0.5, w / 4)                                              // just inside the gap, off the rack faces
  const at = (g) => (L.isHoriz ? { x: pos, y: g } : { x: g, y: pos })
  const A = at(L.gapLo + e), B = at(L.gapHi - e)
  const crosses = secs.some(s => {
    const p = polygonOf(s).map(([x, y]) => ({ x, y }))
    if (pointInPolygon(polygonOf(s), A.x, A.y) !== pointInPolygon(polygonOf(s), B.x, B.y)) return true
    return p.some((c, i) => segHits(A, B, c, p[(i + 1) % p.length]))
  })
  return !crosses || !!facing
}
/** An aisle's width label shown (the gap between its two rows, at mid-run)? `objects`: the whole layout; `profile`:
 *  the stricter equipment of its rows. */
export function aisleGapShown(aisle, objects, gridSize = 40, profile = null) {
  const byId = (id) => (objects || []).find(o => o.id === id)
  const g = aisleGeom(aisle, [byId(aisle.row1Id), byId(aisle.row2Id)].filter(Boolean))
  if (!g) return false
  const r = g.rect, isHoriz = g.isHoriz
  const L = { isHoriz, gapLo: isHoriz ? r.y : r.x, gapHi: isHoriz ? r.y + r.height : r.x + r.width, pos: isHoriz ? r.x + r.width / 2 : r.y + r.height / 2 }
  return gapShown(L, objects, gridSize, profile, true)
}
/** The equipment the gap rules read for racks in no section: the project's forklift (the column check's). */
export const gapBase = () => getColumnCheckView()?.profile || MHE_PROFILES.reach

/* The visible column grids' squares of a layout, kept per objects array (a frame asks many times). */
const colCache = new WeakMap()
export function columnRectsOf(objects, gridSize = 40) {
  if (!Array.isArray(objects)) return []
  const hit = colCache.get(objects)
  if (hit && hit.gridSize === gridSize) return hit.cols
  const cols = objects.filter(o => o && o.type === 'column_grid' && o.showGrid !== false).flatMap(g => expandColumnGrid(g, gridSize, objects))
  colCache.set(objects, { gridSize, cols })
  return cols
}

/** Where along its run an aisle label is drawn: mid-run, or — when a column is under its pill or its
 *  arrow (the arrow spans the whole gap) — the nearest station clear of every column, kept inside the
 *  run. A column in the aisle blocks the arrow over its own length, and the pill over that length plus
 *  half the pill. With no clear station at all, mid-run (the column is drawn above it either way). */
export function aisleLabelStation(L, columns, lz) {
  const mid = L.runLo + L.runLen / 2
  if (!columns || !columns.length) return mid
  const fs = AISLE_LABEL_FONT_PX / lz
  const pw = L.text.length * fs * 0.62 + (AISLE_LABEL_PADX_PX / lz) * 2, ph = fs * 1.5
  const pillRun = L.isHoriz ? pw : ph, pillGap = L.isHoriz ? ph : pw   // text is always horizontal
  const half = pillRun / 2, m = 2 / lz
  const blocks = []
  for (const c of columns) {
    const g0 = L.isHoriz ? c.y : c.x, g1 = g0 + (L.isHoriz ? c.h : c.w)
    if (g1 <= L.gapLo || g0 >= L.gapHi) continue                       // not in this aisle's gap
    const r0 = L.isHoriz ? c.x : c.y, r1 = r0 + (L.isHoriz ? c.w : c.h)
    const underPill = g0 < L.labelMid + pillGap / 2 && g1 > L.labelMid - pillGap / 2
    const ext = underPill ? half + m : m
    blocks.push([r0 - ext, r1 + ext])
  }
  const clear = (p) => !blocks.some(([a, b]) => p > a + 1e-9 && p < b - 1e-9)
  if (clear(mid)) return mid
  const lo = L.runLo + half, hi = L.runLo + L.runLen - half
  if (hi < lo) return mid
  let best = null
  for (const p of [lo, hi, ...blocks.flat()]) {
    if (p < lo - 1e-9 || p > hi + 1e-9 || !clear(p)) continue
    if (best === null || Math.abs(p - mid) < Math.abs(best - mid)) best = p
  }
  return best === null ? mid : best
}

/** The forklift the aisle width labels are graded against, or null when their warning colours are off:
 *  the Checks layer hidden or the column check's markings switched off — exactly when Overlays draws them
 *  plain. `layers`: the store's layer list or a map of it. */
export function aisleWarnProfile(layers) {
  const v = getColumnCheckView() || {}
  return v.showMarks !== false && layerShown(layers, 'checks') ? (v.profile || MHE_PROFILES.reach) : null
}

/* Screen-constant label metrics — the same numbers AisleLabel draws with. */
export const AISLE_LABEL_FONT_PX = 10
export const AISLE_LABEL_PADX_PX = 3.5

/** Is a world point on one of the aisle's labels — a pill, or the arrow
 *  across the gap it sits on (±5 screen px)? The ONLY way to pick an aisle:
 *  its empty floor belongs to the building, so a press there grabs and
 *  drags the layout instead of selecting the aisle. */
export function aisleLabelHit(aisle, objects, wx, wy, zoom = 1, gridSize = 40, profile = null) {
  const L = aisleLabelLayout(aisle, objects, gridSize, { profile })   // the text as drawn: its width is the pill's
  if (!L) return false
  /* The pill is DRAWING size (the aisle's own label size if it has one,
     else the Label size setting — render/labelSize.js), exactly as drawn;
     only the click tolerance is in screen px. */
  const lz = aisleLabelScale(aisle, useLabelPrefs.getState().labelSize, gridSize)
  const fs = AISLE_LABEL_FONT_PX / lz
  const w = L.text.length * fs * 0.62 + (AISLE_LABEL_PADX_PX / lz) * 2
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
  const priority = o =>
    (o.type?.startsWith('annot_') || o.type === 'text') ? 2
      : FP_SET.has(o.type) ? 0
      : COL_GRID.has(o.type) ? 0.5
      /* a zone is drawn on the Zones layer, under the racks: a rack standing in one (a pair grown into it) is
         picked where it is drawn over it, not the zone behind it (BUG 87) */
      : (typeof o.type === 'string' && o.type.startsWith('zone_')) ? 0.75
      /* a section (utils/sectionAreas.js) is drawn under everything: a rack, a zone or a door on its outline wins */
      : o.type === 'section_area' ? 0.6
      : 1
  return pickAt(objects, layers, wx, wy, zoom, gridSize, priority).id
}

/* ── the one hit rule (STUDIO.md §7a Hit rule) ─────────────────────────────────────────────────────────────────────
   An object whose real shape holds the point beats an object reached only by its pick padding — whatever the two are:
   a rack, a wall, a section's outline or its shown name, a door, a column, a zone. Among the objects that truly hold
   it, the one drawn on top wins (the priorities above); padding decides only when nothing truly holds it (again the
   one on top), and the building's blank floor comes last. The real shapes: an object's own footprint; a column's
   square; a wall's drawn thickness (2 screen px at least); a section's or a racking area's outline line (2 screen px) and a section's shown
   name; an aisle's width label. The padding: a rack's few screen px around it, a column's 4, an outline's 6, a wall's
   band (24 screen px). The press, the hover, the right-click and every tool read this one function, so a hover always
   shows what a click takes. → { id: the object (a wall: its building), kind: 'object' | 'wall' | 'column' | 'floor' |
   'none', real: true when it truly holds the point } */
export function pickAt(objects, layers, wx, wy, zoom, gridSize = 40, priority = null) {
  const layerMap = new Map((layers || []).map(l => [l.id, l]))
  const P = priority || ((o) => (o.type?.startsWith('annot_') || o.type === 'text') ? 2 : FP_SET.has(o.type) ? 0 : COL_GRID.has(o.type) ? 0.5
    : (typeof o.type === 'string' && o.type.startsWith('zone_')) ? 0.75 : o.type === 'section_area' ? 0.6 : 1)
  const sorted = [...objects].sort((x, y) => P(y) - P(x))
  /* A section's name, while it shows, is drawn above everything (SectionNames.jsx): a press on it is the section's */
  for (const obj of objects) if (obj.type === 'section_area' && isLayerUsable(layerMap, obj) && nameShown(obj.id) && onLabel(obj, wx, wy, zoom, objects)) return { id: obj.id, kind: 'object', real: true }
  const onColumn = (obj, pad) => {
    for (const c of expandColumnGrid(obj, gridSize, objects)) if (wx >= c.x - pad && wx <= c.x + c.w + pad && wy >= c.y - pad && wy <= c.y + c.h + pad) return true
    return false
  }
  const line = 2 / zoom
  let real = null, pad = null
  const take = (cand) => {
    if (cand.real) { if (!real || cand.p > real.p) real = cand }
    else if (!pad || cand.p > pad.p) pad = cand
  }
  for (const obj of sorted) {
    if (!isLayerUsable(layerMap, obj)) continue
    if (obj.type === 'elevation_types') continue   // data (utils/elevations.js), nothing to pick
    const p = P(obj)
    if (FP_SET.has(obj.type)) {
      /* a wall: its drawn thickness is the wall; the band around it (24 screen px) is its padding */
      for (const seg of getFpWallSegments(obj, gridSize)) {
        const d = distToSegment({ x: wx, y: wy }, seg.a, seg.b)
        // (its drawn line: at least 2 screen px — zoomed out, a 3″ wall is under a pixel)
        if (d <= Math.max((obj.wallThicknessFt || 0.25) * gridSize, line)) take({ id: obj.id, kind: 'wall', real: true, p })
        else if (d < Math.max(18, 24 / zoom)) take({ id: obj.id, kind: 'wall', real: false, p })
      }
      continue
    }
    if (COL_GRID.has(obj.type)) {
      /* a column grid is hit only ON a column square (the grid spans the whole building) */
      if (obj.showGrid === false) continue
      if (onColumn(obj, 0)) take({ id: obj.id, kind: 'column', real: true, p })
      else if (onColumn(obj, 4 / zoom)) take({ id: obj.id, kind: 'column', real: false, p })
      continue
    }
    /* An aisle carries no x/y/width/height of its own — objectContains (utils/canvas.js, frozen brain) has no case
       for it. Only its width label picks it (a label not shown — across a section edge, or open floor — is not there) */
    if (obj.type === 'aisle') {
      if (aisleLabelHit(obj, objects, wx, wy, zoom, gridSize, aisleWarnProfile(layerMap)) && aisleGapShown(obj, objects, gridSize, equipmentResolver(objects, gapBase()).pair(obj.row1Id, obj.row2Id))) take({ id: obj.id, kind: 'object', real: true, p })
      continue
    }
    /* A racking area is picked on its dashed outline only: its inside is the racks and aisles it placed */
    if (obj.type === 'racking_area') {
      const dx = Math.max(obj.x - wx, 0, wx - (obj.x + obj.width)), dy = Math.max(obj.y - wy, 0, wy - (obj.y + obj.height))
      const out = Math.hypot(dx, dy), inn = Math.min(wx - obj.x, obj.x + obj.width - wx, wy - obj.y, obj.y + obj.height - wy)
      const d = out > 0 ? out : Math.max(0, inn)
      if (d <= line) take({ id: obj.id, kind: 'object', real: true, p })
      else if (d <= 6 / zoom) take({ id: obj.id, kind: 'object', real: false, p })
      continue
    }
    /* A section is picked by its outline (its inside is the racks standing in it and the floor — §7a Sections) */
    if (obj.type === 'section_area') {
      if (onOutline(obj, wx, wy, line)) take({ id: obj.id, kind: 'object', real: true, p })
      else if (onOutline(obj, wx, wy, 6 / zoom)) take({ id: obj.id, kind: 'object', real: false, p })
      continue
    }
    if (objectContains(obj, wx, wy, zoom)) {
      // (a text's box is the one objectContains pads — worldBoundsOf measures its words)
      const b = obj.type === 'text' ? getObjectBounds(obj) : worldBoundsOf(obj, objects)
      const inside = !b || !(b.width > 0) || !(b.height > 0) || (wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height)
      take({ id: obj.id, kind: 'object', real: inside, p })
    }
  }
  if (real) return { id: real.id, kind: real.kind, real: true }
  if (pad) return { id: pad.id, kind: pad.kind, real: false }
  // the building's blank floor, last
  for (const obj of sorted) {
    if (!isLayerUsable(layerMap, obj) || !FP_SET.has(obj.type)) continue
    if (objectContains(obj, wx, wy, zoom)) return { id: obj.id, kind: 'floor', real: false }
  }
  return { id: null, kind: 'none', real: false }
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
export function fpWallHitTest(objects, layers, wx, wy, zoom, gridSize = 40, band = null) {
  const layerMap = new Map((layers || []).map(l => [l.id, l]))
  for (const obj of objects) {
    if (!FP_SET.has(obj.type)) continue
    if (!isLayerUsable(layerMap, obj)) continue
    const hitW = band ? band(obj) : Math.max(18, 24 / zoom)
    const walls = getFpWallSegments(obj, gridSize)
    for (const seg of walls) {
      if (distToSegment({ x: wx, y: wy }, seg.a, seg.b) < hitW) {
        return { objId: obj.id, wallIdx: seg.index }
      }
    }
  }
  return null
}

/** (Before the one hit rule — pickAt — the press, the hover and the right-click asked this after the pick. Kept for the
 *  wall-row check, REG_handCheck's Fix test.)
 *  A press ON a building's wall (within its drawn thickness and a few screen px) that the pick gave to an object only
 *  through that object's pick padding — the press is outside the object itself (a rack standing 3″ off the wall, its
 *  8px padding reaching over the wall at plan zoom): the wall wins, so the building can always be picked by its wall.
 *  An object really on the wall (the press inside it) still wins. → the wall hit, or null. */
export function wallBeatsPadding(objects, layers, wx, wy, zoom, gridSize, hitObj) {
  if (!hitObj || FP_SET.has(hitObj.type)) return null
  const b = worldBoundsOf(hitObj, objects)
  if (b && wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) return null
  return fpWallHitTest(objects, layers, wx, wy, zoom, gridSize, (fp) => ((fp.wallThicknessFt || 0.25) * gridSize) + 6 / zoom)
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
