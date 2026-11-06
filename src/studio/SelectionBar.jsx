import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { toggleLock, isLockedIn } from '../utils/layers'
import { useLocked } from './useLocked'
import { SECTION_COLORS, colorOf } from '../utils/sectionAreas'
import { setSectionColor, duplicateSections } from '../utils/sectionEdit'
import { hasBoundary } from '../utils/sectionAreas'
import { startSectionDoors } from '../utils/doorTool'
import { TOOLS } from '../constants'
import { worldBoundsOf, hitTest, fpWallHitTest, wallBeatsPadding } from '../canvas2/hitTest'
import { screenToWorld } from '../canvas2/viewport'
import { useDragPreview } from '../canvas2/dragPreview'
import { useLabelPrefs } from '../canvas2/labelPrefs'
import { labelScale } from '../render/labelSize'
import { usePlacement } from '../utils/placement'
import { useRowGroup } from '../utils/rowGroupTool'
import { pickedBays, kindOf } from '../canvas2/selectionLevel'
import { withSections, isOneSection, sectionsOf } from '../canvas2/sections'
import { useClearanceView, setShowClearances } from '../canvas2/clearanceView'
import { useColumnPick, setColumnClearances } from '../canvas2/columnPick'
import { getRackCapacity } from '../utils/capacity'
import { levelsResolver } from '../utils/elevations'
import { useBayLedger } from '../components/RightPanel/useBayLedger'
import { SPLIT_TOOL } from '../utils/splitTool'
import { FILL_TOOL } from '../utils/fillTool'
import { DOOR_TOOL } from '../utils/doorTool'
import { endTool } from '../utils/toolSwitch'
import { isPlainTool } from '../utils/homeTool'
import { isBeamRack, typeById } from '../utils/elevations'
import { selectionCells, cellTypes } from '../utils/elevSelection'
import { assignSelected } from '../utils/elevTab'
import { nameOf, openSetup, projectOf } from '../utils/project'
import { zoneSized } from '../utils/floorClamp'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { useColumnCheck } from '../generate/useColumnCheck'
import { ZONE_KINDS } from '../generate/rackingArea'
import { B, MONO, pill, Sep, IconBtn, Chip, Menu, MenuItem, MenuLine } from './barParts'
import { Icon, hasIcon } from './Icon'
import { addBayTo, removeBayFrom, rotateQuarter, duplicateSelection, deleteSelection, cutSelection, pasteHere, groupSelectedRows, pickLibraryItem } from './selectionActions'

/* ── The selection bar (STUDIO.md §1, §6; design/studio/Studio.dc.html C1 and C6) ──────────────────────────────────
   A dark pill (radius 12) floating just above the selection — never over it: below it when there is no room above
   (under the top islands) — kept off the rail and the right card, following the pan and the zoom (the store's view).
   Its contents per selection, as the §6 table — every action is the one the card, a key or the library already makes
   (selectionActions.js):
     one rack row   Elevation ▾ | Add bay · Remove bay · Split · Row group · Rotate | Duplicate · Delete · ⋯
     several rows   Apply elevation ▾ | Row group · Delete
     zone           W × L | Lock · Duplicate · Delete
     column grid    Show clearances
     one column     Show clearances — that column's only (a click picks one column: canvas2/columnPick.js)
     aisle label    Lock
     building/wall  Thickness 3″ 6″ 9″ 12″ | Add door · Wall clearance
   Not drawn while another tool is on, during a drag or a placement, or while a Row group is open (its mode bar is).
   ⋯ More: Lock, the order, Copy, Cut — the card's More → Object / Arrange. The floor's right-click menu (FloorMenu):
   Paste · Fill racking · Add zone ▾. */

const GAP = 8, TOP_SAFE = 68, EDGE = 16, RAIL_RIGHT = 72
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_')
const isColumn = (o) => o?.type === 'column_grid' || o?.type === 'column'
const store = useCanvasStore

/** What the bar is for, and on what: { kind, objs } or null. One selection rule (STUDIO.md §7): bays picked — the bay
 *  bar ('bay': in one row; 'bays': in several); rows — the rack bar for one row (one section: its pieces are one
 *  object — canvas2/sections.js), the rows bar for several. `activeBaySelection`: the store's (left out: none). */
