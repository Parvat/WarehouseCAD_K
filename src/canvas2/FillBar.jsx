import { HOME_TOOL } from '../utils/homeTool'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { useEffect, useState } from 'react'
import { useFillTool, useRackingSettings, cancelFill, setFillAisle, fillEquipment, fillSection, setFillDesign, setFillCustom } from '../utils/fillTool'
import { B, MONO, modePill, Sep, Seg, CloseBtn, barBtn, btnClass } from '../studio/barParts'

/* the bar's 26h inset value (C10's Aisle) and its fields (Beam, Max run) */
const valueBox = { height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, border: 0, boxSizing: 'border-box' }
const word = { color: B.muted, fontSize: 12 }
/** 10.5 → 10′ 6″ (C10's Aisle) */
const ftInPrime = (ft) => { const t = Math.round(ft * 12), f = Math.floor(t / 12), i = t - f * 12; return `${f}′ ${i}″` }
/** "11", "10.5", "10' 6", "10′ 6″", "10 6" → feet; null when it isn't a length */
export function parseAisleFt(t) {
  const m = String(t ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(?:ft|'|′)?\s*(?:(\d+(?:\.\d+)?)\s*(?:in|"|″)?)?$/)
  if (!m) return null
  const ft = Number(m[1]) + (m[2] != null ? Number(m[2]) / 12 : 0)
  return ft > 0 ? ft : null
}

/* The Aisle field: the forklift's aisle until a length is typed — that one for this fill only (utils/fillTool.js
   setFillAisle), Project settings untouched; emptied, back to the forklift's. */
function AisleField({ forkliftFt }) {
  const typed = useFillTool(st => st.aisleFt)
  const shown = ftInPrime(typed ?? forkliftFt)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    const ft = text.trim() ? parseAisleFt(text) : null
    if (text.trim() && ft == null) { setText(shown); return }                        // not a length: as it was
    setFillAisle(ft != null && Math.abs(ft - forkliftFt) > 1e-6 ? ft : null)
    setText(ftInPrime(ft ?? forkliftFt))
  }
  return (
    <input aria-label="Aisle" className="st-field" title={typed ? `This fill only — the forklift’s is ${ftInPrime(forkliftFt)} (Project settings)` : 'The forklift’s aisle (Project settings) — type another for this fill only'}
      value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ ...valueBox, width: 64, color: typed ? B.accent : B.strong }} />
  )
}

/* A Custom design's width (fill-design-aisle): typed in feet; `placeholder` while empty (the space to move: as much as the
   aisle to pick). */
function WidthField({ k, label, title, placeholder }) {
  const v = useFillTool(st => st.custom[k])
  const [text, setText] = useState(v ? String(+v.toFixed(2)) : '')
  useEffect(() => setText(v ? String(+v.toFixed(2)) : ''), [v])
  const commit = () => { const ft = text.trim() ? parseAisleFt(text) : null; if (text.trim() && ft == null) { setText(v ? String(+v.toFixed(2)) : ''); return } setFillCustom(k, ft) }
  return (
    <input aria-label={label} title={title} className="st-field" value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }} style={{ ...valueBox, width: 44 }} />
  )
}

/* Fill racking's mode bar (STUDIO.md §1; design/studio/Studio.dc.html C10), top 76, while the tool is on: the
   Racking settings the fill uses — Rows ↔ | Rows ↕ (the orientation), Beam and Max run (kept from the bar before),
   the aisle it leaves — one source (ui-polish-3): over a section (the pointer, or the drag started in one) READ-ONLY, the
   section's equipment and its width — "VNA / turret · 7 ft (from section)"; to change it, change the section's
   Equipment in its card; outside every section typed — the project's forklift's by default; a length typed is for
   this fill only, Project settings unchanged — under the forklift's minimum, an amber line: "7′ 0″ is below Reach truck minimum 10′ 0″. Needs its own section."), the box's live rows · positions (a fill commits on release; before a box: the hint), ✕ (Esc
   too) back to Select. */
