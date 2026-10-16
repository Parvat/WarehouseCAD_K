import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, MoreHorizontal, Star } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, legendCounts, sprinklerClearance, isBeamRack } from '../../utils/elevations'
import { lengthsByType, ftInDash } from '../../utils/elevationDrawing'
import { tint, tintOn, ELEV_FILL_OPACITY } from '../../utils/elevationDraw'
import { useElevEditor, setPane } from '../../utils/elevEditor'
import { useElevTab, nameOf, addBestFit, assignSelected, changeElevation, renameElevation, recolorElevation, duplicateElevation, deleteElevation, defaultElevation, setPairing, removeUnused, rowSideCells } from '../../utils/elevTab'
import { projectOf, defaultCeiling, defaultPallet, ceilingFor, palletFor, openSetup } from '../../utils/project'
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

export function ElevationsTab() {
  const { objects, T, gridSize, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gridSize: s.gridSize || 40, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const { activeId, view, adding } = useElevTab()
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
  const hasCeiling = !!defaultCeiling(pr)
  const clickChip = (t) => { useElevTab.setState({ activeId: t.id }); if (rowsSelected) assignSelected(store, t.id) }

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
      {!hasCeiling && (
        <div role="alert" style={{ ...S.note, padding: '0 12px 8px', color: 'var(--elev-clr, #A8341C)' }}>
          Add a ceiling height in <button type="button" style={S.link} onClick={() => openSetup('settings')}>Project setup</button>.
        </div>
      )}

      {/* the drawing: most of the space */}
      <div style={{ flex: 1, minHeight: 220, padding: '0 8px', display: 'flex', flexDirection: 'column' }}>
        {active
          ? <div style={{ flex: 1, minHeight: 0 }}><ElevationDrawing t={active} title={nameOf(T, active)} entry={shownEntry} building={building} sel={sel} sprClr={sprinklerClearance(T)} detail={detail} view={view} fill onCommit={(next) => changeElevation(store, active.id, next)} /></div>
          : <div style={{ ...S.note, padding: 12 }}>{hasCeiling ? 'No elevation yet — + Add one below.' : 'No elevation yet.'}</div>}
      </div>

      {/* the elevations */}
      <div role="group" aria-label="Elevation chips" style={{ flexShrink: 0, maxHeight: '38%', overflowY: 'auto', padding: '10px 12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="list" aria-label="Elevation list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(T?.types || []).map(t => {
            const on = active && t.id === active.id
            return (
              <div key={t.id} role="listitem" data-type-id={t.id} aria-selected={on} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 8px', borderRadius: 7, cursor: 'pointer', background: on ? 'var(--surface2)' : 'var(--surface)', border: `1px solid ${on ? 'var(--text2)' : 'var(--border)'}` }}>
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
          <button type="button" aria-pressed={adding} disabled={!hasCeiling} onClick={() => useElevTab.setState({ adding: !adding })} style={{ ...S.btn, opacity: hasCeiling ? 1 : 0.45 }}><Plus size={12} /> Add</button>
          <button type="button" disabled={!rowsSelected || !active} onClick={() => active && assignSelected(store, active.id)} style={{ ...S.btn, opacity: rowsSelected && active ? 1 : 0.45 }}>Apply to selected rows</button>
          <button type="button" onClick={() => removeUnused(store)} style={S.btn} title="Remove the elevations no bay uses">Remove unused</button>
        </div>
        {adding && hasCeiling && (
          <div role="group" aria-label="Add elevation" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select aria-label="New elevation ceiling" value={pick.ceilingId || defaultCeiling(pr)?.id} style={S.sel} onChange={e => setPick(p => ({ ...p, ceilingId: e.target.value }))}>{pr.ceilings.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select aria-label="New elevation pallet" value={pick.palletId || defaultPallet(pr)?.id} style={S.sel} onChange={e => setPick(p => ({ ...p, palletId: e.target.value }))}>{pr.pallets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button type="button" style={{ ...S.btn, background: 'var(--accent-solid, #0B101D)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' }} onClick={() => addBestFit(store, { ceilingId: pick.ceilingId || defaultCeiling(pr)?.id, palletId: pick.palletId || defaultPallet(pr)?.id })}>Create best fit</button>
          </div>
        )}
        <div style={S.note}>{rowsSelected ? `${rowsSelected} row${rowsSelected === 1 ? '' : 's'} selected — click an elevation to apply it.` : 'Select rows on the plan, then click an elevation to apply it.'}</div>
      </div>
    </div>
  )
}
