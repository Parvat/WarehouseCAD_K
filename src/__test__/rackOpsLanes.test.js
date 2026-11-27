import { describe, it, expect } from 'vitest'
import {
  laneGeom, cantileverGeom, arrowGeom, faceWordsReach, LANE_FACES,
  rackDriveInOps, rackDriveThroughOps, rackPushbackOps, rackPalletFlowOps,
  rackCantileverOps, rackDrawOps,
  RACK_LINE, FACE_BAR_IN, FACE_TEXT_IN, SLOT_DASH, PORTED_RACK_TYPES,
} from '../render/rackOps'
import { RACK_FAMILIES } from '../render/rackFamily'

const GS = 40

/* (rack-design — design/rack-plan-colour.png) Four lane types share one chassis — lanes, each `palletDeep` pallets deep,
   dashed slots — and differ in their cue: which faces carry a face bar and its word, and which way the arrows run. These
   tests are mostly about which cue showed up — that is what a reader has to tell apart on the sheet. */
const lane = {
  id: 'l1', type: 'rack_drive_in', x: 50, y: 60,
  width: 600, height: 400, lanes: 4, palletDeep: 5, uprightWidth: 4,
}
const arrows = ops => ops.find(o => o.op === 'arrows')
const words = ops => ops.filter(o => o.op === 'text').map(o => ({ text: o.text, below: o.y > lane.y + lane.height / 2 }))
const faceBars = ops => ops.find(o => o.name === 'face-bar')
const slots = ops => ops.find(o => o.op === 'slots')

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

describe('rackOps — lane racks: no fill, the family colours', () => {
  it('draws no fill anywhere, and every line in its family colour (lane green, flow amber)', () => {
    for (const [t, fam] of [['rack_drive_in', 'lane'], ['rack_drive_through', 'lane'], ['rack_pushback', 'flow'], ['rack_pallet_flow', 'flow']]) {
      const ops = rackDrawOps({ ...lane, type: t }, { gridSize: GS })
      const c = RACK_FAMILIES[fam]
      expect(ops.some(o => o.op === 'rect' && o.fill), t).toBe(false)
      expect(ops[0]).toMatchObject({ op: 'rect', border: true, stroke: c.line, strokeWidth: RACK_LINE.edge })
      for (const o of ops) {
        if (o.op === 'uprights') expect(o.fill, t + ' ' + o.name).toBe(c.line)
        if (o.op === 'lines' || o.op === 'arrows' || o.op === 'text') expect(o.stroke || o.color, t).toBe(c.line)
      }
      expect(slots(ops).stroke, t).toBe(c.tint)
    }
  })

  it('dashes every pallet slot 4 3 at 1 px: lanes × deep of them, each inside its lane', () => {
    const s = slots(rackDriveInOps(lane, GS))
    expect(s.dash).toEqual(SLOT_DASH)
    expect(s.strokeWidth).toBe(1)
    expect(s.rects).toHaveLength(4 * 5)
    const { postXs, upW, laneW } = laneGeom(lane, GS)
    for (const r of s.rects) {
      const i = postXs.findIndex(px => r.x >= px + upW - 1e-6 && r.x + r.w <= px + upW + laneW + 1e-6)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThan(lane.y); expect(r.y + r.h).toBeLessThan(lane.y + lane.height)
    }
  })
})

