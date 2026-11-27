import { BEAM_TYPES, namesFor } from '../../utils/rackTypes'
import { useState } from 'react'
import { TEXT_FONTS, textFace } from '../../theme/tokens'
import { useCanvasStore } from '../../store/useCanvasStore'
import { toggleLock, isLockedIn } from '../../utils/layers'
import { useLocked } from '../../studio/useLocked'
import { deleteSelectionWithAreas } from '../../utils/deleteSelection'
import { useShallow } from 'zustand/react/shallow'
import { pxToFtInCard as pxToFtIn } from '../../utils/units'   // (units) the project's units, as a card shows them (mm in metric)
import { TextSizeField } from '../../studio/textSizeCard'
import { rotateTexts, alignTexts, setLineLength, setLineAngle, setCircleRadius, setPolylineClosed, polyMeasures, convertRectToZone, angleOf } from '../../utils/drawTool'
import { isDrawn, drawnGeom, hasEnds, endsOf, hasCorners, roundOn, blockSize, BLOCK_SIZES, canDim } from '../../render/drawnShapes'
import { rememberStylesOf } from '../../utils/drawStyles'
import { WidthPick } from '../../studio/drawnBar'
import { Swatch } from '../../studio/Swatch'
import { SizeInput } from '../../studio/textSizeCard'
import { shelvingLabel, shelvingTag, shelvesOf, isStandard, SHELF_UNIT_IN, SHELF_DEPTH_IN, unitWidthChange, unitCountChange, depthChange, shelvingUsable } from '../../utils/shelving'   // (rack-round3 6)
import { shelvingUnits } from '../../render/rackOps'
import { useColumnCheck } from '../../generate/useColumnCheck'   // (lane-fixes 5)
import { LaneCard } from '../../studio/LaneCard'   // (r3-drive-in)
import { laneEngineOn } from '../../racks/laneEngine'
import { CantileverCard } from '../../studio/CantileverCard'   // (r6-cantilever)
import { Inches } from '../../studio/LaneCard'
import { shelfSpec, backToBackChange, SHELF_HEIGHT_IN } from '../../racks/shelving'   // (r7-shelving)
import { nanoid as newIdForZone } from 'nanoid'

/** (dealer audit; d1-final, the mockups' cards) A drawn shape's style after drawing — the Draw bar's own controls:
 *  Stroke colour and width (px), Solid | Dashed; a closed shape's Fill — None | Tinted | Hatched — and its colour. Each
 *  change one undo. */
