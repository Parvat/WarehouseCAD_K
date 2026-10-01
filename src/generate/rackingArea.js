// rackingArea.js — racking areas and zones (pure: objects in, objects out).
//
// A RACKING AREA is what a Fill racking box becomes: a persistent object
// (type 'racking_area') holding its box, its building (parentId), its Racking
// settings, the corner the fill was anchored at, and — per rack it placed —
// that rack's signature as placed (`placed`). Racks it placed carry its id
// (`areaId`). A rack whose signature no longer matches, one the area placed
// that is gone, and a rack added inside the area by hand are HAND EDITS.
//
//   - Resize (an edge dragged): racks of the area that end up outside the new
//     box are trimmed to the bays still wholly inside it (a row cut at the new
//     edge keeps its whole bays; a row wholly outside goes); the newly covered
//     part is filled with the area's settings by every Fill racking rule
//     (generate/fillRacking.js) — the area's own racks are obstacles there, so
//     they stay exactly as they are. A part that extends the area ACROSS its
//     rows lines its new rows up with the nearest existing row: the same
//     pieces, starts, uprights and bays (like Match bays), cut to what fits;
//     only what they can't reach is filled fresh.
//   - Rebuild (a settings change): the area's racks as placed are removed and
//     the whole box filled again with the new settings; hand-edited racks stay
//     where they are (the fill goes round them).
//
// A ZONE (`zone_*`: office, staging, washroom, custom area) is a rectangle
// no racking may enter: Fill racking treats it as a hole with wall edges, and
// racks under a zone that is placed, moved or resized over them are trimmed
// to their bays outside it (clearZone).

import { planFill, DEFAULT_FILL_SETTINGS, isZone } from './fillRacking'
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

const EPS = 1e-6
const r4 = (v) => Math.round(v * 1e4) / 1e4
/** A rack as placed — what a hand edit changes. */
export const rackSig = (o) => JSON.stringify([o.type, r4(o.x), r4(o.y), r4(o.width), r4(o.height), o.rotation || 0, o.beams || null, o.levels ?? null, o.uprightWidth ?? null, o.flueSpaceIn ?? null])
export const boxOf = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
/** The area's Racking settings (the Fill racking defaults under them). */
export const areaSettings = (area) => ({ ...DEFAULT_FILL_SETTINGS, ...(area?.settings || {}) })
const SETTING_KEYS = ['orientation', 'beamIn', 'palletWIn', 'palletDIn', 'mhe', 'aisleFt', 'maxRunFt', 'levels']
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

/** The racks and aisles of a fill of `box`, stamped with `areaId`. */
function fillPart(objects, box, settings, { gridSize, newId, areaId, from, runTemplate = null }) {
  if (!(box.w > EPS) || !(box.h > EPS)) return null
  const plan = planFill(objects, box, settings, { gridSize, newId, from, areaId, runTemplate })
  return plan.racks.length ? plan : null
}

/** The row of area `areaId` nearest `side` ('lo' | 'hi' across the rows), as a
 *  run template for planFill: its pieces' run starts (ft), bays, uprights and
 *  sections. Null when the area has no rows of its direction. */
function nearestRowTemplate(objects, areaId, vert, side, gridSize) {
  const rows = new Map()
  for (const o of objects) {
    if (!isRack(o) || o.areaId !== areaId || !Array.isArray(o.beams)) continue
    const f = rackFootprint(o)
    if (!!f.rotated !== vert) continue
    const s0 = (vert ? f.x : f.y) / gridSize
    const k = Math.round(s0 * 1000)
    if (!rows.has(k)) rows.set(k, [])
    rows.get(k).push({ r0: (vert ? f.y : f.x) / gridSize, beams: o.beams, upIn: o.uprightWidth ?? 3, genSection: o.genSection ?? null })
  }
  if (!rows.size) return null
  const keys = [...rows.keys()].sort((a, b) => a - b)
  return rows.get(side === 'lo' ? keys[0] : keys[keys.length - 1]).sort((a, b) => a.r0 - b.r0)
}
/** The corner of `box` a fill anchored at `anchor` ({ x: 'l'|'r', y: 't'|'b' }) starts from. */
const cornerOf = (box, anchor = { x: 'l', y: 't' }) => ({ x: anchor.x === 'r' ? box.x + box.w : box.x, y: anchor.y === 'b' ? box.y + box.h : box.y })

/** A new racking area from a Fill racking box: the area object and the fill.
 *  Null when the box places nothing. */
