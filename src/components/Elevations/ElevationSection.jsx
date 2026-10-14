import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, beamFace, holePitch, sprinklerClearance } from '../../utils/elevations'
import { buildingOf, ftInDash } from '../../utils/elevationDrawing'
import { useElevEditor, setPane, removeLevel, setField } from '../../utils/elevEditor'
import { selectionCells, cellTypes, cellsOfType, drawEntry, commitAssign, commitDesign } from '../../utils/elevSelection'
import { ElevationDrawing } from './ElevationDrawing'

/* ── Elevation — the Properties panel's section for the selected racks and bays ─────────────────────────────────────
   Driven by the selection (utils/elevSelection.js): a type dropdown (choosing one sets it on every selected bay-side —
   ONE undo step), small tabs when the selection carries several types (each with its bay count), the drawing of the
   type shown at the selected bay's beam length (or the most common one), and a read-only line of what the rack's own
   properties give it — beam, depth, pallet, clearance. Editing the drawing saves the new vertical design for the
   selection only: an existing type of that design, or a new one named by its level count ("4 levels", "4 levels ·
   custom"), said in the hint line. Nothing here changes the floor plan. Pallet height, clearance, beam face and hole
   pitch are under Details — the same save. Simple / Detailed is remembered per browser; the PDF prints it. */

const store = useCanvasStore
const seg = (on) => ({ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })
const segGroup = { display: 'flex', gap: 2, padding: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }
const F = {
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 86, flexShrink: 0, whiteSpace: 'nowrap' },
  input: { flex: 1, minWidth: 0, borderRadius: 6, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none', transition: 'border-color 0.15s' },
  unit: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 14 },
  note: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', lineHeight: 1.45 },
}

/** One field, Properties style: written on Enter / blur. */
export function Field({ label, value, onCommit, aria, unit = 'in', title }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (String(text).trim() !== '' && Number.isFinite(v) && v >= 0 && v !== value) onCommit(v); else setText(String(value)) }
  return (
    <label style={F.row} title={title}>
      <span style={F.label}>{label}</span>
      <input aria-label={aria} type="number" min={0} value={text} style={F.input} onChange={e => setText(e.target.value)}
        onFocus={e => { e.target.style.borderColor = 'var(--accent)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; done() }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      <span style={F.unit}>{unit}</span>
    </label>
  )
}

/** A collapsible group inside a panel section: a tracked-caps header with its chevron. */
export function Fold({ title, defaultOpen = true, children, aria }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div role="group" aria-label={aria || title} style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={11} style={{ color: 'var(--text3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' }}>{title}</span>
      </button>
      {open && children}
    </div>
  )
}

