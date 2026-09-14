import { describe, it, expect } from 'vitest'
import { stubGenerateLayout, placementToObject, parentGenerated } from '../generate/traceGenerate'
import { getLayoutCapacity, getRackCapacity } from '../utils/capacity'

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
