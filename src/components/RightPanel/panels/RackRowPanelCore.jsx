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
import { Note } from '../../shared/Note'
import { TriangleAlert } from 'lucide-react'
import { ElevationLine } from '../../Elevations/ElevationLine'
import { setRackDepths } from '../../../utils/rackDepthAction'
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
    <Note level="error" icon={TriangleAlert} role="alert">
      {text}
    </Note>
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
    <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--steel)', lineHeight: 1.5 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {/* Header — a white card, the count in ink */}
      <div style={{
        padding: '8px 12px', borderRadius: 4,
        background: 'var(--paper)', border: '1px solid var(--line)',
        fontFamily: 'var(--font-ui)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
          {bayCount} bay{bayCount > 1 ? 's' : ''} selected across {rowCount} row{rowCount > 1 ? 's' : ''}
        </div>
        <div style={{ color: 'var(--steel)' }}>
          {allSame ? `All ${fmtIn(beamSizes[0])} beams` : `Mixed: ${beamSizes.map(fmtIn).join(', ')}`}
        </div>
        <OneSideHint />
      </div>

      {/* one beam length for every bay picked */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div className="t-cap">
          Change all to
        </div>
        <BeamSelect value={allSame ? beamSizes[0] : null} aria="Selected bays beam" warnFor={warnFor} onPick={b => changeSelectedBaysBeam(b)} />
      </div>
      <RackWarning text={nowWarn} />

      {/* Delete + Clear */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={deleteSelectedBaysAndClear}
          className="t-btn t-btn--danger" style={{ flex: 1, minWidth: 0 }}>
          Delete {bayCount} bay{bayCount > 1 ? 's' : ''}
        </button>
        <button
          onClick={clearBaySelection}
          className="t-btn t-btn--secondary">
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
  /* a select of lengths (figures): .t-input in mono; a length that would cause a warning gets a flag border */
  const sel = { flex: 1, width: '100%', fontFamily: 'var(--font-mono)', ...(warn ? { borderColor: 'var(--flag)' } : null) }
  const msg = { fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--flag)', lineHeight: 1.5 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <select aria-label={aria} value={custom ? 'custom' : preset ? String(value) : value != null ? 'other' : ''} className="t-input" style={sel}
        onChange={e => { const v = e.target.value; if (v === 'custom') { setCustom(true); return } setCustom(false); if (v !== 'other' && v !== '') onPick(Number(v)) }}>
        {!preset && value != null && <option value="other">{fmtFtIn(value)} ({value}")</option>}
        {BEAM_PRESETS_IN.map(b => { const w = warnFor(b); return <option key={b} value={String(b)}>{`${b / 12}' (${b}")${w ? '  ⚠' : ''}`}</option> })}
        <option value="custom">Custom…</option>
      </select>
      {custom && (
        <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
          <input autoFocus type="text" value={text} placeholder={'inches or feet — 102, 8\'6"'} aria-label={`Custom ${aria.toLowerCase()}`}
            onChange={e => { setText(e.target.value); setBad(false) }} onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setCustom(false) }}
            className="t-input" style={{ flex: 1, ...(bad ? { borderColor: 'var(--flag)' } : null) }} />
          <button type="button" onClick={apply} aria-label={`Apply custom ${aria.toLowerCase()}`} className="t-btn t-btn--secondary">Set</button>
        </div>
      )}
      {bad && <div style={msg}>12" to 360", e.g. 102, 8'6", 9'</div>}
      {warn && <div style={msg}>{warn}</div>}
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

  /* Words PJS (labels steel 12, .t-label), figures mono (.t-num). Option chips are 32px secondaries, the picked one
     pine (aria-pressed / .is-on); "+ Bay" secondary, "− Bay" danger; disabled by the attribute alone. */
  const label = (s, w = 56) => (
    <span className="t-label" style={{ width: w, flexShrink: 0, lineHeight: '32px' }}>{s}</span>
  )
  const chip = (on) => 't-btn t-btn--secondary' + (on ? ' is-on' : '')
  const chipSt = { padding: '0 12px', fontFamily: 'var(--font-mono)', fontWeight: 400 }
  /* a summary row: the word steel, the figure ink (flag when it is the problem); `words` sets a value of words in PJS */
  const row = (k, v, color, words) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ color: 'var(--steel)' }}>{k}</span><span className={words ? undefined : 't-num'} style={{ color: color || 'var(--ink)', fontSize: 13, fontWeight: color ? 600 : 400, textAlign: 'right', minWidth: 0 }}>{v}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

      {/* ── Summary: pallets, length, bays ── */}
      <Fold title="Summary" aria="Rack summary">
        <div style={{ padding: '8px 12px', borderRadius: 4, background: overBy > 0 ? 'var(--error-bg)' : 'var(--paper)', border: `1px solid ${overBy > 0 ? 'var(--error-bd)' : 'var(--line)'}`, fontFamily: 'var(--font-ui)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: 'var(--steel)' }}>Pallets</span>
            <span className="t-num" style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 18 }}>{capacity ? capacity.total : 0} PAL</span>
          </div>
          {capacity && row('Ground level', <><span className="t-num">{capacity.groundTotal} × {levels}</span>{` level${levels > 1 ? 's' : ''}`}</>, undefined, true)}
          {row('Total length', fmtIn(totalIn), overBy > 0 ? 'var(--flag)' : undefined)}
          {row('Bays', beams.length)}
          {clearIn != null && row('Wall clear', fmtIn(clearIn))}
          {clearIn != null && row(overBy > 0 ? 'Exceeds by' : 'Remaining', overBy > 0 ? `${fmtIn(overBy)} !` : fmtIn(remainIn), overBy > 0 ? 'var(--flag)' : undefined)}
          {clearIn == null && <div style={{ color: 'var(--steel)' }}>No floor plan — length only</div>}
          {overlapBays > 0 && (
            <div data-testid="rack-overlap-bays" style={{ color: 'var(--warn-fg)' }}>
              {overlapBays} bay{overlapBays === 1 ? '' : 's'} overlap another rack — not counted
            </div>
          )}
        </div>
        <RackWarning text={nowWarn} />
        <ElevationLine />
      </Fold>

      {/* ── Bays: the list, + Bay / − Bay, one beam length ── */}
      <Fold title={`Bays (${beams.length})`} aria="Bays">
        <div role="list" aria-label="Bay list" style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 168, overflowY: 'auto' }}>
          {beams.map((beamIn, i) => {
            const isActive = activeBay === i
            const pal = positionsPerBeam(beamIn, obj.palletWIn || 40)
            return (
              <div key={i} role="listitem" onClick={() => updateObject(obj.id, { activeBayIdx: activeBay === i ? null : i, activeBaySide: null })}   // from the list: the whole bay, both sides
                className="t-num"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 2, cursor: 'pointer', fontSize: 12,
                  background: isActive ? 'var(--pine)' : 'transparent', color: isActive ? 'var(--paper)' : 'var(--ink)' }}>
                <span style={{ minWidth: 24, color: isActive ? 'var(--paper)' : 'var(--steel)' }}>B{i + 1}</span>
                <span style={{ flex: 1 }}>{fmtIn(beamIn)}</span>
                <span title={pal ? `${pal} pallet${pal > 1 ? 's' : ''} per level per face` : 'Beam too short for one pallet'}
                  style={{ color: pal ? (isActive ? 'var(--paper)' : 'var(--ink-2)') : (isActive ? 'var(--paper)' : 'var(--flag)'), fontWeight: pal ? 400 : 600 }}>{pal ? `${pal} pal` : '0 ✕'}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
          {label(activeBay !== null ? `Bay ${activeBay + 1}` : 'New bay', 56)}
          <BeamSelect value={beamShown} aria={activeBay !== null ? `Bay ${activeBay + 1} beam` : 'New bay beam'}
            warnFor={activeBay !== null ? warnChange : warnAdd}
            onPick={b => (activeBay !== null ? changeBay(activeBay, b) : setNewBeam(b))} />
        </div>
        <OneSideHint />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <button type="button" onClick={() => addBay(beamShown)} aria-label={`+ Bay ${fmtIn(beamShown)}`} title={warnAdd(beamShown) || `Add a ${fmtIn(beamShown)} bay at the far end`} className="t-btn t-btn--secondary" style={{ minWidth: 0, ...(warnAdd(beamShown) ? { color: 'var(--flag)' } : null) }}>+ Bay</button>
          <button type="button" onClick={removeBay} disabled={beams.length <= 1} className="t-btn t-btn--danger" style={{ minWidth: 0 }}>− Bay</button>
        </div>
      </Fold>

      {/* ── Rack: frame depth, upright, pallet size, flue (collapsed) ── */}
      <Fold title="Rack" defaultOpen={false} aria="Rack">
        {/* frame depth: this rack only, the one depth change (utils/rackDepthAction.js — against a wall the wall face
            stays, else about its centre) — overlaps show as warnings and X marks; the Row group replays it */}
        <Field label="Frame depth" aria="Rack depth" value={obj.depthIn ?? 42} title="This rack only — against a wall it keeps its wall clearance and grows away from the wall; otherwise about its centre"
          onCommit={v => { setRackDepths(useCanvasStore, [obj.id], v) }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {label('Upright', 100)}
          {[3, 4].map(u => (
            <button key={u} type="button" aria-pressed={upIn === u}
              onClick={() => {
                const newTotalIn = u * (beams.length + 1) + beams.reduce((s,b)=>s+b,0)
                const newW = (newTotalIn / 12) * gridSize
                commitObjectUpdate(obj.id, withAnchoredPosition(obj, { uprightWidth: u, width: newW }))
              }}
              className={chip(upIn === u)} style={chipSt}>{u}"</button>
          ))}
        </div>
        {/* the pallet size: the project's default (Project setup) — Generate and Fill stamp it on the racks */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>{label('Pallet', 100)}<span aria-label="Pallet size" style={{ fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--ink-2)' }}><span className="t-num">{obj.palletWIn || 40}"</span> face × <span className="t-num">{obj.palletDIn || 48}"</span></span></div>
        {/* ── Flue space (double row only) ── */}
        {obj.type === 'rack_double_row' && (() => {
          const flue = obj.flueSpaceIn || 9
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {label('Flue', 100)}
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
                  className={chip(flue === f)} style={chipSt}>{f}"</button>
              ))}
            </div>
          )
        })()}
      </Fold>
    </div>
  )
}
