// Multiple cross-aisles for long rack runs (PP). The fewest cross-aisles so
// that no continuous rack run is longer than maxRunFt (default 150 ft),
// spread evenly in whole bays, all the same width, aligned across every row,
// and slid the minimum to stay clear of columns.
//
// Hand arithmetic used below (reach truck, cross-aisle 9 ft; 96" beams on 3"
// uprights; 6" wall clearance each end):
//   run length of n bays   = (3(n+1) + 96n) / 12 ft
//   bays that fit in c ft  = floor((12c - 3) / 99)
//   S sections             = S - 1 cross-aisles, each >= 9 ft, plus S - 1 extra
//                            end-uprights (0.25 ft each)
//   max bays per section   = floor((12 * maxRun - 3) / 99): 18 at 150 ft
//                            (148.75 ft), 12 at 100 ft (99.25 ft)
import { describe, it, expect } from 'vitest'
import { rowSegments, sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }

const runLen = (n) => (3 * (n + 1) + 96 * n) / 12
const SPEC = { crossAisleFt: 9, endClearFt: 0.5, beamIn: 96, upIn: 3 }
const seg = (lengthFt, extra = {}) => rowSegments(lengthFt, { ...SPEC, ...extra })

/** Every placed rack, grouped by row (same stack position), with its run extent in ft. */
function rowsOf(brief) {
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i }))
  const m = new Map()
  for (const r of racks) {
    const f = rackFootprint(r)
    const key = Math.round((f.rotated ? f.x : f.y) * 1000)
    const run = f.rotated ? [f.y / GS, (f.y + f.h) / GS] : [f.x / GS, (f.x + f.w) / GS]
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(run)
  }
  return [...m.values()].map(s => s.sort((a, b) => a[0] - b[0]))
}
const crossOf = (row) => row.slice(1).map((s, i) => [row[i][1], s[0]])

