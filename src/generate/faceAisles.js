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
// Only failing stretches come back (level 1 / 2). Read by the aisle width labels on the canvas and in the PDF
// (faceAisleLabels) and by narrowAisles.js: every bay of such a face loses its positions (X marks, off usable).
// Pure.

import { rackFootprint, aisleLevel, rowAisleLevel, AISLE_MIN_FT, MHE_PROFILES, underTravel } from './columnCheck'
import { uprightXs } from '../render/rackOps'
import { innerOutline, floorSection } from '../utils/floorGeom'
import { fmtLenDown } from '../utils/copyChange'
import { positionFootprintIn, positionsPerBeam } from '../utils/capacity'

const E = 1e-6
const BEAM = new Set(['rack_row', 'rack_double_row'])
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
const ZONE_NAME = { zone_office: 'Office', zone_staging: 'Staging', zone_washroom: 'Washroom', zone_custom: 'Custom area' }
/** How a zone reads in a message: its own name, else its kind. */
export const zoneName = (z) => (z.label && z.label.trim()) || ZONE_NAME[z.type] || 'Zone'

/** A right-angled rack's bays as world run spans, in run order: [{ a, c, i }] — `i` the rack's own bay index. */
export function bayRunSpans(r, gridSize = 40) {
  const f = rackFootprint(r), vert = !!f.rotated
  const { xs, upW } = uprightXs(r, gridSize)
  const t = ((r.rotation || 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const runAt = (lx) => (vert ? cy + (lx - cx) * sin : cx + (lx - cx) * cos)
  const spans = []
  for (let i = 0; i + 1 < xs.length; i++) { const p = runAt(xs[i]), q = runAt(xs[i + 1] + upW); spans.push({ a: Math.min(p, q), c: Math.max(p, q), i }) }
  return spans.sort((p, q) => p.a - q.a)
}

/** A right-angled rack's pallet positions as world run spans: Map(bay → [{ p, a, c }]) — each position's own slot (the
 *  slots the capacity count uses, capacity.js positionFootprintIn), turned about the rack's centre as its bays are. */
export function positionRunSpans(r, gridSize = 40) {
  const f = rackFootprint(r), vert = !!f.rotated
  const { xs, upW, beams } = uprightXs(r, gridSize)
  const t = ((r.rotation || 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const runAt = (lx) => (vert ? cy + (lx - cx) * sin : cx + (lx - cx) * cos)
  const px = (inches) => (inches / 12) * gridSize, palletWIn = r.palletWIn || 40
  const out = new Map()
  beams.forEach((beamIn, bay) => {
    const list = []
    for (let p = 0; p < positionsPerBeam(beamIn, palletWIn); p++) {
      const fpIn = positionFootprintIn(beamIn, palletWIn, p)
      if (!fpIn) continue
      const u = runAt(xs[bay] + upW + px(fpIn.startIn)), v = runAt(xs[bay] + upW + px(fpIn.endIn))
      list.push({ p, a: Math.min(u, v), c: Math.max(u, v) })
    }
    out.set(bay, list)
  })
  return out
}

/** The face index (capacity.js / the X marks: 0 the rack's local top side, 1 its bottom) of a pair's face on its
 *  world side `side` ('lo' | 'hi' across its rows); a single has one face, 0. */
export function faceIndex(r, side) {
  if (r.type !== 'rack_double_row') return 0
  const t = ((r.rotation || 0) * Math.PI) / 180, vert = !!rackFootprint(r).rotated
  // the local top side's outward normal, turned: (sin t, −cos t); 'lo' is −x (vertical rows) or −y
  const topFacesLo = vert ? Math.sin(t) < 0 : Math.cos(t) > 0
  return (side === 'lo') === topFacesLo ? 0 : 1
}

/** The failing aisles in front of faces with a zone or a wall across them: [{ rack, side ('lo' | 'hi' across), face (faceIndex), bays (its own bay indices), slots ({ bay: [positions with the obstacle in front of their own slot] }),
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
    // the bays' run spans (world), in run order, with their own bay index
    const bays = bayRunSpans(r, gridSize), spans = bays.map(b => [b.a, b.c])
    let slotCache = null
    const slotsOf = () => slotCache || (slotCache = positionRunSpans(r, gridSize))
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
          // each position judged on its own slot: blocked only where a zone or the wall stands in front of THAT slot,
          // within the pick width (a bay only partly in front of the zone keeps the positions with open floor)
          const slotsAll = slotsOf(), dir = side === 'lo' ? -1 : 1, slots = {}
          for (const b of bays.slice(i, j + 1)) {
            const ps = (slotsAll.get(b.i) || []).filter(q => { const m = nearest(face, dir, q.a, q.c); return (m.kind === 'zone' || m.kind === 'wall') && m.d < aislePx - 1e-6 }).map(q => q.p)
            if (ps.length) slots[b.i] = ps
          }
          out.push({ rack: r, side, obstacle: n.kind === 'zone' ? { kind: 'zone', zone: n.zone } : { kind: 'wall' }, width, level, vert, box, bays: bays.slice(i, j + 1).map(b => b.i), face: faceIndex(r, side), slots })
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

/** Columns standing in the aisle in front of a rack face with a ZONE or the WALL across it, not a rack — the
 *  clearance labels' other half (aisleColumnBlocks has the rack-to-rack aisles): one block per column, in
 *  aisleColumnBlocks' own shape (axis, gapStart / gapEnd, near / far clear, short flags), so the same arrows
 *  and pills draw it, measured from the column to the rack face on one side and to the zone edge or the
 *  wall's inner face on the other. A column already in a rack-to-rack aisle (`skip`: its column indices) is
 *  that aisle's. Drawing only — capacity, usable and Check layout read none of it. `columns`: the layout's
 *  column squares (layoutColumns), the indices the blocks carry. */
export function columnFaceBlocks(objects, columns, { gridSize = 40, profile = MHE_PROFILES.reach, skip = null } = {}) {
  if (!columns || !columns.length) return []
  const racks = objects.filter(o => o && typeof o.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0 && ((o.rotation || 0) % 90) === 0)
  if (!racks.length) return []
  const zones = objects.filter(isZone)
  const polys = new Map()
  const polyOf = (r) => {
    const fp = objects.find(o => o.id === r.parentId && typeof o.type === 'string' && o.type.startsWith('fp_'))
    if (!fp) return null
    if (!polys.has(fp.id)) polys.set(fp.id, innerOutline(fp, gridSize))
    return polys.get(fp.id)
  }
  const reach = 2 * profile.aisleFt * gridSize                      // past this in front of a face it is open floor, not an aisle
  const travelPx = (profile.travelFt ?? 8) * gridSize
  const foots = new Map(racks.map(r => [r.id, rackFootprint(r)]))
  const out = []
  columns.forEach((col, ci) => {
    if (skip && skip.has(ci)) return
    let best = null
    for (const r of racks) {
      const f = foots.get(r.id), vert = !!f.rotated
      const R = (q) => (vert ? [q.y, q.y + q.h] : [q.x, q.x + q.w]), S = (q) => (vert ? [q.x, q.x + q.w] : [q.y, q.y + q.h])
      const [fr0, fr1] = R(f), [s0, s1] = S(f), [cr0, cr1] = R(col), [cs0, cs1] = S(col)
      if (!(Math.min(fr1, cr1) - Math.max(fr0, cr0) > E)) continue   // not in front of this face's run
      let face, dir, toCol
      if (cs0 >= s1 - E) { face = s1; dir = 1; toCol = cs0 - s1 } else if (cs1 <= s0 + E) { face = s0; dir = -1; toCol = s0 - cs1 } else continue
      if (best && toCol >= best.toCol) continue
      // what stands nearest in front of the face, over the column's own run span
      let d = Infinity, kind = null, zone = null
      const take = (v, k, z = null) => { if (v > -E && v < d) { d = Math.max(0, v); kind = k; zone = z } }
      for (const z of zones) {
        const zb = { x: z.x, y: z.y, w: z.width, h: z.height }, [zr0, zr1] = R(zb), [zs0, zs1] = S(zb)
        if (!(Math.min(cr1, zr1) - Math.max(cr0, zr0) > E)) continue
        take(dir > 0 ? zs0 - face : face - zs1, 'zone', z)
      }
      for (const o of racks) {
        if (o.id === r.id) continue
        const g = foots.get(o.id), [gr0, gr1] = R(g), [gs0, gs1] = S(g)
        if (!(Math.min(cr1, gr1) - Math.max(cr0, gr0) > E)) continue
        if (Math.min(s1, gs1) - Math.max(s0, gs0) > E) continue      // in line with it, not in front
        take(dir > 0 ? gs0 - face : face - gs1, 'rack')
      }
      const poly = polyOf(r)
      if (poly) for (const u of [cr0, (cr0 + cr1) / 2, cr1]) {
        const far = face + dir * 1e6
        const iv = floorSection(poly, vert ? 'y' : 'x', u, Math.min(face, far), Math.max(face, far))
          .find(([p, q]) => (dir > 0 ? Math.abs(p - face) < 1 : Math.abs(q - face) < 1))
        if (iv) take(dir > 0 ? iv[1] - face : face - iv[0], 'wall')
      }
      if (kind !== 'zone' && kind !== 'wall') continue                // a rack across: the rack-to-rack aisle's
      if (d > reach + E || toCol + (cs1 - cs0) > d + E) continue       // open floor, or the column is past the obstacle
      best = { r, vert, face, dir, d, kind, zone, toCol, fr0, fr1 }
    }
    if (!best) return
    const { vert, face, dir, d, kind, zone, fr0, fr1 } = best
    const gapStart = Math.min(face, face + dir * d), gapEnd = Math.max(face, face + dir * d)
    const colNear = vert ? col.x : col.y, colFar = vert ? col.x + col.w : col.y + col.h
    const nearClear = colNear - gapStart, farClear = gapEnd - colFar
    const clearPx = Math.max(nearClear, farClear)
    out.push({
      kind: 'face', toward: kind, zoneId: zone ? zone.id : null, betweenRows: [best.r.id], columnIndex: ci,
      aisleFt: +(d / gridSize).toFixed(1), clearFt: +(clearPx / gridSize).toFixed(1),
      level: aisleLevel(clearPx, profile, gridSize), blocked: false,
      nearClearFt: +(nearClear / gridSize).toFixed(1), farClearFt: +(farClear / gridSize).toFixed(1),
      nearShort: underTravel(nearClear, travelPx, gridSize), farShort: underTravel(farClear, travelPx, gridSize),
      pinched: underTravel(clearPx, travelPx, gridSize),
      axis: vert ? 'x' : 'y', gapStart, gapEnd, crossStart: fr0, crossEnd: fr1,
    })
  })
  return out
}