export function FillOptionsBar() {
  const s = useRackingSettings()
  const plan = useFillTool(st => st.plan)
  // the equipment this fill works to: the section the drag starts in, else the project's forklift (utils/fillTool.js)
  const from = useFillTool(st => st.drag?.from || st.at || null), typed = useFillTool(st => st.aisleFt)
  const design = useFillTool(st => st.design), custom = useFillTool(st => st.custom)
  const objects = useCanvasStore(st => st.objects)
  const eq = fillEquipment(objects, from), inSection = !!fillSection(objects, from)
  const isCustom = !inSection && design === 'custom'
  const under = !inSection && !isCustom && typed && Number.isFinite(eq.minAisleFt) && typed < eq.minAisleFt - 1e-9
  // the bar goes when the tool ends: a typed aisle and the Custom design go with it
  useEffect(() => () => { setFillAisle(null); setFillDesign('project'); setFillCustom('pickFt', null); setFillCustom('moveFt', null) }, [])
  /* Equipment (fill-design-aisle), outside every section: the project's forklift (its widths; the Aisle typed as before)
     or Custom — the aisle to pick and the space to move it is designed for (the space to move: as much when left out);
     Custom starts at the project forklift's aisle */
  const project = fillEquipment(objects, null)
  // the amber line's Use Custom: the typed aisle as the Custom aisle to pick and space to move
  const useCustom = () => { const ft = typed; setFillCustom('pickFt', ft); setFillCustom('moveFt', ft); setFillAisle(null); setFillDesign('custom') }
  const toCustom = () => { if (!(custom.pickFt > 0)) setFillCustom('pickFt', typed || project.aisleFt); setFillDesign('custom') }
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
      {!inSection && <Seg aria="Equipment" options={[
        { value: 'project', label: 'Project forklift', aria: 'Project forklift', title: `${project.label} — its widths (Project settings)`, on: design !== 'custom', onClick: () => setFillDesign('project') },
        { value: 'custom', label: 'Custom', aria: 'Custom', title: 'The aisle widths this fill is designed for — its racks are checked against them', on: design === 'custom', onClick: toCustom },
      ]} />}
      {inSection
        ? <><span style={word}>Aisle</span><span aria-label="Aisle" data-aisle-from="section" title="The section's equipment — change it in the section's card" style={{ ...valueBox, fontFamily: 'inherit', color: B.text }}>{eq.label} · {+Number(eq.aisleFt).toFixed(2)} ft <span style={{ color: B.muted, marginLeft: 4 }}>(from section)</span></span></>
        : isCustom
          ? <><span style={word}>Aisle to pick</span><WidthField k="pickFt" label="Aisle to pick (ft)" title="The aisle to pick — turn and put away (ft)" />
              <span style={word}>Space to move</span><WidthField k="moveFt" label="Space to move (ft)" title="The space to move — drive straight (ft); empty: as much as the aisle to pick" placeholder={custom.pickFt ? String(+custom.pickFt.toFixed(2)) : ''} /></>
          : <><span style={word}>Aisle</span><AisleField forkliftFt={eq.aisleFt ?? 10.5} /></>}
      <Sep />
      {plan
        ? <span aria-label="Fill estimate" style={word}><span style={{ fontFamily: MONO, color: B.text }}>{plan.rows}</span> row{plan.rows === 1 ? '' : 's'} · <span style={{ fontFamily: MONO, color: B.accent }}>{plan.positions.toLocaleString('en-US')}</span> pos</span>
        : <span style={word}>Drag a box · Esc cancels</span>}
      {under && <span role="status" aria-label="Aisle warning" data-fill-warning style={{ color: B.warnFg, fontSize: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{ftInPrime(typed)} is below {eq.label} minimum {ftInPrime(eq.minAisleFt)}. Needs its own section.
        {/* Use Custom (fill-design-aisle): Equipment to Custom, that aisle as both its widths — the fill is designed for it */}
        <button type="button" className={btnClass(false)} style={barBtn(false)} title={`Design this fill for ${ftInPrime(typed)} aisles (Custom)`} onClick={useCustom}>Use Custom</button></span>}
      <Sep />
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={close} className={btnClass(true)} style={barBtn(true)}>Done</button>
      <CloseBtn label="Close Fill racking" title="Done (Esc)" onClick={close} />
    </div>
  )
}
