import { describe, it, expect } from 'vitest'
import { stubGenerateLayout, placementToObject, parentGenerated, aisleObjectsForRacks, pickOrientation } from '../generate/traceGenerate'
import { getLayoutCapacity, getRackCapacity } from '../utils/capacity'
import { sizingSheetLayout } from '../generate/sizingLayout'
import { rackFootprint } from '../generate/columnCheck'
import { DEFAULT_RULES } from '../rules/defaults'

describe('traceGenerate — stub layout → real objects → derived capacity', () => {
  const brief = { lengthFt: 240, widthFt: 140, rackType: 'rack_double_row', aisleFt: 11, levels: 4 }
  const placements = stubGenerateLayout(brief)
  const objects = placements.map(placementToObject)

  it('produces at least one row of racks', () => {
    expect(placements.length).toBeGreaterThan(0)
  })

  it('every placed object is a renderable rack (fill, stroke, type, beams)', () => {
    for (const o of objects) {
      expect(o.type).toBe('rack_double_row')
      expect(o.fill).toBeTruthy()
      expect(o.stroke).toBeTruthy()
      expect(Array.isArray(o.beams)).toBe(true)
      expect(o.beams.length).toBeGreaterThan(0)
      expect(o.levels).toBe(4)
    }
  })

  it('width is derived from beams the same way the panel computes it', () => {
    const o = objects[0]
    const upIn = o.uprightWidth
    const totalIn = upIn * (o.beams.length + 1) + o.beams.reduce((s, b) => s + b, 0)
    expect(o.width).toBeCloseTo((totalIn / 12) * 40, 5)
  })

  it('capacity read off placed racks is > 0 and matches per-rack sum', () => {
    const { total } = getLayoutCapacity(objects)
    const perRack = objects.reduce((s, o) => s + (getRackCapacity(o)?.total || 0), 0)
    expect(total).toBe(perRack)
    expect(total).toBeGreaterThan(0)
  })
})

/* The building carries its contents when it is dragged, and it can only do
   that through parentId — moveObjects cascades on exactly that field. */
describe('traceGenerate — generated objects belong to the building', () => {
  const queue = [
    { type: 'rack_double_row', x: 10, y: 20 },
    { type: 'struct_loading_dock', x: 30, y: 40 },
    { type: 'text', x: 50, y: 60 },
    { type: 'column_grid', x: 0, y: 0 },
  ]

  it('adopts every generated object into the floor plan', () => {
    for (const o of parentGenerated(queue, 'fp1')) expect(o.parentId).toBe('fp1')
  })

  /* The columns are the building's structure and checkColumns measures racks
     against them, so a building that moved without them would invalidate every
     check. CanvasArea re-parents a column grid on its first move anyway. */
  it('adopts the column grid too, so the columns travel with the building', () => {
    const grid = parentGenerated(queue, 'fp1').find(o => o.type === 'column_grid')
    expect(grid.parentId).toBe('fp1')
  })

  it('adopts racks AND fixtures — a dock door is part of the building too', () => {
    const out = parentGenerated(queue, 'fp1')
    expect(out.find(o => o.type === 'struct_loading_dock').parentId).toBe('fp1')
    expect(out.find(o => o.type === 'text').parentId).toBe('fp1')
  })

  it('is a no-op when no building was placed, rather than stamping undefined', () => {
    expect(parentGenerated(queue, undefined)).toEqual(queue)
    expect(parentGenerated(queue, null)).toEqual(queue)
  })

  it('does not mutate the objects handed to it', () => {
    const before = JSON.parse(JSON.stringify(queue))
    parentGenerated(queue, 'fp1')
    expect(queue).toEqual(before)
  })

  it('keeps every other field intact', () => {
    const out = parentGenerated(queue, 'fp1')
    expect(out[0]).toMatchObject({ type: 'rack_double_row', x: 10, y: 20 })
    expect(out).toHaveLength(queue.length)
  })
})

describe('traceGenerate — BUG 47: pickOrientation runs both and returns the denser one', () => {
  it('240x120/25x30/reach: the reported winner has the larger USABLE total, and auto places exactly what the manual toggle for that orientation would', () => {
    const brief = {
      lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
      aisleFt: 10.5, gridXFt: 25, gridYFt: 30, dockDoors: 3, levels: 4, mhe: 'reach',
    }
    const pick = pickOrientation(brief, sizingSheetLayout, DEFAULT_RULES)
    // Exact totals are deliberately NOT pinned here: they have changed with
    // every generator fix (flue, wall clearance, grid origin), and the
    // confirmed reference totals live in TEST_PLAN.md §2, pending PP.
    const winnerUsable = pick.orientation === 'vertical' ? pick.verticalUsable : pick.horizontalUsable
    expect(winnerUsable).toBe(Math.max(pick.horizontalUsable, pick.verticalUsable))
    // The winning placements are the orientation's own real output, not a
    // re-derivation — auto mode must place exactly what the manual toggle
    // would have.
    expect(pick.placements).toEqual(sizingSheetLayout({ ...brief, orientation: pick.orientation }, DEFAULT_RULES))
  })

  it('picks whichever orientation scores more — proven with a fake generateLayout, independent of real geometry', () => {
    const rack = (bays) => [{ type: 'rack_row', xFt: 0, yFt: 0, bays, beamIn: 96, depthIn: 42, levels: 4, palletWIn: 48, angle: 0 }]
    const fake = (brief) => brief.orientation === 'vertical' ? rack(5) : rack(1)
    const pick = pickOrientation({}, fake, DEFAULT_RULES)
    expect(pick.orientation).toBe('vertical')
    expect(pick.verticalTotal).toBeGreaterThan(pick.horizontalTotal)
  })

  it('ties keep horizontal, the long-standing default', () => {
    const rack = (bays) => [{ type: 'rack_row', xFt: 0, yFt: 0, bays, beamIn: 96, depthIn: 42, levels: 4, palletWIn: 48, angle: 0 }]
    const fake = () => rack(2)   // identical output regardless of orientation
    const pick = pickOrientation({}, fake, DEFAULT_RULES)
    expect(pick.orientation).toBe('horizontal')
    expect(pick.horizontalTotal).toBe(pick.verticalTotal)
  })

  it('is pure — runs both candidates without touching the store', () => {
    // No store import/mock here at all: if pickOrientation ever reached for
    // useCanvasStore, this test file would need one and this call would
    // throw well before any expectation ran.
    const brief = { lengthFt: 240, widthFt: 120, rackType: 'rack_double_row', aisleFt: 10.5, gridXFt: 25, gridYFt: 30, mhe: 'reach' }
    expect(() => pickOrientation(brief, sizingSheetLayout, DEFAULT_RULES)).not.toThrow()
  })
})

