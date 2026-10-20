import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, MoreHorizontal, Pencil, Maximize2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, legendCounts, sprinklerClearance, isBeamRack, beamFace, sidesOf, frameDepthNote, frameNeededFor } from '../../utils/elevations'
import { lengthsByType, ftInDash } from '../../utils/elevationDrawing'
import { positionsPerBeam } from '../../utils/palletFit'
import { tint, tintOn, ELEV_FILL_OPACITY } from '../../utils/elevationDraw'
import { useElevEditor, setPane } from '../../utils/elevEditor'
import { useRules } from '../../rules/useRules'
import { useElevTab, nameOf, assignSelected, recolorElevation, duplicateElevation, deleteElevation, defaultElevation, removeUnused, rowSideCells, startNew, startEdit, editDraft, cancelEdit, saveEdit, draftTable, sameElevation, frameDepthFor, deepenRows, NEW_CEILING, NEW_PALLET, useElevSplit, setElevSplit, SPLIT_DEFAULT, SPLIT_MIN, SPLIT_MAX } from '../../utils/elevTab'
import { projectOf, ceilingFor, palletFor, openSetup, previewName, ASSUMED_CLEAR_IN } from '../../utils/project'
import { bayLedger } from '../../utils/bayLedger'
import { ElevationDrawing } from './ElevationDrawing'

/* ── The Elevations tab (ELEVATIONS_PLAN.md §3) — next to Properties; the panel widens on it ─────────────────────────
   1. The TOP never moves or resizes between states: the toolbar (Front | Side · "BEAM 8'-0" · 2P" · Fit · ⤢) and
      the drawing, a fixed-height box on graph paper. The list's drawing is read-only; beams drag only in the editor,
      into its draft — an elevation used by 325 bays changes only through Save.
   2. The BOTTOM, section 02, swaps in place:
      A) the LIST (choosing, assigning): "02 ELEVATIONS IN THIS LAYOUT", a row per elevation (colour · name · bays ·
         DEFAULT · ✎ · ⋯); a click picks it for the drawing; [Apply to N selected rows] [+ New elevation]; a blue note.
      B) the EDITOR ("02 NEW ELEVATION" / "02 EDIT ELEVATION · 325 bays use it"): Name (auto, editable); the Ceiling box
         (a select, "+ New ceiling height" opening Name · Clear height · Sprinkler inside it); the Pallet box (a select,
         "+ New pallet size" opening Face · Depth · Height · Weight inside it, then the amber pallet-depth note); Beam
         face (3 · 4 · 5 · 6 in). Only this form scrolls. The footer is pinned: Cancel and Save elevation — ONE save,
         which also adds a new ceiling or pallet to the project (one undo step). Cancel or Save returns to the list. */