describe('rackOps — drive-in vs drive-through', () => {
  const di = rackDriveInOps(lane, GS)
  const dt = rackDriveThroughOps({ ...lane, type: 'rack_drive_through' }, GS)

  it('puts ENTRY on the front face of a drive-in, on both faces of a drive-through', () => {
    expect(words(di)).toEqual([{ text: 'ENTRY', below: true }])
    expect(words(dt)).toEqual([{ text: 'ENTRY', below: false }, { text: 'ENTRY', below: true }])
  })

  it('draws a 4" face bar on each entry face, centred on the face line, the rack\'s full width', () => {
    const t = (FACE_BAR_IN / 12) * GS
    expect(faceBars(di).rects).toEqual([{ x: lane.x, y: lane.y + lane.height - t / 2, w: lane.width, h: t }])
    expect(faceBars(dt).rects).toHaveLength(2)
  })

  it('posts a square at every pallet along each lane line', () => {
    const posts = di.find(o => o.name === 'lane-posts')
    expect(posts.rects).toHaveLength((4 + 1) * (5 + 1))
    for (const r of posts.rects) expect(r.w).toBeCloseTo(r.h, 9)
  })

  it('runs one arrow per lane, inside the front pallet, pointing into the lane (a drive-through: one more per lane at the top end, pointing down into it — rack-fixes 2)', () => {
    {
      const a = arrows(dt)
      expect(a.items).toHaveLength(8)
      const back = lane.y + lane.height / 5
      const top = a.items.filter(it => it.y1 > it.y0)
      expect(top).toHaveLength(4)
      for (const it of top) { expect(Math.max(it.y0, it.y1)).toBeLessThan(back); expect(Math.min(it.y0, it.y1)).toBeGreaterThan(lane.y) }
      expect(arrows(di).items).toHaveLength(4)
    }
    for (const ops of [di, dt]) {
      const a = arrows(ops)
      const front = lane.y + lane.height - lane.height / 5
      const up = a.items.filter(it => it.y1 < it.y0)
      expect(up).toHaveLength(4)
      for (const it of up) {
        expect(it.y1).toBeLessThan(it.y0)                       // up: into the lane
        expect(Math.min(it.y0, it.y1)).toBeGreaterThan(front)   // inside the front pallet
        expect(Math.max(it.y0, it.y1)).toBeLessThan(lane.y + lane.height)
      }
    }
  })

  it('draws the arrow head at its tip (arrowGeom)', () => {
    const [g] = arrowGeom(arrows(di))
    const it = arrows(di).items[0]
    expect(g.head[3]).toBeCloseTo(it.y1, 9)
    expect(g.shaft[1]).toBeCloseTo(it.y0, 9)
  })

  it('sets the words at their real height, outside the face, past the face bar', () => {
    const w = di.find(o => o.op === 'text')
    expect(w.size).toBeCloseTo((FACE_TEXT_IN / 12) * GS, 9)
    expect(w.y).toBeGreaterThan(lane.y + lane.height + (FACE_BAR_IN / 12) * GS / 2)
    expect(faceWordsReach(lane, 'bottom', GS)).toBeGreaterThan(w.y + w.size - (lane.y + lane.height) - 1e-9)
    expect(faceWordsReach(lane, 'top', GS)).toBe(0)
  })
})

describe('rackOps — push-back and pallet flow', () => {
  const pb = rackPushbackOps({ ...lane, type: 'rack_pushback', palletDeep: 4 }, GS)
  const pf = rackPalletFlowOps({ ...lane, type: 'rack_pallet_flow', palletDeep: 4 }, GS)

  it('push-back: LOAD · PICK on its one face, arrows pushing back into the lane', () => {
    expect(words(pb)).toEqual([{ text: 'LOAD · PICK', below: true }])
    for (const it of arrows(pb).items) expect(it.y1).toBeLessThan(it.y0)
  })

  it('pallet flow: LOAD at the back, PICK at the front, arrows rolling toward the pick face', () => {
    expect(words(pf)).toEqual([{ text: 'LOAD', below: false }, { text: 'PICK', below: true }])
    for (const it of arrows(pf).items) expect(it.y1).toBeGreaterThan(it.y0)
  })

  it('frames each lane with a full-depth post (the flow racks), not a post per pallet', () => {
    const posts = pb.find(o => o.name === 'lane-posts')
    expect(posts.rects).toHaveLength(4 + 1)
    for (const r of posts.rects) expect(r.h).toBeCloseTo(lane.height, 9)
  })

  it('names its faces in one table (LANE_FACES), which the builders draw from', () => {
    expect(Object.keys(LANE_FACES).sort()).toEqual(['rack_carton_flow', 'rack_drive_in', 'rack_drive_through', 'rack_pallet_flow', 'rack_pushback'])   // (r8-carton-flow) + carton flow: LOAD / PICK
  })
})

describe('rackOps — cantilever (from above)', () => {
  const cant = { ...lane, type: 'rack_cantilever', towers: [36, 36, 36], doubleSided: true, height: 260 }
  const ops = rackCantileverOps(cant, GS)
  const by = (n) => ops.find(o => o.name === n)

  it('draws the column line (the spine), a square at each column, each arm, and the arms\' reach dashed', () => {
    expect(by('spine').rects).toHaveLength(1)
    expect(by('columns').rects).toHaveLength(3)
    expect(by('arm-reach').dash).toEqual(SLOT_DASH)
    expect(by('arm-reach').stroke).toBe(RACK_FAMILIES.other.tint)
    for (const n of ['spine', 'columns', 'arms']) expect(by(n).fill).toBe(RACK_FAMILIES.other.line)
  })

  it('throws arms BOTH ways when double-sided and one way when not, with a reach zone each side', () => {
    const single = rackCantileverOps({ ...cant, doubleSided: false }, GS)
    expect(by('arms').rects).toHaveLength(3 * 2)
    expect(single.find(o => o.name === 'arms').rects).toHaveLength(3)
    expect(by('arm-reach').rects).toHaveLength(2)
    expect(single.find(o => o.name === 'arm-reach').rects).toHaveLength(1)
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
    const big   = rackPalletFlowOps({ ...lane, type: 'rack_pallet_flow', lanes: 6, width: 1800 }, GS)
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
    const b = rackPushbackOps({ ...lane, type: 'rack_pushback', palletDeep: 8, lanes: 6, width: 1800, height: 1600 }, GS)
    expect(b.length).toBe(a.length)
  })
})
