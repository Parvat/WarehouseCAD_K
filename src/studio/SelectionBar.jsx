import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { worldBoundsOf, hitTest } from '../canvas2/hitTest'
import { screenToWorld } from '../canvas2/viewport'
import { useDragPreview } from '../canvas2/dragPreview'
import { usePlacement } from '../utils/placement'
import { useRowGroup } from '../utils/rowGroupTool'
import { SPLIT_TOOL } from '../utils/splitTool'
import { FILL_TOOL } from '../utils/fillTool'
import { endTool } from '../utils/toolSwitch'
import { isBeamRack, typeById } from '../utils/elevations'
import { selectionCells, cellTypes } from '../utils/elevSelection'
import { assignSelected } from '../utils/elevTab'
import { nameOf, openSetup, projectOf } from '../utils/project'
import { zoneSized } from '../utils/floorClamp'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { useColumnCheck } from '../generate/useColumnCheck'
import { ZONE_KINDS } from '../generate/rackingArea'
import { B, MONO, pill, Sep, IconBtn, Chip, Menu, MenuItem, MenuLine } from './barParts'
import { Icon } from './Icon'
import { addBayTo, removeBayFrom, rotateQuarter, duplicateSelection, deleteSelection, pasteHere, groupSelectedRows, pickLibraryItem } from './selectionActions'

/* ── The selection bar (STUDIO.md §1, §6; design/studio/Studio.dc.html C1 and C6) ──────────────────────────────────
   A dark pill (radius 12) floating just above the selection — never over it: below it when there is no room above
   (under the top islands) — kept off the rail and the right card, following the pan and the zoom (the store's view).
   Its contents per selection, as the §6 table — every action is the one the card, a key or the library already makes
   (selectionActions.js):
     one rack row   Elevation ▾ | Add bay · Remove bay · Split · Row group · Rotate | Duplicate · Delete · ⋯
     several rows   Apply elevation ▾ | Row group · Delete
     zone           W × L | Lock · Duplicate · Delete
     column grid    Show clearances
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

/** What the bar is for, and on what: { kind, objs } or null. */
export function barFor(objects, selectedIds, activeWall) {
  const sel = objects.filter(o => selectedIds.includes(o.id))
  if (!sel.length && activeWall) { const fp = objects.find(o => o.id === activeWall.objId); return fp ? { kind: 'building', objs: [fp] } : null }
  if (sel.length === 1) {
    const o = sel[0]
    if (isBeamRack(o)) return { kind: 'rack', objs: sel }
    if (isZone(o)) return { kind: 'zone', objs: sel }
    if (isColumn(o)) return { kind: 'column', objs: sel }
    if (o.type === 'aisle') return { kind: 'aisle', objs: sel }
    if (FP.has(o.type)) return { kind: 'building', objs: sel }
    return null
  }
  if (sel.length > 1 && sel.every(isBeamRack)) return { kind: 'rows', objs: sel }
  return null
}

/** The selection's box on screen (canvas px): the union of its world boxes, through the view. */
export function screenBox(objs, objects, view) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const o of objs) {
    const b = worldBoundsOf(o, objects)
    if (!b) continue
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height)
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

/* ── the bars, per selection ── */

/** The selection's elevation (C1 chip), and the elevations to apply (one undo step: assignSelected — the Elevations tab's
 *  Apply to selected rows). */
function ElevationChip({ several = false }) {
  const { objects, T, selectedIds, activeBaySelection } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, selectedIds: s.selectedIds, activeBaySelection: s.activeBaySelection })))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const types = useMemo(() => (T ? cellTypes(objects, T, selectionCells({ objects, selectedIds, activeBaySelection })) : []), [objects, T, selectedIds, activeBaySelection])
  if (!T?.types?.length) return null
  const one = types.length === 1 ? typeById(T, types[0].id) : null
  const label = several ? 'Apply elevation' : one ? nameOf(T, one) : 'Mixed elevations'
  return (
    <>
      <Chip chipRef={ref} open={open} swatch={!several && one ? one.color : null} label={several ? 'Apply elevation' : 'Elevation'} title={several ? 'Apply an elevation to the selected rows' : 'The row\'s elevation — pick one to apply it'} onClick={() => setOpen(o => !o)}>{label}</Chip>
      {open && (
        <Menu label="Elevations" anchor={ref.current} onClose={() => setOpen(false)}>
          {T.types.map(t => <MenuItem key={t.id} swatch={t.color} onClick={() => { assignSelected(store, t.id); setOpen(false) }}>{nameOf(T, t)}</MenuItem>)}
        </Menu>
      )}
    </>
  )
}

