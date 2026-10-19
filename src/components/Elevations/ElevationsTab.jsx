import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, MoreHorizontal, Star } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, legendCounts, sprinklerClearance, isBeamRack } from '../../utils/elevations'
import { lengthsByType, ftInDash } from '../../utils/elevationDrawing'
import { tint, tintOn, ELEV_FILL_OPACITY } from '../../utils/elevationDraw'
import { useElevEditor, setPane } from '../../utils/elevEditor'
import { useElevTab, nameOf, addBestFit, sameBestFit, assignSelected, changeElevation, renameElevation, recolorElevation, duplicateElevation, deleteElevation, defaultElevation, setPairing, removeUnused, rowSideCells } from '../../utils/elevTab'
import { projectOf, defaultCeiling, defaultPallet, ceilingFor, palletFor, openSetup, addCeiling, addPallet, palletName, PALLET_DEFAULT, ASSUMED_CLEAR_IN } from '../../utils/project'
import { bayLedger } from '../../utils/bayLedger'
import { ElevationDrawing } from './ElevationDrawing'

/* ── The Elevations tab (ELEVATIONS_PLAN.md §3) — next to Properties; the panel widens on it ─────────────────────────
   Front | Side and Simple | Detailed, then the drawing of the active elevation, taking most of the space (zoom, pan,
   Fit, full screen; drag a beam, type a value, the upright height — for that elevation everywhere). Below, the
   elevation chips: colour, name with its pairing ("5 levels · 48×40 · Main"), bay count; a menu (rename, duplicate,
   delete, set default, change ceiling / pallet); + Add (a ceiling and a pallet → the best fit for that pair); Remove
   unused. Assigning: select rows on the canvas as usual, then click a chip or Apply to selected rows — one undo step.
   No ceiling height in the project: a link to Project setup. */

const store = useCanvasStore
const S = {
  note: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  sel: { minWidth: 0, borderRadius: 6, padding: '4px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text)' },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 'inherit' },
}
const seg = (on) => ({ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })
const segGroup = { display: 'flex', gap: 2, padding: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }

