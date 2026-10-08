// capacity.js
// Pure functions for warehouse pallet capacity calculations.
//
// Fallbacks come from the resolved rules profile rather than literals: a rack
// that predates a field, or one drawn before a dealer set their standard, is
// counted against that dealer's pallet and beam rather than a hardcoded 48/96.
// Per-object values still win — they are what is actually drawn.
import { bayLedger } from './bayLedger'
import { DEFAULT_RULES } from '../rules/defaults'

// The pallet spacing along a beam and positionsPerBeam live in palletFit.js (shared with bayLedger.js, so the two
// never import each other); re-exported here, where they have always been imported from.
import { UPRIGHT_CLEARANCE_IN, PALLET_GAP_IN, positionsPerBeam } from './palletFit'
export { UPRIGHT_CLEARANCE_IN, PALLET_GAP_IN, positionsPerBeam }

/** Position `i`'s own [startIn, endIn) footprint along the beam — LOCAL to
 *  the beam's own start (0 = the near upright's inside edge). Pallets sit
 *  3" off the near upright, 4" apart; each position owns its pallet plus
 *  half the 4" gap on each side, and the first and last extend to the
 *  uprights (their full 3"). The footprints are contiguous from 0 to the
 *  last pallet's 3" clearance; any slack past that belongs to no position.
 *  Returns null for an index that doesn't fit. */
export function positionFootprintIn(beamIn, palletFaceIn, i) {
  const n = positionsPerBeam(beamIn, palletFaceIn)
  if (!(i >= 0 && i < n)) return null
  const halfGap = PALLET_GAP_IN / 2
  const palletStart = UPRIGHT_CLEARANCE_IN + i * (palletFaceIn + PALLET_GAP_IN)
  const palletEnd = palletStart + palletFaceIn
  return {
    startIn: i === 0 ? 0 : palletStart - halfGap,
    endIn: i === n - 1 ? palletEnd + UPRIGHT_CLEARANCE_IN : palletEnd + halfGap,
  }
}

/** Which position indices (0-based, within ONE beam) a [loIn, hiIn) footprint
 *  along that same beam actually touches — not just "how wide is the
 *  intruder," the REAL slot(s) it overlaps, so a column that clips a slot's
 *  clearance margin without reaching its pallet counts (still ruins that
 *  slot), while one that sits entirely in the unusable slack past the last
 *  position's clearance costs nothing — there was never a sellable
 *  position there. */
export function blockedPositionIndices(beamIn, palletFaceIn, loIn, hiIn) {
  const n = positionsPerBeam(beamIn, palletFaceIn)
  const out = []
  for (let i = 0; i < n; i++) {
    const { startIn, endIn } = positionFootprintIn(beamIn, palletFaceIn, i)
    if (hiIn > startIn && loIn < endIn) out.push(i)
  }
  return out
}

/** BUG 67 — which bay indices, in a beam-rack's own `beams` array, can't
 *  hold even ONE pallet at this face width (`positionsPerBeam` returns 0 —
 *  the face plus its own clearance is wider than the beam itself, e.g. a
 *  90" face on a 96" beam needs 98"). Independent of columns entirely: this
 *  is a structural fact about the bay's own geometry, not a conflict with
 *  anything placed on the grid — a bay can be unusable with zero columns
 *  anywhere near it. Every such bay already correctly contributes 0 to
 *  `getRackCapacity`'s total (the SAME `positionsPerBeam` call, `=== 0`
 *  either way); this only tells a renderer WHICH bays to flag. */
export function oversizedBayIndices(beams, palletFaceIn) {
  return (beams || []).reduce((out, b, i) => {
    if (positionsPerBeam(b, palletFaceIn) === 0) out.push(i)
    return out
  }, [])
}

/**
 * Calculate pallet capacity for a single rack object.
 * Returns null for non-rack objects.
 */
export function getRackCapacity(obj, rules = DEFAULT_RULES) {
  if (!obj) return null
  const rPalletW = rules?.pallet?.wIn ?? 40
  const rBeam    = rules?.selective?.beamLengthsIn?.[0] ?? 96

  // ── Beam racks ────────────────────────────────────────────────────────────
  if (obj.type === 'rack_row') {
    const beams      = obj.beams || [rBeam]
    const palletWIn  = obj.palletWIn  || rPalletW
    const levels     = obj.levels     || 1
    const palletsPerBay = beams.map(b => positionsPerBeam(b, palletWIn))
    const groundTotal   = palletsPerBay.reduce((s, p) => s + p, 0)
    const total         = groundTotal * levels
    return {
      type:    'beam',
      bays:    beams.length,
      levels,
      groundTotal,
      total,
      label:   `${total} PAL (${groundTotal} × ${levels}L)`,
      detail:  palletsPerBay.map((p, i) => `Bay ${i+1}: ${p} pal`),
    }
  }

  if (obj.type === 'rack_double_row') {
    const beams      = obj.beams || [rBeam]
    const palletWIn  = obj.palletWIn  || rPalletW
    const levels     = obj.levels     || 1
    const palletsPerBay = beams.map(b => positionsPerBeam(b, palletWIn))
    const groundTotal   = palletsPerBay.reduce((s, p) => s + p, 0) * 2  // × 2 rows
    const total         = groundTotal * levels
    return {
      type:    'beam',
      bays:    beams.length,
      levels,
      groundTotal,
      total,
      label:   `${total} PAL (${groundTotal} × ${levels}L × 2 rows)`,
      detail:  palletsPerBay.map((p, i) => `Bay ${i+1}: ${p*2} pal`),
    }
  }

  // ── Lane racks ────────────────────────────────────────────────────────────
  if (['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(obj.type)) {
    const lanes      = obj.lanes      || 2
    const palletDeep = obj.palletDeep || 5
    const total      = lanes * palletDeep
    const modeMap = {
      rack_drive_in:      'LIFO',
      rack_drive_through: 'FIFO',
      rack_pushback:      'LIFO',
      rack_pallet_flow:   'FIFO',
    }
    return {
      type:   'lane',
      lanes,
      palletDeep,
      total,
      label:  `${total} PAL (${lanes}L × ${palletDeep}D)`,
      mode:   modeMap[obj.type],
    }
  }

  // ── Cantilever ────────────────────────────────────────────────────────────
  // Not pallet-based — skip
  return null
}

/**
 * Calculate total pallet capacity for all racks in a layout. Beam racks (single and double rows) are
 * counted through the bay ledger (utils/bayLedger.js): a bay more than half covered by another rack's bay
 * is counted once, so an overlap never counts twice. `ledger` lets a caller pass one it already has.
 * Returns { total, breakdown: { type → positions }, uncountedBays }.
 */
export function getLayoutCapacity(objects, rules = DEFAULT_RULES, ledger = null) {
  const L = ledger || bayLedger(objects)
  let total = 0
  const breakdown = {}
  const add = (key, n) => { total += n; breakdown[key] = (breakdown[key] || 0) + n }

  objects.forEach(obj => {
    const entry = L.racks.get(obj.id)
    if (entry) { add(obj.type, entry.positions); return }
    const cap = getRackCapacity(obj, rules)
    if (!cap) return
    add(obj.type, cap.total)
  })

  return { total, breakdown, uncountedBays: L.uncountedBays }
}