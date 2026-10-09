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

const bar = {
  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8,
  background: 'var(--surface, #fff)', border: '1px solid var(--border, #E6E9EF)', boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text, #0B101D)', whiteSpace: 'nowrap',
}
const field = { display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text3, #6B7280)', fontSize: 11 }
const input = { width: 52, padding: '3px 5px', border: '1px solid var(--border, #E6E9EF)', borderRadius: 5, background: 'var(--surface2, #F1F3F6)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11 }
const seg = (on) => ({ padding: '3px 8px', border: '1px solid var(--border, #E6E9EF)', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  background: on ? 'var(--accent-solid, #0B101D)' : 'var(--surface, #fff)', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2, #3A4152)' })

/* The Racking settings the fill uses, while the tool is on. */
export function FillOptionsBar() {
  const s = useRackingSettings()
  const num = (k, v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) s.setSetting(k, n) }
  return (
    <div role="toolbar" aria-label="Fill racking options" style={bar}>
      <span style={{ fontWeight: 600 }}>Fill racking</span>
      <span style={{ color: 'var(--text3, #6B7280)', fontSize: 11 }}>drag a box · Esc cancels</span>
      <div style={field}>
        <button type="button" style={seg(s.orientation === 'horizontal')} aria-pressed={s.orientation === 'horizontal'} onClick={() => s.setSetting('orientation', 'horizontal')}>H</button>
        <button type="button" style={seg(s.orientation === 'vertical')} aria-pressed={s.orientation === 'vertical'} onClick={() => s.setSetting('orientation', 'vertical')}>V</button>
      </div>
      <label style={field}>Beam
        <select aria-label="Beam" value={s.beamIn} onChange={e => num('beamIn', e.target.value)} style={{ ...input, width: 62 }}>
          {[72, 84, 96, 108, 120, 144].map(v => <option key={v} value={v}>{v}"</option>)}
        </select>
      </label>
      <label style={field}>Pallet
        <input aria-label="Pallet face" style={{ ...input, width: 38 }} defaultValue={s.palletWIn} key={'pw' + s.palletWIn} onBlur={e => num('palletWIn', e.target.value)} />×
        <input aria-label="Pallet depth" style={{ ...input, width: 38 }} defaultValue={s.palletDIn} key={'pd' + s.palletDIn} onBlur={e => num('palletDIn', e.target.value)} />
      </label>
      <label style={field}>Forklift
        <select aria-label="Forklift" value={s.mhe} onChange={e => { s.setSetting('mhe', e.target.value); s.setSetting('aisleFt', MHE_PROFILES[e.target.value]?.aisleFt ?? s.aisleFt) }} style={{ ...input, width: 104 }}>
          {Object.values(MHE_PROFILES).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <label style={field}>Aisle
        <input aria-label="Aisle (ft)" style={input} defaultValue={s.aisleFt} key={'a' + s.aisleFt} onBlur={e => num('aisleFt', e.target.value)} />ft
      </label>
      <label style={field}>Max run
        <input aria-label="Max rack run (ft)" style={input} defaultValue={s.maxRunFt} key={'m' + s.maxRunFt} onBlur={e => num('maxRunFt', e.target.value)} />ft
      </label>
      {/* the wall clearance (BUG 76): the same Racking setting as the Generate panel's field — inches from
          the wall's inner face to the back of a wall row; 0 = flush */}
      <label style={field} title="Inches from the wall's inner face to the back of a wall row — shared with Generate. 0 = flush.">Wall clear
        <input aria-label="Wall clearance (in from the wall's inner face)" style={input} defaultValue={s.wallClearIn} key={'w' + s.wallClearIn} onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) s.setSetting('wallClearIn', n) }} />in
      </label>
    </div>
  )
}
