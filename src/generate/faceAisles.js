// faceAisles.js — the aisle in front of a pick face that has a ZONE or a WALL across it, not a rack.
//
// Rack-to-rack aisles are graded where the rows pair (rowAisles.js rowAisleGaps → rowAisleLevel). A face
// with an office, a washroom, a custom area or the building's wall in front of it had no grade at all: a
// washroom dropped below a pair, its facing half removed, then the bays put back by hand left a 9' 9" aisle
// that nothing flagged. Here every such face is measured and graded the same way:
//   - a pair has a face on both long sides; a single on the side that isn't its back — a side with a wall,
//     a zone or a rack within AISLE_MIN_FT (2') is its back, as rack-to-rack aisles treat two rows set back
//     to back. A pair has no back: a pair 1' from a zone has no aisle, so it is graded without that
//     exemption (aisleLevel); a single's face with rowAisleLevel;
//   - per bay, the clear width is to the nearest zone edge or wall face anywhere in front of that bay's own
//     run span (a zone covering part of the bay counts for it); runs of bays with the same obstacle form a
//     stretch, read at its narrowest;
//   - a face with a RACK nearest in front is the rack-to-rack aisle's business, not graded here.
// Only failing stretches come back (level 1 / 2). Read by Check layout (its aisle items), the aisle width
// labels on the canvas and in the PDF (faceAisleLabels), and through Check layout the Row group's warnings.
// Pure.

import { rackFootprint, aisleLevel, rowAisleLevel, AISLE_MIN_FT, MHE_PROFILES } from './columnCheck'
import { uprightXs } from '../render/rackOps'
import { innerOutline, floorSection } from '../utils/floorGeom'
import { fmtLenDown } from '../utils/copyChange'

const E = 1e-6
const BEAM = new Set(['rack_row', 'rack_double_row'])
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
const ZONE_NAME = { zone_office: 'Office', zone_staging: 'Staging', zone_washroom: 'Washroom', zone_custom: 'Custom area' }
/** How a zone reads in a message: its own name, else its kind. */
export const zoneName = (z) => (z.label && z.label.trim()) || ZONE_NAME[z.type] || 'Zone'

/** The failing aisles in front of faces with a zone or a wall across them: [{ rack, side ('lo' | 'hi' across),
 *  obstacle ({ kind: 'zone', zone } | { kind: 'wall' }), width (px, the stretch's narrowest), level (1 | 2),
 *  vert (the rows run along y), box (world px: the strip from the face to the obstacle, the stretch long) }]. */
