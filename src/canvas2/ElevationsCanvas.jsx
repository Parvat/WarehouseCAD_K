import { useMemo } from 'react'
import { Group, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { usePaint, SCOPES } from '../utils/elevPaint'
import { typeById, legendCounts, sidesOf } from '../utils/elevations'
import { useElevView, setShowColors } from '../utils/elevationDraw'
import { bayLedger } from '../utils/bayLedger'
import { bayRectForIndex } from '../render/bayGeom'
import { spin } from './shapes'
import { TOOLS } from '../constants'

/* Elevations on the canvas (ELEVATIONS_PLAN.md §3–4):
     - ElevPaintPreview: what a click (or the drag in progress) will change, in the painted type's colour — exactly
       the targets the paint will write (utils/elevPaint.js strokeTargets), never listening;
     - ElevPaintBar: the bar at the top of the canvas in paint mode — the type, Row / Side / Bay, Reset to default,
       Done;
     - ElevLegend: bottom left, the types in use with their colour and bay count, and the Show colours toggle. */

const GROUP = '#2F7BD8'

/** The bands a set of paint targets covers, per rack: [{ obj, rects }]. */
function targetBands(objects, targets, gridSize) {
  const out = []
  if (!targets) return out
  const byId = new Map(objects.map(o => [o.id, o]))
  for (const [id, t] of targets) {
    const o = byId.get(id)
    if (!o || !Array.isArray(o.beams)) continue
    const sides = t.sides ?? Array.from({ length: sidesOf(o) }, (_, s) => s)
    const bays = t.bays ?? o.beams.map((_, b) => b)
    const rects = []
    for (const b of bays) { const rs = bayRectForIndex(o, gridSize, b); for (const s of sides) { const r = rs[rs.length === 2 ? s : 0]; if (r) rects.push(r) } }
    out.push({ obj: o, rects })
  }
  return out
}

export function ElevPaintPreview() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const { hover, stroke, typeId, reset } = usePaint()
  const targets = stroke ? stroke.targets : hover
  const T = useCanvasStore(s => s.elevations), t = typeById(T, typeId)
  const bands = useMemo(() => targetBands(objects, targets, gridSize), [objects, targets, gridSize])
  if (!bands.length) return null
  const fill = reset ? 'rgba(255,255,255,0.55)' : t ? t.color : 'rgba(47,123,216,0.3)'
  return (
    <Group listening={false}>
      {bands.map(({ obj, rects }) => (
        <Group key={obj.id} {...spin(obj, gridSize)} listening={false}>
          {rects.map((r, i) => (
            <Rect key={i} {...r} fill={fill} opacity={reset ? 1 : 0.7} stroke={GROUP} strokeWidth={1.5}
              dash={reset ? [4, 3] : undefined} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
          ))}
        </Group>
      ))}
    </Group>
  )
}

const box = {
  position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', zIndex: 60,
  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8,
  background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)', boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text, #0B101D)', whiteSpace: 'nowrap',
}
const seg = (on) => ({
  padding: '3px 9px', fontSize: 11, borderRadius: 5, cursor: 'pointer', border: 'none',
  background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2, #3A4152)',
})
const btn2 = { padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, background: 'var(--surface, #fff)', color: 'var(--text, #0B101D)', border: '1px solid var(--border, #E6E9EF)' }
const swatch = (color) => ({ width: 12, height: 12, borderRadius: 3, background: color, border: '1px solid rgba(0,0,0,0.25)', flexShrink: 0 })

export function ElevPaintBar() {
  const objects = useCanvasStore(s => s.objects)
  const { typeId, scope, reset } = usePaint()
  const t = typeById(useCanvasStore(s => s.elevations), typeId)
  const label = { row: 'Row', side: 'Side', bay: 'Bay' }
  return (
    <div style={box} role="toolbar" aria-label="Paint elevation">
      {reset ? <span style={{ fontWeight: 600 }}>Reset to default</span>
        : <><span style={swatch(t ? t.color : '#ccc')} /><span style={{ fontWeight: 600 }}>{t ? t.name : 'Pick a type'}</span></>}
      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, border: '1px solid var(--border, #E6E9EF)', background: 'var(--surface2, #F1F3F6)' }}>
        {SCOPES.map(k => <button key={k} type="button" aria-pressed={scope === k} style={seg(scope === k)} onClick={() => usePaint.setState({ scope: k, hover: null })}>{label[k]}</button>)}
      </div>
      <button type="button" aria-pressed={reset} style={{ ...btn2, ...(reset ? { background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)' } : {}) }}
        onClick={() => usePaint.setState({ reset: !reset, hover: null })} title="Remove the overrides on what you click">Reset to default</button>
      <button type="button" style={btn2} onClick={() => useCanvasStore.getState().setActiveTool(TOOLS.SELECT)} title="Leave paint mode (Esc)">Done</button>
    </div>
  )
}

export function ElevLegend() {
  const objects = useCanvasStore(s => s.objects), gridSize = useCanvasStore(s => s.gridSize) || 40
  const showColors = useElevView(s => s.showColors)
  const elevations = useCanvasStore(s => s.elevations)
  const rows = useMemo(() => {
    const L = bayLedger(objects, gridSize, elevations)
    return legendCounts(objects, elevations, (r) => L.racks.get(r.id)?.counted || null)
  }, [objects, gridSize, elevations])
  if (!rows.length) return null
  return (
    <div aria-label="Elevation legend" style={{
      position: 'absolute', left: 12, bottom: 12, zIndex: 50, padding: '6px 8px', borderRadius: 8, minWidth: 150,
      background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text, #0B101D)', display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text3, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
        <input type="checkbox" checked={showColors} onChange={e => setShowColors(e.target.checked)} aria-label="Show elevation colours" />
        Elevations
      </label>
      {showColors && rows.map(({ type, bays }) => (
        <div key={type.id} data-legend-type={type.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={swatch(type.color)} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{type.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2, #3A4152)' }}>{bays} bay{bays === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  )
}