/** A chip's menu: rename, duplicate, delete, set default, change ceiling / pallet. */
function ChipMenu({ t, T, onClose }) {
  const pr = projectOf(T), [name, setName] = useState(t.named ? t.name : '')
  const ref = useRef(null)
  useEffect(() => { const d = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }; window.addEventListener('pointerdown', d, true); return () => window.removeEventListener('pointerdown', d, true) }, [onClose])
  const row = { display: 'flex', alignItems: 'center', gap: 6 }
  return (
    <div ref={ref} role="menu" aria-label={`${nameOf(T, t)} menu`} style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 20, width: 260, padding: 10, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={row}><span style={{ ...S.note, width: 52 }}>Name</span>
        <input aria-label="Elevation name" value={name} placeholder={nameOf(T, { ...t, named: false })} style={{ ...S.sel, flex: 1 }} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={() => { if ((t.named ? t.name : '') !== name) renameElevation(store, t.id, name) }} />
      </label>
      <label style={row}><span style={{ ...S.note, width: 52 }}>Ceiling</span>
        <select aria-label="Elevation ceiling" value={t.ceilingId || ''} style={{ ...S.sel, flex: 1 }} onChange={e => setPairing(store, t.id, { ceilingId: e.target.value })}>
          {!t.ceilingId && <option value="">—</option>}
          {(pr?.ceilings || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label style={row}><span style={{ ...S.note, width: 52 }}>Pallet</span>
        <select aria-label="Elevation pallet" value={t.palletId || ''} style={{ ...S.sel, flex: 1 }} onChange={e => setPairing(store, t.id, { palletId: e.target.value })}>
          {!t.palletId && <option value="">—</option>}
          {(pr?.pallets || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label style={row}><span style={{ ...S.note, width: 52 }}>Colour</span><input aria-label="Elevation colour" type="color" value={tint(t.color)} onChange={e => recolorElevation(store, t.id, e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" role="menuitem" style={S.btn} onClick={() => { duplicateElevation(store, t.id); onClose() }}>Duplicate</button>
        <button type="button" role="menuitem" style={{ ...S.btn, opacity: t.id === T.defaultId ? 0.45 : 1 }} disabled={t.id === T.defaultId} onClick={() => { defaultElevation(store, t.id); onClose() }}><Star size={11} /> Set default</button>
        <button type="button" role="menuitem" style={{ ...S.btn, color: 'var(--red)', opacity: T.types.length <= 1 ? 0.45 : 1 }} disabled={T.types.length <= 1} onClick={() => { deleteElevation(store, t.id); onClose() }}>Delete</button>
      </div>
    </div>
  )
}

const NEW = '__new'
const ASSUMED_FT = Math.round(ASSUMED_CLEAR_IN / 12)
const solid = { background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' }
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

/** "+ New ceiling height…": name, clear height, sprinkler height → saved to the project (one undo step), then picked. */
function NewCeiling({ onDone }) {
  const [v, setV] = useState({ name: '', clearFt: '', sprFt: '' })
  const save = () => { const id = addCeiling(store, { name: v.name, clearHeightIn: num(v.clearFt) && Math.round(num(v.clearFt) * 12), sprinklerIn: num(v.sprFt) && Math.round(num(v.sprFt) * 12) }); onDone(id) }
  return (
    <div role="group" aria-label="New ceiling height" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', padding: 8, borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 90px' }}><span style={S.note}>Name</span><input aria-label="New ceiling name" autoFocus value={v.name} placeholder="Mezzanine" style={S.sel} onChange={e => setV(x => ({ ...x, name: e.target.value }))} /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 70px' }}><span style={S.note}>Clear (ft)</span><input aria-label="New ceiling clear height (ft)" type="number" min={0} step={0.5} value={v.clearFt} placeholder={`${ASSUMED_FT}`} style={S.sel} onChange={e => setV(x => ({ ...x, clearFt: e.target.value }))} /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 70px' }}><span style={S.note}>Sprinkler (ft)</span><input aria-label="New ceiling sprinkler height (ft)" type="number" min={0} step={0.5} value={v.sprFt} placeholder="optional" style={S.sel} onChange={e => setV(x => ({ ...x, sprFt: e.target.value }))} /></label>
      <button type="button" style={{ ...S.btn, ...solid }} onClick={save}>Save</button>
      <button type="button" style={S.btn} onClick={() => onDone(null)}>Cancel</button>
    </div>
  )
}
/** "+ New pallet size…": face, depth, height, weight, beam face (named from its size) → saved to the project, picked. */
function NewPallet({ onDone }) {
  const [v, setV] = useState({ faceIn: PALLET_DEFAULT.faceIn, depthIn: PALLET_DEFAULT.depthIn, heightIn: PALLET_DEFAULT.heightIn, weightLb: PALLET_DEFAULT.weightLb, beamFaceIn: PALLET_DEFAULT.beamFaceIn })
  const fields = [['faceIn', 'Face (in)'], ['depthIn', 'Depth (in)'], ['heightIn', 'Height (in)'], ['weightLb', 'Weight (lb)'], ['beamFaceIn', 'Beam face (in)']]
  const save = () => { const id = addPallet(store, Object.fromEntries(fields.map(([k]) => [k, num(v[k])]))); onDone(id) }
  return (
    <div role="group" aria-label="New pallet size" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', padding: 8, borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      {fields.map(([k, label], i) => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 58px' }}><span style={S.note}>{label}</span><input aria-label={`New pallet ${label.toLowerCase()}`} autoFocus={i === 0} type="number" min={0} value={v[k]} style={S.sel} onChange={e => setV(x => ({ ...x, [k]: e.target.value }))} /></label>
      ))}
      <span style={{ ...S.note, alignSelf: 'center' }}>{num(v.depthIn) && num(v.faceIn) ? palletName({ depthIn: num(v.depthIn), faceIn: num(v.faceIn) }) : ''}</span>
      <button type="button" style={{ ...S.btn, ...solid }} onClick={save}>Save</button>
      <button type="button" style={S.btn} onClick={() => onDone(null)}>Cancel</button>
    </div>
  )
}

