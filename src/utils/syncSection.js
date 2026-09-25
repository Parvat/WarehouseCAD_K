// syncSection.js — "Sync section": every other row in the selected row's
// section copies its BAY PATTERN (beam lengths, in order along the run) and
// its START POSITION along the run, so every upright lines up across the
// aisles. Positions across the aisles, depth, levels and everything else
// stay as they are. Pure: the right panel commits the result as one undo.
//
// A section = the beam-rack rows between the same two cross-aisles (or a
// wall and a cross-aisle): same building, same run direction (horizontal /
// vertical), and a run extent that overlaps the source row's.
//
// Warnings never block: a synced row that would overlap another rack, pass
// the building's inner wall, or come closer to a rack across a cross-aisle
// than the source row does is listed.

import { rackFootprint } from '../generate/columnCheck'
import { rackLengthIn, changeIssues } from './bayBeam'

const BEAM_RACKS = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6

const rightAngle = (o) => ((((o.rotation || 0) % 90) + 90) % 90) === 0
/** +1 when the rack's local x (bay 0 -> last bay) runs along +X / +Y, -1 when reversed. */
const runSign = (o) => { const r = (((o.rotation || 0) % 360) + 360) % 360; return r === 180 || r === 270 ? -1 : 1 }
const runOf = (f) => (f.rotated ? [f.y, f.y + f.h] : [f.x, f.x + f.w])
const crossOf = (f) => (f.rotated ? [f.x, f.x + f.w] : [f.y, f.y + f.h])

/** The rows in `sourceId`'s section, the source included, in stack order. */
export function sectionRows(objects, sourceId) {
  const src = objects.find(o => o.id === sourceId)
  if (!src || !BEAM_RACKS.has(src.type) || !Array.isArray(src.beams) || !rightAngle(src)) return []
  const sf = rackFootprint(src), [a, b] = runOf(sf)
  return objects
    .filter(o => BEAM_RACKS.has(o.type) && Array.isArray(o.beams) && rightAngle(o) && (o.parentId || null) === (src.parentId || null))
    .filter(o => { const f = rackFootprint(o); if (f.rotated !== sf.rotated) return false; const [c, d] = runOf(f); return c < b - EPS && d > a + EPS })
    .sort((p, q) => crossOf(rackFootprint(p))[0] - crossOf(rackFootprint(q))[0])
}

/** The sync as Map(id -> { beams, uprightWidth, width, x, y }) for every
 *  other row in the section. Beams are copied in WORLD order along the run,
 *  so a row drawn the other way round (180° / 270°) gets them reversed and
 *  its uprights still land on the source's. */
export function planSectionSync(objects, sourceId, gridSize = 40) {
  const rows = sectionRows(objects, sourceId)
  const src = rows.find(o => o.id === sourceId)
  const updates = new Map()
  if (!src) return updates
  const sf = rackFootprint(src)
  const runMin = runOf(sf)[0]
  const upIn = src.uprightWidth || 3
  const worldBeams = runSign(src) > 0 ? [...src.beams] : [...src.beams].reverse()
  for (const t of rows) {
    if (t.id === sourceId) continue
    const beams = runSign(t) > 0 ? [...worldBeams] : [...worldBeams].reverse()
    const width = (rackLengthIn(beams, upIn) / 12) * gridSize
    const tf = rackFootprint(t)
    const [c0, c1] = crossOf(tf)
    const crossMid = (c0 + c1) / 2, runMid = runMin + width / 2
    const cx = tf.rotated ? crossMid : runMid, cy = tf.rotated ? runMid : crossMid
    const clean = (v) => (Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-9 ? Math.round(v * 1e6) / 1e6 : v)
    updates.set(t.id, { beams, uprightWidth: upIn, width, x: clean(cx - width / 2), y: clean(cy - t.height / 2) })
  }
  return updates
}

/** Nearest gap along the run from [a, b] to racks on the same line (their
 *  cross range overlaps) outside the section, ahead and behind. */
function lineGaps(objects, f, sectionIds) {
  const [a, b] = runOf(f), [c, d] = crossOf(f)
  let ahead = Infinity, behind = Infinity
  for (const o of objects) {
    if (sectionIds.has(o.id) || typeof o.type !== 'string' || !o.type.startsWith('rack_') || !rightAngle(o)) continue
    const g = rackFootprint(o)
    if (g.rotated !== f.rotated) continue
    const [gc, gd] = crossOf(g)
    if (!(gc < d - EPS && gd > c + EPS)) continue
    const [ga, gb] = runOf(g)
    if (ga >= b - EPS) ahead = Math.min(ahead, ga - b)
    if (gb <= a + EPS) behind = Math.min(behind, a - gb)
  }
  return { ahead, behind }
}

/** Rows the sync would put in trouble: [{ id, row, overlaps, wallOutIn,
 *  crossAisleFt }]. `row` = 1-based position in the section's stack order.
 *  crossAisleFt = the narrowed gap (ft) to a rack across a cross-aisle, when
 *  it's less than the source row's own gap on that side. */
export function syncWarnings(objects, sourceId, updates, gridSize = 40) {
  const rows = sectionRows(objects, sourceId)
  const ids = new Set(rows.map(r => r.id))
  const src = rows.find(r => r.id === sourceId)
  if (!src) return []
  const { byId } = changeIssues(objects, updates, gridSize)
  const srcGap = lineGaps(objects, rackFootprint(src), ids)
  const out = []
  rows.forEach((r, i) => {
    if (!updates.has(r.id)) return
    const next = { ...r, ...updates.get(r.id) }
    const iss = byId.get(r.id) || { overlaps: [], wallOutIn: 0 }
    const gap = lineGaps(objects, rackFootprint(next), ids)
    let crossAisleFt = null
    for (const side of ['ahead', 'behind']) {
      if (Number.isFinite(srcGap[side]) && gap[side] < srcGap[side] - EPS && gap[side] >= 0) {
        const ft = Math.round((gap[side] / gridSize) * 100) / 100
        crossAisleFt = crossAisleFt == null ? ft : Math.min(crossAisleFt, ft)
      }
    }
    if (iss.overlaps.length || iss.wallOutIn > 0 || crossAisleFt != null) {
      out.push({ id: r.id, row: i + 1, overlaps: iss.overlaps, wallOutIn: iss.wallOutIn, crossAisleFt })
    }
  })
  return out
}
