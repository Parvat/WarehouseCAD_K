// rackDepth.js — a beam rack's frame depth changed (the elevation editor's Depth field; the Row group's replay of it).
//
// The depth is the rack's own (rack.depthIn): a single row's box is one depth across, a back-to-back pair's two depths
// and the flue. Changing it (rackDepthAt — Properties, the Row group, the Elevations tab's "Set these rows to N in"):
// a rack against a wall keeps its wall face, so its wall clearance, and grows away from the wall; any other keeps its
// centre line, so a pair keeps its flue where it was and grows outward, the aisles on both sides giving or taking the
// same. The aisles are re-paired after the edit (aisleKeeper), the counts follow. Pure.

import { innerOutline } from './floorGeom'
import { wallLineFor, wallReachFt } from '../generate/wallRun'

const BEAM = new Set(['rack_row', 'rack_double_row'])

/** The update that gives beam rack `r` frame depth `depthIn` (inches) — { depthIn, height, y } (the box re-sized across
 *  about its centre; a turned rack turns about its centre too, so the same y shift holds) — or null when it is not a
 *  beam rack, the depth isn't a length, or nothing changes. */
export function rackDepthUpdate(r, depthIn, gridSize = 40) {
  if (!r || !BEAM.has(r.type) || !(depthIn > 0)) return null
  const d = Math.round(depthIn * 1000) / 1000
  if ((r.depthIn ?? 42) === d) return null
  const acrossIn = r.type === 'rack_double_row' ? 2 * d + (r.flueSpaceIn ?? 9) : d
  const height = (acrossIn / 12) * gridSize
  return { depthIn: d, height, y: r.y + (r.height - height) / 2 }
}

/* ── against a wall: the wall face stays (its clearance kept), the rack grows away from the wall ──────────────────── */


const isFp = (o) => typeof o?.type === 'string' && o.type.startsWith('fp_')
const rotOf = (r) => ((((r.rotation || 0) % 360) + 360) % 360) * Math.PI / 180
/** (vx, vy) turned like the canvas turns a rack about its centre. */
const turn = (r, vx, vy) => { const t = rotOf(r), c = Math.cos(t), s = Math.sin(t); return { x: vx * c - vy * s, y: vx * s + vy * c } }
/** Which long face of beam rack `r` is on a wall of its building → -1 (its local top), +1 (its local bottom), 0
 *  (neither — or both, a rack spanning a narrow building). Fill's and Generate's own rule (generate/wallRun.js
 *  wallLineFor): the face stops short of a wall — an inner wall edge parallel to it and overlapping it along the run —
 *  by no more than the rack's depth (wallReachFt: 3 ft 6 in for a 42" frame). */
export function wallSideOf(r, objects, gridSize = 40) {
  if (!r || !BEAM.has(r.type)) return 0
  const fp = (objects || []).find(o => o.id === r.parentId && isFp(o)) || (objects || []).find(isFp)
  if (!fp) return 0
  const poly = innerOutline(fp, gridSize), reach = wallReachFt(r.depthIn ?? 42) * gridSize
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 }, u = turn(r, 1, 0)
  const near = (s) => {
    const n = turn(r, 0, s), m = { x: c.x + n.x * r.height / 2, y: c.y + n.y * r.height / 2 }
    const r0 = (m.x - c.x) * u.x + (m.y - c.y) * u.y - r.width / 2, r1 = r0 + r.width
    // the wall lines beyond this face, as positions along its outward normal: inner wall edges parallel to it that
    // overlap it along the run; then the one on-wall rule
    const lines = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey)
      if (!len || Math.abs(ex * u.y - ey * u.x) / len > 1e-3) continue                       // not parallel to the face
      const pa = (a.x - c.x) * u.x + (a.y - c.y) * u.y, pb = (b.x - c.x) * u.x + (b.y - c.y) * u.y
      if (Math.min(r1, Math.max(pa, pb)) - Math.max(r0, Math.min(pa, pb)) > 1e-6) lines.push(a.x * n.x + a.y * n.y)
    }
    return wallLineFor(m.x * n.x + m.y * n.y, lines, +1, reach) != null
  }
  const top = near(-1), bottom = near(1)
  return top === bottom ? 0 : top ? -1 : 1
}

/** The depth change — the ONE used by Properties (one rack, several racks), the Row group's replay and the Elevations
 *  tab's "Set these rows to N in": beam rack `r` given frame depth `depthIn`. A rack against a wall keeps its wall face
 *  (the wall clearance kept) and grows away from the wall; any other — a back-to-back pair in the open included — keeps
 *  its centre line (a pair's flue where it was, both halves growing outward). → { depthIn, height, x, y } or null. */
export function rackDepthAt(r, depthIn, objects, gridSize = 40) {
  const u = rackDepthUpdate(r, depthIn, gridSize)
  if (!u) return null
  const side = wallSideOf(r, objects, gridSize)
  if (!side) return { ...u, x: r.x }
  // the wall face fixed: the centre moves away from it by half the change, along the rack's turned depth axis
  const dh = u.height - r.height, shift = turn(r, 0, -side * dh / 2)
  const cx = r.x + r.width / 2 + shift.x, cy = r.y + r.height / 2 + shift.y
  return { depthIn: u.depthIn, height: u.height, x: cx - r.width / 2, y: cy - u.height / 2 }
}