function DrawnStyleFields({ obj }) {
  const closed = drawnGeom(obj).closed && obj.type !== 'block_arrow'
  // (d1-polish) each change one undo, and its kind's last used style (a new one starts with it)
  const set = (u) => { useCanvasStore.getState().commitObjectUpdate(obj.id, u); rememberStylesOf(useCanvasStore, [obj.id]) }
  if (obj.type === 'block_arrow') return <BlockArrowFields obj={obj} set={set} />
  const fillOn = !obj.noFill && !!obj.fill, kind = !fillOn ? 'none' : obj.fillStyle === 'hatch' ? 'hatch' : 'tint'
  const fillColor = obj.fill || obj.stroke || '#1F2321'
  /* (drag-perf-bar) the bar's order: stroke and fill colour side by side, stroke width, solid or dashed, fill none · tinted ·
     hatched, corners, end style where it applies, the ruler */
  return (
    <>
      <Field label="Colour">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Swatch label="Stroke colour" value={obj.stroke || '#1F2321'} onPick={(c) => set({ stroke: c || '#1F2321' })} />
          {closed && <Swatch label="Fill" none value={fillOn ? obj.fill : null} onPick={(c) => set(c ? { fill: c, noFill: false, fillStyle: obj.fillStyle || 'tint' } : { noFill: true })} />}
        </div>
      </Field>
      <Field label="Stroke">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* (d1-polish) 1 2 3 4 6 8 px as line pictures (the bar's dropdown) */}
          <WidthPick value={obj.strokeWidth || 2} onPick={(w) => set({ strokeWidth: w })} />
          <span style={{ fontSize: 12, color: C.muted, fontFamily: MONO }}>{obj.strokeWidth || 2} px</span>
        </div>
      </Field>
      <Field label="Line">
        <Seg aria="Line style" options={[
          { value: 'solid', label: 'Solid', on: !obj.dashed, onClick: () => set({ dashed: false }) },
          { value: 'dashed', label: 'Dashed', on: !!obj.dashed, onClick: () => set({ dashed: true }) },
        ]} />
      </Field>
      {closed && (
        <Field label="Fill">
          <Seg aria="Fill style" options={[
            { value: 'none', label: 'None', on: kind === 'none', onClick: () => set({ noFill: true }) },
            { value: 'tint', label: 'Tinted', on: kind === 'tint', onClick: () => set({ fill: fillColor, noFill: false, fillStyle: 'tint' }) },
            { value: 'hatch', label: 'Hatched', on: kind === 'hatch', onClick: () => set({ fill: fillColor, noFill: false, fillStyle: 'hatch' }) },
          ]} />
        </Field>
      )}
      {/* (d2-arrows) corners Square | Round (a line: its ends flat or round), Round's radius (ft — real size, never over half the shortest side) */}
      {hasCorners(obj) && (
        <Field label={obj.type === 'line' ? 'Ends' : 'Corners'}>
          <Seg aria="Corners" options={[
            { value: 'square', label: 'Square', aria: 'Square', on: !roundOn(obj), onClick: () => set({ corners: 'square' }) },
            { value: 'round', label: 'Round', aria: 'Round', on: roundOn(obj), onClick: () => set({ corners: 'round' }) },
          ]} />
        </Field>
      )}
      {hasCorners(obj) && roundOn(obj) && obj.type !== 'line' && (
        <Field label="Corner radius (ft)"><NumInput aria="Corner radius (ft)" value={Number.isFinite(obj.cornerFt) ? obj.cornerFt : 1} min={0.05} step={0.25} onCommit={v => { if (v > 0) set({ cornerFt: v }) }} /></Field>
      )}
      {/* (d2-arrows) arrowheads: none, end, start, both — a line, an open polyline, an elbow arrow */}
      {hasEnds(obj) && (
        <Field label="Arrowheads">
          <Seg aria="End style" options={[['none', 'None'], ['end', 'End'], ['start', 'Start'], ['both', 'Both']].map(([v, l]) => ({ value: v, label: l, aria: 'Arrowheads ' + l.toLowerCase(), on: endsOf(obj) === v, onClick: () => set({ ends: v }) }))} />
        </Field>
      )}
      {/* (shape-dims) its dimensions on the plan and the PDF — the bar's ruler; off by default, one undo */}
      {canDim(obj) && <ToggleRow label="Dimensions" aria="Dimensions" title="Show its size on the plan and the PDF" on={!!obj.showDims} onClick={() => set({ showDims: !obj.showDims })} />}
    </>
  )
}
/** (d2-arrows) A block arrow's card: its fill colour, its body Width (ft — real size), its words (optional, white, inside)
 *  and their Text size (inches — the CAD text model). Each change one undo. */
function BlockArrowFields({ obj, set }) {
  const gs = useCanvasStore.getState().gridSize || 40
  return (
    <>
      <Field label="Fill">
        <Swatch label="Fill colour" value={obj.fill || '#E07B22'} onPick={(c) => { if (c) set({ fill: c }) }} />
      </Field>
      {/* (d1-polish) its size: a plain number (its body width in inches), a dropdown of 6 8 12 18 24 36 48 — no feet */}
      <Field label="Size"><SizeInput inches={blockSize(obj, gs)} aria="Block arrow size" options={BLOCK_SIZES} onCommit={(v) => { if (v > 0) set({ size: v, bodyW: undefined }) }} /></Field>
      <Field label="Text">
        <TextInput words aria="Arrow text" placeholder="Optional — shown inside" value={obj.text || ''} onCommit={t => set({ text: String(t || '').trim() })} />
      </Field>
      <Field label="Text size">
        <SizeInput inches={obj.labelSizeIn > 0 ? obj.labelSizeIn : 18} aria="Arrow text size" onCommit={(v) => { if (v > 0) set({ labelSizeIn: v }) }} />
      </Field>
    </>
  )
}
/** (dealer audit; d1-final) A drawn shape's own fields, typed: a rectangle's Name (shown inside with its size and area),
 *  Width and Length (ft), Convert to zone; a circle's Radius and Diameter (linked; under 3″ radius refused); a line's
 *  Length (its start held) and Angle; a polyline's Open | Closed, and closed its area and perimeter (sides crossing: the
 *  area a dash). Each change one undo. */
function DrawnSizeFields({ obj, gridSize }) {
  if (obj.type === 'elbow' || obj.type === 'block_arrow') return null   // (d2-arrows) edited by their ends and bend
  const st = useCanvasStore
  const set = (u) => st.getState().commitObjectUpdate(obj.id, u)
  const ft = (px) => Math.round(px / gridSize * 100) / 100
  if (obj.type === 'rect') return (
    <>
      <Field label="Name">
        <TextInput words aria="Name" placeholder="Optional — shown inside" value={obj.name || ''} onCommit={t => set({ name: String(t || '').trim() || undefined })} />
      </Field>
      <Grid2>
        <Field label="Width (ft)"><NumInput aria="Width (ft)" value={ft(obj.width)} min={0.01} step={0.5} onCommit={v => set({ width: v * gridSize })} /></Field>
        <Field label="Length (ft)"><NumInput aria="Length (ft)" value={ft(obj.height)} min={0.01} step={0.5} onCommit={v => set({ height: v * gridSize })} /></Field>
      </Grid2>
      <Btn kind="ghost" aria-label="Convert to zone" title="Turn this rectangle into an office-style zone — the bays under it go, as with any zone"
        onClick={() => convertRectToZone(st, obj.id, newIdForZone)} style={{ width: '100%' }}>Convert to zone</Btn>
    </>
  )
  if (obj.type === 'circle') { const r = obj.rx ?? obj.r; return (
    <Grid2>
      <Field label="Radius (ft)"><NumInput aria="Radius (ft)" value={ft(r)} min={0.01} step={0.5} onCommit={v => setCircleRadius(st, obj.id, v)} /></Field>
      <Field label="Diameter (ft)"><NumInput aria="Diameter (ft)" value={ft(r * 2)} min={0.01} step={0.5} onCommit={v => setCircleRadius(st, obj.id, v / 2)} /></Field>
    </Grid2>
  ) }
  if (obj.type === 'line') return null   // (d1-trim) an annotation: no Length or Angle (the Dimension tool measures)
  const b = drawnGeom(obj).pts || []
  if (!b.length) return null
  const m = obj.type === 'polyline' ? polyMeasures(obj) : null
  const sqft = (px2) => Math.round(px2 / (gridSize * gridSize)).toLocaleString('en-US') + ' sq ft'
  return (
    <>
      {obj.type === 'polyline' && (
        <Field label="Shape">
          <Seg aria="Open or closed" options={[
            { value: 'open', label: 'Open', on: !obj.closed, onClick: () => setPolylineClosed(st, obj.id, false) },
            { value: 'closed', label: 'Closed', on: !!obj.closed, onClick: () => setPolylineClosed(st, obj.id, true) },
          ]} />
        </Field>
      )}
      {/* (d1-bar) no W and H: a polyline is edited by its points and sides, never scaled as a box */}
      {m && obj.closed && (
        <Grid2>
          <Field label="Area"><span data-poly-area style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{m.area == null ? '—' : sqft(m.area)}</span></Field>
          <Field label="Perimeter"><span data-poly-perimeter style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{pxToFtIn(m.perimeter, gridSize)}</span></Field>
        </Grid2>
      )}
      {m && obj.closed && m.crossing && <Note>Its sides cross — no area.</Note>}
    </>
  )
}
/** (d1-final) A text's Box: a frame round its words — its border and its fill (None allowed). Each change one undo. */
function TextBoxFields({ obj }) {
  const set = (u) => { useCanvasStore.getState().commitObjectUpdate(obj.id, u); rememberStylesOf(useCanvasStore, [obj.id]) }   // (d1-polish) the last text style
  return (
    <Field label="Box">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Seg aria="Box" options={[
          { value: 'off', label: 'None', on: !obj.boxed, onClick: () => set({ boxed: false }) },
          { value: 'on', label: 'Box', on: !!obj.boxed, onClick: () => set({ boxed: true }) },
        ]} />
        {obj.boxed && <Swatch label="Box border" value={obj.boxStroke || obj.fill || '#1F2321'} onPick={(c) => set({ boxStroke: c || null })} />}
        {obj.boxed && <Swatch label="Box fill" none value={obj.boxFill || null} onPick={(c) => set({ boxFill: c || null })} />}
      </div>
    </Field>
  )
}
import { RackingAreaPanel } from './panels/RackingAreaPanel'
import { RackRowExtras, MultiBayPanel, CantileverPanel, ColumnGridPanel, DriveInPanel, DriveThroughPanel, PushbackPanel } from '../RightPanel/Rackrowpanel'
import { getLayoutCapacity } from '../../utils/capacity'
import { useBayLedger } from './useBayLedger'
import { PALETTE_COLORS } from '../../constants'
import { isBeamRack } from '../../utils/elevations'
import { setRackDepths } from '../../utils/rackDepthAction'
import { GroupBody } from './GroupPanel'
import { ColorBody } from './ColorPanel'
import { TextBody } from './TextPanel'
import { LabelsBody } from './LabelsPanel'
import { ColumnCheckBody } from './ColumnCheckPanel'
import { ColumnGridHead } from './panels/ColumnGridPanel'
import { SectionMain } from '../../studio/sectionCards'
import { CrossAisleCard } from '../../studio/crossAisleCard'
import { useCrossAislePick } from '../../utils/crossAisleTool'
import { TunnelCard } from '../../studio/tunnelCard'
import { useTunnelPick } from '../../utils/tunnel'
import { RackMain, RowGroupMain, ZoneMain, NothingSelected } from '../../studio/cards'
import { DoorMain } from '../../studio/doorCard'
import { CardLock } from '../../studio/CardLock'
import { isDoor } from '../../utils/doorTool'
import { LayoutSummary, SectionSummary, LineSummary, BaySummary, SelectionSummary, SummaryFold } from '../../studio/summaryCards'
import { useRowGroup, groupRowsNow } from '../../utils/rowGroupTool'
import { sizeUpdate, setBuildingSize } from '../../utils/buildingSize'
import { Head, Sec, Grid2, Field, InlineField, TextInput, NumInput, SelectField, StaticField, Row, ToggleRow, Seg, Btn,
  IconBtn, Note, Hint, SecLabel, Fold, C, MONO, LockedFields } from '../../studio/cardParts'

/* The right card's Properties (Studio, STUDIO.md; design/studio/Studio.dc.html). Each state leads with its block from
   the mockups — nothing selected (C7), a rack (C1), a zone (C6) — or, for every other selection, the same parts (a
   caption, fields, switches, segmented controls, buttons). Everything else the old panel held (ordering, lock,
   delete, the bay list, appearance, Arrange, colour, layers, text, labels, the column check's detail) sits in one
   collapsed "More" fold under it, so nothing is lost before the selection bar (step 3) takes the object actions. */

const RACK_TYPES = BEAM_TYPES   // the beam racks (utils/rackTypes.js — R1)
const TYPE_NAME = {
  // the racks other than the beam racks (those have their own card) — utils/rackTypes.js (R1)
  ...Object.fromEntries(Object.entries(namesFor('card')).filter(([t]) => !BEAM_TYPES.has(t))),
  column_grid: 'Column grid', aisle: 'Aisle label', racking_area: 'Racking area',
  text: 'Text', annot_dimension: 'Dimension', line: 'Line', arc: 'Arc', arrow: 'Arrow', circle: 'Circle', rect: 'Rectangle', polyline: 'Polyline', polygon: 'Polygon',
  freehand: 'Freehand', elbow: 'Elbow arrow', block_arrow: 'Block arrow',
}
// (d2-arrows) a line with an arrowhead is an Arrow
const typeName = (o) => (o.type?.startsWith('fp_') ? 'Building' : o.type === 'line' && isDrawn(o) && endsOf(o) !== 'none' ? 'Arrow' : TYPE_NAME[o.type] || (o.type || 'shape').replace(/_/g, ' '))
const divider = <div style={{ height: 1, background: C.divider, margin: '4px 0' }} />

/* ─── fields ──────────────────────────────────────────────────────────────── */

function NumField({ label, value, onChange, onCommit, unit = '' }) {
  return (
    <Field label={unit ? `${label} (${unit})` : label}>
      <NumInput aria={label} value={Math.round(value ?? 0)} min={-1e9}
        onCommit={v => { onChange?.(v); onCommit?.(v) }} />
    </Field>
  )
}

function DimReadout({ label, px, gridSize = 40 }) {
  return (
    <Field label={label}>
      <StaticField><span>{pxToFtIn(px, gridSize)}</span><span style={{ marginLeft: 'auto', color: C.faint }}>{Math.round(px)}px</span></StaticField>
    </Field>
  )
}

/* ─── overlapping bays: a warning under the totals (utils/bayLedger.js) ─────── */

function OverlapNote({ objects }) {
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  const ledger = useBayLedger(objects, gridSize)
  const layoutCap = getLayoutCapacity(objects, undefined, ledger)
  if (!layoutCap.uncountedBays) return null
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <Note level="warning" data-testid="capacity-overlap" title="A bay more than half covered by another rack's bay is counted once — Check layout lists the overlaps">
        {layoutCap.uncountedBays} overlapping bay{layoutCap.uncountedBays === 1 ? '' : 's'} not counted
      </Note>
    </div>
  )
}

