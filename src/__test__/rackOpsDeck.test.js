import { describe, it, expect } from 'vitest'
import {
  rackMezzanineOps, rackShelvingOps, rackDrawOps, bayAtPoint,
  RACK_LINE, PORTED_RACK_TYPES,
} from '../render/rackOps'
import { RACK_FAMILIES } from '../render/rackFamily'

const GS = 40
const deck = { id: 'm1', type: 'rack_mezzanine', x: 0, y: 0, width: 1200, height: 800 }   // 30′ × 20′
const shelf = { id: 's1', type: 'rack_shelving', x: 10, y: 20, width: 960, height: 80, shelves: 5 }   // 24′ × 2′

/* (rack-design — design/rack-plan-colour.png) A mezzanine is a raised floor, not a rack: grey, a dashed outline with a
   thin cross, its posts along the edges, its name and size in the middle. */
describe('rackOps — mezzanine', () => {
  const ops = rackMezzanineOps(deck, GS)
  const by = (n) => ops.find(o => o.name === n)

  it('keeps a body for its hit area with no fill and no solid edge — the edge is dashed', () => {
    expect(ops[0]).toMatchObject({ op: 'rect', border: true, fill: null, stroke: null, x: 0, y: 0, w: 1200, h: 800 })
    expect(by('mezz-edge')).toMatchObject({ op: 'lines', stroke: RACK_FAMILIES.mezz.line, strokeWidth: RACK_LINE.mezz })
    expect(by('mezz-edge').dash.length).toBe(2)
    expect(by('mezz-edge').segs).toHaveLength(4 * 4)
  })

  it('crosses corner to corner with a thin line', () => {
    expect(by('mezz-cross').segs).toEqual([0, 0, 1200, 800, 1200, 0, 0, 800])
    expect(by('mezz-cross').strokeWidth).toBe(RACK_LINE.hair)
  })

  // (r9-mezzanine) its columns: small squares at a grid about 20 ft each way, whole bays (were: dots along the edges, 25 ft apart)
  it('columns at the grid: about 20 ft each way, whole bays', () => {
    const d = ops.find(o => o.name === 'mezz-columns')
    expect(d.fill).toBe(RACK_FAMILIES.mezz.line)
    // 30′ × 20′: 2 × 1 bays → 3 × 2 columns
    expect(d.rects.length).toBe(6)
    const big = rackMezzanineOps({ ...deck, width: 2400 }, GS).find(o => o.name === 'mezz-columns')
    expect(big.rects.length).toBe(8)
  })

  it('names itself and its size in the middle', () => {
    expect(ops.filter(o => o.op === 'text').map(o => o.text)).toEqual(['MEZZANINE', '30′ × 20′'])
    for (const t of ops.filter(o => o.op === 'text')) expect(Math.abs(t.x - 600)).toBeLessThan(1e-9)
  })
})

/* Shelving: hand-picked units, each outlined, with its shelf count inside. */
describe('rackOps — shelving', () => {
  const ops = rackShelvingOps(shelf, GS)

  it('outlines the run in the family colour, no fill', () => {
    expect(ops[0]).toMatchObject({ op: 'rect', border: true, fill: null, stroke: RACK_FAMILIES.other.line })
  })

  it('splits the run into units about 4 ft wide — (rack-round3 6, was: each with its shelf count inside) no shelf count drawn', () => {
    const units = ops.find(o => o.name === 'shelf-units')
    expect(units.segs.length / 4).toBe(5)                       // 6 units: 5 lines between them
    const counts = ops.filter(o => o.op === 'text')
    expect(counts).toEqual([])                                  // the size label carries it: "S1 · 6 units · 48×24 · 5 shelves"
    void RACK_FAMILIES
  })

  it('has no travel arrows — nothing drives into shelving', () => {
    expect(ops.some(o => o.op === 'arrows')).toBe(false)
  })
})

describe('rackOps — both now dispatch through rackDrawOps', () => {
  it('no longer falls through to the SVG', () => {
    for (const t of ['rack_mezzanine', 'rack_shelving']) {
      const ops = rackDrawOps({ ...deck, type: t }, { gridSize: GS })
      expect(ops, `${t} still returns null`).toBeTruthy()
      expect(ops.length).toBeGreaterThan(1)
      expect(PORTED_RACK_TYPES.has(t)).toBe(true)
    }
  })

  it('still refuses a degenerate box', () => {
    expect(rackDrawOps({ ...deck, width: 0 }, { gridSize: GS })).toBeNull()
    expect(rackDrawOps({ ...shelf, height: 0 }, { gridSize: GS })).toBeNull()
  })
})

/* Being drawable and having bays are different questions. Before these types
   were ported, bayAtPoint gated on "can I draw it", which would now answer
   "bay 0" for a mezzanine from a defaulted 96in beam. */
describe('rackOps — only beam racks have bays', () => {
  const beam = {
    type: 'rack_row', x: 0, y: 0, width: 400, height: 100,
    beams: [96, 96], uprightWidth: 3,
  }

  it('answers for beam racks', () => {
    expect(bayAtPoint(beam, 200, GS)).not.toBeNull()
  })

  it('refuses every type that has no bays, drawable or not', () => {
    for (const t of ['rack_mezzanine', 'rack_shelving', 'rack_drive_in',
                     'rack_drive_through', 'rack_pushback', 'rack_pallet_flow',
                     'rack_cantilever']) {
      expect(bayAtPoint({ ...beam, type: t }, 200, GS), `${t} claimed a bay`).toBeNull()
    }
  })
})
