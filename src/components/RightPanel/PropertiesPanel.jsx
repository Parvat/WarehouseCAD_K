import { useState } from 'react'
import { TEXT_FONTS, textFace } from '../../theme/tokens'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { pxToFtIn } from '../../utils/canvas'
import { AisleLabelSize } from './panels/AisleLabelSize'
import { RackingAreaPanel } from './panels/RackingAreaPanel'
import { RackRowExtras, MultiBayPanel, CantileverPanel, ColumnGridPanel, DriveInPanel, DriveThroughPanel, PushbackPanel } from '../RightPanel/Rackrowpanel'
import { getLayoutCapacity } from '../../utils/capacity'
import { useBayLedger } from './useBayLedger'
import { PALETTE_COLORS } from '../../constants'
import { isBeamRack } from '../../utils/elevations'
import { setRackDepths } from '../../utils/rackDepthAction'
import { GroupBody } from './GroupPanel'
import { ColorBody } from './ColorPanel'
import { LayerBody } from './LayerPanel'
import { TextBody } from './TextPanel'
import { LabelsBody } from './LabelsPanel'
import { ColumnCheckBody } from './ColumnCheckPanel'
import { RackMain, ZoneMain, NothingSelected, LayoutBlock } from '../../studio/cards'
import { Head, Sec, Grid2, Field, InlineField, TextInput, NumInput, SelectField, StaticField, Row, ToggleRow, Seg, Btn,
  IconBtn, Note, Hint, SecLabel, Fold, C, MONO } from '../../studio/cardParts'

/* The right card's Properties (Studio, STUDIO.md; design/studio/Studio.dc.html). Each state leads with its block from
   the mockups — nothing selected (C7), a rack (C1), a zone (C6) — or, for every other selection, the same parts (a
   caption, fields, switches, segmented controls, buttons). Everything else the old panel held (ordering, lock,
   delete, the bay list, appearance, Arrange, colour, layers, text, labels, the column check's detail) sits in one
   collapsed "More" fold under it, so nothing is lost before the selection bar (step 3) takes the object actions. */

const RACK_TYPES = new Set(['rack_row', 'rack_double_row'])
const TYPE_NAME = {
  rack_cantilever: 'Cantilever', rack_drive_in: 'Drive-in', rack_drive_through: 'Drive-through', rack_pushback: 'Pushback',
  rack_pallet_flow: 'Pallet flow', column_grid: 'Column grid', aisle: 'Aisle label', racking_area: 'Racking area',
  text: 'Text', annot_dimension: 'Dimension', line: 'Line', arc: 'Arc', arrow: 'Arrow', circle: 'Circle', rect: 'Rectangle',
  freehand: 'Freehand',
}
const typeName = (o) => (o.type?.startsWith('fp_') ? 'Building' : TYPE_NAME[o.type] || (o.type || 'shape').replace(/_/g, ' '))
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
      <AisleLabelSize ids={[obj.id]} />
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

function Shared({ rack }) {
  return (
    <>
      <ColumnCheckBody toggles={!rack} />
      <GroupBody />
      <ColorBody />
      <LayerBody />
      <TextBody />
      <LabelsBody />
    </>
  )
}

function More({ children, rack }) {
  return (
    <Fold title="More" aria="More properties" last gap={10}>
      {children}
      <Shared rack={rack} />
    </Fold>
  )
}

