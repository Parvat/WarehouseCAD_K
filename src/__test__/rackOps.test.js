import { describe, it, expect } from 'vitest'
import {
  rackDrawOps, rackRowOps, rackDoubleRowOps, rackBoxOps, uprightXs, bayAtPoint,
  RACK_PALETTE, RACK_LINE, PORTED_RACK_TYPES, uprightDrawRects,
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

  it('is a box plus ONE uprights op, not a node per bay', () => {
    expect(ops).toHaveLength(2)
    expect(ops[0].op).toBe('rect')
    expect(ops[1].op).toBe('uprights')
    expect(ops.filter(o => o.op === 'rect')).toHaveLength(1)
  })

  it('draws the box at the object\'s own bounds', () => {
    const { x, y, w, h } = ops[0]
    expect([x, y, w, h]).toEqual([rack.x, rack.y, rack.width, rack.height])
  })

  it('draws every upright frame — both ends and each interior one: bays + 1', () => {
    expect(ops[1].rects).toHaveLength(bays + 1)
  })

  it('runs every upright the full height of the box', () => {
    for (const r of ops[1].rects) {
      expect(r.y).toBeCloseTo(rack.y, 6)
      expect(r.y + r.h).toBeCloseTo(rack.y + rack.height, 6)
    }
  })

  it('keeps every upright inside the box, at the frame positions uprightXs gives', () => {
    const { xs, upW } = uprightXs(rack, GS)
    expect(ops[1].rects.map(r => r.x)).toEqual(xs)
    for (const r of ops[1].rects) {
      expect(r.w).toBeCloseTo(upW, 9)
      expect(r.x).toBeGreaterThanOrEqual(rack.x - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(rack.x + rack.width + 1e-9)
    }
  })

  it('uses the locked palette — soft border, filled uprights', () => {
    expect(ops[0].fill).toBe(RACK_PALETTE.fill)
    expect(ops[0].stroke).toBe(RACK_PALETTE.border)
    expect(ops[1].fill).toBe(RACK_PALETTE.upright)
  })

  it('carries the box stroke and the upright floor in SCREEN px, so neither scales with zoom', () => {
    expect(ops[0].strokeWidth).toBeLessThanOrEqual(1.5)
    expect(ops[1].minPx).toBe(RACK_LINE.hair)
  })

  it('a single-bay rack still has its two end frames', () => {
    const one = rackRowOps({ ...rack, beams: [96] }, GS)
    expect(one).toHaveLength(2)
    expect(one[1].rects).toHaveLength(2)
  })
})

