// TEST_PLAN.md §3G — walls.
import { describe, it, expect } from 'vitest'
import { layoutSpec } from '../../generate/sizingLayout'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { ALL_CASES, generate, GS } from './fixtures'

describe('G — walls', () => {
  it('G-default: wall clearance defaults to 6"', () => {
    expect(layoutSpec({}, DEFAULT_RULES).endClearFt * 12).toBeCloseTo(6, 9)
  })

  /* Amended 2026-09-24 (PP/user decision, see CANVAS2_TESTS.md): when a
   * final back-to-back pair won't fit before the far wall it may be placed
   * as a single — so the row directly before the far-wall row may be a
   * single. Both singles must then stay accessible: the aisle between them
   * must be at least the forklift's aisle width (TEST_PLAN.md §3E table). */
  const AISLE_FT = { reach: 10.5, counterbalance: 12.5, vna: 6 }

  for (const { label, brief } of ALL_CASES) {
    it(`G-generated: ${label} — wall rows single, interior rows back-to-back (bar the row before the far wall), first/last row 6" off the wall`, () => {
      const { racks } = generate(brief)
      const vertical = brief.orientation === 'vertical'
      const stackFt = vertical ? brief.lengthFt : brief.widthFt
      // one list of bands per run (segment), ordered across the stack axis
      const runs = new Map()
      for (const r of racks) {
        const f = rackFootprint(r)
        const runKey = Math.round((vertical ? f.y : f.x) * 1000)
        if (!runs.has(runKey)) runs.set(runKey, [])
        runs.get(runKey).push({ r, lo: (vertical ? f.x : f.y) / GS, hi: (vertical ? f.x + f.w : f.y + f.h) / GS })
      }
      for (const bands of runs.values()) {
        bands.sort((a, b) => a.lo - b.lo)
        expect(bands.length).toBeGreaterThanOrEqual(2)
        const first = bands[0], last = bands[bands.length - 1]
        expect(first.r.type).toBe('rack_row')
        expect(last.r.type).toBe('rack_row')
        expect(first.lo).toBeCloseTo(0.5, 6)            // 6" off the near wall
        expect(last.hi).toBeCloseTo(stackFt - 0.5, 6)   // 6" off the far wall
        for (const mid of bands.slice(1, -2)) expect(mid.r.type).toBe('rack_double_row')
        const beforeFar = bands[bands.length - 2]
        if (bands.length > 2 && beforeFar.r.type === 'rack_row') {
          // interior single next to the far-wall single: both must be accessible
          expect(last.lo - beforeFar.hi).toBeGreaterThanOrEqual(AISLE_FT[brief.mhe] - 1e-9)
        } else if (bands.length > 2) {
          expect(beforeFar.r.type).toBe('rack_double_row')
        }
      }
    })
  }

  it('G-single-aisle: the interior single case really occurs in the reference set (so the aisle check above is exercised)', () => {
    const withSingle = ALL_CASES.filter(({ brief }) => {
      const { racks } = generate(brief)
      const vertical = brief.orientation === 'vertical'
      const byRun = new Map()
      for (const r of racks) {
        const f = rackFootprint(r)
        const k = Math.round((vertical ? f.y : f.x) * 1000)
        if (!byRun.has(k)) byRun.set(k, [])
        byRun.get(k).push({ r, lo: vertical ? f.x : f.y })
      }
      return [...byRun.values()].some(b => { b.sort((p, q) => p.lo - q.lo); return b.length > 2 && b[b.length - 2].r.type === 'rack_row' })
    })
    expect(withSingle.length).toBeGreaterThan(0)
  })
})
