import { useCanvasStore } from '../../../store/useCanvasStore'
import { requestAreaRebuild } from '../../../utils/rackingAreaTool'
import { areaSettings, areaEdits } from '../../../generate/rackingArea'
import { MHE_PROFILES } from '../../../generate/columnCheck'
import { zoneSized } from '../../../utils/floorClamp'
import { pxToFtIn } from '../../../utils/canvas'
import { fieldBox, Grid2, Seg, SelectField, SecLabel, Hint } from '../../../studio/cardParts'

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
const note = { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-ui)', lineHeight: 1.4 }

/* a caption over a control group (a div, not a <label>: a label would forward its clicks to the first button) */
const Labeled = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><SecLabel>{label}</SecLabel>{children}</div>
)

/* Studio card: a column of card parts; PropertiesPanel wraps it in the card block (padding 12px 16px). */
export function RackingAreaPanel({ obj }) {
  const objects = useCanvasStore(s => s.objects)
  const set = areaSettings(obj)
  const racks = objects.filter(o => o.areaId === obj.id).length
  const edits = areaEdits(objects, obj).count
  const change = (patch) => requestAreaRebuild(useCanvasStore, obj.id, patch)
  const num = (k) => (e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n !== set[k]) change({ [k]: n }) }
  return (
    <div aria-label="Racking area settings" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <Hint>{racks} rack{racks === 1 ? '' : 's'}{edits ? ` · ${edits} changed by hand` : ''}. Drag an edge to extend or shrink the area; a change here rebuilds it.</Hint>
      <Labeled label="Direction">
        <Seg aria="Area direction" value={set.orientation} onChange={v => set.orientation !== v && change({ orientation: v })}
          options={[{ value: 'horizontal', label: 'H' }, { value: 'vertical', label: 'V' }]} />
      </Labeled>
      <Grid2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><SecLabel>Beam</SecLabel>
          <SelectField aria="Area beam" value={set.beamIn} onChange={e => change({ beamIn: Number(e.target.value) })}>
            {[72, 84, 96, 108, 120, 144].map(v => <option key={v} value={v}>{v}"</option>)}
          </SelectField>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><SecLabel>Max run (ft)</SecLabel>
          <input aria-label="Area max rack run" className="st-field" key={'m' + obj.id + set.maxRunFt} defaultValue={set.maxRunFt} onBlur={num('maxRunFt')} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} style={fieldBox()} />
        </label>
      </Grid2>
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
    <div aria-label="Zone settings" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={row}>
        <span style={lbl}>Name</span>
        <input type="text" aria-label="Zone name" defaultValue={obj.label || ''} key={'zn' + obj.id + (obj.label || '')}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => { if (e.target.value !== (obj.label || '')) commitObjectUpdate(obj.id, { label: e.target.value }) }}
          style={{ ...input, width: 'auto', flex: 1 }} />
      </div>
      <div style={row}>
        <span style={lbl}>Width</span>
        <input type="text" aria-label="Zone width" defaultValue={pxToFtIn(obj.width, gridSize)} key={'zw' + obj.id + obj.width}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} onBlur={size('width')} style={input} />
        <span style={lbl}>Length</span>
        <input type="text" aria-label="Zone length" defaultValue={pxToFtIn(obj.height, gridSize)} key={'zl' + obj.id + obj.height}
          onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} onBlur={size('height')} style={input} />
      </div>
      <div style={note}>No racking is placed inside a zone; its edges count as walls. A typed size keeps the edge against a wall.</div>
    </div>
  )
}
