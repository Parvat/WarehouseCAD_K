// sectionTool.js — the Section tool (STUDIO.md §7a Sections): the tool pill's Section ▾ — Rectangle (drag a box) or
// Custom shape (the pen: click points; a double-click or a click on the first point closes it). One undo step per
// section; the tool then ends (back to Pan) with the new section selected. Esc drops a drawing in progress.
// Presentation state here, never the canvas store; the section itself is the store's (utils/sectionAreas.js).

import { create } from 'zustand'
import { rectSection, polySection } from '../utils/sectionAreas'
import { HOME_TOOL } from '../utils/homeTool'

export const SECTION_RECT_TOOL = 'section_rect'
export const SECTION_PEN_TOOL = 'section_pen'
export const isSectionTool = (t) => t === SECTION_RECT_TOOL || t === SECTION_PEN_TOOL

/** drag: { from, to } (world) while a rectangle is dragged; pen: [[x, y], …] the points clicked; at: the pointer */
export const useSectionTool = create(() => ({ drag: null, pen: [], at: null, added: false }))   // added: the last press placed a point
/** The section the Sections list (the card) is hovering: drawn highlighted on the plan. */
export const useSectionHover = create(() => ({ id: null }))
/** The section whose name is being typed on the plan (a second click on its label). */
export const useSectionRename = create(() => ({ id: null }))

/** Drops a drawing in progress → true when there was one. */
export function cancelSection() {
  const s = useSectionTool.getState()
  if (!s.drag && !s.pen.length) return false
  useSectionTool.setState({ drag: null, pen: [], at: null, added: false })
  return true
}

const finish = (store, fields) => {
  useSectionTool.setState({ drag: null, pen: [], at: null, added: false })
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
/** The release: a box 4 screen px or more each way becomes a section (snapped off its neighbours); smaller, none. */
export function commitRect(store, zoom = 1) {
  const d = useSectionTool.getState().drag
  if (!d) return null
  const b = boxOf(d), min = 4 / (zoom || 1)
  return finish(store, b.w >= min && b.h >= min ? rectSection(b, store.getState().objects) : null)
}

/* the pen */
const CLOSE_PX = 8
/** A click at world `w`: a point added — or, on the first point (3+ placed), the shape closed. A second click on the
 *  same spot (a double-click's) adds nothing. */
export function penClick(store, w, zoom = 1) {
  const pen = useSectionTool.getState().pen, z = zoom || 1
  if (pen.length >= 3 && Math.hypot(w.x - pen[0][0], w.y - pen[0][1]) <= CLOSE_PX / z) return penClose(store)
  const last = pen[pen.length - 1]
  if (last && Math.hypot(w.x - last[0], w.y - last[1]) <= 3 / z) { useSectionTool.setState({ added: false }); return null }
  useSectionTool.setState({ pen: [...pen, [w.x, w.y]], added: true })
  return null
}
/** A double-click (or a click on the first point): the shape closed — 3 points or more make a section. */
export function penClose(store) {
  const pen = useSectionTool.getState().pen
  if (pen.length < 3) return null                          // not a shape yet: drawing goes on (Esc drops it)
  return finish(store, polySection(pen, store.getState().objects))
}
export const penMove = (w) => useSectionTool.setState({ at: w })
/** A double-click: it closes the shape when its second press landed on the point already there (added nothing) — two
 *  quick clicks at two different points are two points (the canvas reports any two quick clicks as a double-click). */
export function penDblClick(store) {
  if (useSectionTool.getState().added) return null
  return penClose(store)
}
