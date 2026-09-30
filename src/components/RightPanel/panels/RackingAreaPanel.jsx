import { useCanvasStore } from '../../../store/useCanvasStore'
import { requestAreaRebuild } from '../../../utils/rackingAreaTool'
import { areaSettings, areaEdits } from '../../../generate/rackingArea'
import { MHE_PROFILES } from '../../../generate/columnCheck'

/* The right panel for a racking area (generate/rackingArea.js): its Racking
   settings. Changing one rebuilds the whole area with it — one undo step,
   asked first when racks in it were edited by hand (utils/rackingAreaTool.js).
   And for a zone: its name. */

const row = { display: 'flex', alignItems: 'center', gap: 8 }
const lbl = { fontSize: 11, color: 'var(--text3)', minWidth: 64, fontFamily: 'var(--font-ui)' }
const input = {
  width: 64, padding: '3px 6px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-mono)',
  background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none',
}
const seg = (on) => ({
  padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  background: on ? 'var(--accent-solid)' : 'var(--surface3)', color: on ? 'var(--accent-fg)' : 'var(--text3)',
  border: `1px solid ${on ? 'var(--accent-bdr)' : 'var(--border)'}`,
})
const note = { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-ui)', lineHeight: 1.4 }

export function RackingAreaPanel({ obj }) {
  const objects = useCanvasStore(s => s.objects)
  const set = areaSettings(obj)
  const racks = objects.filter(o => o.areaId === obj.id).length
  const edits = areaEdits(objects, obj).count
  const change = (patch) => requestAreaRebuild(useCanvasStore, obj.id, patch)
  const num = (k) => (e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n !== set[k]) change({ [k]: n }) }
  return (
    <div aria-label="Racking area settings" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={note}>{racks} rack{racks === 1 ? '' : 's'}{edits ? ` · ${edits} changed by hand` : ''}. Drag an edge to extend or shrink the area; a change here rebuilds it.</div>
      <div style={row}>
        <span style={lbl}>Direction</span>
        <button type="button" aria-pressed={set.orientation === 'horizontal'} style={seg(set.orientation === 'horizontal')} onClick={() => set.orientation !== 'horizontal' && change({ orientation: 'horizontal' })}>H</button>
        <button type="button" aria-pressed={set.orientation === 'vertical'} style={seg(set.orientation === 'vertical')} onClick={() => set.orientation !== 'vertical' && change({ orientation: 'vertical' })}>V</button>
      </div>
      <label style={row}><span style={lbl}>Beam</span>
        <select aria-label="Area beam" value={set.beamIn} onChange={e => change({ beamIn: Number(e.target.value) })} style={{ ...input, width: 76 }}>
          {[72, 84, 96, 108, 120, 144].map(v => <option key={v} value={v}>{v}"</option>)}
        </select>
      </label>
      <div style={row}><span style={lbl}>Pallet</span>
        <input aria-label="Area pallet face" key={'pw' + obj.id + set.palletWIn} defaultValue={set.palletWIn} onBlur={num('palletWIn')} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} style={{ ...input, width: 44 }} />
        <span style={note}>×</span>
        <input aria-label="Area pallet depth" key={'pd' + obj.id + set.palletDIn} defaultValue={set.palletDIn} onBlur={num('palletDIn')} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} style={{ ...input, width: 44 }} />
      </div>
      <label style={row}><span style={lbl}>Forklift</span>
        <select aria-label="Area forklift" value={set.mhe} onChange={e => change({ mhe: e.target.value, aisleFt: MHE_PROFILES[e.target.value]?.aisleFt ?? set.aisleFt })} style={{ ...input, width: 130 }}>
          {Object.values(MHE_PROFILES).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <div style={row}><span style={lbl}>Aisle (ft)</span>
        <input aria-label="Area aisle" key={'a' + obj.id + set.aisleFt} defaultValue={set.aisleFt} onBlur={num('aisleFt')} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} style={input} />
      </div>
      <div style={row}><span style={lbl}>Max run (ft)</span>
        <input aria-label="Area max rack run" key={'m' + obj.id + set.maxRunFt} defaultValue={set.maxRunFt} onBlur={num('maxRunFt')} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} style={input} />
      </div>
    </div>
  )
}

export function ZonePanel({ obj }) {
  const commitObjectUpdate = useCanvasStore(s => s.commitObjectUpdate)
  return (
    <div aria-label="Zone settings" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={row}>
        <span style={lbl}>Name</span>
        <input type="text" aria-label="Zone name" defaultValue={obj.label || ''} key={'zn' + obj.id + (obj.label || '')}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => { if (e.target.value !== (obj.label || '')) commitObjectUpdate(obj.id, { label: e.target.value }) }}
          style={{ ...input, width: 'auto', flex: 1 }} />
      </div>
      <div style={note}>No racking is placed inside a zone; its edges count as walls.</div>
    </div>
  )
}
