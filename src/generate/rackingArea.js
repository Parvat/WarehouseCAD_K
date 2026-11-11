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
// racks under a zone that is placed, moved or resized over them lose only the
// bays its footprint covers — and get them back when it leaves (utils/zoneCut.js).

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
/** Does `o` still match its placed record `stored` (rackSig)? Its levels aside: they come from its elevation type
 *  (utils/elevations.js), and a type change — edited or assigned — is not a hand edit. Records saved before compare
 *  the same way. */
export function sigMatch(stored, o) {
  if (stored == null || !o) return false
  const now = rackSig(o)
  if (stored === now) return true
  try { const a = JSON.parse(stored); a[7] = o.levels ?? null; return JSON.stringify(a) === now } catch { return false }
}
/** rackSig without the levels: the key a refit reuses a clean rack by (it keeps its id and its elevation type). */
const shapeKey = (o) => { const a = JSON.parse(rackSig(o)); a[7] = null; return JSON.stringify(a) }
export const rackSig = (o) => JSON.stringify([o.type, r4(o.x), r4(o.y), r4(o.width), r4(o.height), o.rotation || 0, o.beams || null, o.levels ?? null, o.uprightWidth ?? null, o.flueSpaceIn ?? null])
export const boxOf = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
/** The area's Racking settings (the Fill racking defaults under them). */
export const areaSettings = (area) => {
  const set = { ...DEFAULT_FILL_SETTINGS, ...(area?.settings || {}) }
  // an area made before the wall clearance (BUG 76) sat flush on its walls: it stays there
  if (area?.settings && !Number.isFinite(area.settings.wallClearIn)) set.wallClearIn = 0
  return set
}
/** The equipment a fill or Generate was made for, to store on its area: a Custom design's widths ({ custom }), else a
 *  reference to the project's forklift ({ project: true } — Generate's always: it lays out on the project forklift). */
const equipOf = (s) => (s?.equip && (s.equip.custom || s.equip.key || s.equip.project) ? s.equip : { project: true })
const SETTING_KEYS = ['orientation', 'beamIn', 'palletWIn', 'palletDIn', 'mhe', 'aisleFt', 'maxRunFt', 'levels', 'wallClearIn', 'crossAisle']
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
      const wasClean = sigMatch(placed[id], B.get(id))
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
  const changed = mine.filter(o => !(o.id in placed) || !sigMatch(placed[o.id], o))
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
  return objects.filter(o => isRack(o) && o.areaId === area.id && sigMatch(placed[o.id], o))
}

/** Show `area`'s pattern through `box` in `objects` (its clean racks already
 *  taken out): the racks, reusing `clean` ones that come out exactly the same
 *  (id and all), so a rack the change doesn't touch stays the very same rack.
 *  `removed`: where racks removed by hand stood (left empty). */
function showPattern(objects, box, pattern, area, clean, removed, { gridSize, newId, snapEnds = false, rackGap = null, sections = [] }) {
  const plan = patternFill(objects, box, pattern, { gridSize, newId, areaId: area.id, blocked: removed, snapEnds, rackGap, sections })
  const bySig = new Map()
  for (const r of clean) { const k = shapeKey(r); if (!bySig.has(k)) bySig.set(k, []); bySig.get(k).push(r) }
  const used = new Set()
  const out = plan.racks.map(r => { const same = bySig.get(shapeKey(r)); if (same && same.length) { const o = same.shift(); used.add(o.id); return o } return r })
  /* a row re-split (cross-aisle round): a new rack standing where one of the area's racks of the same row stood (same
     type, the same place across, overlapping along) is that rack carried on — its id, its elevation */
  const foot = (o) => rackFootprint(o)
  const across = (f) => (pattern.vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h]), along = (f) => (pattern.vert ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
  return out.map(r => {
    if (clean.includes(r)) return r
    const fr = foot(r), [c0, c1] = across(fr), [r0, r1] = along(fr)
    const old = clean.find(o => !used.has(o.id) && o.type === r.type && (() => { const f = foot(o), [d0, d1] = across(f), [q0, q1] = along(f); return Math.abs(d0 - c0) < 1e-6 && Math.abs(d1 - c1) < 1e-6 && Math.min(q1, r1) - Math.max(q0, r0) > 1e-6 })())
    if (!old) return r
    used.add(old.id)
    return { ...r, id: old.id, ...(old.elevType !== undefined ? { elevType: old.elevType } : {}), ...(old.elevSides !== undefined ? { elevSides: old.elevSides } : {}), ...(old.levels !== undefined ? { levels: old.levels } : {}) }
  })
}

/** A new racking area from a Fill racking box: the area object and the fill
 *  (its pattern clipped to the box). Null when the box places nothing. */
