import { describe, it, expect } from 'vitest'
import { getRackCapacity, getLayoutCapacity, positionsPerBeam, positionFootprintIn, blockedPositionIndices, oversizedBayIndices, UPRIGHT_CLEARANCE_IN, PALLET_GAP_IN } from '../utils/capacity'
import { layoutSpec } from '../generate/sizingLayout'
import { DEFAULT_RULES } from '../rules/defaults'

/* Industry-standard selective-rack pallet-position counting: a pallet's
 * LOADING FACE (its narrower dimension, GMA default 40") runs ACROSS the
 * beam and is what sizes positions per bay; the deeper dimension (default
 * 48") runs INTO the frame and overhangs it by design — depth never
 * restricts count. Spacing is 3" between a pallet and each upright and 4"
 * between adjacent pallets:
 *   N×face + (N−1)×4" + 2×3" ≤ beam.
 * Every expected value below is worked by hand from that rule. */
describe('capacity — positions per beam, industry-standard spacing', () => {
  it('the spacing constants are 3" at each upright, 4" between pallets', () => {
    expect(UPRIGHT_CLEARANCE_IN).toBe(3)
    expect(PALLET_GAP_IN).toBe(4)
  })

  it('every standard beam with a 40" face: 96"/108"/120" = 2, 144"/156"/168" = 3', () => {
    // 2 pallets need 80+4+6 = 90"; 3 need 120+8+6 = 134"; 4 need 160+12+6 = 178"
    expect(positionsPerBeam(96, 40)).toBe(2)
    expect(positionsPerBeam(108, 40)).toBe(2)
    expect(positionsPerBeam(120, 40)).toBe(2)
    expect(positionsPerBeam(144, 40)).toBe(3)
    expect(positionsPerBeam(156, 40)).toBe(3)
    expect(positionsPerBeam(168, 40)).toBe(3)
  })

  it('the count flips exactly where the rule says: 133" holds 2 (needs 134" for 3), 134" holds 3', () => {
    expect(positionsPerBeam(133, 40)).toBe(2)
    expect(positionsPerBeam(134, 40)).toBe(3)
  })

  it('a wider (non-default) pallet face genuinely changes the count', () => {
    // 96" beam, 44" face: 2 would need 88+4+6 = 98" > 96" -> 1
    expect(positionsPerBeam(96, 44)).toBe(1)
  })

  it('zero/negative or missing dimensions never throw or go negative', () => {
    expect(positionsPerBeam(0, 40)).toBe(0)
    expect(positionsPerBeam(96, 0)).toBe(0)
    expect(positionsPerBeam(-10, 40)).toBe(0)
    expect(positionsPerBeam(4, 40)).toBe(0)
  })

  it('positionFootprintIn — pallet plus half the 4" gap each side, first/last run to the upright', () => {
    // 96"/40": pallets at 3..43 and 47..87
    expect(positionFootprintIn(96, 40, 0)).toEqual({ startIn: 0, endIn: 45 })
    expect(positionFootprintIn(96, 40, 1)).toEqual({ startIn: 45, endIn: 90 })
    expect(positionFootprintIn(96, 40, 2)).toBeNull()
    // 144"/40": pallets at 3..43, 47..87, 91..131
    expect(positionFootprintIn(144, 40, 0)).toEqual({ startIn: 0, endIn: 45 })
    expect(positionFootprintIn(144, 40, 1)).toEqual({ startIn: 45, endIn: 89 })
    expect(positionFootprintIn(144, 40, 2)).toEqual({ startIn: 89, endIn: 134 })
  })

  it('blockedPositionIndices resolves exactly which position(s) a footprint touches, including a straddle and a clip', () => {
    const beamIn = 96, faceIn = 40   // positions [0,45) and [45,90)
    expect(blockedPositionIndices(beamIn, faceIn, 10, 20)).toEqual([0])
    expect(blockedPositionIndices(beamIn, faceIn, 60, 70)).toEqual([1])
    expect(blockedPositionIndices(beamIn, faceIn, 43, 47)).toEqual([0, 1])   // straddles the boundary
    expect(blockedPositionIndices(beamIn, faceIn, -5, 5)).toEqual([0])       // clips the near edge
  })

  it('a footprint entirely in the slack past the last position\'s clearance costs nothing', () => {
    // 96"/40": positions end at 90" -> 90..96 is slack
    expect(blockedPositionIndices(96, 40, 90, 96)).toEqual([])
    // 100"/40": still 2 positions (3 need 134"), still ending at 90"
    expect(positionsPerBeam(100, 40)).toBe(2)
    expect(blockedPositionIndices(100, 40, 92, 100)).toEqual([])
  })

  it('getRackCapacity — a rack_row with a 96" and a 144" beam reports 2 and 3 positions per bay under GMA defaults', () => {
    const cap = getRackCapacity({ type: 'rack_row', beams: [96, 144], levels: 4 }, DEFAULT_RULES)
    expect(cap.detail).toEqual(['Bay 1: 2 pal', 'Bay 2: 3 pal'])
    expect(cap.groundTotal).toBe(5)
    expect(cap.total).toBe(20)
  })

  it('layoutSpec defaults: pallet face 40"/depth 48", frame depth stays the standard 42" — depth never gates the fit', () => {
    const spec = layoutSpec({}, DEFAULT_RULES)
    expect(spec.palletWIn).toBe(40)
    expect(spec.palletDIn).toBe(48)
    // a 48"-deep pallet on a 42" frame (6" total overhang, ~3" each side) is
    // the industry-standard stance, not something the sizing logic avoids.
    expect(spec.depthIn).toBe(42)
  })

  it('getLayoutCapacity stays additive and consistent with per-object getRackCapacity', () => {
    const objects = [
      { type: 'rack_row', beams: [96, 96], levels: 4 },
      { type: 'rack_double_row', beams: [144], levels: 3 },
    ]
    const { total } = getLayoutCapacity(objects, DEFAULT_RULES)
    const perObject = objects.reduce((s, o) => s + getRackCapacity(o, DEFAULT_RULES).total, 0)
    expect(total).toBe(perObject)
  })
})

