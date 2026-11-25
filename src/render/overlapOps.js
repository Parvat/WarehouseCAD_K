// overlapOps.js — (rack-fixes 1) the red marks of two racks overlapping, for every rack type: a red X on each pallet
// position of either rack the other one covers — the same mark, colour and width a beam rack's blocked position gets
// (render/labelOps.js blockedFaceOps, RED). Which racks overlap is rackIssues' rule (utils/bayBeam.js) — boxes overlapping,
// a shared end frame not an overlap — and Check layout lists each pair with the same words ("R1 overlaps …").
//
// Two beam racks overlapping are already marked position by position (generate/narrowAisles.js — a face with less than
// the pick width in front of it), so only a pair with at least one rack of another type is marked here: nothing changes on
// a layout of beam racks. A mezzanine is a platform: racks under it are allowed (rackIssues never counts it).
// Pure: ops in world px, drawn by the canvas (canvas2/Overlays.jsx, LabelOps) from the previewed objects — so the marks
// show while dragging and after the drop, and go the moment the overlap does.
import { rackDrawOps } from './rackOps'
import { rackIssues } from '../utils/bayBeam'
import { BEAM_TYPES } from '../utils/rackTypes'
import { rackFootprint } from '../generate/rackFootprint'

export const OVERLAP_RED = '#C0392B'
const MIN_MARK_PX = 6
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0

/** Every overlapping pair with at least one rack that is not a beam rack: [[a, b]] (a the non-beam one). */
export function rackOverlapPairs(objects, gridSize = 40) {
  const out = [], seen = new Set()
  for (const r of objects || []) {
    if (!isRack(r) || BEAM_TYPES.has(r.type)) continue
    for (const id of rackIssues(r, objects, gridSize).overlaps) {
      const k = [r.id, id].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      const o = objects.find(q => q.id === id)
      if (o) out.push([r, o])
    }
  }
  return out
}

/** local (unrotated) point -> world, turning about the rack's centre (as the rack is drawn). */
const turner = (obj) => {
  const a = ((obj.rotation || 0) * Math.PI) / 180
  if (!a) return (x, y) => [x, y]
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2, c = Math.cos(a), s = Math.sin(a)
  return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
const meets = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01

/** The positions of rack `r` that rack `other` covers, as world boxes { x, y, w, h }: each pallet slot r draws (its
 *  `slots` ops) whose world box meets other's footprint; a rack drawn with no slots — the overlap area itself. */
export function coveredPositions(r, other, gridSize = 40) {
  const T = turner(r), fo = rackFootprint(other), box = { x: fo.x, y: fo.y, w: fo.w, h: fo.h }
  const slots = (rackDrawOps(r, { gridSize }) || []).filter(o => o.op === 'slots').flatMap(o => o.rects)
  const out = []
  for (const q of slots) {
    const pts = [T(q.x, q.y), T(q.x + q.w, q.y), T(q.x + q.w, q.y + q.h), T(q.x, q.y + q.h)]
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    const w = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    if (meets(w, box)) out.push(w)
  }
  if (slots.length) return out
  const fr = rackFootprint(r), x0 = Math.max(fr.x, fo.x), y0 = Math.max(fr.y, fo.y)
  const ov = { x: x0, y: y0, w: Math.min(fr.x + fr.w, fo.x + fo.w) - x0, h: Math.min(fr.y + fr.h, fo.y + fo.h) - y0 }
  return ov.w > 0 && ov.h > 0 ? [ov] : []
}

/** The red X marks: [{ rackId, x, y, w, h }] — each position of either rack of a pair the other covers. */
export function overlapMarks(objects, gridSize = 40) {
  const out = []
  for (const [a, b] of rackOverlapPairs(objects, gridSize)) {
    for (const [r, o] of [[a, b], [b, a]]) for (const q of coveredPositions(r, o, gridSize)) out.push({ rackId: r.id, ...q })
  }
  return out
}

/** The marks as line ops (world px), each X `2 / lz` wide and never under MIN_MARK_PX / lz — blockedFaceOps' style. */
export function overlapOps(marks, lz = 1) {
  const sw = 2 / lz, min = MIN_MARK_PX / lz, out = []
  for (const m of marks) {
    const w = Math.max(m.w, min), h = Math.max(m.h, min), x = m.x + m.w / 2 - w / 2, y = m.y + m.h / 2 - h / 2
    out.push({ op: 'line', points: [x, y, x + w, y + h], stroke: OVERLAP_RED, strokeWidth: sw },
      { op: 'line', points: [x + w, y, x, y + h], stroke: OVERLAP_RED, strokeWidth: sw })
  }
  return out
}
