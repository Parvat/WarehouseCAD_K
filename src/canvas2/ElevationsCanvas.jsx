import { useMemo } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { legendCounts } from '../utils/elevations'
import { useElevView, setShowColors, tint, tintOn, ELEV_FILL_OPACITY } from '../utils/elevationDraw'
import { useElevMode } from '../utils/elevMode'
import { bayLedger } from '../utils/bayLedger'

/* Elevations on the canvas (ELEVATIONS_PLAN.md §4) — ElevLegend: bottom left, the types in use with their colour and
   bay count, and the Show colours toggle. Types are set from a selection's Elevation section in Properties. */

/* the swatch as the bay fill looks: the tint at the fill's opacity over white (the rack's pale fill) */
const swatch = (color) => ({ width: 12, height: 12, borderRadius: 3, background: '#fff', boxShadow: `inset 0 0 0 12px ${color}`, opacity: 1, border: '1px solid rgba(0,0,0,0.25)', flexShrink: 0, position: 'relative' })
const Swatch = ({ color }) => <span style={{ ...swatch(color), boxShadow: 'none' }}><span style={{ position: 'absolute', inset: 0, borderRadius: 2, background: color, opacity: ELEV_FILL_OPACITY }} /></span>

export function ElevLegend() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const showColors = useElevView(s => s.showColors)
  const elevations = useCanvasStore(s => s.elevations)
  const elevMode = useElevMode(s => s.on)
  // the colours shown (the toggle, or Elevation mode) — and only with 2+ elevations, as the plan's fill
  const tinted = (showColors || elevMode) && tintOn(elevations)
  const rows = useMemo(() => {
    const L = bayLedger(objects, gridSize, elevations)
    return legendCounts(objects, elevations, (r) => L.racks.get(r.id)?.counted || null)
  }, [objects, gridSize, elevations])
  if (!rows.length) return null
  return (
    <div aria-label="Elevation legend" style={{
      // past the fixed "← Hub" button at the window's bottom left, so neither covers the other
      position: 'absolute', left: 104, bottom: 12, zIndex: 50, padding: '6px 8px', borderRadius: 8, minWidth: 150,
      background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text, #0B101D)', display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text3, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
        <input type="checkbox" checked={showColors} onChange={e => setShowColors(e.target.checked)} aria-label="Show elevation colours" />
        Elevations
      </label>
      {(showColors || elevMode) && rows.map(({ type, bays }) => (
        <div key={type.id} data-legend-type={type.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {tinted ? <Swatch color={tint(type.color)} /> : <span style={{ width: 12, flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{type.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2, #3A4152)' }}>{bays} bay{bays === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  )
}