/* BUG 45: aisleObjectsForRacks used to group by raw stored x and pair by raw
   stored y — correct only for unrotated (horizontal) racks. A 90°-rotated
   vertical rack's raw x is per-BAND, not per-run, so the old grouping paired
   a row's own two run-segments (a real but irrelevant cross-aisle) instead of
   true adjacent bands, and reported that gap's raw (unrotated) width — ~57ft
   on the 240x120/25x30/reach spec, instead of the true ~10.5-17.5ft tight-
   packed band-to-band gaps. Fixed via the same rackFootprint/groupBySegment
   BUG 41 already built for column-checking rotated racks. */
describe('traceGenerate — BUG 45: aisleObjectsForRacks is rotation-aware', () => {
  const spec = {
    lengthFt: 240, widthFt: 120, rackType: 'rack_double_row',
    aisleFt: 10.5, gridXFt: 25, gridYFt: 30, dockDoors: 3, levels: 4, mhe: 'reach',
  }

  // AisleLabel's own math (DimensionLabels.jsx), sourced from the same
  // rackFootprint the fixed component itself uses.
  function aisleWidthFt(row1, row2) {
    const f1 = rackFootprint(row1), f2 = rackFootprint(row2)
    const r1 = { x: f1.x, y: f1.y, r: f1.x + f1.w, b: f1.y + f1.h }
    const r2 = { x: f2.x, y: f2.y, r: f2.x + f2.w, b: f2.y + f2.h }
    const yGap = Math.max(r2.x - r1.r, r1.x - r2.r)
    const xGap = Math.max(r2.y - r1.b, r1.y - r2.b)
    if (xGap >= yGap) {
      const [top, bottom] = r1.b < r2.y ? [r1, r2] : [r2, r1]
      return (bottom.y - top.b) / 40
    }
    const [left, right] = r1.r < r2.x ? [r1, r2] : [r2, r1]
    return (right.x - left.r) / 40
  }

  it('vertical: every aisle stays tight to the forklift aisle, never blows out to a segment-length gap', () => {
    const racks = sizingSheetLayout({ ...spec, orientation: 'vertical' }, DEFAULT_RULES).map(placementToObject)
    const byId = new Map(racks.map(r => [r.id, r]))
    const aisles = aisleObjectsForRacks(racks)
    expect(aisles.length).toBeGreaterThan(0)
    for (const a of aisles) {
      const w = aisleWidthFt(byId.get(a.row1Id), byId.get(a.row2Id))
      expect(w).toBeGreaterThanOrEqual(spec.aisleFt - 1e-6)
      expect(w).toBeLessThan(spec.aisleFt * 3)   // old bug: ~57-61ft, ~5-6x aisleFt
    }
  })

  it('vertical: aisle count matches (bands-1) per run segment, not one bogus cross-aisle per band', () => {
    const racks = sizingSheetLayout({ ...spec, orientation: 'vertical' }, DEFAULT_RULES).map(placementToObject)
    const aisles = aisleObjectsForRacks(racks)
    // Every band is split into exactly 2 segments by the cross-aisle, so
    // bands = racks / 2, and each segment has (bands - 1) gaps: aisles =
    // 2 x (bands - 1). The pre-BUG-45 bug gave one aisle PER BAND instead
    // (pairing a band's own two segment-halves across the cross-aisle).
    // The band count itself is not pinned — it follows every generator fix.
    expect(racks.length % 2).toBe(0)
    const bands = racks.length / 2
    expect(bands).toBeGreaterThan(2)
    expect(aisles.length).toBe(2 * (bands - 1))
  })

  it('horizontal: unaffected by the fix (same tight-packed widths as before)', () => {
    const racks = sizingSheetLayout({ ...spec, orientation: 'horizontal' }, DEFAULT_RULES).map(placementToObject)
    const byId = new Map(racks.map(r => [r.id, r]))
    const aisles = aisleObjectsForRacks(racks)
    expect(aisles.length).toBeGreaterThan(0)
    for (const a of aisles) {
      const w = aisleWidthFt(byId.get(a.row1Id), byId.get(a.row2Id))
      expect(w).toBeGreaterThanOrEqual(spec.aisleFt - 1e-6)
      expect(w).toBeLessThan(spec.aisleFt * 3)
    }
  })
})
