// capacity.js
// Pure functions for warehouse pallet capacity calculations.
//
// Fallbacks come from the resolved rules profile rather than literals: a rack
// that predates a field, or one drawn before a dealer set their standard, is
// counted against that dealer's pallet and beam rather than a hardcoded 48/96.
// Per-object values still win — they are what is actually drawn.
import { DEFAULT_RULES } from '../rules/defaults'

/**
 * Calculate pallet capacity for a single rack object.
 * Returns null for non-rack objects.
 */
export function getRackCapacity(obj, rules = DEFAULT_RULES) {
  if (!obj) return null
  const rPalletW = rules?.pallet?.wIn ?? 48
  const rBeam    = rules?.selective?.beamLengthsIn?.[0] ?? 96

  // ── Beam racks ────────────────────────────────────────────────────────────
  if (obj.type === 'rack_row') {
    const beams      = obj.beams || [rBeam]
    const palletWIn  = obj.palletWIn  || rPalletW
    const levels     = obj.levels     || 1
    const palletsPerBay = beams.map(b => Math.floor(b / palletWIn))
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
    const palletsPerBay = beams.map(b => Math.floor(b / palletWIn))
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
 * Calculate total pallet capacity for all racks in a layout.
 */
export function getLayoutCapacity(objects, rules = DEFAULT_RULES) {
  let total = 0
  const breakdown = {}

  objects.forEach(obj => {
    const cap = getRackCapacity(obj, rules)
    if (!cap) return
    total += cap.total
    const key = obj.type
    if (!breakdown[key]) breakdown[key] = 0
    breakdown[key] += cap.total
  })

  return { total, breakdown }
}