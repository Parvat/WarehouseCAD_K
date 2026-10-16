import { useEffect, useMemo, useState } from 'react'
import { Star, Plus, Copy, Trash2, Check, Undo2, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, legendCounts, sprinklerClearance, isBeamRack } from '../../utils/elevations'
import { lengthsByType, buildingOf, ftInDash } from '../../utils/elevationDrawing'
import { tint, ELEV_FILL_OPACITY } from '../../utils/elevationDraw'
import { proposals, fitInputs, layoutPositions, feetLabel, levelPitch } from '../../utils/elevFit'
import { useElevMode, setElevMode, applyDraft, discardDraft, useForLayout, addElevation, changeElevation, renameElevation, recolorElevation, deleteElevation, defaultElevation, setBuildingHeights, draft, installAssignWatcher } from '../../utils/elevMode'
import { useElevEditor, setPane } from '../../utils/elevEditor'
import { bayLedger } from '../../utils/bayLedger'
import { regenBuilding } from '../../generate/regenerate'
import { ElevationDrawing } from './ElevationDrawing'

/* ── The elevation workspace — the right side of Elevation mode (ELEVATIONS_PLAN.md §3) ────────────────────────────
   Apply / Discard (the draft: everything here edits the layout live, the plan recolours at once, and Apply saves it as
   ONE undo step); the building's heights and the fit inputs; the auto-fit proposals (max levels ★, one fewer, the next
   one up flagged); the elevations (colour, name, bays — the active one is what a selection on the plan takes); the
   drawing of the active elevation, Front | Side, its adjustments applying to that elevation everywhere. */

const store = useCanvasStore
const S = {
  sec: { padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  h: { fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' },
  note: { fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text3)', lineHeight: 1.45 },
  label: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', whiteSpace: 'nowrap' },
  input: { width: '100%', minWidth: 0, borderRadius: 6, padding: '5px 7px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  solid: { background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' },
}
const seg = (on) => ({ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })
const segGroup = { display: 'flex', gap: 2, padding: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }

/** A number field written on Enter / blur (blank: `onClear`, or no change). */
function Num({ label, value, onCommit, unit, aria, step = 1, onClear = null, required = false }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const done = () => { const t = text.trim(); if (t === '') { if (onClear && value != null) onClear(); else setText(value == null ? '' : String(value)); return } const v = Number(t); if (Number.isFinite(v) && v >= 0 && v !== value) onCommit(v); else setText(value == null ? '' : String(value)) }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ ...S.label, color: required ? 'var(--elev-clr, #A8341C)' : S.label.color }}>{label}{unit ? ` (${unit})` : ''}</span>
      <input aria-label={aria || label} type="number" min={0} step={step} value={text} placeholder={required ? 'required' : 'not set'} style={{ ...S.input, ...(required ? { borderColor: 'var(--elev-clr, #A8341C)' } : {}) }}
        onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    </label>
  )
}

function Name({ t, onRename }) {
  const [edit, setEdit] = useState(false), [text, setText] = useState(t.name)
  useEffect(() => setText(t.name), [t.name])
  if (!edit) return <span onDoubleClick={e => { e.stopPropagation(); setEdit(true) }} title="Double-click to rename" style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
  const done = () => { setEdit(false); if (text.trim() && text.trim() !== t.name) onRename(text.trim()) }
  return <input autoFocus aria-label="Elevation name" value={text} onClick={e => e.stopPropagation()} onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setText(t.name); setEdit(false) } }} style={{ ...S.input, flex: 1 }} />
}

