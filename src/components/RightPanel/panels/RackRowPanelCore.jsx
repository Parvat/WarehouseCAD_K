import { levelsResolver } from '../../../utils/elevations'
import { deleteBaySelection, oneSidePicked } from '../../../utils/baySides'
import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { useState } from 'react'
import { rowLines } from '../../../utils/syncSections'
import { nanoid } from 'nanoid'
import { rebuildAisles } from '../../../utils/aisleRebuild'
import { withAnchoredPosition } from '../../../utils/bayAnchor'
import { getRackCapacity, positionsPerBeam } from '../../../utils/capacity'
import { useBayLedger } from '../useBayLedger'
import { Field, Fold } from '../../shared/Fold'
import { ElevationLine } from '../../Elevations/ElevationLine'
import { rackDepthUpdate } from '../../../utils/rackDepth'
import {
  BEAM_PRESETS_IN, parseBeamIn, wallClearAlong, planBayBeamChange,
  changeIssues, rackIssues, issuesText,
} from '../../../utils/bayBeam'

// ── Compute rack geometry from beams array ────────────────────────────────────
export function rackTotalInches(obj) {
  const upIn = obj.uprightWidth || 3
  const beams = obj.beams || [96]
  // Total = left upright + beams + (bays x right upright shared except last)
  // Each bay = beam + one upright on right. Plus left upright at start.
  return upIn + beams.reduce((s, b) => s + b, 0) + upIn * beams.length
  // Correction: bays share uprights. Layout = upright | beam | upright | beam | upright
  // So: uprightWidth + sum(beams) + uprightWidth x beams.length
  // = upIn x (beams.length + 1) + sum(beams)
}

export function rackTotalPx(obj, gridSize = 40) {
  const upIn = obj.uprightWidth || 3
  const beams = obj.beams || [96]
  const totalIn = upIn * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
  return (totalIn / 12) * gridSize
}

// ── Inner clear of the parent FP along the rack's OWN length, any rotation ────
function getWallClear(obj, allObjects, gridSize) {
  return wallClearAlong(obj, allObjects, gridSize)
}

export const fmtFtIn = (inches) => {
  const ft  = Math.floor(Math.abs(inches) / 12)
  const inc = Math.round((Math.abs(inches) % 12) * 10) / 10
  if (inc === 12) return `${ft + 1}'`
  if (ft === 0) return `${inc}"`
  return inc === 0 ? `${ft}'` : `${ft}' ${inc}"`
}

/* The beam presets' red warnings, remembered per layout. The picker asks for
   every preset (and the custom value) on every render, and each answer is a
   full overlap / wall check — but it can only change when the objects do,
   and the store makes a new objects array on every object change, so the
   array itself is the cache key. */
const warnCache = new WeakMap()
function cachedWarn(objects, key, compute) {
  let m = warnCache.get(objects)
  if (!m) { m = new Map(); warnCache.set(objects, m) }
  if (!m.has(key)) m.set(key, compute())
  return m.get(key)
}

/* The commits behind the rack panel's "+ Bay" and its bay beam dropdown: beams and
   width from the new beams, START end held where it is drawn (bays before
   the changed one stay put, later ones slide), any rotation. Never blocked:
   a rack that would pass the wall or overlap another only gets a warning. */
export function addBayUpdate(obj, beamIn, gridSize = 40) {
  const newBeams = [...(obj.beams || [96]), beamIn]
  const newTotalIn = (obj.uprightWidth || 3) * (newBeams.length + 1) + newBeams.reduce((s, b) => s + b, 0)
  const newW = (newTotalIn / 12) * gridSize
  return withAnchoredPosition(obj, { beams: newBeams, width: newW })
}
export function changeBayUpdate(obj, bayIdx, newBeamIn, gridSize = 40) {
  const newBeams = [...(obj.beams || [96])]
  newBeams[bayIdx] = newBeamIn
  const newTotalIn = (obj.uprightWidth || 3) * (newBeams.length + 1) + newBeams.reduce((s, b) => s + b, 0)
  const newW = (newTotalIn / 12) * gridSize
  return withAnchoredPosition(obj, { beams: newBeams, width: newW })
}