/* ─── Aisle ──────────────────────────────────────────────────────────────────── */

function AislePanel({ obj }) {
  const commitObjectUpdate = useCanvasStore(s => s.commitObjectUpdate)
  const direction = obj.direction || 'both'
  return (
    <>
      <InlineField label="Name">
        <TextInput words aria="Aisle name" value={obj.label || ''} placeholder="e.g. Main Aisle" onCommit={t => commitObjectUpdate(obj.id, { label: t })} />
      </InlineField>
      <Field label="Traffic">
        <Seg aria="Traffic" value={direction} onChange={val => commitObjectUpdate(obj.id, { direction: val })}
          options={[{ value: 'up', label: '↑' }, { value: 'down', label: '↓' }, { value: 'both', label: '↕' }, { value: 'none', label: '—' }]} />
      </Field>
      {/* its own Text size (CLAUDE.md Rule 8 — the CAD text model; studio/textSizeCard.jsx) */}
      <TextSizeField objs={[obj]} type="aisle" bare />
    </>
  )
}

/* The selected racks' frame depth together (each about its own centre, ONE undo step; overlaps show as warnings; the
   Row group replays it). For a selection of several racks or bays, and a group. */
function SelectionRacks({ selected }) {
  const racks = selected.filter(isBeamRack)
  if (!racks.length) return null
  const depths = [...new Set(racks.map(r => r.depthIn ?? 42))]
  // the one depth change (utils/rackDepthAction.js): a wall row keeps its wall face, a pair its flue
  const setDepth = (v) => { setRackDepths(useCanvasStore, racks.map(r => r.id), v) }
  return (
    <>
      <Field label="Frame depth" title={`The ${racks.length} selected rack${racks.length === 1 ? '' : 's'} — a wall row keeps its wall clearance and grows away from the wall; others about their centre`}>
        <NumInput aria="Rack depth" value={depths.length === 1 ? depths[0] : ''} min={1} onCommit={setDepth} />
      </Field>
      {depths.length > 1 && <Hint>Mixed: <span style={{ fontFamily: MONO }}>{depths.map(d => d + '″').join(', ')}</span></Hint>}
    </>
  )
}

