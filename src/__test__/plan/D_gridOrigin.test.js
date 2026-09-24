// TEST_PLAN.md §3D — grid origin ("Columns along wall").
import { describe, it, expect } from 'vitest'
import { columnGridObject, axisFrame, generateFixtures } from '../../generate/sizingLayout'
import { expandColumnGrid } from '../../generate/columnCheck'
import { R, GS, EPS } from './fixtures'

/** Distinct drawn column-line positions along world Y, in feet — read off
 *  expandColumnGrid, the same function ColumnGridShape renders from. */
function drawnYLinesFt(brief) {
  const grid = columnGridObject(brief, 0, 0)
  const ys = expandColumnGrid(grid, GS).map(c => +((c.y + c.h / 2) / GS).toFixed(6))
  return [...new Set(ys)].sort((a, b) => a - b)
}

describe('D — grid origin ("Columns along wall")', () => {
  for (const [id, brief] of Object.entries(R)) {
    it(`D-yes: ${id} — a column grid line sits on the wall (offset 0)`, () => {
      const lines = drawnYLinesFt({ ...brief, columnsAlongWall: true })
      expect(lines[0]).toBeCloseTo(0, 6)
    })

    it(`D-no: ${id} — first line is one full pitch (${brief.gridYFt}') in from the wall, no line on the wall`, () => {
      const lines = drawnYLinesFt({ ...brief, columnsAlongWall: false })
      expect(lines[0]).toBeCloseTo(brief.gridYFt, 6)
      expect(lines.some(y => Math.abs(y) < EPS)).toBe(false)
      expect(lines.some(y => Math.abs(y - brief.widthFt) < EPS)).toBe(false)
    })
  }

  /* The drawn grid's lines must be exactly the lines the rack-avoidance
   * math uses. rowBands walks the stack axis and rowSegments the run axis,
   * each from line #0 (…OffsetFt) every pitch up to the last line
   * (…MaxFt), as fed by axisFrame. World Y carries gridYFt (the stack axis
   * horizontally, the run axis vertically); world X carries gridXFt. */
  const avoidanceLines = (offset, pitch, max) => {
    const out = []
    for (let v = offset; v <= max + 1e-9; v += pitch) out.push(+v.toFixed(6))
    return out
  }
  const drawnXLinesFt = (brief) => {
    const grid = columnGridObject(brief, 0, 0)
    const xs = expandColumnGrid(grid, GS).map(c => +((c.x + c.w / 2) / GS).toFixed(6))
    return [...new Set(xs)].sort((a, b) => a - b)
  }
  for (const id of ['R1', 'R3']) {
    for (const orientation of ['horizontal', 'vertical']) {
      for (const columnsAlongWall of [true, false]) {
        it(`D-sync: ${id} ${orientation}, wall=${columnsAlongWall ? 'Yes' : 'No'} — drawn lines == avoidance lines, both axes`, () => {
          const brief = { ...R[id], orientation, columnsAlongWall }
          const f = axisFrame(orientation, brief)
          const vertical = orientation === 'vertical'
          const y = vertical ? [f.runGridOffsetFt, f.runGridFt, f.runGridMaxFt] : [f.stackGridOffsetFt, f.stackGridFt, f.stackGridMaxFt]
          const x = vertical ? [f.stackGridOffsetFt, f.stackGridFt, f.stackGridMaxFt] : [f.runGridOffsetFt, f.runGridFt, f.runGridMaxFt]
          expect(y[1]).toBe(brief.gridYFt)
          expect(x[1]).toBe(brief.gridXFt)
          expect(drawnYLinesFt(brief)).toEqual(avoidanceLines(...y))
          expect(drawnXLinesFt(brief)).toEqual(avoidanceLines(...x))
        })
      }
    }
  }

  /* BOTH axes follow the same rule (TEST_PLAN.md §3D, clarified
   * 2026-09-24): Yes -> line #0 on the near wall on each axis; No -> line #0
   * one full pitch in on each axis (gridXFt from left/right, gridYFt from
   * top/bottom) and no column on any of the four walls. Checked on the
   * drawn grid AND on the avoidance lines axisFrame gives that orientation. */
  const onWall = (v, wallFt) => Math.abs(v) < EPS || Math.abs(v - wallFt) < EPS
  for (const [id, base] of Object.entries(R)) {
    for (const orientation of ['horizontal', 'vertical']) {
      for (const columnsAlongWall of [true, false]) {
        it(`D-axes: ${id} ${orientation}, wall=${columnsAlongWall ? 'Yes' : 'No'} — origin rule on X and Y, drawn and avoided`, () => {
          const brief = { ...base, orientation, columnsAlongWall }
          const f = axisFrame(orientation, brief)
          const vertical = orientation === 'vertical'
          const avoidX = vertical ? [f.stackGridOffsetFt, f.stackGridFt, f.stackGridMaxFt] : [f.runGridOffsetFt, f.runGridFt, f.runGridMaxFt]
          const avoidY = vertical ? [f.runGridOffsetFt, f.runGridFt, f.runGridMaxFt] : [f.stackGridOffsetFt, f.stackGridFt, f.stackGridMaxFt]
          const axes = [
            { lines: drawnXLinesFt(brief), avoid: avoidanceLines(...avoidX), pitch: brief.gridXFt, wall: brief.lengthFt },
            { lines: drawnYLinesFt(brief), avoid: avoidanceLines(...avoidY), pitch: brief.gridYFt, wall: brief.widthFt },
          ]
          for (const { lines, avoid, pitch, wall } of axes) {
            for (const set of [lines, avoid]) {
              if (columnsAlongWall) {
                expect(set[0]).toBeCloseTo(0, 6)
              } else {
                expect(set[0]).toBeCloseTo(pitch, 6)
                expect(set.some(v => onWall(v, wall))).toBe(false)
              }
            }
          }
        })
      }
    }
  }

  // 240×120 / 25×30, hand-listed: 240/25 = 9.6 -> 9 whole pitches, last line 225.
  it('D-values: 240x120 / 25x30, "Yes" — X lines 0..225 every 25\', Y lines 0..120 every 30\'', () => {
    const b = { ...R.R1, columnsAlongWall: true }
    expect(drawnXLinesFt(b)).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 225])
    expect(drawnYLinesFt(b)).toEqual([0, 30, 60, 90, 120])
  })

  it('D-values: 240x120 / 25x30, "No" — X lines 25..225 (25\' off the left wall), Y lines 30..90 (no far-wall line)', () => {
    const b = { ...R.R1, columnsAlongWall: false }
    expect(drawnXLinesFt(b)).toEqual([25, 50, 75, 100, 125, 150, 175, 200, 225])
    expect(drawnYLinesFt(b)).toEqual([30, 60, 90])
  })

  for (const columnsAlongWall of [true, false]) {
    it(`D-one-grid: exactly one column_grid per generation (wall=${columnsAlongWall ? 'Yes' : 'No'})`, () => {
      const fx = generateFixtures({ ...R.R1, columnsAlongWall }, 0, 0)
      expect(fx.filter(o => o.type === 'column_grid')).toHaveLength(1)
    })
  }
})
