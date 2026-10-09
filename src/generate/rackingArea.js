// rackingArea.js — racking areas and zones (pure: objects in, objects out).
//
// A RACKING AREA is what a Fill racking box becomes: a persistent object
// (type 'racking_area') holding its box, its building (parentId), its Racking
// settings, the corner the fill was anchored at, its PATTERN (fillRacking.js
// areaPattern: the rows across, the bays and cross-aisles along them, computed
// once and reaching past the building both ways) and — per rack it placed —
// that rack's signature as placed (`placed`). Racks it placed carry its id
// (`areaId`). A rack whose signature no longer matches, one the area placed
// that is gone, and a rack added inside the area by hand are HAND EDITS.
//
// The box is a WINDOW on the pattern: the racks shown are the pattern clipped
// to the box (whole bays, rows wholly inside; a pair the edge cuts to one half
// shows that half as a single row; never an extra edge row), and to walls,
// zones and racks that aren't the area's own.
//   - Resize (an edge dragged): the box shows the pattern through its new
//     edges — a shrink drops what is now outside, an extend carries the same
//     rows, pairs and bays on, and shrinking then extending back gives exactly
//     the racks it had. Racks the change doesn't touch stay the same objects.
//   - Rebuild (a settings change): a new pattern from the new settings,
//     anchored where the old one was, shown through the box.
// Either way hand-edited racks stay as they are (a resize trims them to their
// whole bays inside the box), the pattern goes round them, and a rack removed
// by hand stays removed.
//
// A ZONE (`zone_*`: office, staging, washroom, custom area) is a rectangle
// no racking may enter: Fill racking treats it as a hole with wall edges, and
// racks under a zone that is placed, moved or resized over them are trimmed
// to their bays outside it (clearZone).

import { planFill, areaPattern, patternFill, innerOutline, snapToWalls, DEFAULT_FILL_SETTINGS, isZone } from './fillRacking'
import { rackFootprint } from './columnCheck'
import { splitRackForBayDelete } from '../utils/baySplit'
import { rebuildAisles } from '../utils/aisleRebuild'
import { uprightXs } from '../render/rackOps'
import { nanoid } from 'nanoid'

export const AREA_TYPE = 'racking_area'
export const isArea = (o) => o?.type === AREA_TYPE
export { isZone }
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')

/** The zone kinds the left panel places (size in feet, colour for the tint). */
export const ZONE_KINDS = [
  { type: 'zone_office',   label: 'Office',      w: 40, h: 30, color: '#7c3aed' },
  { type: 'zone_staging',  label: 'Staging',     w: 40, h: 40, color: '#d97706' },
  { type: 'zone_washroom', label: 'Washroom',    w: 20, h: 15, color: '#0284c7' },
  { type: 'zone_custom',   label: 'Custom area', w: 30, h: 30, color: '#64748b' },
]

const r4 = (v) => Math.round(v * 1e4) / 1e4
/** A rack as placed — what a hand edit changes. */
export const rackSig = (o) => JSON.stringify([o.type, r4(o.x), r4(o.y), r4(o.width), r4(o.height), o.rotation || 0, o.beams || null, o.levels ?? null, o.uprightWidth ?? null, o.flueSpaceIn ?? null])
export const boxOf = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
/** The area's Racking settings (the Fill racking defaults under them). */
export const areaSettings = (area) => {
  const set = { ...DEFAULT_FILL_SETTINGS, ...(area?.settings || {}) }
  // an area made before the wall clearance (BUG 76) sat flush on its walls: it stays there
  if (area?.settings && !Number.isFinite(area.settings.wallClearIn)) set.wallClearIn = 0
  return set
}
const SETTING_KEYS = ['orientation', 'beamIn', 'palletWIn', 'palletDIn', 'mhe', 'aisleFt', 'maxRunFt', 'levels', 'wallClearIn']
const pickSettings = (s) => Object.fromEntries(SETTING_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]]))

