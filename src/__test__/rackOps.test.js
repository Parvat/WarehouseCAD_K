import { describe, it, expect } from 'vitest'
import {
  rackDrawOps, rackRowOps, rackDoubleRowOps, rackBoxOps, uprightXs, bayAtPoint,
  RACK_PALETTE, PORTED_RACK_TYPES,
} from '../render/rackOps'

const GS = 40

/* A 4-bay selective rack, dimensioned the way the generator builds one:
   width = uprightWidth x (bays + 1) + sum(beams). */
const upIn = 3, beamIn = 96, bays = 4
const totalIn = upIn * (bays + 1) + beamIn * bays
const rack = {
  id: 'r1', type: 'rack_row',
  x: 100, y: 200,
  width: (totalIn / 12) * GS,
  height: (42 / 12) * GS,
  beams: Array.from({ length: bays }, () => beamIn),
  uprightWidth: upIn,
}

describe('rackOps — upright boundaries', () => {
  it('places one more upright than there are bays', () => {
    const { xs } = uprightXs(rack, GS)
    expect(xs).toHaveLength(bays + 1)
  })

  it('starts at the rack origin and ends at its far edge', () => {
    const { xs, upW } = uprightXs(rack, GS)
    expect(xs[0]).toBe(rack.x)
    // last upright's near edge + its own width = the rack's right edge
    expect(xs[xs.length - 1] + upW).toBeCloseTo(rack.x + rack.width, 6)
  })

  it('spaces boundaries by one beam plus one upright', () => {
    const { xs, upW } = uprightXs(rack, GS)
    const step = (beamIn / 12) * GS + upW
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(step, 6)
    }
  })

  it('falls back to a single 96" bay when beams are missing', () => {
    const { xs, beams } = uprightXs({ ...rack, beams: undefined }, GS)
    expect(beams).toEqual([96])
    expect(xs).toHaveLength(2)
  })
})

describe('rackOps — rack_row draw-ops', () => {
  const ops = rackRowOps(rack, GS)

  it('is a box plus ONE dividers path, not a rect per bay', () => {
    expect(ops).toHaveLength(2)
    expect(ops[0].op).toBe('rect')
    expect(ops[1].op).toBe('path')
    expect(ops.filter(o => o.op === 'rect')).toHaveLength(1)
  })

  it('draws the box at the object\'s own bounds', () => {
    const { x, y, w, h } = ops[0]
    expect([x, y, w, h]).toEqual([rack.x, rack.y, rack.width, rack.height])
  })

  it('emits one move/line pair per INTERIOR boundary — bays minus one', () => {
    const moves = (ops[1].d.match(/M/g) || []).length
    expect(moves).toBe(bays - 1)
  })

  it('runs every divider the full height of the box', () => {
    const pairs = ops[1].d.match(/M[\d.]+ ([\d.]+)L[\d.]+ ([\d.]+)/g) || []
    expect(pairs.length).toBe(bays - 1)
    for (const seg of pairs) {
      const [, top, bottom] = seg.match(/M[\d.]+ ([\d.]+)L[\d.]+ ([\d.]+)/)
      expect(Number(top)).toBeCloseTo(rack.y, 6)
      expect(Number(bottom)).toBeCloseTo(rack.y + rack.height, 6)
    }
  })

  it('keeps every divider strictly inside the box', () => {
    const xsInPath = [...ops[1].d.matchAll(/M([\d.]+) /g)].map(m => Number(m[1]))
    for (const dx of xsInPath) {
      expect(dx).toBeGreaterThan(rack.x)
      expect(dx).toBeLessThan(rack.x + rack.width)
    }
  })

  it('uses the locked palette — soft border, light dividers', () => {
    expect(ops[0].fill).toBe(RACK_PALETTE.fill)
    expect(ops[0].stroke).toBe(RACK_PALETTE.border)
    expect(ops[1].stroke).toBe(RACK_PALETTE.divider)
  })

  it('carries stroke widths in SCREEN px, so they never scale with zoom', () => {
    expect(ops[0].strokeWidth).toBeLessThanOrEqual(1.5)
    expect(ops[1].strokeWidth).toBeLessThan(ops[0].strokeWidth)
  })

  it('emits no dividers path for a single-bay rack', () => {
    const one = rackRowOps({ ...rack, beams: [96] }, GS)
    expect(one).toHaveLength(1)
    expect(one[0].op).toBe('rect')
  })
})

