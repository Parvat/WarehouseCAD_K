import { useCanvasStore } from '../../../store/useCanvasStore'
import { requestAreaRebuild } from '../../../utils/rackingAreaTool'
import { areaSettings, areaEdits } from '../../../generate/rackingArea'
import { MHE_PROFILES } from '../../../generate/columnCheck'
import { zoneSized } from '../../../utils/floorClamp'
import { pxToFtIn } from '../../../utils/canvas'

/* The right panel for a racking area (generate/rackingArea.js): its Racking
   settings. Changing one rebuilds the whole area with it — one undo step,
   asked first when racks in it were edited by hand (utils/rackingAreaTool.js).
   And for a zone: its name. */

/* Field rows are .t-row (a 96px label column, the input filling the rest); inputs .t-input (mono — figures);
   H / V are 32px secondaries, the picked one pine (aria-pressed). The parent Properties body pads 16. */
const SEG = 't-btn t-btn--secondary'
const segW = { width: 48, padding: 0 }
const note = { fontSize: 12, color: 'var(--steel)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }
const box = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }

export function RackingAreaPanel({ obj }) {
  const objects = useCanvasStore(s => s.objects)
  const set = areaSettings(obj)
  const racks = objects.filter(o => o.areaId === obj.id).length
  const edits = areaEdits(objects, obj).count
  const change = (patch) => requestAreaRebuild(useCanvasStore, obj.id, patch)
  const num = (k) => (e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n !== set[k]) change({ [k]: n }) }
  return (
    <div aria-label="Racking area settings" style={box}>
      <div style={note}>{racks} rack{racks === 1 ? '' : 's'}{edits ? ` · ${edits} changed by hand` : ''}. Drag an edge to extend or shrink the area; a change here rebuilds it.</div>
      <div className="t-row">
        <span className="t-label">Direction</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" aria-pressed={set.orientation === 'horizontal'} className={SEG} style={segW} onClick={() => set.orientation !== 'horizontal' && change({ orientation: 'horizontal' })}>H</button>
          <button type="button" aria-pressed={set.orientation === 'vertical'} className={SEG} style={segW} onClick={() => set.orientation !== 'vertical' && change({ orientation: 'vertical' })}>V</button>
        </div>
      </div>
      <label className="t-row"><span className="t-label">Beam</span>
        <select aria-label="Area beam" value={set.beamIn} onChange={e => change({ beamIn: Number(e.target.value) })} className="t-input" style={{ fontFamily: 'var(--font-mono)' }}>
          {[72, 84, 96, 108, 120, 144].map(v => <option key={v} value={v}>{v}"</option>)}
        </select>
      </label>
      <div className="t-row"><span className="t-label">Max run (ft)</span>
        <input aria-label="Area max rack run" key={'m' + obj.id + set.maxRunFt} defaultValue={set.maxRunFt} onBlur={num('maxRunFt')} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} className="t-input" />
      </div>
    </div>
  )
}

/** Feet from a typed length: "40", "40'", "40' 6\"", "40'6", "40.5". Null when it isn't one. */
export function parseFeet(text) {
  const t = String(text ?? '').trim()
  const m = t.match(/^(\d+(?:\.\d+)?)\s*'?\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/)
  if (!m) return null
  const v = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)
  return Number.isFinite(v) && v > 0 ? v : null
}

export function ZonePanel({ obj }) {
  const commitObjectUpdate = useCanvasStore(s => s.commitObjectUpdate)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  /* an exact size, one undo step (the keeper cuts the racks with it): the edge against a wall stays put
     (utils/floorClamp.js zoneSized), else the left / top edge; kept inside the building */
  const size = (key) => (e) => {
    const ft = parseFeet(e.target.value)
    if (ft == null) { e.target.value = pxToFtIn(key === 'width' ? obj.width : obj.height, gridSize); return }
    const st = useCanvasStore.getState(), cur = st.objects.find(o => o.id === obj.id)
    if (!cur || Math.abs(ft * gridSize - cur[key]) < 1e-6) return
    commitObjectUpdate(obj.id, zoneSized(st.objects, cur, { [key]: ft * gridSize }, { gridSize }))
  }
  return (
    <div aria-label="Zone settings" style={box}>
      <div className="t-row">
        <span className="t-label">Name</span>
        <input type="text" aria-label="Zone name" defaultValue={obj.label || ''} key={'zn' + obj.id + (obj.label || '')}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => { if (e.target.value !== (obj.label || '')) commitObjectUpdate(obj.id, { label: e.target.value }) }}
          className="t-input t-words" />
      </div>
      {/* Width and Length side by side: two label / input pairs that share the 288px row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', columnGap: 8, minWidth: 0 }}>
        <span className="t-label">Width</span>
        <input type="text" aria-label="Zone width" defaultValue={pxToFtIn(obj.width, gridSize)} key={'zw' + obj.id + obj.width}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} onBlur={size('width')} className="t-input" />
        <span className="t-label">Length</span>
        <input type="text" aria-label="Zone length" defaultValue={pxToFtIn(obj.height, gridSize)} key={'zl' + obj.id + obj.height}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} onBlur={size('height')} className="t-input" />
      </div>
      <div style={note}>No racking is placed inside a zone; its edges count as walls. A typed size keeps the edge against a wall.</div>
    </div>
  )
}
