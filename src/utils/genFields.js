// genFields.js — the Generate card's building fields (C4: Building width / length, Column grid, Max run, Columns along
// wall, Row direction), shared with the layout menu's "Start over with a new building", which draws the new building
// from them. Presentation state: filled from the project's building (the start screen's choices) when the card opens,
// never written to the layout.
import { create } from 'zustand'
import { BUILDING_DEFAULTS, generateBrief, projectOf } from './project'
import { generateAndPlaceBatched } from '../generate/traceGenerate'

const FIELDS = ['lengthFt', 'widthFt', 'gridXFt', 'gridYFt', 'maxRunFt', 'columnsAlongWall', 'orientation']

export const useGenFields = create(() => ({
  lengthFt: BUILDING_DEFAULTS.lengthFt, widthFt: BUILDING_DEFAULTS.widthFt, gridXFt: BUILDING_DEFAULTS.gridXFt, gridYFt: BUILDING_DEFAULTS.gridYFt,
  maxRunFt: BUILDING_DEFAULTS.maxRunFt, columnsAlongWall: false, orientation: 'auto',
}))
export const setGenField = (k, v) => useGenFields.setState({ [k]: v })

/** The fields from the project's building (what the start screen chose), where it has them. */
export function fillGenFields(project) {
  const g = project?.building
  if (!g) return
  const patch = {}
  if (g.lengthFt) patch.lengthFt = g.lengthFt
  if (g.widthFt) patch.widthFt = g.widthFt
  if (g.gridXFt != null) patch.gridXFt = g.gridXFt
  if (g.gridYFt != null) patch.gridYFt = g.gridYFt
  if (g.maxRunFt) patch.maxRunFt = g.maxRunFt
  if (g.orientation) patch.orientation = g.orientation
  if (g.columnsAlongWall != null) patch.columnsAlongWall = !!g.columnsAlongWall
  useGenFields.setState(patch)
}

/** Generate's brief from the fields and the project (pallet, forklift, wall clearance). */
export function genBrief(project, mheOptions) {
  const f = useGenFields.getState()
  return generateBrief(project, mheOptions, Object.fromEntries(FIELDS.map(k => [k, f[k]])))
}

/** Start over with a new building: everything in the layout goes; a new building from the fields, generated. */
export function startOverLayout(store, { rules, mheOptions, onProgress } = {}) {
  return generateAndPlaceBatched(genBrief(projectOf(store.getState().elevations), mheOptions), { onProgress, rules })
}

/** The Generate card's draft of the project's forklift and wall clearance (`{ mhe?, wallClearIn? }`) on `project` → the
 *  project to write when Generate / Regenerate runs, or null when the draft changes nothing. The card writes it only
 *  then — Cancel or X drops the draft and Project settings stays as it was. */
export function projectWithDraft(project, draft = {}) {
  if (!project) return null
  const mhe = draft.mhe ?? project.equipment?.mhe, wallClearIn = draft.wallClearIn ?? project.rules?.wallClearIn
  if (mhe === project.equipment?.mhe && wallClearIn === project.rules?.wallClearIn) return null
  return { ...project, equipment: { ...project.equipment, mhe }, rules: { ...project.rules, wallClearIn } }
}