export function planAreaCreate(objects, box, settings, { gridSize = 40, newId = nanoid, from = null } = {}) {
  const id = newId()
  const plan = fillPart(objects, box, settings, { gridSize, newId, areaId: id, from })
  if (!plan) return null
  const anchor = from ? { x: from.x > box.x + box.w / 2 ? 'r' : 'l', y: from.y > box.y + box.h / 2 ? 'b' : 't' } : { x: 'l', y: 't' }
  const area = {
    id, type: AREA_TYPE, label: 'Racking area', x: box.x, y: box.y, width: box.w, height: box.h, rotation: 0,
    parentId: plan.fp.id, layerId: 'racking', settings: pickSettings(settings), anchor,
    placed: Object.fromEntries(plan.racks.map(r => [r.id, rackSig(r)])),
  }
  return { area, plan, objects: [...objects, area, ...plan.racks, ...plan.aisles] }
}

/** The parts of `nb` not in `ob` (up to four rectangles), each with the side
 *  of the old box it grows from. */
function newlyCovered(nb, ob) {
  const x0 = Math.max(nb.x, ob.x), x1 = Math.min(nb.x + nb.w, ob.x + ob.w)
  const y0 = Math.max(nb.y, ob.y), y1 = Math.min(nb.y + nb.h, ob.y + ob.h)
  if (x1 <= x0 + EPS || y1 <= y0 + EPS) return [{ ...nb, side: null }]
  const parts = [
    { x: nb.x, y: nb.y, w: nb.w, h: y0 - nb.y, side: 'above' },
    { x: nb.x, y: y1, w: nb.w, h: nb.y + nb.h - y1, side: 'below' },
    { x: nb.x, y: y0, w: x0 - nb.x, h: y1 - y0, side: 'left' },
    { x: x1, y: y0, w: nb.x + nb.w - x1, h: y1 - y0, side: 'right' },
  ]
  return parts.filter(p => p.w > EPS && p.h > EPS)
}

/** Resize area `areaId` to `box`: trim its racks to the new box (whole bays),
 *  fill what is newly covered. Returns the new objects. */
export function planAreaResize(objects, areaId, box, { gridSize = 40, newId = nanoid } = {}) {
  const area = objects.find(o => o.id === areaId)
  if (!area) return null
  const old = boxOf(area)
  const settings = areaSettings(area)
  // shrink: the area's racks keep only the bays wholly inside the new box
  const mine = objects.filter(o => isRack(o) && o.areaId === areaId).map(o => o.id)
  const t = trimBays(objects, mine, (b) => !inside(b, box), gridSize, newId)
  let next = carryPlaced(objects, t.objects, t.became)
  // extend: each newly covered part filled on its own, anchored on the side it grows from
  const ocx = old.x + old.w / 2, ocy = old.y + old.h / 2
  const added = []
  const vert = settings.orientation === 'vertical'
  for (const part of newlyCovered(box, old)) {
    const from = { x: Math.abs(part.x - ocx) <= Math.abs(part.x + part.w - ocx) ? part.x : part.x + part.w, y: Math.abs(part.y - ocy) <= Math.abs(part.y + part.h - ocy) ? part.y : part.y + part.h }
    // across the rows (above/below a horizontal area, left/right of a vertical one): line up with the nearest row
    const across = vert ? (part.side === 'left' || part.side === 'right') : (part.side === 'above' || part.side === 'below')
    const runTemplate = across ? nearestRowTemplate(next, areaId, vert, part.side === 'above' || part.side === 'left' ? 'lo' : 'hi', gridSize) : null
    const plan = fillPart(next, part, settings, { gridSize, newId, areaId, from, runTemplate })
    if (!plan) continue
    next = [...next, ...plan.racks, ...plan.aisles]
    added.push(...plan.racks)
  }
  next = next.map(o => (o.id !== areaId ? o : {
    ...o, x: box.x, y: box.y, width: box.w, height: box.h,
    placed: { ...(o.placed || {}), ...Object.fromEntries(added.map(r => [r.id, rackSig(r)])) },
  }))
  return rebuildAisles(next, newId).objects
}

/** Rebuild area `areaId` with `settings`: its racks as placed go, the whole
 *  box is filled again; hand-edited racks stay (the fill goes round them). */
export function planAreaRebuild(objects, areaId, settings, { gridSize = 40, newId = nanoid } = {}) {
  const area = objects.find(o => o.id === areaId)
  if (!area) return null
  const placed = area.placed || {}
  const clean = new Set(objects.filter(o => isRack(o) && o.areaId === areaId && placed[o.id] === rackSig(o)).map(o => o.id))
  const kept = objects.filter(o => !clean.has(o.id))
  const set = { ...areaSettings(area), ...pickSettings(settings) }
  const box = boxOf(area)
  const plan = fillPart(kept, box, set, { gridSize, newId, areaId, from: cornerOf(box, area.anchor) })
  const newRacks = plan ? plan.racks : []
  const keepPlaced = Object.fromEntries(Object.entries(placed).filter(([id]) => !clean.has(id)))
  const next = [...kept, ...(plan ? [...plan.racks, ...plan.aisles] : [])].map(o => (o.id !== areaId ? o : {
    ...o, settings: pickSettings(set), placed: { ...keepPlaced, ...Object.fromEntries(newRacks.map(r => [r.id, rackSig(r)])) },
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