/* ─── the "More" fold: the sections every selection shares ─────────────────── */

function Shared({ rack, locked }) {
  return (
    <>
      <ColumnCheckBody toggles={!rack} />
      {/* a locked object's group and colour are not changed (STUDIO.md §7a Locks); the settings are the app's (the layers: the
          bottom-right island's Layers card) */}
      <LockedFields locked={locked}>
        <GroupBody />
        <ColorBody />
      </LockedFields>
      <TextBody />
      <LabelsBody />
    </>
  )
}

function More({ children, rack, locked }) {
  return (
    <Fold title="More" aria="More properties" last gap={10}>
      {children}
      <Shared rack={rack} locked={locked} />
    </Fold>
  )
}

/* the object's order, lock and delete (the selection bar takes these in step 3) */
function ObjectActions({ obj }) {
  const locked = useLocked(obj)
  const { deleteSelected, bringForward, sendBackward, bringToFront, sendToBack } = useCanvasStore(useShallow(s => ({ deleteSelected: s.deleteSelected, bringForward: s.bringForward, sendBackward: s.sendBackward, bringToFront: s.bringToFront, sendToBack: s.sendToBack })))
  const small = { height: 28, padding: '0 8px', fontSize: 12 }
  return (
    <>
      <SecLabel>Object</SecLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock'} active={locked} onClick={() => toggleLock(useCanvasStore)} />
        <Btn kind="inset" style={small} title="Send to back" onClick={sendToBack}>To back</Btn>
        <Btn kind="inset" style={small} title="Send backward" onClick={sendBackward}>Back</Btn>
        <Btn kind="inset" style={small} title="Bring forward" onClick={bringForward}>Forward</Btn>
        <Btn kind="inset" style={small} title="Bring to front" onClick={bringToFront}>To front</Btn>
        <span style={{ marginLeft: 'auto' }}><IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={() => deleteSelectionWithAreas(useCanvasStore)} /></span>
      </div>
      {divider}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN                                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function PropertiesPanel() {
  const { selectedIds, objects, groups, updateObject, commitObjectUpdate, deleteSelected, gridSize, createAisle } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, objects: s.objects, groups: s.groups, updateObject: s.updateObject, commitObjectUpdate: s.commitObjectUpdate, deleteSelected: s.deleteSelected, gridSize: s.gridSize, createAisle: s.createAisle })))
  const selected = objects.filter(o => selectedIds.includes(o.id))
  const layers = useCanvasStore(s => s.layers)                 // a layer's padlock locks its objects' fields too
  // the Row group's rows (utils/rowGroupTool.js): a selected group row shows the group's card (C8)
  const groupKeys = useRowGroup(s => s.keys)
  /* the rack's beam for a new bay (the rack panel's own choice, shared by the Beam field and the bay list) */
  const [newBeam, setNewBeam] = useState(96)
  const crossPick = useCrossAislePick(s => s.pick)
  const tunnelPick = useTunnelPick(s => s.pick)

  /* ── a cross-aisle picked (utils/crossAisleTool.js): its card ───────────── */
  if (!selected.length && crossPick) return <CrossAisleCard />
  /* ── a tunnel picked (utils/tunnel.js): its card ───────────────────────── */
  if (!selected.length && tunnelPick) return <TunnelCard />

  /* ── Nothing selected (C7) ─────────────────────────────────────────────── */
  if (!selected.length) {
    return (
      <>
        <NothingSelected />
        {/* the layout summary (STUDIO.md §7a Summary follows selection): Storage · Building · Racking · Aisles · Sections ·
            Checks (studio/summaryCards.jsx) */}
        <LayoutSummary />
        <OverlapNote objects={objects} />
        <More />
      </>
    )
  }

  /* ── Group selected ─────────────────────────────────────────────────────── */
  const selSet = new Set(selectedIds)
  const activeGroup = (groups || []).find(g => g.ids.some(id => selSet.has(id)))
  if (activeGroup) {
    return (
      <>
        <Head caption={`Group · ${activeGroup.ids.length} objects`}>
          <Hint>Use the Arrange section under More to edit the group, rotate it, or remove members.</Hint>
        </Head>
        <MultiBayPanel />
        <Sec>
          <SelectionRacks selected={selected} />
          <Btn kind="danger" onClick={() => deleteSelectionWithAreas(useCanvasStore)}>Delete group</Btn>
        </Sec>
        {selected.some(o => /^rack_/.test(o.type || '')) && <SummaryFold><SelectionSummary selected={selected} /></SummaryFold>}
        <More />
      </>
    )
  }

  /* ── Multi-select ───────────────────────────────────────────────────────── */
  if (selected.length > 1) {
    const RACKS = new Set(['rack_row', 'rack_double_row', 'rack_cantilever', 'rack_pushback', 'rack_pallet_flow'])
    const twoRacks = selected.length === 2 && selected.every(o => RACKS.has(o.type))
    return (
      <>
        <Head caption={`Properties (${selected.length})`}>
          <span style={{ color: C.strong }}><span style={{ fontFamily: MONO }}>{selected.length}</span> objects selected.</span>
        </Head>
        {/* Bays picked across several racks (a bay marquee / Shift+click puts every rack they belong to in
            selectedIds) — the same multi-bay block a single rack shows. */}
        <MultiBayPanel />
        <Sec>
          <SelectionRacks selected={selected} />
          {/* aisles among the selection: their own Text size */}
          {selected.some(o => o.type === 'aisle') && (
            <TextSizeField objs={selected.filter(o => o.type === 'aisle')} type="aisle" bare />
          )}
          {twoRacks && <Btn kind="ghost" onClick={() => createAisle(selected[0].id, selected[1].id)}>+ Create Aisle Label</Btn>}
          <Btn kind="danger" onClick={() => deleteSelectionWithAreas(useCanvasStore)}>Delete all</Btn>
        </Sec>
        {/* the selection's totals */}
        {selected.some(o => /^rack_/.test(o.type || '')) && <SummaryFold><SelectionSummary selected={selected} /></SummaryFold>}
        <More />
      </>
    )
  }

  /* ── Single object ──────────────────────────────────────────────────────── */
  const obj = selected[0], locked = isLockedIn(layers, obj)
  const up     = (k, v) => updateObject(obj.id, { [k]: v })
  const commit = (k, v) => commitObjectUpdate(obj.id, { [k]: v })

  /* a rack (C1); a Row group's row: the group's card (C8) */
  const groupRows = RACK_TYPES.has(obj.type) && groupKeys.length ? groupRowsNow(objects) : []
  const inGroup = groupRows.some(r => r.ids.includes(obj.id))
  if (RACK_TYPES.has(obj.type)) {
    return (
      <>
        <LockedFields locked={locked}><MultiBayPanel /></LockedFields>
        {inGroup
          ? <RowGroupMain obj={obj} newBeam={newBeam} setNewBeam={setNewBeam} rows={groupRows} />
          : <RackMain obj={obj} newBeam={newBeam} setNewBeam={setNewBeam} />}
        {/* its rack lines' summary — a bay picked: that bay's (studio/summaryCards.jsx) */}
        <SummaryFold>{obj.activeBayIdx != null ? <BaySummary obj={obj} /> : <LineSummary obj={obj} />}</SummaryFold>
        <More rack locked={locked}>
          <ObjectActions obj={obj} />
          <LockedFields locked={locked}>
            <RackRowExtras obj={obj} newBeam={newBeam} setNewBeam={setNewBeam} />
            {divider}
            <Appearance obj={obj} up={up} commit={commit} />
          </LockedFields>
        </More>
      </>
    )
  }

  /* a zone (C6) */
  if (typeof obj.type === 'string' && obj.type.startsWith('zone_')) {
    return (
      <>
        <ZoneMain obj={obj} />
        <TextSizeField objs={[obj]} type="names" />
        <More locked={locked}>
          <ObjectActions obj={obj} />
          <LockedFields locked={locked}><Appearance obj={obj} up={up} commit={commit} /></LockedFields>
        </More>
      </>
    )
  }

  /* a section (utils/sectionAreas.js): its name, its size or area */
  if (obj.type === 'section_area') {
    return (
      <>
        <SectionMain obj={obj} />
        <SummaryFold><SectionSummary obj={obj} /></SummaryFold>
        <More locked={locked}>
          <ObjectActions obj={obj} />
        </More>
      </>
    )
  }

  /* a door (doors-edit round, studio/doorCard.jsx): Type, Width, Height, From left corner; its clear space and gaps */
  if (isDoor(obj)) {
    return (
      <>
        <DoorMain obj={obj} />
        <TextSizeField objs={[obj]} type="doorBadge" />
        <More locked={locked}>
          <ObjectActions obj={obj} />
          <LockedFields locked={locked}><Appearance obj={obj} up={up} commit={commit} /></LockedFields>
        </More>
      </>
    )
  }

  /* a column grid (colgrid mockup): its head, its blocks, then More */
  if (obj.type === 'column_grid') return (
    <>
      <Head><ColumnGridHead /></Head>
      <ColumnGridPanel obj={obj} locked={locked} />
      <TextSizeField objs={[obj]} type="column" />
      <More locked={locked}>
        <ObjectActions obj={obj} />
        <LockedFields locked={locked}><Appearance obj={obj} up={up} commit={commit} /></LockedFields>
      </More>
    </>
  )

  /* (r3-drive-in) a lane rack the lane engine runs: its card (studio/LaneCard.jsx), then More */
  if (laneEngineOn(obj)) return (
    <>
      <LockedFields locked={locked}><LaneCard obj={obj} /></LockedFields>
      <More locked={locked}>
        <ObjectActions obj={obj} />
        <LockedFields locked={locked}><Appearance obj={obj} up={up} commit={commit} /></LockedFields>
      </More>
    </>
  )

  /* (r6-cantilever) a cantilever: its card (studio/CantileverCard.jsx), then More */
  if (obj.type === 'rack_cantilever') return (
    <>
      <LockedFields locked={locked}><CantileverCard obj={obj} /></LockedFields>
      <More locked={locked}>
        <ObjectActions obj={obj} />
        <LockedFields locked={locked}><Appearance obj={obj} up={up} commit={commit} /></LockedFields>
      </More>
    </>
  )

  /* everything else: a caption, the type's own fields, then More */
  const bayLabel = obj.activeBayIdx != null ? `Bay ${obj.activeBayIdx + 1}` : obj.activeTowerIdx != null ? `Tower ${obj.activeTowerIdx + 1}` : null
  return (
    <>
      <Head caption={obj.type === 'rack_shelving' ? shelvingLabel(obj, gridSize, shelvingTag(objects, obj, gridSize, useCanvasStore.getState().elevations)) : bayLabel ? `${typeName(obj)} · ${bayLabel}` : typeName(obj)} right={<CardLock obj={obj} />} />
      <LockedFields locked={locked}><MultiBayPanel /></LockedFields>
      <Sec>
        <LockedFields locked={locked}>
        {obj.type === 'rack_cantilever' && <CantileverPanel obj={obj} />}
        {obj.type === 'rack_drive_in' && <DriveInPanel obj={obj} />}
        {obj.type === 'rack_drive_through' && <DriveThroughPanel obj={obj} />}
        {obj.type === 'rack_pushback' && <PushbackPanel obj={obj} />}
        {obj.type === 'rack_pallet_flow' && <DriveThroughPanel obj={obj} />}
        {obj.type === 'aisle' && <AislePanel obj={obj} />}
        {obj.type === 'racking_area' && <RackingAreaPanel obj={obj} />}
        {obj.type?.startsWith('fp_') && <BuildingFields obj={obj} up={up} commit={commit} gridSize={gridSize} updateObject={updateObject} />}
        {/* the building's size labels: its own Text size (CLAUDE.md Rule 8 — the CAD text model) */}
        {obj.type?.startsWith('fp_') && <TextSizeField objs={[obj]} type="building" bare />}
        {/* (basics-fixes) an object with a box and no size field of its own (the Ops and Safety items, a column / pillar, a
            partition wall, a window, a mezzanine, a shelving unit): its Width and Depth, typed in feet — one undo each */}
        {/* (rack-round3 6) a shelving unit: Units, Unit width and Depth (dropdowns of the standard sizes, Custom), Shelves */}
        {obj.type === 'rack_shelving' ? <ShelvingFields obj={obj} gridSize={gridSize} /> : hasOwnSizeBlock(obj) && <SizeBlock obj={obj} gridSize={gridSize} />}
        {/* (dealer audit) a drawn shape: its size in feet, then its style — the Draw bar's controls */}
        {isDrawn(obj) && <DrawnSizeFields obj={obj} gridSize={gridSize} />}
        {isDrawn(obj) && <DrawnStyleFields obj={obj} />}
        {!isDrawn(obj) && ['rect', 'l_shape', 't_shape', 'u_shape'].includes(obj.type) && (
          <Grid2>
            <NumField label="W px" value={obj.width} onChange={v => up('width', v)} onCommit={v => commit('width', v)} />
            <NumField label="H px" value={obj.height} onChange={v => up('height', v)} onCommit={v => commit('height', v)} />
            <DimReadout label="W" px={obj.width} gridSize={gridSize} />
            <DimReadout label="H" px={obj.height} gridSize={gridSize} />
            {/* (d1-fixes) a drawn rectangle does not rotate: no Rot */}
            {!isDrawn(obj) && <NumField label="Rot" value={obj.rotation || 0} onChange={v => up('rotation', v)} onCommit={v => commit('rotation', v)} unit="°" />}
          </Grid2>
        )}
        {obj.type === 'circle' && !isDrawn(obj) && (
          <Grid2>
            <NumField label="CX" value={obj.cx} onChange={v => up('cx', v)} onCommit={v => commit('cx', v)} />
            <NumField label="CY" value={obj.cy} onChange={v => up('cy', v)} onCommit={v => commit('cy', v)} />
            <NumField label="RX" value={obj.rx} onChange={v => up('rx', v)} onCommit={v => commit('rx', v)} />
            <NumField label="RY" value={obj.ry} onChange={v => up('ry', v)} onCommit={v => commit('ry', v)} />
            <DimReadout label="Ø W" px={obj.rx * 2} gridSize={gridSize} />
            <DimReadout label="Ø H" px={obj.ry * 2} gridSize={gridSize} />
          </Grid2>
        )}
        {((obj.type === 'line' && !isDrawn(obj)) || obj.type === 'arc') && (
          <>
            <DimReadout label="Len" px={Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1)} gridSize={gridSize} />
            {obj.type === 'arc' && (
              <Field label={<span style={{ display: 'flex' }}>Bend<span style={{ marginLeft: 'auto', fontFamily: MONO, color: C.strong }}>{(obj.bend ?? 0.35).toFixed(2)}</span></span>}>
                <input type="range" min="-0.8" max="0.8" step="0.05" aria-label="Bend" value={obj.bend ?? 0.35} onChange={e => up('bend', Number(e.target.value))} style={{ accentColor: C.accent, width: '100%' }} />
              </Field>
            )}
          </>
        )}
        {obj.type === 'annot_dimension' && (
          <>
            <Field label="Label override">
              <TextInput aria="Label override" placeholder="auto" value={obj.customLabel || ''} onCommit={t => commit('customLabel', t || undefined)} />
            </Field>
            <Hint>Leave empty to show auto-measured value</Hint>
          </>
        )}
        {/* (d1-polish) a text's style changed in its card is the next text's (utils/drawStyles.js) */}
        {obj.type === 'text' && <TextFields obj={obj} up={up} commit={(k, v) => { commit(k, v); rememberStylesOf(useCanvasStore, [obj.id]) }} />}
        </LockedFields>
      </Sec>
      {/* a building: its fields, then the whole layout's summary */}
      {obj.type?.startsWith('fp_') && <SummaryFold><LayoutSummary /></SummaryFold>}
      <More locked={locked}>
        <ObjectActions obj={obj} />
        <LockedFields locked={locked}><Appearance obj={obj} up={up} commit={commit} /></LockedFields>
      </More>
    </>
  )
}

