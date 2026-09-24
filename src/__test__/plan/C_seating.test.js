// TEST_PLAN.md §3C — column seating: every column is fully in exactly one of
// flue, rack face (bay), or travel aisle; never straddling a boundary.
import { describe, it, expect } from 'vitest'
import { rowBands } from '../../generate/sizingLayout'
import { ALL_CASES, generate, rackBands, EPS } from './fixtures'

/** For one column (world px box), every rack it touches must contain it
 *  WHOLLY inside exactly one of that rack's depth bands (face or flue),
 *  and along the run axis inside the rack's own extent. A column touching
 *  no rack is in open floor (aisle / cross-aisle / wall gap) — fine. */
function straddles(col, racks) {
  const hits = []
  for (const r of racks) {
    const { depthAlongY, runLo, runHi, bands } = rackBands(r)
    const dLo = depthAlongY ? col.y : col.x, dHi = depthAlongY ? col.y + col.h : col.x + col.w
    const rLo = depthAlongY ? col.x : col.y, rHi = depthAlongY ? col.x + col.w : col.y + col.h
    const rackDLo = bands[0].lo, rackDHi = bands[bands.length - 1].hi
    const touches = dHi > rackDLo + EPS && dLo < rackDHi - EPS && rHi > runLo + EPS && rLo < runHi - EPS
    if (!touches) continue
    const inRun = rLo >= runLo - EPS && rHi <= runHi + EPS
    const inOneBand = bands.some(b => dLo >= b.lo - EPS && dHi <= b.hi + EPS)
    if (!inRun || !inOneBand) hits.push({ rackId: r.id, col, bands, inRun })
  }
  return hits
}

describe('C — column seating, never straddling', () => {
  /* Hand-derived rowBands case that forces the face-seat fallback: a
   * single 12" column centred at 19.375 ft. Wall row 0..3.5, 12 ft aisle ->
   * a standard 7.75 ft pair would start at 15.5 with its 9" flue at
   * 19..19.75, and the column (18.875..19.875) would straddle the front
   * face / flue boundary. Seating it in a 12" flue would need the pair to
   * start at 19.375-3.5-0.5 = 15.375, before the aisle ends (15.5) — not
   * allowed. So the column must end up wholly inside one face instead. */
  it('C-fallback: a column that cannot be flue-seated ends up wholly inside one face, not straddling', () => {
    const bands = rowBands(60, {
      rackType: 'rack_double_row', depthIn: 42, aisleFt: 12, flueIn: 9, colSizeIn: 12,
      travelFt: 8, gridYFt: 1000, gridOffsetFt: 19.375,
    })
    const colLo = 18.875, colHi = 19.875
    const pair = bands.find(b => b.type === 'rack_double_row' && b.yFt < colHi && b.yFt + b.depthFt > colLo)
    expect(pair).toBeTruthy()
    const single = 42 / 12, flue = pair.flueIn / 12
    const regions = [
      [pair.yFt, pair.yFt + single],
      [pair.yFt + single, pair.yFt + single + flue],
      [pair.yFt + single + flue, pair.yFt + pair.depthFt],
    ]
    const inside = regions.filter(([lo, hi]) => colLo >= lo - 1e-9 && colHi <= hi + 1e-9)
    expect(inside).toHaveLength(1)
  })

  for (const { label, brief } of ALL_CASES) {
    it(`C-no-straddle: ${label}`, () => {
      const { racks, columns } = generate(brief)
      expect(racks.length).toBeGreaterThan(0)
      const bad = columns.flatMap(c => straddles(c, racks))
      expect(bad).toEqual([])
    })
  }
})