/* Red warning: a rack overlaps another or passes the wall. Never blocks. */
export function RackWarning({ text }) {
  if (!text) return null
  return (
    <div role="alert" style={{
      padding: '5px 8px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 9,
      background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)', fontWeight: 600,
    }}>
      ! {text}
    </div>
  )
}

// ── Max additional bays that fit ──────────────────────────────────────────────
function maxFitBays(obj, allObjects, gridSize, newBeamIn = 96) {
  const clear = getWallClear(obj, allObjects, gridSize)
  if (!clear) return null
  const usedIn = rackTotalInches(obj)
  const upIn   = obj.uprightWidth || 3
  // Each additional bay = newBeamIn + uprightWidth
  const remainIn = clear.clearIn - usedIn
  return { remainIn, fits: remainIn >= newBeamIn + upIn, addIn: newBeamIn + upIn }
}

// ── Main Panel ────────────────────────────────────────────────────────────────
/** A pair's bay picked on one side only: how to pick both (utils/baySides.js). */
function OneSideHint() {
  const one = useCanvasStore(s => oneSidePicked(s))
  if (!one) return null
  return (
    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 4 }}>
      One side selected · click between the sides to select both
    </div>
  )
}

export function MultiBayPanel() {
  const { activeBaySelection, objects, deleteSelectedBays, changeSelectedBaysBeam, clearBaySelection, clearSelection, gridSize } = useCanvasStore(useShallow(s => ({ activeBaySelection: s.activeBaySelection, objects: s.objects, deleteSelectedBays: s.deleteSelectedBays, changeSelectedBaysBeam: s.changeSelectedBaysBeam, clearBaySelection: s.clearBaySelection, clearSelection: s.clearSelection, gridSize: s.gridSize })))
  if (!activeBaySelection || activeBaySelection.length === 0) return null

  /* deleteSelectedBays (the store action) only ever clears
     activeBaySelection, not selectedIds — the rack ROWS a bay marquee
     added to selectedIds (so this panel and Properties would show them)
     stay selected after their bays are gone. With activeBaySelection now
     empty, canvas2's GroupRotateOverlay gate (selectedObjects.length >= 2
     && no active bay selection) is satisfied again, so the group-rotate
     outline/handle reappeared around racks nothing was actually asking to
     rotate (BUG 31). clearSelection() afterward drops selectedIds too, so
     a bay delete leaves nothing selected at all — matching "the bays are
     gone, so is the selection that picked them," not "now select the
     whole rows instead." Kept as a wrapper here rather than a change to
     the protected deleteSelectedBays action itself. */
  // a pair's bays picked on one side go from that side only (utils/baySides.js); otherwise the store's own delete
  const deleteSelectedBaysAndClear = () => { if (deleteBaySelection(useCanvasStore, nanoid)) return; deleteSelectedBays(); clearSelection() }

  const fmtIn = fmtFtIn
  const warnFor = (b) => cachedWarn(objects, `multi|${gridSize}|${JSON.stringify(activeBaySelection)}|${b}`,
    () => issuesText([...changeIssues(objects, planBayBeamChange(objects, activeBaySelection, b, gridSize), gridSize).byId.values()], fmtIn))
  const racksNow = [...new Set(activeBaySelection.map(e => e.objId))].map(id => objects.find(o => o.id === id)).filter(Boolean)
  const nowWarn = issuesText(racksNow.map(o => rackIssues(o, objects, gridSize)), fmtIn)

  // Summarise selected bays
  const rowCount = new Set(activeBaySelection.map(e => e.objId)).size
  const bayCount = activeBaySelection.length
  const beamSizes = [...new Set(activeBaySelection.map(({ objId, bayIdx }) => {
    const obj = objects.find(o => o.id === objId)
    return obj?.beams?.[bayIdx]
  }).filter(Boolean))]
  const allSame = beamSizes.length === 1

  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{
        padding: '6px 8px', borderRadius: 5,
        background: 'var(--accent-dim)', border: '1px solid var(--accent-bdr)',
        fontFamily: 'var(--font-mono)', fontSize: 9,
      }}>
        <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 2 }}>
          {bayCount} bay{bayCount > 1 ? 's' : ''} selected across {rowCount} row{rowCount > 1 ? 's' : ''}
        </div>
        <div style={{ color: 'var(--text3)' }}>
          {allSame ? `All ${fmtIn(beamSizes[0])} beams` : `Mixed: ${beamSizes.map(fmtIn).join(', ')}`}
        </div>
        <OneSideHint />
      </div>

      {/* one beam length for every bay picked */}
      <div>
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Change all to
        </div>
        <BeamSelect value={allSame ? beamSizes[0] : null} aria="Selected bays beam" warnFor={warnFor} onPick={b => changeSelectedBaysBeam(b)} />
      </div>
      <RackWarning text={nowWarn} />

      {/* Delete + Clear */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={deleteSelectedBaysAndClear}
          style={{
            flex: 1, padding: '5px 0', borderRadius: 4, cursor: 'pointer',
            fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
            background: 'var(--red-dim)', border: '1px solid var(--red-bdr)', color: 'var(--red)',
          }}>
          Delete {bayCount} bay{bayCount > 1 ? 's' : ''}
        </button>
        <button
          onClick={clearBaySelection}
          style={{
            padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
            fontSize: 9, fontFamily: 'var(--font-mono)',
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)',
          }}>
          Clear
        </button>
      </div>
    </div>
  )
}