describe('rackOps — dispatch and level of detail', () => {
  it('draws full detail regardless of zoom — no level-of-detail collapse', () => {
    const ops = rackDrawOps(rack, { gridSize: GS })
    expect(ops).toHaveLength(2)
    expect(ops.some(o => o.op === 'uprights')).toBe(true)   // bay structure always present
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
const depthIn = 42, flueIn = 9
const dbl = {
  ...rack, type: 'rack_double_row',
  height: ((2 * depthIn + flueIn) / 12) * GS,
}

/* BUG 59 — the flue gap carries NO visual marker at all: the two row rects
 * are drawn with the real gap between them and nothing drawn on top of it,
 * no line and no fill. This is a deliberate divergence from the SVG
 * reference (which draws a thin centred hairline, BUG 58's own port) — the
 * bare gap, at its own real width, is what reads as a flue now. */
describe('rackOps — rack_double_row draw-ops', () => {
  const ops       = rackDoubleRowOps(dbl, GS)
  const bands     = ops.filter(o => o.op === 'rect' && o.fill === RACK_PALETTE.fill)
  const dividers  = ops.find(o => o.op === 'uprights')

  it('is two bands and one uprights op — no flue marker of any kind', () => {
    expect(bands).toHaveLength(2)
    expect(dividers).toBeTruthy()
    expect(ops).toHaveLength(3)
    expect(ops.some(o => o.stroke === RACK_PALETTE.flue || o.fill === RACK_PALETTE.flue)).toBe(false)
  })

  it('splits the height as depth + flue + depth, exactly filling the box — the gap itself stays UNMARKED', () => {
    const [top, bot] = bands
    const flueHPx = (flueIn / 12) * GS
    expect(top.h).toBeCloseTo((depthIn / 12) * GS, 6)
    expect(top.h).toBeCloseTo(bot.h, 6)
    expect(top.h + flueHPx + bot.h).toBeCloseTo(dbl.height, 6)
    expect(bot.y + bot.h).toBeCloseTo(dbl.y + dbl.height, 6)
    // the gap between the two bands is real (not a zero-height seam)
    expect(bot.y - (top.y + top.h)).toBeCloseTo(flueHPx, 6)
  })

  it('draws uprights on BOTH bands from one op — 2 frames per upright line', () => {
    expect(dividers.rects).toHaveLength((bays + 1) * 2)
  })

  it('never runs an upright across the flue gap', () => {
    const [top, bot] = bands
    const gapLo = top.y + top.h, gapHi = bot.y
    for (const r of dividers.rects) {
      expect(r.y + r.h <= gapLo + 1e-9 || r.y >= gapHi - 1e-9).toBe(true)
    }
  })

  it('honours a custom flue dimension — the gap itself resizes, still with no marker', () => {
    const wide = rackDoubleRowOps({ ...dbl, flueSpaceIn: 12 }, GS)
    const wideBands = wide.filter(o => o.op === 'rect' && o.fill === RACK_PALETTE.fill)
    const [top, bot] = wideBands
    const gapLo = top.y + top.h, gapHi = bot.y
    expect(gapHi - gapLo).toBeCloseTo(GS, 6)   // a 12" flue measures 12" of real gap
    expect(wide).toHaveLength(3)
    expect(wide.some(o => o.stroke === RACK_PALETTE.flue || o.fill === RACK_PALETTE.flue)).toBe(false)
  })

  it('degrades to a plain box if the flue would swallow the rack', () => {
    const broken = rackDoubleRowOps({ ...dbl, flueSpaceIn: 1000 }, GS)
    expect(broken).toHaveLength(1)
    expect(broken[0].op).toBe("rect")
  })

  it('keeps both bands at any zoom — no lod collapse', () => {
    expect(rackDrawOps(dbl, { gridSize: GS })).toHaveLength(3)
  })

  it('falls back to a bare box only for geometry it cannot subdivide', () => {
    const broken = rackDrawOps({ ...dbl, flueSpaceIn: 1000 }, { gridSize: GS })
    expect(broken).toEqual(rackBoxOps(dbl))
  })
})

/* Uprights drawn to scale: a 3" frame is 3" wide at working zoom; only the
 * screen-px floor (the old hairline width) applies when 3" would be thinner
 * than that on screen. */
describe('rackOps — uprights drawn to scale', () => {
  const op = rackRowOps(rack, GS)[1]
  const upPx = (upIn / 12) * GS   // 3" = 10 world px

  it('at high zoom the drawn width is exactly uprightWidth (3" = 10 world px), on the frame', () => {
    for (const scale of [1, 4, 10]) {
      uprightDrawRects(op, scale).forEach((d, i) => {
        expect(d.w).toBeCloseTo(upPx, 9)
        expect(d.x).toBeCloseTo(op.rects[i].x, 9)
      })
    }
  })

  it('a 4" frame draws 4" wide (13.33 world px)', () => {
    const four = rackRowOps({ ...rack, uprightWidth: 4, width: ((4 * (bays + 1) + beamIn * bays) / 12) * GS }, GS)[1]
    for (const d of uprightDrawRects(four, 10)) expect(d.w).toBeCloseTo((4 / 12) * GS, 9)
  })

  it('at overview zoom it never drops below the 1.2 px screen floor, and stays centred on the frame', () => {
    const scale = 0.05   // 10 world px would be 0.5 screen px
    uprightDrawRects(op, scale).forEach((d, i) => {
      expect(d.w * scale).toBeCloseTo(RACK_LINE.hair, 9)
      expect(d.x + d.w / 2).toBeCloseTo(op.rects[i].x + upPx / 2, 9)
    })
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
