// bayLedger.js — which bays of the layout's beam racks are counted, so an overlap never counts twice in
// the pallet / bay totals — however it happened (paste, drag, a Row group apply).
//
// A bay is the space between two of its rack's uprights, full depth. A bay more than half covered by a
// bay of another rack is NOT counted: the overlapped space holds one rack's worth, once. When two bays
// cover each other (a copy dropped exactly on top), the one placed first (earlier in the layout) counts.
// A single standing on one half of a pair's bay: the single's bay is fully covered (not counted), the
// pair's only half (counted) — that bay counts once. Overlaps of half a bay or less count both racks.
// Check layout still reports every overlap; this only keeps the counts honest.
//
// One ledger serves every count: the capacity headline and its breakdown (getLayoutCapacity), the usable
// figure (usableCapacity — a column's loss on a bay that isn't counted isn't taken off), Generate's and
// the fill's totals, the rack panel's own capacity — and a future BOM, which reads per rack which bays
// and frames count: a bay not counted contributes no beams; a frame counts when it bounds at least one
// counted bay of its rack (so a frame between a counted bay and an uncounted one counts once).
//
// Pure, and cached: computed again only when a rack changes (the racks' geometry key), never for a
// change elsewhere — and the panels hold their last ledger while a drag is in flight.

import { positionsPerBeam } from './capacity'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const EPS = 1e-6
const isBayRack = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && o.width > 0 && o.height > 0
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
/** As columnCheck.rackFootprint: a 90° rack is stored wide and drawn tall. */
function footprint(r) {
  if (norm(r.rotation) % 180 === 90) { const cx = r.x + r.width / 2, cy = r.y + r.height / 2; return { x: cx - r.height / 2, y: cy - r.width / 2, w: r.height, h: r.width, rotated: true } }
  return { x: r.x, y: r.y, w: r.width, h: r.height, rotated: false }
}
/** Each bay's world rect, in the rack's stored bay order (a 180° / 270° rack's bays run the other way). */
export function bayRects(r, gridSize = 40) {
  const f = footprint(r), up = ((r.uprightWidth || 3) / 12) * gridSize, rev = norm(r.rotation) >= 180
  const runBeams = rev ? [...r.beams].reverse() : r.beams
  const r0 = f.rotated ? f.y : f.x, out = []
  let at = r0
  for (const b of runBeams) {
    const len = up + (b / 12) * gridSize + up                                   // upright to upright, both frames
    out.push(f.rotated ? { x: f.x, y: at, w: f.w, h: len } : { x: at, y: f.y, w: len, h: f.h })
    at += up + (b / 12) * gridSize
  }
  return rev ? out.reverse() : out
}
const area = (a) => a.w * a.h
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/** Positions one bay holds: pallets on the beam × levels × faces (a pair has two). */
const bayPositions = (r, b) => positionsPerBeam(b, r.palletWIn || 40) * (r.levels || 1) * (r.type === 'rack_double_row' ? 2 : 1)

let cache = { objects: null, key: null, ledger: null }
const keyOf = (racks) => racks.map(r => [r.id, r.type, r.x, r.y, r.width, r.height, r.rotation || 0, r.beams.join('/'), r.levels, r.palletWIn, r.uprightWidth].join(',')).join(';')

/** The layout's bay ledger: { racks: Map(id → { counted: [bool per bay], positions, bays, uncounted,
 *  frames: [bool per frame, bays + 1] }), positions, bays, rackCount, uncountedBays, breakdown: { type →
 *  positions } } — beam racks only (other rack types have no bays; their capacity is counted as before). */
export function bayLedger(objects, gridSize = 40) {
  if (cache.objects === objects && cache.ledger) return cache.ledger
  const racks = objects.filter(isBayRack)
  const key = gridSize + '|' + keyOf(racks)
  if (cache.key === key && cache.ledger) { cache.objects = objects; return cache.ledger }
  const rects = racks.map(r => bayRects(r, gridSize)), feet = racks.map(footprint)
  const counted = racks.map(r => r.beams.map(() => true))
  for (let i = 0; i < racks.length; i++) {
    for (let j = 0; j < racks.length; j++) {
      if (i === j) continue
      const fi = feet[i], fj = feet[j]
      if (inter(fi, fj) <= EPS) continue
      rects[i].forEach((a, bi) => {
        if (!counted[i][bi]) return
        for (const b of rects[j]) {
          if (inter(a, b) <= area(a) / 2 + EPS) continue                          // half or less: both count
          // covered more than half by b — unless b is just as covered by a and a was placed first
          const mutual = inter(a, b) > area(b) / 2 + EPS
          if (mutual && i < j) continue
          counted[i][bi] = false
          return
        }
      })
    }
  }
  const ledger = { racks: new Map(), positions: 0, bays: 0, rackCount: 0, uncountedBays: 0, breakdown: {} }
  racks.forEach((r, i) => {
    const c = counted[i]
    const positions = r.beams.reduce((t, b, bi) => t + (c[bi] ? bayPositions(r, b) : 0), 0)
    const bays = c.filter(Boolean).length
    const frames = Array.from({ length: r.beams.length + 1 }, (_, k) => !!(c[k - 1] || c[k]))
    ledger.racks.set(r.id, { counted: c, positions, bays, uncounted: r.beams.length - bays, frames })
    ledger.positions += positions; ledger.bays += bays; ledger.uncountedBays += r.beams.length - bays
    if (bays) ledger.rackCount++
    ledger.breakdown[r.type] = (ledger.breakdown[r.type] || 0) + positions
  })
  cache = { objects, key, ledger }
  return ledger
}
