// TEST_PLAN.md §3B — flue sizing.
import { describe, it, expect } from 'vitest'
import { rowBands, layoutSpec, sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackDoubleRowOps } from '../../render/rackOps'
import { DEFAULT_RULES } from '../../rules/defaults'
import { R, GS, EPS } from './fixtures'

describe('B — flue sizing', () => {
  it('B-default: the configured default flue between back-to-back rows is 9"', () => {
    expect(layoutSpec({}, DEFAULT_RULES).flueIn).toBe(9)
  })

  it('B-default: a generated pair with no column in it has a 9" flue', () => {
    // No column grid at all -> nothing can widen any flue.
    const placements = sizingSheetLayout({ ...R.R1, gridXFt: 0, gridYFt: 0, rackType: 'rack_double_row' }, DEFAULT_RULES)
    const pairs = placements.filter(p => p.type === 'rack_double_row')
    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs) expect(p.flueIn).toBe(9)
  })

  /* Hand-derived rowBands case, a single 12" column (gridYFt far larger
   * than the building so only one line exists) centred at 19.5 ft:
   *   wall row 0..3.5 (42" deep, no wall clearance), aisle 12 -> pair
   *   could start at 15.5; seating a 12" column needs a 12" flue, so the
   *   pair is 42+12+42 = 96" = 8 ft deep and its flue starts 3.5 ft in.
   *   Centring that flue on 19.5 puts the pair start at 19.5 - 3.5 - 0.5 =
   *   15.5 — exactly where the aisle already ends, so no aisle shrink. */
  const base = { rackType: 'rack_double_row', depthIn: 42, aisleFt: 12, flueIn: 9, colSizeIn: 12, travelFt: 8, gridYFt: 1000, gridOffsetFt: 19.5 }

  it('B-column-fit: a column seated in a flue makes the flue exactly the column size (12" -> 12"), no clearance', () => {
    const bands = rowBands(60, base)
    const pair = bands.find(b => b.type === 'rack_double_row' && b.yFt <= 19.5 && b.yFt + b.depthFt >= 19.5)
    expect(pair).toBeTruthy()
    expect(pair.flueIn).toBe(12)
    expect(pair.depthFt).toBeCloseTo((42 + 12 + 42) / 12, 9)
    // and the column really is in that flue
    const flueLo = pair.yFt + 42 / 12, flueHi = flueLo + 12 / 12
    expect(19.5 - 0.5).toBeGreaterThanOrEqual(flueLo - EPS)
    expect(19.5 + 0.5).toBeLessThanOrEqual(flueHi + EPS)
  })

  it('B-column-fit: an 18" column seats in an 18" flue (the rule is column size, not a fixed 12")', () => {
    const bands = rowBands(60, { ...base, colSizeIn: 18, gridOffsetFt: 19.75 })
    const pair = bands.find(b => b.type === 'rack_double_row' && b.flueIn > 9)
    expect(pair).toBeTruthy()
    expect(pair.flueIn).toBe(18)
  })

  it('B-base: generated double rows carry flueBaseIn = 9" even when placed widened (R2)', () => {
    const racks = sizingSheetLayout({ ...R.R2, rackType: 'rack_double_row' }, DEFAULT_RULES).map(placementToObject)
    const pairs = racks.filter(r => r.type === 'rack_double_row')
    // Guard: the fixture must actually contain a widened pair, or this proves nothing.
    expect(pairs.some(r => r.flueSpaceIn > 9)).toBe(true)
    for (const r of pairs) expect(r.flueBaseIn).toBe(9)
  })

  it('B-line: nothing is drawn in the flue gap — only the two row bands and their upright frames', () => {
    const obj = {
      type: 'rack_double_row', x: 0, y: 0, beams: [96, 96], uprightWidth: 3,
      width: ((3 * 3 + 96 * 2) / 12) * GS, height: ((42 * 2 + 9) / 12) * GS, flueSpaceIn: 9,
    }
    const rowH = (42 / 12) * GS
    const flueLo = rowH, flueHi = rowH + (9 / 12) * GS
    const ops = rackDoubleRowOps(obj, GS)
    for (const op of ops) {
      if (op.op === 'rect') {
        // every rect lies wholly outside the flue gap
        expect(op.y + op.h <= flueLo + EPS || op.y >= flueHi - EPS).toBe(true)
      } else if (op.op === 'uprights') {
        // every upright frame lies wholly outside the gap
        for (const r of op.rects) expect(r.y + r.h <= flueLo + EPS || r.y >= flueHi - EPS).toBe(true)
      } else if (op.op === 'path') {
        // every segment's y range lies wholly outside the gap
        const ys = [...op.d.matchAll(/[ML]\s*[-\d.]+\s+([-\d.]+)/g)].map(m => +m[1])
        for (let i = 0; i < ys.length; i += 2) {
          const lo = Math.min(ys[i], ys[i + 1]), hi = Math.max(ys[i], ys[i + 1])
          expect(hi <= flueLo + EPS || lo >= flueHi - EPS).toBe(true)
        }
      } else {
        throw new Error(`unexpected op kind in a double row: ${op.op}`)
      }
    }
  })
})