/* One beam-length dropdown: the common sizes 4'–16' and Custom… (inches or feet, typed). `warnFor(b)` — the red
   warning that length would cause (an overlap, past the wall), shown under it and marked on the option; never a
   block. Replaces the two button grids (change a bay, add a bay). */
export function BeamSelect({ value, onPick, warnFor = () => null, aria = 'Beam length' }) {
  const [custom, setCustom] = useState(false)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const preset = BEAM_PRESETS_IN.includes(value)
  const apply = () => { const v = parseBeamIn(text); if (v == null) { setBad(text.trim() !== ''); return } setBad(false); setText(''); setCustom(false); onPick(v) }
  const warn = value != null ? warnFor(value) : null
  const sel = { flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--surface2)', border: `1px solid ${warn ? 'var(--red)' : 'var(--border)'}`, color: 'var(--text)', outline: 'none' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <select aria-label={aria} value={custom ? 'custom' : preset ? String(value) : value != null ? 'other' : ''} style={sel}
        onChange={e => { const v = e.target.value; if (v === 'custom') { setCustom(true); return } setCustom(false); if (v !== 'other' && v !== '') onPick(Number(v)) }}>
        {!preset && value != null && <option value="other">{fmtFtIn(value)} ({value}")</option>}
        {BEAM_PRESETS_IN.map(b => { const w = warnFor(b); return <option key={b} value={String(b)}>{`${b / 12}' (${b}")${w ? '  ⚠' : ''}`}</option> })}
        <option value="custom">Custom…</option>
      </select>
      {custom && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input autoFocus type="text" value={text} placeholder={'inches or feet — 102, 8\'6"'} aria-label={`Custom ${aria.toLowerCase()}`}
            onChange={e => { setText(e.target.value); setBad(false) }} onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setCustom(false) }}
            style={{ ...sel, border: `1px solid ${bad ? 'var(--red)' : 'var(--border)'}` }} />
          <button type="button" onClick={apply} aria-label={`Apply custom ${aria.toLowerCase()}`} style={{ padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>Set</button>
        </div>
      )}
      {bad && <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>12" to 360", e.g. 102, 8'6", 9'</div>}
      {warn && <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{warn}</div>}
    </div>
  )
}