/* ─── a building (floor plan) ─────────────────────────────────────────────── */
function BuildingFields({ obj, up, commit, gridSize, updateObject }) {
  const wFt = obj.width / gridSize, hFt = obj.height / gridSize
  const wallT = obj.wallThicknessFt ?? 0.5
  const setWall = (v) => updateObject(obj.id, { wallThicknessFt: v, strokeWidth: Math.max(2, v * gridSize * 0.5) })
  /* typed: the building's corners move (its far walls; the top-left held), with the handle resize's shrink rules in the
     same undo step (utils/buildingSize.js — building-size fix: these wrote width / height alone, which the plan never
     reads: it draws from the corners, fpVerts) */
  const ft = (key, label) => (
    <Field label={label}>
      <NumInput aria={`${label} (ft)`} value={Math.round(obj[key] / gridSize * 10) / 10} min={1}
        onCommit={v => { if (v > 0) setBuildingSize(useCanvasStore, obj.id, sizeUpdate(obj, key === 'width' ? { widthFt: v } : { lengthFt: v }, gridSize)) }} />
    </Field>
  )
  return (
    <>
      <Grid2>{ft('width', 'Width')}{ft('height', 'Length')}</Grid2>
      <Grid2>
        <NumField label="Rot" value={obj.rotation || 0} onChange={v => up('rotation', v)} onCommit={v => commit('rotation', v)} unit="°" />
        <Field label="Label size (ft)">
          <NumInput aria="Label size" value={Math.round((obj.labelFontSize ?? Math.round(Math.min(obj.width, obj.height) * 0.10)) / gridSize)} min={1}
            onCommit={v => up('labelFontSize', Math.max(1, v) * gridSize)} />
        </Field>
      </Grid2>
      <InlineField label="Label">
        <TextInput words aria="Floor label" placeholder="Floor label…" value={obj.label || ''} onCommit={t => up('label', t)} />
      </InlineField>
      <Field label="Wall thickness">
        <Seg aria="Wall thickness" mono value={wallT} onChange={setWall} options={[0.25, 0.5, 0.75, 1].map(v => ({ value: v, label: `${v * 12}″` }))} />
      </Field>
      <input type="range" min={0.25} max={2} step={0.25} value={wallT} aria-label="Wall thickness slider" onChange={e => setWall(Number(e.target.value))} style={{ accentColor: C.accent, width: '100%' }} />
      <ToggleRow label="Show clear interior dim" on={!!obj.showWallLabel} onClick={() => up('showWallLabel', !(obj.showWallLabel ?? false))} />
      <Row label={<span style={{ color: C.muted, fontSize: 12 }}>Area</span>}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.strong }}>{Math.round(wFt * hFt).toLocaleString()} sq ft <span style={{ color: C.faint }}>({(wFt * hFt / 43560).toFixed(3)} ac)</span></span>
      </Row>
    </>
  )
}