describe('rackOps — dispatch and level of detail', () => {
  it('draws full detail regardless of zoom — no level-of-detail collapse', () => {
    const ops = rackDrawOps(rack, { gridSize: GS })
    expect(ops).toHaveLength(2)
    expect(ops.some(o => o.op === 'path')).toBe(true)   // bay cells always present
  })

  it('ignores the removed lod flag, so it cannot creep back in via a caller', () => {
    expect(rackDrawOps(rack, { gridSize: GS, lod: true }))
      .toEqual(rackDrawOps(rack, { gridSize: GS }))
  })

  it('returns null for a type it does not own', () => {
    // every rack type is ported now, so the fall-through cases are non-racks
    // and any future rack type that has not been given a builder yet
    expect(rackDrawOps({ ...rack, type: 'struct_loading_dock' }, { gridSize: GS })).toBeNull()
    expect(rackDrawOps({ ...rack, type: 'rack_not_invented_yet' }, { gridSize: GS })).toBeNull()
  })

  /* The point of the registry: a caller can ask whether Konva owns a type
     without knowing how it is drawn. Every claimed type must actually draw. */
  it('draws every type it claims, and claims every type it draws', () => {
    for (const t of PORTED_RACK_TYPES) {
      const ops = rackDrawOps({ ...rack, type: t }, { gridSize: GS })
      expect(ops, `${t} claims to be ported but drew nothing`).toBeTruthy()
      expect(ops.length).toBeGreaterThan(0)
    }
  })

  it('returns null for a degenerate box rather than drawing nothing visible', () => {
    expect(rackDrawOps({ ...rack, width: 0 },  { gridSize: GS })).toBeNull()
    expect(rackDrawOps({ ...rack, height: 0 }, { gridSize: GS })).toBeNull()
  })

  /* The library defines nine rack types. All nine now have a builder, so the
     Konva layer never hands a rack back to the SVG renderer. */
  it('covers every rack type the object library defines', () => {
    const LIBRARY = [
      'rack_row', 'rack_double_row', 'rack_drive_in', 'rack_drive_through',
      'rack_pushback', 'rack_pallet_flow', 'rack_cantilever',
      'rack_mezzanine', 'rack_shelving',
    ]
    for (const t of LIBRARY) {
      expect(PORTED_RACK_TYPES.has(t), `${t} is not ported`).toBe(true)
    }
    expect(PORTED_RACK_TYPES.size).toBe(LIBRARY.length)
  })

  it('claims no type outside the rack family', () => {
    for (const t of PORTED_RACK_TYPES) expect(t.startsWith('rack_')).toBe(true)
  })

  it('is pure — same object in, same ops out', () => {
    expect(rackRowOps(rack, GS)).toEqual(rackRowOps(rack, GS))
  })
})

/* Double row: two bands of `depth`, a real flue between them,
   total height = 2 x depth + flue. */
const depthIn = 42, flueIn = 6
const dbl = {
  ...rack, type: 'rack_double_row',
  height: ((2 * depthIn + flueIn) / 12) * GS,
}

