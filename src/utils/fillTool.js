// fillTool.js — the "Fill racking" tool's state: the box being dragged, its
// live plan (generate/fillRacking.js), the Racking settings it fills with,
// and the one-undo-step commit. The box becomes a racking area
// (generate/rackingArea.js) that remembers its settings and racks. Presentation state, never the canvas store —
// until the fill itself is committed.

import { create } from 'zustand'
import { DEFAULT_FILL_SETTINGS } from '../generate/fillRacking'
import { planAreaCreate } from '../generate/rackingArea'
import { clearFromOutline } from '../generate/wallClear'
import { nanoid } from 'nanoid'

export const FILL_TOOL = 'fill_racking'

const LS_KEY = 'trace.racking.v1'
const readSettings = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (!v) return { ...DEFAULT_FILL_SETTINGS }
    /* the wall clearance before BUG 76 (`wallClearanceIn`, from the building's outline — the Generate field):
       read as inches from the wall's inner face, the old value less the default 3" wall, never below 0 */
    const { wallClearanceIn, ...rest } = v
    if (!Number.isFinite(rest.wallClearIn) && Number.isFinite(wallClearanceIn)) rest.wallClearIn = clearFromOutline(wallClearanceIn)
    return { ...DEFAULT_FILL_SETTINGS, ...rest }
  } catch { return { ...DEFAULT_FILL_SETTINGS } }
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

/** The box being dragged ({ from, to } world px), its live plan, and the
 *  racking area it would create (the plan's racks, stamped with its id). */
export const useFillTool = create(() => ({ drag: null, plan: null, created: null }))

export const boxOfDrag = (d) => d && ({ x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) })

/** The press: the box starts here. */
export function startFill(world) { useFillTool.setState({ drag: { from: world, to: world }, plan: null, created: null }) }

/** The drag: the box grows; the plan (and its estimate) follows. */
export function moveFill(world, objects, gridSize = 40) {
  const d = useFillTool.getState().drag
  if (!d) return null
  const drag = { ...d, to: world }
  const created = planAreaCreate(objects, boxOfDrag(drag), rackingSettings(), { gridSize, from: drag.from, newId: nanoid })
  const plan = created ? created.plan : { racks: [], aisles: [], rows: 0, positions: 0, rects: [] }
  useFillTool.setState({ drag, plan, created })
  return plan
}

/** The release: the racking area, its racks and aisles go in as ONE undo
 *  step. Returns how many racks were placed. */
export function commitFill(store) {
  const { created } = useFillTool.getState()
  useFillTool.setState({ drag: null, plan: null, created: null })
  if (!created || !created.plan.racks.length) return 0
  const { area, plan } = created
  const st = store.getState()
  store.setState({ objects: [...st.objects, area, ...plan.racks, ...plan.aisles] })
  store.getState().commitObjectUpdate(area.id, {})
  return plan.racks.length
}

/** Esc: the box goes, nothing is placed. */
export function cancelFill() {
  if (!useFillTool.getState().drag) return false
  useFillTool.setState({ drag: null, plan: null, created: null })
  return true
}