/* ─── (basics-fixes) the size block ──────────────────────────────────────── */
const OWN_SIZE_PREFIX = /^(mhe_|ops_|util_|safety_)/
const OWN_SIZE_TYPES = new Set(['struct_column', 'struct_partition', 'struct_window', 'rack_mezzanine', 'rack_shelving'])
/** Does it get the shared Width / Depth block (it has a box, no size field of its own)? */
export const hasOwnSizeBlock = (o) => !!o && Number.isFinite(o.width) && Number.isFinite(o.height) && !isDrawn(o) && (OWN_SIZE_TYPES.has(o.type) || OWN_SIZE_PREFIX.test(o.type || ''))
/** Width and Depth (ft): its box, its left-top corner held. A partition wall: Length and Thickness. */
function SizeBlock({ obj, gridSize }) {
  const ft = (px) => Math.round((px / gridSize) * 100) / 100
  const set = (u) => useCanvasStore.getState().commitObjectUpdate(obj.id, u)
  const wall = obj.type === 'struct_partition'
  return (
    <Grid2>
      <Field label={wall ? 'Length (ft)' : 'Width (ft)'}><NumInput aria={wall ? 'Length (ft)' : 'Width (ft)'} value={ft(obj.width)} min={0.1} step={0.5} onCommit={v => { if (v > 0) set({ width: v * gridSize }) }} /></Field>
      <Field label={wall ? 'Thickness (ft)' : 'Depth (ft)'}><NumInput aria={wall ? 'Thickness (ft)' : 'Depth (ft)'} value={ft(obj.height)} min={0.05} step={0.25} onCommit={v => { if (v > 0) set({ height: v * gridSize }) }} /></Field>
    </Grid2>
  )
}

