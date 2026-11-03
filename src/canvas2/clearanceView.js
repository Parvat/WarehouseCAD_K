// clearanceView.js — when the column clearance tags ("9′ clear" with the blue arrow) are on the plan (STUDIO.md §7):
// while an action is under way (a drag, a resize, a rotate — dragPreview's `dragging`), and while a column's
// "Show clearances" (the selection bar) is on. When the action ends they go. The red "under travel" warnings are
// checks and stay with the Checks layer; the PDF draws every tag as before. Presentation state only.

import { create } from 'zustand'

export const useClearanceView = create(() => ({ show: false }))
export const setShowClearances = (on) => useClearanceView.setState({ show: !!on })
/** Are the blue clearance tags drawn now? */
export const clearanceTagsOn = (dragging, show) => !!dragging || !!show
