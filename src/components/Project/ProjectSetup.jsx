import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ChevronRight, X } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useRules } from '../../rules/useRules'
import { useRackingSettings } from '../../utils/fillTool'
import { UNITS } from '../../constants'
import { useProjectSetup, closeSetup, projectOf, newProject, newId, palletName, withProject, syncTypesToPallets, layoutAffecting, ADVANCED_DEFAULTS } from '../../utils/project'
import { refreshNames } from '../../utils/elevTab'
import { regenBuilding, regenSummary } from '../../generate/regenerate'
import { regenerateRacking } from '../../generate/traceGenerate'

/* ── Project setup (PROJECT_SETUP.md) ───────────────────────────────────────────────────────────────────────────────
   Shown when a new project starts, when the first racks go down with no ceiling height (once, Skip allowed), and from
   Project settings any time. Ceiling heights and pallet sizes are lists, one of each marked default (usually one
   entry); the forklift (aisle widths follow it); wall clearance and units; Advanced (collapsed): load clearance,
   sprinkler clearance, hole pitch, upright step, flue. Save writes it into the layout — one undo step. A change that
   moves racks (the default pallet's face or depth, the forklift, the wall clearance) on a layout with generated racks
   asks: Regenerate racking, or Keep layout. Ceilings and a pallet's height, weight and beam face only update the
   elevations and the checks. */

const store = useCanvasStore
const S = {
  back: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,14,20,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: 'min(860px, 100%)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 18px 60px rgba(0,0,0,0.28)', fontFamily: 'var(--font-ui)' },
  sec: { padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  h: { fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' },
  th: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', textAlign: 'left', fontWeight: 500, padding: '0 4px 2px' },
  in: { width: '100%', minWidth: 0, borderRadius: 6, padding: '5px 7px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  solid: { background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' },
  note: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 },
}
const ftOf = (inch) => (inch > 0 ? Math.round((inch / 12) * 100) / 100 : '')
const inOf = (ft) => { const v = Number(ft); return Number.isFinite(v) && v > 0 ? Math.round(v * 12) : null }

function NumIn({ value, onChange, aria, step = 1, placeholder }) {
  return <input aria-label={aria} type="number" min={0} step={step} value={value ?? ''} placeholder={placeholder} style={S.in} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />
}

export function ProjectSetup() {
  const { open, reason } = useProjectSetup()
  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.querySelector('[data-theme]')) }, [open])
  if (!open || !host) return null
  return createPortal(<SetupCard reason={reason} />, host)
}