/* BUG 67 — a pallet face too wide for a beam (positionsPerBeam === 0) is a
 * structural fact about the bay, independent of any column. With 3" at each
 * upright, one pallet fits a 96" beam up to a 90" face (90+6 = 96). */
describe('capacity — BUG 67: oversized-pallet bays', () => {
  it('90" face on a 96" beam fits exactly one position — the single-pallet limit is 90"', () => {
    expect(positionsPerBeam(96, 90)).toBe(1)
    expect(oversizedBayIndices([96], 90)).toEqual([])
  })

  it('91" face on a 96" beam is oversized (97" needed > 96")', () => {
    expect(positionsPerBeam(96, 91)).toBe(0)
    expect(oversizedBayIndices([96], 91)).toEqual([0])
  })

  it('flags only the oversized bays in a mixed-beam rack, not the whole rack', () => {
    // 91" face: 96" beam needs 97" (oversized), 144" beam holds 1
    expect(oversizedBayIndices([96, 144, 96], 91)).toEqual([0, 2])
  })

  it('a rack with every beam oversized flags every bay', () => {
    expect(oversizedBayIndices([96, 96], 91)).toEqual([0, 1])
  })

  it('no bays flagged when every beam holds at least one position', () => {
    expect(oversizedBayIndices([96, 144], 40)).toEqual([])
  })

  it('an oversized bay already contributes exactly 0 to getRackCapacity — the visual mark has nothing new to wire into capacity math', () => {
    const cap = getRackCapacity({ type: 'rack_row', beams: [96, 144], levels: 4, palletWIn: 91 }, DEFAULT_RULES)
    expect(cap.detail).toEqual(['Bay 1: 0 pal', 'Bay 2: 1 pal'])
    expect(cap.groundTotal).toBe(1)
    expect(cap.total).toBe(4)
  })
})