export function barFor(objects, selectedIds, activeWall, activeBaySelection = [], gridSize = 40, column = null) {
  const sel = objects.filter(o => selectedIds.includes(o.id))
  // one column picked out of its grid: its own bar, over that column
  if (column && sel.length === 1 && sel[0].id === column.gridId) return { kind: 'column', one: true, objs: [{ id: column.gridId, type: 'column', x: column.x, y: column.y, width: column.w, height: column.h }] }
  if (!sel.length && activeWall) { const fp = objects.find(o => o.id === activeWall.objId); return fp ? { kind: 'building', objs: [fp] } : null }
  const picked = pickedBays({ objects, selectedIds, activeBaySelection })
  if (picked.length) {
    const owners = [...new Set(picked.map(e => e.objId))].map(id => objects.find(o => o.id === id)).filter(Boolean)
    return { kind: owners.length === 1 ? 'bay' : 'bays', objs: objects.filter(o => withSections(objects, owners.map(x => x.id), gridSize).includes(o.id)), bays: picked, owner: owners[0] }
  }
  if (sel.length > 1 && sel.every(isBeamRack) && isOneSection(objects, sel.map(o => o.id), gridSize)) {
    const main = [...sel].sort((a, b) => (b.beams?.length || 0) - (a.beams?.length || 0))[0]
    return { kind: 'rack', objs: sel, main }
  }
  if (sel.length === 1) {
    const o = sel[0]
    if (isBeamRack(o)) return { kind: 'rack', objs: sel }
    if (isZone(o)) return { kind: 'zone', objs: sel }
    if (o.type === 'section_area') return { kind: 'section', objs: sel }
    if (isColumn(o)) return { kind: 'column', objs: sel }
    if (o.type === 'aisle') return { kind: 'aisle', objs: sel }
    if (FP.has(o.type)) return { kind: 'building', objs: sel }
    return null
  }
  if (sel.length > 1 && sel.every(isBeamRack)) return { kind: 'rows', objs: sel }
  // several kinds together (racks, zones, doors, text — STUDIO.md §7a Levels): only what all of them share, and the count
  if (sel.length > 1 && new Set(sel.map(kindOf)).size > 1) return { kind: 'mixed', objs: sel }
  return null
}

/** How far a selected object's own dimension labels reach past its box (world px; canvas2/DimensionLabels.jsx, drawn at
 *  the label size `lz`): a building's (FpDimLabels) stand 22 out from every wall with an 11-tall pill; a rack's
 *  (RackLabels) run below it and to its right, 14 out — on top only when it is turned 180° or 270°. The bar keeps clear
 *  of them, so a selected object's labels are never under it. */
export function labelReach(o, lz) {
  const pillHalf = (11 * 1.5) / 2
  if (FP.has(o.type)) { const r = (22 + pillHalf + 2) / lz; return { top: r, side: r, bottom: r } }
  if (o.type === 'rack_row' || o.type === 'rack_double_row') {
    const rot = ((((o.rotation || 0) % 360) + 360) % 360), r = (14 + pillHalf + 2) / lz
    return { top: rot === 180 || rot === 270 ? r : 0, side: r, bottom: r }
  }
  return { top: 0, side: 0, bottom: 0 }
}
/** The selection's box on screen (canvas px): the union of its world boxes (with its labels' reach, at label size
 *  `lz`), through the view. */
export function screenBox(objs, objects, view, lz = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const o of objs) {
    const b = worldBoundsOf(o, objects)
    if (!b) continue
    const m = lz ? labelReach(o, lz) : { top: 0, side: 0, bottom: 0 }
    x0 = Math.min(x0, b.x - m.side); y0 = Math.min(y0, b.y - m.top); x1 = Math.max(x1, b.x + b.width + m.side); y1 = Math.max(y1, b.y + b.height + m.bottom)
  }
  if (!Number.isFinite(x0)) return null
  return { x0: x0 * view.zoom + view.panX, y0: y0 * view.zoom + view.panY, x1: x1 * view.zoom + view.panX, y1: y1 * view.zoom + view.panY }
}

/** Where the bar goes (canvas px), `w` × `h`: centred over the box, GAP above it — below it when above would run under
 *  the top islands — inside the window, off the rail and the right card (`avoid`: its rect). */
export function placeBar(box, w, h, win, avoid = null) {
  let left = (box.x0 + box.x1) / 2 - w / 2
  let top = box.y0 - GAP - h, flipped = false
  if (top < TOP_SAFE) { top = box.y1 + GAP; flipped = true }
  top = Math.max(TOP_SAFE, Math.min(top, win.h - h - EDGE))
  left = Math.max(RAIL_RIGHT + EDGE, Math.min(left, win.w - w - EDGE))
  if (avoid && left + w > avoid.left - EDGE && top < avoid.bottom && top + h > avoid.top) left = Math.max(RAIL_RIGHT + EDGE, avoid.left - EDGE - w)
  return { left, top, flipped }
}

