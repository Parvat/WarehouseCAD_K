// canvas2/selection.js
// ─────────────────────────────────────────────────────────────────────────────
// What a press means, as pure functions.
//
// The canvas decides ownership of a gesture ONCE, on mousedown, from what is
// under the pointer — and the rules for that decision live here rather than
// tangled into an event handler, so they can be read and tested on their own.
//
// No React, no Konva, no store writes. Given a selection and a press, these say
// what the next selection SHOULD be; the caller performs it through the store's
// own actions.
// ─────────────────────────────────────────────────────────────────────────────

import { getObjectBounds } from '../utils/canvas'

/** What a mousedown is for. Latched at press and held until release, so a drag
 *  that began on an object can never turn into a marquee halfway across the
 *  sheet, and a pan never becomes a selection because it crossed a rack. */
export const GESTURE = {
  PAN: 'pan',
  SELECT: 'select',
  MARQUEE: 'marquee',
}

/** Which gesture a press begins.
 *
 *  Order matters and is deliberate:
 *    • middle button or held space ALWAYS pans, over anything. These are the
 *      escape hatches that must never be ambiguous.
 *    • shift over empty space starts a marquee; shift over an object adds it to
 *      the selection instead, because that is the gesture people expect and a
 *      marquee starting on top of an object is almost always a mis-aim.
 *    • a press on an object selects it.
 *    • a press on empty space pans. */
export function gestureFor({ button = 0, shiftKey = false, spaceDown = false, hitId = null }) {
  if (button === 1 || spaceDown) return GESTURE.PAN
  if (button !== 0) return null
  if (shiftKey) return hitId ? GESTURE.SELECT : GESTURE.MARQUEE
  return hitId ? GESTURE.SELECT : GESTURE.PAN
}

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
