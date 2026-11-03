// clearanceView.js — when the column clearance numbers (the grey "8′-8″" on the dotted line) are on the plan
// (STUDIO.md §2, §7):
//   - zoomed in far enough to read them: the 9.5-at-label-size number at least 8 px tall on screen — and they stay
//     until it is under 7 px (the buffer, so they never flicker at the threshold); they fade in and out in place;
//   - while a column (its column grid) is selected, or its bar's Show clearances is on;
//   - during a drag or a resize (dragPreview's `dragging`).
// The red "under travel" warnings are checks: they stay with the Checks layer. The PDF prints every number.
// Presentation state only.

import { create } from 'zustand'

export const useClearanceView = create(() => ({ show: false }))
export const setShowClearances = (on) => useClearanceView.setState({ show: !!on })

/** The number's height on screen (px) at the view `zoom` and label scale `lz`. */
export const clearancePx = (zoom, lz) => (9.5 / lz) * zoom
export const FADE_IN_PX = 8, FADE_OUT_PX = 7, FADE_MS = 180
/** Zoomed in enough? `was`: whether they were showing (the buffer). */
export const zoomedIn = (px, was) => (was ? px >= FADE_OUT_PX : px >= FADE_IN_PX)
/** Are the clearance numbers drawn now? */
export const clearanceTagsOn = ({ dragging = false, show = false, zoom = false, columnSelected = false } = {}) => !!(dragging || show || zoom || columnSelected)
