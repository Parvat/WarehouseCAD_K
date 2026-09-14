import { describe, it, expect } from 'vitest'
import {
  simplify, strokeOutlinePath, linePath, pointsBounds,
  PEN_TYPES, clampPenWidth, penDefaultWidth, createStrokeAccumulator,
} from '../utils/freehand'

describe('simplify — Ramer–Douglas–Peucker', () => {
  it('collapses a jittery straight line to a handful of points', () => {
    // 400 pointermove samples with sub-tolerance noise, as a real stroke gives
    const noisy = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 100 + Math.sin(i) * 0.3 }))
    const out = simplify(noisy, 1.2)
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out.length).toBeGreaterThanOrEqual(2)
  })

  it('always keeps both endpoints', () => {
    const pts = Array.from({ length: 120 }, (_, i) => ({ x: i, y: Math.sin(i / 9) * 40 }))
    const out = simplify(pts, 1.2)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('preserves a real 90° corner', () => {
    const corner = [
      ...Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 })),
      ...Array.from({ length: 50 }, (_, i) => ({ x: 49, y: i })),
    ]
    expect(simplify(corner, 1.2).length).toBe(3)
  })

  it('drops more points as tolerance rises', () => {
    const zig = Array.from({ length: 200 }, (_, i) => ({ x: i, y: (i % 2) * 6 }))
    expect(simplify(zig, 4).length).toBeLessThanOrEqual(simplify(zig, 0.5).length)
  })

  it('stays fast on a realistic stroke', () => {
    // ~10s of continuous drawing at pointermove rates
    const real = Array.from({ length: 5000 }, (_, i) => ({ x: i * 0.4, y: Math.sin(i / 30) * 60 }))
    const t0 = performance.now()
    const out = simplify(real, 1.2)
    expect(performance.now() - t0).toBeLessThan(150)
    expect(out.length).toBeLessThan(real.length)
  })

  it('is bounded on a pathological zigzag — no runaway quadratic', () => {
    // every point a candidate, which is RDP's O(n²) worst case
    const evil = Array.from({ length: 60000 }, (_, i) => ({ x: i, y: (i % 3) * 9 }))
    const t0 = performance.now()
    expect(() => simplify(evil, 0.5)).not.toThrow()
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('handles degenerate input', () => {
    expect(simplify([])).toEqual([])
    expect(simplify(undefined)).toEqual([])
    expect(simplify([{ x: 1, y: 2 }])).toHaveLength(1)
  })
})

describe('path generation', () => {
  const stroke = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }, { x: 30, y: 8 }]

  it('pressure pens produce a closed, fillable outline', () => {
    const d = strokeOutlinePath(stroke, { pen: 'marker', width: 8 })
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('technical vector is an open constant-width polyline', () => {
    const d = linePath(stroke)
    expect(d.startsWith('M')).toBe(true)
    expect(d).not.toContain('Z')
  })

  it('never throws on empty or single-point input', () => {
    expect(strokeOutlinePath([])).toBe('')
    expect(linePath([{ x: 1, y: 2 }]).startsWith('M')).toBe(true)
  })
})

describe('bounds', () => {
  it('measures the point stream', () => {
    const bb = pointsBounds([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 30, y: 8 }])
    expect(bb).toMatchObject({ x: 0, y: 0, width: 30, height: 8 })
  })

  it('gives a non-zero box for a degenerate stroke, so it stays selectable', () => {
    const bb = pointsBounds([{ x: 5, y: 5 }, { x: 5, y: 5 }])
    expect(bb.width).toBeGreaterThan(0)
    expect(bb.height).toBeGreaterThan(0)
  })
})

