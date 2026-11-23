// slideOffColumn.js — (fill-columns-e) Check's "a column stands on an upright frame" fixed by hand: Slide off column.
//
// Fill and Generate are unchanged; the user picks this per Check item. The rack's whole row (every piece of it — the
// rack line) slides ALONG its run by the smallest amount that takes its frames off every column, never more than half a
// bay either way. When that row is in the Row group (utils/rowGroupTool.js), every row of the group slides the same
// amount, so their uprights still line up. A slide is taken only when it adds no new frame-on-column hit to anything it
// moves, overlaps no rack, zone or column it doesn't move, and keeps every moved rack on its building's floor. One undo
// (the store's moveObjects). No slide within half a bay: nothing moves, and the button says so.
import { rowsOf, rowOfRack } from './rowGroup'
import { rackFootprint, columnsOnUprights, expandColumnGrid } from '../generate/columnCheck'
import { innerOutline, boxOnFloor } from './floorGeom'

const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_')
const isFp = (o) => typeof o?.type === 'string' && o.type.startsWith('fp_')
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01
const hitKeys = (hits) => new Set(hits.map(h => h.rackId + '#' + h.columnIndex))

/** The rows that slide with rack `rackId`: its own, or — its row in the Row group (`groupKeys`) — every row of the group.
 *  → { ids (rack ids), along ('x' | 'y') } or null (no row, or the rows run different ways). */
export function slideSet(objects, rackId, gridSize = 40, groupKeys = []) {
  const rows = rowsOf(objects, gridSize), key = rowOfRack(rows, rackId)
  if (!key) return null
  const keys = groupKeys.includes(key) ? groupKeys : [key]
  const ids = [...new Set(keys.flatMap(k => rows.get(k)?.ids || []))]
  const byId = new Map(objects.map(o => [o.id, o]))
  const ways = new Set(ids.map(id => byId.get(id)).filter(Boolean).map(o => (rackFootprint(o).rotated ? 'y' : 'x')))
  if (ways.size !== 1) return null
  return { ids, along: [...ways][0], group: keys.length > 1 }
}

/** The smallest slide that takes rack `rackId`'s frames off its columns: → { ok: true, ids, dx, dy, inches, group } or
 *  { ok: false, reason } (nothing to move). */
export function planSlideOff(objects, rackId, gridSize = 40, groupKeys = []) {
  const set = slideSet(objects, rackId, gridSize, groupKeys)
  if (!set) return { ok: false, reason: 'This rack is not in a straight row' }
  const columns = objects.filter(o => o.type === 'column_grid').flatMap(g => expandColumnGrid(g, gridSize, objects))
  const moving = new Set(set.ids)
  const racks = objects.filter(o => moving.has(o.id))
  const rack = objects.find(o => o.id === rackId)
  const before = hitKeys(columnsOnUprights({ racks, columns, gridSize }))
  if (![...before].some(k => k.startsWith(rackId + '#'))) return { ok: false, reason: 'No column stands on this rack now' }
  // half a bay: the rack's widest bay (beam and upright)
  const upIn = rack.uprightWidth || 3, beamIn = Math.max(...(rack.beams || [96]))
  const limit = ((beamIn + upIn) / 12) * gridSize / 2, step = gridSize / 12   // an inch
  const others = objects.filter(o => !moving.has(o.id))
  const obstacles = [
    ...others.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0).map(o => { const f = rackFootprint(o); return { x: f.x, y: f.y, w: f.w, h: f.h } }),
    ...others.filter(isZone).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height })),
  ]
  const floors = new Map(objects.filter(isFp).map(f => [f.id, innerOutline(f, gridSize)]))
  const floorOf = (r) => floors.get(r.parentId) || [...floors.values()][0] || null
  const tryShift = (d) => {
    const dx = set.along === 'x' ? d : 0, dy = set.along === 'y' ? d : 0
    const moved = racks.map(o => ({ ...o, x: o.x + dx, y: o.y + dy }))
    const after = columnsOnUprights({ racks: moved, columns, gridSize })
    if (after.some(h => h.rackId === rackId)) return null                             // still on a column
    for (const h of after) if (!before.has(h.rackId + '#' + h.columnIndex)) return null  // a new hit
    for (const o of moved) {
      const f = rackFootprint(o), b = { x: f.x, y: f.y, w: f.w, h: f.h }
      if (obstacles.some(q => overlaps(b, q))) return null                             // onto a rack or a zone
      const poly = floorOf(o)
      if (poly && !boxOnFloor(poly, { x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 })) return null   // off the floor
    }
    return { dx, dy }
  }
  for (let k = 1; k * step <= limit + 1e-9; k++) for (const s of [1, -1]) {
    const d = s * k * step, r = tryShift(d)
    if (r) return { ok: true, ids: set.ids, ...r, inches: Math.round((d / gridSize) * 12 * 100) / 100, group: set.group }
  }
  return { ok: false, reason: `No slide within half a bay (${Math.round(((beamIn + upIn) / 2) * 10) / 10}″) clears it` }
}

/** Slide it (one undo — the store's moveObjects) → the plan (ok false: nothing moved). */
export function slideOffColumn(store, rackId, groupKeys = []) {
  const st = store.getState(), plan = planSlideOff(st.objects, rackId, st.gridSize || 40, groupKeys)
  if (plan.ok) st.moveObjects(plan.ids, plan.dx, plan.dy)
  return plan
}
