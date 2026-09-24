// Area K — a column in the AISLE blocks a pallet position through its pick zone.
import { describe, it, expect } from 'vitest'
import { checkColumns, MHE_PROFILES } from '../../generate/columnCheck'
import { ALL_CASES, generate, GS } from './fixtures'

/* Hand geometry, GS = 40 px/ft, reach truck (aisleFt 10.5' = 420 px).
 *
 * One 96" bay, 3" uprights: width (3 + 96 + 3)" = 102" = 340 px. The beam
 * starts at 3" = 10 px. 40" face, 3" at each upright, 4" between pallets:
 *   position 0 = beam-local 0..45"  -> world 3..48"  -> x 10..160 px
 *   position 1 = beam-local 45..90" -> world 48..93" -> x 160..310 px
 * Double row: 42" + 9" + 42" = 93" = 310 px deep; face 0 at y 0..140,
 *   face 1 at y 170..310. Single row: 42" = 140 px deep.
 * Pick zones (420 px deep, straight out from the face):
 *   near side (face 0 / a single's top)   y -420..0
 *   far side  (face 1)                    y 310..730   (single: 140..560)
 * A 1' column is 40 x 40 px. `col(cxIn, cyPx)` centres one at world
 * x = cxIn inches, y = cyPx px. */
const AISLE_PX = 10.5 * GS
const col = (cxIn, cyPx) => ({ x: (cxIn / 12) * GS - 20, y: cyPx - 20, w: 40, h: 40 })
const bay = { x: 0, y: 0, width: 340, beams: [96], uprightWidth: 3, palletWIn: 40, levels: 3 }
const double = (extra = {}) => ({ id: 'd', type: 'rack_double_row', ...bay, height: 310, depthIn: 42, flueSpaceIn: 9, ...extra })
const single = (extra = {}) => ({ id: 's', type: 'rack_row', ...bay, height: 140, depthIn: 42, ...extra })
const run = (racks, columns, floors = []) =>
  checkColumns({ racks, columns, profile: MHE_PROFILES.reach, gridSize: GS, floors })
const lost = (res) => res.pickBlocks.map(b => ({ rackId: b.rackId, bayIndex: b.bayIndex, faces: b.faces, positionIndices: b.positionIndices, positionsLost: b.positionsLost }))