/** Every label pill drawn on the plan (canvas2/LabelOps.jsx and LabelPill name them `label-pill`: dimensions, aisle and
 *  cross-aisle labels, column clearances), as screen rects in `hostEl`'s px { x0, y0, x1, y1 } — only those on screen. */
export function labelRectsOnScreen(hostEl) {
  // the browser's Konva (it sets window.Konva) — not imported: the server render and the tests have no canvas
  const stage = hostEl && ((typeof window !== 'undefined' && window.Konva?.stages) || []).find(s => hostEl.contains(s.container()))
  if (!stage) return EMPTY
  const hr = hostEl.getBoundingClientRect(), cr = stage.container().getBoundingClientRect()
  const ox = cr.left - hr.left, oy = cr.top - hr.top, W = hr.width, H = hr.height
  const out = []
  for (const n of stage.find('.label-pill')) {
    if (!n.isVisible()) continue
    const r = n.getClientRect({ skipShadow: true, skipStroke: true })
    const x0 = r.x + ox, y0 = r.y + oy, x1 = x0 + r.width, y1 = y0 + r.height
    if (x1 < 0 || y1 < 0 || x0 > W || y0 > H || !(r.width > 0)) continue
    out.push({ x0, y0, x1, y1 })
  }
  return out
}
const EMPTY = []
const sameRects = (a, b) => a.length === b.length && a.every((r, i) => Math.abs(r.x0 - b[i].x0) < 0.5 && Math.abs(r.y0 - b[i].y0) < 0.5 && Math.abs(r.x1 - b[i].x1) < 0.5 && Math.abs(r.y1 - b[i].y1) < 0.5)

/** Where the bar goes (canvas px), `w` × `h`, so it covers no label (STUDIO.md §7): above the selection (`box`; just
 *  above it, then above its own labels' reach `reach`), then below, then slid sideways along it, then further up past
 *  whatever label is in the way — inside the window, off the rail and the right card (`card`), never over the selection
 *  or any of `labels` (screen rects). With nowhere clear: placeBar's spot. */
export function placeBarClear(box, reach, w, h, win, card = null, labels = EMPTY) {
  const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  const cardBox = card ? { x0: card.left - EDGE, y0: card.top, x1: card.right ?? win.w, y1: card.bottom } : null
  const clear = (l, t) => {
    if (t < TOP_SAFE || t + h > win.h - EDGE || l < RAIL_RIGHT + EDGE || l + w > win.w - EDGE) return false
    const q = { x0: l, y0: t, x1: l + w, y1: t + h }
    return !hits(q, box) && !(cardBox && hits(q, cardBox)) && !labels.some(L => hits(q, L))
  }
  const out = (l, t) => ({ left: l, top: t, flipped: t > box.y0 })
  const cx = (box.x0 + box.x1) / 2 - w / 2
  const above = [box.y0 - GAP - h, (reach || box).y0 - GAP - h], below = [box.y1 + GAP, (reach || box).y1 + GAP]
  for (const t of above) if (clear(cx, t)) return out(cx, t)
  for (const t of below) if (clear(cx, t)) return out(cx, t)
  const reachW = Math.max(box.x1 - box.x0, w) / 2 + w
  for (let d = 24; d <= reachW; d += 24) for (const s of [1, -1]) for (const t of [...above, ...below]) if (clear(cx + s * d, t)) return out(cx + s * d, t)
  for (let t = above[1] - 12; t >= TOP_SAFE; t -= 12) if (clear(cx, t)) return out(cx, t)
  for (let t = below[1] + 12; t + h <= win.h - EDGE; t += 12) if (clear(cx, t)) return out(cx, t)
  return placeBar(reach || box, w, h, win, card)
}

/* ── the bars, per selection ── */

/** The selection's elevation (C1 chip), and the elevations to apply (one undo step: assignSelected — the Elevations tab's
 *  Apply to selected rows). */
