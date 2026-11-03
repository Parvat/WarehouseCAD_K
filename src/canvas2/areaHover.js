// areaHover.js — the racking area under the pointer (its edge — hitTest.js picks an area by its edge), so the plan
// can draw it while it is hovered (STUDIO.md §7: a racking area is invisible by default; its faint fill and dashed
// edge show only while Fill racking is on, or while it is hovered or selected). Presentation state only.

import { create } from 'zustand'

export const useAreaHover = create(() => ({ id: null }))
export const setAreaHover = (id) => { if (useAreaHover.getState().id !== (id || null)) useAreaHover.setState({ id: id || null }) }
/** Is racking area `id` drawn now? */
export const areaShown = (id, { filling = false, hoverId = null, selectedIds = [] } = {}) => !!(filling || hoverId === id || selectedIds.includes(id))