/* the object's order, lock and delete (the selection bar takes these in step 3) */
function ObjectActions({ obj }) {
  const { deleteSelected, bringForward, sendBackward, bringToFront, sendToBack, toggleLockSelected } = useCanvasStore(useShallow(s => ({ deleteSelected: s.deleteSelected, bringForward: s.bringForward, sendBackward: s.sendBackward, bringToFront: s.bringToFront, sendToBack: s.sendToBack, toggleLockSelected: s.toggleLockSelected })))
  const small = { height: 28, padding: '0 8px', fontSize: 12 }
  return (
    <>
      <SecLabel>Object</SecLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <IconBtn name="Lock" label={obj.locked ? 'Unlock' : 'Lock'} title={obj.locked ? 'Unlock (Ctrl+L)' : 'Lock'} active={!!obj.locked} onClick={toggleLockSelected} />
        <Btn kind="inset" style={small} title="Send to back" onClick={sendToBack}>To back</Btn>
        <Btn kind="inset" style={small} title="Send backward" onClick={sendBackward}>Back</Btn>
        <Btn kind="inset" style={small} title="Bring forward" onClick={bringForward}>Forward</Btn>
        <Btn kind="inset" style={small} title="Bring to front" onClick={bringToFront}>To front</Btn>
        <span style={{ marginLeft: 'auto' }}><IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelected} /></span>
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
  /* the rack's beam for a new bay (the rack panel's own choice, shared by the Beam field and the bay list) */
  const [newBeam, setNewBeam] = useState(96)

  /* ── Nothing selected (C7) ─────────────────────────────────────────────── */
  if (!selected.length) {
    return (
      <>
        <NothingSelected />
        <LayoutBlock last={false} />
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
          <Btn kind="danger" onClick={deleteSelected}>Delete group</Btn>
        </Sec>
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
          {/* aisles among the selection: their own label size */}
          {selected.some(o => o.type === 'aisle') && (
            <AisleLabelSize ids={selected.filter(o => o.type === 'aisle').map(o => o.id)} />
          )}
          {twoRacks && <Btn kind="ghost" onClick={() => createAisle(selected[0].id, selected[1].id)}>+ Create Aisle Label</Btn>}
          <Btn kind="danger" onClick={deleteSelected}>Delete all</Btn>
        </Sec>
        <More />
      </>
    )
  }

  /* ── Single object ──────────────────────────────────────────────────────── */
  const obj = selected[0]
  const up     = (k, v) => updateObject(obj.id, { [k]: v })
  const commit = (k, v) => commitObjectUpdate(obj.id, { [k]: v })

  /* a rack (C1) */
  if (RACK_TYPES.has(obj.type)) {
    return (
      <>
        <MultiBayPanel />
        <RackMain obj={obj} newBeam={newBeam} setNewBeam={setNewBeam} />
        <LayoutBlock last={false} />
        <More rack>
          <ObjectActions obj={obj} />
          <RackRowExtras obj={obj} newBeam={newBeam} setNewBeam={setNewBeam} />
          {divider}
          <Appearance obj={obj} up={up} commit={commit} />
        </More>
      </>
    )
  }

  /* a zone (C6) */
  if (typeof obj.type === 'string' && obj.type.startsWith('zone_')) {
    return (
      <>
        <ZoneMain obj={obj} />
        <More>
          <ObjectActions obj={obj} />
          <Appearance obj={obj} up={up} commit={commit} />
        </More>
      </>
    )
  }

  /* everything else: a caption, the type's own fields, then More */
  const bayLabel = obj.activeBayIdx != null ? `Bay ${obj.activeBayIdx + 1}` : obj.activeTowerIdx != null ? `Tower ${obj.activeTowerIdx + 1}` : null
  return (
    <>
      <Head caption={bayLabel ? `${typeName(obj)} · ${bayLabel}` : typeName(obj)} />
      <MultiBayPanel />
      <Sec>
        {obj.type === 'rack_cantilever' && <CantileverPanel obj={obj} />}
        {obj.type === 'column_grid' && <ColumnGridPanel obj={obj} />}
        {obj.type === 'rack_drive_in' && <DriveInPanel obj={obj} />}
        {obj.type === 'rack_drive_through' && <DriveThroughPanel obj={obj} />}
        {obj.type === 'rack_pushback' && <PushbackPanel obj={obj} />}
        {obj.type === 'rack_pallet_flow' && <DriveThroughPanel obj={obj} />}
        {obj.type === 'aisle' && <AislePanel obj={obj} />}
        {obj.type === 'racking_area' && <RackingAreaPanel obj={obj} />}
        {obj.type?.startsWith('fp_') && <BuildingFields obj={obj} up={up} commit={commit} gridSize={gridSize} updateObject={updateObject} />}
        {['rect', 'l_shape', 't_shape', 'u_shape'].includes(obj.type) && (
          <Grid2>
            <NumField label="W px" value={obj.width} onChange={v => up('width', v)} onCommit={v => commit('width', v)} />
            <NumField label="H px" value={obj.height} onChange={v => up('height', v)} onCommit={v => commit('height', v)} />
            <DimReadout label="W" px={obj.width} gridSize={gridSize} />
            <DimReadout label="H" px={obj.height} gridSize={gridSize} />
            <NumField label="Rot" value={obj.rotation || 0} onChange={v => up('rotation', v)} onCommit={v => commit('rotation', v)} unit="°" />
          </Grid2>
        )}
        {obj.type === 'circle' && (
          <Grid2>
            <NumField label="CX" value={obj.cx} onChange={v => up('cx', v)} onCommit={v => commit('cx', v)} />
            <NumField label="CY" value={obj.cy} onChange={v => up('cy', v)} onCommit={v => commit('cy', v)} />
            <NumField label="RX" value={obj.rx} onChange={v => up('rx', v)} onCommit={v => commit('rx', v)} />
            <NumField label="RY" value={obj.ry} onChange={v => up('ry', v)} onCommit={v => commit('ry', v)} />
            <DimReadout label="Ø W" px={obj.rx * 2} gridSize={gridSize} />
            <DimReadout label="Ø H" px={obj.ry * 2} gridSize={gridSize} />
          </Grid2>
        )}
        {(obj.type === 'line' || obj.type === 'arc') && (
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
        {obj.type === 'text' && <TextFields obj={obj} up={up} commit={commit} />}
      </Sec>
      <More>
        <ObjectActions obj={obj} />
        <Appearance obj={obj} up={up} commit={commit} />
      </More>
    </>
  )
}

/* ─── a building (floor plan) ─────────────────────────────────────────────── */
function BuildingFields({ obj, up, commit, gridSize, updateObject }) {
  const wFt = obj.width / gridSize, hFt = obj.height / gridSize
  const wallT = obj.wallThicknessFt ?? 0.5
  const setWall = (v) => updateObject(obj.id, { wallThicknessFt: v, strokeWidth: Math.max(2, v * gridSize * 0.5) })
  const ft = (key, label) => (
    <Field label={label}>
      <NumInput aria={`${label} (ft)`} value={Math.round(obj[key] / gridSize * 10) / 10} min={1}
        onCommit={v => { if (v > 0) { up(key, v * gridSize); commit(key, v * gridSize) } }} />
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

/* ─── a text object ───────────────────────────────────────────────────────── */
function TextFields({ obj, up, commit }) {
  return (
    <>
      <Field label="Font">
        <SelectField words aria="Font" value={textFace(obj.fontFamily)} onChange={e => commit('fontFamily', e.target.value)}>
          {TEXT_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </SelectField>
      </Field>
      <NumField label="Size" value={obj.fontSize || 14} onChange={v => up('fontSize', v)} onCommit={v => commit('fontSize', v)} />
      <Field label="Style">
        <Seg aria="Style" options={[['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'], ['strike', 'S', 'Strikethrough']]
          .map(([k, label, title]) => ({ value: k, label, title, aria: title, on: !!obj[k], onClick: () => commit(k, !obj[k]) }))} />
      </Field>
      <Field label="Align">
        <Seg aria="Align" value={obj.align || 'left'} onChange={a => commit('align', a)}
          options={[{ value: 'left', label: 'Left', aria: 'Align left' }, { value: 'center', label: 'Centre', aria: 'Align center' }, { value: 'right', label: 'Right', aria: 'Align right' }]} />
      </Field>
      <Field label="Color">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {PALETTE_COLORS.slice(16, 24).map(c => (
            <button key={c} type="button" title={c} onClick={() => commit('fill', c)}
              style={{ width: 18, height: 18, borderRadius: 4, cursor: 'pointer', background: c, border: `1.5px solid ${obj.fill === c ? C.strong : 'transparent'}` }} />
          ))}
          {/* writes obj.fill directly via this panel's own commit — deliberately NOT through ColorPanel's
              global-opacity-baking path, so text has exactly one fill mechanism */}
          <input type="color" title="Custom text color" value={/^#[0-9a-f]{6}$/i.test(obj.fill) ? obj.fill : '#0B101D'}
            onChange={e => commit('fill', e.target.value)} style={{ width: 22, height: 20, padding: 0, border: `1px solid ${C.separator}`, borderRadius: 4, background: 'transparent', cursor: 'pointer' }} />
        </div>
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
