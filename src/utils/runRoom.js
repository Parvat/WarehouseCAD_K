// runRoom.js — the free floor past each end of a row along its run (fixes-x 2: a cross-aisle cut slides the run beyond it
// outward into it; the tunnel's wider bay grows into it).
//
// From the rack's end to the nearest of, standing across its line: a wall of its building less the wall clearance (the
// Racking settings'), another rack less the aisle it needs there (the cross-aisle width of the equipment in force there —
// utils/fillTool.js fillEquipment; `aisle: false`: the rack itself), a zone, a door (its drawn rectangle — a dock door's
// reaches into the building: its clear space), and the edge of the drawn section holding the rack. Pure.

import { geom } from './rowGroup'
import { rackFootprint } from '../generate/rackFootprint'
import { innerOutline } from './floorGeom'
import { rackingSettings, fillEquipment, crossOf } from './fillTool'
import { isSection, polygonOf, pointInPolygon } from './sectionAreas'
import { isDoor } from './doorTool'

const EPS = 1e-6
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')

/** Free floor past each end of rack `o` along its run (world px): { lo (before its start), hi (past its end) }. */
export function runRoom(o, objects, gs = 40, { aisle = true } = {}) {
  const g = geom(o), room = { lo: Infinity, hi: Infinity }
  const across = (c0, c1) => Math.min(c1, g.s1) - Math.max(c0, g.s0) > EPS
  const block = (a0, a1, c0, c1, keep = 0) => {
    if (!across(c0, c1)) return
    if (a0 >= g.r1 - EPS) room.hi = Math.min(room.hi, a0 - g.r1 - keep)
    else if (a1 <= g.r0 + EPS) room.lo = Math.min(room.lo, g.r0 - a1 - keep)
  }
  const rect = (x, y, w, h, keep = 0) => (g.vert ? block(y, y + h, x, x + w, keep) : block(x, x + w, y, y + h, keep))
  // the aisle a rack needs at its end: the equipment's cross-aisle width there
  const need = aisle ? (crossOf(fillEquipment(objects, { x: g.vert ? (g.s0 + g.s1) / 2 : g.r1, y: g.vert ? g.r1 : (g.s0 + g.s1) / 2 })) || 0) * gs : 0
  for (const q of objects || []) {
    if (q.id === o.id) continue
    if (isRack(q)) { const f = rackFootprint(q); rect(f.x, f.y, f.w, f.h, need) }
    else if ((/^zone_/.test(q.type || '') || isDoor(q)) && q.width > 0 && q.height > 0) rect(q.x, q.y, q.width, q.height)
  }
  // edges across the run: the building's walls (less the wall clearance), the drawn section's edge
  const edges = (poly, keep) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      if (g.vert ? Math.abs(a.y - b.y) > EPS : Math.abs(a.x - b.x) > EPS) continue
      const at = g.vert ? a.y : a.x, c0 = g.vert ? Math.min(a.x, b.x) : Math.min(a.y, b.y), c1 = g.vert ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
      if (!across(c0, c1)) continue
      if (at >= g.r1 - EPS) room.hi = Math.min(room.hi, at - keep - g.r1)
      else if (at <= g.r0 + EPS) room.lo = Math.min(room.lo, g.r0 - at - keep)
    }
  }
  const fp = (objects || []).find(q => q.id === o.parentId && /^fp_/.test(q.type || ''))
  if (fp) edges(innerOutline(fp, gs), ((rackingSettings().wallClearIn ?? 3) / 12) * gs)
  const f = rackFootprint(o), cx = f.x + f.w / 2, cy = f.y + f.h / 2
  const sec = (objects || []).filter(isSection).map(polygonOf).find(p => pointInPolygon(p, cx, cy))
  if (sec) edges(sec, 0)
  return { lo: Math.max(0, room.lo), hi: Math.max(0, room.hi) }
}
