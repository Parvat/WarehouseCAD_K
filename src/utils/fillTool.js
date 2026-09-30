// fillTool.js — the "Fill racking" tool's state: the box being dragged, its
// live plan (generate/fillRacking.js), the Racking settings it fills with,
// and the one-undo-step commit. Presentation state, never the canvas store —
// until the fill itself is committed.

import { create } from 'zustand'
import { planFill, DEFAULT_FILL_SETTINGS } from '../generate/fillRacking'

export const FILL_TOOL = 'fill_racking'

const LS_KEY = 'trace.racking.v1'
const readSettings = () => {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return v ? { ...DEFAULT_FILL_SETTINGS, ...v } : { ...DEFAULT_FILL_SETTINGS } } catch { return { ...DEFAULT_FILL_SETTINGS } }
}

/** The Racking settings (orientation, beam, pallet, forklift / aisle, max rack
 *  run, wall clearance): the fill tool's options bar edits them, the Generate
 *  panel keeps them in step with its own fields. Remembered per browser. */
export const useRackingSettings = create((set, get) => ({
  ...readSettings(),
  setSetting: (k, v) => {
    set({ [k]: v })
    try { const { setSetting, ...plain } = get(); void setSetting; localStorage.setItem(LS_KEY, JSON.stringify(plain)) } catch { /* private window */ }
  },
}))
export const rackingSettings = () => { const { setSetting, ...plain } = useRackingSettings.getState(); void setSetting; return plain }

/** The box being dragged ({ from, to } world px) and its live plan. */
export const useFillTool = create(() => ({ drag: null, plan: null }))

export const boxOfDrag = (d) => d && ({ x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) })

/** The press: the box starts here. */
export function startFill(world) { useFillTool.setState({ drag: { from: world, to: world }, plan: null }) }

/** The drag: the box grows; the plan (and its estimate) follows. */
export function moveFill(world, objects, gridSize = 40) {
  const d = useFillTool.getState().drag
  if (!d) return null
  const drag = { ...d, to: world }
  const plan = planFill(objects, boxOfDrag(drag), rackingSettings(), { gridSize })
  useFillTool.setState({ drag, plan })
  return plan
}

/** The release: the planned racks and aisles go in as ONE undo step.
 *  Returns how many racks were placed. */
export function commitFill(store) {
  const { plan } = useFillTool.getState()
  useFillTool.setState({ drag: null, plan: null })
  if (!plan || !plan.racks.length) return 0
  const st = store.getState()
  store.setState({ objects: [...st.objects, ...plan.racks, ...plan.aisles] })
  store.getState().commitObjectUpdate(plan.racks[0].id, {})
  return plan.racks.length
}

/** Esc: the box goes, nothing is placed. */
export function cancelFill() {
  if (!useFillTool.getState().drag) return false
  useFillTool.setState({ drag: null, plan: null })
  return true
}
