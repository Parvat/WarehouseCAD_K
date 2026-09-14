import { describe, it, expect } from 'vitest'
import {
  laneGeom, cantileverGeom,
  rackDriveInOps, rackDriveThroughOps, rackPushbackOps, rackPalletFlowOps,
  rackCantileverOps, rackDrawOps,
  RACK_PALETTE, RACK_LINE, RACK_ARROW, PORTED_RACK_TYPES,
} from '../render/rackOps'

const GS = 40

/* Four lane types share one chassis and differ only in their cue, so these
   tests are mostly about which cue showed up — that is what a reader has to
   tell apart on the sheet. */
const lane = {
  id: 'l1', type: 'rack_drive_in', x: 50, y: 60,
  width: 600, height: 300, lanes: 4, uprightWidth: 4,
}
const backWall = ops => ops.find(o =>
  o.op === 'path' && o.stroke === RACK_PALETTE.structure)
const arrows = ops => ops.find(o => o.op === 'arrows')

describe('rackOps — lane geometry', () => {
  it('fills the object width exactly: posts + lanes = width', () => {
    const { lanes, upW, laneW } = laneGeom(lane, GS)
    expect((lanes + 1) * upW + lanes * laneW).toBeCloseTo(lane.width, 6)
  })

  it('centres one lane between each pair of posts', () => {
    const { postXs, laneCx, upW, laneW } = laneGeom(lane, GS)
    laneCx.forEach((cx, i) => expect(cx).toBeCloseTo(postXs[i] + upW + laneW / 2, 6))
  })

  it('never goes below one lane, however broken the object', () => {
    // 0 and undefined are both "unset" and take the default of 2; only a
    // negative count is a real value that has to be clamped.
    expect(laneGeom({ ...lane, lanes: 0 }, GS).lanes).toBe(2)
    expect(laneGeom({ ...lane, lanes: undefined }, GS).lanes).toBe(2)
    expect(laneGeom({ ...lane, lanes: -5 }, GS).lanes).toBe(1)
  })
})

describe('rackOps — drive-in vs drive-through', () => {
  const di = rackDriveInOps(lane, GS)
  const dt = rackDriveThroughOps({ ...lane, type: 'rack_drive_through' }, GS)

  it('closes the back on drive-in and leaves it open on drive-through', () => {
    expect(backWall(di)).toBeTruthy()
    expect(backWall(dt)).toBeFalsy()
  })

  it('draws the back wall as a heavier rule across the FAR end', () => {
    const w = backWall(di)
    expect(w.strokeWidth).toBeGreaterThan(RACK_LINE.edge)
    expect(w.d).toBe(`M${lane.x} ${lane.y}L${lane.x + lane.width} ${lane.y}`)
  })

  it('puts arrows at one face for drive-in and both for drive-through', () => {
    expect(arrows(di).items).toHaveLength(4)          // one per lane
    expect(arrows(dt).items).toHaveLength(8)          // both ends
    expect(new Set(arrows(di).items.map(i => i.side))).toEqual(new Set(['below']))
    expect(new Set(arrows(dt).items.map(i => i.side))).toEqual(new Set(['below', 'above']))
  })

  it('anchors every arrow to a rack edge, so none floats inside the box', () => {
    for (const it of arrows(dt).items) {
      expect([lane.y, lane.y + lane.height]).toContain(it.edgeY)
    }
  })

  it('carries arrow sizes in SCREEN px, so one size reads across the sheet', () => {
    expect(arrows(di).len).toBe(RACK_ARROW.len)
    expect(arrows(di).head).toBe(RACK_ARROW.head)
  })
})

describe('rackOps — push-back carts', () => {
  const pb = rackPushbackOps({ ...lane, type: 'rack_pushback', palletDeep: 4 }, GS)
  const carts = pb.filter(o => o.op === 'path' && o.stroke === RACK_PALETTE.border)

  it('draws every cart in ONE path, not a rect each', () => {
    expect(carts).toHaveLength(1)
    expect((carts[0].d.match(/M/g) || []).length).toBe(4 * 4)   // lanes x deep
  })

  it('nests the carts — the deepest is the narrowest', () => {
    const widths = [...carts[0].d.matchAll(/M[-\d.]+ [-\d.]+h([\d.]+)/g)].map(m => +m[1])
    expect(widths[0]).toBeLessThan(widths[3])   // back of lane narrower than front
  })

  it('clamps depth to something drawable', () => {
    const deep = rackPushbackOps({ ...lane, type: 'rack_pushback', palletDeep: 99 }, GS)
      .find(o => o.op === 'path' && o.stroke === RACK_PALETTE.border)
    expect((deep.d.match(/M/g) || []).length).toBe(4 * 8)       // capped at 8
  })
})

