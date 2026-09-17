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
 *  selection useless exactly where it is needed most.
 *
 *  Floor plans are excluded unconditionally (BUG 26) — CanvasArea's own
 *  marquee-mouseup does the same (`if (FP_SET.has(obj.type)) return false`
 *  before its own overlap test): a marquee drawn over or starting inside a
 *  building is reaching for its CONTENTS, not the building itself, which
 *  fills most of the visible canvas at any zoom a marquee is useful at and
 *  would otherwise always be caught by any rubber-band touching it. This is
 *  baked into the function itself rather than left to callers to opt into
 *  (an `isVisible` filter) — there is exactly one call site today and the
 *  exclusion is a correctness rule, not a situational one. */
export function objectsInMarquee(objects = [], rect, { isVisible } = {}) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return []
  const out = []
  for (const o of objects) {
    if (!o) continue
    if (isFloorPlan(o)) continue
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
