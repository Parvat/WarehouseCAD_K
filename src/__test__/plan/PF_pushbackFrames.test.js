// PF_pushbackFrames.test.js — (pushback-frames, docs/reports/pushback-frames.md) PP's option B: a deep push-back is short
// frames tied with row spacers, not one frame the full depth.
//   N frames a post line (1 up to 3 deep, 2 from 4 deep); the rack's depth = its frames' depths + a row spacer at each joint
//   BOM: Upright frame P × N by frame depth · Row spacer P × (N − 1) × spacers per joint by length · Beam L V (N + 1)
//        · Anchor 2 × P × 2N · Rail set, Cart, Entry guide unchanged
//   a saved push-back keeps its outer size exactly (its spacer: what fits — 0 on every one saved so far)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { laneNew, laneSpec, laneChange, laneResize, laneSizeIn, laneFrames, laneJoints, PUSHBACK_PER_FRAME } from '../../racks/laneEngine'
import { laneParts, pushbackParts } from '../../racks/laneBom'
import { rackPushbackOps } from '../../render/rackOps'

const GS = 40, px = (inch) => (inch / 12) * GS, inch = (v) => Math.round((v / GS) * 12 * 100) / 100
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8'))
const mk = (over = {}) => ({ id: 'p', type: 'rack_pushback', x: 1000, y: 1000, rotation: 0, ...laneNew('rack_pushback', GS), ...over })
const deepTo = (D, o = mk()) => ({ ...o, ...laneChange(o, { deep: D }, GS) })
const parts = (o, V = 3) => Object.fromEntries(laneParts(o, V, GS).map(p => [p.part + (p.part === 'Upright frame' ? ' ' + p.size : ''), p.qty]))

describe('(pushback-frames) the frames a post line', () => {
  it('2 to 3 deep: 1 frame; 4 to 6 deep: 2 frames, the odd pallet on the front frame', () => {
    expect(PUSHBACK_PER_FRAME).toBe(3)
    expect([2, 3, 4, 5, 6].map(D => laneFrames('rack_pushback', D))).toEqual([[2], [3], [2, 2], [2, 3], [3, 3]])
    expect([2, 3, 4, 5, 6].map(D => laneJoints('rack_pushback', D))).toEqual([0, 0, 1, 1, 1])
  })
  it('3 frames when a frame carries 2 pallets (the split is general: 6 deep → 2 + 2 + 2)', () => {
    expect(laneFrames('rack_pushback', 6, 2)).toEqual([2, 2, 2])
    expect(laneFrames('rack_pushback', 5, 2)).toEqual([1, 2, 2])
  })
  it('the other lane types: one run, no joint, their size unchanged by a spacer field', () => {
    for (const t of ['rack_drive_in', 'rack_drive_through', 'rack_pallet_flow']) {
      expect(laneJoints(t, 6)).toBe(0)
      const o = { id: 'x', type: t, x: 0, y: 0, rotation: 0, ...laneNew(t, GS) }
      expect(laneSizeIn({ ...laneSpec(o, GS), spacerIn: 99 }).h).toBe(laneSpec(o, GS).deep * laneSpec(o, GS).stationIn)
      expect(o.spacerIn).toBeUndefined()
    }
  })
})

describe('(pushback-frames) the BOM — 1, 2 and 3 frames deep', () => {
  it('1 frame (3 deep at max 3): P frames the full depth, no row spacer, beams front and rear, 2 × P × 2 anchors', () => {
    const o = deepTo(3, mk({ maxPerFrame: 3 }))   // (pushback-config) a new rack is max 2: 3 at max 3 is one frame
    expect(laneParts(o, 3, GS).map(p => [p.part, p.size, p.qty])).toEqual([
      ['Upright frame', '15 ft 8 in × 13 ft', 4],
      ['Beam', '46 in', 3 * 3 * 2],
      ['Rail set', '3 deep', 9],
      ['Cart', '', 2 * 9],
      ['Entry guide', '', 6],
      ['Anchor', '', 2 * 4 * 2],
    ])
  })
  it('2 frames (PP\'s example, 3 lanes × 4 deep × 3 levels): 8 frames, 8 row spacers, 27 beams, 32 anchors', () => {
    const p = parts(mk())
    expect([p['Upright frame 15 ft 8 in × 8 ft 8 in'], p['Row spacer'], p.Beam, p.Anchor, p['Rail set'], p.Cart, p['Entry guide']]).toEqual([8, 8, 27, 32, 9, 27, 6])
  })
  it('2 frames of different depths (5 deep): each listed by its own depth', () => {
    const l = laneParts(deepTo(5, mk({ maxPerFrame: 3 })), 3, GS).filter(p => p.part === 'Upright frame').map(p => [p.size, p.qty])
    expect(l).toEqual([['15 ft 8 in × 8 ft 8 in', 4], ['15 ft 8 in × 13 ft', 4]])
  })
  it('3 frames (the formulas at N = 3): P × 3 frames, P × 2 × J spacers, L V × 4 beams, 2 × P × 6 anchors', () => {
    const s = { ...laneSpec(deepTo(6), GS), frames: [2, 2, 2] }
    expect(pushbackParts(s, 3).map(p => [p.part, p.size, p.qty])).toEqual([
      ['Upright frame', '15 ft 8 in × 8 ft 8 in', 4 * 3],
      ['Row spacer', '6 in', 4 * 2 * 2],
      ['Beam', '46 in', 3 * 3 * 4],
      ['Rail set', '6 deep', 9],
      ['Cart', '', 5 * 9],
      ['Entry guide', '', 6],
      ['Anchor', '', 2 * 4 * 6],
    ])
  })
  it('spacers per joint: the spacer count follows, nothing else', () => {
    const o = mk(), a = parts(o), b = parts({ ...o, ...laneChange(o, { spacersPerJoint: 3 }, GS) })
    expect([a['Row spacer'], b['Row spacer']]).toEqual([8, 12])
    expect({ ...b, 'Row spacer': 8 }).toEqual(a)
  })
})