/* ─── (rack-round3 6) a shelving unit ─────────────────────────────────────── */
/** Units (count), Unit width (36 · 42 · 48, Custom) and Depth (12 · 18 · 24, Custom) in inches, Shelves — one undo each;
 *  its left-top corner held. A size that is not a standard one (a unit saved before) shows as it is, marked Custom. */
function ShelvingFields({ obj, gridSize }) {
  const set = (u) => useCanvasStore.getState().commitObjectUpdate(obj.id, u)
  const { units: n, unitIn, depthIn, heightIn, backToBack } = shelfSpec(obj, gridSize)   // (r7-shelving) one run's depth
  // (lane-fixes 5) the units a zone or a rack covers (a red X each) come off usable
  const objects = useCanvasStore(s => s.objects), { profile } = useColumnCheck()   // the plan's truck: its face X marks too
  const use = shelvingUsable(objects, obj, gridSize, profile)
  const tag = (v, list) => (isStandard(v, list) ? null : <span data-custom-size style={{ fontSize: 11, color: C.faint, marginLeft: 6 }}>Custom</span>)
  return (
    <div data-shelving-fields style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Grid2>
        <Field label="Units"><NumInput aria="Units" value={n} min={1} step={1} onCommit={v => { if (v >= 1) set(unitCountChange(obj, v, gridSize)) }} /></Field>
        <Field label="Shelves"><NumInput aria="Shelves" value={shelvesOf(obj)} min={1} step={1} onCommit={v => { if (v >= 1) set({ shelves: Math.round(v) }) }} /></Field>
      </Grid2>
      <Grid2>
        <Field label={<span style={{ display: 'flex', alignItems: 'center' }}>Unit width (in){tag(unitIn, SHELF_UNIT_IN)}</span>}>
          <Inches value={unitIn} aria="Unit width (in)" options={SHELF_UNIT_IN} onCommit={v => { if (v > 0) set(unitWidthChange(obj, v, gridSize)) }} />
        </Field>
        <Field label={<span style={{ display: 'flex', alignItems: 'center' }}>Depth (in){tag(depthIn, SHELF_DEPTH_IN)}</span>}>
          <Inches value={depthIn} aria="Depth (in)" options={SHELF_DEPTH_IN} onCommit={v => { if (v > 0) set(depthChange(v, gridSize, backToBack)) }} />
        </Field>
        {/* (r7-shelving) steel boltless: its height, and back-to-back (two runs sharing the back) */}
        <Field label="Height (in)"><Inches value={heightIn} aria="Height (in)" options={SHELF_HEIGHT_IN} onCommit={v => { if (v > 0) set({ heightIn: v }) }} /></Field>
      </Grid2>
      <ToggleRow label="Back-to-back" aria="Back-to-back" on={backToBack} onClick={() => set(backToBackChange(obj, !backToBack, gridSize))} />
      <div data-shelving-usable={use.usable} style={{ fontSize: 12, color: use.lost ? C.text : C.muted }}>
        {`${use.usable} of ${use.units} unit${use.units === 1 ? '' : 's'} usable`}{use.lost ? ` · ${use.lost} lost` : ''}
      </div>
    </div>
  )
}

