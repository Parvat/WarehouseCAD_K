import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, MoreHorizontal, Star, Pencil } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, legendCounts, sprinklerClearance, isBeamRack, beamFace } from '../../utils/elevations'
import { lengthsByType, ftInDash } from '../../utils/elevationDrawing'
import { tint, tintOn, ELEV_FILL_OPACITY } from '../../utils/elevationDraw'
import { useElevEditor, setPane } from '../../utils/elevEditor'
import { useElevTab, nameOf, assignSelected, recolorElevation, duplicateElevation, deleteElevation, defaultElevation, removeUnused, rowSideCells, startNew, startEdit, editDraft, cancelEdit, saveEdit } from '../../utils/elevTab'
import { projectOf, ceilingFor, palletFor, openSetup, addCeiling, addPallet, palletName, PALLET_DEFAULT, ASSUMED_CLEAR_IN } from '../../utils/project'
import { bayLedger } from '../../utils/bayLedger'
import { ElevationDrawing } from './ElevationDrawing'

/* ── The Elevations tab (ELEVATIONS_PLAN.md §3) — next to Properties; the panel widens on it ─────────────────────────
   Two states, never shown together:
   - the LIST — choosing and assigning: Front | Side and Simple | Detailed, the active elevation's drawing (read-only:
     zoom, pan, Fit, full screen), the beam length it is drawn at (read-only), then the chips (colour, name, bay count,
     ✎ to change it, ⋯ for colour / duplicate / default / delete), + Add elevation, Apply to selected rows, Remove
     unused. Assigning: select rows on the canvas, then click a chip — one undo step.
   - the EDITOR — making and changing one elevation, in the list's order: the view and the drawing on top, the fields
     below where the chips are: Ceiling ▾ and Pallet ▾ (each ending "+ New …", saved to the
     project and picked), Beam face, the beam length (read-only: the selected row's, else the most common among its
     bays — no beam-length control here), the drawing (the best fit to start; levels edited on it as before), then
     Save / Cancel. Nothing is written until Save (one undo step); Save returns to the list with the chip picked and
     the hint "Select rows, then click this elevation". */

