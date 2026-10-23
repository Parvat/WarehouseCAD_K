import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../studio/Icon'   // the Studio icon set (STUDIO.md §9); no Lucide in the card
import { C, MONO, fieldBox, InlineField, SelectField, Note, Btn, IconBtn } from '../../studio/cardParts'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../store/useCanvasStore'
import { typeById, typeIdAt, legendCounts, sprinklerClearance, isBeamRack, beamFace, sidesOf, frameDepthNote, frameNeededFor } from '../../utils/elevations'
import { lengthsByType } from '../../utils/elevationDrawing'
import { tint } from '../../utils/elevationDraw'
import { useElevEditor } from '../../utils/elevEditor'
import { useRules } from '../../rules/useRules'
import { useElevTab, nameOf, assignSelected, recolorElevation, duplicateElevation, deleteElevation, defaultElevation, removeUnused, rowSideCells, startNew, startEdit, editDraft, cancelEdit, saveEdit, draftTable, sameElevation, frameDepthFor, deepenRows, NEW_CEILING, NEW_PALLET, useElevSplit, setElevSplit, resetElevSplit, SPLIT_MIN, SPLIT_MAX } from '../../utils/elevTab'
import { projectOf, ceilingFor, palletFor, openSetup, previewName, advancedOf, ASSUMED_CLEAR_IN } from '../../utils/project'
import { bayLedger } from '../../utils/bayLedger'
import { ElevationDrawing } from './ElevationDrawing'

/* ── The Elevations tab (STUDIO.md §5, §7; design/studio/Studio.dc.html panels "elev" C2 and "edit" C3) ─────────────
   In the 300 wide right card, under its Properties | Elevations segment:
   1. The SHEET — white, a 14px #EFEEE9 grid, radius 8 — with the drawing on it and nothing else (no buttons on the
      drawing). The list's drawing is read-only; beams drag only in the editor, into its draft — an elevation used by
      325 bays changes only through Save. Its height: the mockup's (420 under the list, 290 over the editor), shortened
      so the list or the form below still fits a short window; once the grab handle under it is dragged, the user's
      share of the card (utils/elevTab.js), double-click back to the mockup's.
   2. Below it, swapped in place:
      A) the LIST (C2): "In this layout" with Depth and Full screen (inset 28h) on the right; a 48h row per elevation —
         colour, name, a sub line (ceiling · beam if not the default · bays), DEFAULT, More (Edit, colour, duplicate,
         set default, delete, remove unused); a click picks it for the drawing (active fill). Apply to N selected rows
         (primary — disabled at 45% when no row is selected, so the footer never jumps) and New (ghost).
      B) the EDITOR (C3, from New or More → Edit): Back · title · Depth · Full screen; Name; Ceiling (a select, "+ New
         ceiling height" opening Name · Clear height · Sprinkler); the Pallet box (a select, "+ New pallet size" opening
         Face · Depth · Height · Weight, then the amber note with its Set to N″ action when the pallet is deeper than the
         rows' frames); Beam 3″ 4″ 5″ 6″. Only this form scrolls. The footer is pinned: Cancel and Save elevation — ONE
         save, which also adds a new ceiling or pallet to the project (one undo step). Cancel or Save returns to the
         list. The sheet above follows the draft as it is edited.
   Simple | Detailed is set in the full-screen view; Fit is a double-click on empty sheet. */

const store = useCanvasStore
const HANDLE = 12                 // the grab handle under the sheet (px)
const SHEET_LIST = 420, SHEET_EDIT = 290   // the mockup's sheet heights (C2, C3)
const LIST_MIN = 252              // under the sheet in the list: caption 34 + three 48h rows (gap 4) + footer 44 + padding
const EDIT_MIN = 220              // under the sheet in the editor: the header, Name and Ceiling at least, and the footer
const SHEET_MIN = 120
const ASSUMED_FT = Math.round(ASSUMED_CLEAR_IN / 12)
const BEAM_FACES = [3, 4, 5, 6]
const caption = { color: C.muted, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }
const link = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit' }
const inset28 = (on) => ({ height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 6, background: on ? C.active : C.inset, color: on ? C.accent : C.text, fontSize: 12, cursor: 'pointer', flexShrink: 0 })
/* the mockup's plain glyphs (a chevron, an arrow, a plus — STUDIO.md §9 draws no box icon for these) */
const Arrow = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
const Back = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
const Plus = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>

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

