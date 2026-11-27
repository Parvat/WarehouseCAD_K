// coverLost.js — (rack-round2 7) pallet positions lost to what covers them or blocks their face, for every rack type:
//   - a zone over a rack (one kept with "Keep" — a zone no longer removes the racks under it on its own): each covered
//     pallet slot;
//   - two racks overlapping where one is not a beam rack (render/overlapOps.js — the red X marks): each covered slot of
//     both (two beam racks overlapping are the narrow-aisle check's already: generate/narrowAisles.js);
//   - a short face of a rack that is not a beam rack (generate/laneFaces.js — red on the face): its positions, as a beam
//     rack's face with less than the pick width loses them — a drive-in, a push-back, a shelving unit: all (one face);
//     a pallet flow: all (it is loaded at one face, picked at the other); a drive-through: all only when both its ends
//     are short (one end open, it still works, last in first out); a cantilever: the short side's arms (half, double-
//     sided).
// A slot's positions: the rack's positions (utils/capacity.js getRackCapacity, its levels) over its slots — the same
// count the card and the BOM show. Each rack loses at most what it has. Pure.
import { rackDrawOps, markBoxes } from '../render/rackOps'
import { overlapMarks } from '../render/overlapOps'
import { laneFaceGaps } from './laneFaces'
import { getRackCapacity } from '../utils/capacity'
import { levelsResolver } from '../utils/elevations'
import { MHE_PROFILES, rackFootprint } from './columnCheck'