/** `extra`: rendered after the read-only line (the rack panel's Levels field). */
export function ElevationSection({ extra = null }) {
  const { objects, T, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const { typeId, sel, detail, hint } = useElevEditor()
  const cells = useMemo(() => selectionCells({ objects, selectedIds, activeBaySelection }), [objects, selectedIds, activeBaySelection])
  const key = useMemo(() => JSON.stringify([...cells]), [cells])
  // a new selection: no beam picked, no hint from the last one
  useEffect(() => { setPane({ sel: null, hint: null }) }, [selectedIds, activeBaySelection])
  const types = useMemo(() => (T ? cellTypes(objects, T, cells) : []), [objects, T, key])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!cells.size || !T || !types.length) return null
  const shownId = types.some(x => x.id === typeId) ? typeId : types[0].id
  const t = typeById(T, shownId)
  if (!t) return null
  const tabCells = types.length > 1 ? cellsOfType(objects, T, cells, shownId) : cells
  const entry = drawEntry(objects, tabCells)
  if (!entry) return null
  const building = buildingOf(objects, entry.parentId)
  const onCommit = (next) => {
    const r = commitDesign(store, tabCells, next)
    if (!r) return
    setPane({ typeId: r.id, sel: null, hint: r.created ? (r.custom ? `Saved as "${r.name}" — non-standard spacing, its own type` : `Saved as "${r.name}"`) : `Now "${r.name}"` })
  }
  const pallet = t.levels[0]?.palletHeightIn ?? 48
  return (
    <div aria-label="Elevation editor" data-pane="open" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...F.label, width: 'auto' }}>Type</span>
        <select aria-label="Elevation type" value={types.length > 1 ? '' : shownId} title="Sets this type on every selected bay"
          onChange={e => { if (e.target.value && commitAssign(store, cells, e.target.value)) setPane({ typeId: e.target.value, hint: null, sel: null }) }}
          style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)' }}>
          {types.length > 1 && <option value="">Mixed — set all to…</option>}
          {T.types.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <div role="group" aria-label="Drawing detail" style={segGroup}>
          {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={detail === k} style={seg(detail === k)} onClick={() => setPane({ detail: k })}>{label}</button>)}
        </div>
      </div>
      {/* the selection carries several types: one tab each, with its bays */}
      {types.length > 1 && (
        <div role="tablist" aria-label="Types in the selection" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {types.map(x => { const tt = typeById(T, x.id), on = x.id === shownId; return (
            <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => setPane({ typeId: x.id, sel: null, hint: null })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, border: `1px solid ${on ? 'var(--text2)' : 'var(--border)'}`, background: on ? 'var(--surface2)' : 'transparent', color: on ? 'var(--text)' : 'var(--text2)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: tt?.color || '#ccc', border: '1px solid rgba(0,0,0,0.25)' }} />
              {tt?.name || x.id}<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{x.bays}</span>
            </button>) })}
        </div>
      )}
      {hint && <div role="status" style={{ ...F.note, color: 'var(--text2)' }}>{hint}</div>}
      {(!building || !building.clearHeightIn || !building.sprinklerIn) && (
        <div style={F.note}>{!building ? 'No clear height or sprinkler height' : !building.clearHeightIn ? 'No clear height' : 'No sprinkler height'} — set {!building ? 'them' : 'it'} in the building's properties to draw {!building ? 'them' : 'it'} here.</div>
      )}
      <ElevationDrawing t={t} entry={entry} building={building} sel={sel} sprClr={sprinklerClearance(T)} detail={detail} onCommit={onCommit} />
      {sel != null && <button type="button" aria-label="Remove level" title="Remove the selected beam's level (Delete)" onClick={() => { onCommit(removeLevel(t, sel)); setPane({ sel: null }) }}
        style={{ alignSelf: 'flex-start', padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid var(--red-bdr, #e8b4ae)', background: 'var(--red-dim, #fdecea)', color: 'var(--red, #c0392b)' }}>Remove level</button>}
      {/* what the rack's own properties give the drawing — set in Bays and Rack, or under Details */}
      <div aria-label="Elevation inputs" style={{ ...F.note, color: 'var(--text2)' }}>
        Beam {ftInDash(entry.beamIn)} · Depth {ftInDash(entry.depthIn)} · Pallet {ftInDash(pallet)} · Clearance {ftInDash(t.clearanceIn ?? 6)}
      </div>
      {extra}
      <Fold title="Details" defaultOpen={false} aria="Elevation details">
        <Field label="Pallet height" aria="Pallet height" value={pallet} onCommit={v => onCommit(setField(t, 'palletHeightIn', v))} />
        <Field label="Clearance" aria="Clearance" value={t.clearanceIn ?? 6} onCommit={v => onCommit(setField(t, 'clearanceIn', v))} />
        <Field label="Beam face" aria="Beam face height" value={beamFace(t)} onCommit={v => onCommit(setField(t, 'beamFaceIn', v))} />
        <Field label="Hole pitch" aria="Hole pitch" value={holePitch(t)} onCommit={v => onCommit(setField(t, 'holePitchIn', v))} />
        <div style={F.note}>For the selected bays only — saved as a type of that design. Sprinkler clearance is the building's.</div>
      </Fold>
    </div>
  )
}
