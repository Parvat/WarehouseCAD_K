// buildingResize.js — what a building resize (its handles: canvas2/fpHandles.js) does to what stands in it
// (STUDIO.md §7), in the resize's own undo step:
//   - shrunk: every bay that no longer fits inside the new walls with the wall clearance is removed — whole bays, from
//     the row ends; a row with no bay left is removed. Zones and columns left outside are not touched: Check layout
//     flags them (utils/layoutCheck.js). Notice "N bays removed" with Undo.
//   - enlarged: nothing is added. Notice "Building larger" with Fill new space — Fill racking on the new floor.

import { nanoid } from 'nanoid'
import { innerOutline, boxOnFloor } from './floorGeom'
import { insetPolygon } from './canvas'
import { uprightXs } from '../render/rackOps'
import { piecesFromStates } from '../generate/faceReach'
import { rebuildAisles } from './aisleRebuild'
import { snapshotOf } from './elevations'
import { projectOf } from './project'
import { rackingSettings, FILL_TOOL, startFill, moveFill, commitFill } from './fillTool'
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
  let newBox = null
  if (grew) {
    const a = bbox(iWas), b = bbox(iNow)
    const strips = [
      { x: b.x, y: b.y, w: b.w, h: a.y - b.y },
      { x: b.x, y: a.y + a.h, w: b.w, h: b.y + b.h - (a.y + a.h) },
      { x: b.x, y: b.y, w: a.x - b.x, h: b.h },
      { x: a.x + a.w, y: b.y, w: b.x + b.w - (a.x + a.w), h: b.h },
    ].filter(s => s.w > 1 && s.h > 1)
    newBox = strips.sort((p, q) => q.w * q.h - p.w * p.h)[0] || null
  }
  return { objects: removed ? rebuildAisles(out, newId).objects : objects, removed, grew, newBox }
}

/** Fill new space: Fill racking on `box` (world px) — as if it had been dragged with the tool, one undo step; the
 *  tool stays on. */
export function fillNewSpace(store, box) {
  const st = store.getState()
  st.setActiveTool(FILL_TOOL)
  startFill({ x: box.x, y: box.y })
  moveFill({ x: box.x + box.w, y: box.y + box.h }, store.getState().objects, st.gridSize || 40, st.elevations)
  return commitFill(store)
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
    const box = plan.newBox
    notify('Building larger', null, { action: { label: 'Fill new space', run: () => fillNewSpace(store, box) } })
  }
  return plan
}