const store = useCanvasStore
const S = {
  note: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 },
  label: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 2, fontSize: 11.5, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  sel: { minWidth: 0, borderRadius: 2, padding: '4px 6px', height: 28, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text)' },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 'inherit' },
}
const seg = (on) => ({ padding: '3px 10px', fontSize: 11, borderRadius: 2, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })
const segGroup = { display: 'flex', gap: 2, padding: 2, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface2)' }
const solid = { background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' }
const NEW = '__new'
const ASSUMED_FT = Math.round(ASSUMED_CLEAR_IN / 12)
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

/** The beam length an elevation is drawn at (read-only) → { entry, from }: the selected row's own (its most common
 *  bay), else the most common length among the elevation's bays, else 8'. */
function beamEntry(objects, T, t, selectedIds) {
  const r0 = objects.find(isBeamRack)
  const base = { beamIn: 96, depthIn: r0?.depthIn ?? 42, pair: r0?.type === 'rack_double_row', flueIn: r0?.flueSpaceIn ?? 9, palletWIn: r0?.palletWIn ?? 40, parentId: r0?.parentId ?? null }
  const sel = objects.find(o => o.id === selectedIds?.[0] && isBeamRack(o))
  if (sel?.beams?.length) {
    const n = new Map(); for (const b of sel.beams) n.set(b, (n.get(b) || 0) + 1)
    const beamIn = [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    return { entry: { beamIn, depthIn: sel.depthIn ?? 42, pair: sel.type === 'rack_double_row', flueIn: sel.flueSpaceIn ?? 9, palletWIn: sel.palletWIn ?? 40, parentId: sel.parentId ?? null }, from: 'the selected row' }
  }
  const used = t ? lengthsByType(objects, T, typeIdAt).get(t.id) || [] : []
  return used[0] ? { entry: used[0], from: 'the most common among its bays' } : { entry: base, from: null }
}
/** The view switches over a drawing. */
function ViewBar({ right }) {
  const { view } = useElevTab(), { detail } = useElevEditor()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexWrap: 'wrap', flexShrink: 0 }}>
      <div role="group" aria-label="View" style={segGroup}>
        {[['front', 'Front'], ['side', 'Side']].map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} style={seg(view === k)} onClick={() => useElevTab.setState({ view: k })}>{label}</button>)}
      </div>
      <div role="group" aria-label="Drawing detail" style={segGroup}>
        {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={detail === k} style={seg(detail === k)} onClick={() => setPane({ detail: k })}>{label}</button>)}
      </div>
      {right}
    </div>
  )
}
const BeamLength = ({ entry, from }) => <span aria-label="Beam length" title={from ? `Beam length: ${from} (set on the rack, not here)` : 'Beam length (set on the rack, not here)'} style={{ ...S.note, marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>Beam {ftInDash(entry.beamIn)}</span>
const AssumedNote = () => (
  <div role="note" style={{ ...S.note, padding: '0 12px 8px', color: 'var(--elev-clr, #A8341C)' }}>
    Clear height not set — elevations assume {ASSUMED_FT}'. Set it in <button type="button" style={S.link} onClick={() => openSetup('settings')}>Project settings</button>.
  </div>
)

/** A chip's menu (choosing only): colour, duplicate, set default, delete. Changing an elevation is the editor's (✎). */
function ChipMenu({ t, T, onClose }) {
  const ref = useRef(null)
  useEffect(() => { const d = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }; window.addEventListener('pointerdown', d, true); return () => window.removeEventListener('pointerdown', d, true) }, [onClose])
  return (
    <div ref={ref} role="menu" aria-label={`${nameOf(T, t)} menu`} style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 20, width: 236, padding: 10, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 6px 16px rgba(26,29,27,.13)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...S.note, width: 52 }}>Colour</span><input aria-label="Elevation colour" type="color" value={tint(t.color)} onChange={e => recolorElevation(store, t.id, e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" role="menuitem" style={S.btn} onClick={() => { duplicateElevation(store, t.id); onClose() }}>Duplicate</button>
        <button type="button" role="menuitem" style={{ ...S.btn, opacity: t.id === T.defaultId ? 0.45 : 1 }} disabled={t.id === T.defaultId} onClick={() => { defaultElevation(store, t.id); onClose() }}><Star size={11} /> Set default</button>
        <button type="button" role="menuitem" style={{ ...S.btn, color: 'var(--red)', opacity: T.types.length <= 1 ? 0.45 : 1 }} disabled={T.types.length <= 1} onClick={() => { deleteElevation(store, t.id); onClose() }}>Delete</button>
      </div>
    </div>
  )
}

/** "+ New ceiling height…": name, clear height, sprinkler height → saved to the project (one undo step), then picked. */
function NewCeiling({ onDone }) {
  const [v, setV] = useState({ name: '', clearFt: '', sprFt: '' })
  const save = () => { const id = addCeiling(store, { name: v.name, clearHeightIn: num(v.clearFt) && Math.round(num(v.clearFt) * 12), sprinklerIn: num(v.sprFt) && Math.round(num(v.sprFt) * 12) }); onDone(id) }
  return (
    <div role="group" aria-label="New ceiling height" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', padding: 8, borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 90px' }}><span style={S.label}>Name</span><input aria-label="New ceiling name" autoFocus value={v.name} placeholder="Mezzanine" style={S.sel} onChange={e => setV(x => ({ ...x, name: e.target.value }))} /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 70px' }}><span style={S.label}>Clear ft</span><input aria-label="New ceiling clear height (ft)" type="number" min={0} step={0.5} value={v.clearFt} placeholder={`${ASSUMED_FT}`} style={S.sel} onChange={e => setV(x => ({ ...x, clearFt: e.target.value }))} /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 70px' }}><span style={S.label}>Sprinkler ft</span><input aria-label="New ceiling sprinkler height (ft)" type="number" min={0} step={0.5} value={v.sprFt} placeholder="optional" style={S.sel} onChange={e => setV(x => ({ ...x, sprFt: e.target.value }))} /></label>
      <button type="button" style={{ ...S.btn, ...solid }} onClick={save}>Save</button>
      <button type="button" style={S.btn} onClick={() => onDone(null)}>Cancel</button>
    </div>
  )
}
/** "+ New pallet size…": face, depth, height, weight (named from its size) → saved to the project, then picked. */
function NewPallet({ onDone }) {
  const [v, setV] = useState({ faceIn: PALLET_DEFAULT.faceIn, depthIn: PALLET_DEFAULT.depthIn, heightIn: PALLET_DEFAULT.heightIn, weightLb: PALLET_DEFAULT.weightLb })
  const fields = [['faceIn', 'Face (in)'], ['depthIn', 'Depth (in)'], ['heightIn', 'Height (in)'], ['weightLb', 'Weight (lb)']]
  const save = () => { const id = addPallet(store, Object.fromEntries(fields.map(([k]) => [k, num(v[k])]))); onDone(id) }
  return (
    <div role="group" aria-label="New pallet size" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', padding: 8, borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      {fields.map(([k, label], i) => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 58px' }}><span style={S.label}>{label}</span><input aria-label={`New pallet ${label.toLowerCase()}`} autoFocus={i === 0} type="number" min={0} value={v[k]} style={S.sel} onChange={e => setV(x => ({ ...x, [k]: e.target.value }))} /></label>
      ))}
      <span style={{ ...S.note, alignSelf: 'center' }}>{num(v.depthIn) && num(v.faceIn) ? palletName({ depthIn: num(v.depthIn), faceIn: num(v.faceIn) }) : ''}</span>
      <button type="button" style={{ ...S.btn, ...solid }} onClick={save}>Save</button>
      <button type="button" style={S.btn} onClick={() => onDone(null)}>Cancel</button>
    </div>
  )
}