describe('rackOps — rack_double_row draw-ops', () => {
  const ops   = rackDoubleRowOps(dbl, GS)
  const bands = ops.filter(o => o.op === 'rect' && o.fill === RACK_PALETTE.fill)
  const flue  = ops.find(o => o.op === 'rect' && o.fill === RACK_PALETTE.flue)
  const path  = ops.find(o => o.op === 'path')

  it('is two bands, one flue and ONE dividers path', () => {
    expect(bands).toHaveLength(2)
    expect(flue).toBeTruthy()
    expect(ops.filter(o => o.op === 'path')).toHaveLength(1)
  })

  it('splits the height as depth + flue + depth, exactly filling the box', () => {
    const [top, bot] = bands
    expect(top.h).toBeCloseTo((depthIn / 12) * GS, 6)
    expect(top.h).toBeCloseTo(bot.h, 6)
    expect(top.h + flue.h + bot.h).toBeCloseTo(dbl.height, 6)
    expect(bot.y + bot.h).toBeCloseTo(dbl.y + dbl.height, 6)
  })

  it('sits the flue exactly between the bands, at its true dimension', () => {
    const [top, bot] = bands
    expect(flue.y).toBeCloseTo(top.y + top.h, 6)
    expect(flue.y + flue.h).toBeCloseTo(bot.y, 6)
    expect(flue.h).toBeCloseTo((flueIn / 12) * GS, 6)   // a 6" flue measures 6"
  })

  it('owns the orange — no other type uses it', () => {
    expect(flue.fill).toBe(RACK_PALETTE.flue)
    expect(rackRowOps(rack, GS).some(o => o.fill === RACK_PALETTE.flue)).toBe(false)
  })

  it('draws dividers on BOTH bands from one path — 2 segments per boundary', () => {
    expect((path.d.match(/M/g) || []).length).toBe((bays - 1) * 2)
  })

  it('never runs a divider across the flue', () => {
    const segs = [...path.d.matchAll(/M[\d.]+ ([\d.]+)L[\d.]+ ([\d.]+)/g)]
    expect(segs.length).toBe((bays - 1) * 2)
    for (const [, a, b] of segs) {
      const crosses = Number(a) < flue.y && Number(b) > flue.y + flue.h
      expect(crosses).toBe(false)
    }
  })

  it('honours a custom flue dimension', () => {
    const wide = rackDoubleRowOps({ ...dbl, flueSpaceIn: 12 }, GS)
    expect(wide.find(o => o.fill === RACK_PALETTE.flue).h).toBeCloseTo(GS, 6)
  })

  it('degrades to a plain box if the flue would swallow the rack', () => {
    const broken = rackDoubleRowOps({ ...dbl, flueSpaceIn: 1000 }, GS)
    expect(broken).toHaveLength(1)
    expect(broken[0].op).toBe("rect")
  })

  it('keeps both bands and the flue at any zoom — no lod collapse', () => {
    expect(rackDrawOps(dbl, { gridSize: GS })).toHaveLength(4)
  })

  it('falls back to a bare box only for geometry it cannot subdivide', () => {
    const broken = rackDrawOps({ ...dbl, flueSpaceIn: 1000 }, { gridSize: GS })
    expect(broken).toEqual(rackBoxOps(dbl))
  })
})

describe('rackOps — bayAtPoint hit test', () => {
  const { xs, upW } = uprightXs(rack, GS)
  const mid = i => (xs[i] + upW + xs[i + 1]) / 2      // centre of bay i

  it('finds the bay under a point in each bay centre', () => {
    for (let i = 0; i < bays; i++) {
      expect(bayAtPoint(rack, mid(i), GS)).toBe(i)
    }
  })

  it('returns null outside the rack on either side', () => {
    expect(bayAtPoint(rack, rack.x - 1, GS)).toBeNull()
    expect(bayAtPoint(rack, rack.x + rack.width + 1, GS)).toBeNull()
  })

  it('resolves the extreme edges to the first and last bay', () => {
    expect(bayAtPoint(rack, rack.x, GS)).toBe(0)
    expect(bayAtPoint(rack, rack.x + rack.width, GS)).toBe(bays - 1)
  })

  it('never returns a dead zone — an upright resolves to a neighbouring bay', () => {
    for (let i = 1; i < xs.length - 1; i++) {
      const onUpright = xs[i] + upW / 2
      const hit = bayAtPoint(rack, onUpright, GS)
      expect(hit).not.toBeNull()
      expect([i - 1, i]).toContain(hit)
    }
  })

  it('covers the full width with no gaps — every point lands in a bay', () => {
    for (let k = 0; k <= 200; k++) {
      const x = rack.x + (rack.width * k) / 200
      const hit = bayAtPoint(rack, x, GS)
      expect(hit).toBeGreaterThanOrEqual(0)
      expect(hit).toBeLessThan(bays)
    }
  })

  it('is monotonic left to right — bays never go backwards', () => {
    let prev = -1
    for (let k = 0; k <= 200; k++) {
      const hit = bayAtPoint(rack, rack.x + (rack.width * k) / 200, GS)
      expect(hit).toBeGreaterThanOrEqual(prev)
      prev = hit
    }
  })

  it('works on a double row, which shares the same bay geometry', () => {
    expect(bayAtPoint(dbl, mid(2), GS)).toBe(2)
  })

  it('returns null for an unported type rather than guessing', () => {
    expect(bayAtPoint({ ...rack, type: 'rack_mezzanine' }, mid(1), GS)).toBeNull()
  })
})
