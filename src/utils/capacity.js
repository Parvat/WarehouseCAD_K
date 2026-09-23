// capacity.js
// Pure functions for warehouse pallet capacity calculations.
//
// Fallbacks come from the resolved rules profile rather than literals: a rack
// that predates a field, or one drawn before a dealer set their standard, is
// counted against that dealer's pallet and beam rather than a hardcoded 48/96.
// Per-object values still win — they are what is actually drawn.
import { DEFAULT_RULES } from '../rules/defaults'

/* Industry-standard selective-rack convention (verified): a pallet's LOADING
 * FACE — its narrower dimension, GMA default 40" — runs ACROSS the beam; the
 * deeper dimension (default 48") runs INTO the frame, overhanging it by
 * design (~3" each side on a 42" frame — not a fit problem, standard
 * practice). `palletWIn` on a rack object is always this loading-face width,
 * never the depth; there is no facing/orientation choice to make, this is
 * the one standard. 8" = 4"+4" clearance between adjacent pallets on the
 * same beam — the SAME number whether you're counting how many fit or
 * figuring out which one a column just blocked, so both live here. */
export const PALLET_CLEARANCE_IN = 8

/** How many pallet positions fit across one beam, GMA-standard spacing. */
export function positionsPerBeam(beamIn, palletFaceIn) {
  if (!(beamIn > 0) || !(palletFaceIn > 0)) return 0
  return Math.floor(beamIn / (palletFaceIn + PALLET_CLEARANCE_IN))
}

/** Position `i`'s own [startIn, endIn) footprint along the beam — LOCAL to
 *  the beam's own start (0 = the near upright's far edge) — including its
 *  share of the clearance on both sides, so this is the SAME width the
 *  counting divisor above already uses; a renderer or an overlap test never
 *  has to re-derive a different number for "how wide is one position." */
export function positionFootprintIn(palletFaceIn, i) {
  const slotIn = palletFaceIn + PALLET_CLEARANCE_IN
  return { startIn: i * slotIn, endIn: (i + 1) * slotIn }
}

/** Which position indices (0-based, within ONE beam) a [loIn, hiIn) footprint
 *  along that same beam actually touches — not just "how wide is the
 *  intruder," the REAL slot(s) it overlaps, so a column that clips a slot's
 *  clearance margin without reaching its pallet counts (still ruins that
 *  slot), while one that sits entirely in the unusable slack past the last
 *  full position (a beam's length is rarely an exact multiple of the slot
 *  width) costs nothing — there was never a sellable position there. */
export function blockedPositionIndices(beamIn, palletFaceIn, loIn, hiIn) {
  const n = positionsPerBeam(beamIn, palletFaceIn)
  const out = []
  for (let i = 0; i < n; i++) {
    const { startIn, endIn } = positionFootprintIn(palletFaceIn, i)
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