// TEST_PLAN.md §3F — cross-aisle.
import { describe, it, expect } from 'vitest'
import { rowSegments } from '../../generate/sizingLayout'
import { rackFootprint } from '../../generate/columnCheck'
import { ALL_CASES, generate, GS } from './fixtures'

// TEST_PLAN.md §3E table, cross-aisle column.
const CROSS = { reach: 9, counterbalance: 13, vna: 8.5 }

/** Group racks into bands (same stack-axis position) and return, per band,
 *  the run-axis extents of its segments in feet. */
function bandsOf(racks) {
  const byBand = new Map()
  for (const r of racks) {
    const f = rackFootprint(r)
    const stack = f.rotated ? f.x : f.y
    const key = Math.round(stack * 1000)
    const run = f.rotated ? [f.y / GS, (f.y + f.h) / GS] : [f.x / GS, (f.x + f.w) / GS]
    if (!byBand.has(key)) byBand.set(key, [])
    byBand.get(key).push(run)
  }
  return [...byBand.values()].map(segs => segs.sort((a, b) => a[0] - b[0]))
}

describe('F — cross-aisle', () => {
  /* Hand-derived rowSegments case: run 240 ft, 6" end clearance, reach
   * cross-aisle 9 ft, 96" beams on 3" uprights. Usable 239 ft; a bay pitch
   * is 99", so 27 bays fit after reserving the aisle. The balanced split
   * (14 | 13) puts the cross-aisle at ~116.25..132 ft. One 12" column at
   * 124 ft sits right in it, so the split must move. */
  it('F-column: no column is left inside the cross-aisle (lone column at 124\')', () => {
    const colFt = 124, half = 0.5
    const res = rowSegments(240, { crossAisleFt: 9, endClearFt: 0.5, beamIn: 96, upIn: 3, runGridFt: 1000, runGridOffsetFt: colFt })
    expect(res.crossAisle).toBeTruthy()
    const lo = res.crossAisle.xFt, hi = lo + res.crossAisle.widthFt
    const overlaps = colFt + half > lo && colFt - half < hi
    expect(overlaps).toBe(false)
    expect(res.crossAisle.widthFt).toBeGreaterThanOrEqual(9)
  })

  for (const { label, brief } of ALL_CASES) {
    it(`F-generated: ${label} — cross-aisle >= ${CROSS[brief.mhe]}' wide, column-free, racks reach both end walls`, () => {
      const { racks, columns } = generate(brief)
      const vertical = brief.orientation === 'vertical'
      const runFt = vertical ? brief.widthFt : brief.lengthFt
      for (const segs of bandsOf(racks)) {
        expect(segs).toHaveLength(2)
        const [a, b] = segs
        // no gap at either end wall: 6" wall clearance, then racking
        expect(a[0]).toBeCloseTo(0.5, 6)
        expect(b[1]).toBeCloseTo(runFt - 0.5, 6)
        // cross-aisle width per forklift
        const lo = a[1], hi = b[0]
        expect(hi - lo).toBeGreaterThanOrEqual(CROSS[brief.mhe] - 1e-9)
        // no column (true footprint) inside the cross-aisle strip
        for (const c of columns) {
          const cLo = (vertical ? c.y : c.x) / GS, cHi = (vertical ? c.y + c.h : c.x + c.w) / GS
          expect(cHi > lo + 1e-9 && cLo < hi - 1e-9).toBe(false)
        }
      }
    })
  }
})
