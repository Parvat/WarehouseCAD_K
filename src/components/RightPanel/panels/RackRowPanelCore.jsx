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
import { Sec, Field, SelectField, Grid2, Row, Seg, Btn, Note, Hint, SecLabel, fieldBox, C, MONO, LEVEL } from '../../../studio/cardParts'
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

/* Red warning: a rack overlaps another or passes the wall. Never blocks. (Studio: the error message box.) */
export function RackWarning({ text }) {
  if (!text) return null
  return <Note level="error" role="alert">{text}</Note>
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
  return <Hint>One side selected · click between the sides to select both</Hint>
}

/* Bays picked (one rack or several): their count, one beam length for all of them, Delete N bays / Clear — a card
   block at the top of the card (src/studio/cardParts.jsx). */
export function MultiBayPanel() {
  const { activeBaySelection, objects, deleteSelectedBays, changeSelectedBaysBeam, clearBaySelection, clearSelection, gridSize } = useCanvasStore(useShallow(s => ({ activeBaySelection: s.activeBaySelection, objects: s.objects, deleteSelectedBays: s.deleteSelectedBays, changeSelectedBaysBeam: s.changeSelectedBaysBeam, clearBaySelection: s.clearBaySelection, clearSelection: s.clearSelection, gridSize: s.gridSize })))
  if (!activeBaySelection || activeBaySelection.length === 0) return null

  /* deleteSelectedBays (the store action) only ever clears activeBaySelection, not selectedIds — the rack ROWS a bay
     marquee added to selectedIds stay selected after their bays are gone, and canvas2's group-rotate gate would show
     its outline again (BUG 31). clearSelection() afterward drops selectedIds too, so a bay delete leaves nothing
     selected. Kept as a wrapper here rather than a change to the protected deleteSelectedBays action itself. */
  // a pair's bays picked on one side go from that side only (utils/baySides.js); otherwise the store's own delete
  const deleteSelectedBaysAndClear = () => { if (deleteBaySelection(useCanvasStore, nanoid)) return; deleteSelectedBays(); clearSelection() }

  const fmtIn = fmtFtIn
  const warnFor = (b) => cachedWarn(objects, `multi|${gridSize}|${JSON.stringify(activeBaySelection)}|${b}`,
    () => issuesText([...changeIssues(objects, planBayBeamChange(objects, activeBaySelection, b, gridSize), gridSize).byId.values()], fmtIn))
  const racksNow = [...new Set(activeBaySelection.map(e => e.objId))].map(id => objects.find(o => o.id === id)).filter(Boolean)
  const nowWarn = issuesText(racksNow.map(o => rackIssues(o, objects, gridSize)), fmtIn)

  const rowCount = new Set(activeBaySelection.map(e => e.objId)).size
  const bayCount = activeBaySelection.length
  const beamSizes = [...new Set(activeBaySelection.map(({ objId, bayIdx }) => {
    const obj = objects.find(o => o.id === objId)
    return obj?.beams?.[bayIdx]
  }).filter(Boolean))]
  const allSame = beamSizes.length === 1

  return (
    <Sec aria-label="Selected bays">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: C.strong }}>{bayCount} bay{bayCount > 1 ? 's' : ''} selected across {rowCount} row{rowCount > 1 ? 's' : ''}</span>
        <Hint>{allSame ? `All ${fmtIn(beamSizes[0])} beams` : `Mixed: ${beamSizes.map(fmtIn).join(', ')}`}</Hint>
        <OneSideHint />
      </div>
      {/* one beam length for every bay picked */}
      <Field label="Change all to">
        <BeamSelect value={allSame ? beamSizes[0] : null} aria="Selected bays beam" warnFor={warnFor} onPick={b => changeSelectedBaysBeam(b)} />
      </Field>
      <RackWarning text={nowWarn} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn kind="danger" style={{ flex: 1 }} onClick={deleteSelectedBaysAndClear}>Delete {bayCount} bay{bayCount > 1 ? 's' : ''}</Btn>
        <Btn kind="ghost" onClick={clearBaySelection}>Clear</Btn>
      </div>
    </Sec>
  )
}

