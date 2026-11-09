// useMheOptions.js — the forklift list as the app uses it: the Rules' (useRules' mheOptions) with the project's own
// widths per truck over it — Aisle to pick and Space to move, set in Project settings (the project's
// `equipment.trucks`; utils/equipment.js withTruck). Every picker, the column check and the fill read this one list.

import { useMemo } from 'react'
import { useRules } from './useRules'
import { useCanvasStore } from '../store/useCanvasStore'
import { withTruck } from '../utils/equipment'

export function useMheOptions() {
  const { mheOptions } = useRules()
  const trucks = useCanvasStore(s => s.elevations?.project?.equipment?.trucks || null)
  return useMemo(() => {
    if (!trucks) return mheOptions
    const out = {}
    for (const [k, m] of Object.entries(mheOptions)) out[k] = withTruck(m, trucks[k])
    return out
  }, [mheOptions, trucks])
}
