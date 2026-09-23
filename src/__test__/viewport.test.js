import { describe, it, expect } from 'vitest'
import {
  clampZoom, screenToWorld, worldToScreen, zoomAtPoint, wheelFactor,
  fitView, worldBounds, ZOOM_MIN, ZOOM_MAX,
} from '../canvas2/viewport'

const view = { zoom: 0.07, panX: 320, panY: 180 }

describe('canvas2 viewport — the transform', () => {
  it('round-trips a point through world and back', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 640, y: 400 }, { x: -120, y: 55.5 }]) {
      const back = worldToScreen(view, screenToWorld(view, p))
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
  })

  it('places a world point exactly where screen = world * zoom + pan', () => {
    const s = worldToScreen(view, { x: 1000, y: -400 })
    expect(s.x).toBeCloseTo(1000 * 0.07 + 320, 6)
    expect(s.y).toBeCloseTo(-400 * 0.07 + 180, 6)
  })
})

describe('canvas2 viewport — zoom keeps the cursor pinned', () => {
  /* The one behaviour that makes zooming usable on a 1,080ft building: the
     thing under the pointer must not move. */
  it('holds the world point under the cursor still, zooming in', () => {
    const cursor = { x: 500, y: 300 }
    const before = screenToWorld(view, cursor)
    const next = zoomAtPoint(view, cursor, 1.25)
    const after = screenToWorld(next, cursor)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('holds it still zooming out too, and at an off-centre cursor', () => {
    for (const cursor of [{ x: 12, y: 8 }, { x: 1380, y: 860 }]) {
      for (const f of [0.8, 0.5, 2, 4]) {
        const before = screenToWorld(view, cursor)
        const after = screenToWorld(zoomAtPoint(view, cursor, f), cursor)
        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
      }
    }
  })

  it('survives a long run of zooms without drifting', () => {
    const cursor = { x: 733, y: 421 }
    const anchor = screenToWorld(view, cursor)
    let v = view
    for (let i = 0; i < 60; i++) v = zoomAtPoint(v, cursor, i % 2 ? 1.1 : 0.95)
    const after = screenToWorld(v, cursor)
    expect(after.x).toBeCloseTo(anchor.x, 4)
    expect(after.y).toBeCloseTo(anchor.y, 4)
  })

  it('clamps to the zoom range and then stops moving entirely', () => {
    const cursor = { x: 200, y: 200 }
    let v = { zoom: ZOOM_MAX, panX: 10, panY: 20 }
    expect(zoomAtPoint(v, cursor, 2)).toBe(v)          // same object: a no-op
    v = { zoom: ZOOM_MIN, panX: 10, panY: 20 }
    expect(zoomAtPoint(v, cursor, 0.5)).toBe(v)
  })

  it('never leaves the range even from a wild factor', () => {
    expect(zoomAtPoint(view, { x: 0, y: 0 }, 1e6).zoom).toBe(ZOOM_MAX)
    expect(zoomAtPoint(view, { x: 0, y: 0 }, 1e-6).zoom).toBe(ZOOM_MIN)
  })

  it('clampZoom copes with rubbish', () => {
    expect(clampZoom(NaN)).toBe(1)
    expect(clampZoom(undefined)).toBe(1)
    expect(clampZoom(0)).toBe(ZOOM_MIN)
  })
})

describe('canvas2 viewport — wheel', () => {
  it('zooms in scrolling up and out scrolling down', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1)
    expect(wheelFactor(100)).toBeLessThan(1)
  })

  it('is proportional — the same notch is the same ratio at any zoom', () => {
    const f = wheelFactor(-100)
    const lo = zoomAtPoint({ zoom: 0.07, panX: 0, panY: 0 }, { x: 0, y: 0 }, f)
    const hi = zoomAtPoint({ zoom: 2.0, panX: 0, panY: 0 }, { x: 0, y: 0 }, f)
    expect(lo.zoom / 0.07).toBeCloseTo(hi.zoom / 2.0, 6)
  })

  it('treats line-mode deltas as larger than pixel-mode', () => {
    expect(wheelFactor(-3, 1)).toBeGreaterThan(wheelFactor(-3, 0))
  })

  it('caps one violent flick so it cannot cross the whole range', () => {
    expect(wheelFactor(-100000)).toBe(wheelFactor(-240))
    expect(wheelFactor(100000)).toBe(wheelFactor(240))
  })
})

