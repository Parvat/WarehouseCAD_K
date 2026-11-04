// buildingResize.js — what a building resize (its handles: canvas2/fpHandles.js) does to what stands in it
// (STUDIO.md §7), in the resize's own undo step:
//   - shrunk: every bay that no longer fits inside the new walls with the wall clearance is removed — whole bays, from
//     the row ends; a row with no bay left is removed. Zones and columns left outside are not touched: Check layout
//     flags them (utils/layoutCheck.js). Notice "N bays removed" with Undo.
//   - enlarged: nothing is added. Notice "Building larger" with Fill new space: the existing rows run on into the new
//     floor along their own row lines (whole bays, the end bay's beam), keeping the aisles and the gap they kept to the
//     old wall (the wall clearance, or an end aisle); new rows (Fill racking) only where no row line reaches. One undo.

import { nanoid } from 'nanoid'
import { innerOutline, boxOnFloor } from './floorGeom'
import { insetPolygon } from './canvas'
import { uprightXs } from '../render/rackOps'
import { piecesFromStates } from '../generate/faceReach'
import { rebuildAisles } from './aisleRebuild'
import { snapshotOf } from './elevations'
import { projectOf } from './project'
import { rackingSettings, FILL_TOOL } from './fillTool'
import { planAreaCreate } from '../generate/rackingArea'
import { rackFootprint } from '../generate/rackFootprint'
import { layoutColumns } from '../generate/usableCapacity'
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
const fits = (poly, b) => boxOnFloor(poly, { x: b.x + E, y: b.y + E, w: Math.max(0, b.w - 2 * E), h: Math.max(0, b.h - 2 * E) })
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], s = p[(i + 1) % p.length]; a += q.x * s.y - s.x * q.y } return Math.abs(a) / 2 }
const bbox = (p) => { const xs = p.map(q => q.x), ys = p.map(q => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } }

/** `objects` after building `before` became `after` (same id): the bays that fit before and no longer fit are taken
 *  off the row ends → { objects, removed (bays), grew, newBox (the largest new strip of floor, or null) }. Pure. */
export function planBuildingResize(objects, before, after, { gridSize = 40, clearIn = 0, newId = nanoid } = {}) {
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
  const iWas = innerOutline(before, gridSize), iNow = innerOutline(after, gridSize)
  const grew = area(iNow) > area(iWas) + 1
  let newBox = null, strips = []
  if (grew) {
    const a = bbox(iWas), b = bbox(iNow)
    // the new floor's strips: above, below, left, right of the old floor — each with the side it grew on
    const cand = [
      { x: b.x, y: b.y, w: b.w, h: a.y - b.y },
      { x: b.x, y: a.y + a.h, w: b.w, h: b.y + b.h - (a.y + a.h) },
      { x: b.x, y: b.y, w: a.x - b.x, h: b.h },
      { x: a.x + a.w, y: b.y, w: b.x + b.w - (a.x + a.w), h: b.h },
    ]
    strips = [['y', -1], ['y', 1], ['x', -1], ['x', 1]].map(([axis, dir], i) => ({ ...cand[i], axis, dir })).filter(s => s.w > 1 && s.h > 1)
    newBox = [...strips].sort((p, q) => q.w * q.h - p.w * p.h)[0] || null
  }
  return { objects: removed ? rebuildAisles(out, newId).objects : objects, removed, grew, newBox, strips }
}

const rotOf = (r) => ((((r.rotation || 0) % 360) + 360) % 360)
/** The world axis a beam rack runs along ('x' | 'y'; null when turned off the right angles) and which way its local +x
 *  points on it (1 | -1). */
