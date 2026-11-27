// PC_pushbackConfig.test.js — (pushback-config, docs/reports/pushback-config.md) the push-back frame split is a DEALER
// SETTING on the card (PP is not sure; dealers differ):
//   Max pallets per frame (2 to 6; a new rack 2) — N = ceil(deep / max)
//   Longer frame at (Front or Rear; a new rack Front) — the pallets split as evenly as they go, the longer frames at that end
//   depth, drawing and BOM follow N; a saved push-back reads max 3 / Front, the split it always had, so nothing changes
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { laneNew, laneSpec, laneChange, laneSizeIn, laneFrames } from '../../racks/laneEngine'
import { laneParts } from '../../racks/laneBom'
import { rackPushbackOps } from '../../render/rackOps'

const GS = 40, px = (inch) => (inch / 12) * GS, inch = (v) => Math.round((v / GS) * 12 * 100) / 100
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8'))
const mk = (over = {}) => ({ id: 'p', type: 'rack_pushback', x: 1000, y: 1000, rotation: 0, ...laneNew('rack_pushback', GS), ...over })
const ch = (o, p) => ({ ...o, ...laneChange(o, p, GS) })
// the frames front first, as the card's line reads them (laneSpec lists them rear → front)
const front = (o) => [...laneSpec(o, GS).frames].reverse()
const qty = (o, part) => laneParts(o, 3, GS).filter(p => p.part === part).reduce((a, p) => a + p.qty, 0)

describe('(pushback-config) a new push-back: max 2 a frame, longer frame at the front', () => {
  it('the defaults, saved on the rack', () => {
    const o = mk()
    expect([o.maxPerFrame, o.longerAt, laneSpec(o, GS).maxPerFrame, laneSpec(o, GS).longerAt]).toEqual([2, 'front', 2, 'front'])
  })
  it('max 2: N = ceil(deep / 2), 2 to 6 deep', () => {
    expect([2, 3, 4, 5, 6].map(D => front(ch(mk(), { deep: D })))).toEqual([[2], [2, 1], [2, 2], [2, 2, 1], [2, 2, 2]])
  })
  it('max 3: N = ceil(deep / 3)', () => {
    const o = ch(mk(), { maxPerFrame: 3 })
    expect([2, 3, 4, 5, 6].map(D => front(ch(o, { deep: D })))).toEqual([[2], [3], [2, 2], [3, 2], [3, 3]])
  })
  it('max 6: one frame at every depth, no row spacer', () => {
    const o = ch(mk(), { maxPerFrame: 6 })
    for (const D of [2, 3, 4, 5, 6]) {
      const r = ch(o, { deep: D })
      expect(front(r)).toEqual([D])
      expect(inch(r.height)).toBe(D * 52)
      expect(qty(r, 'Row spacer')).toBe(0)
    }
  })
  it('allowed 2 to 6: a typed value outside is held to it', () => {
    expect([1, 7, 4].map(v => laneChange(mk(), { maxPerFrame: v }, GS).maxPerFrame)).toEqual([2, 6, 4])
  })
})

describe('(pushback-config) Longer frame at: Front or Rear', () => {
  it('5 deep at max 3: 3 + 2 with Front, 2 + 3 with Rear (front first)', () => {
    const o = ch(ch(mk(), { maxPerFrame: 3 }), { deep: 5 })
    expect(front(o)).toEqual([3, 2])
    expect(front(ch(o, { longerAt: 'rear' }))).toEqual([2, 3])
  })
  it('5 deep at max 2: 2 + 2 + 1 with Front, 1 + 2 + 2 with Rear', () => {
    const o = ch(mk(), { deep: 5 })
    expect(front(o)).toEqual([2, 2, 1])
    expect(front(ch(o, { longerAt: 'rear' }))).toEqual([1, 2, 2])
  })
  it('an even split: Front and Rear the same', () => {
    const o = mk()
    expect(front(ch(o, { longerAt: 'rear' }))).toEqual(front(o))
  })
  it('only the order moves: the size and the BOM counts stay; the frames listed by depth stay', () => {
    const o = ch(ch(mk(), { maxPerFrame: 3 }), { deep: 5 }), r = ch(o, { longerAt: 'rear' })
    expect(r.height).toBe(o.height)
    const sum = (x) => Object.fromEntries(laneParts(x, 3, GS).map(p => [p.part + ' ' + p.size, p.qty]))
    expect(sum(r)).toEqual(sum(o))
  })
  it('the drawing: the joint gap follows the longer frame', () => {
    const ys = (x) => { const sl = rackPushbackOps(x, GS).find(op => op.rects?.length === 3 * 5); const v = [...new Set(sl.rects.map(q => Math.round(q.y * 1000) / 1000))].sort((a, b) => a - b); return v.map((y, i) => i ? inch(y - v[i - 1]) : 0) }
    const o = ch(ch(mk(), { maxPerFrame: 3 }), { deep: 5 })
    expect(ys(o)).toEqual([0, 52, 58, 52, 52])                       // top = rear: 2 then 3 (the 3 at the front)
    expect(ys(ch(o, { longerAt: 'rear' }))).toEqual([0, 52, 52, 58, 52])   // 3 at the rear, then 2
  })
})

