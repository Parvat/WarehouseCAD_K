import { describe, it, expect } from 'vitest'
import {
  rackMezzanineOps, rackShelvingOps, rackDrawOps, bayAtPoint,
  RACK_PALETTE, RACK_LINE, PORTED_RACK_TYPES,
} from '../render/rackOps'

const GS = 40
const deck = { id: 'm1', type: 'rack_mezzanine', x: 0, y: 0, width: 960, height: 480 }
const shelf = { id: 's1', type: 'rack_shelving', x: 10, y: 20, width: 400, height: 120 }

describe('rackOps — mezzanine', () => {
  const ops = rackMezzanineOps(deck, GS)
  const grid = ops.find(o => o.op === 'path' && o.opacity === 0.3)
  const stairs = ops.find(o => o.op === 'path' && o.fill === RACK_PALETTE.border)

  it('is a deck, a grid path and a stair path — three ops', () => {
    expect(ops).toHaveLength(3)
    expect(ops[0].op).toBe('rect')
    expect(grid).toBeTruthy()
    expect(stairs).toBeTruthy()
  })

  it('draws the deck at the object bounds', () => {
    expect(ops[0]).toMatchObject({ x: deck.x, y: deck.y, w: deck.width, h: deck.height })
  })

  /* One division per ~6ft, so a bigger deck gains divisions rather than
     stretching a fixed few across the whole span. */
  it('gains grid divisions as the deck grows', () => {
    const count = o => (rackMezzanineOps(o, GS)
      .find(x => x.op === 'path' && x.opacity === 0.3)?.d.match(/M/g) || []).length
    expect(count({ ...deck, width: 1920, height: 960 }))
      .toBeGreaterThan(count(deck))
  })

  it('never collapses below a readable minimum grid', () => {
    const tiny = rackMezzanineOps({ ...deck, width: 40, height: 40 }, GS)
    const g = tiny.find(o => o.op === 'path' && o.opacity === 0.3)
    // at least 3 columns and 2 rows => 2 vertical + 1 horizontal interior line
    expect((g.d.match(/M/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('keeps every grid line inside the deck', () => {
    const xs = [...grid.d.matchAll(/M([\d.]+) ([\d.]+)L/g)].map(m => [+m[1], +m[2]])
    for (const [gx, gy] of xs) {
      expect(gx).toBeGreaterThanOrEqual(deck.x)
      expect(gx).toBeLessThanOrEqual(deck.x + deck.width)
      expect(gy).toBeGreaterThanOrEqual(deck.y)
      expect(gy).toBeLessThanOrEqual(deck.y + deck.height)
    }
  })

  it('runs four stair treads, stepping down and away', () => {
    const treads = [...stairs.d.matchAll(/M([\d.]+) ([\d.]+)h/g)].map(m => [+m[1], +m[2]])
    expect(treads).toHaveLength(4)
    for (let i = 1; i < treads.length; i++) {
      expect(treads[i][0]).toBeLessThan(treads[i - 1][0])      // stepping left
      expect(treads[i][1]).toBeGreaterThan(treads[i - 1][1])   // and downward
    }
  })

  it('keeps the deck grid faint so racks on top stay the stronger mark', () => {
    expect(grid.opacity).toBeLessThan(0.5)
    expect(stairs.opacity).toBeLessThan(1)
  })
})

describe('rackOps — shelving', () => {
  const ops = rackShelvingOps(shelf, GS)
  const posts = ops[1], mid = ops[2]

  it('is a box, both end frames in one path, and the shelf', () => {
    expect(ops).toHaveLength(3)
    expect((posts.d.match(/M/g) || []).length).toBe(2)
    expect((mid.d.match(/M/g) || []).length).toBe(1)
  })

  it('puts the end frames on the two ends and the shelf across the middle', () => {
    expect(posts.d).toContain(`M${shelf.x} ${shelf.y}`)
    expect(posts.d).toContain(`M${shelf.x + shelf.width} ${shelf.y}`)
    expect(mid.d).toBe(
      `M${shelf.x} ${shelf.y + shelf.height / 2}L${shelf.x + shelf.width} ${shelf.y + shelf.height / 2}`)
  })

  it('weights the end frames heavier than the shelf they carry', () => {
    expect(posts.strokeWidth).toBeGreaterThan(mid.strokeWidth)
    expect(posts.strokeWidth).toBeGreaterThan(RACK_LINE.edge)
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