export function ElevationsTab() {
  const editing = useElevTab(s => s.editing)
  return editing ? <Editor e={editing} /> : <List />
}

/* ── the list: choosing and assigning ────────────────────────────────────────────────────────────────────────────── */
function List() {
  const { objects, T, gridSize, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gridSize: s.gridSize || 40, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const { activeId, view, made } = useElevTab()
  const { detail } = useElevEditor()
  const [menu, setMenu] = useState(null)
  const pr = projectOf(T)
  const counts = useMemo(() => { if (!T) return new Map(); const L = bayLedger(objects, gridSize, T); return new Map(legendCounts(objects, T, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays])) }, [objects, gridSize, T])
  const active = T?.types?.length ? typeById(T, activeId) || typeById(T, T.defaultId) || T.types[0] : null
  const { entry, from } = useMemo(() => beamEntry(objects, T, active, selectedIds), [objects, T, active, selectedIds])
  const building = useMemo(() => (active ? ceilingFor(T, active, objects, entry.parentId) : null), [T, active, objects, entry])
  // the pallets drawn on a beam: the elevation's own pallet face (Project setup), else the racks'
  const face = active?.palletId ? palletFor(T, active)?.faceIn : null
  const shownEntry = useMemo(() => (face ? { ...entry, palletWIn: face } : entry), [entry, face])
  const rowsSelected = useMemo(() => rowSideCells({ objects, selectedIds, activeBaySelection }).size, [objects, selectedIds, activeBaySelection])
  const tinted = tintOn(T)
  const clickChip = (t) => { useElevTab.setState({ activeId: t.id }); if (rowsSelected && assignSelected(store, t.id)) useElevTab.setState({ made: null }) }
  const madeType = made?.id ? typeById(T, made.id) : null
  const [flash, setFlash] = useState(false)
  useEffect(() => { if (!made?.id) return; setFlash(true); const k = setTimeout(() => setFlash(false), 1600); return () => clearTimeout(k) }, [made])

  return (
    <div aria-label="Elevations" data-mode="list" data-pane="open" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ViewBar right={active && <BeamLength entry={entry} from={from} />} />
      {active && building?.assumed && <AssumedNote />}

      {/* the drawing (read-only here): most of the space */}
      <div style={{ flex: 1, minHeight: 220, padding: '0 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {active
          ? <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><ElevationDrawing t={active} title={nameOf(T, active)} entry={shownEntry} building={building} sel={null} sprClr={sprinklerClearance(T)} detail={detail} view={view} fill readOnly onCommit={() => {}} /></div>
          : <div style={{ ...S.note, padding: 12 }}>No elevation yet — + Add elevation below.</div>}
      </div>

      {/* the elevations */}
      <div role="group" aria-label="Elevation chips" style={{ flexShrink: 0, maxHeight: '38%', overflowY: 'auto', padding: '10px 12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="list" aria-label="Elevation list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(T?.types || []).map(t => {
            const on = active && t.id === active.id, lit = made?.id === t.id
            return (
              <div key={t.id} role="listitem" data-type-id={t.id} aria-selected={on} data-highlight={lit && flash ? 'flash' : lit ? 'made' : undefined} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 8px', borderRadius: 4, cursor: 'pointer', background: on ? 'var(--surface2)' : 'var(--surface)', border: `1px solid ${on ? 'var(--text2)' : 'var(--border)'}`, boxShadow: lit ? `0 0 0 ${flash ? 3 : 2}px var(--pin-accent, #378ADD)` : 'none', transition: 'box-shadow .25s ease' }}>
                <button type="button" aria-label={`${nameOf(T, t)}${rowsSelected ? ' — apply to the selected rows' : ''}`} title={rowsSelected ? 'Apply to the selected rows' : 'Show this elevation'} onClick={() => clickChip(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', fontSize: 12 }}>
                  <span style={{ position: 'relative', width: 12, height: 12, borderRadius: 2, background: 'white', border: '1px solid rgba(0,0,0,0.25)', flexShrink: 0 }}><span style={{ position: 'absolute', inset: 0, borderRadius: 1, background: tint(t.color), opacity: tinted ? ELEV_FILL_OPACITY : 0.25 }} /></span>
                  <span>{nameOf(T, t)}</span>
                  {t.id === T.defaultId && <Star size={10} aria-label="default" style={{ color: 'var(--text3)' }} />}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text3)' }}>{counts.get(t.id) || 0}</span>
                </button>
                <button type="button" aria-label={`Edit ${nameOf(T, t)}`} title="Change this elevation" onClick={() => startEdit(store, t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}><Pencil size={12} /></button>
                <button type="button" aria-label={`${nameOf(T, t)} menu`} onClick={() => setMenu(m => (m === t.id ? null : t.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}><MoreHorizontal size={14} /></button>
                {menu === t.id && <ChipMenu t={t} T={T} onClose={() => setMenu(null)} />}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={!pr} onClick={() => startNew(store)} style={{ ...S.btn, opacity: pr ? 1 : 0.45 }}><Plus size={12} /> Add elevation</button>
          <button type="button" disabled={!rowsSelected || !active} onClick={() => active && assignSelected(store, active.id) && useElevTab.setState({ made: null })} style={{ ...S.btn, opacity: rowsSelected && active ? 1 : 0.45 }}>Apply to selected rows</button>
          <button type="button" onClick={() => removeUnused(store)} style={S.btn} title="Remove the elevations no bay uses">Remove unused</button>
        </div>
        {made && madeType && (
          <div role="status" aria-label="Elevation feedback" style={{ ...S.note, color: 'var(--text)' }}>
            <strong>{made.kind === 'exists' ? 'Already exists' : made.kind === 'saved' ? 'Saved' : 'Created'}: {nameOf(T, madeType)}</strong>. Select rows, then click this elevation.
          </div>
        )}
        {(rowsSelected || !made) && <div style={S.note}>{rowsSelected ? `${rowsSelected} row${rowsSelected === 1 ? '' : 's'} selected — click an elevation to apply it.` : 'Select rows on the plan, then click an elevation to apply it.'}</div>}
      </div>
    </div>
  )
}

/* ── the editor: making and changing one elevation ───────────────────────────────────────────────────────────────── */
function Editor({ e }) {
  const { objects, T, selectedIds } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, selectedIds: s.selectedIds })))
  const { view } = useElevTab()
  const { detail, sel } = useElevEditor()
  const pr = projectOf(T), d = e.draft
  const [newForm, setNewForm] = useState(null)        // 'ceiling' | 'pallet': the inline "+ New …" form open
  const editingType = e.id ? typeById(T, e.id) : null
  const { entry, from } = useMemo(() => beamEntry(objects, T, editingType || d, selectedIds), [objects, T, editingType, d, selectedIds])
  const building = useMemo(() => ceilingFor(T, d, objects, entry.parentId), [T, d, objects, entry])
  const pal = palletFor(T, d)
  const shownEntry = useMemo(() => (pal?.faceIn ? { ...entry, palletWIn: pal.faceIn } : entry), [entry, pal])
  const choose = (key, v) => { if (v === NEW) { setNewForm(key === 'ceilingId' ? 'ceiling' : 'pallet'); return } setNewForm(null); editDraft(store, { [key]: v || null }) }
  const madeNew = (key) => (id) => { setNewForm(null); if (id) editDraft(store, { [key]: id }) }
  const pairing = nameOf(T, { ...d, named: false, name: '' })
  const [name, setName] = useState(d.named ? d.name : '')
  useEffect(() => { const k = (ev) => { if (ev.key === 'Escape' && !newForm && !sel) cancelEdit() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [newForm, sel])
  const save = () => { editDraft(store, { name, named: !!name.trim() }); saveEdit(store) }

  // opening the editor: its fields in view (the panel scrolled to them — never a jump back to the top)
  const bottom = useRef(null)
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [])

  return (
    <div aria-label="Elevation editor" data-mode="editor" data-pane="open" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* the list's order: the view and the drawing on top… */}
      <ViewBar right={<BeamLength entry={entry} from={from} />} />
      {/* the drawing: levels edited on it as before — into the draft */}
      <div style={{ flex: 1, minHeight: 180, padding: '0 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ElevationDrawing t={{ ...d, id: e.id || 'draft' }} title={name || pairing} entry={shownEntry} building={building} sel={sel} sprClr={sprinklerClearance(T)} detail={detail} view={view} fill onCommit={(next) => editDraft(store, { ...next, id: d.id }, { fromDrawing: true })} />
        </div>
      </div>

      {/* …the fields below, where the list has its chips: ceiling, pallet, beam face, name, the note, Save / Cancel */}
      <div ref={bottom} role="group" aria-label="Elevation settings" style={{ flexShrink: 0, maxHeight: '46%', overflowY: 'auto', padding: '10px 12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text)' }}>{e.id ? 'Edit elevation' : 'New elevation'}</span>
          <span style={S.note}>{e.id ? nameOf(T, editingType || d) : 'the best fit to start — adjust it on the drawing'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.label}>Ceiling</span>
            <select aria-label="Elevation ceiling" value={newForm === 'ceiling' ? NEW : d.ceilingId || ''} style={S.sel} onChange={ev => choose('ceilingId', ev.target.value)}>
              {!pr?.ceilings?.length && <option value="">Not set ({ASSUMED_FT}')</option>}
              {(pr?.ceilings || []).map(c => <option key={c.id} value={c.id}>{c.name}{c.clearHeightIn > 0 ? '' : ` (${ASSUMED_FT}' assumed)`}</option>)}
              <option value={NEW}>+ New ceiling height…</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.label}>Pallet</span>
            <select aria-label="Elevation pallet" value={newForm === 'pallet' ? NEW : d.palletId || ''} style={S.sel} onChange={ev => choose('palletId', ev.target.value)}>
              {!d.palletId && <option value="">—</option>}
              {(pr?.pallets || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={NEW}>+ New pallet size…</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.label}>Beam face (in)</span>
            <input aria-label="Beam face (in)" type="number" min={1} step={0.5} value={beamFace(d)} style={{ ...S.sel, fontFamily: 'var(--font-mono)' }} onChange={ev => { const v = num(ev.target.value); if (v) editDraft(store, { beamFaceIn: v }) }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={S.label}>Name</span>
            <input aria-label="Elevation name" value={name} placeholder={pairing} style={S.sel} onChange={ev => setName(ev.target.value)} />
          </label>
        </div>
        {newForm === 'ceiling' && <NewCeiling onDone={madeNew('ceilingId')} />}
        {newForm === 'pallet' && <NewPallet onDone={madeNew('palletId')} />}
        {building?.assumed && <div style={{ margin: '0 -12px -8px' }}><AssumedNote /></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          <button type="button" disabled={!!newForm} onClick={save} style={{ ...S.btn, ...solid, opacity: newForm ? 0.45 : 1 }}>Save</button>
          <button type="button" onClick={cancelEdit} style={S.btn}>Cancel</button>
          <span style={{ ...S.note, marginLeft: 'auto' }}>{d.levels.length} level{d.levels.length === 1 ? '' : 's'} · upright {ftInDash(d.uprightHeightIn)}</span>
        </div>
      </div>
    </div>
  )
}
