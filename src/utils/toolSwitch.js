// toolSwitch.js — ONE way a tool ends. Switching to any tool (the drawing toolbar, a library shape), pressing Esc, or
// clicking a library item fully ends the tool before it: its cursor (Canvas2 derives it from the tool and the
// measure mode), its preview and ghost (a fill box, a Row group box, the Split hover, a placement following the
// mouse), its options bar, and its key handling (each reads the active tool, so they go with it).
//   - endTool(store): end whatever is running and go back to Select — a library item calls it before it places;
//   - installToolKeeper(store): every change of the active tool ends what the previous one left behind, whoever
//     changed it.
// The measure mode (the ruler button) is a mode beside the tools: useMeasureMode, ended by both.

import { create } from 'zustand'
import { TOOLS } from '../constants'
import { useFillTool } from './fillTool'
import { cancelGroupBox } from './rowGroupTool'
import { useSplit } from './splitTool'
import { cancelPlacement } from './placement'

/** The measure mode: on while the ruler is measuring (Canvas2's MeasureOverlay). */
export const useMeasureMode = create(() => ({ on: false }))

/* what a tool leaves behind */
function clearTransients() {
  { const f = useFillTool.getState(); if (f.drag || f.plan || f.created) useFillTool.setState({ drag: null, plan: null, created: null }) }
  cancelGroupBox()
  { if (useSplit.getState().hover) useSplit.setState({ hover: null }) }
}

/** End whatever is running — the tool, its box or hover, a placement on the mouse, the measure mode — and go back
 *  to Select. A placement on the mouse is cancelled (Esc's own rule: a split piece goes back where it was). */
export function endTool(store) {
  clearTransients()
  cancelPlacement()
  if (useMeasureMode.getState().on) useMeasureMode.setState({ on: false })
  const st = store.getState()
  if (st.activeTool !== TOOLS.SELECT) st.setActiveTool(TOOLS.SELECT)
}

/** Subscribe: whenever the active tool changes, the previous tool's leftovers go, a placement on the mouse ends, the
 *  measure mode ends. Returns the unsubscribe. */
export function installToolKeeper(store) {
  let last = store.getState().activeTool
  return store.subscribe((st) => {
    if (st.activeTool === last) return
    last = st.activeTool
    clearTransients()                                       // every tool's leftovers, not only the last one's
    cancelPlacement()
    if (useMeasureMode.getState().on) useMeasureMode.setState({ on: false })
  })
}