function ElevationChip({ several = false }) {
  const { objects, T, selectedIds, activeBaySelection, layers } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection, layers: s.layers })))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const types = useMemo(() => (T ? cellTypes(objects, T, selectionCells({ objects, selectedIds, activeBaySelection })) : []), [objects, T, selectedIds, activeBaySelection])
  if (!T?.types?.length) return null
  const one = types.length === 1 ? typeById(T, types[0].id) : null
  // a locked rack's elevation is not changed (STUDIO.md §7a Locks)
  const locked = [...selectedIds, ...(activeBaySelection || []).map(e => e.objId)].some(id => isLockedIn(layers, objects.find(o => o.id === id)))
  // the chip: the level count (C1's "6 levels"); its full name is the hover title and the menu's
  const levels = (t) => `${t.levels?.length || 0} level${t.levels?.length === 1 ? '' : 's'}`
  const label = several ? 'Apply elevation' : one ? levels(one) : 'Mixed'
  const title = several ? 'Apply an elevation to the selected rows' : one ? nameOf(T, one) : `Mixed: ${types.map(x => { const y = typeById(T, x.id); return y ? nameOf(T, y) : '—' }).join(', ')}`
  return (
    <>
      <Chip chipRef={ref} open={open} swatch={!several && one ? one.color : null} label={several ? 'Apply elevation' : 'Elevation'} title={title} locked={locked} onClick={() => setOpen(o => !o)}>{label}</Chip>
      {open && !locked && (
        <Menu label="Elevations" anchor={ref.current} onClose={() => setOpen(false)}>
          {T.types.map(t => <MenuItem key={t.id} swatch={t.color} onClick={() => { assignSelected(store, t.id); setOpen(false) }}>{nameOf(T, t)}</MenuItem>)}
        </Menu>
      )}
    </>
  )
}

/** The More items: Lock, the order, Copy, Cut (the card's More → Object, Arrange) — the ⋯ menu's and the object's
 *  right-click menu's, one list. */
export function MoreItems({ obj, close }) {
  const st = store.getState(), locked = useLocked(obj)
  const run = (fn) => () => { fn(); close() }
  return (
    <>
      {/* the icon on the left (section 9; none yet: an empty slot), the shortcut on the right (only those that work) */}
      <MenuItem icon={{ name: 'Lock' }} keys="Ctrl+L" onClick={run(() => toggleLock(store))}>{locked ? 'Unlock' : 'Lock'}</MenuItem>
      <MenuLine />
      <MenuItem icon={null} onClick={run(st.sendToBack)}>To back</MenuItem>
      <MenuItem icon={null} onClick={run(st.sendBackward)}>Back</MenuItem>
      <MenuItem icon={null} onClick={run(st.bringForward)}>Forward</MenuItem>
      <MenuItem icon={null} onClick={run(st.bringToFront)}>To front</MenuItem>
      <MenuLine />
      <MenuItem icon={null} keys="Ctrl+C" onClick={run(st.copySelected)}>Copy</MenuItem>
      <MenuItem icon={null} keys="Ctrl+X" onClick={run(cutSelection)}>Cut</MenuItem>
    </>
  )
}
/** ⋯ More (the rack bar's last button). */
function MoreMenu({ obj }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return (
    <span ref={ref} style={{ display: 'flex' }}>
      <IconBtn name="More" label="More" onClick={() => setOpen(o => !o)} />
      {open && (
        <Menu label="More" anchor={ref.current} onClose={() => setOpen(false)}>
          <MoreItems obj={obj} close={() => setOpen(false)} />
        </Menu>
      )}
    </span>
  )
}

const tool = (t) => () => { endTool(store); store.getState().setActiveTool(t) }

/** Lock / Unlock in one click (Ctrl+L): every bar that has a selection to lock (STUDIO.md §7a) — locked when all of the
 *  selection is. */
function LockBtn() {
  const locked = useCanvasStore(s => s.selectedIds.length > 0 && s.selectedIds.every(id => isLockedIn(s.layers, s.objects.find(o => o.id === id))))
  return <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
}

function RackBar({ obj }) {
  const locked = useLocked(obj)
  const beams = obj.beams || [96]
  return (
    <>
      <ElevationChip />
      <Sep />
      {/* a locked rack is not resized: no bay added or removed (STUDIO.md §7a Locks) */}
      <IconBtn name="Add bay" label="Add bay" title="Add a bay at the far end" locked={locked} onClick={() => addBayTo(obj)} />
      <IconBtn name="Remove bay" label="Remove bay" title={obj.activeBayIdx != null ? `Remove bay ${obj.activeBayIdx + 1}` : 'Remove the last bay'} disabled={beams.length <= 1} locked={locked} onClick={() => removeBayFrom(obj)} />
      <IconBtn name="Split" label="Split" title="Split (S)" locked={locked} onClick={tool(SPLIT_TOOL)} />
      <IconBtn name="Row group" label="Row group" title="Put this row in a Row group (G)" locked={locked} onClick={groupSelectedRows} />
      <IconBtn name="Rotate" label="Rotate" title="Rotate 90°" locked={locked} onClick={() => rotateQuarter(obj)} />
      <Sep />
      <LockBtn />
      <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
      <MoreMenu obj={obj} />
    </>
  )
}

