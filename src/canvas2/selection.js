// canvas2/selection.js
// ─────────────────────────────────────────────────────────────────────────────
// What a press means, as pure functions.
//
// Gesture OWNERSHIP (pan vs select vs marquee) is now decided by Konva itself —
// each object node carries its own onMouseDown/draggable, and the Stage only
// sees a press when Konva reports e.target === stage. What is left here is what
// a press or a marquee SHOULD select, and the geometry a drag needs — logic
// that has nothing to do with who owns the gesture.
//
// No React, no Konva, no store writes. Given a selection and a press, these say
// what the next selection SHOULD be; the caller performs it through the store's
// own actions.
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds } from '../utils/canvas'

/** The selection a press on `id` should produce.
 *
 *  Mirrors CanvasArea rule for rule so an object behaves the same in either
 *  canvas:
 *    • a grouped object selects its whole group — the group is the unit;
 *    • shift toggles the object in and out of the selection;
 *    • an object ALREADY selected keeps the selection intact, which is what
 *      makes dragging a multi-selection possible at all (re-selecting on every
 *      press would collapse it to one first);
 *    • anything else replaces the selection.
 *
 *  Returns { ids, replaced } — `replaced` false means the caller should leave
 *  the selection alone entirely. */
export function nextSelection({ selectedIds = [], groups = [], id, shiftKey = false }) {
  if (!id) return { ids: [], replaced: true }

  const group = (groups || []).find(g => g.ids && g.ids.includes(id))
  if (group) return { ids: [...group.ids], replaced: true }

  if (shiftKey) {
    return selectedIds.includes(id)
      ? { ids: selectedIds.filter(x => x !== id), replaced: true }
      : { ids: [...selectedIds, id], replaced: true }
  }

  if (selectedIds.includes(id)) return { ids: selectedIds, replaced: false }
  return { ids: [id], replaced: true }
}

/** Two corners → a positive rectangle, whichever way the drag went. */
export function normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y
}

/** Everything the marquee touches.
 *
 *  Touch, not containment: on a 1,080ft building a rack is longer than the
 *  screen at any readable zoom, so requiring full enclosure would make marquee
 *  selection useless exactly where it is needed most. */
export function objectsInMarquee(objects = [], rect, { isVisible } = {}) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return []
  const out = []
  for (const o of objects) {
    if (!o) continue
    if (isVisible && !isVisible(o)) continue
    const b = getObjectBounds(o)
    if (!b || !(b.width >= 0) || !(b.height >= 0)) continue
    /* A zero-thickness object — a horizontal line — would never overlap on that
       axis. Give it a hair of width so it can still be caught. */
    const box = {
      x: b.x, y: b.y,
      width: Math.max(b.width, 0.001),
      height: Math.max(b.height, 0.001),
    }
    if (rectsOverlap(rect, box)) out.push(o.id)
  }
  return out
}

/** A drag has to travel before it counts as one, so a shaky click does not
 *  begin a one-pixel marquee or nudge the view. Screen px. */
export const DRAG_THRESHOLD = 3

export function movedEnough(a, b, threshold = DRAG_THRESHOLD) {
  return Math.hypot(b.x - a.x, b.y - a.y) >= threshold
}

/* Floor-plan types, for the cascade below. */
const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

/** Everything a move of `ids` will ACTUALLY shift.
 *
 *  The store cascades a floor-plan move to its parentId children, so dragging
 *  the building carries its racks. The preview has to move the same set or the
 *  drag lands somewhere other than where it looked — which is the bug that made
 *  the building appear to slide out from under its own contents.
 *
 *  Mirrors the store's rule rather than reimplementing it: children of a moved
 *  floor plan, and nothing else. */
export function movedIdsFor(objects = [], ids = []) {
  const set = new Set(ids)
  const movedFps = new Set()
  for (const o of objects) {
    if (o && set.has(o.id) && FP_TYPES.has(o.type)) movedFps.add(o.id)
  }
  if (movedFps.size) {
    for (const o of objects) {
      if (o && o.parentId && movedFps.has(o.parentId)) set.add(o.id)
    }
  }
  return set
}

/** An object's centre, whatever geometry class it belongs to.
 *  Used to decide which building an object sits in after a move. */
export function objectCentre(obj) {
  if (!obj) return null
  if (Number.isFinite(obj.cx) && Number.isFinite(obj.cy)) return { x: obj.cx, y: obj.cy }
  if (Number.isFinite(obj.x1)) return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 }
  if (Number.isFinite(obj.x)) {
    return { x: obj.x + (obj.width || 0) / 2, y: obj.y + (obj.height || 0) / 2 }
  }
  return null
}

export const isFloorPlan = obj => !!obj && FP_TYPES.has(obj.type)

/* Rack types the SVG engine's own marquee-mouseup bay-intersection checks —
   CanvasArea.jsx's own BAY_ROW_TYPES, verbatim. Note this is broader than
   what actually ever produces an entry: only types that carry a `.beams`
   array (rack_row, rack_double_row in practice) pass the `!obj.beams` guard
   below — cantilever/pushback/pallet_flow/drive_through are listed here
   too, matching the reference exactly, even though their own geometry
   (towers/lanes, not a beam-width array) means this specific algorithm
   never actually walks their bays. Ported as-is rather than narrowed: the
   task is to port the intersection math, not to second-guess which of the
   reference's own listed types can really reach it. */
const BAY_ROW_TYPES = new Set([
  'rack_row', 'rack_double_row', 'rack_cantilever',
  'rack_pushback', 'rack_pallet_flow', 'rack_drive_through',
])

/** Cross-row bay marquee — CanvasArea.jsx's own marquee-mouseup
 *  bay-intersection block, ported verbatim (same cursor walk: start at
 *  `obj.x + upW`, one bay per `beams` entry, step past its own upright to
 *  the next). Returns every {objId, bayIdx} whose bay column overlaps
 *  `rect`, across every eligible row in `objects` — not just one rack, so
 *  a single rubber-band drag can span multiple rows at once, which is the
 *  whole point of this over the plain per-bay click (hitTestBay). */
export function bayEntriesInMarquee(objects = [], rect, gridSize = 40) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return []
  const minX = rect.x, maxX = rect.x + rect.width
  const minY = rect.y, maxY = rect.y + rect.height
  const bayEntries = []
  objects.forEach(obj => {
    if (!obj || !BAY_ROW_TYPES.has(obj.type) || !obj.beams) return
    const b = getObjectBounds(obj)
    if (b.y > maxY || b.y + b.height < minY) return   // row not in Y range
    const upW = ((obj.uprightWidth || 3) / 12) * gridSize
    let cursor = obj.x + upW
    obj.beams.forEach((beamIn, i) => {
      const beamPx = (beamIn / 12) * gridSize
      const bayX0 = cursor, bayX1 = cursor + beamPx
      if (bayX0 < maxX && bayX1 > minX) bayEntries.push({ objId: obj.id, bayIdx: i })
      cursor = bayX1 + upW
    })
  })
  return bayEntries
}