export function planAreaCreate(objects, box, settings, { gridSize = 40, newId = nanoid, from = null, elevations = null, rackGap = null, sections = [] } = {}) {
  const id = newId()
  const plan = planFill(objects, box, settings, { gridSize, newId, from, areaId: id, elevations, rackGap, sections, wallAnchor: true })
  if (!plan.racks.length) return null
  const anchor = from ? { x: from.x > box.x + box.w / 2 ? 'r' : 'l', y: from.y > box.y + box.h / 2 ? 'b' : 't' } : { x: 'l', y: 't' }
  // along the rows the walk started at the wall end, else the low end (fill-place): the area remembers that end
  const runEnd = plan.pattern.runDir < 0 ? 'hi' : 'lo'
  if (plan.pattern.vert) anchor.y = runEnd === 'hi' ? 'b' : 't'
  else anchor.x = runEnd === 'hi' ? 'r' : 'l'
  // the area's box stays inside the building: clipped to its inner walls' extent, and an edge within a
  // rack's depth of a wall put on it (it counts as on the wall) — across the rows and at the run ends
  box = snapToWalls(box, plan.fp, gridSize, plan.pattern.depthIn / 12, plan.pattern.vert, plan.pattern.wallClearIn ?? 0, true)
  const inner = innerOutline(plan.fp, gridSize), ix0 = Math.max(box.x, Math.min(...inner.map(p => p.x))), iy0 = Math.max(box.y, Math.min(...inner.map(p => p.y)))
  const ix1 = Math.min(box.x + box.w, Math.max(...inner.map(p => p.x))), iy1 = Math.min(box.y + box.h, Math.max(...inner.map(p => p.y)))
  const area = {
    id, type: AREA_TYPE, label: 'Racking area', x: ix0, y: iy0, width: ix1 - ix0, height: iy1 - iy0, rotation: 0,
    parentId: plan.fp.id, layerId: 'racking', // the wall clearance it was filled with, always written: an area without one was made before it (flush)
    settings: pickSettings({ ...settings, wallClearIn: plan.pattern.wallClearIn }), anchor, pattern: plan.pattern,
    // the equipment it was designed for (fill-design-aisle — utils/equipment.js areaProfile): a Fill's Custom widths, else
    // the project's forklift, by reference (a Fill's on it, Generate's): changing the project forklift rechecks its racks
    equip: equipOf(settings),
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
export function planAreaResize(objects, areaId, box, { gridSize = 40, newId = nanoid, rackGap = null, sections = [] } = {}) {
  const area = objects.find(o => o.id === areaId)
  if (!area) return null
  const clean = cleanRacks(objects, area), cleanIds = new Set(clean.map(o => o.id))
  /* a box resized (edited) snaps its run ends to a wall within a rack's depth, like a new one; the same box
     again is no edit — a saved area refilled over its own box stays exactly where it was */
  const E = 1e-6, edited = Math.abs(box.x - area.x) > E || Math.abs(box.y - area.y) > E || Math.abs(box.w - area.width) > E || Math.abs(box.h - area.height) > E
  // hand-edited racks keep only their bays wholly inside the new box — when the box changed: a refit over the
  // same box (a zone placed or moved nearby) leaves them as they are, a bay added past the box by hand included
  const dirty = edited ? objects.filter(o => isRack(o) && o.areaId === areaId && !cleanIds.has(o.id)).map(o => o.id) : []
  const t = trimBays(objects, dirty, (b) => !inside(b, box), gridSize, newId)
  const kept = carryPlaced(objects, t.objects, t.became).filter(o => !cleanIds.has(o.id))
  const now = kept.find(o => o.id === areaId)
  // an area from before patterns: its pattern from the box it had, as it was anchored
  let pattern = now.pattern || areaPattern(kept, boxOf(now), areaSettings(now), { gridSize, from: cornerOf(boxOf(now), now.anchor), areaId })?.pattern
  /* extended along the run (cross-aisle round): the rows lengthen and the run is split again by the same rule — its
     cross-aisles where the Cross aisle option and Max run put them over the new length (the rows across stay) */
  /* — past the farthest the area has reached along the run (`runBox`; an area from before: its box now), so a shrink
     then an extend back over ground it had keeps exactly the racks it had */
  if (pattern) {
    const runOf = (b) => (pattern.vert ? [b.y, b.y + b.h] : [b.x, b.x + b.w])
    const rb = Array.isArray(pattern.runBox) ? pattern.runBox : runOf(boxOf(now)), [b0, b1] = runOf(box)
    if (edited && (b0 < rb[0] - 1e-3 || b1 > rb[1] + 1e-3)) {
      const fresh = areaPattern(kept, box, areaSettings(now), { gridSize, from: cornerOf(box, now.anchor), areaId, wallAnchor: true })?.pattern
      /* split again only when the longer rows need more runs (a cross-aisle more) — within Max run as they are, the rows
         simply continue (shrink-fill: on the same lines, starting where they did) */
      const runsBySec = (p) => { const m = new Map(); for (const q of p?.pieces || []) m.set(q.sec, (m.get(q.sec) || 0) + 1); return m }
      const was = runsBySec(pattern), will = runsBySec(fresh)
      const more = [...will].some(([k, n]) => n > (was.get(k) || 0))
      pattern = more && fresh && fresh.vert === pattern.vert ?{ ...pattern, pieces: fresh.pieces, runDir: fresh.runDir, runBox: [b0, b1] } : { ...pattern, runBox: [Math.min(rb[0], b0), Math.max(rb[1], b1)] }
    } else if (!Array.isArray(pattern.runBox)) pattern = { ...pattern, runBox: rb }
  }
  const racks = pattern ? showPattern(kept, box, pattern, now, clean, removedBoxes(objects, area), { gridSize, newId, snapEnds: edited, rackGap, sections }) : []
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
export function planAreaRebuild(objects, areaId, settings, { gridSize = 40, newId = nanoid, elevations = null } = {}) {
  const area = objects.find(o => o.id === areaId)
  if (!area) return null
  const clean = cleanRacks(objects, area), cleanIds = new Set(clean.map(o => o.id))
  const kept = objects.filter(o => !cleanIds.has(o.id))
  const set = { ...areaSettings(area), ...pickSettings(settings) }
  const box = boxOf(area)
  const pattern = areaPattern(kept, box, set, { gridSize, from: cornerOf(box, area.anchor), areaId, elevations })?.pattern || null
  const racks = pattern ? showPattern(kept, box, pattern, area, clean, removedBoxes(objects, area), { gridSize, newId }) : []
  const keepPlaced = Object.fromEntries(Object.entries(area.placed || {}).filter(([id]) => !cleanIds.has(id)))
  const next = [...kept, ...racks].map(o => (o.id !== areaId ? o : {
    ...o, settings: pickSettings(set), pattern, placed: { ...keepPlaced, ...Object.fromEntries(racks.map(r => [r.id, rackSig(r)])) },
  }))
  return rebuildAisles(next, newId).objects
}

/** A rack's bays per row as world px boxes: a single's bay full depth, a pair's bay as its two halves. */
export function rowBayBoxes(obj, gridSize = 40) {
  const { xs, upW } = uprightXs(obj, gridSize)
  const t = ((obj.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const d = ((obj.depthIn ?? 42) / 12) * gridSize
  const bands = obj.type === 'rack_double_row' ? [[obj.y, obj.y + d], [obj.y + obj.height - d, obj.y + obj.height]] : [[obj.y, obj.y + obj.height]]
  const out = []
  for (let i = 0; i + 1 < xs.length; i++) for (const [y0, y1] of bands) {
    const pts = [[xs[i], y0], [xs[i + 1] + upW, y0], [xs[i + 1] + upW, y1], [xs[i], y1]].map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
    const X = pts.map(p => p[0]), Y = pts.map(p => p[1])
    out.push({ x: Math.min(...X), y: Math.min(...Y), w: Math.max(...X) - Math.min(...X), h: Math.max(...Y) - Math.min(...Y) })
  }
  return out
}
/** The bays per row in `before` that `after` no longer has (world px boxes): what a zone change removes — the
 *  red preview while a zone is resized and the bar's "N bays removed" alike. */
export function removedRowBays(before, after, gridSize = 40) {
  const racksOf = (list) => list.filter(o => isRack(o) && o.width > 0 && Array.isArray(o.beams))
  const now = racksOf(after).flatMap(o => rowBayBoxes(o, gridSize))
  const holds = (b) => now.some(q => Math.abs(q.x - b.x) < 1 && Math.abs(q.y - b.y) < 1 && Math.abs(q.w - b.w) < 1 && Math.abs(q.h - b.h) < 1)
  const ids = new Map(racksOf(after).map(o => [o.id, rackSig(o)]))
  return racksOf(before).filter(o => ids.get(o.id) !== rackSig(o)).flatMap(o => rowBayBoxes(o, gridSize)).filter(b => !holds(b))
}

/** Bays per row: a back-to-back pair's bay is two (its two rows), a single's one — what "N bays removed" counts. */
export const rowBays = (objects) => objects.filter(o => isRack(o) && Array.isArray(o.beams)).reduce((t, o) => t + o.beams.length * (o.type === 'rack_double_row' ? 2 : 1), 0)
