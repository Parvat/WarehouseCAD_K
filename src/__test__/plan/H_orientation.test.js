// TEST_PLAN.md §3H — orientation.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickOrientation } from '../../generate/traceGenerate'
import { sizingSheetLayout, rowBands, rowSegments } from '../../generate/sizingLayout'
import { getLayoutCapacity } from '../../utils/capacity'
import { placementToObject } from '../../generate/traceGenerate'
import { DEFAULT_RULES } from '../../rules/defaults'
import { R, GS } from './fixtures'

/* A stub generator whose capacity per orientation is set by hand: one
 * rack_row with `bays` 96" bays at 1 level, 40" face -> 2 positions per bay
 * (TEST_PLAN.md §3A), so capacity = 2 x bays. */
const stubWith = (bays) => (brief) => [{
  type: 'rack_row', xFt: 0, yFt: 0, bays: bays[brief.orientation], beamIn: 96,
  depthIn: 42, levels: 1, palletWIn: 40, palletDIn: 48, tag: brief.orientation,
}]

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('H — orientation', () => {
  it('H-auto: picks vertical when vertical has more positions (and places that layout)', () => {
    const pick = pickOrientation({}, stubWith({ horizontal: 3, vertical: 5 }))
    expect(pick.horizontalTotal).toBe(6)
    expect(pick.verticalTotal).toBe(10)
    expect(pick.orientation).toBe('vertical')
    expect(pick.placements[0].tag).toBe('vertical')
  })

  it('H-auto: picks horizontal when horizontal has more positions', () => {
    const pick = pickOrientation({}, stubWith({ horizontal: 5, vertical: 3 }))
    expect(pick.orientation).toBe('horizontal')
    expect(pick.placements[0].tag).toBe('horizontal')
  })

  it('H-auto: a tie goes to horizontal', () => {
    const pick = pickOrientation({}, stubWith({ horizontal: 4, vertical: 4 }))
    expect(pick.orientation).toBe('horizontal')
    expect(pick.placements[0].tag).toBe('horizontal')
  })

  it('H-auto: on a real case (R1) the placed layout is the reported winner, with the larger usable total', () => {
    const pick = pickOrientation({ ...R.R1, rackType: 'rack_double_row' }, sizingSheetLayout, DEFAULT_RULES)
    const placedTotal = getLayoutCapacity(pick.placements.map(placementToObject), DEFAULT_RULES).total
    const winnerTotal = pick.orientation === 'vertical' ? pick.verticalTotal : pick.horizontalTotal
    expect(placedTotal).toBe(winnerTotal)
    const winnerUsable = pick.orientation === 'vertical' ? pick.verticalUsable : pick.horizontalUsable
    expect(winnerUsable).toBe(Math.max(pick.horizontalUsable, pick.verticalUsable))
  })

  /* Auto compares USABLE positions (gross minus column losses), not gross.
   * Hand-built: a 100' x 100' building, 50' x 50' grid, "Columns along wall"
   * = No -> exactly one 12" column, centred at (50', 50') = (2000, 2000) px,
   * box 1980..2020 on both axes.
   *   horizontal: one single, 3 x 96" bays, 1 level, well away from it
   *     (x 200.., y 200..340; pick zones y -220..200 and 340..760)
   *     -> gross 3 x 2 = 6, usable 6.
   *   vertical: one single, 2 x 96" bays, 2 levels -> gross 2 x 2 x 2 = 8.
   *     At x = 1840 px its beam starts at 1850; positions 0/1 of bay 0 meet
   *     at 1850 + 45" (150 px) = 2000, so the column (1980..2020) straddles
   *     both. At y = 1960 (rack 1960..2100) the column is inside the rack:
   *     2 positions x 2 levels lost -> usable 8 - 4 = 4.
   * Gross says vertical (8 > 6); usable says horizontal (6 > 4). */
  const usableStub = (brief) => brief.orientation === 'vertical'
    ? [{ type: 'rack_row', xFt: 1840 / GS, yFt: 1960 / GS, bays: 2, beamIn: 96, depthIn: 42, levels: 2, palletWIn: 40, palletDIn: 48, tag: 'vertical' }]
    : [{ type: 'rack_row', xFt: 5, yFt: 5, bays: 3, beamIn: 96, depthIn: 42, levels: 1, palletWIn: 40, palletDIn: 48, tag: 'horizontal' }]
  const usableBrief = { lengthFt: 100, widthFt: 100, gridXFt: 50, gridYFt: 50, columnsAlongWall: false, mhe: 'reach' }

  it('H-usable: gross favours vertical (8 vs 6) but usable favours horizontal (4 vs 6) -> auto picks horizontal', () => {
    const pick = pickOrientation(usableBrief, usableStub, DEFAULT_RULES)
    expect(pick.horizontalTotal).toBe(6)
    expect(pick.verticalTotal).toBe(8)
    expect(pick.horizontalUsable).toBe(6)
    expect(pick.verticalUsable).toBe(4)
    expect(pick.orientation).toBe('horizontal')
    expect(pick.placements[0].tag).toBe('horizontal')
  })

  it('H-usable: with the column moved clear of the vertical rack, usable = gross and auto picks vertical again', () => {
    // same stub, but the building's only column now falls outside both racks and their pick zones
    const pick = pickOrientation({ ...usableBrief, gridXFt: 90, gridYFt: 90 }, usableStub, DEFAULT_RULES)
    expect(pick.verticalUsable).toBe(8)
    expect(pick.horizontalUsable).toBe(6)
    expect(pick.orientation).toBe('vertical')
  })

  for (const [id, base] of Object.entries(R)) {
    for (const columnsAlongWall of [true, false]) {
      it(`H-usable: ${id} wall=${columnsAlongWall ? 'Yes' : 'No'} — the winner has the larger usable total and usable <= gross on both sides`, () => {
        const pick = pickOrientation({ ...base, orientation: 'auto', columnsAlongWall, rackType: 'rack_double_row' }, sizingSheetLayout, DEFAULT_RULES)
        expect(pick.horizontalUsable).toBeLessThanOrEqual(pick.horizontalTotal)
        expect(pick.verticalUsable).toBeLessThanOrEqual(pick.verticalTotal)
        const [win, lose] = pick.orientation === 'vertical'
          ? [pick.verticalUsable, pick.horizontalUsable] : [pick.horizontalUsable, pick.verticalUsable]
        expect(win).toBeGreaterThanOrEqual(lose)
        if (win === lose) expect(pick.orientation).toBe('horizontal')   // ties keep horizontal
      })
    }
  }

  it('H-single-reader: only axisFrame reads orientation in the generator', () => {
    // The walk functions never branch on orientation.
    for (const fn of [rowBands, rowSegments]) {
      const body = stripComments(fn.toString())
      expect(body).not.toMatch(/\borientation\b|\bvertical\b|\bhorizontal\b/)
    }
    // Outside axisFrame, the generator module only destructures `orientation`
    // and hands it to axisFrame — no comparisons, no branches.
    const src = stripComments(readFileSync(new URL('../../generate/sizingLayout.js', import.meta.url), 'utf8'))
    const start = src.indexOf('export function axisFrame')
    const end = src.indexOf('export function sizingSheetLayout')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const outside = src.slice(0, start) + src.slice(end)
    expect(outside).not.toMatch(/orientation\s*===|===\s*['"](vertical|horizontal)['"]|\bvertical\s*\?/)
  })
})
