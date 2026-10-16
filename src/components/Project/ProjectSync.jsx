import { useEffect } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useColumnCheck } from '../../generate/useColumnCheck'
import { useRules } from '../../rules/useRules'
import { useRackingSettings } from '../../utils/fillTool'
import { defaultPallet } from '../../utils/project'

/* The project (utils/project.js) is where the forklift, the pallet, the wall clearance and the units are set; this
   keeps what still reads them elsewhere in step — the column check's forklift (its context), and the Fill racking
   settings (forklift, aisle for it, pallet face × depth, wall clearance). Renders nothing. */
export function ProjectSync() {
  const pr = useCanvasStore(s => s.elevations?.project || null)
  const { mheKey, setMheKey } = useColumnCheck()
  const { mheOptions } = useRules()
  useEffect(() => {
    if (!pr) return
    const mhe = pr.equipment?.mhe || 'reach'
    if (mhe !== mheKey) setMheKey(mhe)
    const rs = useRackingSettings.getState(), set = rs.setSetting, pal = defaultPallet(pr)
    const want = { mhe, aisleFt: mheOptions[mhe]?.aisleFt ?? rs.aisleFt, wallClearIn: pr.rules?.wallClearIn ?? rs.wallClearIn, ...(pal ? { palletWIn: pal.faceIn, palletDIn: pal.depthIn } : {}) }
    for (const [k, v] of Object.entries(want)) if (rs[k] !== v && v != null) set(k, v)
    const units = pr.rules?.units, st = useCanvasStore.getState()
    if (units && st.unit !== units) st.setUnit(units)
  }, [pr, mheOptions])   // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
