// shelving.js — (r7-shelving) steel boltless shelving (agreed with PP): its new fields, end handles in whole units and
// its BOM. The run's units, unit width and depth are utils/shelving.js and render/rackOps.js shelvingUnits (rack-round3 6),
// unchanged; units in a run share posts.
//
// THE NEW FIELDS: heightIn [84 = 7 ft] · backToBack [off] — when on, the object is two runs sharing the back: its depth is
// 2 × the unit depth, and only the two front faces get the pick check (generate/laneFaces.js).
//
// THE BOM (per run; U units, K shelves, R runs = 2 back-to-back, else 1 — every formula a question for PP):
//   Post         (U + 1) × 2 × R      by height
//   Long beam    U × K × 2 × R        by unit width
//   Short beam   (U + 1) × K × R      by depth
//   Deck         U × K × R            by width × depth
// A shelving run saved before keeps its size exactly: height 7 ft and back-to-back off — neither changes its box.
// Pure.
import { shelvingUnits } from '../render/rackOps'

export const SHELF_HEIGHT_IN = [72, 84, 96, 120]
export const SHELF_DEFAULTS = { units: 4, unitWidthIn: 48, depthIn: 24, shelves: 5, heightIn: 84 }

const r2 = (v) => Math.round(v * 100) / 100
/** Its spec: { units, unitIn, depthIn (one run's), shelves, heightIn, backToBack, runs }. */
export function shelfSpec(o, gridSize = 40) {
  const { n, unitIn, depthIn } = shelvingUnits(o, gridSize)
  const backToBack = !!o?.backToBack
  return { units: n, unitIn, depthIn: backToBack ? r2(depthIn / 2) : depthIn, shelves: Math.max(1, Math.round(o?.shelves || 5)), heightIn: o?.heightIn > 0 ? o.heightIn : SHELF_DEFAULTS.heightIn, backToBack, runs: backToBack ? 2 : 1 }
}

/** A new shelving run (the library's placement): 4 units of 48 × 24, 5 shelves, 7 ft. */
export function shelfNew(gridSize = 40) {
  const d = SHELF_DEFAULTS
  return { unitWidthIn: d.unitWidthIn, shelfDepth: d.depthIn, shelves: d.shelves, heightIn: d.heightIn, backToBack: false, width: (d.units * d.unitWidthIn / 12) * gridSize, height: (d.depthIn / 12) * gridSize }
}

/** Back-to-back on / off: the depth doubles / halves (one run's depth kept), its left-top corner held. */
export function backToBackChange(o, on, gridSize = 40) {
  const s = shelfSpec(o, gridSize)
  if (!!on === s.backToBack) return {}
  return { backToBack: !!on, height: ((on ? 2 : 1) * s.depthIn / 12) * gridSize }
}

/** A drag on a resize handle: the end sides add or remove whole units, the opposite end held → the patch; the depth sides
 *  are left to the plain resize (null). */
export function shelfResize(o, handle, dx, dy, gridSize = 40) {
  if (!(handle.includes('l') || handle.includes('r')) || handle[0] === 't' || handle[0] === 'b') return null
  const { n, uw, unitIn } = shelvingUnits(o, gridSize)
  const k = Math.max(1, n + Math.round((handle.includes('r') ? dx : -dx) / uw))
  if (k === n) return { width: o.width, height: o.height, x: o.x, y: o.y }
  const width = k * uw
  return { unitWidthIn: o.unitWidthIn > 0 ? o.unitWidthIn : unitIn, width, height: o.height, x: handle.includes('l') ? o.x + o.width - width : o.x, y: o.y }
}

const ftIn = (v) => { const t = Math.round(v), f = Math.floor(t / 12), i = t - f * 12; return f ? (i ? `${f} ft ${i} in` : `${f} ft`) : `${i} in` }
const inch = (v) => `${r2(v)} in`
/** One run's parts (the formulas above). */
export function shelfParts(o, gridSize = 40) {
  const s = shelfSpec(o, gridSize), U = s.units, K = s.shelves, R = s.runs
  return [
    { part: 'Post', size: ftIn(s.heightIn), qty: (U + 1) * 2 * R },
    { part: 'Long beam', size: inch(s.unitIn), qty: U * K * 2 * R },
    { part: 'Short beam', size: inch(s.depthIn), qty: (U + 1) * K * R },
    { part: 'Deck', size: `${r2(s.unitIn)} × ${r2(s.depthIn)} in`, qty: U * K * R },
  ]
}