describe('(pushback-frames) the size: frames + spacers', () => {
  it('a new push-back: 4 stations + one 6 in row spacer deep', () => {
    const o = mk()
    expect([o.spacerIn, o.spacersPerJoint, inch(o.height)]).toEqual([6, 2, 4 * 52 + 6])
  })
  it('Row spacer length: the depth follows, the anchored corner held; 3 deep has no joint', () => {
    const o = mk(), a = { ...o, ...laneChange(o, { spacerIn: 12 }, GS) }
    expect([a.spacerIn, inch(a.height), a.x, a.y]).toEqual([12, 4 * 52 + 12, o.x, o.y])
    // (pushback-config) a new rack is max 2 a frame: 3 deep is 2 frames (1 joint), 6 deep 3 frames (2 joints); at max 3, 3 deep has none
    expect(inch(deepTo(3, a).height)).toBe(3 * 52 + 12)
    expect(inch(deepTo(6, a).height)).toBe(6 * 52 + 24)
    expect(inch(deepTo(3, { ...a, ...laneChange(a, { maxPerFrame: 3 }, GS) }).height)).toBe(3 * 52)
    expect(laneSpec(a, GS).stationIn).toBe(52)
  })
  it('spacers per joint: the size unchanged; whole numbers, at least 1', () => {
    const o = mk(), a = laneChange(o, { spacersPerJoint: 4 }, GS)
    expect([a.spacersPerJoint, a.height]).toEqual([4, o.height])
    expect(laneChange(o, { spacersPerJoint: 0 }, GS).spacersPerJoint).toBe(2)
  })
  it('the depth handle: whole stations, the joint kept', () => {
    const o = deepTo(3), r = laneResize(o, 'bc', 0, px(52), GS)
    expect([r.palletDeep, inch(r.height)]).toEqual([4, 4 * 52 + 6])
  })
  it('the drawing: a row spacer\'s gap between the frames\' slots; the arrows in the front pallet', () => {
    const o = mk(), slots = rackPushbackOps(o, GS).find(op => op.name === 'slots' || op.op === 'slots' || op.rects?.length === 12)
    const ys = [...new Set(slots.rects.map(r => Math.round(r.y * 1000) / 1000))].sort((a, b) => a - b)
    const step = ys.map((y, i) => i ? Math.round(((y - ys[i - 1]) / GS) * 12 * 100) / 100 : 0)
    expect(step).toEqual([0, 52, 58, 52])   // the joint: a station + the 6 in spacer
  })
})

describe('(pushback-frames) saved push-backs keep their outer size exactly', () => {
  it('lane-push and walls-racks: the spacer reads what fits (0 in); the size, the drawing and an edit keep it', () => {
    for (const name of ['lane-push', 'walls-racks']) for (const o of load(name).objects.filter(x => x.type === 'rack_pushback')) {
      const s = laneSpec(o, GS)
      expect([name, s.spacerIn]).toEqual([name, 0])
      expect(Math.abs(px(laneSizeIn(s).h) - o.height)).toBeLessThan(1e-6)
      expect(laneChange(o, { lanes: s.lanes }, GS).height).toBe(o.height)
      expect(laneChange(o, { levels: s.levels + 1 }, GS).height).toBe(o.height)
      // the drawing: the stations exactly as before (height / deep)
      const sl = rackPushbackOps(o, GS).find(op => op.rects?.length === s.lanes * s.deep)
      const ys = [...new Set(sl.rects.map(r => r.y))].sort((a, b) => a - b)
      ys.forEach((y, k) => expect(Math.abs(y - (ys[0] + k * (o.height / s.deep)))).toBeLessThan(1e-9))
    }
  })
  it('the section: a saved rack and a new one — each part\'s sizes listed together, frames first', async () => {
    const { laneBom } = await import('../../racks/laneBom')
    const f = load('lane-push'), p1 = f.objects.find(x => x.type === 'rack_pushback')
    const objs = [...f.objects, mk({ id: 'pb-new', x: p1.x + p1.width + 400, y: p1.y, layerId: p1.layerId })]
    const t = laneBom(objs, f.elevations, { gridSize: GS, types: new Set(['rack_pushback']) })[0]
    expect(t.lines.map(l => l.part)).toEqual(['Upright frame', 'Upright frame', 'Row spacer', 'Row spacer', 'Beam', 'Rail set', 'Cart', 'Entry guide', 'Anchor'])
  })
  it('the BOM of a saved one: frames by depth, its row spacers listed at the length that fits', () => {
    const o = load('lane-push').objects.find(x => x.type === 'rack_pushback')
    const l = laneParts(o, 3, GS).map(p => [p.part, p.size, p.qty])
    expect(l.slice(0, 2)).toEqual([['Upright frame', '15 ft × 8 ft 8 in', 8], ['Row spacer', '0 in', 8]])
  })
})