describe('rackOps — pallet flow rollers', () => {
  const pf = rackPalletFlowOps({ ...lane, type: 'rack_pallet_flow' }, GS)
  const rails = pf.find(o => o.op === 'path' && o.stroke === RACK_PALETTE.roller)

  it('runs two dashed rails per lane, from one path', () => {
    expect(rails).toBeTruthy()
    expect((rails.d.match(/M/g) || []).length).toBe(4 * 2)
    expect(rails.dash).toBeTruthy()
  })

  it('owns the roller ochre — no other type uses it', () => {
    expect(rackDriveInOps(lane, GS).some(o => o.stroke === RACK_PALETTE.roller)).toBe(false)
  })

  it('keeps the rails inside the box', () => {
    const ys = [...rails.d.matchAll(/M[-\d.]+ ([\d.]+)L/g)].map(m => +m[1])
    for (const y of ys) expect(y).toBeGreaterThan(lane.y)
  })
})

describe('rackOps — cantilever', () => {
  const cant = { ...lane, type: 'rack_cantilever', towers: [36, 36, 36], doubleSided: true }
  const ops = rackCantileverOps(cant, GS)
  const posts = ops.filter(o => o.op === 'path' && o.fill === RACK_PALETTE.structure)
  const armsP = ops.find(o => o.op === 'path' && o.fill === RACK_PALETTE.fill)
  const brace = ops.find(o => o.op === 'path' && o.stroke === RACK_PALETTE.structure)

  it('draws a spine, an X-brace, one arms path and one posts path', () => {
    expect(ops.some(o => o.op === 'rect' && o.fill === RACK_PALETTE.structure)).toBe(true)
    expect(brace).toBeTruthy()
    expect(armsP).toBeTruthy()
    expect(posts).toHaveLength(1)
  })

  it('crosses the brace corner to corner across the spine', () => {
    expect((brace.d.match(/M/g) || []).length).toBe(2)
  })

  it('throws arms BOTH ways when double-sided and one way when not', () => {
    const single = rackCantileverOps({ ...cant, doubleSided: false }, GS)
      .find(o => o.op === 'path' && o.fill === RACK_PALETTE.fill)
    expect((armsP.d.match(/M/g) || []).length).toBe(3 * 2)
    expect((single.d.match(/M/g) || []).length).toBe(3)
  })

  it('spreads towers across the whole width, first to last', () => {
    const { cxs } = cantileverGeom(cant, GS)
    expect(cxs[0]).toBeCloseTo(cant.x, 6)
    expect(cxs[cxs.length - 1]).toBeCloseTo(cant.x + cant.width, 6)
  })

  it('centres the spine when double-sided, wall side when not', () => {
    expect(cantileverGeom(cant, GS).spineY).toBeGreaterThan(cant.y)
    expect(cantileverGeom({ ...cant, doubleSided: false }, GS).spineY).toBe(cant.y)
  })

  it('keeps a transparent body so a press inside the outline still selects it', () => {
    expect(ops[0]).toMatchObject({
      op: 'rect', fill: 'transparent',
      x: cant.x, y: cant.y, w: cant.width, h: cant.height,
    })
  })
})

describe('rackOps — every newly ported type actually draws', () => {
  const TYPES = ['rack_drive_in', 'rack_drive_through', 'rack_pushback',
                 'rack_pallet_flow', 'rack_cantilever']

  it('no longer returns null for any of the five', () => {
    for (const t of TYPES) {
      const ops = rackDrawOps({ ...lane, type: t }, { gridSize: GS })
      expect(ops, `${t} still falls through to the SVG`).toBeTruthy()
      expect(ops.length).toBeGreaterThan(1)
    }
  })

  it('registers all five as ported', () => {
    for (const t of TYPES) expect(PORTED_RACK_TYPES.has(t)).toBe(true)
  })

  it('stays zoom-free — the ops do not change with the view', () => {
    for (const t of TYPES) {
      expect(rackDrawOps({ ...lane, type: t }, { gridSize: GS }))
        .toEqual(rackDrawOps({ ...lane, type: t }, { gridSize: GS }))
    }
  })
})

/* The whole point of the op list: node count must not grow with lane or tower
   count, or a full sheet stops drawing at frame rate. */
describe('rackOps — consolidation holds as racks get bigger', () => {
  it('keeps a lane rack at a fixed op count however many lanes', () => {
    const small = rackPalletFlowOps({ ...lane, type: 'rack_pallet_flow', lanes: 2 }, GS)
    const big   = rackPalletFlowOps({ ...lane, type: 'rack_pallet_flow', lanes: 40 }, GS)
    expect(big.length).toBe(small.length)
  })

  it('keeps a cantilever at a fixed op count however many towers', () => {
    const few  = rackCantileverOps({ ...lane, type: 'rack_cantilever', towers: [36, 36] }, GS)
    const many = rackCantileverOps(
      { ...lane, type: 'rack_cantilever', towers: Array(40).fill(36) }, GS)
    expect(many.length).toBe(few.length)
  })

  it('keeps push-back at a fixed op count however deep', () => {
    const a = rackPushbackOps({ ...lane, type: 'rack_pushback', palletDeep: 2 }, GS)
    const b = rackPushbackOps({ ...lane, type: 'rack_pushback', palletDeep: 8, lanes: 20 }, GS)
    expect(b.length).toBe(a.length)
  })
})