describe('K — pick zones: an aisle column blocks a position it never touches', () => {
  it('K-double: a column 5\' out from face 0, in front of position 0, blocks that one position (3 levels)', () => {
    // column x 21..33" (inside position 0's 3..48"), y -240..-200 (inside -420..0)
    const res = run([double()], [col(27, -220)])
    expect(res.rackConflicts).toEqual([])            // not in the rack
    expect(lost(res)).toEqual([{ rackId: 'd', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
    expect(res.summary.positionsLostToPickZone).toBe(3)
    expect(res.summary.positionsLostIfAbsorb).toBe(3)
  })

  it('K-double: face 1 is picked only from its own side — the same column behind face 0 costs face 1 nothing', () => {
    // a column in face 1's zone blocks face 1 only
    expect(lost(run([double()], [col(27, 520)]))).toEqual([{ rackId: 'd', bayIndex: 0, faces: [1], positionIndices: [0], positionsLost: 3 }])
  })

  it('K-outside: a column just beside the zone (touching its edge, no overlap) blocks nothing', () => {
    // position 0's zone starts at x = 10 px; this column spans x -30..10
    const res = run([double()], [{ x: -30, y: -240, w: 40, h: 40 }])
    expect(res.pickBlocks).toEqual([])
    expect(res.summary.positionsLostIfAbsorb).toBe(0)
  })

  it('K-deep: a column deeper than aisleFt from the face blocks nothing; 1 px inside the depth, it does', () => {
    // zone depth ends at y = -420; column y -460..-420 only touches it
    expect(run([double()], [{ x: 70, y: -460, w: 40, h: 40 }]).pickBlocks).toEqual([])
    // column y -459..-419 overlaps the zone by 1 px
    expect(lost(run([double()], [{ x: 70, y: -459, w: 40, h: 40 }])))
      .toEqual([{ rackId: 'd', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
  })

  it('K-single-one-side: a single with aisles both sides, blocked on one side only, is still pickable — no X, no loss', () => {
    const res = run([single()], [col(27, -220)])
    expect(res.pickBlocks).toEqual([])
    expect(res.summary.positionsLostIfAbsorb).toBe(0)
  })

  it('K-single-both-sides: blocked on both sides -> X on that position, lost on every level', () => {
    // far zone y 140..560; column y 300..340
    const res = run([single()], [col(27, -220), col(27, 320)])
    expect(lost(res)).toEqual([{ rackId: 's', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
    expect(res.summary.positionsLostIfAbsorb).toBe(3)
  })

  it('K-wall: a single 6" off a wall has one pick side; a column in it blocks the position', () => {
    // building from y = -20 (6" above the rack's top) — the near zone leaves the building
    const floor = [{ x: -200, y: -20 }, { x: 600, y: -20 }, { x: 600, y: 2000 }, { x: -200, y: 2000 }]
    const res = run([single()], [col(27, 320)], [floor])
    expect(lost(res)).toEqual([{ rackId: 's', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
    // the wall is what makes it a block: with no building known, the near aisle still serves it
    expect(run([single()], [col(27, 320)]).pickBlocks).toEqual([])
  })

  it('K-once: a position already lost to an in-rack column is not charged again for its pick zones', () => {
    // column A inside the single at position 0 (y 30..70), plus both pick zones blocked
    const res = run([single()], [col(27, 50), col(27, -220), col(27, 320)])
    expect(res.rackConflicts).toHaveLength(1)
    expect(res.rackConflicts[0].positionIndices).toEqual([0])
    expect(res.pickBlocks).toEqual([])
    expect(res.summary.positionsLostIfAbsorb).toBe(3)
  })

  it('K-once: two columns in the same pick zone cost the position once', () => {
    const res = run([double()], [col(20, -220), col(40, -120)])
    expect(lost(res)).toEqual([{ rackId: 'd', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
    expect(res.summary.positionsLostIfAbsorb).toBe(3)
  })

  it('K-once: a column straddling positions 0 and 1 in the zone costs both, once each', () => {
    // x 42..54" straddles the 48" boundary
    expect(lost(run([double()], [col(48, -220)])))
      .toEqual([{ rackId: 'd', bayIndex: 0, faces: [0], positionIndices: [0, 1], positionsLost: 6 }])
  })

  /* Rotated 90° about its centre (170, 155): local (lx, ly) -> world
   * (325 - ly, lx - 15). Position 0 (local x 10..160) -> world y -5..145.
   * Face 0's zone (local y -420..0) -> world x 325..745; face 1's zone
   * (local y 310..730) -> world x -405..15. The rack itself covers world
   * x 15..325, y -15..325. */
  it('K-rotated: a 90° double row is blocked through its rotated pick zones, not the unrotated ones', () => {
    const rot = double({ rotation: 90 })
    expect(lost(run([rot], [{ x: 505, y: 50, w: 40, h: 40 }])))
      .toEqual([{ rackId: 'd', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
    expect(lost(run([rot], [{ x: -205, y: 50, w: 40, h: 40 }])))
      .toEqual([{ rackId: 'd', bayIndex: 0, faces: [1], positionIndices: [0], positionsLost: 3 }])
    // where face 0's zone would be if rotation were ignored: nothing
    expect(run([rot], [col(27, -220)]).pickBlocks).toEqual([])
  })

  it('K-rotated: 270° mirrors 90° — face 0 now picks from the other side', () => {
    // 270°: world = (ly + 15, 325 - lx): position 0 -> world y 165..315, face 0's zone -> x -405..15
    const rot = double({ rotation: 270 })
    expect(lost(run([rot], [{ x: -225, y: 220, w: 40, h: 40 }])))
      .toEqual([{ rackId: 'd', bayIndex: 0, faces: [0], positionIndices: [0], positionsLost: 3 }])
  })

  /* Generated layouts, both orientations and both toggles: the loss total
   * is the in-rack loss plus the pick-zone loss, and no position appears in
   * both lists. */
  for (const { label, brief } of ALL_CASES) {
    it(`K-generated: ${label} — in-rack and pick-zone losses add up, no position counted twice`, () => {
      const { racks, columns } = generate(brief)
      const res = checkColumns({ racks, columns, profile: MHE_PROFILES[brief.mhe], gridSize: GS })
      const keys = (list) => list.flatMap(c => (c.bayIndex == null ? [] :
        (c.faces || [0]).flatMap(f => (c.positionIndices || []).map(p => `${c.rackId}:${c.bayIndex}:${f}:${p}`))))
      const inRack = new Set(keys(res.rackConflicts))
      const pick = keys(res.pickBlocks)
      expect(new Set(pick).size).toBe(pick.length)
      expect(pick.filter(k => inRack.has(k))).toEqual([])
      const inRackLost = res.rackConflicts.reduce((s, c) => s + c.positionsLost, 0)
      const pickLost = res.pickBlocks.reduce((s, b) => s + b.positionsLost, 0)
      expect(res.summary.positionsLostIfAbsorb).toBe(inRackLost + pickLost)
    })
  }
})

/* Zone depth follows the selected truck: reach 10.5', counterbalance 12.5',
 * VNA 6' (TEST_PLAN.md §3E table). */
it('K-depth: zone depth = the selected truck\'s aisleFt (VNA 6\', reach 10.5\', counterbalance 12.5\')', () => {
  expect(AISLE_PX).toBe(420)
  const at = (profile, columns) => checkColumns({ racks: [double()], columns, profile, gridSize: GS }).pickBlocks.length
  // column 7' out from face 0 (y -300..-260): inside reach's 10.5', beyond VNA's 6'
  expect(at(MHE_PROFILES.reach, [col(27, -280)])).toBe(1)
  expect(at(MHE_PROFILES.vna, [col(27, -280)])).toBe(0)
  // column 12' out (y -500..-460): beyond reach's 10.5', inside counterbalance's 12.5'
  expect(at(MHE_PROFILES.reach, [col(27, -480)])).toBe(0)
  expect(at(MHE_PROFILES.counterbalance, [col(27, -480)])).toBe(1)
})
