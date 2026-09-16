import { describe, it, expect } from 'vitest'
import {
  nextSelection, normalizeRect, rectsOverlap,
  objectsInMarquee, movedEnough, DRAG_THRESHOLD, movedIdsFor, objectCentre,
} from '../canvas2/selection'

describe('canvas2 selection — what a press selects', () => {
  const groups = [{ id: 'g1', ids: ['a', 'b', 'c'] }]

  it('replaces the selection with a fresh object', () => {
    expect(nextSelection({ selectedIds: ['x'], id: 'r1' }))
      .toEqual({ ids: ['r1'], replaced: true })
  })

  /* This is what makes dragging a multi-selection possible: pressing something
     already selected must not collapse the set first. */
  it('leaves an existing selection alone when pressing one of its members', () => {
    const r = nextSelection({ selectedIds: ['a', 'b'], id: 'a' })
    expect(r.replaced).toBe(false)
    expect(r.ids).toEqual(['a', 'b'])
  })

  it('shift adds an object and shift again removes it', () => {
    expect(nextSelection({ selectedIds: ['a'], id: 'b', shiftKey: true }).ids)
      .toEqual(['a', 'b'])
    expect(nextSelection({ selectedIds: ['a', 'b'], id: 'b', shiftKey: true }).ids)
      .toEqual(['a'])
  })

  it('selects the whole group when any member is pressed', () => {
    expect(nextSelection({ selectedIds: [], groups, id: 'b' }).ids).toEqual(['a', 'b', 'c'])
  })

  it('keeps the group as the unit even with shift', () => {
    expect(nextSelection({ selectedIds: ['z'], groups, id: 'c', shiftKey: true }).ids)
      .toEqual(['a', 'b', 'c'])
  })

  it('clears when nothing was pressed', () => {
    expect(nextSelection({ selectedIds: ['a'], id: null }))
      .toEqual({ ids: [], replaced: true })
  })
})

describe('canvas2 selection — marquee geometry', () => {
  it('normalizes a rect dragged in any direction', () => {
    const want = { x: 10, y: 20, width: 30, height: 40 }
    expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(want)
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(want)
    expect(normalizeRect({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(want)
  })

  it('detects overlap and non-overlap, including edge contact', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(rectsOverlap(a, { x: 20, y: 0, width: 5, height: 5 })).toBe(false)
    expect(rectsOverlap(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false) // touching only
  })
})

describe('canvas2 selection — what a marquee catches', () => {
  const objects = [
    { id: 'near', x: 0, y: 0, width: 100, height: 50 },
    { id: 'far', x: 500, y: 500, width: 100, height: 50 },
    // type matters: getObjectBounds only reads endpoints for a declared line
    { id: 'line', type: 'line', x1: 0, y1: 200, x2: 300, y2: 200 },
  ]

  /* Touch, not containment — a rack is longer than the screen at the zoom this
     canvas is used at, so demanding full enclosure would make marquee useless. */
  it('catches an object it merely touches', () => {
    expect(objectsInMarquee(objects, { x: 50, y: 20, width: 20, height: 20 }))
      .toEqual(['near'])
  })

  it('catches several, and leaves the rest', () => {
    const ids = objectsInMarquee(objects, { x: -10, y: -10, width: 400, height: 300 })
    expect(ids).toContain('near')
    expect(ids).toContain('line')
    expect(ids).not.toContain('far')
  })

  it('catches a zero-thickness line, which has no height to overlap', () => {
    expect(objectsInMarquee(objects, { x: 100, y: 190, width: 50, height: 20 }))
      .toEqual(['line'])
  })

  it('honours a visibility filter', () => {
    const ids = objectsInMarquee(objects, { x: -10, y: -10, width: 1000, height: 1000 },
      { isVisible: o => o.id !== 'far' })
    expect(ids).not.toContain('far')
    expect(ids).toHaveLength(2)
  })

  it('returns nothing for a degenerate marquee rather than selecting the sheet', () => {
    expect(objectsInMarquee(objects, { x: 0, y: 0, width: 0, height: 0 })).toEqual([])
    expect(objectsInMarquee(objects, null)).toEqual([])
  })
})

describe('canvas2 selection — drag threshold', () => {
  it('ignores a shaky click but accepts a real drag', () => {
    expect(movedEnough({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false)
    expect(movedEnough({ x: 0, y: 0 }, { x: DRAG_THRESHOLD, y: 0 })).toBe(true)
    expect(movedEnough({ x: 0, y: 0 }, { x: 40, y: 30 })).toBe(true)
  })
})

describe('canvas2 selection — what a move actually shifts', () => {
  const objects = [
    { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 900, height: 400 },
    { id: 'r1', type: 'rack_row', parentId: 'fp' },
    { id: 'r2', type: 'rack_row', parentId: 'fp' },
    { id: 'loose', type: 'rack_row' },
    { id: 'other', type: 'fp_rect' },
    { id: 'kid', type: 'rack_row', parentId: 'other' },
  ]

  it('moving a plain object moves only it', () => {
    expect([...movedIdsFor(objects, ['loose'])]).toEqual(['loose'])
  })

  /* The building carries its contents — the store cascades it, so the preview
     has to agree or the drag lands somewhere other than where it looked. */
  it('moving a floor plan carries its children', () => {
    const s = movedIdsFor(objects, ['fp'])
    expect(s.has('fp')).toBe(true)
    expect(s.has('r1')).toBe(true)
    expect(s.has('r2')).toBe(true)
  })

  it('carries only ITS children, not another building\u2019s', () => {
    const s = movedIdsFor(objects, ['fp'])
    expect(s.has('kid')).toBe(false)
    expect(s.has('loose')).toBe(false)
  })

  it('a child selected on its own does not drag the parent', () => {
    expect([...movedIdsFor(objects, ['r1'])]).toEqual(['r1'])
  })

  it('a multi-selection keeps every member', () => {
    const s = movedIdsFor(objects, ['loose', 'r1'])
    expect(s.size).toBe(2)
  })

  it('copes with nothing selected', () => {
    expect(movedIdsFor(objects, []).size).toBe(0)
    expect(movedIdsFor([], ['x']).size).toBe(1)
  })
})

describe('canvas2 selection — object centre', () => {
  it('uses the circle centre', () => {
    expect(objectCentre({ cx: 10, cy: 20, r: 5 })).toEqual({ x: 10, y: 20 })
  })

  it('uses the midpoint of a line', () => {
    expect(objectCentre({ x1: 0, y1: 0, x2: 100, y2: 50 })).toEqual({ x: 50, y: 25 })
  })

  it('uses the box centre for everything else', () => {
    expect(objectCentre({ x: 10, y: 20, width: 100, height: 40 })).toEqual({ x: 60, y: 40 })
  })

  it('copes with a box that has no size', () => {
    expect(objectCentre({ x: 7, y: 9 })).toEqual({ x: 7, y: 9 })
  })

  it('returns null for something with no position at all', () => {
    expect(objectCentre({ type: 'odd' })).toBeNull()
    expect(objectCentre(null)).toBeNull()
  })
})
