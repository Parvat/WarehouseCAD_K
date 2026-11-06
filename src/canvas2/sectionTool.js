// sectionTool.js — the Section tool (STUDIO.md §7a Sections): the tool pill's Section ▾ — Rectangle (drag a box) or
// Custom shape (the pen: click points; a double-click or a click on the first point closes it). One undo step per
// section; the tool then ends (back to Pan) with the new section selected. Esc drops a drawing in progress.
// Presentation state here, never the canvas store; the section itself is the store's (utils/sectionAreas.js).

import { create } from 'zustand'
import { polySection } from '../utils/sectionAreas'
import { penPoint, drawnRect, wallSides, sideAt, onWall } from '../utils/sectionEdit'
import { HOME_TOOL } from '../utils/homeTool'

export const SECTION_RECT_TOOL = 'section_rect'
export const SECTION_PEN_TOOL = 'section_pen'
export const isSectionTool = (t) => t === SECTION_RECT_TOOL || t === SECTION_PEN_TOOL

/** drag: { from, to } (world) while a rectangle is dragged; pen: [[x, y], …] the points clicked; at: the pointer */
/* guide: the dashed line along a snapped angle; len: the live segment length (world px) — both for the pen */
/* sides: the wall close's two sides while one is chosen ([{ pts, ok }] — drawing has stopped), hot: the one under the pointer */
export const useSectionTool = create(() => ({ drag: null, pen: [], at: null, added: false, guide: null, len: 0, sides: null, hot: -1 }))   // added: the last press placed a point
/** The section the Sections list (the card) is hovering: drawn highlighted on the plan. */
export const useSectionHover = create(() => ({ id: null }))
/** The section whose name is being typed on the plan (a second click on its label). */
export const useSectionRename = create(() => ({ id: null }))

/** Drops a drawing in progress → true when there was one. */
export function cancelSection() {
  const s = useSectionTool.getState()
  if (!s.drag && !s.pen.length) return false
  useSectionTool.setState({ drag: null, pen: [], at: null, added: false, guide: null, len: 0, sides: null, hot: -1 })
  return true
}

const finish = (store, fields) => {
  useSectionTool.setState({ drag: null, pen: [], at: null, added: false, guide: null, len: 0, sides: null, hot: -1 })
  const st = store.getState()
  st.setActiveTool(HOME_TOOL)
  if (!fields) return null
  st.addObject(fields)                                     // one undo step (the store's addObject)
  const made = store.getState().objects[store.getState().objects.length - 1]
  store.getState().selectObject(made.id, false)
  return made
}

/* the rectangle */
export const startRect = (w) => useSectionTool.setState({ drag: { from: w, to: w } })
export const moveRect = (w) => { const d = useSectionTool.getState().drag; if (d) useSectionTool.setState({ drag: { ...d, to: w } }) }
export function boxOf(d) {
  const x = Math.min(d.from.x, d.to.x), y = Math.min(d.from.y, d.to.y)
  return { x, y, w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) }
}
/** The release: a box 4 screen px or more each way becomes a section — kept inside the building and off its neighbours'
 *  real shapes (utils/sectionEdit.js drawnRect); smaller, none. */
export function commitRect(store, zoom = 1) {
  const d = useSectionTool.getState().drag
  if (!d) return null
  const st = store.getState()
  return finish(store, drawnRect(st.objects, d.from, d.to, { gridSize: st.gridSize || 40, min: 4 / (zoom || 1) }))
}

/* the pen */
const CLOSE_PX = 8
/** The pen's point for the pointer at world `w` (utils/sectionEdit.js penPoint: the angle snap, Shift locking it, and
 *  the snap onto walls and section edges). */
const snapped = (store, w, zoom, shift) => {
  const st = store.getState(), pen = useSectionTool.getState().pen
  return penPoint(st.objects, pen[pen.length - 1] || null, [w.x, w.y], { zoom, shift, gridSize: st.gridSize || 40 })
}
/** A click at world `w`: a point added — or, on the first point (3+ placed), the shape closed. A second click on the
 *  same spot (a double-click's) adds nothing. */
export function penClick(store, w, zoom = 1, shift = false) {
  // the wall close's sides offered: this click picks the one under it (none under it: nothing)
  { const s = useSectionTool.getState()
    if (s.sides) { const i = sideAt(s.sides, w.x, w.y); return i >= 0 ? finish(store, polySection(s.sides[i].pts, store.getState().objects)) : null } }
  const pen = useSectionTool.getState().pen, z = zoom || 1
  if (!(pen.length >= 3 && Math.hypot(w.x - pen[0][0], w.y - pen[0][1]) <= CLOSE_PX / z)) { const q = snapped(store, w, zoom, shift).p; w = { x: q[0], y: q[1] } }
  if (pen.length >= 3 && Math.hypot(w.x - pen[0][0], w.y - pen[0][1]) <= CLOSE_PX / z) return penClose(store, { onFirst: true })
  const last = pen[pen.length - 1]
  if (last && Math.hypot(w.x - last[0], w.y - last[1]) <= 3 / z) { useSectionTool.setState({ added: false }); return null }
  useSectionTool.setState({ pen: [...pen, [w.x, w.y]], added: true })
  /* started on a wall and now on a wall again: drawing stops — both closing sides, along the walls each way, are offered
     (those that would overlap another section are not); the next click picks one, Esc cancels */
  { const st = store.getState(), next = useSectionTool.getState().pen
    if (next.length >= 2 && onWall(st.objects, next[next.length - 1], st.gridSize || 40)) {
      const sides = wallSides(st.objects, next, st.gridSize || 40)
      if (sides && sides.some(sd => sd.ok)) useSectionTool.setState({ sides, hot: sideAt(sides, w.x, w.y), guide: null, len: 0 })
    } }
  return null
}
/** A double-click (or a click on the first point): the shape closed — 3 points or more make a section. (A path from a
 *  wall to a wall stops at the wall instead, its sides offered: penClick.) */
export function penClose(store, { onFirst = false } = {}) {          // eslint-disable-line no-unused-vars
  const pen = useSectionTool.getState().pen, st = store.getState()
  if (useSectionTool.getState().sides) return null           // a side is being chosen: a click picks it
  if (pen.length < 3) return null                          // not a shape yet: drawing goes on (Esc drops it)
  return finish(store, polySection(pen, st.objects))
}
/** The pointer moved with the pen: its snapped point, the guide and the live length. */
export function penMove(w, store = null, zoom = 1, shift = false) {
  if (!store) { useSectionTool.setState({ at: w }); return }
  // choosing a side: the one under the pointer lights up
  { const s = useSectionTool.getState(); if (s.sides) { const hot = sideAt(s.sides, w.x, w.y); if (hot !== s.hot) useSectionTool.setState({ hot, at: null }); return } }
  const r = snapped(store, w, zoom, shift)
  useSectionTool.setState({ at: { x: r.p[0], y: r.p[1] }, guide: r.guide, len: r.len })
}
/** A double-click: it closes the shape when its second press landed on the point already there (added nothing) — two
 *  quick clicks at two different points are two points (the canvas reports any two quick clicks as a double-click). */
export function penDblClick(store) {
  if (useSectionTool.getState().added) return null
  return penClose(store)
}