/** The rows' figures for the bar: "6 rows · 642 positions" — rows counted by section, positions as the card counts
 *  them (the bay ledger's, else the rack's full capacity). */
export function rowsFigure(objects, ids, gridSize, ledger, elevations) {
  const rows = sectionsOf(objects, ids, gridSize).length
  let positions = 0
  for (const id of ids) {
    const o = objects.find(x => x.id === id), e = ledger?.racks?.get(id), full = o && getRackCapacity(o, undefined, levelsResolver(elevations))
    positions += full && e && e.uncounted ? e.positions : (full?.total || 0)
  }
  return { rows, positions }
}
function RowsCount({ ids }) {
  const { objects, gridSize, elevations } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize || 40, elevations: s.elevations })))
  const ledger = useBayLedger(objects, gridSize)
  const f = useMemo(() => rowsFigure(objects, ids, gridSize, ledger, elevations), [objects, ids.join('|'), gridSize, ledger, elevations])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span aria-label="Rows selected" data-bar-count style={{ padding: '0 8px 0 6px', fontSize: 12, color: B.muted }}>
      <span style={{ fontFamily: MONO, color: B.text }}>{f.rows}</span> rows · <span style={{ fontFamily: MONO, color: B.text }}>{f.positions.toLocaleString('en-US')}</span> positions
    </span>
  )
}

/** Bays picked: Delete bay · the elevation for the bay · Split here (the Split tool, as S) — actions that exist today. */
function BayBar({ several }) {
  return (
    <>
      <ElevationChip />
      <Sep />
      {!several && <IconBtn name="Split" label="Split here" title="Split here (S) — cut at the upright nearest the pointer" onClick={tool(SPLIT_TOOL)} />}
      <IconBtn name="Delete" label={several ? 'Delete bays' : 'Delete bay'} title={several ? 'Delete the bays (Del) — the rows stay' : 'Delete the bay (Del) — the row stays'} danger onClick={deleteSelection} />
    </>
  )
}

function RowsBar({ ids }) {
  return (
    <>
      <RowsCount ids={ids} />
      <Sep />
      <ElevationChip several />
      <Sep />
      <IconBtn name="Row group" label="Row group" title="Put these rows in a Row group (G)" onClick={groupSelectedRows} />
      <LockBtn />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
    </>
  )
}

/** Several kinds selected together: the count, then only the actions every one of them has — Lock, Duplicate, Delete. */
function MixedBar({ objs }) {
  const st = store.getState(), layers = useCanvasStore(s => s.layers), locked = objs.every(o => isLockedIn(layers, o))
  return (
    <>
      <span aria-label="Items selected" data-bar-count style={{ padding: '0 8px 0 6px', fontSize: 12, color: B.muted }}>
        <span style={{ fontFamily: MONO, color: B.text }}>{objs.length}</span> selected
      </span>
      <Sep />
      <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
      <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
    </>
  )
}