describe('canvas2 viewport — fit', () => {
  const size = { w: 1200, h: 800 }

  it('centres the rect in the viewport', () => {
    const rect = { x: -4800, y: -2400, width: 9600, height: 4800 }
    const v = fitView(rect, size)
    const c = worldToScreen(v, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
    expect(c.x).toBeCloseTo(size.w / 2, 6)
    expect(c.y).toBeCloseTo(size.h / 2, 6)
  })

  it('fits entirely inside, with a margin', () => {
    const rect = { x: 0, y: 0, width: 9600, height: 4800 }
    const v = fitView(rect, size)
    const tl = worldToScreen(v, { x: rect.x, y: rect.y })
    const br = worldToScreen(v, { x: rect.x + rect.width, y: rect.y + rect.height })
    expect(tl.x).toBeGreaterThan(0)
    expect(tl.y).toBeGreaterThan(0)
    expect(br.x).toBeLessThan(size.w)
    expect(br.y).toBeLessThan(size.h)
  })

  it('a 1,080 x 410 ft building lands near the working zoom', () => {
    const GS = 40
    const rect = { x: 0, y: 0, width: 1080 * GS, height: 410 * GS }
    const v = fitView(rect, { w: 1440, h: 900 })
    // whole-building view is a single-digit percentage — the zoom that matters
    expect(v.zoom).toBeGreaterThan(0.02)
    expect(v.zoom).toBeLessThan(0.10)
  })

  it('refuses a degenerate rect or viewport rather than dividing by zero', () => {
    expect(fitView(null, size)).toBeNull()
    expect(fitView({ x: 0, y: 0, width: 0, height: 10 }, size)).toBeNull()
    expect(fitView({ x: 0, y: 0, width: 10, height: 10 }, { w: 0, h: 0 })).toBeNull()
  })
})

describe('canvas2 viewport — world bounds', () => {
  it('measures rect-ish objects', () => {
    expect(worldBounds([
      { x: 10, y: 20, width: 100, height: 50 },
      { x: -40, y: 0, width: 10, height: 10 },
    ])).toEqual({ x: -40, y: 0, width: 150, height: 70 })
  })

  it('measures lines by their endpoints', () => {
    expect(worldBounds([{ x1: 5, y1: 5, x2: 25, y2: 15 }]))
      .toEqual({ x: 5, y: 5, width: 20, height: 10 })
  })

  it('measures circles by their extent', () => {
    expect(worldBounds([{ cx: 100, cy: 100, r: 10 }]))
      .toEqual({ x: 90, y: 90, width: 20, height: 20 })
  })

  it('returns null when there is nothing to measure', () => {
    expect(worldBounds([])).toBeNull()
    expect(worldBounds([{ type: 'nonsense' }])).toBeNull()
  })

  it('measures a column_grid by its expanded columns, not its own x/y point', () => {
    // A column grid carries no width/height of its own — the generic x/y
    // fallback would collapse it to a single point (x,y) and dominate a
    // fit-to-content with almost nothing on screen (the exact bug this fixes).
    const cg = { type: 'column_grid', x: 0, y: 0, spacingX: [50, 50], spacingY: [50], columnW: 4, columnH: 4 }
    const b = worldBounds([cg], 40)
    // Grid lines are column centrelines (expandColumnGrid), so the first and
    // last columns each spill half their own width/height past the grid's
    // own x/y — the total span is unchanged, just centred on it instead of
    // starting at it.
    expect(b.x).toBe(-2)
    expect(b.y).toBe(-2)
    expect(b.width).toBe(100 + 4)   // two 50ft bays + the last column's own width
    expect(b.height).toBe(50 + 4)
  })

  it('unions a column_grid with the rest of the scene', () => {
    const cg = { type: 'column_grid', x: 0, y: 0, spacingX: [50], spacingY: [50], columnW: 4, columnH: 4 }
    const rack = { x: 200, y: 200, width: 10, height: 10 }
    const b = worldBounds([cg, rack], 40)
    expect(b.width).toBeGreaterThan(200)
    expect(b.height).toBeGreaterThan(200)
  })
})