/* The rack panel, in collapsible sections: Summary (pallets, length, bays, and the elevation as one read-only line —
   elevations are set in the Elevations tab, components/Elevations/ElevationsTab.jsx), Bays (the list, + Bay / − Bay,
   one beam length), Rack, collapsed (frame depth, upright, pallet size, flue). */
export function RackRowPanel({ obj }) {
  const { objects, updateObject, commitObjectUpdate, deleteSingleBay, gridSize } = useCanvasStore(useShallow(s => ({ objects: s.objects, updateObject: s.updateObject, commitObjectUpdate: s.commitObjectUpdate, deleteSingleBay: s.deleteSingleBay, gridSize: s.gridSize })))

  const beams   = obj.beams || [96]
  const upIn    = obj.uprightWidth || 3
  const activeBay = obj.activeBayIdx ?? null
  const levels  = obj.levels || 1
  const totalIn = upIn * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
  /* as counted (utils/bayLedger.js): a bay more than half covered by another rack's bay isn't counted here */
  const ledgerEntry = useBayLedger(objects, gridSize || 40).racks.get(obj.id)
  // each bay-side's levels from its elevation type (utils/elevations.js)
  const elevations = useCanvasStore(s => s.elevations)
  const fullCapacity = getRackCapacity(obj, undefined, levelsResolver(elevations))
  const capacity = fullCapacity && ledgerEntry && ledgerEntry.uncounted
    ? { ...fullCapacity, total: ledgerEntry.positions, groundTotal: ledgerEntry.positions / levels }
    : fullCapacity
  const overlapBays = ledgerEntry ? ledgerEntry.uncounted : 0

  const clear   = getWallClear(obj, objects, gridSize)
  const clearIn = clear?.clearIn ?? null
  // room from the rack's far end (where it grows) to the wall ahead, along its own length
  const remainIn = clear ? Math.round(clear.aheadIn * 100) / 100 : null
  const overBy   = remainIn != null && remainIn < 0 ? Math.abs(remainIn) : 0

  const fmtIn = fmtFtIn
  /* the beam the dropdown shows: the picked bay's (a change to it), else the length a new bay gets */
  const [newBeam, setNewBeam] = useState(beams[beams.length - 1] || 96)
  const beamShown = activeBay !== null ? beams[activeBay] : newBeam

  /* Red warnings, never a block: what a pick would cause, and the rack as it stands now (overlaps another rack /
     passes the wall). */
  const warnAdd = (b) => cachedWarn(objects, `add|${gridSize}|${obj.id}|${b}`,
    () => issuesText([...changeIssues(objects, new Map([[obj.id, addBayUpdate(obj, b, gridSize)]]), gridSize).byId.values()], fmtIn))
  const warnChange = (b) => activeBay === null ? null : cachedWarn(objects, `change|${gridSize}|${obj.id}|${activeBay}|${b}`,
    () => issuesText([...changeIssues(objects, new Map([[obj.id, changeBayUpdate(obj, activeBay, b, gridSize)]]), gridSize).byId.values()], fmtIn))
  const nowWarn = issuesText([rackIssues(obj, objects, gridSize)], fmtIn)

  // Add a bay at the far end; the existing bays stay where they are drawn
  const addBay = (beamIn = 96) => commitObjectUpdate(obj.id, addBayUpdate(obj, beamIn, gridSize))
  // Change a bay's beam: bays before it stay put, later ones slide (start end held)
  const changeBay = (bayIdx, newBeamIn) => commitObjectUpdate(obj.id, changeBayUpdate(obj, bayIdx, newBeamIn, gridSize))
  // Remove active bay (or last bay if none selected)
  const removeBay = () => {
    // a pair's bay picked on one side: off that side only, as the Delete key (utils/baySides.js, BUG 88)
    if (deleteBaySelection(useCanvasStore, nanoid)) return
    if (beams.length <= 1) return
    const idxToRemove = activeBay !== null ? activeBay : beams.length - 1
    /* The same store action as the Delete key (deleteSingleBay): an end bay shortens the rack with the other end
       held; a middle bay splits it, leaving a gap, every remaining bay where it was drawn. */
    deleteSingleBay(obj.id, idxToRemove)
  }

  const label = (s, w = 56) => (
    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: w, flexShrink: 0 }}>{s}</span>
  )
  const chip = (on) => ({
    padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)',
    background: on ? 'var(--accent-solid)' : 'var(--surface3)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
    color: on ? 'var(--accent-fg)' : 'var(--text2)',
  })
  const btn = (enabled, color = 'var(--text)') => ({
    flex: 1, padding: '5px 8px', borderRadius: 5, fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed', background: 'var(--surface2)', border: '1px solid var(--border)', color: enabled ? color : 'var(--text3)',
  })
  const row = (k, v, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
      <span style={{ color: 'var(--text3)' }}>{k}</span><span style={{ color: color || 'var(--text2)', fontWeight: color ? 700 : 400 }}>{v}</span>
    </div>
  )

  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Summary: pallets, length, bays ── */}
      <Fold title="Summary" aria="Rack summary">
        <div style={{ padding: '6px 8px', borderRadius: 5, background: overBy > 0 ? 'var(--red-dim)' : 'var(--surface2)', border: `1px solid ${overBy > 0 ? 'var(--red)' : 'var(--border)'}`, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text3)' }}>Pallets</span>
            <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{capacity ? capacity.total : 0} PAL</span>
          </div>
          {capacity && row('Ground level', `${capacity.groundTotal} × ${levels} level${levels > 1 ? 's' : ''}`)}
          {row('Total length', fmtIn(totalIn), overBy > 0 ? 'var(--red)' : undefined)}
          {row('Bays', beams.length)}
          {clearIn != null && row('Wall clear', fmtIn(clearIn))}
          {clearIn != null && row(overBy > 0 ? 'Exceeds by' : 'Remaining', overBy > 0 ? `${fmtIn(overBy)} !` : fmtIn(remainIn), overBy > 0 ? 'var(--red)' : 'var(--green)')}
          {clearIn == null && <div style={{ color: 'var(--text3)', marginTop: 2 }}>No floor plan — length only</div>}
          {overlapBays > 0 && (
            <div data-testid="rack-overlap-bays" style={{ marginTop: 2, color: 'var(--amber, #B87309)' }}>
              {overlapBays} bay{overlapBays === 1 ? '' : 's'} overlap another rack — not counted
            </div>
          )}
        </div>
        <RackWarning text={nowWarn} />
        <ElevationLine />
      </Fold>

      {/* ── Bays: the list, + Bay / − Bay, one beam length ── */}
      <Fold title={`Bays (${beams.length})`} aria="Bays">
        <div role="list" aria-label="Bay list" style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 168, overflowY: 'auto' }}>
          {beams.map((beamIn, i) => {
            const isActive = activeBay === i
            const pal = positionsPerBeam(beamIn, obj.palletWIn || 40)
            return (
              <div key={i} role="listitem" onClick={() => updateObject(obj.id, { activeBayIdx: activeBay === i ? null : i, activeBaySide: null })}   // from the list: the whole bay, both sides
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)',
                  background: isActive ? 'var(--accent-solid)' : 'transparent', color: isActive ? 'var(--accent-fg)' : 'var(--text)' }}>
                <span style={{ minWidth: 22, color: isActive ? 'var(--accent-fg)' : 'var(--text3)' }}>B{i + 1}</span>
                <span style={{ flex: 1 }}>{fmtIn(beamIn)}</span>
                <span title={pal ? `${pal} pallet${pal > 1 ? 's' : ''} per level per face` : 'Beam too short for one pallet'}
                  style={{ color: pal ? (isActive ? 'var(--accent-fg)' : 'var(--text2)') : 'var(--red)', fontWeight: pal ? 400 : 700 }}>{pal ? `${pal} pal` : '0 ✕'}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {label(activeBay !== null ? `Bay ${activeBay + 1}` : 'New bay', 56)}
          <BeamSelect value={beamShown} aria={activeBay !== null ? `Bay ${activeBay + 1} beam` : 'New bay beam'}
            warnFor={activeBay !== null ? warnChange : warnAdd}
            onPick={b => (activeBay !== null ? changeBay(activeBay, b) : setNewBeam(b))} />
        </div>
        <OneSideHint />
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => addBay(beamShown)} aria-label={`+ Bay ${fmtIn(beamShown)}`} title={warnAdd(beamShown) || `Add a ${fmtIn(beamShown)} bay at the far end`} style={btn(true, warnAdd(beamShown) ? 'var(--red)' : 'var(--text)')}>+ Bay</button>
          <button type="button" onClick={removeBay} disabled={beams.length <= 1} style={btn(beams.length > 1, 'var(--red)')}>− Bay</button>
        </div>
      </Fold>

      {/* ── Rack: frame depth, upright, pallet size, flue (collapsed) ── */}
      <Fold title="Rack" defaultOpen={false} aria="Rack">
        {/* frame depth: this rack only, about its centre (utils/rackDepth.js) — overlaps show as warnings and X marks;
            the Row group replays it; nothing is regenerated */}
        <Field label="Frame depth" aria="Rack depth" value={obj.depthIn ?? 42} title="This rack only — resized about its centre; overlaps show as warnings"
          onCommit={v => { const u = rackDepthUpdate(obj, v, gridSize || 40); if (u) commitObjectUpdate(obj.id, u) }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {label('Upright', 86)}
          {[3, 4].map(u => (
            <button key={u} type="button" aria-pressed={upIn === u}
              onClick={() => {
                const newTotalIn = u * (beams.length + 1) + beams.reduce((s,b)=>s+b,0)
                const newW = (newTotalIn / 12) * gridSize
                commitObjectUpdate(obj.id, withAnchoredPosition(obj, { uprightWidth: u, width: newW }))
              }}
              style={chip(upIn === u)}>{u}"</button>
          ))}
        </div>
        {/* the pallet size: the project's default (Project setup) — Generate and Fill stamp it on the racks */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{label('Pallet', 86)}<span aria-label="Pallet size" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{obj.palletWIn || 40}" face × {obj.palletDIn || 48}"</span></div>
        {/* ── Flue space (double row only) ── */}
        {obj.type === 'rack_double_row' && (() => {
          const flue = obj.flueSpaceIn || 9
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {label('Flue', 86)}
              {[6, 9, 12].map(f => (
                <button key={f} type="button"
                  onClick={() => {
                    // Update height: newH = rowH*2 + newFlue; rowH = (obj.height - oldFlueH) / 2
                    const oldFlueH = (flue / 12) * gridSize
                    const rowH    = (obj.height - oldFlueH) / 2
                    const newFlueH = (f / 12) * gridSize
                    const newH    = rowH * 2 + newFlueH
                    /* flueBaseIn alongside flueSpaceIn — a dealer picking a Flue value here is a deliberate, genuine
                       choice, so it becomes the new base the live-auto-flue drag (see useCanvasInteraction.js's
                       beginDrag) reverts to away from a column, not just this instant's rendered value. */
                    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { flueSpaceIn: f, flueBaseIn: f, height: newH }))
                  }}
                  style={chip(flue === f)}>{f}"</button>
              ))}
            </div>
          )
        })()}
      </Fold>
    </div>
  )
}
