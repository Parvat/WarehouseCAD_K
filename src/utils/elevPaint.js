// elevPaint.js — paint mode for elevation types (ELEVATIONS_PLAN.md §3; the types: utils/elevations.js).
//
// Pick a type in the Elevations panel → the paint tool. The bar at the top of the canvas switches the scope:
//   Row  — every rack of the row under the cursor (utils/rowGroup.js rowsOf); a drag paints every row it crosses;
//   Side — the half under the cursor (utils/baySides.js bayHalfAt; the flue = both sides, a single = its one side);
//          a drag along the row takes that side of every rack of the row it passes;
//   Bay  — that bay on that half (the flue: both halves); a drag takes the run of bays between the first and the
//          current one, on the row and the side across the floor where it started.
// Hover shows exactly what a click changes. Click or drag = ONE history entry. "Reset to default" removes the
// overrides on the target instead (paintRack's reset). Esc, Done or the Select tool leave paint mode.
// The Row group replays it like any edit (utils/rowGroup.js, kind 'elev').

import { create } from 'zustand'
import { rowsOf, rowOfRack, geom, uprightsOf, worldSideOf } from './rowGroup'
import { faceIndex } from '../generate/faceAisles'
import { bayHalfAt } from './baySides'
import { hitTestBay } from '../canvas2/hitTest'
import { tableOf, paintRack, isBeamRack } from './elevations'

export const PAINT_TOOL = 'elevation_paint'
export const SCOPES = ['row', 'side', 'bay']

/** Presentation state: the type painted, the scope, reset, what the cursor would change, the drag in progress. */
export const usePaint = create(() => ({ typeId: null, scope: 'row', reset: false, hover: null, stroke: null }))

const EPS = 1e-6
const upPx = (o, gridSize) => ((o.uprightWidth || 3) / 12) * gridSize
/** World position along the row's run. */
const runAt = (vert, world) => (vert ? world.y : world.x)

/** Where a press or hover lands: { rowKey, rackId, vert, r (run position), ws (world side: 'lo' | 'hi', or null =
 *  both sides) }, or null off a beam rack. */
export function targetAt(objects, hitId, world, gridSize = 40) {
  const rack = hitId ? objects.find(o => o.id === hitId) : null
  if (!isBeamRack(rack)) return null
  const rows = rowsOf(objects, gridSize), rowKey = rowOfRack(rows, rack.id)
  if (!rowKey) return null
  const row = rows.get(rowKey).ids.map(id => objects.find(o => o.id === id))
  const g = geom(rack)
  let ws = null
  if (rack.type === 'rack_double_row') { const h = bayHalfAt(rack, world.x, world.y, gridSize); ws = h == null ? null : worldSideOf(rack, h, row) }
  else ws = worldSideOf(rack, 0, row)
  return { rowKey, rackId: rack.id, vert: g.vert, r: runAt(g.vert, world), ws, bay: hitTestBay(rack, world.x, world.y, gridSize) }
}

/** What a stroke from `start` to `cur` (targetAt's shape; cur may be a bare { r } along the start's row, or carry
 *  rowKeys crossed for Row) paints: Map(rackId → { sides: [local] | null (all), bays: [own index] | null (all) }). */
export function strokeTargets(objects, scope, start, cur = start, gridSize = 40, rowKeys = null) {
  const out = new Map()
  if (!start) return out
  const rows = rowsOf(objects, gridSize), byId = new Map(objects.map(o => [o.id, o]))
  if (scope === 'row') {
    for (const k of rowKeys || [start.rowKey]) for (const id of rows.get(k)?.ids || []) out.set(id, { sides: null, bays: null })
    return out
  }
  const row = (rows.get(start.rowKey)?.ids || []).map(id => byId.get(id)).filter(Boolean)
  const lo = Math.min(start.r, cur.r ?? start.r), hi = Math.max(start.r, cur.r ?? start.r)
  for (const o of row) {
    let sides
    if (o.type === 'rack_double_row') sides = start.ws ? [faceIndex(o, start.ws)] : [0, 1]
    else { const w = worldSideOf(o, 0, row); sides = !start.ws || !w || w === start.ws ? [0] : [] }
    if (!sides.length) continue
    const g = geom(o), up = upPx(o, gridSize), U = uprightsOf(g.r0, g.beams, up, gridSize), n = o.beams.length, turn = ((o.rotation || 0) % 360 + 360) % 360, rev = turn === 180 || turn === 270
    const bays = []
    for (let i = 0; i < n; i++) if (Math.min(U[i + 1] + up, hi) - Math.max(U[i], lo) > -EPS) bays.push(rev ? n - 1 - i : i)
    if (!bays.length) continue
    // a click (no drag) in Bay scope: the bay under the cursor only (its run includes the shared uprights)
    const pick = scope === 'bay' && lo === hi && o.id === start.rackId && start.bay != null ? [start.bay] : bays
    if (scope === 'bay' && lo === hi && o.id !== start.rackId) continue
    out.set(o.id, { sides, bays: scope === 'side' ? null : pick })
  }
  return out
}

/** `objects` with `targets` painted with `typeId` (or their overrides removed: `reset`). */
export function applyPaint(objects, targets, { typeId, reset = false }) {
  const T = tableOf(objects)
  if (!T || !targets.size) return objects
  let changed = false
  const out = objects.map(o => {
    const t = targets.get(o.id)
    if (!t || !isBeamRack(o)) return o
    const n = paintRack(o, T, { sides: t.sides, bays: t.bays, typeId, reset })
    if (JSON.stringify(n) !== JSON.stringify(o)) changed = true
    return n
  })
  return changed ? out : objects
}

/** Write a paint into `store` as ONE history entry. Returns whether anything changed. */
export function commitPaint(store, targets, opts) {
  const st = store.getState(), next = applyPaint(st.objects, targets, opts)
  if (next === st.objects) return false
  const anchor = [...targets.keys()][0]
  store.setState({ objects: next })
  store.getState().commitObjectUpdate(anchor, {})
  return true
}

/** Enter paint mode with type `typeId`. */
export function startPainting(store, typeId) {
  // entering paint mode starts on Row; switching type while painting keeps the scope chosen
  const entering = store.getState().activeTool !== PAINT_TOOL
  usePaint.setState({ typeId, hover: null, stroke: null, reset: false, ...(entering ? { scope: 'row' } : {}) })
  store.getState().setActiveTool(PAINT_TOOL)
}