export function ElevationWorkspace() {
  const { objects, T, gridSize } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gridSize: s.gridSize || 40 })))
  const { activeId, pending, view, adding } = useElevMode()
  const { detail, sel } = useElevEditor()
  useEffect(() => installAssignWatcher(store), [])
  const fp = useMemo(() => regenBuilding(objects), [objects])
  const building = useMemo(() => (fp ? buildingOf(objects, fp.id) : null), [objects, fp])
  const [fitDraft, setFit] = useState(null)
  const fit = fitInputs({ ...(T?.fit || {}), ...(fitDraft || {}), sprinklerClearanceIn: sprinklerClearance(T) })
  const props = useMemo(() => proposals(building, fit, (d) => layoutPositions(objects, d, gridSize)), [building, JSON.stringify(fit), objects, gridSize])   // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => { const L = bayLedger(objects, gridSize, T); return new Map(legendCounts(objects, T, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays])) }, [objects, gridSize, T])
  const active = T ? typeById(T, activeId) || typeById(T, T.defaultId) : null
  const entry = useMemo(() => { const used = active ? lengthsByType(objects, T, typeIdAt).get(active.id) || [] : []; const r0 = objects.find(isBeamRack); return used[0] || { beamIn: 96, depthIn: r0?.depthIn ?? 42, pair: r0?.type === 'rack_double_row', flueIn: r0?.flueSpaceIn ?? 9, palletWIn: r0?.palletWIn ?? 40, parentId: fp?.id ?? null } }, [objects, T, active, fp])
  const setFitKey = (k, v) => { setFit(f => ({ ...(f || {}), [k]: v })); if (T) draft(store, { elevations: { ...T, fit: { ...(T.fit || {}), ...(fitDraft || {}), [k]: v } } }) }
  const fitSaved = { palletHeightIn: fit.palletHeightIn, clearanceIn: fit.clearanceIn, beamFaceIn: fit.beamFaceIn, holePitchIn: fit.holePitchIn, uprightStepIn: fit.uprightStepIn }
  const several = (T?.types.length || 0) > 1
  const [inputsOpen, setInputsOpen] = useState(() => !(fp?.clearHeightFt > 0))
  useEffect(() => { if (fp && !(fp.clearHeightFt > 0)) setInputsOpen(true) }, [fp])

  return (
    <div aria-label="Elevation workspace" data-pane="open" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', minWidth: 0 }}>
      {/* the draft: Apply saves it as one undo step; Discard goes back to the last applied */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Elevations</span>
        <span role="status" style={{ ...S.note, color: pending ? 'var(--elev-clr, #A8341C)' : 'var(--text3)' }}>{pending ? 'Changes not applied' : 'All applied'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" disabled={!pending} onClick={() => discardDraft(store)} style={{ ...S.btn, opacity: pending ? 1 : 0.45 }}><Undo2 size={13} /> Discard</button>
          <button type="button" disabled={!pending} onClick={() => applyDraft(store)} style={{ ...S.btn, ...S.solid, opacity: pending ? 1 : 0.45 }}><Check size={13} /> Apply</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* the building and the pallet: what the proposals fit */}
        <div style={S.sec} role="group" aria-label="Fit inputs">
          {/* open while the clear height is missing; otherwise one line, so the drawing comes up the page */}
          <button type="button" aria-expanded={inputsOpen} onClick={() => setInputsOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <ChevronRight size={11} style={{ color: 'var(--text3)', transform: inputsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            <span style={S.h}>Building &amp; pallet</span>
          </button>
          {!fp && <div style={S.note}>No building on the plan.</div>}
          {fp && !inputsOpen && <div aria-label="Fit summary" style={S.note}>Clear {feetLabel(fp.clearHeightFt * 12)} · sprinklers {fp.sprinklerFt > 0 ? feetLabel(fp.sprinklerFt * 12) : 'not set'} ({fit.sprinklerClearanceIn}") · pallet {fit.palletHeightIn}" · clearance {fit.clearanceIn}" · face {fit.beamFaceIn}" · pitch {fit.holePitchIn}" · step {feetLabel(fit.uprightStepIn)}</div>}
          {fp && inputsOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
              <Num label="Clear height" unit="ft" aria="Clear height" step={0.5} required={!(fp.clearHeightFt > 0)} value={fp.clearHeightFt > 0 ? fp.clearHeightFt : null} onCommit={v => setBuildingHeights(store, fp.id, { clearHeightFt: v > 0 ? v : undefined })} />
              <Num label="Sprinklers" unit="ft" aria="Sprinkler height" step={0.5} value={fp.sprinklerFt > 0 ? fp.sprinklerFt : null} onCommit={v => setBuildingHeights(store, fp.id, { sprinklerFt: v > 0 ? v : undefined })} onClear={() => setBuildingHeights(store, fp.id, { sprinklerFt: undefined })} />
              <Num label="Spr. clearance" unit="in" aria="Sprinkler clearance" value={fit.sprinklerClearanceIn} onCommit={v => T && draft(store, { elevations: { ...T, sprinklerClearanceIn: v } })} />
              <Num label="Pallet" unit="in" aria="Pallet height" value={fit.palletHeightIn} onCommit={v => setFitKey('palletHeightIn', v)} />
              <Num label="Clearance" unit="in" aria="Clearance" value={fit.clearanceIn} onCommit={v => setFitKey('clearanceIn', v)} />
              <Num label="Beam face" unit="in" aria="Beam face" value={fit.beamFaceIn} onCommit={v => setFitKey('beamFaceIn', v)} />
              <Num label="Hole pitch" unit="in" aria="Hole pitch" value={fit.holePitchIn} onCommit={v => setFitKey('holePitchIn', v)} />
              <Num label="Upright step" unit="ft" aria="Upright step" step={0.5} value={fit.uprightStepIn / 12} onCommit={v => v > 0 && setFitKey('uprightStepIn', v * 12)} />
            </div>
          )}
          {fp && !(fp.clearHeightFt > 0) && <div role="alert" style={{ ...S.note, color: 'var(--elev-clr, #A8341C)' }}>Enter the building's clear height to see elevation proposals.</div>}
          {props && <div style={S.note}>Level pitch {ftInDash(levelPitch(fit))} = pallet + clearance + beam face, to the hole pitch; first level on the floor.</div>}
        </div>

        {/* the proposals */}
        {props && (
          <div style={S.sec} role="group" aria-label="Proposals">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.h}>Proposals</span>
              {adding && <span style={{ ...S.note, color: 'var(--text2)' }}>Pick one to add — or duplicate the active elevation below</span>}
            </div>
            <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {props.map(p => {
                const fails = p.over > 0
                return (
                  <div key={p.n} role="listitem" data-levels={p.n} data-fails={fails ? 'yes' : 'no'} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${p.best ? 'var(--text2)' : 'var(--border)'}`, background: fails ? 'transparent' : 'var(--surface2)', opacity: fails ? 0.8 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {p.best && <Star size={12} fill="currentColor" aria-label="best" />}{p.n} level{p.n === 1 ? '' : 's'} · upright {feetLabel(p.design.uprightHeightIn)}
                      </span>
                      <span style={S.note}>
                        {fails ? <span style={{ color: 'var(--elev-clr, #A8341C)' }}>{ftInDash(p.over)} over the {p.kind === 'sprinkler' ? 'sprinkler' : 'clear-height'} limit</span>
                          : <>{p.positions != null ? `${p.positions.toLocaleString()} positions · ` : ''}headroom {ftInDash(p.headroom)}</>}
                        {' · '}beams {p.design.levels.slice(1).map(l => ftInDash(l.beamIn)).join(', ') || 'floor only'}
                      </span>
                    </div>
                    {!fails && (adding
                      ? <button type="button" style={S.btn} onClick={() => addElevation(store, { design: p.design })}><Plus size={13} /> Add</button>
                      : <button type="button" style={{ ...S.btn, ...(p.best ? S.solid : {}) }} onClick={() => useForLayout(store, p.design, { fit: fitSaved })} title="This elevation for every bay of the layout">Use for layout</button>)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* the elevations: the active one is what a selection on the plan takes */}
        {T && (
          <div style={S.sec} role="group" aria-label="Elevations">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.h}>Elevations</span>
              <button type="button" aria-pressed={adding} onClick={() => setElevMode({ adding: !adding })} style={{ ...S.btn, marginLeft: 'auto', ...(adding ? S.solid : {}) }}><Plus size={13} /> Add elevation</button>
            </div>
            <div role="list" aria-label="Elevation list" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {T.types.map(t => {
                const on = active && t.id === active.id
                return (
                  <div key={t.id} role="listitem" data-type-id={t.id} aria-selected={on} onClick={() => setElevMode({ activeId: t.id })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', background: on ? 'var(--surface2)' : 'transparent', border: `1px solid ${on ? 'var(--text2)' : 'transparent'}` }}>
                    <label onClick={e => e.stopPropagation()} title="Colour" style={{ position: 'relative', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}>
                      <span style={{ position: 'absolute', inset: 0, borderRadius: 3, background: 'white', border: '1px solid rgba(0,0,0,0.25)' }}><span style={{ position: 'absolute', inset: 0, borderRadius: 2, background: tint(t.color), opacity: several ? ELEV_FILL_OPACITY : 0.25 }} /></span>
                      <input aria-label={`${t.name} colour`} type="color" value={tint(t.color)} onChange={e => recolorElevation(store, t.id, e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                    </label>
                    <Name t={t} onRename={v => renameElevation(store, t.id, v)} />
                    {t.id === T.defaultId ? <span title="Layout default" style={S.label}>default</span>
                      : <button type="button" aria-label={`Make ${t.name} the default`} title="Make it the layout default" onClick={e => { e.stopPropagation(); defaultElevation(store, t.id) }} style={{ ...S.btn, padding: '2px 6px' }}><Star size={11} /></button>}
                    <span title="Bays (each side of a back-to-back one bay)" style={{ ...S.label, color: 'var(--text2)', minWidth: 28, textAlign: 'right' }}>{counts.get(t.id) || 0}</span>
                    <button type="button" aria-label={`Duplicate ${t.name}`} title="Duplicate — a variant to adjust" onClick={e => { e.stopPropagation(); addElevation(store, { fromId: t.id }) }} style={{ ...S.btn, padding: '2px 6px' }}><Copy size={11} /></button>
                    <button type="button" aria-label={`Delete ${t.name}`} disabled={T.types.length <= 1} title="Delete — its bays go back to the default" onClick={e => { e.stopPropagation(); deleteElevation(store, t.id) }} style={{ ...S.btn, padding: '2px 6px', color: 'var(--red)', opacity: T.types.length <= 1 ? 0.4 : 1 }}><Trash2 size={11} /></button>
                  </div>
                )
              })}
            </div>
            <div style={{ ...S.note, color: several ? 'var(--text2)' : 'var(--text3)' }}>
              {several ? <>Assigning <strong>{active?.name}</strong> — click rows on the plan (one side of a back-to-back: click that side); Shift+click or drag a box to add more.</>
                : 'Every bay carries this elevation. Add another to assign it to some rows.'}
            </div>
          </div>
        )}

        {/* the drawing of the active elevation: one large view */}
        {active && (
          <div style={{ ...S.sec, borderBottom: 'none' }} role="group" aria-label="Elevation drawing view">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div role="group" aria-label="View" style={segGroup}>
                {[['front', 'Front'], ['side', 'Side']].map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} style={seg(view === k)} onClick={() => setElevMode({ view: k })}>{label}</button>)}
              </div>
              <div role="group" aria-label="Drawing detail" style={segGroup}>
                {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={detail === k} style={seg(detail === k)} onClick={() => setPane({ detail: k })}>{label}</button>)}
              </div>
              <span style={{ ...S.note, marginLeft: 'auto' }}>{active.name} · beam {ftInDash(entry.beamIn)}</span>
            </div>
            {(!building?.clearHeightIn || !building?.sprinklerIn) && <div style={S.note}>{!building?.clearHeightIn ? 'No clear height' : 'No sprinkler height'} — set it above to draw it.</div>}
            <ElevationDrawing t={active} entry={entry} building={building} sel={sel} sprClr={sprinklerClearance(T)} detail={detail} view={view} height={Math.max(420, Math.round(window.innerHeight * 0.62))}
              onCommit={(next) => changeElevation(store, active.id, next)} />
            <div style={S.note}>Drag a beam, double-click a dimension to type it, drag the top of the upright, click an upright to add a level — for this elevation everywhere it is used.</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** The divider between the plan and the workspace: drag to resize (rAF-coalesced), the share remembered. */
export function ElevationDivider() {
  const [drag, setDrag] = useState(false)
  const start = (e) => {
    e.preventDefault()
    const w = window.innerWidth
    let raf = 0, v = useElevMode.getState().split
    setDrag(true)
    const move = (ev) => { v = Math.min(0.7, Math.max(0.25, 1 - ev.clientX / w)); if (!raf) raf = requestAnimationFrame(() => { raf = 0; useElevMode.setState({ split: v }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (raf) cancelAnimationFrame(raf); setElevMode({ split: v }); setDrag(false) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize elevation workspace" onPointerDown={start}
      style={{ width: 8, flexShrink: 0, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderLeft: '1px solid var(--border)' }}>
      <div style={{ width: 3, height: 44, borderRadius: 2, background: drag ? 'var(--text2)' : 'var(--border)' }} />
    </div>
  )
}
