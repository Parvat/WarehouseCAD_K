import { useMemo } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { legendCounts } from '../utils/elevations'
import { useElevView, setShowColors, tint, tintOn, ELEV_FILL_OPACITY } from '../utils/elevationDraw'
import { bayLedger } from '../utils/bayLedger'

/* Elevations on the canvas (ELEVATIONS_PLAN.md §4) — ElevLegend: the Elevations chip in the canvas's bottom row
   (Canvas2.jsx), beside the Hub button: the Show colours toggle, and the types in use with their colour and bay
   count. One type reads inline in the 32px chip; several stack in a list above it. Types are set from a
   selection's Elevation section in Properties. */

/* the swatch as the bay fill looks: the tint at the fill's opacity over white (the rack's pale fill) */
const swatch = { width: 12, height: 12, borderRadius: 2, background: 'var(--paper)', border: '1px solid var(--line-2)', flexShrink: 0, position: 'relative' }
const Swatch = ({ color }) => <span style={swatch}><span style={{ position: 'absolute', inset: 0, borderRadius: 1, background: color, opacity: ELEV_FILL_OPACITY }} /></span>

function TypeRow({ type, bays, tinted }) {
  return (
    <div data-legend-type={type.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {tinted ? <Swatch color={tint(type.color)} /> : null}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type.name}</span>
      <span className="t-num" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{bays} bay{bays === 1 ? '' : 's'}</span>
    </div>
  )
}

export function ElevLegend() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const showColors = useElevView(s => s.showColors)
  const elevations = useCanvasStore(s => s.elevations)
  // the colours shown (the toggle) — and only with 2+ elevations, as the plan's fill
  const tinted = showColors && tintOn(elevations)
  const rows = useMemo(() => {
    const L = bayLedger(objects, gridSize, elevations)
    return legendCounts(objects, elevations, (r) => L.racks.get(r.id)?.counted || null)
  }, [objects, gridSize, elevations])
  if (!rows.length) return null
  const one = rows.length === 1
  return (
    <div aria-label="Elevation legend" className="t-float" style={{
      position: 'relative', height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 360,
      fontSize: 12, color: 'var(--ink)',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
        <input type="checkbox" checked={showColors} onChange={e => setShowColors(e.target.checked)} aria-label="Show elevation colours" style={{ margin: 0 }} />
        Elevations
      </label>
      {showColors && one && rows.map(({ type, bays }) => (
        <div key={type.id} style={{ display: 'flex', minWidth: 0, flex: 1, paddingLeft: 8, borderLeft: '1px solid var(--line)' }}>
          <TypeRow type={type} bays={bays} tinted={tinted} />
        </div>
      ))}
      {showColors && !one && (
        <div aria-label="Elevation types" className="t-float" style={{
          position: 'absolute', left: 0, bottom: 'calc(100% + 8px)', minWidth: '100%', maxWidth: 360, padding: '8px 12px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {rows.map(({ type, bays }) => <TypeRow key={type.id} type={type} bays={bays} tinted={tinted} />)}
        </div>
      )}
    </div>
  )
}
