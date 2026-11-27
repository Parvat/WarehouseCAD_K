// shelving.js — (rack-round3 6) a shelving unit's words: its size label "S1 · 4 units · 48×24 · 5 shelves" (the selection's
// label on the plan, its card's head, the PDF) and its sizes. Units: render/rackOps.js shelvingUnits — a standard unit is
// 36, 42 or 48 in wide (SHELF_UNIT_IN) and 12, 18 or 24 in deep (SHELF_DEPTH_IN), 48 × 24 by default; any size can be
// typed (Custom). A unit saved before keeps its size exactly (shown as Custom when it is not a standard one). Pure.
import { shelvingUnits, SHELF_UNIT_IN, SHELF_DEPTH_IN } from '../render/rackOps'
import { rackNumbersNow } from './rackLines'
import { lineNamer } from './lineNames'
import { overlapMarks } from '../render/overlapOps'   // (lane-fixes 5)
import { faceLostMarks } from '../generate/coverLost'
import { walkwayInNow } from './zoneCheck'

export { SHELF_UNIT_IN, SHELF_DEPTH_IN }
const num = (v) => String(Math.round(v * 100) / 100)
/** Is `v` (inches) one of the standard sizes `list`? */
export const isStandard = (v, list) => list.some(s => Math.abs(s - v) < 0.01)
/** The shelf count (default 5). */
export const shelvesOf = (o) => Math.max(1, Math.round(o?.shelves || 5))
/** Its number as the plan draws it (S1 …), or ''. */
export function shelvingTag(objects, o, gridSize = 40, elevations = null) {
  if (!o || !Array.isArray(objects)) return ''
  const l = rackNumbersNow(objects, gridSize).find(x => x.ids.includes(o.id))
  if (!l) return ''
  try { return lineNamer(objects, elevations, gridSize)(l.no) || l.tag || '' } catch { return l.tag || '' }
}
/** "S1 · 4 units · 48×24 · 5 shelves" (without a number: from "4 units"). */
export function shelvingLabel(o, gridSize = 40, tag = '') {
  const { n, unitIn, depthIn } = shelvingUnits(o, gridSize), k = shelvesOf(o)
  return [tag || null, `${n} unit${n === 1 ? '' : 's'}`, `${num(unitIn)}×${num(depthIn)}`, `${k} shel${k === 1 ? 'f' : 'ves'}`].filter(Boolean).join(' · ')
}
/** The change that makes its units `unitIn` wide (inches), the unit count kept — its left-top corner held. */
export function unitWidthChange(o, unitIn, gridSize = 40) {
  const { n } = shelvingUnits(o, gridSize)
  return { unitWidthIn: unitIn, width: n * (unitIn / 12) * gridSize }
}
/** The change that gives it `n` units, their width kept. */
export function unitCountChange(o, n, gridSize = 40) {
  const { uw, unitIn } = shelvingUnits(o, gridSize)
  return { unitWidthIn: o.unitWidthIn > 0 ? o.unitWidthIn : unitIn, width: Math.max(1, Math.round(n)) * uw }
}
/** The change that makes it `depthIn` deep (inches). */
export const depthChange = (depthIn, gridSize = 40) => ({ height: (depthIn / 12) * gridSize, shelfDepth: depthIn })

/** (lane-fixes 5) Its usable units: a shelving run holds no pallet positions, so each unit with a red X comes off its units —
 *  covered by a zone or another rack (render/overlapOps.js overlapMarks), or lost to a short pick face (generate/coverLost.js
 *  faceLostMarks, with the plan's truck `profile`): the same marks the plan and the PDF draw. → { units, lost, usable }. */
export function shelvingUsable(objects, o, gridSize = 40, profile = null) {
  const { n } = shelvingUnits(o, gridSize)
  if (!o || !Array.isArray(objects)) return { units: n, lost: 0, usable: n }
  const seen = new Set()
  const key = (m) => `${Math.round(m.x * 100)},${Math.round(m.y * 100)}`
  for (const m of overlapMarks(objects, gridSize)) if (m.rackId === o.id) seen.add(key(m))
  if (profile) { let w = 44; try { w = walkwayInNow() } catch { /* the default */ } for (const m of faceLostMarks(objects, { gridSize, profile, walkwayIn: w })) if (m.rackId === o.id) seen.add(key(m)) }
  const lost = Math.min(n, seen.size)
  return { units: n, lost, usable: n - lost }
}