describe('W — multiple cross-aisles', () => {
  /* 240 ft: usable 239. Two sections: 239 - 9.25 = 229.75 ft -> 27 bays,
   * ceil(27/2) = 14 <= 18, so one cross-aisle. Even split 14 | 13; width =
   * 239 - runLen(27) (223) - 0.25 = 15.75 ft. */
  it('W-240: 240 ft run -> 1 cross-aisle, 14 | 13 bays, 15.75 ft wide', () => {
    const r = seg(240, { maxRunFt: 150 })
    expect(r.crossAisles).toHaveLength(1)
    expect(r.segments.map(s => s.bays)).toEqual([14, 13])
    expect(r.crossAisles[0].widthFt).toBeCloseTo(15.75, 9)
    expect(r.crossAisles[0].xFt).toBeCloseTo(0.5 + runLen(14), 9)   // 116.25
    expect(r.crossAisle).toEqual(r.crossAisles[0])
  })

  /* 1,080 ft: usable 1079.
   *   S = 6: 1079 - 5(9.25) = 1032.75 ft -> 125 bays, ceil(125/6) = 21 > 18.
   *   S = 7: 1079 - 6(9.25) = 1023.5 ft  -> 124 bays, ceil(124/7) = 18. Stop.
   * So 7 sections, 6 cross-aisles. Width = (1079 - runLen(124) (1023.25)
   * - 6(0.25)) / 6 = 54.25 / 6 = 9.0417 ft. Even split, boundaries at
   * round(124k/7) = 18, 35, 53, 71, 89, 106 -> 18,17,18,18,18,17,18. Longest
   * section is 18 bays = 148.75 ft. */
  it('W-1080: 1,080 ft run -> 6 cross-aisles, 7 sections, none over 150 ft', () => {
    const r = seg(1080, { maxRunFt: 150 })
    expect(r.crossAisles).toHaveLength(6)
    expect(r.segments.map(s => s.bays)).toEqual([18, 17, 18, 18, 18, 17, 18])
    for (const a of r.crossAisles) expect(a.widthFt).toBeCloseTo(54.25 / 6, 9)
    for (const s of r.segments) expect(runLen(s.bays)).toBeLessThanOrEqual(150)
    // racks reach both walls: first at 0.5, last ends at 1079.5
    const last = r.segments[r.segments.length - 1]
    expect(r.segments[0].xFt).toBe(0.5)
    expect(last.xFt + runLen(last.bays)).toBeCloseTo(1079.5, 9)
  })

  /* maxRunFt 100 -> max 12 bays per section.
   *   S = 9:  1079 - 8(9.25) = 1005 ft   -> 121 bays, ceil(121/9) = 14 > 12.
   *   S = 10: 1079 - 9(9.25) = 995.75 ft -> 120 bays, 120/10 = 12. Stop.
   * 9 cross-aisles, 12 bays each (99.25 ft). Width = (1079 - runLen(120)
   * (990.25) - 9(0.25)) / 9 = 86.5 / 9 = 9.6111 ft. */
  it('W-1080@100: max run 100 ft -> 9 cross-aisles, 12 bays each', () => {
    const r = seg(1080, { maxRunFt: 100 })
    expect(r.crossAisles).toHaveLength(9)
    expect(r.segments.map(s => s.bays)).toEqual(Array(10).fill(12))
    for (const a of r.crossAisles) expect(a.widthFt).toBeCloseTo(86.5 / 9, 9)
    expect(r.crossAisles.length).toBeGreaterThan(seg(1080, { maxRunFt: 150 }).crossAisles.length)
  })

  /* A column slide inside the same count: 240 ft, columns every 25 ft. The
   * even split puts the aisle at 116.25..132, over the column at 125
   * (124.5..125.5). One bay less on the left: 0.5 + runLen(13) = 108 ->
   * 108..123.75, clear. 13 | 14. */
  it('W-slide: a column in the even spot -> the cross-aisle slides one bay', () => {
    const r = seg(240, { maxRunFt: 150, runGridFt: 25, runGridOffsetFt: 0, runGridMaxFt: 240 })
    expect(r.segments.map(s => s.bays)).toEqual([13, 14])
    expect(r.crossAisles[0].xFt).toBeCloseTo(108, 9)
  })

  /* 300 ft, columns every 30 ft.
   *   S = 2: 289.75 ft -> 35 bays; 18 | 17 or 17 | 18 (both <= 18). Width
   *   299 - runLen(35) (289) - 0.25 = 9.75. Aisle at 0.5 + 148.75 = 149.25
   *   ..159, or 0.5 + 140.5 = 141..150.75 -- both cross the column at 150,
   *   and 16 | 19 would be over 150 ft. So one more cross-aisle:
   *   S = 3: 299 - 18.5 = 280.5 ft -> 33 bays, 11 | 11 | 11, width
   *   (299 - 272.5 - 0.5) / 2 = 13. Aisles 91.5..104.5 and 195.5..208.5 --
   *   clear of 90, 120, 180, 210. */
  it('W-extra: no column-clear split at the fewest count -> one more cross-aisle', () => {
    const r = seg(300, { maxRunFt: 150, runGridFt: 30, runGridOffsetFt: 0, runGridMaxFt: 300 })
    expect(r.crossAisles).toHaveLength(2)
    expect(r.segments.map(s => s.bays)).toEqual([11, 11, 11])
    expect(r.crossAisles.map(a => a.xFt)).toEqual([91.5, 195.5])
    for (const a of r.crossAisles) expect(a.widthFt).toBeCloseTo(13, 9)
    // without columns the fewest count (one) stands
    expect(seg(300, { maxRunFt: 150 }).crossAisles).toHaveLength(1)
  })

  it('W-small: short runs keep exactly one cross-aisle', () => {
    for (const L of [60, 120, 150, 240]) expect(seg(L, { maxRunFt: 150 }).crossAisles).toHaveLength(1)
  })

  for (const orientation of ['horizontal', 'vertical']) {
    /* Through the generator: a 1,080 ft run (length for horizontal, width
     * for vertical), 120 ft across, 60 ft grid. Every row has the same
     * cross-aisles; every section <= 150 ft (or the given max). */
    const brief = (maxRunFt) => ({
      ...(orientation === 'horizontal' ? { lengthFt: 1080, widthFt: 120 } : { lengthFt: 120, widthFt: 1080 }),
      gridXFt: 60, gridYFt: 60, mhe: 'reach', orientation, rackType: 'rack_double_row',
      ...(maxRunFt ? { maxRunFt } : {}),
    })
    /* At 100 ft the fewest count (9) forces 10 x 12 bays exactly -- no
     * slide possible -- and cross-aisle 2 lands at 99.75 + 109.11 =
     * 208.86..218.47 ft, over the column at 210. So one more: 10. At 150 ft
     * the 6 cross-aisles slide clear of the 60 ft lines. */
    for (const [maxRunFt, count] of [[undefined, 6], [150, 6], [100, 10]]) {
      it(`W-gen ${orientation} max ${maxRunFt ?? 'default'}: ${count} aligned cross-aisles, sections <= ${maxRunFt ?? 150} ft`, () => {
        const rows = rowsOf(brief(maxRunFt))
        expect(rows.length).toBeGreaterThan(1)
        const ref = crossOf(rows[0])
        expect(ref).toHaveLength(count)
        for (const row of rows) {
          expect(crossOf(row).map(([a, b]) => [a.toFixed(6), b.toFixed(6)])).toEqual(ref.map(([a, b]) => [a.toFixed(6), b.toFixed(6)]))
          for (const [a, b] of row) expect(b - a).toBeLessThanOrEqual((maxRunFt ?? 150) + 1e-9)
          for (const [a, b] of crossOf(row)) expect(b - a).toBeGreaterThanOrEqual(9 - 1e-9)
          expect(row[0][0]).toBeCloseTo(0.5, 6)
          expect(row[row.length - 1][1]).toBeCloseTo(1079.5, 6)
        }
      })
    }
  }
})