const store = useCanvasStore
const HANDLE = 10                 // the split handle (px)
const FIX_H = 34                  // the drawing's "Set these rows to N in" strip (px)
const S = {
  note: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 },
  label: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: 'var(--font-ui)' },
  ctl: { height: 28, minWidth: 0, borderRadius: 2, padding: '0 8px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-ui)' },
  inner: { height: 24, width: '100%', minWidth: 0, borderRadius: 2, padding: '0 6px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text)', fontFamily: 'var(--font-mono)' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-ui)' },
  primary: { background: 'var(--accent-solid, #14392B)', color: 'var(--accent-fg, #fff)', border: '1px solid transparent' },
  box: { border: '1px solid var(--border)', borderRadius: 4, padding: 10, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 'inherit' },
}
const segGroup = (h) => ({ display: 'flex', height: h, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface2)', overflow: 'hidden' })
const seg = (on) => ({ flex: 1, padding: '0 9px', whiteSpace: 'nowrap', fontSize: 11.5, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: on ? 500 : 400, background: on ? 'var(--accent-solid, #14392B)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })
const BLUE_NOTE = { borderLeft: '3px solid #1B4FD8', background: '#E9EEFB', color: '#1B3A8C', borderRadius: 2, padding: '7px 10px', fontSize: 11.5, lineHeight: 1.45 }
const AMBER_NOTE = { borderLeft: '3px solid #C07A12', background: '#F8F0DF', color: '#6B4A0B', borderRadius: 2, padding: '6px 9px', fontSize: 11, lineHeight: 1.45 }
const ASSUMED_FT = Math.round(ASSUMED_CLEAR_IN / 12)
const BEAM_FACES = [3, 4, 5, 6]

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
/** The racks carrying elevation `id` somewhere. */
const racksUsing = (objects, T, id) => objects.filter(r => isBeamRack(r) && Array.from({ length: sidesOf(r) }, (_, s) => s).some(s => r.beams.some((_, b) => typeIdAt(r, b, s, T) === id)))
/** THEME.md's section header: the number, the title, a muted note, something on the right. */
function Head({ title, note, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--elev-dim, #1B4FD8)' }}>02</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text)' }}>{title}</span>
      {note && <span style={S.note}>{note}</span>}
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}

/** A row's menu (choosing only): colour, duplicate, set default, delete. Portalled to the themed root at the top
 *  z-index and placed from the row's screen rect — over the drawing and everything else, never clipped; below the
 *  row, flipped above it near the bottom of the window (the panel's bottom). */
const MENU_W = 236, MENU_H = 120
function RowMenu({ t, T, anchor, onClose }) {
  const ref = useRef(null)
  const host = document.querySelector('[data-theme]') || document.body
  const r = anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
  const pos = r.bottom + 6 + MENU_H > window.innerHeight - 8 ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }
  useEffect(() => {
    // a press outside closes it (the row's ⋯ toggles it); so do a scroll or a resize (it would float off its row)
    const d = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose() }
    const away = (e) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose() }
    window.addEventListener('pointerdown', d, true); window.addEventListener('scroll', away, true); window.addEventListener('resize', onClose)
    return () => { window.removeEventListener('pointerdown', d, true); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', onClose) }
  }, [onClose, anchor])
  return createPortal(
    <div ref={ref} role="menu" aria-label={`${nameOf(T, t)} menu`} style={{ position: 'fixed', left, ...pos, zIndex: 500, width: MENU_W, padding: 10, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 6px 16px rgba(26,29,27,.13)', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-ui)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...S.note, width: 52 }}>Colour</span><input aria-label="Elevation colour" type="color" value={tint(t.color)} onChange={e => recolorElevation(store, t.id, e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" role="menuitem" style={S.btn} onClick={() => { duplicateElevation(store, t.id); onClose() }}>Duplicate</button>
        <button type="button" role="menuitem" style={{ ...S.btn, opacity: t.id === T.defaultId ? 0.45 : 1 }} disabled={t.id === T.defaultId} onClick={() => { defaultElevation(store, t.id); onClose() }}>Set default</button>
        <button type="button" role="menuitem" style={{ ...S.btn, color: 'var(--red)', opacity: T.types.length <= 1 ? 0.45 : 1 }} disabled={T.types.length <= 1} onClick={() => { deleteElevation(store, t.id); onClose() }}>Delete</button>
      </div>
    </div>,
    host,
  )
}

export function ElevationsTab() {
  const { objects, T, gridSize, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gridSize: s.gridSize || 40, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const { activeId, view, editing: e, made } = useElevTab()
  const { detail, sel } = useElevEditor()
  const counts = useMemo(() => { if (!T) return new Map(); const L = bayLedger(objects, gridSize, T); return new Map(legendCounts(objects, T, (r) => L.racks.get(r.id)?.counted || null).map(x => [x.type.id, x.bays])) }, [objects, gridSize, T])
  const active = T?.types?.length ? typeById(T, activeId) || typeById(T, T.defaultId) || T.types[0] : null
  // what the drawing shows: the editor's draft (with its new ceiling / pallet), else the picked elevation
  const dT = useMemo(() => (e ? draftTable(T, e) : T), [T, e])
  const editingType = e?.id ? typeById(T, e.id) : null
  const shown = e ? { ...e.draft, id: e.id || 'draft' } : active
  const { entry, from } = useMemo(() => beamEntry(objects, T, e ? (editingType || e.draft) : active, selectedIds), [objects, T, e, editingType, active, selectedIds])
  const building = useMemo(() => (shown ? ceilingFor(dT, shown, objects, entry.parentId) : null), [dT, shown, objects, entry])
  const pal = shown ? palletFor(dT, shown) : null
  const shownEntry = useMemo(() => ({ ...entry, ...(pal?.faceIn ? { palletWIn: pal.faceIn } : {}), palletDIn: pal?.depthIn ?? null }), [entry, pal])
  const per = Math.max(0, positionsPerBeam(shownEntry.beamIn, shownEntry.palletWIn))
  const rowsSelected = useMemo(() => rowSideCells({ objects, selectedIds, activeBaySelection }).size, [objects, selectedIds, activeBaySelection])
  // a pallet deeper than the rows' frames: the rows it would go on (the selected ones, else those using the shown
  // elevation) that are too shallow, and the depth the button sets — the pallet less 6", up to the app's frame depths
  const { rules } = useRules()
  const frameDepths = rules?.selective?.frameDepthsIn
  const selRacks = useMemo(() => [...rowSideCells({ objects, selectedIds, activeBaySelection }).keys()].map(id => objects.find(o => o.id === id)).filter(Boolean), [objects, selectedIds, activeBaySelection])
  const usingId = e ? e.id : active?.id
  const fixRows = useMemo(() => {
    if (!(pal?.depthIn > 0)) return []
    const need = frameNeededFor(pal.depthIn), pool = selRacks.length ? selRacks : usingId ? racksUsing(objects, T, usingId) : []
    return pool.filter(r => (r.depthIn ?? 42) < need - 1e-6)
  }, [pal, selRacks, usingId, objects, T])
  const fixTo = pal?.depthIn > 0 ? frameDepthFor(pal.depthIn, frameDepths) : null
  const drawFix = fixRows.length > 0 && !!frameDepthNote(pal.depthIn, shownEntry.depthIn)
  const [fitSignal, setFit] = useState(0), [fullSignal, setFull] = useState(0)
  // the split: the body's height measured, the drawing its share (the same in both states); the handle drags it
  const split = useElevSplit(s => s.split)
  const body = useRef(null)
  const [bodyH, setBodyH] = useState(600)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const read = () => setBodyH(el.clientHeight || 600)
    read()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  const drawH = Math.max(120, Math.round((bodyH - HANDLE) * split))
  const startSplit = (ev) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    const r = body.current.getBoundingClientRect()
    let raf = 0, last = null
    const move = (m) => { last = (m.clientY - r.top - HANDLE / 2) / Math.max(1, r.height - HANDLE); if (!raf) raf = requestAnimationFrame(() => { raf = 0; setElevSplit(last, { save: false }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cancelAnimationFrame(raf); if (last != null) setElevSplit(last) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  return (
    <div aria-label="Elevations" data-mode={e ? 'editor' : 'list'} data-pane="open" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 1. the top — the same in both states */}
      <div role="toolbar" aria-label="Drawing toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', flexShrink: 0 }}>
        <div role="group" aria-label="View" style={{ ...segGroup(26), flexShrink: 0 }}>
          {[['front', 'Front'], ['side', 'Side']].map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} style={seg(view === k)} onClick={() => useElevTab.setState({ view: k })}>{label}</button>)}
        </div>
        <div role="group" aria-label="Drawing detail" style={{ ...segGroup(26), flexShrink: 0 }}>
          {[['simple', 'Simple'], ['detailed', 'Detailed']].map(([k, label]) => <button key={k} type="button" aria-pressed={detail === k} style={seg(detail === k)} onClick={() => setPane({ detail: k })}>{label}</button>)}
        </div>
        <span aria-label="Beam length" title={`Beam ${ftInDash(shownEntry.beamIn)}, ${per} pallet${per === 1 ? '' : 's'} per level${from ? ` — from ${from}` : ''} (set on the rack, not here)`} style={{ flex: '1 0 auto', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.04em', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
          BEAM {ftInDash(shownEntry.beamIn)} · {per}P
        </span>
        <button type="button" aria-label="Fit" title="Fit (double-click empty space)" onClick={() => setFit(n => n + 1)} style={{ ...S.btn, height: 26, flexShrink: 0 }}>Fit</button>
        <button type="button" aria-label="Full screen" title="Full screen (Esc closes)" onClick={() => setFull(n => n + 1)} style={{ ...S.btn, height: 26, width: 26, padding: 0 }}><Maximize2 size={12} /></button>
      </div>
      {/* below the toolbar: the drawing (the split's share, 65% to start) | the handle | section 02 (the rest) */}
      <div ref={body} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: drawH, flexShrink: 0, padding: '0 8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} data-drawing-box>
          {shown
            ? <ElevationDrawing t={shown} title={e ? previewName(dT, e.draft, e.id) : nameOf(T, shown)} entry={shownEntry} building={building} sel={e ? sel : null} sprClr={sprinklerClearance(T)} detail={detail} view={view} height={drawFix ? drawH - FIX_H : drawH} controls={false} paper fitSignal={fitSignal} fullSignal={fullSignal}
                readOnly={!e} onCommit={e ? (next) => editDraft(store, { ...next, id: e.draft.id }, { fromDrawing: true }) : () => {}} />
            : <div style={{ ...S.note, padding: 12 }}>No elevation yet — + New elevation below.</div>}
          {drawFix && (
            <div style={{ height: FIX_H, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
              <FixButton rows={fixRows} to={fixTo} label="Set the rows under the drawing note" />
            </div>
          )}
        </div>

        {/* the handle: drag the split (30–80%), double-click back to 65% */}
        <div role="separator" aria-orientation="horizontal" aria-label="Resize drawing" aria-valuemin={SPLIT_MIN * 100} aria-valuemax={SPLIT_MAX * 100} aria-valuenow={Math.round(split * 100)} title="Drag to resize · double-click to reset"
          onPointerDown={startSplit} onDoubleClick={() => setElevSplit(SPLIT_DEFAULT)}
          style={{ height: HANDLE, flexShrink: 0, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border)', background: 'var(--surface)', touchAction: 'none' }}>
          <span aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 3px)', gap: 3 }}>
            {Array.from({ length: 3 }, (_, i) => <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text4, #96A093)' }} />)}
          </span>
        </div>

        {/* 2. section 02 — the list or the editor, in place */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {e
            ? <Editor e={e} T={T} dT={dT} objects={objects} selectedIds={selectedIds} activeBaySelection={activeBaySelection} bays={e.id ? counts.get(e.id) || 0 : 0} building={building} sel={sel} frameDepths={frameDepths} />
            : <List T={T} active={active} counts={counts} made={made} rowsSelected={rowsSelected} />}
        </div>
      </div>
    </div>
  )
}

/** "Set these rows to 54 in": the rows too shallow for the pallet deepened — on this click only, one undo step; the note
 *  then goes (the rows are deep enough). */
function FixButton({ rows, to, label }) {
  if (!rows.length || !(to > 0)) return null
  return (
    <button type="button" aria-label={label} title={`${rows.length} row${rows.length === 1 ? '' : 's'} — one undo step`} onClick={() => deepenRows(store, rows.map(r => r.id), to)}
      style={{ ...S.btn, height: 24, padding: '0 10px', fontSize: 11.5, borderColor: '#C07A12', color: '#6B4A0B', background: '#FFF7E8' }}>
      Set these rows to {to} in
    </button>
  )
}

/* ── A) the list: choosing and assigning ─────────────────────────────────────────────────────────────────────────── */
function List({ T, active, counts, made, rowsSelected }) {
  const [menu, setMenu] = useState(null)              // { id, el (the row) } — its menu open
  const closeMenu = useCallback(() => setMenu(null), [])
  const pr = projectOf(T), tinted = tintOn(T)
  const [flash, setFlash] = useState(false)
  useEffect(() => { if (!made?.id) return; setFlash(true); const k = setTimeout(() => setFlash(false), 1600); return () => clearTimeout(k) }, [made])
  const madeType = made?.id ? typeById(T, made.id) : null
  return (
    <div aria-label="Elevation list section" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, padding: '10px 12px 12px', gap: 8 }}>
      <Head title="Elevations in this layout" right={<button type="button" onClick={() => removeUnused(store)} title="Remove the elevations no bay uses" style={{ ...S.link, color: 'var(--text3)', fontSize: 11 }}>Remove unused</button>} />
      <div role="list" aria-label="Elevation list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(T?.types || []).map(t => {
          const on = active && t.id === active.id, lit = made?.id === t.id
          return (
            <div key={t.id} role="listitem" data-type-id={t.id} aria-selected={!!on} data-highlight={lit && flash ? 'flash' : lit ? 'made' : undefined}
              onClick={() => useElevTab.setState({ activeId: t.id })}
              style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, padding: '0 6px 0 10px', borderRadius: 4, cursor: 'pointer', background: on ? 'var(--surface2)' : 'var(--surface)', border: `1px solid ${on ? 'var(--text2)' : 'var(--border)'}`, boxShadow: lit ? `0 0 0 ${flash ? 3 : 2}px var(--pin-accent, #378ADD)` : 'none', transition: 'box-shadow .25s ease' }}>
              <span style={{ position: 'relative', width: 12, height: 12, borderRadius: 2, background: 'white', border: '1px solid rgba(0,0,0,0.25)', flexShrink: 0 }}><span style={{ position: 'absolute', inset: 0, borderRadius: 1, background: tint(t.color), opacity: tinted ? ELEV_FILL_OPACITY : 0.25 }} /></span>
              <span aria-label="Elevation name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text)' }} title={nameOf(T, t)}>{nameOf(T, t)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{counts.get(t.id) || 0} bays</span>
              {t.id === T.defaultId && <span aria-label="default" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em', padding: '1px 5px', borderRadius: 2, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>DEFAULT</span>}
              <button type="button" aria-label={`Edit ${nameOf(T, t)}`} title="Change this elevation" onClick={(ev) => { ev.stopPropagation(); startEdit(store, t.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 3 }}><Pencil size={12} /></button>
              <button type="button" aria-label={`${nameOf(T, t)} menu`} onClick={(ev) => { ev.stopPropagation(); const el = ev.currentTarget.closest('[role="listitem"]'); setMenu(m => (m?.id === t.id ? null : { id: t.id, el })) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 3 }}><MoreHorizontal size={14} /></button>
              {menu?.id === t.id && <RowMenu t={t} T={T} anchor={menu.el} onClose={closeMenu} />}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button type="button" disabled={!rowsSelected || !active} onClick={() => active && assignSelected(store, active.id) && useElevTab.setState({ made: null })} style={{ ...S.btn, ...S.primary, flex: 1, height: 32, opacity: rowsSelected && active ? 1 : 0.45, cursor: rowsSelected && active ? 'pointer' : 'not-allowed' }}>
          Apply to {rowsSelected} selected row{rowsSelected === 1 ? '' : 's'}
        </button>
        <button type="button" disabled={!pr} onClick={() => startNew(store)} style={{ ...S.btn, height: 32, opacity: pr ? 1 : 0.45 }}><Plus size={12} /> New elevation</button>
      </div>
      <div role="note" aria-label="How to assign" style={{ ...BLUE_NOTE, flexShrink: 0 }}>
        {made && madeType && <><strong>{made.kind === 'exists' ? 'Already exists' : made.kind === 'saved' ? 'Saved' : 'Created'}: {nameOf(T, madeType)}.</strong>{' '}</>}
        Select rows on the plan, pick an elevation above, then apply.
      </div>
    </div>
  )
}

/* ── B) the editor: making and changing one elevation ────────────────────────────────────────────────────────────── */
function Editor({ e, T, dT, objects, selectedIds, activeBaySelection, bays, building, sel, frameDepths }) {
  const pr = projectOf(dT), d = e.draft
  const [name, setName] = useState(d.named ? d.name : '')
  const auto = previewName(dT, d, e.id)
  // the draft the same as an existing elevation in every way: say so, and offer that one
  const same = sameElevation(dT, d, e.id)
  const useSame = () => { cancelEdit(); useElevTab.setState({ activeId: same.id, made: null }) }
  useEffect(() => { const k = (ev) => { if (ev.key === 'Escape' && !sel && !(ev.target instanceof Element && /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName))) cancelEdit() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [sel])
  const save = () => { editDraft(store, { name, named: !!name.trim() }); saveEdit(store) }
  // the pallet's depth against the frames it would go on: the selected rows', else (editing) the rows using it
  const pallet = palletFor(dT, d)
  const selRacks = useMemo(() => [...rowSideCells({ objects, selectedIds, activeBaySelection }).keys()].map(id => objects.find(o => o.id === id)).filter(Boolean), [objects, selectedIds, activeBaySelection])
  const rows = selRacks.length ? selRacks : e.id ? racksUsing(objects, T, e.id) : []
  const depthNote = pallet?.depthIn ? frameDepthNote(pallet.depthIn, rows.map(r => r.depthIn ?? 42), selRacks.length ? 'Selected rows' : 'Rows using it') : null
  const nc = e.newCeiling, np = e.newPallet

  return (
    <div aria-label="Elevation editor" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
        <Head title={e.id ? 'Edit elevation' : 'New elevation'} note={e.id ? `${bays} bays use it` : null} right={<span style={S.note}>Drag a beam to move it</span>} />
      </div>
      {/* the form — the only part that scrolls */}
      <div role="group" aria-label="Elevation settings" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={S.label}>Name</span>
          <input aria-label="Elevation name" value={name} placeholder={auto} style={S.ctl} onChange={ev => setName(ev.target.value)} />
        </label>
        {same && (
          <div role="note" aria-label="Same as an existing elevation" style={BLUE_NOTE}>
            Same as <strong>{nameOf(T, same)}</strong> — <button type="button" onClick={useSame} style={{ ...S.link, color: '#1B3A8C' }}>use that one instead?</button>
          </div>
        )}

        <div role="group" aria-label="Ceiling" style={S.box}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={S.label}>Ceiling</span>
            <select aria-label="Elevation ceiling" value={d.ceilingId || ''} style={S.ctl} onChange={ev => editDraft(store, { ceilingId: ev.target.value || null })}>
              {!pr?.ceilings?.some(c => c.id !== NEW_CEILING) && !nc && <option value="">Not set ({ASSUMED_FT}')</option>}
              {(projectOf(T)?.ceilings || []).map(c => <option key={c.id} value={c.id}>{c.name}{c.clearHeightIn > 0 ? ` · ${ftInDash(c.clearHeightIn)}` : ` (${ASSUMED_FT}' assumed)`}</option>)}
              <option value={NEW_CEILING}>+ New ceiling height</option>
            </select>
          </label>
          {nc && (
            <div role="group" aria-label="New ceiling height" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {[['name', 'Name', 'text', 'Mezzanine'], ['clearFt', 'Clear height (ft)', 'number', `${ASSUMED_FT}`], ['sprFt', 'Sprinkler (ft)', 'number', 'optional']].map(([k, label, type, ph]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={S.label}>{label}</span>
                  <input aria-label={`New ceiling ${label.toLowerCase()}`} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 0.5 : undefined} value={nc[k] ?? ''} placeholder={ph} style={{ ...S.inner, fontFamily: type === 'number' ? 'var(--font-mono)' : 'var(--font-ui)' }} onChange={ev => editDraft(store, { newCeiling: { [k]: ev.target.value } })} />
                </label>
              ))}
            </div>
          )}
          {building?.assumed && (
            <div role="note" aria-label="Clear height not set" style={BLUE_NOTE}>
              Clear height not set — elevations assume {ASSUMED_FT}'. Set it in <button type="button" style={S.link} onClick={() => openSetup('settings')}>Project settings</button>.
            </div>
          )}
        </div>

        <div role="group" aria-label="Pallet" style={S.box}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={S.label}>Pallet</span>
            <select aria-label="Elevation pallet" value={d.palletId || ''} style={S.ctl} onChange={ev => editDraft(store, { palletId: ev.target.value || null })}>
              {!d.palletId && <option value="">—</option>}
              {(projectOf(T)?.pallets || []).map(p => <option key={p.id} value={p.id}>{p.name} · {p.faceIn}×{p.depthIn}×{p.heightIn} in</option>)}
              <option value={NEW_PALLET}>+ New pallet size</option>
            </select>
          </label>
          {np && (
            <div role="group" aria-label="New pallet size" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {[['faceIn', 'Face (in)'], ['depthIn', 'Depth (in)'], ['heightIn', 'Height (in)'], ['weightLb', 'Weight (lb)']].map(([k, label]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={S.label}>{label}</span>
                  <input aria-label={`New pallet ${label.toLowerCase()}`} type="number" min={0} value={np[k] ?? ''} style={S.inner} onChange={ev => editDraft(store, { newPallet: { [k]: ev.target.value } })} />
                </label>
              ))}
            </div>
          )}
          {depthNote && (
            <div role="note" aria-label="Pallet depth" style={AMBER_NOTE}>
              {depthNote}
              <div style={{ marginTop: 6 }}><FixButton rows={rows.filter(r => (r.depthIn ?? 42) < frameNeededFor(pallet.depthIn) - 1e-6)} to={frameDepthFor(pallet.depthIn, frameDepths)} label="Set the rows in the pallet note" /></div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={S.label}>Beam face</span>
          <div role="group" aria-label="Beam face" style={segGroup(26)}>
            {BEAM_FACES.map(v => <button key={v} type="button" aria-pressed={beamFace(d) === v} style={seg(beamFace(d) === v)} onClick={() => editDraft(store, { beamFaceIn: v })}>{v} in</button>)}
          </div>
        </div>
        <span style={S.note}>{d.levels.length} level{d.levels.length === 1 ? '' : 's'} · upright {ftInDash(d.uprightHeightIn)}</span>
      </div>

      {/* the footer — pinned; the ONE save */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button type="button" onClick={cancelEdit} style={{ ...S.btn, height: 40, padding: '0 16px', fontSize: 13 }}>Cancel</button>
        <button type="button" onClick={save} style={{ ...S.btn, ...S.primary, height: 40, flex: 1, fontSize: 13, fontWeight: 500 }}>Save elevation</button>
      </div>
    </div>
  )
}