export function faceObstacleGaps(objects, { gridSize = 40, profile = MHE_PROFILES.reach } = {}) {
  const racks = objects.filter(o => BEAM.has(o.type) && o.width > 0 && o.height > 0 && ((o.rotation || 0) % 90) === 0 && Array.isArray(o.beams))
  if (!racks.length) return []
  const zones = objects.filter(isZone)
  const polys = new Map()
  const polyOf = (r) => {
    const fp = objects.find(o => o.id === r.parentId && typeof o.type === 'string' && o.type.startsWith('fp_'))
    if (!fp) return null
    if (!polys.has(fp.id)) polys.set(fp.id, innerOutline(fp, gridSize))
    return polys.get(fp.id)
  }
  const aislePx = profile.aisleFt * gridSize, backPx = AISLE_MIN_FT * gridSize
  const look = aislePx + E                                          // past the pick width a face is fine
  const foots = new Map(racks.map(r => [r.id, rackFootprint(r)]))
  const out = []
  for (const r of racks) {
    const f = foots.get(r.id), vert = !!f.rotated
    const R = (q) => (vert ? [q.y, q.y + q.h] : [q.x, q.x + q.w]), S = (q) => (vert ? [q.x, q.x + q.w] : [q.y, q.y + q.h])
    const [s0, s1] = S(f), poly = polyOf(r)
    // the bays' run spans (world), in run order: each bay's local ends turned about the rack's centre
    const { xs, upW } = uprightXs(r, gridSize)
    const t = ((r.rotation || 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const runAt = (lx) => (vert ? cy + (lx - cx) * sin : cx + (lx - cx) * cos)
    const spans = []
    for (let i = 0; i + 1 < xs.length; i++) { const p = runAt(xs[i]), q = runAt(xs[i + 1] + upW); spans.push([Math.min(p, q), Math.max(p, q)]) }
    spans.sort((p, q) => p[0] - q[0])
    /** What stands nearest in front of `face` (across) over the run span [a, c], `dir` +1 / −1: { d, kind, zone }. */
    const nearest = (face, dir, a, c) => {
      let best = { d: Infinity, kind: null, zone: null }
      const take = (d, kind, zone = null) => { if (d > -E && d < best.d) best = { d: Math.max(0, d), kind, zone } }
      for (const z of zones) {
        const zb = { x: z.x, y: z.y, w: z.width, h: z.height }, [zr0, zr1] = R(zb), [zs0, zs1] = S(zb)
        if (!(Math.min(c, zr1) - Math.max(a, zr0) > E)) continue
        take(dir > 0 ? zs0 - face : face - zs1, 'zone', z)
      }
      for (const o of racks) {
        if (o.id === r.id) continue
        const g = foots.get(o.id); if (!!g.rotated !== vert) continue
        const [gr0, gr1] = R(g), [gs0, gs1] = S(g)
        if (!(Math.min(c, gr1) - Math.max(a, gr0) > E)) continue
        if (Math.min(s1, gs1) - Math.max(s0, gs0) > E) continue    // in line with it (a piece of the row), not in front
        take(dir > 0 ? gs0 - face : face - gs1, 'rack')
      }
      if (poly) for (const u of [a + 1, (a + c) / 2, c - 1]) {
        const far = face + dir * 1e6
        const iv = floorSection(poly, vert ? 'y' : 'x', u, Math.min(face, far), Math.max(face, far))
          .find(([p, q]) => (dir > 0 ? Math.abs(p - face) < 1 : Math.abs(q - face) < 1))
        if (iv) take(dir > 0 ? iv[1] - face : face - iv[0], 'wall')
      }
      return best
    }
    // per side: the bays' nearest obstacles
    const sides = { lo: spans.map(([a, c]) => nearest(s0, -1, a, c)), hi: spans.map(([a, c]) => nearest(s1, 1, a, c)) }
    // a single's back: the side with something within AISLE_MIN_FT over most of its bays — its face is the other
    const backed = (list) => list.filter(n => n.d <= backPx + E).length * 2 >= list.length
    let faces = ['lo', 'hi']
    if (r.type === 'rack_row') {
      if (backed(sides.lo) && !backed(sides.hi)) faces = ['hi']
      else if (backed(sides.hi) && !backed(sides.lo)) faces = ['lo']
      else continue                                                // open both sides (it picks from either) or boxed in: not this check's
    }
    for (const side of faces) {
      const list = sides[side]
      // stretches: consecutive bays with the same zone / wall in front, failing
      let i = 0
      while (i < list.length) {
        const n = list[i]
        if (!(n.kind === 'zone' || n.kind === 'wall') || !(n.d < look)) { i++; continue }
        let j = i
        const same = (m) => m.kind === n.kind && m.zone === n.zone && m.d < look
        while (j + 1 < list.length && same(list[j + 1])) j++
        const width = Math.min(...list.slice(i, j + 1).map(m => m.d))
        const level = r.type === 'rack_double_row' ? aisleLevel(width, profile, gridSize) : rowAisleLevel(width, profile, gridSize)
        if (level < 3) {
          const a = spans[i][0], c = spans[j][1], face = side === 'lo' ? s0 : s1, o0 = side === 'lo' ? face - width : face
          const box = vert ? { x: o0, y: a, w: width, h: c - a } : { x: a, y: o0, w: c - a, h: width }
          out.push({ rack: r, side, obstacle: n.kind === 'zone' ? { kind: 'zone', zone: n.zone } : { kind: 'wall' }, width, level, vert, box })
        }
        i = j + 1
      }
    }
  }
  return out
}

/** The aisle width labels for those stretches (aisleLabelOps' shape, as crossAisleLabels gives): the width
 *  across the gap, rounded DOWN to the inch, coloured by its grade. */
export function faceAisleLabels(objects, gridSize = 40, { profile = MHE_PROFILES.reach } = {}) {
  if (!profile) return []
  return faceObstacleGaps(objects, { gridSize, profile }).map(g => {
    const b = g.box, isHoriz = !g.vert                              // horizontal rows: the gap runs across in y
    const gapLo = isHoriz ? b.y : b.x, gapHi = isHoriz ? b.y + b.h : b.x + b.w
    const runLo = isHoriz ? b.x : b.y, runLen = isHoriz ? b.w : b.h
    return { isHoriz, gapLo, gapHi, labelMid: (gapLo + gapHi) / 2, positions: [runLo + runLen / 2], level: g.level, text: fmtLenDown(g.width, gridSize), rackId: g.rack.id }
  })
}
