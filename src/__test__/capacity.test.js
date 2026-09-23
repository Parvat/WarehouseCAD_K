import { describe, it, expect } from 'vitest'
import { getRackCapacity, getLayoutCapacity, positionsPerBeam, positionFootprintIn, blockedPositionIndices, oversizedBayIndices, PALLET_CLEARANCE_IN } from '../utils/capacity'
import { layoutSpec } from '../generate/sizingLayout'
import { DEFAULT_RULES } from '../rules/defaults'

/* BUG 62 — industry-standard selective-rack pallet-position counting
 * (verified against the real convention, not derived): a pallet's LOADING
 * FACE (its narrower dimension, GMA default 40") runs ACROSS the beam and
 * is what sizes positions per bay; the deeper dimension (default 48") runs
 * INTO the frame and overhangs it by design — depth never restricts count.
 * positionsPerBeam = floor(beamIn / (palletFaceIn + 8")), the 8" being 4"+4"
 * clearance between adjacent pallets, not padding at the beam's own ends. */
describe('capacity — BUG 62: positions per beam, GMA-standard spacing', () => {
  it('96"/40" pallet = 2 positions, 144" = 3 — the user-given reference cases', () => {
    expect(PALLET_CLEARANCE_IN).toBe(8)
    expect(positionsPerBeam(96, 40)).toBe(2)
    expect(positionsPerBeam(144, 40)).toBe(3)
  })

  it('every standard beam length: 9\'/10\' = 2, 12\' = 3, 13\'/14\' = 3', () => {
    expect(positionsPerBeam(9 * 12, 40)).toBe(2)
    expect(positionsPerBeam(10 * 12, 40)).toBe(2)
    expect(positionsPerBeam(12 * 12, 40)).toBe(3)
    expect(positionsPerBeam(13 * 12, 40)).toBe(3)
    expect(positionsPerBeam(14 * 12, 40)).toBe(3)
  })

  it('a wider (non-default) pallet face genuinely changes the count — the clearance is real, not baked into a fixed divisor', () => {
    // 96" beam, a 44" pallet face: slot = 44+8 = 52 -> floor(96/52) = 1, not 2
    expect(positionsPerBeam(96, 44)).toBe(1)
  })

  it('zero/negative or missing dimensions never throw or go negative', () => {
    expect(positionsPerBeam(0, 40)).toBe(0)
    expect(positionsPerBeam(96, 0)).toBe(0)
    expect(positionsPerBeam(-10, 40)).toBe(0)
  })

  it('positionFootprintIn — each slot is exactly palletFace + clearance wide, packed end to end with no gap left over between slots', () => {
    expect(positionFootprintIn(40, 0)).toEqual({ startIn: 0, endIn: 48 })
    expect(positionFootprintIn(40, 1)).toEqual({ startIn: 48, endIn: 96 })
    expect(positionFootprintIn(40, 2)).toEqual({ startIn: 96, endIn: 144 })
  })

  it('blockedPositionIndices resolves exactly which slot(s) a footprint touches, including a straddle and a clip', () => {
    const beamIn = 96, faceIn = 40   // 2 slots: [0,48) and [48,96)
    expect(blockedPositionIndices(beamIn, faceIn, 10, 20)).toEqual([0])
    expect(blockedPositionIndices(beamIn, faceIn, 60, 70)).toEqual([1])
    expect(blockedPositionIndices(beamIn, faceIn, 44, 52)).toEqual([0, 1])   // straddles the boundary
    expect(blockedPositionIndices(beamIn, faceIn, -5, 5)).toEqual([0])       // clips the near edge
  })

  it('a footprint entirely in the unusable slack past the last full position costs nothing — there was never a sellable slot there', () => {
    // 100" beam, 40" face: slot=48", 2 full slots use 96", 4" of dead slack left over
    expect(positionsPerBeam(100, 40)).toBe(2)
    expect(blockedPositionIndices(100, 40, 96, 100)).toEqual([])
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

  it('getLayoutCapacity stays additive and consistent with per-object getRackCapacity under the new formula', () => {
    const objects = [
      { type: 'rack_row', beams: [96, 96], levels: 4 },
      { type: 'rack_double_row', beams: [144], levels: 3 },
    ]
    const { total } = getLayoutCapacity(objects, DEFAULT_RULES)
    const perObject = objects.reduce((s, o) => s + getRackCapacity(o, DEFAULT_RULES).total, 0)
    expect(total).toBe(perObject)
  })
})

/* BUG 67 — a pallet face too wide for a beam (positionsPerBeam === 0, e.g.
 * a 90" face on a 96" beam: 90+8=98 > 96) needs the SAME structural-fact
 * read regardless of whether a column happens to touch that bay — the bay
 * holds zero positions purely from its own geometry. */
describe('capacity — BUG 67: oversized-pallet bays', () => {
  it('90" face on a 96" beam is oversized (98" needed > 96" available) — matches the reported threshold', () => {
    expect(positionsPerBeam(96, 90)).toBe(0)
    expect(oversizedBayIndices([96], 90)).toEqual([0])
  })

  it('88" face on a 96" beam still fits exactly one position — the real cutoff is 88", not a round "~90"', () => {
    expect(positionsPerBeam(96, 88)).toBe(1)
    expect(oversizedBayIndices([96], 88)).toEqual([])
    expect(positionsPerBeam(96, 89)).toBe(0)
    expect(oversizedBayIndices([96], 89)).toEqual([0])
  })

  it('flags only the oversized bays in a mixed-beam rack, not the whole rack', () => {
    // 90" face: 96" beam needs 98" (oversized), 144" beam needs 98" (fits)
    expect(oversizedBayIndices([96, 144, 96], 90)).toEqual([0, 2])
  })

  it('a rack with every beam oversized flags every bay', () => {
    expect(oversizedBayIndices([96, 96], 90)).toEqual([0, 1])
  })

  it('no bays flagged when every beam holds at least one position', () => {
    expect(oversizedBayIndices([96, 144], 40)).toEqual([])
  })

  it('an oversized bay already contributes exactly 0 to getRackCapacity — the visual mark has nothing new to wire into capacity math', () => {
    const cap = getRackCapacity({ type: 'rack_row', beams: [96, 144], levels: 4, palletWIn: 90 }, DEFAULT_RULES)
    expect(cap.detail).toEqual(['Bay 1: 0 pal', 'Bay 2: 1 pal'])
    expect(cap.groundTotal).toBe(1)
    expect(cap.total).toBe(4)
  })
})