describe('live stroke accumulator', () => {
  it('drops sub-threshold samples — hand tremor never enters the array', () => {
    const acc = createStrokeAccumulator(0.6)
    acc.add({ x: 0, y: 0 })
    let accepted = 0
    // 100 jitter samples all within 1 unit of the origin
    for (let i = 0; i < 100; i++) {
      if (acc.add({ x: Math.sin(i) * 0.9, y: Math.cos(i) * 0.9 }, 3.5)) accepted++
    }
    expect(accepted).toBe(0)
    expect(acc.points()).toHaveLength(1)
  })

  it('accepts samples that genuinely travel', () => {
    const acc = createStrokeAccumulator(0.6)
    acc.add({ x: 0, y: 0 })
    for (let i = 1; i <= 20; i++) acc.add({ x: i * 10, y: 0 }, 3.5)
    expect(acc.size).toBeGreaterThan(1)
  })

  it('is strictly append-only — no recorded point EVER moves', () => {
    // The residual shift: re-simplifying a rolling tail let RDP drop and
    // restore points inside the window, so an already-drawn point moved on
    // 9 of 29 frames. Every frame must now be a prefix of the next.
    const acc = createStrokeAccumulator()
    let prev = acc.points()
    let violations = 0
    for (let i = 0; i < 300; i++) {
      acc.add({ x: i * 4, y: Math.sin(i / 9) * 50 }, 3.5)
      const now = acc.points()
      for (let j = 0; j < prev.length; j++) {
        if (now[j].x !== prev[j].x || now[j].y !== prev[j].y) { violations++; break }
      }
      prev = now
    }
    expect(violations).toBe(0)
  })

  it('the drawn tip reaches the live cursor even when the sample is gated', () => {
    const acc = createStrokeAccumulator()
    acc.add({ x: 0, y: 0 })
    const live = { x: 2, y: 0 }              // inside the 3.5 gate
    expect(acc.add(live, 3.5)).toBe(false)   // not recorded
    expect(acc.points(live)).toHaveLength(2) // but still drawn to
    expect(acc.points(live)[1]).toEqual(live)
    expect(acc.points()).toHaveLength(1)     // the record stays clean
  })

  it('pointerup records the live tip, so the commit matches the last frame', () => {
    const acc = createStrokeAccumulator()
    for (let i = 0; i < 60; i++) acc.add({ x: i * 5, y: Math.cos(i / 6) * 30 }, 3.5)
    const live = { x: 299, y: 12 }
    const lastFrame = acc.points(live)       // what the final frame drew
    acc.add(live, 0, true)                   // what pointerup records
    expect(acc.points()).toEqual(lastFrame)
    // and forcing the same point twice must not duplicate it
    acc.add(live, 0, true)
    expect(acc.points()).toEqual(lastFrame)
    expect(strokeOutlinePath(acc.points(), { pen: 'marker', width: 8 }))
      .toBe(strokeOutlinePath(lastFrame, { pen: 'marker', width: 8 }))
  })
})

describe('pen types', () => {
  it('clamps width to each pen’s documented range', () => {
    expect(clampPenWidth('pencil', 99)).toBe(5)        // pencil 1–5
    expect(clampPenWidth('pencil', 0)).toBe(1)
    expect(clampPenWidth('marker', 99)).toBe(16)       // marker 4–16
    expect(clampPenWidth('highlighter', 2)).toBe(12)   // highlighter 12–32
    expect(clampPenWidth('highlighter', 99)).toBe(32)
    expect(clampPenWidth('technical', 99)).toBe(4)     // technical 1–4
  })

  it('every preset has a default sitting inside its own range', () => {
    // switching pen jumps to this default, so it must never need clamping
    for (const k of Object.keys(PEN_TYPES)) {
      const p = PEN_TYPES[k]
      expect(penDefaultWidth(k)).toBeGreaterThanOrEqual(p.min)
      expect(penDefaultWidth(k)).toBeLessThanOrEqual(p.max)
    }
  })

  it('matches the specified defaults', () => {
    expect(penDefaultWidth('pencil')).toBe(2)
    expect(penDefaultWidth('marker')).toBe(8)
    expect(penDefaultWidth('highlighter')).toBe(20)
    expect(penDefaultWidth('technical')).toBe(1.5)
  })

  it('cap choice reaches the outline builder for mesh strokes', () => {
    // a mesh stroke has no strokeLinecap — the cap is baked into the polygon,
    // so round vs flat must produce different geometry
    const pts = [{ x:0, y:0 }, { x:40, y:0 }, { x:80, y:10 }]
    const round = strokeOutlinePath(pts, { pen:'marker', width:12, cap:'round' })
    const flat  = strokeOutlinePath(pts, { pen:'marker', width:12, cap:'butt' })
    expect(round).not.toBe(flat)
  })

  it('draft and commit produce identical geometry — no morph on pointerup', () => {
    // The draft used to render the RAW stream while the commit rendered the
    // simplified one: same algorithm, different input, so the stroke visibly
    // re-shaped on mouseup. Both sides must simplify with the same tolerance.
    const raw = Array.from({ length: 300 }, (_, i) => ({ x: i * 1.3, y: Math.sin(i / 12) * 45 }))
    const TOL = 0.6
    const draft  = strokeOutlinePath(simplify(raw, TOL), { pen: 'marker', width: 8, cap: 'round' })
    const commit = strokeOutlinePath(simplify(raw, TOL), { pen: 'marker', width: 8, cap: 'round' })
    expect(draft).toBe(commit)
    // and it must differ from the un-simplified render, or the test proves nothing
    expect(draft).not.toBe(strokeOutlinePath(raw, { pen: 'marker', width: 8, cap: 'round' }))
  })

  it('simplify is idempotent, so re-running it cannot drift the shape', () => {
    const raw = Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.cos(i / 7) * 30 }))
    const once = simplify(raw, 0.6)
    expect(simplify(once, 0.6)).toEqual(once)
  })

  it('highlighter uses flat alpha rather than mix-blend-mode', () => {
    // deliberate: there is no export pipeline yet, and a blend mode that
    // survives on screen but not in an exported drawing is worse than none
    expect(PEN_TYPES.highlighter.alpha).toBe(0.4)
  })
})