/** ⋯ More: Lock, the order, Copy, Cut (the card's More → Object, Arrange). */
function MoreMenu({ obj }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const st = store.getState()
  const run = (fn) => () => { fn(); setOpen(false) }
  return (
    <span ref={ref} style={{ display: 'flex' }}>
      <IconBtn name="More" label="More" onClick={() => setOpen(o => !o)} />
      {open && (
        <Menu label="More" anchor={ref.current} onClose={() => setOpen(false)}>
          <MenuItem onClick={run(st.toggleLockSelected)}>{obj.locked ? 'Unlock' : 'Lock'}</MenuItem>
          <MenuLine />
          <MenuItem onClick={run(st.sendToBack)}>To back</MenuItem>
          <MenuItem onClick={run(st.sendBackward)}>Back</MenuItem>
          <MenuItem onClick={run(st.bringForward)}>Forward</MenuItem>
          <MenuItem onClick={run(st.bringToFront)}>To front</MenuItem>
          <MenuLine />
          <MenuItem onClick={run(st.copySelected)}>Copy</MenuItem>
          <MenuItem onClick={run(st.cutSelected)}>Cut</MenuItem>
        </Menu>
      )}
    </span>
  )
}

const tool = (t) => () => { endTool(store); store.getState().setActiveTool(t) }

function RackBar({ obj }) {
  const beams = obj.beams || [96]
  return (
    <>
      <ElevationChip />
      <Sep />
      <IconBtn name="Add bay" label="Add bay" title="Add a bay at the far end" onClick={() => addBayTo(obj)} />
      <IconBtn name="Remove bay" label="Remove bay" title={obj.activeBayIdx != null ? `Remove bay ${obj.activeBayIdx + 1}` : 'Remove the last bay'} disabled={beams.length <= 1} onClick={() => removeBayFrom(obj)} />
      <IconBtn name="Split" label="Split" title="Split (S)" onClick={tool(SPLIT_TOOL)} />
      <IconBtn name="Row group" label="Row group" title="Put this row in a Row group (G)" onClick={groupSelectedRows} />
      <IconBtn name="Rotate" label="Rotate" title="Rotate 90°" onClick={() => rotateQuarter(obj)} />
      <Sep />
      <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
      <MoreMenu obj={obj} />
    </>
  )
}

function RowsBar() {
  return (
    <>
      <ElevationChip several />
      <Sep />
      <IconBtn name="Row group" label="Row group" title="Put these rows in a Row group (G)" onClick={groupSelectedRows} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
    </>
  )
}

