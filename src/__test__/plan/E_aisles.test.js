// TEST_PLAN.md §3E — aisles and accessibility.
import { describe, it, expect } from 'vitest'
import { rowBands } from '../../generate/sizingLayout'
import { checkColumns, MHE_PROFILES, groupBySegment, rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { ALL_CASES, generate, GS } from './fixtures'

// TEST_PLAN.md §3E table.
const TABLE = {
  reach:          { aisleFt: 10.5, travelFt: 8, crossAisleFt: 9 },
  counterbalance: { aisleFt: 12.5, travelFt: 8, crossAisleFt: 13 },
  vna:            { aisleFt: 6,    travelFt: 6, crossAisleFt: 8.5 },
}

describe('E — aisles and accessibility', () => {
  for (const [key, t] of Object.entries(TABLE)) {
    it(`E-table: ${key} — aisle ${t.aisleFt}', travel ${t.travelFt}', cross-aisle ${t.crossAisleFt}'`, () => {
      // the generator's rules table
      expect(DEFAULT_RULES.mhe[key].aisleFt).toBe(t.aisleFt)
      expect(DEFAULT_RULES.mhe[key].travelFt).toBe(t.travelFt)
      expect(DEFAULT_RULES.mhe[key].crossAisleFt).toBe(t.crossAisleFt)
      // the column check's own profile must agree with it
      expect(MHE_PROFILES[key].aisleFt).toBe(t.aisleFt)
      expect(MHE_PROFILES[key].travelFt).toBe(t.travelFt)
    })
  }

  const common = { rackType: 'rack_double_row', depthIn: 42, flueIn: 9, colSizeIn: 12, travelFt: 8 }

  it('E-pitch: with no columns, rows pack at pitch = pair depth + aisle (reach, 10.5\')', () => {
    // 42"+9"+42" = 93" = 7.75 ft pair; 3.5 ft wall row; aisle 10.5.
    const bands = rowBands(120, { ...common, aisleFt: 10.5, gridYFt: 0, wallClearFt: 0.5 })
    const pairs = bands.filter(b => b.type === 'rack_double_row')
    expect(pairs.length).toBeGreaterThan(2)
    // first aisle: wall row (0.5..4.0) to first pair
    expect(pairs[0].yFt - (0.5 + 3.5)).toBeCloseTo(10.5, 9)
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i].yFt - pairs[i - 1].yFt).toBeCloseTo(7.75 + 10.5, 9)
    }
  })

  /* Widen gate, hand-derived. Wall row 0..3.5, reach (aisle 10.5, travel 8).
   * One 12" column, only line in the building. */
  it('E-widen-gate: gap to column 9\' (>= travel 8, < aisle 10.5) -> no widen, aisle stays 10.5\'', () => {
    // column centre 13 -> near edge 12.5 -> gap from 3.5 = 9
    const bands = rowBands(60, { ...common, aisleFt: 10.5, gridYFt: 1000, gridOffsetFt: 13 })
    const firstPair = bands.find(b => b.type === 'rack_double_row')
    expect(firstPair.yFt - 3.5).toBeCloseTo(10.5, 9)
  })

  it('E-widen-gate: gap to column 7\' (< travel 8) -> aisle widens so the far side clears >= travel', () => {
    // column centre 11 -> 10.5..11.5, gap from 3.5 = 7
    const bands = rowBands(60, { ...common, aisleFt: 10.5, gridYFt: 1000, gridOffsetFt: 11 })
    const firstPair = bands.find(b => b.type === 'rack_double_row')
    expect(firstPair.yFt - 3.5).toBeGreaterThan(10.5)        // it did widen
    expect(firstPair.yFt - 11.5).toBeGreaterThanOrEqual(8 - 1e-9)   // far-side clear >= travel
  })

  it('E-levels: clear >= travel but < aisle is level 2 and accessible; clear < travel is level 1 and blocked', () => {
    // Two single rows 20 ft apart (face-to-face gap along Y), reach truck.
    const row = (id, yFt) => ({ id, type: 'rack_row', x: 0, y: yFt * GS, width: 400, height: 3.5 * GS, beams: [96], depthIn: 42, levels: 1 })
    const racks = [row('a', 0), row('b', 23.5)]   // gap 3.5 .. 23.5 = 20 ft
    const col = (nearFt) => ({ x: 100, y: nearFt * GS, w: GS, h: GS })   // 1 ft column
    // column 3.5+9 = 12.5..13.5 -> near clear 9, far clear 10 -> best clear 10: >= 8, < 10.5 -> level 2
    const lvl2 = checkColumns({ racks, columns: [col(12.5)], profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks[0]
    expect(lvl2.level).toBe(2)
    expect(lvl2.blocked).toBe(false)
    // shrink the gap: rows 3.5 .. 18.5 (15 ft); column at 10.5..11.5 -> clears 7 and 7 -> level 1
    const tight = [row('a', 0), row('b', 18.5)]
    const lvl1 = checkColumns({ racks: tight, columns: [col(10.5)], profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks[0]
    expect(lvl1.level).toBe(1)
    expect(lvl1.blocked).toBe(true)
  })

  /* "Aisles equal the forklift width except where a column forced a
   * widen" — amended 2026-09-24 (PP/user decision, see CANVAS2_TESTS.md):
   * the aisle directly before the far-wall row may be wider, because
   * whole rows cannot fill an arbitrary width and the leftover is parked
   * there. A column forces a widen either by standing in the aisle (the
   * travelFt widen) or by pushing the next row forward to seat it in that
   * row's flue or face — so any OTHER aisle wider than the forklift's must
   * have a column somewhere between its start and the far edge of the row
   * after it. */
  for (const { label, brief } of ALL_CASES) {
    it(`E-exact: ${label} — every aisle but the last is the forklift width unless a column forced a widen`, () => {
      const { racks, columns } = generate(brief)
      const aisleFt = TABLE[brief.mhe].aisleFt
      for (const run of groupBySegment(racks)) {
        const stacked = rackFootprint(run[0]).rotated
        const feet = run.map(rackFootprint).sort((a, b) => stacked ? a.x - b.x : a.y - b.y)
        const lo = f => (stacked ? f.x : f.y) / GS, hi = f => (stacked ? f.x + f.w : f.y + f.h) / GS
        // the last aisle (before the far-wall row) may only ever be WIDER
        const lastGap = lo(feet[feet.length - 1]) - hi(feet[feet.length - 2])
        expect(lastGap).toBeGreaterThanOrEqual(aisleFt - 1e-9)
        for (let i = 0; i < feet.length - 2; i++) {
          const gap = lo(feet[i + 1]) - hi(feet[i])
          if (Math.abs(gap - aisleFt) < 1e-6) continue
          const from = hi(feet[i]), to = hi(feet[i + 1])
          // The window includes a column TOUCHING the next row's far face:
          // a pair pushed forward to flue-seat a column and then converted
          // to a single by the far-wall cleanup keeps its shifted start, and
          // the column ends up flush against the single's back face — the
          // widen was still column-caused (seen in R1/R2 vertical).
          const forced = columns.some(c => {
            const cLo = (stacked ? c.x : c.y) / GS, cHi = (stacked ? c.x + c.w : c.y + c.h) / GS
            return cHi > from + 1e-9 && cLo <= to + 1e-9
          })
          expect({ aisleFrom: from, aisleTo: lo(feet[i + 1]), widthFt: gap, columnForced: forced })
            .toEqual({ aisleFrom: from, aisleTo: lo(feet[i + 1]), widthFt: gap, columnForced: true })
        }
      }
    })
  }

  for (const { label, brief } of ALL_CASES) {
    it(`E-no-block: ${label} — no aisle narrower than travelFt anywhere (no level-1 block)`, () => {
      const { racks, columns } = generate(brief)
      const travelFt = TABLE[brief.mhe].travelFt
      // every row-to-row gap within a run, column or not
      for (const run of groupBySegment(racks)) {
        const stacked = rackFootprint(run[0]).rotated
        const feet = run.map(rackFootprint).sort((a, b) => stacked ? a.x - b.x : a.y - b.y)
        for (let i = 0; i < feet.length - 1; i++) {
          const gap = stacked ? feet[i + 1].x - (feet[i].x + feet[i].w) : feet[i + 1].y - (feet[i].y + feet[i].h)
          expect(gap / GS).toBeGreaterThanOrEqual(travelFt - 1e-9)
        }
      }
      // and no column leaves less than travelFt clear on both sides
      const res = checkColumns({ racks, columns, profile: MHE_PROFILES[brief.mhe], gridSize: GS })
      expect(res.aisleBlocks.filter(a => a.level === 1)).toEqual([])
    })
  }
})
