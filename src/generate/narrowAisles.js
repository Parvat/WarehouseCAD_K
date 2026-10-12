// narrowAisles.js — a pick face with less than the pick width in front of it loses its positions.
//
// Under the forklift's pick width (rowAisleLevel / aisleLevel: level 2, and under the drive width, level 1) a face
// can't be picked from. Every bay of such a face gets the X mark a column's pick-zone block gets (render/labelOps
// blockedFaceOps), and its positions come off usable (usableCapacity.js). Two sources, one rule:
//   - a rack-to-rack aisle (rowAisles.js rowAisleGaps, the pairs the aisle labels show): both faces, over the run the
//     two rows share; a gap of AISLE_MIN_FT or less is racks set back to back, not an aisle — nothing lost;
//   - a face with a zone or the wall nearest in front (faceAisles.js faceObstacleGaps): that face's stretch.
// The width labels stay amber / red (they read the same grades). Check layout no longer lists these as warnings: a
// rack-to-rack aisle under the drive width stays an ERROR there (a truck can't drive it); faces against a zone or a
// wall are not listed at all. Positions a column already blocks (`already`: "rack:bay:face:position") count once.
// Returns blocks in the column check's pick-block shape: [{ rackId, bayIndex, faces: [face], positionIndices,
// positionsLost, level, kind: 'narrow-aisle' }]. Pure.

import { rackFootprint, rowAisleLevel, MHE_PROFILES } from './columnCheck'
import { rowAisleGaps } from './rowAisles'
import { faceObstacleGaps, bayRunSpans, faceIndex } from './faceAisles'
import { positionsPerBeam } from '../utils/palletFit'

const E = 1e-6
const BEAM = new Set(['rack_row', 'rack_double_row'])

export function narrowAisleBlocks(objects, { profile = MHE_PROFILES.reach, gridSize = 40, already = new Set() } = {}) {
  if (!profile) return []
  const racks = objects.filter(o => BEAM.has(o.type) && o.width > 0 && o.height > 0 && ((o.rotation || 0) % 90) === 0 && Array.isArray(o.beams))
  if (!racks.length) return []
  const hit = new Map()                                            // "rack:bay:face" → { r, bay, face, level }
  const add = (r, bay, face, level) => {
    const k = r.id + ':' + bay + ':' + face, was = hit.get(k)
    if (!was || level < was.level) hit.set(k, { r, bay, face, level })
  }
  // rack-to-rack aisles under the pick width: both faces, over the run the two rows share
  for (const g of rowAisleGaps(racks)) {
    if (!BEAM.has(g.top.type) || !BEAM.has(g.bot.type)) continue
    const level = rowAisleLevel(g.gapLen, profile, gridSize)
    if (level === 3) continue
    for (const [r, side] of [[g.top, 'hi'], [g.bot, 'lo']]) {
      const face = faceIndex(r, side)
      for (const b of bayRunSpans(r, gridSize)) if (Math.min(b.c, g.crossEnd) - Math.max(b.a, g.crossStart) > E) add(r, b.i, face, level)
    }
  }
  // faces with a zone or the wall nearest in front
  for (const g of faceObstacleGaps(objects, { gridSize, profile })) for (const bay of g.bays) add(g.rack, bay, g.face, g.level)
  const out = []
  for (const { r, bay, face, level } of hit.values()) {
    const beam = r.beams[bay]
    const n = positionsPerBeam(beam, r.palletWIn || 40)
    const positionIndices = Array.from({ length: n }, (_, p) => p).filter(p => !already.has(r.id + ':' + bay + ':' + face + ':' + p))
    if (!positionIndices.length) continue
    out.push({ rackId: r.id, bayIndex: bay, faces: [face], positionIndices, positionsLost: positionIndices.length * (r.levels || 1), level, kind: 'narrow-aisle' })
  }
  return out
}

/** The positions a column check result already blocks, as "rack:bay:face:position" (so they count once). */
export function blockedKeys(res) {
  const out = new Set()
  if (!res) return out
  for (const c of [...(res.rackConflicts || []), ...(res.pickBlocks || [])]) {
    if (c.bayIndex == null) continue
    for (const f of c.faces || [0]) for (const p of c.positionIndices || []) out.add(c.rackId + ':' + c.bayIndex + ':' + f + ':' + p)
  }
  return out
}
void rackFootprint