/* One beam-length dropdown: the common sizes 4'–16' and Custom… (inches or feet, typed). `warnFor(b)` — the red
   warning that length would cause (an overlap, past the wall), shown under it and marked on the option; never a
   block. */
export function BeamSelect({ value, onPick, warnFor = () => null, aria = 'Beam length' }) {
  const [custom, setCustom] = useState(false)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const preset = BEAM_PRESETS_IN.includes(value)
  const apply = () => { const v = parseBeamIn(text); if (v == null) { setBad(text.trim() !== ''); return } setBad(false); setText(''); setCustom(false); onPick(v) }
  const warn = value != null ? warnFor(value) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <SelectField aria={aria} value={custom ? 'custom' : preset ? String(value) : value != null ? 'other' : ''}
        style={warn ? { boxShadow: `inset 0 0 0 1px ${C.danger}` } : undefined}
        onChange={e => { const v = e.target.value; if (v === 'custom') { setCustom(true); return } setCustom(false); if (v !== 'other' && v !== '') onPick(Number(v)) }}>
        {!preset && value != null && <option value="other">{fmtFtIn(value)} ({value}")</option>}
        {value == null && <option value="">—</option>}
        {BEAM_PRESETS_IN.map(b => { const w = warnFor(b); return <option key={b} value={String(b)}>{`${b / 12}' (${b}")${w ? '  ⚠' : ''}`}</option> })}
        <option value="custom">Custom…</option>
      </SelectField>
      {custom && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input autoFocus type="text" value={text} placeholder={'inches or feet — 102, 8\'6"'} aria-label={`Custom ${aria.toLowerCase()}`} className="st-field"
            onChange={e => { setText(e.target.value); setBad(false) }} onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setCustom(false) }}
            style={{ ...fieldBox(), ...(bad ? { boxShadow: `inset 0 0 0 1px ${C.danger}` } : null) }} />
          <Btn kind="inset" onClick={apply} aria-label={`Apply custom ${aria.toLowerCase()}`} style={{ height: 30, padding: '0 10px', fontSize: 12 }}>Set</Btn>
        </div>
      )}
      {bad && <Hint style={{ color: C.danger }}>12" to 360", e.g. 102, 8'6", 9'</Hint>}
      {warn && <Hint style={{ color: LEVEL.error.fg }}>{warn}</Hint>}
    </div>
  )
}

/* The rack's detail under More (the card's C1 block — Bays · Beam · Depth · Flue — is src/studio/cards.jsx RackMain):
   the summary (pallets, ground level, length, wall clear, remaining), its warnings, the bay list (click a bay to pick
   it), the picked bay's beam or the next new bay's, + Bay / − Bay, the pallet. `newBeam` / `setNewBeam` are shared
   with the Beam field; without them the panel keeps its own (RackRowPanel). */
