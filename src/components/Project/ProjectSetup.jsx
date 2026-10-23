import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ChevronRight, X, Sparkles, Loader2, PenLine } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useRules } from '../../rules/useRules'
import { useRackingSettings } from '../../utils/fillTool'
import { UNITS } from '../../constants'
import { useProjectSetup, closeSetup, installStartScreen, projectOf, newProject, newId, palletName, withProject, syncTypesToPallets, layoutAffecting, ceilingInUse, palletInUse, generateBrief, ADVANCED_DEFAULTS, PALLET_DEFAULT, RULES_DEFAULTS, BUILDING_DEFAULTS, ASSUMED_CLEAR_IN } from '../../utils/project'
import { refreshNames } from '../../utils/elevTab'
import { regenBuilding, regenSummary } from '../../generate/regenerate'
import { regenerateRacking, generateAndPlaceBatched } from '../../generate/traceGenerate'

/* ── The project screen (PROJECT_SETUP.md) ──────────────────────────────────────────────────────────────────────────
   Two states:
   - a NEW project — the start screen (opened by installStartScreen, once per new project): ONE screen, no second step.
     01 Building (length × width on one row, clear height, sprinkler height), 02 Pallet (face × depth × height on one
     row, weight), 03 Layout (forklift, column grid, row direction, max run, wall clearance), Advanced folded. [Generate
     layout] writes the project and generates; [Draw it myself] writes it and closes. Medium-size, in THEME.md's spacing
     and type: section headers (mono number + Oswald title + a muted note), labels above compact inputs set side by
     side, units in the field, more space between groups than within them.
   - an EXISTING project (Project settings): ceiling heights and pallet sizes as lists — + Add, edit, delete (not one
     an elevation uses), set default; the forklift and walls; Advanced. A change that moves racks (the default pallet's
     face or depth, the forklift, the wall clearance) on a layout with generated racks asks Regenerate racking / Keep
     layout; ceilings and a pallet's height and weight only update the elevations and the checks.
   Save writes the project into the layout — one undo step. The beam face is an elevation's (the editor's); the project
   keeps only the default for new elevations (Advanced). */

const store = useCanvasStore
const S = {
  back: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgb(26 29 27 / .55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: 'min(860px, 100%)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--text)', borderRadius: 4, border: '1px solid var(--border)', boxShadow: '0 18px 60px rgba(0,0,0,0.28)', fontFamily: 'var(--font-ui)' },
  sec: { padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  h: { fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' },
  th: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textAlign: 'left', fontWeight: 500, padding: '0 4px 2px' },
  in: { width: '100%', minWidth: 0, borderRadius: 2, padding: '5px 7px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  solid: { background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' },
  note: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 },
}
/* THEME.md §3–5: field label 11px uppercase .05em steel above the field; input 32px, fill bg2, 1px line, radius 2,
   mono value, unit right-aligned in steel; section header: number (mono 10px blue .14em) + title (Oswald 700
   uppercase 13px) + a muted note; 24px between groups, 12px within */