/** Depth (the side view — the drawing's own Front | Side) and Full screen: the list's caption row, the editor's header. */
function SheetButtons({ view, onFull }) {
  const side = view === 'side'
  return (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
      <button type="button" className={side ? undefined : 'st-hov'} aria-pressed={side} title={side ? 'Back to the front view' : 'The side view: the depth of the frame'} onClick={() => useElevTab.setState({ view: side ? 'front' : 'side' })} style={inset28(side)}>Depth<Arrow /></button>
      <button type="button" className="st-hov" aria-label="Full screen" title="Full screen (Esc closes)" onClick={onFull} style={{ ...inset28(false), width: 28, padding: 0, justifyContent: 'center' }}><Icon name="Full screen" color="currentColor" /></button>
    </span>
  )
}

/** A row's menu (choosing only): Edit, colour, duplicate, set default, delete, remove unused. Portalled to the themed
 *  root at the top z-index and placed from the row's screen rect — over the drawing and everything else, never
 *  clipped; below the row, flipped above it near the bottom of the window. The layout menu's look (C14). */
const MENU_W = 240, MENU_H = 250
const menuRow = { height: 34, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 13, color: C.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }
const menuLine = <span style={{ height: 1, background: C.divider, margin: '4px 6px' }} />
function RowMenu({ t, T, anchor, onClose }) {
  const ref = useRef(null)
  const host = document.querySelector('[data-theme]') || document.body
  const r = anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
  const pos = r.bottom + 6 + MENU_H > window.innerHeight - 8 ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }
  useEffect(() => {
    // a press outside closes it (the row's More toggles it); so do a scroll or a resize (it would float off its row)
    const d = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose() }
    const away = (e) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose() }
    window.addEventListener('pointerdown', d, true); window.addEventListener('scroll', away, true); window.addEventListener('resize', onClose)
    return () => { window.removeEventListener('pointerdown', d, true); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', onClose) }
  }, [onClose, anchor])
  const isDefault = t.id === T.defaultId, last = T.types.length <= 1
  const item = (label, fn, { disabled = false, danger = false } = {}) => (
    <button type="button" role="menuitem" className="st-hov" disabled={disabled} onClick={() => { fn(); onClose() }}
      style={{ ...menuRow, color: danger ? C.danger : C.text, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}><span style={{ flex: 1 }}>{label}</span></button>
  )
  return createPortal(
    <div ref={ref} role="menu" aria-label={`${nameOf(T, t)} menu`} data-card-dark style={{ position: 'fixed', left, ...pos, zIndex: 500, width: MENU_W, padding: 6, borderRadius: 10, background: C.island, border: '1px solid #323835', boxShadow: '0 16px 40px rgba(15,18,16,.3)', display: 'flex', flexDirection: 'column', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {item('Edit', () => startEdit(store, t.id))}
      <label style={{ ...menuRow, cursor: 'default' }}><span style={{ flex: 1 }}>Colour</span><input aria-label="Elevation colour" type="color" value={tint(t.color)} onChange={e => recolorElevation(store, t.id, e.target.value)} style={{ width: 28, height: 22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }} /></label>
      {item('Duplicate', () => duplicateElevation(store, t.id))}
      {item('Set default', () => defaultElevation(store, t.id), { disabled: isDefault })}
      {menuLine}
      {item('Remove unused elevations', () => removeUnused(store))}
      {item('Delete', () => deleteElevation(store, t.id), { disabled: last, danger: true })}
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
  const { entry } = useMemo(() => beamEntry(objects, T, e ? (editingType || e.draft) : active, selectedIds), [objects, T, e, editingType, active, selectedIds])
  const building = useMemo(() => (shown ? ceilingFor(dT, shown, objects, entry.parentId) : null), [dT, shown, objects, entry])
  const pal = shown ? palletFor(dT, shown) : null
  const shownEntry = useMemo(() => ({ ...entry, ...(pal?.faceIn ? { palletWIn: pal.faceIn } : {}), palletDIn: pal?.depthIn ?? null }), [entry, pal])
  const rowsSelected = useMemo(() => rowSideCells({ objects, selectedIds, activeBaySelection }).size, [objects, selectedIds, activeBaySelection])
  const { rules } = useRules()
  const frameDepths = rules?.selective?.frameDepthsIn
  const [fullSignal, setFull] = useState(0)
  const onFull = () => setFull(n => n + 1)
  // the sheet: the mockup's height for the state, unless the user dragged the handle (their share of the card)
  const split = useElevSplit(s => s.split)
  // the room under the tabs: down to the card's limit, 76px above the window's bottom (STUDIO.md §1) — the card is as
  // tall as its content, so the room is read from the window, not from the card
  const body = useRef(null)
  const [bodyH, setBodyH] = useState(700)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const read = () => setBodyH(Math.max(200, Math.round(window.innerHeight - 76 - el.getBoundingClientRect().top)))
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  const room = bodyH - HANDLE
  const sheetH = Math.max(SHEET_MIN, split != null ? Math.round(room * split) : Math.min(e ? SHEET_EDIT : SHEET_LIST, room - (e ? EDIT_MIN : LIST_MIN)))
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
    <div ref={body} aria-label="Elevations" data-mode={e ? 'editor' : 'list'} data-pane="open" style={{ display: 'flex', flexDirection: 'column', maxHeight: bodyH, minHeight: 0 }}>
      {/* 1. the sheet: white, 14px grid, radius 8 — the drawing and nothing else on it */}
      <div data-drawing-box data-sheet style={{ margin: '0 12px', height: sheetH, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF', backgroundImage: 'linear-gradient(#EFEEE9 1px, transparent 1px), linear-gradient(90deg, #EFEEE9 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
        {shown
          ? <ElevationDrawing t={shown} title={e ? previewName(dT, e.draft, e.id) : nameOf(T, shown)} entry={shownEntry} building={building} sel={e ? sel : null} sprClr={sprinklerClearance(T)} detail="studio" fullDetail={detail} view={view} height={sheetH} controls={false} paper fullSignal={fullSignal}
              readOnly={!e} onCommit={e ? (next) => editDraft(store, { ...next, id: e.draft.id }, { fromDrawing: true }) : () => {}} />
          : <div style={{ padding: 12, color: '#767C74', fontSize: 12 }}>No elevation yet — New below.</div>}
      </div>

      {/* the grab handle: drag the sheet's share (30–80%), double-click back to the mockup's height */}
      <div role="separator" aria-orientation="horizontal" aria-label="Resize drawing" aria-valuemin={SPLIT_MIN * 100} aria-valuemax={SPLIT_MAX * 100} aria-valuenow={Math.round((sheetH / Math.max(1, room)) * 100)} title="Drag to resize · double-click to reset"
        onPointerDown={startSplit} onDoubleClick={resetElevSplit}
        style={{ height: HANDLE, flexShrink: 0, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}>
        <span aria-hidden style={{ width: 32, height: 3, borderRadius: 2, background: C.separator }} />
      </div>

      {/* 2. the list or the editor, in place */}
      <div style={{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {e
          ? <Editor e={e} T={T} dT={dT} objects={objects} selectedIds={selectedIds} activeBaySelection={activeBaySelection} bays={e.id ? counts.get(e.id) || 0 : 0} building={building} sel={sel} frameDepths={frameDepths} view={view} onFull={onFull} />
          : <List T={T} active={active} counts={counts} made={made} rowsSelected={rowsSelected} view={view} onFull={onFull} />}
      </div>
    </div>
  )
}

/** "Set to 54″": the rows too shallow for the pallet deepened — on this click only, one undo step; the note then goes
 *  (the rows are deep enough). The warning box's action (STUDIO.md §2). */
function FixButton({ rows, to, label }) {
  if (!rows.length || !(to > 0)) return null
  return (
    <button type="button" aria-label={label} title={`${rows.length} row${rows.length === 1 ? '' : 's'} — one undo step`} onClick={() => deepenRows(store, rows.map(r => r.id), to)}
      style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 6, background: '#F2C77A', color: '#3A2E17', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
      Set to {to}″
    </button>
  )
}

/* ── A) the list: choosing and assigning (C2) ────────────────────────────────────────────────────────────────────── */
function List({ T, active, counts, made, rowsSelected, view, onFull }) {
  const [menu, setMenu] = useState(null)              // { id, el (the row) } — its menu open
  const closeMenu = useCallback(() => setMenu(null), [])
  const pr = projectOf(T), faceDefault = advancedOf(pr).beamFaceIn
  const [flash, setFlash] = useState(false)
  useEffect(() => { if (!made?.id) return; setFlash(true); const k = setTimeout(() => setFlash(false), 1600); return () => clearTimeout(k) }, [made])
  const canApply = !!rowsSelected && !!active
  const madeType = made?.id ? typeById(T, made.id) : null
  return (
    <div aria-label="Elevation list section" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto', padding: '4px 12px 12px', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0 6px 4px', flexShrink: 0 }}>
        <span style={caption}>In this layout</span>
        <SheetButtons view={view} onFull={onFull} />
      </div>
      <div role="list" aria-label="Elevation list" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(T?.types || []).map(t => {
          const on = active && t.id === active.id, lit = made?.id === t.id
          const ceil = ceilingFor(T, t), face = beamFace(t), name = nameOf(T, t)
          // the row's title: an auto name without its ceiling — the sub line says it (C2); the full name in the tooltip
          const title = !t.named && ceil?.name ? name.replace(` · ${ceil.name}`, '') : name
          return (
            <div key={t.id} role="listitem" className="st-hov" data-on={on || undefined} data-type-id={t.id} aria-selected={!!on} data-highlight={lit && flash ? 'flash' : lit ? 'made' : undefined}
              onClick={() => useElevTab.setState({ activeId: t.id })}
              style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 0 10px', borderRadius: 8, cursor: 'pointer', background: on ? C.active : 'transparent', boxShadow: lit ? `0 0 0 ${flash ? 3 : 2}px ${C.select}` : 'none', transition: 'box-shadow .25s ease' }}>
              <span aria-hidden style={{ width: 10, height: 10, flexShrink: 0, borderRadius: 2, background: tint(t.color) }} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span aria-label="Elevation name" title={name} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.strong }}>{title}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.muted, fontSize: 12 }}>
                  {ceil?.name ? `${ceil.name} · ` : ''}{face !== faceDefault ? `${face}″ beam · ` : ''}<span style={{ fontFamily: MONO }}>{counts.get(t.id) || 0}</span> bays
                </span>
              </span>
              {t.id === T.defaultId && <span aria-label="default" style={{ height: 18, padding: '0 6px', display: 'flex', alignItems: 'center', borderRadius: 4, background: C.island, color: C.accent, fontSize: 10, fontWeight: 600, letterSpacing: '.06em', flexShrink: 0 }}>DEFAULT</span>}
              <span onClick={(ev) => { ev.stopPropagation(); const el = ev.currentTarget.closest('[role="listitem"]'); setMenu(m => (m?.id === t.id ? null : { id: t.id, el })) }} style={{ display: 'flex' }}>
                <IconBtn name="More" label={`${name} menu`} title="More" />
              </span>
              {menu?.id === t.id && <RowMenu t={t} T={T} anchor={menu.el} onClose={closeMenu} />}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexShrink: 0 }}>
        <Btn kind="primary" disabled={!canApply} title={canApply ? undefined : 'Select rows on the plan, pick an elevation, then apply'} onClick={() => active && assignSelected(store, active.id) && useElevTab.setState({ made: null })}
          style={{ flex: 1, opacity: canApply ? 1 : 0.45, cursor: canApply ? 'pointer' : 'not-allowed' }}>
          Apply to {rowsSelected} selected row{rowsSelected === 1 ? '' : 's'}
        </Btn>
        <Btn kind="ghost" disabled={!pr} onClick={() => startNew(store)} style={{ padding: '0 12px 0 10px', gap: 6, opacity: pr ? 1 : 0.45 }}><Plus />New</Btn>
      </div>
      {/* what Save / Create just did — until the next assignment or save (the row it names is ringed too) */}
      {made && madeType && (
        <Note level="note" role="note" aria-label="Elevation saved" style={{ marginTop: 4, flexShrink: 0 }}>
          <strong>{made.kind === 'exists' ? 'Already exists' : made.kind === 'saved' ? 'Saved' : 'Created'}: {nameOf(T, madeType)}.</strong>
        </Note>
      )}
    </div>
  )
}

/** 30′ 0″ — the Ceiling select's height, as the mockup writes it */
const ftInSp = (inches) => { const v = Math.round(inches), f = Math.floor(v / 12); return `${f}′ ${v - f * 12}″` }
/** A pallet field (C3): the number with its unit after it (40″, outside the input), the weight with its thousands (2,500)
 *  — a plain number while focused, all of it selected so typing replaces it; the draft gets the digits only */
function PalletNum({ value, onChange, aria, weight }) {
  const [focus, setFocus] = useState(false)
  const raw = String(value ?? '')
  if (!weight) return (
    <span style={{ ...small, gap: 0 }}><input type="number" min={0} aria-label={aria} className="st-field" value={raw} onChange={ev => onChange(ev.target.value)}
      style={{ width: `${Math.max(1, raw.length)}ch`, minWidth: 0, padding: 0, border: 0, background: 'transparent', outline: 'none', color: C.strong, fontFamily: MONO, fontSize: 12 }} />″</span>
  )
  const shown = focus || raw === '' ? raw : (Number(raw) || 0).toLocaleString('en-US')
  return <input type="text" inputMode="numeric" aria-label={aria} className="st-field" value={shown} style={small}
    onFocus={ev => { setFocus(true); const el = ev.currentTarget; requestAnimationFrame(() => el.select()) }} onBlur={() => setFocus(false)} onChange={ev => onChange(ev.target.value.replace(/[^\d.]/g, ''))} />
}
/* the editor's small fields (C3 pallet box): 11px label over a 26h mono field */
const small = { ...fieldBox(), height: 26, padding: '0 8px' }
function SmallField({ label, children }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={{ color: C.muted, fontSize: 11 }}>{label}</span>{children}</label>
}

/* ── B) the editor: making and changing one elevation (C3) ───────────────────────────────────────────────────────── */
function Editor({ e, T, dT, objects, selectedIds, activeBaySelection, bays, building, sel, frameDepths, view, onFull }) {
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
  const need = pallet?.depthIn ? frameNeededFor(pallet.depthIn) : 0
  const short = [...new Set(rows.map(r => r.depthIn ?? 42).filter(x => x < need - 1e-6))].sort((a, b) => a - b)
  const nc = e.newCeiling, np = e.newPallet

  return (
    <div aria-label="Elevation editor" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
      {/* the form — the only part that scrolls */}
      <div role="group" aria-label="Elevation settings" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button type="button" className="st-hov" aria-label="Back" title="Back to the list (Esc)" onClick={cancelEdit} style={{ width: 26, height: 26, border: 0, borderRadius: 6, background: 'transparent', color: C.icon, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><Back /></button>
          <span style={{ fontWeight: 600, color: C.strong, whiteSpace: 'nowrap' }}>{e.id ? 'Edit elevation' : 'New elevation'}</span>
          {e.id ? <span title={`${bays} bays use it`} style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}><span style={{ fontFamily: MONO }}>{bays}</span> bays</span> : null}
          <SheetButtons view={view} onFull={onFull} />
        </div>
        <InlineField label="Name">
          <input aria-label="Elevation name" className="st-field" value={name} placeholder={auto} style={fieldBox(true)} onChange={ev => setName(ev.target.value)} />
        </InlineField>
        {same && (
          <Note level="note" role="note" aria-label="Same as an existing elevation">
            Same as <strong>{nameOf(T, same)}</strong> — <button type="button" onClick={useSame} style={link}>use that one instead?</button>
          </Note>
        )}

        <div role="group" aria-label="Ceiling" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InlineField label="Ceiling">
            <SelectField words chevron aria="Elevation ceiling" value={d.ceilingId || ''} onChange={ev => editDraft(store, { ceilingId: ev.target.value || null })} style={{ color: d.ceilingId === NEW_CEILING ? C.accent : C.strong }}>
              {!pr?.ceilings?.some(c => c.id !== NEW_CEILING) && !nc && <option value="">Not set ({ASSUMED_FT}′)</option>}
              {(projectOf(T)?.ceilings || []).map(c => <option key={c.id} value={c.id}>{c.name}{c.clearHeightIn > 0 ? ` · ${ftInSp(c.clearHeightIn)}` : ` (${ASSUMED_FT}′ assumed)`}</option>)}
              <option value={NEW_CEILING}>+ New ceiling height</option>
            </SelectField>
          </InlineField>
          {nc && (
            <div role="group" aria-label="New ceiling height" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, padding: 8, borderRadius: 8, border: '1px solid #323835' }}>
              {[['name', 'Name', 'text', 'Mezzanine'], ['clearFt', 'Clear height (ft)', 'number', `${ASSUMED_FT}`], ['sprFt', 'Sprinkler (ft)', 'number', 'optional']].map(([k, label, type, ph]) => (
                <SmallField key={k} label={label}>
                  <input aria-label={`New ceiling ${label.toLowerCase()}`} className="st-field" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 0.5 : undefined} value={nc[k] ?? ''} placeholder={ph} style={type === 'number' ? small : { ...small, fontFamily: 'inherit' }} onChange={ev => editDraft(store, { newCeiling: { [k]: ev.target.value } })} />
                </SmallField>
              ))}
            </div>
          )}
          {building?.assumed && (
            <Note level="note" role="note" aria-label="Clear height not set">
              Clear height not set — elevations assume {ASSUMED_FT}'. Set it in <button type="button" style={link} onClick={() => openSetup('settings')}>Project settings</button>.
            </Note>
          )}
        </div>

        <div role="group" aria-label="Pallet" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 8, border: '1px solid #323835' }}>
          <InlineField label="Pallet" labelWidth={48}>
            <SelectField words chevron aria="Elevation pallet" value={d.palletId || ''} onChange={ev => editDraft(store, { palletId: ev.target.value || null })} style={{ color: d.palletId === NEW_PALLET ? C.accent : C.strong }}>
              {!d.palletId && <option value="">—</option>}
              {(projectOf(T)?.pallets || []).map(p => <option key={p.id} value={p.id}>{p.name} · {p.depthIn}×{p.faceIn}×{p.heightIn} in</option>)}
              <option value={NEW_PALLET}>+ New pallet size</option>
            </SelectField>
          </InlineField>
          {np && (
            <div role="group" aria-label="New pallet size" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {[['faceIn', 'Face'], ['depthIn', 'Depth'], ['heightIn', 'Height'], ['weightLb', 'Weight']].map(([k, label]) => (
                <SmallField key={k} label={label}>
                  <PalletNum aria={`New pallet ${label.toLowerCase()} (${k === 'weightLb' ? 'lb' : 'in'})`} value={np[k] ?? ''} weight={k === 'weightLb'} onChange={v => editDraft(store, { newPallet: { [k]: v } })} />
                </SmallField>
              ))}
            </div>
          )}
          {depthNote && (
            <div role="note" aria-label="Pallet depth" title={depthNote} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: '#3A2E17', color: '#F2C77A', fontSize: 12, lineHeight: 1.45 }}>
              <span style={{ flex: 1 }}>{pallet.depthIn}″ pallet needs about {need}″ frames. Rows are {short.map(x => `${x}″`).join(', ')}.</span>
              <FixButton rows={rows.filter(r => (r.depthIn ?? 42) < need - 1e-6)} to={frameDepthFor(pallet.depthIn, frameDepths)} label="Set the rows in the pallet note" />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ width: 56, flexShrink: 0, color: C.muted, fontSize: 12 }}>Beam</span>
          <div role="group" aria-label="Beam face" style={{ display: 'flex', padding: 2, borderRadius: 6, background: C.inset }}>
            {BEAM_FACES.map(v => { const on = beamFace(d) === v; return <button key={v} type="button" aria-pressed={on} aria-label={`${v} in`} onClick={() => editDraft(store, { beamFaceIn: v })} style={{ height: 26, width: 40, border: 0, borderRadius: 4, background: on ? C.active : 'transparent', color: on ? C.accent : C.muted, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>{v}″</button> })}
          </div>
        </div>
      </div>

      {/* the footer — pinned; the ONE save */}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${C.divider}`, flexShrink: 0 }}>
        <Btn kind="ghost" onClick={cancelEdit}>Cancel</Btn>
        <Btn kind="primary" onClick={save} style={{ flex: 1 }}>Save elevation</Btn>
      </div>
    </div>
  )
}