export function RackRowExtras({ obj, newBeam: sharedBeam, setNewBeam: setSharedBeam }) {
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
  const [ownBeam, setOwnBeam] = useState(beams[beams.length - 1] || 96)
  const newBeam = sharedBeam ?? ownBeam, setNewBeam = setSharedBeam ?? setOwnBeam
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

  /* a summary row: <span>label</span><span>value</span> — muted label, value in mono */
  const row = (k, v, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{k}</span><span style={{ fontFamily: MONO, fontSize: 12, color: color || C.strong }}>{v}</span>
    </div>
  )

  return (
    <>
      {/* ── Summary: pallets, length, bays ── */}
      <SecLabel>Summary</SecLabel>
      <div aria-label="Rack summary" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {row('Pallets', `${capacity ? capacity.total : 0} PAL`)}
        {capacity && row('Ground level', `${capacity.groundTotal} × ${levels} level${levels > 1 ? 's' : ''}`)}
        {row('Total length', fmtIn(totalIn), overBy > 0 ? LEVEL.error.fg : undefined)}
        {row('Bays', beams.length)}
        {clearIn != null && row('Wall clear', fmtIn(clearIn))}
        {clearIn != null && row(overBy > 0 ? 'Exceeds by' : 'Remaining', overBy > 0 ? `${fmtIn(overBy)} !` : fmtIn(remainIn), overBy > 0 ? LEVEL.error.fg : C.accent)}
        {clearIn == null && <Hint>No floor plan — length only</Hint>}
      </div>
      {overlapBays > 0 && (
        <Note level="warning" data-testid="rack-overlap-bays">
          {overlapBays} bay{overlapBays === 1 ? '' : 's'} overlap another rack — not counted
        </Note>
      )}
      <RackWarning text={nowWarn} />

      {/* ── Bays: the list, + Bay / − Bay, one beam length ── */}
      <SecLabel>Bays ({beams.length})</SecLabel>
      <div role="list" aria-label="Bay list" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 168, overflowY: 'auto' }}>
        {beams.map((beamIn, i) => {
          const isActive = activeBay === i
          const pal = positionsPerBeam(beamIn, obj.palletWIn || 40)
          return (
            <div key={i} role="listitem" onClick={() => updateObject(obj.id, { activeBayIdx: activeBay === i ? null : i, activeBaySide: null })}   // from the list: the whole bay, both sides
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: MONO,
                background: isActive ? C.active : 'transparent', color: isActive ? C.accent : C.strong }}>
              <span style={{ minWidth: 22, color: isActive ? C.accent : C.muted }}>B{i + 1}</span>
              <span style={{ flex: 1 }}>{fmtIn(beamIn)}</span>
              <span title={pal ? `${pal} pallet${pal > 1 ? 's' : ''} per level per face` : 'Beam too short for one pallet'}
                style={{ color: pal ? (isActive ? C.accent : C.text) : LEVEL.error.fg }}>{pal ? `${pal} pal` : '0 ✕'}</span>
            </div>
          )
        })}
      </div>
      <Field label={activeBay !== null ? `Bay ${activeBay + 1}` : 'New bay'}>
        <BeamSelect value={beamShown} aria={activeBay !== null ? `Bay ${activeBay + 1} beam` : 'New bay beam'}
          warnFor={activeBay !== null ? warnChange : warnAdd}
          onPick={b => (activeBay !== null ? changeBay(activeBay, b) : setNewBeam(b))} />
      </Field>
      <OneSideHint />
      <Grid2>
        <Btn kind="ghost" onClick={() => addBay(beamShown)} aria-label={`+ Bay ${fmtIn(beamShown)}`} title={warnAdd(beamShown) || `Add a ${fmtIn(beamShown)} bay at the far end`}
          style={warnAdd(beamShown) ? { color: LEVEL.error.fg } : undefined}>+ Bay</Btn>
        <Btn kind="danger" onClick={removeBay} disabled={beams.length <= 1} style={beams.length <= 1 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>− Bay</Btn>
      </Grid2>

      {/* ── Rack: the upright (a pair's; a single row's is in the C1 block) and the pallet ── */}
      <SecLabel>Rack</SecLabel>
      {obj.type === 'rack_double_row' && (
        <Field label="Upright">
          <Seg aria="Upright" mono value={upIn} onChange={u => {
            const newTotalIn = u * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
            const newW = (newTotalIn / 12) * gridSize
            commitObjectUpdate(obj.id, withAnchoredPosition(obj, { uprightWidth: u, width: newW }))
          }} options={[3, 4].map(u => ({ value: u, label: `${u}"` }))} />
        </Field>
      )}
      {/* the pallet size: the project's default (Project setup) — Generate and Fill stamp it on the racks */}
      <Row label={<span style={{ color: C.muted, fontSize: 12 }}>Pallet</span>}>
        <span aria-label="Pallet size" style={{ fontFamily: MONO, fontSize: 12, color: C.strong }}>{obj.palletWIn || 40}" face × {obj.palletDIn || 48}"</span>
      </Row>
    </>
  )
}

/** The rack panel as one block (tests and older callers): the detail with its own new-bay beam. */
export function RackRowPanel({ obj }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><RackRowExtras obj={obj} /></div>
}
