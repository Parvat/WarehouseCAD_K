import { Group, Rect, Text } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { useFillTool, useRackingSettings, boxOfDrag } from '../utils/fillTool'
import { rackFootprint } from '../generate/columnCheck'
import { fmtLen } from '../utils/copyChange'
import { MHE_PROFILES } from '../generate/columnCheck'

/* "Fill racking" on the canvas (utils/fillTool.js, generate/fillRacking.js):
   the box being dragged, the racks it would place (faint), and a label with
   the box's size and a live estimate — "60' × 40' · ≈ 14 rows · 1,200
   positions". Pure paint: listening={false}. */
export function FillOverlay() {
  const drag = useFillTool(s => s.drag)
  const plan = useFillTool(s => s.plan)
  const zoom = useCanvasStore(s => s.zoom)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  if (!drag) return null
  const b = boxOfDrag(drag)
  const fs = 12 / zoom, pad = 5 / zoom
  const text = `${fmtLen(b.w, gridSize)} × ${fmtLen(b.h, gridSize)}` + (plan ? ` · ≈ ${plan.rows} row${plan.rows === 1 ? '' : 's'} · ${plan.positions.toLocaleString('en-US')} positions` : '')
  const w = text.length * fs * 0.6 + pad * 2, h = fs + pad * 2
  return (
    <Group name="fill-overlay" listening={false}>
      {(plan?.racks || []).map((r, i) => { const f = rackFootprint(r); return (
        <Rect key={'r' + i} x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(47,123,216,0.14)" stroke="#2F7BD8" strokeWidth={1}
          strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      ) })}
      <Rect name="fill-box" x={b.x} y={b.y} width={b.w} height={b.h} stroke="#2F7BD8" strokeWidth={1.5} dash={[8, 5]}
        fill="rgba(47,123,216,0.05)" strokeScaleEnabled={false} listening={false} />
      <Group name="fill-label" x={b.x} y={b.y - h - 4 / zoom} listening={false}>
        <Rect width={w} height={h} fill="#2F7BD8" cornerRadius={3 / zoom} listening={false} />
        <Text text={text} width={w} height={h} align="center" verticalAlign="middle" fontSize={fs}
          fontFamily="JetBrains Mono, monospace" fill="#ffffff" listening={false} />
      </Group>
    </Group>
  )
}

/* the bar: a floating bar in the canvas's bottom row (Canvas2.jsx) — white, 1px line, radius 4, the theme shadow;
   its controls 32px, radius 2; words in PJS, figures in mono, the unit inside the field */
const bar = {
  display: 'flex', alignItems: 'center', gap: 8, padding: 4, paddingLeft: 12, maxWidth: '100%', flexWrap: 'wrap',
  fontSize: 12, whiteSpace: 'nowrap',
}
const field = { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--steel)', fontSize: 12 }

/* The Racking settings the fill uses, while the tool is on. */
export function FillOptionsBar() {
  const s = useRackingSettings()
  const num = (k, v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) s.setSetting(k, n) }
  return (
    <div role="toolbar" aria-label="Fill racking options" className="t-float" style={bar}>
      <span style={{ fontWeight: 600 }}>Fill racking</span>
      <span style={{ color: 'var(--steel)' }}>drag a box · Esc cancels</span>
      <div role="group" aria-label="Row direction" style={{ display: 'flex', height: 32, border: '1px solid var(--line)', borderRadius: 2, overflow: 'hidden' }}>
        {[['horizontal', 'H'], ['vertical', 'V']].map(([o, t]) => (
          <button key={o} type="button" aria-pressed={s.orientation === o} onClick={() => s.setSetting('orientation', o)}
            style={{ width: 32, height: 30, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
              background: s.orientation === o ? 'var(--pine)' : 'var(--paper)', color: s.orientation === o ? 'var(--paper)' : 'var(--ink-2)' }}>{t}</button>
        ))}
      </div>
      <label style={field}>Beam
        <select aria-label="Beam" value={s.beamIn} onChange={e => num('beamIn', e.target.value)} className="t-input" style={{ width: 72, fontFamily: 'var(--font-mono)' }}>
          {[72, 84, 96, 108, 120, 144].map(v => <option key={v} value={v}>{v}"</option>)}
        </select>
      </label>
      <label style={field}>Max run
        <span className="t-field" style={{ width: 80, flex: 'none' }}>
          <input aria-label="Max rack run (ft)" className="t-input" defaultValue={s.maxRunFt} key={'m' + s.maxRunFt} onBlur={e => num('maxRunFt', e.target.value)} />
          <span className="t-unit">ft</span>
        </span>
      </label>
      {/* the pallet, the forklift (its aisle) and the wall clearance: Project setup (utils/project.js) */}
      <span style={{ color: 'var(--steel)', paddingRight: 8 }}>pallet, forklift, wall clearance: Project setup</span>
    </div>
  )
}