/** 40 ft → 40′; 40.5 → 40′ 6″ (C6's size fields) */
const feet = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′ ${i}″` : `${f}′` }
/** A zone's width or length, typed (40′, 40' 6", 40) — the card's own write: zoneSized, one undo step. */
function SizeField({ obj, k, aria }) {
  const locked = useLocked(obj)
  const gs = store.getState().gridSize || 40
  const shown = feet(obj[k], gs)
  const [text, setText] = useState(null)
  const commit = () => {
    const t = text; setText(null)
    if (t == null) return
    const ft = parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"'))
    if (ft == null) return
    const st = store.getState(), cur = st.objects.find(o => o.id === obj.id)
    if (!cur || Math.abs(ft * gs - cur[k]) < 1e-6) return
    st.commitObjectUpdate(obj.id, zoneSized(st.objects, cur, { [k]: ft * gs }, { gridSize: gs }))
  }
  return (
    <input aria-label={aria} className="st-field" value={text ?? shown} disabled={locked} title={locked ? 'Locked' : undefined} onChange={e => setText(e.target.value)} onFocus={e => { setText(shown); requestAnimationFrame(() => e.target.select()) }}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(null); e.currentTarget.blur() } }}
      style={{ height: 28, width: 46, boxSizing: 'border-box', padding: 0, border: 0, borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, textAlign: 'center', flexShrink: 0, ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }} />
  )
}

/** A section (STUDIO.md §7a Sections): Colour ▾ · (with a Fence or a Wall: Add door — the door tool on its edges) · Lock ·
 *  Duplicate · Delete. */
function SectionSelBar({ obj }) {
  const locked = useLocked(obj)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const k = colorOf(obj)
  return (
    <>
      <Chip chipRef={ref} open={open} swatch={k ? k.c : '#F4F8F5'} label="Colour" title={locked ? 'Locked' : 'Colour'} locked={locked} onClick={() => setOpen(o => !o)}>{k ? k.name : 'No colour'}</Chip>
      {open && !locked && (
        <Menu label="Section colour" anchor={ref.current} onClose={() => setOpen(false)}>
          <MenuItem swatch="#F4F8F5" onClick={() => { setSectionColor(store, null); setOpen(false) }}>No colour</MenuItem>
          {SECTION_COLORS.map(c => <MenuItem key={c.id} swatch={c.c} onClick={() => { setSectionColor(store, c.id); setOpen(false) }}>{c.name}</MenuItem>)}
        </Menu>
      )}
      <Sep />
      {hasBoundary(obj) && (
        <button type="button" title={locked ? 'Locked' : "Add door — on this section's edges (Esc ends)"} disabled={locked} onClick={() => startSectionDoors(store, obj.id)}
          style={{ ...toggleBtn(false), ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>Add door</button>
      )}
      <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
      <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicateSections(store)} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
    </>
  )
}

function ZoneBar({ obj }) {
  const locked = useLocked(obj)
  const st = store.getState()
  return (
    <>
      <SizeField obj={obj} k="width" aria="Zone width" />
      <span style={{ padding: '0 4px', color: B.muted }}>×</span>
      <SizeField obj={obj} k="height" aria="Zone length" />
      <Sep />
      <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
      <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
    </>
  )
}

/** A text toggle in a bar (Show clearances): pressed = active fill + accent. */
const toggleBtn = (on) => ({ height: 32, padding: '0 10px', border: 0, borderRadius: 8, fontSize: 12, background: on ? B.active : 'transparent', color: on ? B.accent : B.text, flexShrink: 0 })

/* Show clearances: the column clearance tags on the plan while it is on (canvas2/clearanceView.js — otherwise they
   show only during an action) */
function ColumnBar({ one = false }) {
  const show = useClearanceView(s => s.show), mine = useColumnPick(s => s.show)
  // one column picked: Show clearances is that column's only — on when it is picked
  if (one) return <><button type="button" aria-pressed={!!mine} title="This column's clear distances on the plan" onClick={() => setColumnClearances(!mine)} style={toggleBtn(!!mine)}>Show clearances</button><Sep /><ColumnLockBtn /></>
  return <><button type="button" aria-pressed={!!show} title="The columns' clear distances on the plan" onClick={() => setShowClearances(!show)} style={toggleBtn(!!show)}>Show clearances</button><Sep /><ColumnLockBtn /></>
}
/** A column's Lock: the Columns layer's padlock (STUDIO.md §7a Locks) — pressed while the layer is locked; one click
 *  flips it, the column staying selected (Ctrl+L the same). */
const columnsLocked = (s) => !!s.layers.find(l => l.id === 'columns')?.locked
function ColumnLockBtn() {
  const locked = useCanvasStore(columnsLocked)
  return <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Columns layer locked — Unlock (Ctrl+L)' : 'Lock the Columns layer (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
}

/** The bar's one faint hint line per state (STUDIO.md §6): rows, bays, a column whose layer is unlocked; none else (the
 *  Row group's is in its mode bar). */
export function barHint(kind, columnsLayerLocked) {
  if (kind === 'rack' || kind === 'rows') return 'Shift+click to add rows · drag to move'
  if (kind === 'bay' || kind === 'bays') return 'Shift+click or Shift+drag to add bays'
  if (kind === 'column' && !columnsLayerLocked) return 'Drag to move its line'
  return null
}

function AisleBar({ obj }) {
  const locked = useLocked(obj)
  const st = store.getState()
  return <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
}

function BuildingBar({ obj }) {
  const locked = useLocked(obj)
  const T = useCanvasStore(s => s.elevations)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const wallT = obj.wallThicknessFt || 0.25
  // the card's own write (PropertiesPanel's BuildingFields): the wall thickness, and its drawn stroke with it
  const setWall = (v) => store.getState().updateObject(obj.id, { wallThicknessFt: v, strokeWidth: Math.max(2, v * gridSize * 0.5) })
  const clear = projectOf(T)?.rules?.wallClearIn
  return (
    <>
      <span style={{ color: B.muted, fontSize: 12, padding: '0 6px 0 4px' }}>Thickness</span>
      <div role="group" aria-label="Wall thickness" style={{ display: 'flex', padding: 2, borderRadius: 6, background: B.inset }}>
        {[0.25, 0.5, 0.75, 1].map(v => (
          <button key={v} type="button" aria-pressed={wallT === v} onClick={() => setWall(v)} disabled={locked} title={locked ? 'Locked' : undefined}
            style={{ height: 28, padding: '0 8px', border: 0, borderRadius: 6, fontFamily: MONO, fontSize: 12, background: wallT === v ? B.active : 'transparent', color: wallT === v ? B.accent : B.muted, ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>{v * 12}″</button>
        ))}
      </div>
      <Sep />
      <button type="button" title="Add door — hover a wall, click to place (Esc ends)" onClick={tool(DOOR_TOOL)} style={toggleBtn(false)}>Add door</button>
      {/* the project's wall clearance — set in Project settings, which asks before it regenerates */}
      <button type="button" title="Wall clearance — Project settings" onClick={() => openSetup('settings')} style={toggleBtn(false)}>
        Wall clearance{clear != null && <span style={{ fontFamily: MONO, color: B.muted, marginLeft: 6 }}>{clear}″</span>}
      </button>
      <Sep />
      <LockBtn />
    </>
  )
}

/** The bar, placed over the selection. */
export function SelectionBar() {
  const { objects, selectedIds, activeWall, activeTool, zoom, panX, panY, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, selectedIds: s.selectedIds, activeWall: s.activeWall, activeTool: s.activeTool, zoom: s.zoom, panX: s.panX, panY: s.panY, activeBaySelection: s.activeBaySelection })))
  const dragging = useDragPreview(s => s.dragging)
  const labelSize = useLabelPrefs(s => s.labelSize), gridSize = useCanvasStore(s => s.gridSize) || 40
  const placing = usePlacement(s => s.active)
  const pending = useRowGroup(s => !!s.pending)
  const ref = useRef(null)
  const [size, setSize] = useState(null)
  const [labels, setLabels] = useState(EMPTY)
  const column = useColumnPick(s => s.pick)
  const colsLocked = useCanvasStore(columnsLocked)
  const what = useMemo(() => barFor(objects, selectedIds, activeWall, activeBaySelection, gridSize, column), [objects, selectedIds, activeWall, activeBaySelection, gridSize, column])
  // not in the Row group (no edit row: its mode bar — STUDIO.md §7a Modes), nor while an apply is asked
  const hidden = !what || !isPlainTool(activeTool) || dragging || !!placing || pending
  useLayoutEffect(() => {
    if (hidden || !ref.current) return
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight
    setSize(s => (s && s.w === w && s.h === h ? s : { w, h }))
    // every label drawn on the plan, as it is on screen now: the bar never covers one (canvas2/LabelOps.jsx names them)
    const next = labelRectsOnScreen(ref.current.parentElement)
    setLabels(l => (sameRects(l, next) ? l : next))
  })
  if (hidden) return null
  const view = { zoom, panX, panY }, lz = labelScale(labelSize, gridSize)
  const box = screenBox(what.objs, objects, view), reach = screenBox(what.objs, objects, view, lz)
  if (!box) return null
  const host = ref.current?.parentElement?.getBoundingClientRect()
  const win = { w: host?.width || window.innerWidth, h: host?.height || window.innerHeight }
  const card = typeof document !== 'undefined' ? document.querySelector('[data-island="right-card"]')?.getBoundingClientRect() : null
  const cardRect = card ? { left: card.left - (host?.left || 0), top: card.top - (host?.top || 0), right: card.right - (host?.left || 0), bottom: card.bottom - (host?.top || 0) } : null
  const at = size ? placeBarClear(box, reach, size.w, size.h, win, cardRect, labels) : null
  const obj = what.main || what.objs[0]
  const hint = barHint(what.kind, colsLocked)
  const bar = (
    <>
      {what.kind === 'rack' && <RackBar obj={obj} />}
      {what.kind === 'rows' && <RowsBar ids={what.objs.map(o => o.id)} />}
      {what.kind === 'mixed' && <MixedBar objs={what.objs} />}
      {what.kind === 'bay' && <BayBar />}
      {what.kind === 'bays' && <BayBar several />}
      {what.kind === 'zone' && <ZoneBar obj={obj} />}
      {what.kind === 'section' && <SectionSelBar obj={obj} />}
      {what.kind === 'column' && <ColumnBar one={!!what.one} />}
      {what.kind === 'aisle' && <AisleBar obj={obj} />}
      {what.kind === 'building' && <BuildingBar obj={obj} />}
    </>
  )
  return (
    <div ref={ref} role="toolbar" aria-label="Selection" data-selection-bar={what.kind} data-flipped={at?.flipped ? 'true' : undefined} className="st-pill"
      onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
      style={{ ...pill, ...(hint ? { flexDirection: 'column', alignItems: 'center', gap: 0 } : null), position: 'absolute', zIndex: 140, left: at ? at.left : -9999, top: at ? at.top : -9999, visibility: at ? 'visible' : 'hidden' }}>
      {hint
        ? <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{bar}</div>
            {/* the state's one faint hint line (11px, muted) */}
            <div data-bar-hint style={{ fontSize: 11, color: B.muted, padding: '1px 8px 2px' }}>{hint}</div>
          </>
        : bar}
    </div>
  )
}

/* ── the right-click menus: on empty floor (§6) Paste · Fill racking · Add zone ▾; on an object, its More items ── */
export const useFloorMenu = create(() => ({ at: null, objId: null }))
/** A right-click on the canvas (the browser's own menu never): on an object it is selected — its group, as a click
 *  picks it — and its More menu opens there; a building is an object by its wall, its inside is the floor; on empty
 *  floor the floor menu opens. → 'object' | 'floor' | false (another tool on). */
export function openFloorMenu(e, host) {
  e.preventDefault()
  const st = store.getState()
  if (!isPlainTool(st.activeTool)) return false
  const r = host.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top }
  const w = screenToWorld({ zoom: st.zoom, panX: st.panX, panY: st.panY }, p), gs = st.gridSize || 40
  const hit = hitTest(st.objects, st.layers, w.x, w.y, st.zoom, gs)
  let obj = hit && st.objects.find(o => o.id === hit)
  // a press on a wall that a rack only reached by its pick padding is the wall's (hitTest.js wallBeatsPadding)
  const padWall = wallBeatsPadding(st.objects, st.layers, w.x, w.y, st.zoom, gs, obj)
  if (padWall) obj = st.objects.find(o => o.id === padWall.objId)
  else if (!obj || FP.has(obj.type)) { const wall = fpWallHitTest(st.objects, st.layers, w.x, w.y, st.zoom, gs); obj = wall ? st.objects.find(o => o.id === wall.objId) : null }
  const at = { x: e.clientX, y: e.clientY }
  if (!obj) { useFloorMenu.setState({ at, objId: null }); return 'floor' }
  if (!st.selectedIds.includes(obj.id)) {
    const g = (st.groups || []).find(x => x.ids.includes(obj.id))
    if (g) st.selectGroup(g.ids); else st.selectObject(obj.id, false)
  }
  useFloorMenu.setState({ at, objId: obj.id })
  return 'object'
}
export function FloorMenu() {
  const at = useFloorMenu(s => s.at), objId = useFloorMenu(s => s.objId)
  const clipboard = useCanvasStore(s => s.clipboard)
  const obj = useCanvasStore(s => (objId ? s.objects.find(o => o.id === objId) : null))
  const [zones, setZones] = useState(false)
  if (!at) return null
  const close = () => { setZones(false); useFloorMenu.setState({ at: null, objId: null }) }
  const run = (fn) => () => { close(); fn() }
  if (objId) return <Menu label="Object" at={at} onClose={close}><MoreItems obj={obj} close={close} /></Menu>
  return (
    <Menu label="Floor" at={at} onClose={close}>
      <MenuItem icon={null} keys="Ctrl+V" disabled={!clipboard?.length} title="Paste (Ctrl+V)" onClick={run(pasteHere)}>Paste</MenuItem>
      <MenuItem icon={{ name: 'Fill racking' }} keys="F" title="Fill racking (F) — drag a box" onClick={run(tool(FILL_TOOL))}>Fill racking</MenuItem>
      <MenuItem icon={{ name: 'Zones', kind: 'rail' }} onClick={() => setZones(z => !z)} right={<Icon name="Chevron" size={12} color={B.muted} style={zones ? { transform: 'rotate(180deg)' } : undefined} />}>Add zone</MenuItem>
      {zones && ZONE_KINDS.map(z => <MenuItem key={z.type} icon={hasIcon(z.label, 'object') ? { name: z.label, kind: 'object' } : null} onClick={run(() => pickLibraryItem(z.type))}>{z.label}</MenuItem>)}
    </Menu>
  )
}
