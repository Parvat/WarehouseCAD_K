// regenerate.js — Regenerate racking on a finished layout (REGENERATE_PLAN.md). Pure: objects in, objects out.
//
// Keeps the building (shape, walls, columns), zones, text, dimensions, layers, the elevation types and every rack
// placed by hand; replaces only the racks Generate or Fill racking made — one Fill racking over the building's inner
// box with Generate's settings, the hand-placed racks and the zones in its way as obstacles (fillRacking.js treats
// every rack already there, and every zone, as something to keep clear of).
//
// A rack is GENERATED when Generate stamped it (rowIndex + genSection) or a racking area owns it (areaId); anything
// else is hand-placed. What a regenerate loses is counted before it runs:
//   - rows: the generated rows replaced — a row across the building (rowIndex), however many sections it runs through;
//   - hand edits: the generated racks changed since they were placed, and the ones removed — read off each area's
//     own record (rackingArea.js areaEdits: changed + removed) and, for Generate's racks, the record Generate writes
//     on the building (`genPlaced`: rack id → its signature as placed). A layout generated before that record has no
//     way to tell: `editsKnown` false.

import { nanoid } from 'nanoid'
import { planAreaCreate, areaEdits, rackSig, sigMatch, isArea } from './rackingArea'
import { innerOutline } from './fillRacking'
import { rebuildAisles } from '../utils/aisleRebuild'

const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
const isFp = (o) => typeof o?.type === 'string' && o.type.startsWith('fp_')
export const isGeneratedRack = (o) => isRack(o) && (o.areaId != null || (o.rowIndex != null && o.genSection != null))

/** The building a regenerate works on: the one Generate drew, else the one with the most racks, else the first. */
export function regenBuilding(objects) {
  const fps = objects.filter(isFp)
  if (!fps.length) return null
  const gen = fps.find(o => o.generated)
  if (gen) return gen
  const n = (fp) => objects.filter(o => isRack(o) && o.parentId === fp.id).length
  return [...fps].sort((a, b) => n(b) - n(a))[0]
}

/** What a regenerate of building `fp` would replace and lose → { racks (ids), rows, handEdits, editsKnown, handPlaced,
 *  zones, areas (ids) }. */
export function regenSummary(objects, fp) {
  if (!fp) return null
  const inB = (o) => o.parentId === fp.id
  const gen = objects.filter(o => isGeneratedRack(o) && inB(o))
  const areas = objects.filter(o => isArea(o) && inB(o))
  const rows = new Set(gen.map(o => `${o.areaId ?? ''}|${o.rowIndex ?? o.id}`)).size
  let handEdits = 0, editsKnown = true
  for (const a of areas) { const e = areaEdits(objects, a); handEdits += e.changed.length + e.removed.length }
  const stamped = gen.filter(o => o.areaId == null)
  if (stamped.length) {
    const rec = fp.genPlaced
    if (!rec) editsKnown = false
    else {
      const ids = new Set(objects.map(o => o.id))
      handEdits += stamped.filter(o => !(o.id in rec) || !sigMatch(rec[o.id], o)).length
      handEdits += Object.keys(rec).filter(id => !ids.has(id)).length
    }
  }
  return {
    racks: gen.map(o => o.id), rows, handEdits, editsKnown,
    handPlaced: objects.filter(o => isRack(o) && inB(o) && !isGeneratedRack(o)).length,
    zones: objects.filter(o => typeof o.type === 'string' && o.type.startsWith('zone_') && inB(o)).length,
    areas: areas.map(o => o.id),
  }
}

/** The building's inner box (px): its inner outline's extent. */
export function innerBox(fp, gridSize = 40) {
  const p = innerOutline(fp, gridSize), X = p.map(q => q.x), Y = p.map(q => q.y)
  const x = Math.min(...X), y = Math.min(...Y)
  return { x, y, w: Math.max(...X) - x, h: Math.max(...Y) - y }
}

/** Regenerate building `fp` with Fill racking `settings` (orientation 'auto': both tried, the one with more positions
 *  kept) → { objects, area, orientation, summary } or null when nothing fits. The generated racks, their aisles and the
 *  building's racking areas go; one new area over the building holds the new racks (its record counts the next
 *  regenerate's hand edits). Everything else is untouched. */
export function planRegenerate(objects, fp, settings, { gridSize = 40, newId = nanoid, elevations = null } = {}) {
  if (!fp) return null
  const summary = regenSummary(objects, fp)
  const gone = new Set([...summary.racks, ...summary.areas])
  const kept = objects.filter(o => !gone.has(o.id) && !(o.type === 'aisle' && (gone.has(o.row1Id) || gone.has(o.row2Id))))
  const box = innerBox(fp, gridSize), from = { x: box.x, y: box.y }
  const tries = settings.orientation === 'auto' ? ['horizontal', 'vertical'] : [settings.orientation || 'horizontal']
  let best = null
  for (const orientation of tries) {
    const made = planAreaCreate(kept, box, { ...settings, orientation }, { gridSize, newId, from, elevations })
    if (made && (!best || made.plan.positions > best.made.plan.positions)) best = { made, orientation }
  }
  if (!best) return null
  // the building's record of what Generate placed belongs to the racks just replaced
  const next = best.made.objects.map(o => (o.id === fp.id && o.genPlaced ? (({ genPlaced, ...rest }) => rest)(o) : o))
  return { objects: rebuildAisles(next, newId).objects, area: best.made.area, orientation: best.orientation, summary }
}

/** The record Generate writes on its building: each rack it placed → its signature as placed. */
export const genPlacedOf = (racks) => Object.fromEntries(racks.filter(isRack).map(r => [r.id, rackSig(r)]))