/** 40 ft → 40′; 40.5 → 40′ 6″ (C6's size fields) */
const feet = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′ ${i}″` : `${f}′` }
/** A zone's width or length, typed (40′, 40' 6", 40) — the card's own write: zoneSized, one undo step. */
function SizeField({ obj, k, aria }) {
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
    <input aria-label={aria} className="st-field" value={text ?? shown} onChange={e => setText(e.target.value)} onFocus={e => { setText(shown); requestAnimationFrame(() => e.target.select()) }}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(null); e.currentTarget.blur() } }}
      style={{ height: 28, width: 46, boxSizing: 'border-box', padding: 0, border: 0, borderRadius: 6, background: B.inset, fontFamily: MONO, fontSize: 12, color: B.strong, textAlign: 'center', flexShrink: 0 }} />
  )
}

function ZoneBar({ obj }) {
  const st = store.getState()
  return (
    <>
      <SizeField obj={obj} k="width" aria="Zone width" />
      <span style={{ padding: '0 4px', color: B.muted }}>×</span>
      <SizeField obj={obj} k="height" aria="Zone length" />
      <Sep />
      <IconBtn name="Lock" label={obj.locked ? 'Unlock' : 'Lock'} title={obj.locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={!!obj.locked} pressed={!!obj.locked} onClick={st.toggleLockSelected} />
      <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} />
      <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} />
    </>
  )
}

/** A text toggle in a bar (Show clearances): pressed = active fill + accent. */
const toggleBtn = (on) => ({ height: 32, padding: '0 10px', border: 0, borderRadius: 8, fontSize: 12, background: on ? B.active : 'transparent', color: on ? B.accent : B.text, flexShrink: 0 })

function ColumnBar() {
  const { showMarks, setShowMarks } = useColumnCheck()
  return <button type="button" aria-pressed={!!showMarks} title="The column check's clearances and marks on the plan" onClick={() => setShowMarks(!showMarks)} style={toggleBtn(!!showMarks)}>Show clearances</button>
}

function AisleBar({ obj }) {
  const st = store.getState()
  return <IconBtn name="Lock" label={obj.locked ? 'Unlock' : 'Lock'} title={obj.locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={!!obj.locked} pressed={!!obj.locked} onClick={st.toggleLockSelected} />
}

function BuildingBar({ obj }) {
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
          <button key={v} type="button" aria-pressed={wallT === v} onClick={() => setWall(v)}
            style={{ height: 28, padding: '0 8px', border: 0, borderRadius: 6, fontFamily: MONO, fontSize: 12, background: wallT === v ? B.active : 'transparent', color: wallT === v ? B.accent : B.muted }}>{v * 12}″</button>
        ))}
      </div>
      <Sep />
      <button type="button" title="A man door from the library" onClick={() => pickLibraryItem('man_door')} style={toggleBtn(false)}>Add door</button>
      {/* the project's wall clearance — set in Project settings, which asks before it regenerates */}
      <button type="button" title="Wall clearance — Project settings" onClick={() => openSetup('settings')} style={toggleBtn(false)}>
        Wall clearance{clear != null && <span style={{ fontFamily: MONO, color: B.muted, marginLeft: 6 }}>{clear}″</span>}
      </button>
    </>
  )
}

/** The bar, placed over the selection. */
export function SelectionBar() {
  const { objects, selectedIds, activeWall, activeTool, zoom, panX, panY } = useCanvasStore(useShallow(s => ({ objects: s.objects, selectedIds: s.selectedIds, activeWall: s.activeWall, activeTool: s.activeTool, zoom: s.zoom, panX: s.panX, panY: s.panY })))
  const dragging = useDragPreview(s => s.dragging)
  const placing = usePlacement(s => s.active)
  const grouped = useRowGroup(s => s.keys.length > 0 || !!s.pending)
  const ref = useRef(null)
  const [size, setSize] = useState(null)
  const what = useMemo(() => barFor(objects, selectedIds, activeWall), [objects, selectedIds, activeWall])
  const hidden = !what || activeTool !== TOOLS.SELECT || dragging || !!placing || grouped
  useLayoutEffect(() => {
    if (hidden || !ref.current) return
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight
    setSize(s => (s && s.w === w && s.h === h ? s : { w, h }))
  })
  if (hidden) return null
  const box = screenBox(what.objs, objects, { zoom, panX, panY })
  if (!box) return null
  const host = ref.current?.parentElement?.getBoundingClientRect()
  const win = { w: host?.width || window.innerWidth, h: host?.height || window.innerHeight }
  const card = typeof document !== 'undefined' ? document.querySelector('[data-island="right-card"]')?.getBoundingClientRect() : null
  const at = size ? placeBar(box, size.w, size.h, win, card ? { left: card.left - (host?.left || 0), top: card.top - (host?.top || 0), bottom: card.bottom - (host?.top || 0) } : null) : null
  const obj = what.objs[0]
  return (
    <div ref={ref} role="toolbar" aria-label="Selection" data-selection-bar={what.kind} data-flipped={at?.flipped ? 'true' : undefined} className="st-pill"
      onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
      style={{ ...pill, position: 'absolute', zIndex: 140, left: at ? at.left : -9999, top: at ? at.top : -9999, visibility: at ? 'visible' : 'hidden' }}>
      {what.kind === 'rack' && <RackBar obj={obj} />}
      {what.kind === 'rows' && <RowsBar />}
      {what.kind === 'zone' && <ZoneBar obj={obj} />}
      {what.kind === 'column' && <ColumnBar />}
      {what.kind === 'aisle' && <AisleBar obj={obj} />}
      {what.kind === 'building' && <BuildingBar obj={obj} />}
    </div>
  )
}

/* ── the floor's right-click menu (§6): Paste · Fill racking · Add zone ▾ ── */
export const useFloorMenu = create(() => ({ at: null }))
/** A right-click on the canvas: on empty floor (nothing under it but the building's floor) the menu opens there. */
export function openFloorMenu(e, host) {
  e.preventDefault()
  const st = store.getState()
  if (st.activeTool !== TOOLS.SELECT) return false
  const r = host.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top }
  const w = screenToWorld({ zoom: st.zoom, panX: st.panX, panY: st.panY }, p)
  const hit = hitTest(st.objects, st.layers, w.x, w.y, st.zoom, st.gridSize || 40)
  const obj = hit && st.objects.find(o => o.id === hit)
  if (obj && !FP.has(obj.type)) return false
  useFloorMenu.setState({ at: { x: e.clientX, y: e.clientY } })
  return true
}
export function FloorMenu() {
  const at = useFloorMenu(s => s.at)
  const clipboard = useCanvasStore(s => s.clipboard)
  const [zones, setZones] = useState(false)
  if (!at) return null
  const close = () => { setZones(false); useFloorMenu.setState({ at: null }) }
  const run = (fn) => () => { close(); fn() }
  return (
    <Menu label="Floor" at={at} onClose={close}>
      <MenuItem disabled={!clipboard?.length} title="Paste (Ctrl+V)" onClick={run(pasteHere)}>Paste</MenuItem>
      <MenuItem title="Fill racking (F) — drag a box" onClick={run(tool(FILL_TOOL))}>Fill racking</MenuItem>
      <MenuItem onClick={() => setZones(z => !z)} right={<Icon name="Chevron" size={12} color={B.muted} style={zones ? { transform: 'rotate(180deg)' } : undefined} />}>Add zone</MenuItem>
      {zones && ZONE_KINDS.map(z => <MenuItem key={z.type} swatch={z.color} onClick={run(() => pickLibraryItem(z.type))}><span style={{ paddingLeft: 8 }}>{z.label}</span></MenuItem>)}
    </Menu>
  )
}
