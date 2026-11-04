import { HOME_TOOL } from '../utils/homeTool'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { useFillTool, useRackingSettings, cancelFill } from '../utils/fillTool'
import { B, MONO, modePill, Sep, Seg, CloseBtn } from '../studio/barParts'

/* the bar's 26h inset value (C10's Aisle) and its fields (Beam, Max run) */
const valueBox = { height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }
const word = { color: B.muted, fontSize: 12 }
/** 10.5 → 10′ 6″ (C10's Aisle) */
const ftInPrime = (ft) => { const t = Math.round(ft * 12), f = Math.floor(t / 12), i = t - f * 12; return `${f}′ ${i}″` }

/* Fill racking's mode bar (STUDIO.md §1; design/studio/Studio.dc.html C10), top 76, while the tool is on: the
   Racking settings the fill uses — Rows ↔ | Rows ↕ (the orientation), Beam and Max run (kept from the bar before),
   the aisle it leaves (the project's forklift's, read-only — Project settings), the box's live rows · positions (a
   fill commits on release; before a box: the hint), ✕ (Esc too) back to Select. */
export function FillOptionsBar() {
  const s = useRackingSettings()
  const plan = useFillTool(st => st.plan)
  const num = (k, v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) s.setSetting(k, n) }
  const close = () => { cancelFill(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  return (
    <div role="toolbar" aria-label="Fill racking options" data-mode-bar="fill" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Fill racking</span>
      <Sep />
      <Seg aria="Row direction" options={[
        { value: 'horizontal', label: 'Rows ↔', aria: 'Rows across', on: s.orientation === 'horizontal', onClick: () => s.setSetting('orientation', 'horizontal') },
        { value: 'vertical', label: 'Rows ↕', aria: 'Rows down', on: s.orientation === 'vertical', onClick: () => s.setSetting('orientation', 'vertical') },
      ]} />
      <span style={word}>Beam</span>
      <select aria-label="Beam" className="st-field" value={s.beamIn} onChange={e => num('beamIn', e.target.value)} style={{ ...valueBox, width: 64 }}>
        {[72, 84, 96, 108, 120, 144].map(v => <option key={v} value={v}>{v}″</option>)}
      </select>
      <span style={word}>Max run</span>
      <input aria-label="Max rack run (ft)" className="st-field" style={{ ...valueBox, width: 52 }} defaultValue={s.maxRunFt} key={'m' + s.maxRunFt} onBlur={e => num('maxRunFt', e.target.value)} />
      <span style={word}>ft</span>
      {/* the pallet, the forklift (its aisle) and the wall clearance: Project settings (utils/project.js) */}
      <span style={word}>Aisle</span>
      <span aria-label="Aisle" title="The forklift's aisle — Project settings" style={valueBox}>{ftInPrime(s.aisleFt ?? 10.5)}</span>
      <Sep />
      {plan
        ? <span aria-label="Fill estimate" style={word}><span style={{ fontFamily: MONO, color: B.text }}>{plan.rows}</span> row{plan.rows === 1 ? '' : 's'} · <span style={{ fontFamily: MONO, color: B.accent }}>{plan.positions.toLocaleString('en-US')}</span> pos</span>
        : <span style={word}>Drag a box · Esc cancels</span>}
      <CloseBtn label="Close Fill racking" title="Done (Esc)" onClick={close} />
    </div>
  )
}