/** Each bay's world box (axis-aligned bounds, any rotation). */
export function bayBoxes(obj, gridSize = 40) {
  const { xs, upW } = uprightXs(obj, gridSize)
  const t = ((obj.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const out = []
  for (let i = 0; i + 1 < xs.length; i++) {
    const pts = [[xs[i], obj.y], [xs[i + 1] + upW, obj.y], [xs[i + 1] + upW, obj.y + obj.height], [xs[i], obj.y + obj.height]]
      .map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
    const X = pts.map(p => p[0]), Y = pts.map(p => p[1])
    out.push({ x: Math.min(...X), y: Math.min(...Y), w: Math.max(...X) - Math.min(...X), h: Math.max(...Y) - Math.min(...Y) })
  }
  return out
}
const inside = (b, box, e = 1e-3) => b.x >= box.x - e && b.y >= box.y - e && b.x + b.w <= box.x + box.w + e && b.y + b.h <= box.y + box.h + e
const overlaps = (a, b, e = 1e-3) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > e && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > e

/** Trim racks `ids` to the bays `bad` doesn't reject (bay-split pieces keep
 *  their exact positions; a rack with no bay left goes). Returns the new
 *  objects and, per touched rack, the ids it became ([] = removed). */
export function trimBays(objects, ids, bad, gridSize = 40, newId = nanoid) {
  const want = new Set(ids), became = new Map(), out = []
  for (const o of objects) {
    if (!want.has(o.id) || !isRack(o)) { out.push(o); continue }
    const boxes = bayBoxes(o, gridSize)
    const removed = boxes.map((b, i) => (bad(b) ? i : -1)).filter(i => i >= 0)
    if (!removed.length) { out.push(o); continue }
    const pieces = removed.length === boxes.length ? null : splitRackForBayDelete(o, new Set(removed), newId, gridSize)
    if (!pieces) { became.set(o.id, []); continue }
    became.set(o.id, pieces.map(p => p.id))
    out.push(...pieces)
  }
  return { objects: out, became }
}

/** Keep every area's `placed` record true after racks were trimmed by the app
 *  (not by hand): a rack that matched its record keeps matching (its pieces
 *  are recorded as placed); a removed rack leaves the record. */
function carryPlaced(before, after, became) {
  if (!became.size) return after
  const B = new Map(before.map(o => [o.id, o])), A = new Map(after.map(o => [o.id, o]))
  return after.map(o => {
    if (!isArea(o) || !o.placed) return o
    const placed = { ...o.placed }
    let touched = false
    for (const [id, ids] of became) {
      if (!(id in placed)) continue
      const wasClean = placed[id] === rackSig(B.get(id))
      delete placed[id]; touched = true
      if (wasClean) for (const p of ids) if (A.has(p)) placed[p] = rackSig(A.get(p))
    }
    return touched ? { ...o, placed } : o
  })
}

/** Hand edits in `area`: racks changed since placed, placed racks gone, and
 *  racks added inside the area by hand. */
export function areaEdits(objects, area) {
  const placed = area?.placed || {}
  const mine = objects.filter(o => isRack(o) && o.areaId === area.id)
  const changed = mine.filter(o => !(o.id in placed) || placed[o.id] !== rackSig(o))
  const ids = new Set(objects.map(o => o.id))
  const removed = Object.keys(placed).filter(id => !ids.has(id))
  const b = boxOf(area)
  const added = objects.filter(o => isRack(o) && o.areaId !== area.id && o.parentId === area.parentId && o.width > 0 && inside({ x: o.x, y: o.y, w: o.width, h: o.height }, b, 0.5))
  return { count: changed.length + removed.length + added.length, changed: changed.map(o => o.id), removed, added: added.map(o => o.id) }
}

/** The corner of `box` a fill anchored at `anchor` ({ x: 'l'|'r', y: 't'|'b' }) starts from. */
const cornerOf = (box, anchor = { x: 'l', y: 't' }) => ({ x: anchor.x === 'r' ? box.x + box.w : box.x, y: anchor.y === 'b' ? box.y + box.h : box.y })

/** Where the racks removed from `area` by hand stood (world px boxes): the
 *  pattern leaves them empty. */
function removedBoxes(objects, area) {
  const ids = new Set(objects.map(o => o.id))
  return Object.entries(area.placed || {}).filter(([id]) => !ids.has(id)).map(([, sig]) => {
    try {
      const [type, x, y, width, height, rotation] = JSON.parse(sig)
      const f = rackFootprint({ type, x, y, width, height, rotation })
      return { x: f.x, y: f.y, w: f.w, h: f.h }
    } catch { return null }
  }).filter(Boolean)
}

/** The area's racks as placed (signature unchanged) — the ones its pattern owns. */
const cleanRacks = (objects, area) => {
  const placed = area.placed || {}
  return objects.filter(o => isRack(o) && o.areaId === area.id && placed[o.id] === rackSig(o))
}

/** Show `area`'s pattern through `box` in `objects` (its clean racks already
 *  taken out): the racks, reusing `clean` ones that come out exactly the same
 *  (id and all), so a rack the change doesn't touch stays the very same rack.
 *  `removed`: where racks removed by hand stood (left empty). */
function showPattern(objects, box, pattern, area, clean, removed, { gridSize, newId }) {
  const plan = patternFill(objects, box, pattern, { gridSize, newId, areaId: area.id, blocked: removed })
  const bySig = new Map()
  for (const r of clean) { const k = rackSig(r); if (!bySig.has(k)) bySig.set(k, []); bySig.get(k).push(r) }
  return plan.racks.map(r => { const same = bySig.get(rackSig(r)); return same && same.length ? same.shift() : r })
}

/** A new racking area from a Fill racking box: the area object and the fill
 *  (its pattern clipped to the box). Null when the box places nothing. */
export function planAreaCreate(objects, box, settings, { gridSize = 40, newId = nanoid, from = null } = {}) {
  const id = newId()
  const plan = planFill(objects, box, settings, { gridSize, newId, from, areaId: id })
  if (!plan.racks.length) return null
  const anchor = from ? { x: from.x > box.x + box.w / 2 ? 'r' : 'l', y: from.y > box.y + box.h / 2 ? 'b' : 't' } : { x: 'l', y: 't' }
  // the area's box stays inside the building: clipped to its inner walls' extent, and an edge across
  // the rows within a rack's depth of a wall put on it (it counts as on the wall)
  box = snapToWalls(box, plan.fp, gridSize, plan.pattern.depthIn / 12, plan.pattern.vert, plan.pattern.wallClearIn ?? 0)
  const inner = innerOutline(plan.fp, gridSize), ix0 = Math.max(box.x, Math.min(...inner.map(p => p.x))), iy0 = Math.max(box.y, Math.min(...inner.map(p => p.y)))
  const ix1 = Math.min(box.x + box.w, Math.max(...inner.map(p => p.x))), iy1 = Math.min(box.y + box.h, Math.max(...inner.map(p => p.y)))
  const area = {
    id, type: AREA_TYPE, label: 'Racking area', x: ix0, y: iy0, width: ix1 - ix0, height: iy1 - iy0, rotation: 0,
    parentId: plan.fp.id, layerId: 'racking', // the wall clearance it was filled with, always written: an area without one was made before it (flush)
    settings: pickSettings({ ...settings, wallClearIn: plan.pattern.wallClearIn }), anchor, pattern: plan.pattern,
    placed: Object.fromEntries(plan.racks.map(r => [r.id, rackSig(r)])),
  }
  return { area, plan, objects: [...objects, area, ...plan.racks, ...plan.aisles] }
}

/** Resize area `areaId` to `box`: the box is a window on the area's pattern,
 *  so it shows exactly the pattern's racks inside it — a shrink drops what is
 *  now outside, an extend carries the same rows, pairs and bays on, and
 *  shrinking then extending back gives the racks it had. Hand-edited racks
 *  stay as they are (trimmed to their whole bays inside the box); the pattern
 *  goes round them, and leaves empty where a rack was removed by hand.
 *  Returns the new objects. */
export function planAreaResize(objects, areaId, box, { gridSize = 40, newId = nanoid } = {}) {
  const area = objects.find(o => o.id === areaId)
  if (!area) return null
  const clean = cleanRacks(objects, area), cleanIds = new Set(clean.map(o => o.id))
  // hand-edited racks keep only their bays wholly inside the new box
  const dirty = objects.filter(o => isRack(o) && o.areaId === areaId && !cleanIds.has(o.id)).map(o => o.id)
  const t = trimBays(objects, dirty, (b) => !inside(b, box), gridSize, newId)
  const kept = carryPlaced(objects, t.objects, t.became).filter(o => !cleanIds.has(o.id))
  const now = kept.find(o => o.id === areaId)
  // an area from before patterns: its pattern from the box it had, as it was anchored
  const pattern = now.pattern || areaPattern(kept, boxOf(now), areaSettings(now), { gridSize, from: cornerOf(boxOf(now), now.anchor), areaId })?.pattern
  const racks = pattern ? showPattern(kept, box, pattern, now, clean, removedBoxes(objects, area), { gridSize, newId }) : []
  const keepPlaced = Object.fromEntries(Object.entries(now.placed || {}).filter(([id]) => !cleanIds.has(id)))
  const next = [...kept, ...racks].map(o => (o.id !== areaId ? o : {
    ...o, x: box.x, y: box.y, width: box.w, height: box.h, ...(pattern ? { pattern } : {}),
    placed: { ...keepPlaced, ...Object.fromEntries(racks.map(r => [r.id, rackSig(r)])) },
  }))
  return rebuildAisles(next, newId).objects
}

/** Rebuild area `areaId` with `settings`: a new pattern from them (anchored
 *  where the area's was), shown through the box; hand-edited racks stay
 *  where they are (the pattern goes round them). */
export function planAreaRebuild(objects, areaId, settings, { gridSize = 40, newId = nanoid } = {}) {
  const area = objects.find(o => o.id === areaId)
  if (!area) return null
  const clean = cleanRacks(objects, area), cleanIds = new Set(clean.map(o => o.id))
  const kept = objects.filter(o => !cleanIds.has(o.id))
  const set = { ...areaSettings(area), ...pickSettings(settings) }
  const box = boxOf(area)
  const pattern = areaPattern(kept, box, set, { gridSize, from: cornerOf(box, area.anchor), areaId })?.pattern || null
  const racks = pattern ? showPattern(kept, box, pattern, area, clean, removedBoxes(objects, area), { gridSize, newId }) : []
  const keepPlaced = Object.fromEntries(Object.entries(area.placed || {}).filter(([id]) => !cleanIds.has(id)))
  const next = [...kept, ...racks].map(o => (o.id !== areaId ? o : {
    ...o, settings: pickSettings(set), pattern, placed: { ...keepPlaced, ...Object.fromEntries(racks.map(r => [r.id, rackSig(r)])) },
  }))
  return rebuildAisles(next, newId).objects
}

/** The racks with a bay under `zone`. */
export function racksUnderZone(objects, zone, gridSize = 40) {
  const z = boxOf(zone)
  return objects.filter(o => isRack(o) && o.width > 0 && bayBoxes(o, gridSize).some(b => overlaps(b, z))).map(o => o.id)
}

/** Clear the racks under `zone`: each keeps only its bays outside it (a row
 *  crossing the zone becomes pieces either side; a rack wholly under it goes).
 *  Returns { objects, count } (count = racks touched). */
export function clearZone(objects, zone, { gridSize = 40, newId = nanoid } = {}) {
  const z = boxOf(zone)
  const ids = racksUnderZone(objects, zone, gridSize)
  if (!ids.length) return { objects, count: 0 }
  const t = trimBays(objects, ids, (b) => overlaps(b, z), gridSize, newId)
  const next = carryPlaced(objects, t.objects, t.became)
  return { objects: rebuildAisles(next, newId).objects, count: ids.length }
}
