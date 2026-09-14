import { describe, it, expect } from 'vitest'
import {
  sizingSheetLayout, rowBands, rowSegments, baysInRun,
  columnGridObject, dockDoorObjects, stagingObjects,
} from '../generate/sizingLayout'
import { placementToObject } from '../generate/traceGenerate'
import { checkColumns, expandColumnGrid, MHE_PROFILES } from '../generate/columnCheck'

const GS = 40

/* The reference sizing sheet: 240 × 120, 12.5' aisles, 60' staging. */
const brief = {
  lengthFt: 240, widthFt: 120,
  rackType: 'rack_double_row',
  beamIn: 96, depthIn: 42, levels: 4,
  aisleFt: 12.5, speedBayFt: 60,
  gridXFt: 50, gridYFt: 54, dockDoors: 3,
}

describe('sizingLayout — rows down the depth', () => {
  const bands = rowBands(brief.widthFt, brief)

  it('puts a single row hard against the top and bottom walls', () => {
    expect(bands[0].type).toBe('rack_row')
    expect(bands[0].yFt).toBe(0)
    const last = bands[bands.length - 1]
    expect(last.type).toBe('rack_row')
    expect(last.yFt + last.depthFt).toBeCloseTo(brief.widthFt, 6)
  })

  it('fills the middle with the requested rack type', () => {
    const middle = bands.slice(1, -1)
    expect(middle.length).toBeGreaterThan(0)
    for (const b of middle) expect(b.type).toBe('rack_double_row')
  })

  it('leaves a full aisle between every row', () => {
    for (let i = 0; i < bands.length - 1; i++) {
      const gap = bands[i + 1].yFt - (bands[i].yFt + bands[i].depthFt)
      expect(gap).toBeGreaterThanOrEqual(brief.aisleFt - 1e-6)
    }
  })

  it('never runs past the back wall', () => {
    for (const b of bands) expect(b.yFt + b.depthFt).toBeLessThanOrEqual(brief.widthFt + 1e-6)
  })

  it('single-row briefs keep single rows all the way down', () => {
    const single = rowBands(brief.widthFt, { ...brief, rackType: 'rack_row' })
    for (const b of single) expect(b.type).toBe('rack_row')
  })
})

describe('sizingLayout — segments across the length', () => {
  const { segments, bays, crossAisle } = rowSegments(brief.lengthFt, {
    ...brief, crossAisleFt: brief.aisleFt, endClearFt: 4,
  })

  it('splits each row in two around one centre cross-aisle', () => {
    expect(segments).toHaveLength(2)
    expect(crossAisle).not.toBeNull()
  })

  it('starts the racking after the staging strip', () => {
    expect(segments[0]).toBe(brief.speedBayFt)
  })

  it('leaves the cross-aisle clear between the two segments', () => {
    const segWidthFt = (bays * (96 + 3) + 3) / 12
    const gap = segments[1] - (segments[0] + segWidthFt)
    expect(gap).toBeGreaterThanOrEqual(brief.aisleFt - 1e-6)
  })

  it('halves bays per object versus one undivided run', () => {
    const whole = baysInRun(brief.lengthFt - brief.speedBayFt - 4, brief.beamIn)
    expect(bays).toBeLessThan(whole)
  })
})

describe('sizingLayout — placements', () => {
  const placements = sizingSheetLayout(brief)

  it('emits one placement per row per segment', () => {
    const bands = rowBands(brief.widthFt, brief)
    expect(placements).toHaveLength(bands.length * 2)
  })

  it('never places a rack inside the staging strip', () => {
    for (const p of placements) expect(p.xFt).toBeGreaterThanOrEqual(brief.speedBayFt)
  })

  it('every placement survives the object factory as a renderable rack', () => {
    for (const p of placements) {
      const o = placementToObject(p)
      expect(o.type).toMatch(/^rack_/)
      expect(Array.isArray(o.beams)).toBe(true)
      expect(o.beams.length).toBeGreaterThan(0)
      expect(o.width).toBeGreaterThan(0)
    }
  })

  it('returns nothing rather than overflowing a building too small to fill', () => {
    expect(sizingSheetLayout({ ...brief, lengthFt: 40, widthFt: 8 })).toEqual([])
  })
})

describe('sizingLayout — fixtures', () => {
  it('builds a column grid on the requested spacing, centred in the building', () => {
    const g = columnGridObject(brief, 0, 0)
    expect(g.type).toBe('column_grid')
    expect(g.spacingX.every(s => s === brief.gridXFt * GS)).toBe(true)
    expect(g.spacingY.every(s => s === brief.gridYFt * GS)).toBe(true)
    // centred: equal margin either side
    const spanX = g.spacingX.reduce((a, b) => a + b, 0)
    expect(g.x).toBeCloseTo((brief.lengthFt * GS - spanX) / 2, 6)
  })

  it('places the requested number of dock doors, spread along the wall', () => {
    const doors = dockDoorObjects(brief, 0, 0)
    expect(doors).toHaveLength(3)
    const ys = doors.map(d => d.y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)          // in order
    for (const d of doors) {
      expect(d.type).toBe('struct_loading_dock')
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.y + d.height).toBeLessThanOrEqual(brief.widthFt * GS)
    }
  })

  it('draws the staging boundary dashed, and labels the strip', () => {
    const [rule, label] = stagingObjects(brief, 0, 0)
    expect(rule.type).toBe('line')
    expect(rule.strokeDasharray).toBeTruthy()
    expect(rule.x1).toBe(brief.speedBayFt * GS)
    expect(rule.x1).toBe(rule.x2)                               // vertical
    expect(label.text).toBe('STAGING')
    expect(label.rotation).toBe(-90)
  })

  it('omits the grid when spacing is zero rather than emitting a degenerate one', () => {
    expect(columnGridObject({ ...brief, gridXFt: 0 }, 0, 0)).toBeNull()
  })
})

describe('sizingLayout — feeds the column check', () => {
  it('produces a layout whose columns the check can actually evaluate', () => {
    const racks = sizingSheetLayout(brief).map(placementToObject)
    const columns = expandColumnGrid(columnGridObject(brief, 0, 0), GS)
    expect(columns.length).toBeGreaterThan(0)

    const res = checkColumns({ racks, columns, profile: MHE_PROFILES.counterbalance, gridSize: GS })
    expect(res.summary.profile).toBe('Counterbalance')
    // every red mark must be a real rect the overlay can draw
    for (const m of res.redMarks) {
      expect(m.w).toBeGreaterThan(0)
      expect(m.h).toBeGreaterThan(0)
      expect(['rack-column', 'aisle-blocked']).toContain(m.kind)
    }
  })
})