function SetupCard({ reason }) {
  const T = useCanvasStore(s => s.elevations)
  const { mheOptions } = useRules()
  const start = useMemo(() => {
    const pr = projectOf(T)
    if (pr) return JSON.parse(JSON.stringify(pr))
    const r = useRackingSettings.getState()
    return newProject({ mhe: r.mhe, wallClearIn: r.wallClearIn, units: useCanvasStore.getState().unit })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [pr, setPr] = useState(start)
  const [adv, setAdv] = useState(false)
  const [ask, setAsk] = useState(null)              // the Regenerate / Keep question: { project }
  const set = (patch) => setPr(p => ({ ...p, ...patch }))
  const setRow = (key, id, patch) => setPr(p => ({ ...p, [key]: p[key].map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  const first = reason === 'new' || reason === 'ceiling'
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !ask) closeSetup() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [ask])

  const write = (project) => {
    const st = store.getState(), old = projectOf(st.elevations)
    const r = syncTypesToPallets(st.objects, st.elevations, old, project)
    // the elevations' names follow their pallet and ceiling (renamed ones keep theirs)
    st.commitElevations(refreshNames(withProject(r.table, project)), r.objects)
  }
  const save = () => {
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
  const skip = () => { if (!projectOf(store.getState().elevations)) write({ ...pr, setupPrompted: reason === 'ceiling' || pr.setupPrompted }); closeSetup() }
  const aisle = mheOptions[pr.equipment?.mhe]?.aisleFt

  return (
    <div style={S.back} onMouseDown={e => { if (e.target === e.currentTarget && !first) closeSetup() }}>
      <div role="dialog" aria-label="Project setup" style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Project setup</span>
          <span style={S.note}>{reason === 'new' ? 'A new project — the building\'s heights, the pallets and the forklift.' : reason === 'ceiling' ? 'No ceiling height yet: elevations and checks need one.' : 'Used by Generate, Fill racking, the elevations and the checks.'}</span>
          <button type="button" aria-label="Close" onClick={first ? skip : closeSetup} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto' }}>
          {/* ceiling heights */}
          <div style={S.sec} role="group" aria-label="Ceiling heights">
            <span style={S.h}>Ceiling heights</span>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 4px' }}>
              <thead><tr><th style={{ ...S.th, width: 56 }}>Default</th><th style={S.th}>Name</th><th style={S.th}>Clear height (ft)</th><th style={S.th}>Sprinkler height (ft)</th><th style={{ width: 30 }} /></tr></thead>
              <tbody>
                {pr.ceilings.map(c => (
                  <tr key={c.id} data-ceiling={c.id}>
                    <td style={{ textAlign: 'center' }}><input type="radio" name="defaultCeiling" aria-label={`Default ceiling ${c.name}`} checked={pr.defaultCeilingId === c.id} onChange={() => set({ defaultCeilingId: c.id })} /></td>
                    <td><input aria-label="Ceiling name" value={c.name} style={S.in} onChange={e => setRow('ceilings', c.id, { name: e.target.value })} /></td>
                    <td><NumIn aria="Clear height (ft)" step={0.5} value={ftOf(c.clearHeightIn)} placeholder="required" onChange={v => setRow('ceilings', c.id, { clearHeightIn: inOf(v) })} /></td>
                    <td><NumIn aria="Sprinkler height (ft)" step={0.5} value={ftOf(c.sprinklerIn)} placeholder="optional" onChange={v => setRow('ceilings', c.id, { sprinklerIn: inOf(v) })} /></td>
                    <td><button type="button" aria-label={`Remove ceiling ${c.name}`} onClick={() => setPr(p => { const ceilings = p.ceilings.filter(x => x.id !== c.id); return { ...p, ceilings, defaultCeilingId: p.defaultCeilingId === c.id ? ceilings[0]?.id ?? null : p.defaultCeilingId } })} style={{ ...S.btn, padding: '4px 6px' }}><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pr.ceilings.length && <div style={{ ...S.note, color: 'var(--elev-clr, #A8341C)' }}>No ceiling height yet — add one so elevations fit the building.</div>}
            <button type="button" onClick={() => setPr(p => { const c = { id: newId('ceil'), name: p.ceilings.length ? `Ceiling ${p.ceilings.length + 1}` : 'Main', clearHeightIn: null, sprinklerIn: null }; return { ...p, ceilings: [...p.ceilings, c], defaultCeilingId: p.defaultCeilingId || c.id } })} style={{ ...S.btn, alignSelf: 'flex-start' }}><Plus size={13} /> Add ceiling height</button>
          </div>

          {/* pallet sizes */}
          <div style={S.sec} role="group" aria-label="Pallet sizes">
            <span style={S.h}>Pallet sizes</span>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 4px' }}>
              <thead><tr><th style={{ ...S.th, width: 56 }}>Default</th><th style={S.th}>Name</th><th style={S.th}>Face (in)</th><th style={S.th}>Depth (in)</th><th style={S.th}>Height (in)</th><th style={S.th}>Weight (lb)</th><th style={S.th}>Beam face (in)</th><th style={{ width: 30 }} /></tr></thead>
              <tbody>
                {pr.pallets.map(p => (
                  <tr key={p.id} data-pallet={p.id}>
                    <td style={{ textAlign: 'center' }}><input type="radio" name="defaultPallet" aria-label={`Default pallet ${p.name}`} checked={pr.defaultPalletId === p.id} onChange={() => set({ defaultPalletId: p.id })} /></td>
                    <td><input aria-label="Pallet name" value={p.name} style={S.in} onChange={e => setRow('pallets', p.id, { name: e.target.value })} /></td>
                    <td><NumIn aria="Pallet face (in)" value={p.faceIn} onChange={v => setRow('pallets', p.id, { faceIn: v })} /></td>
                    <td><NumIn aria="Pallet depth (in)" value={p.depthIn} onChange={v => setRow('pallets', p.id, { depthIn: v })} /></td>
                    <td><NumIn aria="Pallet height (in)" value={p.heightIn} onChange={v => setRow('pallets', p.id, { heightIn: v })} /></td>
                    <td><NumIn aria="Pallet weight (lb)" step={50} value={p.weightLb} onChange={v => setRow('pallets', p.id, { weightLb: v })} /></td>
                    <td><NumIn aria="Beam face (in)" value={p.beamFaceIn} onChange={v => setRow('pallets', p.id, { beamFaceIn: v })} /></td>
                    <td><button type="button" aria-label={`Remove pallet ${p.name}`} disabled={pr.pallets.length <= 1} onClick={() => setPr(q => { const pallets = q.pallets.filter(x => x.id !== p.id); return { ...q, pallets, defaultPalletId: q.defaultPalletId === p.id ? pallets[0].id : q.defaultPalletId } })} style={{ ...S.btn, padding: '4px 6px', opacity: pr.pallets.length <= 1 ? 0.4 : 1 }}><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setPr(q => { const src = q.pallets.find(x => x.id === q.defaultPalletId) || q.pallets[0]; const p = { ...src, id: newId('pal') }; p.name = palletName(p) === src.name ? `${src.name} 2` : palletName(p); return { ...q, pallets: [...q.pallets, p] } })} style={{ ...S.btn, alignSelf: 'flex-start' }}><Plus size={13} /> Add pallet size</button>
          </div>

          {/* equipment, rules */}
          <div style={{ ...S.sec, flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
            <div role="group" aria-label="Equipment" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
              <span style={S.h}>Equipment</span>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.th}>Forklift</span>
                <select aria-label="Forklift" value={pr.equipment?.mhe || 'reach'} onChange={e => set({ equipment: { ...pr.equipment, mhe: e.target.value } })} style={S.in}>
                  {Object.entries(mheOptions).map(([k, m]) => <option key={k} value={k}>{m.label || k}</option>)}
                </select>
              </label>
              <span style={S.note}>Aisle {aisle != null ? `${aisle} ft` : '—'} — follows the forklift (Rules).</span>
            </div>
            <div role="group" aria-label="Rules" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
              <span style={S.h}>Rules</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}><span style={S.th}>Wall clearance (in)</span><NumIn aria="Wall clearance (in)" value={pr.rules?.wallClearIn} onChange={v => set({ rules: { ...pr.rules, wallClearIn: v ?? 0 } })} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}><span style={S.th}>Units</span>
                  <select aria-label="Units" value={pr.rules?.units} onChange={e => set({ rules: { ...pr.rules, units: e.target.value } })} style={S.in}>{Object.values(UNITS).map(u => <option key={u} value={u}>{u}</option>)}</select>
                </label>
              </div>
            </div>
          </div>

          {/* advanced */}
          <div style={S.sec} role="group" aria-label="Advanced">
            <button type="button" aria-expanded={adv} onClick={() => setAdv(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <ChevronRight size={12} style={{ color: 'var(--text3)', transform: adv ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} /><span style={S.h}>Advanced</span>
            </button>
            {adv && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {[['clearanceIn', 'Load clearance (in)'], ['sprinklerClearanceIn', 'Sprinkler clearance (in)'], ['holePitchIn', 'Hole pitch (in)'], ['flueIn', 'Flue (in)']].map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.th}>{label}</span><NumIn aria={label} value={pr.advanced?.[k] ?? ADVANCED_DEFAULTS[k]} onChange={v => set({ advanced: { ...pr.advanced, [k]: v ?? ADVANCED_DEFAULTS[k] } })} /></label>
                ))}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.th}>Upright step (ft)</span><NumIn aria="Upright step (ft)" step={0.5} value={(pr.advanced?.uprightStepIn ?? 12) / 12} onChange={v => set({ advanced: { ...pr.advanced, uprightStepIn: v > 0 ? v * 12 : 12 } })} /></label>
              </div>
            )}
          </div>
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
          {first ? <button type="button" onClick={skip} style={S.btn}>Skip</button> : <button type="button" onClick={closeSetup} style={S.btn}>Cancel</button>}
          <button type="button" disabled={!!ask} onClick={save} style={{ ...S.btn, ...S.solid, marginLeft: 'auto', opacity: ask ? 0.5 : 1 }}>Save</button>
        </div>
      </div>
    </div>
  )
}
