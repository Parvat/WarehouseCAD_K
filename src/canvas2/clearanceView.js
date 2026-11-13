// clearanceView.js — when the column clearance numbers (the grey "8′-8″" on the dotted line) are on the plan
// (STUDIO.md §2, §7):
//   - (col-bubbles round) only while the View card's Column clearances is on — then on every column, whatever is
//     selected, at any zoom, during a drag too; off, none anywhere. The one control (was: also zoomed in, a column
//     selected, a drag). They fade in and out in place.
// The red "under travel" warnings are checks: they stay with the Checks layer. The PDF prints every number.
// Presentation state only.

import { create } from 'zustand'

// (col-card round: the View card's Column clearances — every column's numbers; remembered per browser, off by default)
const KEY = 'trace.studio.columnClearances'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
export const useClearanceView = create(() => ({ show: read() }))
export const setShowClearances = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private window */ } useClearanceView.setState({ show: !!on }) }

/** The number's height on screen (px) at the view `zoom` and label scale `lz`. */
export const clearancePx = (zoom, lz) => (9.5 / lz) * zoom
export const FADE_IN_PX = 8, FADE_OUT_PX = 7, FADE_MS = 180
/** Zoomed in enough? `was`: whether they were showing (the buffer). */
export const zoomedIn = (px, was) => (was ? px >= FADE_OUT_PX : px >= FADE_IN_PX)
/** Are the clearance numbers drawn now? */
export const clearanceTagsOn = ({ show = false } = {}) => !!show   // (col-bubbles round: the View card's toggle alone)
