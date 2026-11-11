// buildingResize.js — what a building resize (its handles: canvas2/fpHandles.js) does to what stands in it
// (STUDIO.md §7), in the resize's own undo step:
//   - shrunk: every bay that no longer fits inside the new walls with the wall clearance is removed — whole bays, from
//     the row ends; a row with no bay left is removed. Zones and columns left outside are not touched: Check layout
//     flags them (utils/layoutCheck.js). A back-to-back pair left with one face against the new wall (no aisle in
//     front of it, where it had one) loses that dead half; the single row left moves flush to the wall at the wall
//     clearance, as Generate puts a wall row. Its racking areas shrink with it: each side the building came in on clips
//     the area to the new inner wall minus the wall clearance; an area left with no space is removed. Its sections and
//     zones (shrink-fill) are clipped the same way to the new inner wall face (a custom shape cut along it); one left with
//     nothing inside is removed. Columns are not touched (Check layout flags one outside). Notice — the bays removed,
//     the sections and zones clipped or removed — with Undo.
//   - enlarged: nothing is added and no notice is shown.

import { nanoid } from 'nanoid'
import { innerOutline, boxOnFloor } from './floorGeom'
import { insetPolygon } from './canvas'
import { uprightXs } from '../render/rackOps'
import { piecesFromStates } from '../generate/faceReach'
import { rebuildAisles } from './aisleRebuild'
import { snapshotOf } from './elevations'
import { projectOf } from './project'
import { rackingSettings } from './fillTool'
import { rackFootprint } from '../generate/rackFootprint'
import { faceObstacleGaps, faceIndex } from '../generate/faceAisles'
import { MHE_PROFILES } from '../generate/columnCheck'
import { getColumnCheckView } from '../generate/columnCheckView'
import { notify } from './notice'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const E = 0.5