function runOf(r) {
  const rot = rotOf(r)
  if (rot === 0 || rot === 180) return { axis: 'x', plus: rot === 0 ? 1 : -1 }
  if (rot === 90 || rot === 270) return { axis: 'y', plus: rot === 90 ? 1 : -1 }
  return null
}
const span = (f, axis) => (axis === 'x' ? [f.x, f.x + f.w] : [f.y, f.y + f.h])
const across = (f, axis) => (axis === 'x' ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const overlaps = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > E && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > E
/** Rack `r` with `k` bays more at its end (`atEnd`: local +x) or its start, its existing bays where they are drawn;
 *  the per-bay marks (elevation types, empty sides) stay on their bays — new bays get the row default and no mark. */
function withBays(r, k, atEnd, gridSize) {
  const beams = r.beams || [96], upIn = r.uprightWidth || 3
  const add = Array(k).fill(atEnd ? beams[beams.length - 1] : beams[0])
  const nb = atEnd ? [...beams, ...add] : [...add, ...beams]
  const width = ((upIn * (nb.length + 1) + nb.reduce((s, b) => s + b, 0)) / 12) * gridSize
  const perBay = (none) => (a) => (Array.isArray(a) ? (atEnd ? a : [...Array(k).fill(none), ...a]) : a)
  const o = { ...r, beams: nb, width,
    ...(Array.isArray(r.elevBays) ? { elevBays: r.elevBays.map(perBay(null)) } : {}),
    ...(Array.isArray(r.bayEmpty) ? { bayEmpty: r.bayEmpty.map(perBay(false)) } : {}) }
  // the end held: its start (adding at the end) or its end (adding at the start) stays where it is in the world
  const cy = r.y + r.height / 2
  const was = toWorld(r)(atEnd ? r.x : r.x + r.width, cy), now = toWorld(o)(atEnd ? o.x : o.x + o.width, cy)
  return { ...o, x: o.x + (was.x - now.x), y: o.y + (was.y - now.y) }
}

/** The rows of building `after` (was `before`) run on into the new floor `strips` along their own row lines: each rack
 *  that is the last on its line toward a strip gets whole bays (its end bay's beam) while the bay stands on the floor
 *  with the wall clearance, keeps the gap the rack kept to the old wall (an end aisle stays one) and touches no other
 *  rack, zone or column. → { objects, extended (bays added), reached: per strip, the span its row lines cover across
 *  it, or null }. Pure. */
export function extendRowsInto(objects, before, after, strips, { gridSize = 40, clearIn = 0 } = {}) {
  const was = bbox(usableFloor(before, gridSize, clearIn)), poly = usableFloor(after, gridSize, clearIn), now = bbox(poly)
  const cols = layoutColumns(objects, gridSize).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
  const mine = (o) => !!o && (o.parentId === after.id || o.parentId == null)
  const isZone = (o) => typeof o.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
  const isRackObj = (o) => typeof o.type === 'string' && o.type.startsWith('rack_') && o.width > 0
  let out = objects, extended = 0
  const reached = strips.map(() => null)
  strips.forEach((s, si) => {
    const { axis, dir } = s, [s0, s1] = across(s, axis)
    for (const id of out.filter(o => mine(o) && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length).map(o => o.id)) {
      const r0 = out.find(o => o.id === id), run = r0 && runOf(r0)
      if (!run || run.axis !== axis) continue
      const f = rackFootprint(r0), [a0, a1] = span(f, axis), [c0, c1] = across(f, axis)
      if (c0 < s0 - E || c1 > s1 + E) continue
      const others = out.filter(o => o.id !== r0.id && mine(o) && (isRackObj(o) || isZone(o)))
        .map(o => (isZone(o) ? { x: o.x, y: o.y, w: o.width, h: o.height } : rackFootprint(o)))
      // the last on its line toward the strip: nothing of the building beyond it on that line
      const up = ((r0.uprightWidth || 3) / 12) * gridSize
      const beyond = others.some(b => { const [q0, q1] = across(b, axis), [p0, p1] = span(b, axis); return Math.min(q1, c1) - Math.max(q0, c0) > E && (dir > 0 ? p0 >= a1 - up - E : p1 <= a0 + up + E) })
      if (beyond) continue
      const rc = reached[si]
      reached[si] = rc ? [Math.min(rc[0], c0), Math.max(rc[1], c1)] : [c0, c1]
      // the gap it kept to the old wall (with its clearance), kept to the new one
      const [w0, w1] = span(was, axis), [n0, n1] = span(now, axis)
      const gap = Math.max(0, dir > 0 ? w1 - a1 : a0 - w0), limit = dir > 0 ? n1 - gap : n0 + gap
      const atEnd = run.plus === dir
      let best = 0
      for (let k = 1; k <= 400; k++) {
        const o = withBays(r0, k, atEnd, gridSize), boxes = bayBoxes(o, gridSize), nb = atEnd ? boxes[boxes.length - 1] : boxes[0]
        const [e0, e1] = span(rackFootprint(o), axis)
        if (dir > 0 ? e1 > limit + E : e0 < limit - E) break
        if (!fits(poly, nb) || others.some(b => overlaps(b, nb)) || cols.some(c => overlaps(c, nb))) break
        best = k
      }
      if (!best) continue
      const o = withBays(r0, best, atEnd, gridSize)
      out = out.map(x => (x.id === r0.id ? o : x))
      extended += best * (r0.type === 'rack_double_row' ? 2 : 1)
    }
  })
  return { objects: out, extended, reached }
}

/** The parts of `strip` no row line reaches: all of it, or what lies past the span `reach` its rows cover across it. */
function unreached(strip, reach) {
  if (!reach) return [strip]
  const { axis } = strip, [s0, s1] = across(strip, axis), out = []
  for (const [p, q] of [[s0, reach[0]], [reach[1], s1]]) {
    if (q - p <= 1) continue
    out.push(axis === 'x' ? { x: strip.x, y: p, w: strip.w, h: q - p } : { x: p, y: strip.y, w: q - p, h: strip.h })
  }
  return out
}

/** Fill new space (the "Building larger" notice): the existing rows run on into the new floor along their row lines,
 *  and Fill racking puts new rows only where no row line reaches — all ONE undo step. The Fill racking tool is on
 *  after, as before. → { extended (bays added), racks (new racks) }. */
export function fillNewSpace(store, { before, fpId, strips }) {
  const st = store.getState(), gridSize = st.gridSize || 40, after = st.objects.find(o => o.id === fpId)
  st.setActiveTool(FILL_TOOL)
  if (!after || !strips?.length) return { extended: 0, racks: 0 }
  const ext = extendRowsInto(st.objects, before, after, strips, { gridSize, clearIn: wallClearanceIn(st.elevations) })
  let objects = ext.extended ? rebuildAisles(ext.objects, nanoid).objects : st.objects
  let racks = 0, anchor = null
  strips.forEach((s, i) => {
    for (const box of unreached(s, ext.reached[i])) {
      const created = planAreaCreate(objects, box, rackingSettings(), { gridSize, from: { x: box.x, y: box.y }, newId: nanoid, elevations: st.elevations })
      if (!created || !created.plan.racks.length) continue
      objects = [...objects, created.area, ...created.plan.racks, ...created.plan.aisles]
      racks += created.plan.racks.length
      anchor = anchor || created.area.id
    }
  })
  if (!ext.extended && !racks) return { extended: 0, racks: 0 }
  store.setState({ objects })
  store.getState().commitObjectUpdate(anchor || fpId, {})
  return { extended: ext.extended, racks }
}

/** After a handle resize of building `before` → its live object, committed as the store's top history entry: the
 *  bays that no longer fit go in that SAME entry (one undo step), and the notice says what happened. */
export function afterBuildingResize(store, before) {
  const st = store.getState(), after = st.objects.find(o => o.id === before.id)
  if (!after) return null
  const plan = planBuildingResize(st.objects, before, after, { gridSize: st.gridSize || 40, clearIn: wallClearanceIn(st.elevations) })
  if (plan.removed) {
    const history = st.history.slice(0, st.historyIndex + 1)
    history[history.length - 1] = snapshotOf(st, plan.objects)
    store.setState({ objects: plan.objects, history, historyIndex: history.length - 1, selectedIds: st.selectedIds.filter(id => plan.objects.some(o => o.id === id)) })
    notify(`${plan.removed} bay${plan.removed === 1 ? '' : 's'} removed`, 'they no longer fit inside the walls', { undo: true })
  } else if (plan.grew && plan.newBox) {
    const strips = plan.strips, fpId = after.id
    notify('Building larger', null, { action: { label: 'Fill new space', run: () => fillNewSpace(store, { before, fpId, strips }) } })
  }
  return plan
}