describe('(pushback-config) depth and BOM follow N', () => {
  it('a new 3-deep: 2 frames (2 + 1), one joint: 3 × 52 + 6 deep; frames P × 2, spacers P × 1 × 2, beams L V × 3, anchors 2 P × 4', () => {
    const o = ch(mk(), { deep: 3 })
    expect(inch(o.height)).toBe(3 * 52 + 6)
    expect([qty(o, 'Upright frame'), qty(o, 'Row spacer'), qty(o, 'Beam'), qty(o, 'Anchor')]).toEqual([4 * 2, 4 * 1 * 2, 3 * 3 * 3, 2 * 4 * 4])
  })
  it('a new 5-deep: 3 frames (2 + 2 + 1), two joints: 5 × 52 + 12; frames P × 3, spacers P × 2 × 2, beams L V × 4, anchors 2 P × 6', () => {
    const o = ch(mk(), { deep: 5 })
    expect(inch(o.height)).toBe(5 * 52 + 12)
    expect([qty(o, 'Upright frame'), qty(o, 'Row spacer'), qty(o, 'Beam'), qty(o, 'Anchor')]).toEqual([4 * 3, 4 * 2 * 2, 3 * 3 * 4, 2 * 4 * 6])
  })
  it('Max pallets per frame changed: the depth follows (a joint more or less), the anchored corner held', () => {
    const o = ch(mk(), { deep: 5 }), r = ch(o, { maxPerFrame: 3 })
    expect([inch(r.height), r.x, r.y]).toEqual([5 * 52 + 6, o.x, o.y])
    expect(inch(ch(r, { maxPerFrame: 6 }).height)).toBe(5 * 52)
  })
})

describe('(pushback-config) saved push-backs: unchanged on load', () => {
  it('lane-push and walls-racks read max 3 / Front and the split they had (laneFrames at 3, the odd pallet at the front)', () => {
    for (const name of ['lane-push', 'walls-racks']) for (const o of load(name).objects.filter(x => x.type === 'rack_pushback')) {
      expect(o.maxPerFrame).toBeUndefined()
      const s = laneSpec(o, GS)
      expect([name, s.maxPerFrame, s.longerAt, s.spacerIn]).toEqual([name, 3, 'front', 0])
      expect(s.frames).toEqual(laneFrames('rack_pushback', s.deep, 3))
      expect(Math.abs(px(laneSizeIn(s).h) - o.height)).toBeLessThan(1e-6)
    }
  })
  it('an edit writes the fields it had (3, Front): the size and the split kept', () => {
    for (const o of load('lane-push').objects.filter(x => x.type === 'rack_pushback')) {
      const r = ch(o, { levels: 4 })
      expect([r.maxPerFrame, r.longerAt, r.height, laneSpec(r, GS).frames]).toEqual([3, 'front', o.height, laneSpec(o, GS).frames])
    }
  })
  it('their BOM is the one pushback-frames gave', () => {
    const o = load('lane-push').objects.find(x => x.type === 'rack_pushback')
    expect(laneParts(o, 3, GS).map(p => [p.part, p.size, p.qty]).slice(0, 2)).toEqual([['Upright frame', '15 ft × 8 ft 8 in', 8], ['Row spacer', '0 in', 8]])
  })
})