const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0 && o.type !== 'rack_mezzanine'
const isZone = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
const meets = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5
const turner = (obj) => {
  const a = ((obj.rotation || 0) * Math.PI) / 180
  if (!a) return (x, y) => [x, y]
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2, c = Math.cos(a), s = Math.sin(a)
  return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
/** Local boxes `rects` of rack `r`, as world boxes (turned as it is drawn). */
function worldBoxes(r, rects) {
  const T = turner(r), out = []
  for (const q of rects) {
    const p = [T(q.x, q.y), T(q.x + q.w, q.y), T(q.x + q.w, q.y + q.h), T(q.x, q.y + q.h)], xs = p.map(v => v[0]), ys = p.map(v => v[1])
    out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
  }
  return out
}
/** A rack's pallet slots, world boxes (its drawing's `slots` ops, turned as it is drawn). */
export function slotBoxes(r, gridSize = 40) {
  const T = turner(r), out = []
  for (const o of rackDrawOps(r, { gridSize }) || []) if (o.op === 'slots') for (const q of o.rects) {
    const p = [T(q.x, q.y), T(q.x + q.w, q.y), T(q.x + q.w, q.y + q.h), T(q.x, q.y + q.h)], xs = p.map(v => v[0]), ys = p.map(v => v[1])
    out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
  }
  return out
}

/** → { total, byRack: Map(id → n), list: [{ rackId, n, reason: 'zone' | 'overlap' | 'face' }] } */
export function coverLost(objects, { gridSize = 40, profile = MHE_PROFILES.reach, elevations = null, walkwayIn = 44 } = {}) {
  const out = { total: 0, byRack: new Map(), list: [] }
  if (!Array.isArray(objects)) return out
  const racks = objects.filter(isRack)
  if (!racks.length) return out
  const zones = objects.filter(isZone), levelsAt = levelsResolver(elevations)
  const marks = overlapMarks(objects, gridSize)
  const faces = profile ? laneFaceGaps(objects, { gridSize, profile, walkwayIn }) : []
  if (!zones.length && !marks.length && !faces.length) return out
  const touched = new Set([...marks.map(m => m.rackId), ...faces.map(g => g.rackId)])
  for (const r of racks) {
    // (perf — Fill and Generate call this per candidate) only a rack something covers or blocks is drawn out
    if (!touched.has(r.id)) { const f = rackFootprint(r), fb = { x: f.x, y: f.y, w: f.w, h: f.h }; if (!zones.some(z => meets(fb, { x: z.x, y: z.y, w: z.width, h: z.height }))) continue }
    const total = getRackCapacity(r, undefined, levelsAt)?.total || 0
    if (!total) continue
    const slots = slotBoxes(r, gridSize), per = slots.length ? total / slots.length : 0
    const byZone = new Set(), byRack = new Set()
    slots.forEach((q, i) => { if (zones.some(z => meets(q, { x: z.x, y: z.y, w: z.width, h: z.height }))) byZone.add(i) })
    const mine = marks.filter(m => m.rackId === r.id)
    if (mine.length) slots.forEach((q, i) => { if (!byZone.has(i) && mine.some(m => meets(q, m))) byRack.add(i) })
    // a short face
    const short = faces.filter(g => g.rackId === r.id).map(g => g.side)
    let faceShare = 0
    if (short.length) {
      if (r.type === 'rack_drive_through') faceShare = short.length >= 2 ? 1 : 0
      else if (r.type === 'rack_cantilever' && (r.doubleSided ?? true)) faceShare = short.length >= 2 ? 1 : 0.5
      // (rack-round3) a shelving unit picked from both sides: lost only when both are short (one open still picks)
      else if (r.type === 'rack_shelving' && faces.find(g => g.rackId === r.id)?.nSides === 2) faceShare = short.length >= 2 ? 1 : 0
      else faceShare = 1
    }
    const zoneN = Math.round(byZone.size * per), rackN = Math.round(byRack.size * per)
    const faceN = Math.round(Math.max(0, total * faceShare - zoneN - rackN))
    const n = Math.min(total, zoneN + rackN + faceN)
    if (!n) continue
    out.total += n
    out.byRack.set(r.id, n)
    if (zoneN) out.list.push({ rackId: r.id, n: Math.min(zoneN, n), reason: 'zone' })
    if (rackN) out.list.push({ rackId: r.id, n: Math.min(rackN, n - Math.min(zoneN, n)), reason: 'overlap' })
    if (faceN && n - zoneN - rackN > 0) out.list.push({ rackId: r.id, n: n - Math.min(n, zoneN + rackN), reason: 'face' })
  }
  return out
}

/** (rack-round3 4) The positions a short face takes off, as world boxes [{ rackId, x, y, w, h }] — the slots to mark with
 *  the overlap's red X (render/overlapOps.js overlapOps), in place of a red line on the face: coverLost's face share
 *  (all of a drive-in, a push-back, a pallet flow, a shelving unit; a drive-through only with both ends short; a double-
 *  sided cantilever the short side's half), less the slots a zone or an overlap marks already. A short face that loses
 *  nothing (a drive-through with one end open) has no marks — its chip alone is red. `faces`: laneFaceGaps' (optional). */
export function faceLostMarks(objects, { gridSize = 40, profile = MHE_PROFILES.reach, walkwayIn = 44, faces = null } = {}) {
  const out = []
  if (!Array.isArray(objects) || !profile) return out
  const gaps = faces || laneFaceGaps(objects, { gridSize, profile, walkwayIn })
  if (!gaps.length) return out
  const by = new Map()
  for (const g of gaps) { if (!by.has(g.rackId)) by.set(g.rackId, []); by.get(g.rackId).push(g) }
  const zones = objects.filter(isZone)
  let marks = null
  for (const [id, gs] of by) {
    const r = gs[0].rack
    if (!isRack(r)) continue
    // (r7-shelving) a back-to-back shelving pair: each short front loses its own run's units (as a double cantilever's side)
    const dbl = (r.type === 'rack_cantilever' && (r.doubleSided ?? true)) || (r.type === 'rack_shelving' && !!r.backToBack)
    if ((r.type === 'rack_drive_through' || (r.type === 'rack_shelving' && !r.backToBack && gs[0].nSides === 2)) && gs.length < 2) continue
    // (rack-xmarks) one X per lost position box: a shelving unit, a cantilever arm bay, a pallet slot (markBoxes, turned
    // as drawn — was: a cantilever's whole reach, a turned shelving run's whole footprint)
    const slots = worldBoxes(r, markBoxes(r, gridSize))
    if (!slots.length) continue
    marks = marks || overlapMarks(objects, gridSize)
    const mine = marks.filter(m => m.rackId === id)
    const f = rackFootprint(r), cx = f.x + f.w / 2, cy = f.y + f.h / 2
    // a double-sided cantilever with one side short: the slots on that side of its spine
    const side = dbl && gs.length < 2 ? gs[0] : null
    for (const q of slots) {
      if (zones.some(z => meets(q, { x: z.x, y: z.y, w: z.width, h: z.height })) || mine.some(m => meets(q, m))) continue
      if (side) {
        const qc = side.isHoriz ? q.y + q.h / 2 : q.x + q.w / 2, mid = side.isHoriz ? cy : cx, at = side.isHoriz ? side.face.y1 : side.face.x1
        if (Math.sign(qc - mid) !== Math.sign(at - mid)) continue
      }
      out.push({ rackId: id, x: q.x, y: q.y, w: q.w, h: q.h })
    }
  }
  return out
}