export function ElevationsTab() {
  const { objects, T, gridSize, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gridSize: s.gridSize || 40, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const { activeId, view, adding, made } = useElevTab()
  const [newForm, setNewForm] = useState(null)        // 'ceiling' | 'pallet': the inline "+ New …" form open
  const { detail, sel } = useElevEditor()
  const [menu, setMenu] = useState(null)
  const pr = projectOf(T)
  const [pick, setPick] = useState({ ceilingId: null, palletId: null })
  const counts = useMemo(() => { if (!T) return new Map(); const L = bayLedger(objects, gridSize, T); return new Map(legendCounts(objects, T, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays])) }, [objects, gridSize, T])
  const active = T?.types?.length ? typeById(T, activeId) || typeById(T, T.defaultId) || T.types[0] : null
  const entry = useMemo(() => { const used = active ? lengthsByType(objects, T, typeIdAt).get(active.id) || [] : []; const r0 = objects.find(isBeamRack); return used[0] || { beamIn: 96, depthIn: r0?.depthIn ?? 42, pair: r0?.type === 'rack_double_row', flueIn: r0?.flueSpaceIn ?? 9, palletWIn: r0?.palletWIn ?? 40, parentId: r0?.parentId ?? null } }, [objects, T, active])
  const building = useMemo(() => (active ? ceilingFor(T, active, objects, entry.parentId) : null), [T, active, objects, entry])
  // the pallets drawn on a beam: the elevation's own pallet face (Project setup), else the racks'
  const face = active?.palletId ? palletFor(T, active)?.faceIn : null
  const shownEntry = useMemo(() => (face ? { ...entry, palletWIn: face } : entry), [entry, face])
  const rowsSelected = useMemo(() => rowSideCells({ objects, selectedIds, activeBaySelection }).size, [objects, selectedIds, activeBaySelection])
  const tinted = tintOn(T)
  const clickChip = (t) => { useElevTab.setState({ activeId: t.id }); if (rowsSelected && assignSelected(store, t.id)) useElevTab.setState({ made: null }) }
  // the + Add elevation form: a ceiling (none set: 24' assumed) and a pallet, each list ending with "+ New …"
  const pickCeil = pick.ceilingId ?? defaultCeiling(pr)?.id ?? '', pickPal = pick.palletId ?? defaultPallet(pr)?.id ?? ''
  const choose = (key, v) => { if (v === NEW) { setNewForm(key === 'ceilingId' ? 'ceiling' : 'pallet'); return } setNewForm(null); setPick(p => ({ ...p, [key]: v || null })) }
  const madeNew = (key) => (id) => { setNewForm(null); if (id) setPick(p => ({ ...p, [key]: id })) }
  // Create: always visible — the new chip selected, or "Already exists" with that chip highlighted
  const create = () => {
    const pair = { ceilingId: pickCeil || null, palletId: pickPal || null }
    const same = sameBestFit(store.getState().elevations, pair)
    if (same) { useElevTab.setState({ activeId: same.id, adding: false, made: { id: same.id, kind: 'exists', at: Date.now() } }); return }
    const id = addBestFit(store, pair)
    useElevTab.setState(id ? { made: { id, kind: 'new', at: Date.now() } } : { made: { id: null, kind: 'none', at: Date.now() } })
  }
  const madeType = made?.id ? typeById(T, made.id) : null
  const [flash, setFlash] = useState(false)
  useEffect(() => { if (made?.kind !== 'exists') return; setFlash(true); const k = setTimeout(() => setFlash(false), 1600); return () => clearTimeout(k) }, [made])

  return (
    <div aria-label="Elevations" data-pane="open" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* the view */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div role="group" aria-label="View" style={segGroup}>
          {[['front', 'Front'], ['side', 'Side']].map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} style={seg(view === k)} onClick={() => useElevTab.setState({ view: k })}>{label}</button>)}
        </div>
        <div role="group" aria-label="Drawing detail" style={segGroup}>
          {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={detail === k} style={seg(detail === k)} onClick={() => setPane({ detail: k })}>{label}</button>)}
        </div>
        {active && <span style={{ ...S.note, marginLeft: 'auto' }}>beam {ftInDash(entry.beamIn)}</span>}
      </div>
      {active && building?.assumed && (
        <div role="note" style={{ ...S.note, padding: '0 12px 8px', color: 'var(--elev-clr, #A8341C)' }}>
          Clear height not set — elevations assume {ASSUMED_FT}'. Set it in <button type="button" style={S.link} onClick={() => openSetup('settings')}>Project settings</button>.
        </div>
      )}

      {/* the drawing: most of the space */}
      <div style={{ flex: 1, minHeight: 220, padding: '0 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {active
          ? <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><ElevationDrawing t={active} title={nameOf(T, active)} entry={shownEntry} building={building} sel={sel} sprClr={sprinklerClearance(T)} detail={detail} view={view} fill onCommit={(next) => changeElevation(store, active.id, next)} /></div>
          : <div style={{ ...S.note, padding: 12 }}>No elevation yet — + Add elevation below.</div>}
      </div>

      {/* the elevations */}
      <div role="group" aria-label="Elevation chips" style={{ flexShrink: 0, maxHeight: '38%', overflowY: 'auto', padding: '10px 12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="list" aria-label="Elevation list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(T?.types || []).map(t => {
            const on = active && t.id === active.id, lit = made?.id === t.id
            return (
              <div key={t.id} role="listitem" data-type-id={t.id} aria-selected={on} data-highlight={lit && flash ? 'flash' : lit ? 'made' : undefined} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 8px', borderRadius: 7, cursor: 'pointer', background: on ? 'var(--surface2)' : 'var(--surface)', border: `1px solid ${on ? 'var(--text2)' : 'var(--border)'}`, boxShadow: lit ? `0 0 0 ${flash ? 3 : 2}px var(--pin-accent, #378ADD)` : 'none', transition: 'box-shadow .25s ease' }}>
                <button type="button" aria-label={`${nameOf(T, t)}${rowsSelected ? ' — apply to the selected rows' : ''}`} title={rowsSelected ? 'Apply to the selected rows' : 'Show this elevation'} onClick={() => clickChip(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', fontSize: 12 }}>
                  <span style={{ position: 'relative', width: 12, height: 12, borderRadius: 3, background: 'white', border: '1px solid rgba(0,0,0,0.25)', flexShrink: 0 }}><span style={{ position: 'absolute', inset: 0, borderRadius: 2, background: tint(t.color), opacity: tinted ? ELEV_FILL_OPACITY : 0.25 }} /></span>
                  <span>{nameOf(T, t)}</span>
                  {t.id === T.defaultId && <Star size={10} aria-label="default" style={{ color: 'var(--text3)' }} />}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text3)' }}>{counts.get(t.id) || 0}</span>
                </button>
                <button type="button" aria-label={`${nameOf(T, t)} menu`} onClick={() => setMenu(m => (m === t.id ? null : t.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}><MoreHorizontal size={14} /></button>
                {menu === t.id && <ChipMenu t={t} T={T} onClose={() => setMenu(null)} />}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" aria-pressed={adding} disabled={!pr} onClick={() => { setNewForm(null); useElevTab.setState({ adding: !adding }) }} style={{ ...S.btn, opacity: pr ? 1 : 0.45 }}><Plus size={12} /> Add elevation</button>
          <button type="button" disabled={!rowsSelected || !active} onClick={() => active && assignSelected(store, active.id)} style={{ ...S.btn, opacity: rowsSelected && active ? 1 : 0.45 }}>Apply to selected rows</button>
          <button type="button" onClick={() => removeUnused(store)} style={S.btn} title="Remove the elevations no bay uses">Remove unused</button>
        </div>
        {adding && pr && (
          <div role="group" aria-label="Add elevation" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={S.note}>Ceiling</span>
                <select aria-label="New elevation ceiling" value={newForm === 'ceiling' ? NEW : pickCeil} style={S.sel} onChange={e => choose('ceilingId', e.target.value)}>
                  {!pr.ceilings.length && <option value="">Not set ({ASSUMED_FT}')</option>}
                  {pr.ceilings.map(c => <option key={c.id} value={c.id}>{c.name}{c.clearHeightIn > 0 ? '' : ` (${ASSUMED_FT}' assumed)`}</option>)}
                  <option value={NEW}>+ New ceiling height…</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={S.note}>Pallet</span>
                <select aria-label="New elevation pallet" value={newForm === 'pallet' ? NEW : pickPal} style={S.sel} onChange={e => choose('palletId', e.target.value)}>
                  {pr.pallets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value={NEW}>+ New pallet size…</option>
                </select>
              </label>
              <button type="button" disabled={!!newForm} style={{ ...S.btn, ...solid, opacity: newForm ? 0.45 : 1 }} onClick={create}>Create</button>
              <button type="button" style={S.btn} onClick={() => { setNewForm(null); useElevTab.setState({ adding: false }) }}>Cancel</button>
            </div>
            {newForm === 'ceiling' && <NewCeiling onDone={madeNew('ceilingId')} />}
            {newForm === 'pallet' && <NewPallet onDone={madeNew('palletId')} />}
          </div>
        )}
        {made && (
          <div role="status" aria-label="Elevation feedback" style={{ ...S.note, color: 'var(--text)' }}>
            {made.kind === 'none' ? 'Nothing fits that ceiling with that pallet.'
              : <><strong>{made.kind === 'exists' ? 'Already exists' : 'Created'}: {madeType ? nameOf(T, madeType) : ''}</strong>. Select rows on the plan, then click this elevation.</>}
          </div>
        )}
        {(rowsSelected || !made || made.kind === 'none') && <div style={S.note}>{rowsSelected ? `${rowsSelected} row${rowsSelected === 1 ? '' : 's'} selected — click an elevation to apply it.` : 'Select rows on the plan, then click an elevation to apply it.'}</div>}
      </div>
    </div>
  )
}
