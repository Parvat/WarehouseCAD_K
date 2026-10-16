import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById } from '../../utils/elevations'
import { selectionCells, cellTypes } from '../../utils/elevSelection'

/* The selection's elevation in Properties — read-only (ELEVATIONS_PLAN.md §3: elevations are set in Elevation mode,
   the top bar's Layout | Elevations). "Elevation: 5 levels · 21'"; a selection carrying several: "mixed", each with
   its bays. */
export function ElevationLine() {
  const { objects, T, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const types = useMemo(() => (T ? cellTypes(objects, T, selectionCells({ objects, selectedIds, activeBaySelection })) : []), [objects, T, selectedIds, activeBaySelection])
  if (!types.length) return null
  const name = (id) => typeById(T, id)?.name || '—'
  return (
    <div aria-label="Elevation" title="Set elevations in Elevation mode (top bar: Layout | Elevations)" style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)', padding: '2px 0' }}>
      <span style={{ color: 'var(--text3)' }}>Elevation:</span>
      <span>{types.length === 1 ? name(types[0].id) : `mixed — ${types.map(x => `${name(x.id)} (${x.bays})`).join(', ')}`}</span>
    </div>
  )
}
