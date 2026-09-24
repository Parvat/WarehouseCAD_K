// TEST_PLAN.md §3A — pallet position counting.
import { describe, it, expect } from 'vitest'
import { positionsPerBeam, oversizedBayIndices, getRackCapacity } from '../../utils/capacity'
import { checkColumns, MHE_PROFILES } from '../../generate/columnCheck'
import { placementToObject } from '../../generate/traceGenerate'
import { GS } from './fixtures'

describe('A — pallet position counting', () => {
  // TEST_PLAN.md §3A table, 40" loading face.
  const TABLE = [
    [96, 2], [108, 2], [120, 2], [144, 3], [156, 3], [168, 3],
  ]
  for (const [beam, expected] of TABLE) {
    it(`A-table: ${beam}" beam, 40" face -> ${expected} positions`, () => {
      expect(positionsPerBeam(beam, 40)).toBe(expected)
    })
  }

  // Rule: N×face + (N−1)×4" + 2×3" ≤ beam -> one pallet on a 96" beam up to a 90" face.
  it('A-oversize: 96" beam, 90" face -> 1 position (not flagged)', () => {
    expect(positionsPerBeam(96, 90)).toBe(1)
    expect(oversizedBayIndices([96], 90)).toEqual([])
  })

  it('A-oversize: 96" beam, face above 90" -> 0 positions, bay flagged oversized, 0 capacity', () => {
    for (const face of [91, 92, 96]) {
      expect(positionsPerBeam(96, face)).toBe(0)
      expect(oversizedBayIndices([96], face)).toEqual([0])
      const cap = getRackCapacity({ type: 'rack_row', beams: [96], palletWIn: face, levels: 3 })
      expect(cap.total).toBe(0)
    }
  })

  it('A-column: a column blocking one position in a 2-position bay costs exactly 1 per level, not 2', () => {
    // Single row, one 96" bay, 3" uprights, 40" face, 3 levels.
    // Bay beam starts after the first upright: 3" -> 10px. Pallet 0 sits at
    // beam-local 3..43" (3" off the upright), so position 0 spans 0..45"
    // (to half the 4" gap). A 12" column centred at beam-local 24" (18..30")
    // sits wholly inside position 0: world x = 3"+24" = 27" -> 90px, so its
    // box is 70..110px.
    const rack = {
      id: 'r', type: 'rack_row', x: 0, y: 0,
      width: ((3 + 96 + 3) / 12) * GS, height: (42 / 12) * GS,
      beams: [96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 0,
      palletWIn: 40, levels: 3,
    }
    expect(getRackCapacity(rack).total).toBe(6)   // 2 positions x 3 levels, before the column
    const column = { x: 70, y: 40, w: 40, h: 40 }
    const res = checkColumns({ racks: [rack], columns: [column], profile: MHE_PROFILES.reach, gridSize: GS })
    expect(res.rackConflicts).toHaveLength(1)
    expect(res.summary.positionsLostIfAbsorb).toBe(3)   // 1 per level x 3 levels
  })

  it('A-depth: frame depth never limits position count (48" pallet on a 42" frame is valid)', () => {
    const rack = placementToObject({
      type: 'rack_double_row', xFt: 0, yFt: 0, bays: 1, beamIn: 96,
      depthIn: 42, flueIn: 9, levels: 1, palletWIn: 40, palletDIn: 48,
    })
    expect(rack.depthIn).toBe(42)
    expect(rack.palletDIn).toBe(48)
    // 2 positions per beam x 2 faces x 1 level — the 6" depth overhang costs nothing.
    expect(getRackCapacity(rack).total).toBe(4)
  })
})