/* ─── a text object ───────────────────────────────────────────────────────── */
function TextFields({ obj, up, commit }) {
  return (
    <>
      <Field label="Font">
        <SelectField words aria="Font" value={textFace(obj.fontFamily)} onChange={e => commit('fontFamily', e.target.value)}>
          {TEXT_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </SelectField>
      </Field>
      {/* (dealer audit) the real text height, inches — as the Text bar and the Text panel (CLAUDE.md Rule 8; was px) */}
      <Field label="Text size">
        <SizeInput inches={obj.textIn || Math.round(((obj.fontSize || 14) / (useCanvasStore.getState().gridSize || 40)) * 12 * 100) / 100} aria="Text size"
          onCommit={(v) => { if (v > 0) { const gs = useCanvasStore.getState().gridSize || 40; useCanvasStore.getState().commitObjectUpdate(obj.id, { textIn: v, fontSize: (v / 12) * gs }); rememberStylesOf(useCanvasStore, [obj.id]) } }} />
      </Field>
      <Field label="Style">
        <Seg aria="Style" options={[['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'], ['strike', 'S', 'Strikethrough']]
          .map(([k, label, title]) => ({ value: k, label, title, aria: title, on: !!obj[k], onClick: () => commit(k, !obj[k]) }))} />
      </Field>
      <TextBoxFields obj={obj} />
      {/* (d1-fixes) a text turns in 90° steps */}
      <Field label="Rotation">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: MONO, color: C.strong, minWidth: 34 }}>{(obj.rotation || 0)}°</span>
          <button type="button" aria-label="Rotate text 90°" title="Rotate 90°" onClick={() => rotateTexts(useCanvasStore, [obj.id])}
            style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 6, fontSize: 12, cursor: 'pointer', background: C.inset || 'rgba(255,255,255,0.06)', color: C.strong }}>Rotate 90°</button>
        </div>
      </Field>
      <Field label="Align">
        <Seg aria="Align" value={obj.align || 'left'} onChange={a => alignTexts(useCanvasStore, [obj.id], a)}
          options={[{ value: 'left', label: 'Left', aria: 'Align left' }, { value: 'center', label: 'Centre', aria: 'Align center' }, { value: 'right', label: 'Right', aria: 'Align right' }]} />
      </Field>
      <Field label="Color">
        {/* (d1-bar) the colours open as a popover over the canvas, attached to the swatch (studio/Swatch.jsx) — never
            inside the card; writes obj.fill through this panel's own commit (text has one fill mechanism) */}
        <Swatch label="Text colour" value={obj.fill || '#1F2321'} onPick={(c) => commit('fill', c || '#1F2321')} />
      </Field>
      <Grid2>
        <Field label="Line height"><NumInput aria="Line height" value={obj.lineHeight ?? 1.25} step="0.05" onCommit={v => { up('lineHeight', v); commit('lineHeight', v) }} /></Field>
        <Field label="Letter spacing"><NumInput aria="Letter spacing" value={obj.letterSpacing ?? 0} min={-2} step="0.5" onCommit={v => { up('letterSpacing', v); commit('letterSpacing', v) }} /></Field>
      </Grid2>
    </>
  )
}

/* ─── stroke, opacity, fill mode and layer: per-object trim ───────────────── */
function Appearance({ obj, up, commit }) {
  const slider = (label, value, min, max, step, show, key) => (
    <Field label={<span style={{ display: 'flex' }}>{label}<span style={{ marginLeft: 'auto', fontFamily: MONO, color: C.strong }}>{show}</span></span>}>
      <input type="range" min={min} max={max} step={step} aria-label={label} value={value}
        onChange={e => up(key, Number(e.target.value))} onMouseUp={e => commit(key, Number(e.target.value))} style={{ accentColor: C.accent, width: '100%' }} />
    </Field>
  )
  return (
    <>
      <SecLabel>Appearance</SecLabel>
      {slider('Stroke', obj.strokeWidth || 1.5, 0.5, 12, 0.5, obj.strokeWidth || 1.5, 'strokeWidth')}
      {slider('Opacity', obj.opacity ?? 1, 0, 1, 0.05, `${Math.round((obj.opacity ?? 1) * 100)}%`, 'opacity')}
      {obj.type !== 'line' && obj.type !== 'arc' && obj.type !== 'text' && (
        <ToggleRow label="No fill" on={!!obj.noFill} onClick={() => commit('noFill', !obj.noFill)} />
      )}
      <Field label="Layer"><LayerSelect value={obj.layerId} onChange={v => commit('layerId', v)} /></Field>
    </>
  )
}

function LayerSelect({ value, onChange }) {
  const layers = useCanvasStore(s => s.layers)
  return (
    <SelectField words aria="Layer" value={value} onChange={e => onChange(e.target.value)}>
      {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </SelectField>
  )
}
