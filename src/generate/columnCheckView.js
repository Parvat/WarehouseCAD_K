// generate/columnCheckView.js — the column-check settings the canvas is
// currently drawing with (truck profile, pick-both-sides, the marks switch),
// published by ColumnCheckProvider so the PDF export checks and marks the
// layout exactly as the screen does. Plain module state; no React.
import { MHE_PROFILES } from './columnCheck'

let view = { profile: MHE_PROFILES.reach, pickBothSides: false, showMarks: true }
export const setColumnCheckView = (v) => { view = { ...view, ...v } }
export const getColumnCheckView = () => view