const T5 = {
  label: { fontSize: 11, lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontFamily: 'var(--font-ui)' },
  box: { position: 'relative', display: 'flex', alignItems: 'center', height: 32, minWidth: 0, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 2 },
  input: { flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' },
  unit: { paddingRight: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' },
  times: { alignSelf: 'flex-end', height: 32, display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text3)', padding: '0 2px' },
}
const ftOf = (inch) => (inch > 0 ? Math.round((inch / 12) * 100) / 100 : '')
const inOf = (ft) => { const v = Number(ft); return Number.isFinite(v) && v > 0 ? Math.round(v * 12) : null }
const ASSUMED_FT = Math.round(ASSUMED_CLEAR_IN / 12)

/** A ceiling's field error: its sprinkler height above its clear height → the message, else null. */
export const sprinklerError = (c) => (c?.sprinklerIn > 0 && c?.clearHeightIn > 0 && c.sprinklerIn > c.clearHeightIn + 1e-6 ? 'Sprinkler height above the ceiling' : null)
function NumIn({ value, onChange, aria, step = 1, placeholder, error = null }) {
  // `error`: a field error — the field outlined red, the message as its title and for screen readers
  return <input aria-label={aria} aria-invalid={error ? 'true' : undefined} title={error || undefined} type="number" min={0} step={step} value={value ?? ''} placeholder={placeholder} style={error ? { ...S.in, borderColor: 'var(--red, #C0452A)', boxShadow: '0 0 0 1px var(--red, #C0452A)' } : S.in} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />
}
/** A labelled number field (Project settings' tables). */
function Num({ label, ...p }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={S.th}>{label}</span><NumIn aria={label} {...p} /></label>
}
/** THEME.md's compact field: the label above, the value in mono, the unit inside on the right. `label` null: a field
 *  in a "a × b" row whose label sits over the row. */
function Field({ label, aria, unit, value, onChange, step = 1, placeholder, width }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: width ? `0 0 ${width}px` : 1 }}>
      {label && <span style={T5.label}>{label}</span>}
      <span className="t5-field" style={T5.box}>
        <input className="no-spin" aria-label={aria || label} type="number" min={0} step={step} value={value ?? ''} placeholder={placeholder} style={T5.input} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />
        {unit && <span style={T5.unit}>{unit}</span>}
      </span>
    </label>
  )
}
/** "a × b (× c)" on one row under one label. */
function Times({ label, children }) {
  const kids = Array.isArray(children) ? children : [children]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={T5.label}>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {kids.map((k, i) => [i > 0 && <span key={'x' + i} style={T5.times}>×</span>, <div key={i} style={{ flex: 1, minWidth: 0 }}>{k}</div>])}
      </div>
    </div>
  )
}
/** THEME.md's input-panel section header: the number, the title, a muted note. */
function Head({ n, title, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--elev-dim, #1B4FD8)' }}>{n}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text)' }}>{title}</span>
      {note && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{note}</span>}
    </div>
  )
}
function Seg({ value, options, onChange, aria }) {
  return (
    <div role="group" aria-label={aria} style={{ display: 'flex', height: 32, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface2)', overflow: 'hidden' }}>
      {options.map(([k, label]) => <button key={String(k)} type="button" aria-pressed={value === k} onClick={() => onChange(k)} style={{ flex: 1, padding: '0 10px', fontSize: 12, fontWeight: value === k ? 500 : 400, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', background: value === k ? 'var(--accent-solid, #14392B)' : 'transparent', color: value === k ? 'var(--accent-fg, #fff)' : 'var(--text2)' }}>{label}</button>)}
    </div>
  )
}
function ForkliftSelect({ value, onChange, mheOptions, compact = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 3, minWidth: 0 }}><span style={compact ? T5.label : S.th}>Forklift</span>
      <select aria-label="Forklift" value={value || 'reach'} onChange={e => onChange(e.target.value)} style={compact ? { ...T5.box, padding: '0 6px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text)' } : S.in}>
        {Object.entries(mheOptions).map(([k, m]) => <option key={k} value={k}>{m.label || k}</option>)}
      </select>
    </label>
  )
}
/** Advanced (folded): the fixed defaults — load clearance, sprinkler clearance, hole pitch, flue, upright step, the
 *  beam face new elevations start with; units; (the start screen) columns along the wall. */
function Advanced({ value, onChange, units, onUnits, extra = null, style = null }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={style || S.sec} role="group" aria-label="Advanced">
      <button type="button" aria-expanded={open} onClick={() => setOpen(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={12} style={{ color: 'var(--text3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} /><span style={S.h}>Advanced</span>
        {!open && <span style={{ ...S.note, marginLeft: 6 }}>load clearance {value.clearanceIn ?? 6}" · sprinkler clearance {value.sprinklerClearanceIn ?? 18}" · upright step {(value.uprightStepIn ?? 12) / 12}' · flue {value.flueIn ?? 6}" · beam face {value.beamFaceIn ?? ADVANCED_DEFAULTS.beamFaceIn}"</span>}
      </button>
      {open && (
        <div style={{ ...S.grid, marginTop: 10 }}>
          {[['clearanceIn', 'Load clearance (in)'], ['sprinklerClearanceIn', 'Sprinkler clearance (in)'], ['flueIn', 'Flue (in)'], ['beamFaceIn', 'Beam face, new elevations (in)']].map(([k, label]) => (
            <Num key={k} label={label} value={value?.[k] ?? ADVANCED_DEFAULTS[k]} onChange={v => onChange({ ...value, [k]: v ?? ADVANCED_DEFAULTS[k] })} />
          ))}
          <Num label="Upright step (ft)" step={0.5} value={(value?.uprightStepIn ?? 12) / 12} onChange={v => onChange({ ...value, uprightStepIn: v > 0 ? v * 12 : 12 })} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.th}>Units</span>
            <select aria-label="Units" value={units} onChange={e => onUnits(e.target.value)} style={S.in}>{Object.values(UNITS).map(u => <option key={u} value={u}>{u}</option>)}</select>
          </label>
          {extra}
        </div>
      )}
    </div>
  )
}

export function ProjectSetup() {
  const { open, reason } = useProjectSetup()
  // for as long as the CAD is on screen: a new project opens the start screen, at once — on entering (Hub → Draw) and
  // on a later File → New, once per new project
  useEffect(() => installStartScreen(store), [])
  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.querySelector('[data-theme]')) }, [open])
  if (!open || !host) return null
  return createPortal(reason === 'new' ? <StartCard /> : <SettingsCard />, host)
}

/* ── a new project: the start screen — one screen ────────────────────────────────────────────────────────────────── */
function StartCard() {
  const { rules, mheOptions } = useRules()
  const [b, setB] = useState({ ...BUILDING_DEFAULTS, clearFt: '', sprFt: '' })
  const [pal, setPal] = useState({ faceIn: PALLET_DEFAULT.faceIn, depthIn: PALLET_DEFAULT.depthIn, heightIn: PALLET_DEFAULT.heightIn, weightLb: PALLET_DEFAULT.weightLb })
  const [mhe, setMhe] = useState('reach')
  const [wallClearIn, setWall] = useState(RULES_DEFAULTS.wallClearIn)
  const [adv, setAdv] = useState({ ...ADVANCED_DEFAULTS })
  const [units, setUnits] = useState(() => useCanvasStore.getState().unit || RULES_DEFAULTS.units)
  const [busy, setBusy] = useState(null)               // { progress } while generating
  const [failed, setFailed] = useState(false)
  const setBf = (patch) => setB(v => ({ ...v, ...patch }))
  const setP = (patch) => setPal(v => ({ ...v, ...patch }))

  const project = () => {
    const pr = newProject({ mhe, wallClearIn: wallClearIn ?? 0, units, pallet: { ...pal, name: palletName(pal) } })
    const c = { id: newId('ceil'), name: 'Main', clearHeightIn: inOf(b.clearFt), sprinklerIn: inOf(b.sprFt) }
    const { clearFt, sprFt, ...building } = b   // eslint-disable-line no-unused-vars
    return { ...pr, ceilings: [c], defaultCeilingId: c.id, advanced: { ...adv }, building }
  }
  const write = (pr) => store.getState().commitElevations(withProject(store.getState().elevations, pr))
  const drawMyself = () => { if (busy) return; write(project()); closeSetup() }
  const generate = async () => {
    if (busy) return
    const pr = project()
    write(pr)
    // the row direction and max run are Fill's next settings too (utils/fillTool.js), as Generate's are
    const set = useRackingSettings.getState().setSetting
    if (b.orientation !== 'auto') set('orientation', b.orientation)
    set('maxRunFt', Number(b.maxRunFt) || 150)
    setBusy({ progress: 0 }); setFailed(false)
    try {
      const out = await generateAndPlaceBatched(generateBrief(pr, mheOptions, b), { onProgress: (p) => setBusy({ progress: p }), rules })
      if (out?.failed) { setFailed(true); return }
      closeSetup()
    } finally { setBusy(null) }
  }
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !busy) drawMyself() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) })
  const aisle = mheOptions[mhe]?.aisleFt
  const group = { display: 'flex', flexDirection: 'column', gap: 12 }
  const row = (cols) => ({ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'end' })

  return (
    <div style={S.back}>
      <div role="dialog" aria-label="New project" style={{ ...S.card, width: 'min(640px, 100%)', boxShadow: '0 6px 16px rgba(26,29,27,.13)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 24px 4px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--text)' }}>New project</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Common values are filled in.</span>
          <button type="button" aria-label="Close" onClick={drawMyself} disabled={!!busy} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 24px 8px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div role="group" aria-label="Building" style={group}>
            <Head n="01" title="Building" note="the box you are filling" />
            <div style={row('2fr 1fr 1fr')}>
              <Times label="Length × width">
                <Field aria="Length (ft)" unit="ft" value={b.lengthFt} onChange={v => setBf({ lengthFt: v })} />
                <Field aria="Width (ft)" unit="ft" value={b.widthFt} onChange={v => setBf({ widthFt: v })} />
              </Times>
              <Field label="Clear height" aria="Clear height (ft)" unit="ft" step={0.5} value={b.clearFt} placeholder={`${ASSUMED_FT}`} onChange={v => setBf({ clearFt: v ?? '' })} />
              <Field label="Sprinkler height" aria="Sprinkler height (ft)" unit="ft" step={0.5} value={b.sprFt} placeholder="—" onChange={v => setBf({ sprFt: v ?? '' })} />
            </div>
          </div>
          <div role="group" aria-label="Pallet" style={group}>
            <Head n="02" title="Pallet" note={palletName(pal)} />
            <div style={row('3fr 1fr')}>
              <Times label="Depth × width × height">
                <Field aria="Pallet depth (in)" unit="in" value={pal.depthIn} onChange={v => setP({ depthIn: v })} />
                <Field aria="Pallet face (in)" unit="in" value={pal.faceIn} onChange={v => setP({ faceIn: v })} />
                <Field aria="Pallet height (in)" unit="in" value={pal.heightIn} onChange={v => setP({ heightIn: v })} />
              </Times>
              <Field label="Weight" aria="Pallet weight (lb)" unit="lb" step={50} value={pal.weightLb} onChange={v => setP({ weightLb: v })} />
            </div>
          </div>
          <div role="group" aria-label="Layout" style={group}>
            <Head n="03" title="Layout" note={aisle != null ? `aisle ${aisle} ft — follows the forklift` : null} />
            <div style={row('1fr 1fr')}>
              <ForkliftSelect value={mhe} onChange={setMhe} mheOptions={mheOptions} compact />
              <Times label="Column grid">
                <Field aria="Column grid X (ft)" unit="ft" value={b.gridXFt} onChange={v => setBf({ gridXFt: v })} />
                <Field aria="Column grid Y (ft)" unit="ft" value={b.gridYFt} onChange={v => setBf({ gridYFt: v })} />
              </Times>
            </div>
            <div style={row('2fr 1fr 1fr')}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}><span style={T5.label}>Row direction</span>
                <Seg aria="Row direction" value={b.orientation} onChange={v => setBf({ orientation: v })} options={[['auto', 'Auto'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']]} /></label>
              <Field label="Max run" aria="Max rack run (ft)" unit="ft" value={b.maxRunFt} onChange={v => setBf({ maxRunFt: v })} />
              <Field label="Wall clearance" aria="Wall clearance (in)" unit="in" value={wallClearIn} onChange={v => setWall(v ?? 0)} />
            </div>
          </div>
          <Advanced value={adv} onChange={setAdv} units={units} onUnits={setUnits} style={{ display: 'flex', flexDirection: 'column', paddingTop: 12, borderTop: '1px solid var(--border)' }}
            extra={<label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.th}>Columns along wall</span>
              <Seg aria="Columns along wall" value={b.columnsAlongWall} onChange={v => setBf({ columnsAlongWall: v })} options={[[true, 'Yes'], [false, 'No']]} /></label>} />
          {failed && <span role="alert" style={{ ...S.note, color: 'var(--red)' }}>Nothing fits — change the building or the pallet.</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px 20px' }}>
          <button type="button" onClick={drawMyself} disabled={!!busy} style={{ ...S.btn, height: 40, padding: '0 16px', fontSize: 14 }}><PenLine size={14} /> Draw it myself</button>
          <button type="button" disabled={!!busy} onClick={generate} style={{ ...S.btn, ...S.solid, height: 40, padding: '0 18px', fontSize: 14, fontWeight: 500, marginLeft: 'auto', cursor: busy ? 'progress' : 'pointer' }}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Generating… {Math.round(busy.progress * 100)}%</> : <><Sparkles size={14} /> Generate layout</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── an existing project: Project settings ───────────────────────────────────────────────────────────────────────── */
function SettingsCard() {
  const T = useCanvasStore(s => s.elevations)
  const { mheOptions } = useRules()
  const start = useMemo(() => {
    const pr = projectOf(T)
    if (pr) return JSON.parse(JSON.stringify(pr))
    const r = useRackingSettings.getState()
    return newProject({ mhe: r.mhe, wallClearIn: r.wallClearIn, units: useCanvasStore.getState().unit })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [pr, setPr] = useState(start)
  const [ask, setAsk] = useState(null)              // the Regenerate / Keep question: { project }
  const set = (patch) => setPr(p => ({ ...p, ...patch }))
  const setRow = (key, id, patch) => setPr(p => ({ ...p, [key]: p[key].map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !ask) closeSetup() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [ask])

  /* a sprinkler height above its ceiling (STUDIO.md §7): a field error — it cannot be saved */
  const hasError = pr.ceilings.some(sprinklerError)
  const write = (project) => {
    const st = store.getState(), old = projectOf(st.elevations)
    const r = syncTypesToPallets(st.objects, st.elevations, old, project)
    // the elevations' names follow their pallet and ceiling (renamed ones keep theirs)
    st.commitElevations(refreshNames(withProject(r.table, project)), r.objects)
  }
  const save = () => {
    if (hasError) return                        // a field error is never saved
    const st = store.getState(), old = projectOf(st.elevations)
    const fp = regenBuilding(st.objects), gen = fp ? regenSummary(st.objects, fp).racks.length : 0
    if (old && gen && layoutAffecting(old, pr)) { setAsk({ project: pr }); return }
    write(pr); closeSetup()
  }
  const regenerate = () => {
    const project = ask.project
    write(project)
    const pal = project.pallets.find(p => p.id === project.defaultPalletId) || project.pallets[0], r = useRackingSettings.getState()
    regenerateRacking({ orientation: 'auto', mhe: project.equipment.mhe, aisleFt: mheOptions[project.equipment.mhe]?.aisleFt ?? r.aisleFt, wallClearIn: project.rules.wallClearIn, maxRunFt: r.maxRunFt, palletWIn: pal?.faceIn, palletDIn: pal?.depthIn, levels: 4 }, { beamIn: r.beamIn ?? 96 })
    setAsk(null); closeSetup()
  }
  const aisle = mheOptions[pr.equipment?.mhe]?.aisleFt
  // an entry an elevation uses (saved layout) can't be deleted; a pallet keeps at least one
  const ceilUsed = (id) => ceilingInUse(T, id), palUsed = (id) => palletInUse(T, id)
  const addCeiling = () => setPr(p => { const c = { id: newId('ceil'), name: p.ceilings.length ? `Ceiling ${p.ceilings.length + 1}` : 'Main', clearHeightIn: null, sprinklerIn: null }; return { ...p, ceilings: [...p.ceilings, c], defaultCeilingId: p.defaultCeilingId || c.id } })
  const addPallet = () => setPr(q => { const src = q.pallets.find(x => x.id === q.defaultPalletId) || q.pallets[0]; const p = { ...src, id: newId('pal') }; p.name = palletName(p) === src.name ? `${src.name} 2` : palletName(p); return { ...q, pallets: [...q.pallets, p] } })

  return (
    <div style={S.back} onMouseDown={e => { if (e.target === e.currentTarget) closeSetup() }}>
      <div role="dialog" aria-label="Project setup" style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Project settings</span>
          <span style={S.note}>Used by Generate, Fill racking, the elevations and the checks.</span>
          <button type="button" aria-label="Close" onClick={closeSetup} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto' }}>
          {/* the building: ceiling heights */}
          <div style={S.sec} role="group" aria-label="Ceiling heights">
            <span style={S.h}>Building · ceiling heights</span>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 4px' }}>
              <thead><tr><th style={{ ...S.th, width: 56 }}>Default</th><th style={S.th}>Name</th><th style={S.th}>Clear height (ft)</th><th style={S.th}>Sprinkler height (ft)</th><th style={{ width: 30 }} /></tr></thead>
              <tbody>
                {pr.ceilings.map(c => {
                  const used = ceilUsed(c.id)
                  return (
                    <tr key={c.id} data-ceiling={c.id}>
                      <td style={{ textAlign: 'center' }}><input type="radio" name="defaultCeiling" aria-label={`Default ceiling ${c.name}`} checked={pr.defaultCeilingId === c.id} onChange={() => set({ defaultCeilingId: c.id })} /></td>
                      <td><input aria-label="Ceiling name" value={c.name} style={S.in} onChange={e => setRow('ceilings', c.id, { name: e.target.value })} /></td>
                      <td><NumIn aria="Clear height (ft)" step={0.5} value={ftOf(c.clearHeightIn)} placeholder={`not set — ${ASSUMED_FT}'`} onChange={v => setRow('ceilings', c.id, { clearHeightIn: inOf(v) })} /></td>
                      <td><NumIn aria="Sprinkler height (ft)" step={0.5} value={ftOf(c.sprinklerIn)} placeholder="optional" error={sprinklerError(c)} onChange={v => setRow('ceilings', c.id, { sprinklerIn: inOf(v) })} /></td>
                      <td><button type="button" aria-label={`Remove ceiling ${c.name}`} title={used ? 'An elevation uses it' : 'Remove'} disabled={used} onClick={() => setPr(p => { const ceilings = p.ceilings.filter(x => x.id !== c.id); return { ...p, ceilings, defaultCeilingId: p.defaultCeilingId === c.id ? ceilings[0]?.id ?? null : p.defaultCeilingId } })} style={{ ...S.btn, padding: '4px 6px', opacity: used ? 0.4 : 1, cursor: used ? 'not-allowed' : 'pointer' }}><Trash2 size={12} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!pr.ceilings.some(c => c.clearHeightIn > 0) && <div style={{ ...S.note, color: 'var(--elev-clr, #A8341C)' }}>Clear height not set — elevations assume {ASSUMED_FT}'.</div>}
            {pr.ceilings.some(sprinklerError) && <div role="alert" aria-label="Sprinkler height error" style={{ ...S.note, color: 'var(--red, #C0452A)' }}>A sprinkler height can't be above its ceiling ({pr.ceilings.filter(sprinklerError).map(c => c.name).join(', ')}). Fix it to save.</div>}
            <button type="button" aria-label="Add ceiling height" onClick={addCeiling} style={{ ...S.btn, alignSelf: 'flex-start' }}><Plus size={13} /> Add</button>
          </div>

          {/* pallet sizes */}
          <div style={S.sec} role="group" aria-label="Pallet sizes">
            <span style={S.h}>Pallet sizes</span>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 4px' }}>
              <thead><tr><th style={{ ...S.th, width: 56 }}>Default</th><th style={S.th}>Name</th><th style={S.th}>Depth (in)</th><th style={S.th}>Width (in)</th><th style={S.th}>Height (in)</th><th style={S.th}>Weight (lb)</th><th style={{ width: 30 }} /></tr></thead>
              <tbody>
                {pr.pallets.map(p => {
                  const blocked = palUsed(p.id) || pr.pallets.length <= 1
                  return (
                    <tr key={p.id} data-pallet={p.id}>
                      <td style={{ textAlign: 'center' }}><input type="radio" name="defaultPallet" aria-label={`Default pallet ${p.name}`} checked={pr.defaultPalletId === p.id} onChange={() => set({ defaultPalletId: p.id })} /></td>
                      <td><input aria-label="Pallet name" value={p.name} style={S.in} onChange={e => setRow('pallets', p.id, { name: e.target.value })} /></td>
                      <td><NumIn aria="Pallet depth (in)" value={p.depthIn} onChange={v => setRow('pallets', p.id, { depthIn: v })} /></td>
                      <td><NumIn aria="Pallet width (in)" value={p.faceIn} onChange={v => setRow('pallets', p.id, { faceIn: v })} /></td>
                      <td><NumIn aria="Pallet height (in)" value={p.heightIn} onChange={v => setRow('pallets', p.id, { heightIn: v })} /></td>
                      <td><NumIn aria="Pallet weight (lb)" step={50} value={p.weightLb} onChange={v => setRow('pallets', p.id, { weightLb: v })} /></td>
                      <td><button type="button" aria-label={`Remove pallet ${p.name}`} title={palUsed(p.id) ? 'An elevation uses it' : pr.pallets.length <= 1 ? 'The project needs one pallet' : 'Remove'} disabled={blocked} onClick={() => setPr(q => { const pallets = q.pallets.filter(x => x.id !== p.id); return { ...q, pallets, defaultPalletId: q.defaultPalletId === p.id ? pallets[0].id : q.defaultPalletId } })} style={{ ...S.btn, padding: '4px 6px', opacity: blocked ? 0.4 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}><Trash2 size={12} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button type="button" aria-label="Add pallet size" onClick={addPallet} style={{ ...S.btn, alignSelf: 'flex-start' }}><Plus size={13} /> Add</button>
          </div>

          {/* uprights: the hole pitch — the step a beam snaps to when dragged on an elevation (C21) */}
          <div style={S.sec} role="group" aria-label="Uprights">
            <span style={S.h}>Uprights</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ width: 120 }}><Num label="Hole pitch (in)" value={pr.advanced?.holePitchIn ?? ADVANCED_DEFAULTS.holePitchIn} onChange={v => set({ advanced: { ...(pr.advanced || {}), holePitchIn: v > 0 ? v : ADVANCED_DEFAULTS.holePitchIn } })} /></div>
              <span style={{ ...S.note, paddingBottom: 6 }}>Beams snap to this step when dragged on an elevation.</span>
            </div>
          </div>

          {/* forklift, walls */}
          <div style={S.sec} role="group" aria-label="Equipment and rules">
            <span style={S.h}>Forklift and walls</span>
            <div style={S.grid}>
              <ForkliftSelect value={pr.equipment?.mhe} onChange={v => set({ equipment: { ...pr.equipment, mhe: v } })} mheOptions={mheOptions} />
              <Num label="Wall clearance (in)" value={pr.rules?.wallClearIn} onChange={v => set({ rules: { ...pr.rules, wallClearIn: v ?? 0 } })} />
            </div>
            <span style={S.note}>Aisle {aisle != null ? `${aisle} ft` : '—'} — follows the forklift.</span>
          </div>

          <Advanced value={pr.advanced || {}} onChange={v => set({ advanced: v })} units={pr.rules?.units} onUnits={u => set({ rules: { ...pr.rules, units: u } })} />
        </div>

        {/* the question when racks would move */}
        {ask && (
          <div role="alertdialog" aria-label="Regenerate or keep layout" style={{ ...S.sec, background: 'var(--surface2)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>This changes how racks are laid out.</span>
            <span style={S.note}>The default pallet's face or depth, the forklift or the wall clearance changed. Regenerate the racking with it (the building, zones, hand-placed racks and elevations kept), or keep the layout as it is.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={regenerate} style={{ ...S.btn, ...S.solid }}>Regenerate racking</button>
              <button type="button" onClick={() => { write(ask.project); setAsk(null); closeSetup() }} style={S.btn}>Keep layout</button>
              <button type="button" onClick={() => setAsk(null)} style={{ ...S.btn, color: 'var(--text3)' }}>Back</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={closeSetup} style={S.btn}>Cancel</button>
          <button type="button" disabled={!!ask || hasError} title={hasError ? 'A sprinkler height is above its ceiling' : undefined} onClick={save} style={{ ...S.btn, ...S.solid, marginLeft: 'auto', opacity: ask || hasError ? 0.5 : 1, cursor: hasError ? 'not-allowed' : 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  )
}