/** The rack's local point → world, about its own centre. */
function toWorld(r) {
  const t = ((r.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  return (lx, ly) => ({ x: cx + (lx - cx) * c - (ly - cy) * s, y: cy + (lx - cx) * s + (ly - cy) * c })
}
function worldBox(T, x0, y0, x1, y1) {
  const p = [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)], xs = p.map(q => q.x), ys = p.map(q => q.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
/** Each bay of beam rack `r` as a world box (its uprights included, the rack's full depth). */
export function bayBoxes(r, gridSize = 40) {
  const T = toWorld(r), { xs, upW } = uprightXs(r, gridSize)
  return r.beams.map((_, i) => worldBox(T, xs[i], r.y, xs[i + 1] + upW, r.y + r.height))
}
/** The floor a rack may stand on: the inner wall face inset by the wall clearance (in). */
export function usableFloor(fp, gridSize = 40, clearIn = 0) {
  const inner = innerOutline(fp, gridSize)
  const c = (Math.max(0, clearIn || 0) / 12) * gridSize
  return c > 0 ? insetPolygon(inner, c) : inner
}
/** The wall clearance (in) in force: the project's, else the Racking settings'. */
export function wallClearanceIn(elevations) {
  const pr = projectOf(elevations)
  const v = pr?.rules?.wallClearIn ?? rackingSettings().wallClearIn
  return Number.isFinite(v) ? v : 0
}
/** Polygon `pts` ([x, y][]) clipped to box `b` ({ x0, y0, x1, y1 }, any side ±Infinity: open). */
function clipToBox(pts, b) {
  let out = pts
  for (const [inside, cross] of [
    [(q) => q[0] >= b.x0, (p, q) => [b.x0, p[1] + ((q[1] - p[1]) * (b.x0 - p[0])) / (q[0] - p[0])]],
    [(q) => q[0] <= b.x1, (p, q) => [b.x1, p[1] + ((q[1] - p[1]) * (b.x1 - p[0])) / (q[0] - p[0])]],
    [(q) => q[1] >= b.y0, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y0 - p[1])) / (q[1] - p[1]), b.y0]],
    [(q) => q[1] <= b.y1, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y1 - p[1])) / (q[1] - p[1]), b.y1]],
  ]) {
    if (!out.length) break
    const inp = out; out = []
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length]
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur) } else if (inside(prev)) out.push(cross(prev, cur))
    }
  }
  return out
}
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0 } return Math.abs(a) / 2 }
/** A section or zone clipped to `cut` → the object (the same when untouched), or null (nothing inside). */
function clipShape(o, cut) {
  if (o.type === 'section_area' && o.shape === 'poly' && Array.isArray(o.pts)) {
    const world = o.pts.map(([x, y]) => [o.x + x, o.y + y]), xs = world.map(q => q[0]), ys = world.map(q => q[1])
    if (Math.min(...xs) >= cut.x0 && Math.min(...ys) >= cut.y0 && Math.max(...xs) <= cut.x1 && Math.max(...ys) <= cut.y1) return o
    const c = clipToBox(world, cut)
    if (c.length < 3 || polyArea(c) <= E * E) return null
    const nx = Math.min(...c.map(q => q[0])), ny = Math.min(...c.map(q => q[1]))
    return { ...o, x: nx, y: ny, width: Math.max(...c.map(q => q[0])) - nx, height: Math.max(...c.map(q => q[1])) - ny, pts: c.map(([x, y]) => [x - nx, y - ny]) }
  }
  const x0 = Math.max(o.x, cut.x0), y0 = Math.max(o.y, cut.y0), x1 = Math.min(o.x + o.width, cut.x1), y1 = Math.min(o.y + o.height, cut.y1)
  if (x0 === o.x && y0 === o.y && x1 === o.x + o.width && y1 === o.y + o.height) return o
  return x1 - x0 > E && y1 - y0 > E ? { ...o, x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
}
const bbox = (p) => { const xs = p.map(q => q.x), ys = p.map(q => q.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } }
const fits = (poly, b) => boxOnFloor(poly, { x: b.x + E, y: b.y + E, w: Math.max(0, b.w - 2 * E), h: Math.max(0, b.h - 2 * E) })

/** `objects` after building `before` became `after` (same id): the bays that fit before and no longer fit are taken
 *  off the row ends, and its racking areas clipped on each side it came in on → { objects, removed (bays), areas
 *  (racking areas clipped or removed) }. Pure. */
export function planBuildingResize(objects, before, after, { gridSize = 40, clearIn = 0, newId = nanoid, profile = MHE_PROFILES.reach } = {}) {
  const was = usableFloor(before, gridSize, clearIn), now = usableFloor(after, gridSize, clearIn)
  let removed = 0
  const out = []
  for (const o of objects) {
    const mine = o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length && (o.parentId === after.id || o.parentId == null)
    if (!mine) { out.push(o); continue }
    const boxes = bayBoxes(o, gridSize)
    const okNow = boxes.map(b => fits(now, b)), okWas = boxes.map(b => fits(was, b))
    if (okNow.every(Boolean) || !okWas.some(Boolean)) { out.push(o); continue }   // untouched, or never on this floor
    if (!okNow.some(Boolean)) { removed += o.beams.length; continue }              // the whole row is outside now
    // whole bays from the ends: each end bay that fit before and no longer fits, until one fits
    let lo = 0, hi = o.beams.length - 1
    while (lo <= hi && !okNow[lo] && okWas[lo]) lo++
    while (hi >= lo && !okNow[hi] && okWas[hi]) hi--
    if (lo === 0 && hi === o.beams.length - 1) { out.push(o); continue }
    removed += lo + (o.beams.length - 1 - hi)
    const state = o.beams.map((_, i) => (i >= lo && i <= hi ? 'D' : '-'))
    out.push(...piecesFromStates(o, state, { gridSize, newId }))
  }
  // a pair with one face against the new wall over all its bays (no aisle in front of it, where it had one before):
  // that half goes, and the single left moves flush to the wall at the wall clearance
  const wallFaces = (objs) => {
    const m = new Map()
    for (const g of faceObstacleGaps(objs, { gridSize, profile })) {
      if (g.obstacle.kind !== 'wall' || g.rack.type !== 'rack_double_row') continue
      const k = `${g.rack.id}:${g.side}`, e = m.get(k) || { bays: new Set(), width: Infinity }
      g.bays.forEach(b => e.bays.add(b)); e.width = Math.min(e.width, g.width); m.set(k, e)
    }
    return m
  }
  const deadNow = wallFaces(out), deadWas = wallFaces(objects.map(o => (o && o.id === after.id ? before : o)))
  const clearPx = (Math.max(0, clearIn || 0) / 12) * gridSize
  for (let i = 0; i < out.length; i++) {
    const r = out[i]
    if (!r || r.type !== 'rack_double_row' || r.parentId !== after.id) continue
    const n = r.beams.length, full = (e) => !!e && e.bays.size === n
    const lo = deadNow.get(`${r.id}:lo`), hi = deadNow.get(`${r.id}:hi`)
    if (full(lo) === full(hi)) continue                                           // both faces open, or both dead
    const side = full(lo) ? 'lo' : 'hi', dead = side === 'lo' ? lo : hi
    if (deadWas.has(`${r.pieceOf || r.id}:${side}`)) continue                     // no aisle there before the shrink either
    const keep = faceIndex(r, side) === 0 ? 'B' : 'A'
    const [single] = piecesFromStates(r, r.beams.map(() => keep), { gridSize, newId })
    const f = rackFootprint(r), g = rackFootprint(single), vert = !!f.rotated
    const [s0, s1] = vert ? [f.x, f.x + f.w] : [f.y, f.y + f.h], [g0, g1] = vert ? [g.x, g.x + g.w] : [g.y, g.y + g.h]
    const shift = side === 'hi' ? (s1 + dead.width - clearPx) - g1 : (s0 - dead.width + clearPx) - g0
    out[i] = vert ? { ...single, x: single.x + shift } : { ...single, y: single.y + shift }
    removed += n
  }
  // its racking areas: each side the usable floor came in on clips the area's box to it; no space left, removed
  const wb = bbox(was), nb = bbox(now)
  const cut = { x0: nb.x0 > wb.x0 + E ? nb.x0 : -Infinity, y0: nb.y0 > wb.y0 + E ? nb.y0 : -Infinity,
    x1: nb.x1 < wb.x1 - E ? nb.x1 : Infinity, y1: nb.y1 < wb.y1 - E ? nb.y1 : Infinity }
  let areas = 0
  const clipped = []
  for (const o of out) {
    if (!o || o.type !== 'racking_area' || o.parentId !== after.id) { clipped.push(o); continue }
    const x0 = Math.max(o.x, cut.x0), y0 = Math.max(o.y, cut.y0), x1 = Math.min(o.x + o.width, cut.x1), y1 = Math.min(o.y + o.height, cut.y1)
    if (x0 === o.x && y0 === o.y && x1 === o.x + o.width && y1 === o.y + o.height) { clipped.push(o); continue }
    areas++
    if (x1 - x0 > E && y1 - y0 > E) clipped.push({ ...o, x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
  }
  // its sections and zones: clipped to the new inner wall face on each side it came in on; nothing inside, removed
  const wi = bbox(innerOutline(before, gridSize)), ni = bbox(innerOutline(after, gridSize))
  const cutIn = { x0: ni.x0 > wi.x0 + E ? ni.x0 : -Infinity, y0: ni.y0 > wi.y0 + E ? ni.y0 : -Infinity,
    x1: ni.x1 < wi.x1 - E ? ni.x1 : Infinity, y1: ni.y1 < wi.y1 - E ? ni.y1 : Infinity }
  const inBuilding = (o) => o.parentId === after.id || (o.parentId == null && o.x + o.width / 2 >= wi.x0 && o.x + o.width / 2 <= wi.x1 && o.y + o.height / 2 >= wi.y0 && o.y + o.height / 2 <= wi.y1)
  const shapes = { sections: { clipped: 0, removed: 0 }, zones: { clipped: 0, removed: 0 } }
  const final = []
  for (const o of areas ? clipped : out) {
    const kind = o && o.type === 'section_area' ? 'sections' : o && typeof o.type === 'string' && o.type.startsWith('zone_') && o.width > 0 ? 'zones' : null
    if (!kind || !inBuilding(o)) { final.push(o); continue }
    const c = clipShape(o, cutIn)
    if (c === o) { final.push(o); continue }
    if (c) { final.push(c); shapes[kind].clipped++ } else shapes[kind].removed++
  }
  const shaped = shapes.sections.clipped + shapes.sections.removed + shapes.zones.clipped + shapes.zones.removed
  const res = areas || shaped ? final : out
  return { objects: removed ? rebuildAisles(res, newId).objects : areas || shaped ? res : objects, removed, areas, shapes }
}

/** After a handle resize of building `before` → its live object, committed as the store's top history entry: the
 *  bays that no longer fit go in that SAME entry (one undo step), and the notice says what happened (an enlarge adds nothing and shows no notice). */
export function afterBuildingResize(store, before) {
  const st = store.getState(), after = st.objects.find(o => o.id === before.id)
  if (!after) return null
  let profile = MHE_PROFILES.reach
  try { profile = getColumnCheckView()?.profile || profile } catch { /* no column check view yet */ }
  const plan = planBuildingResize(st.objects, before, after, { gridSize: st.gridSize || 40, clearIn: wallClearanceIn(st.elevations), profile })
  const sh = plan.shapes, shaped = sh.sections.clipped + sh.sections.removed + sh.zones.clipped + sh.zones.removed
  if (plan.removed || plan.areas || shaped) {
    const history = st.history.slice(0, st.historyIndex + 1)
    history[history.length - 1] = snapshotOf(st, plan.objects)
    store.setState({ objects: plan.objects, history, historyIndex: history.length - 1, selectedIds: st.selectedIds.filter(id => plan.objects.some(o => o.id === id)) })
    // the notice: what the shrink took — "4 bays removed · 1 section clipped · 1 zone removed" — with Undo
    const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`
    const parts = [
      plan.removed ? n(plan.removed, 'bay') + ' removed' : null,
      sh.sections.clipped ? n(sh.sections.clipped, 'section') + ' clipped' : null, sh.sections.removed ? n(sh.sections.removed, 'section') + ' removed' : null,
      sh.zones.clipped ? n(sh.zones.clipped, 'zone') + ' clipped' : null, sh.zones.removed ? n(sh.zones.removed, 'zone') + ' removed' : null,
    ].filter(Boolean)
    if (parts.length) notify(parts.join(' · '), 'they no longer fit inside the walls', { undo: true })
  }
  return plan
}
