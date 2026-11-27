// SH_shelving.test.js — (r7-shelving, docs/reports/r7-shelving.md) steel boltless shelving: height and back-to-back, end
// handles in whole units, the BOM; a saved run unchanged.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { shelfSpec, shelfNew, backToBackChange, shelfResize, shelfParts } from '../../racks/shelving'
import { shelvingLabel } from '../../utils/shelving'
import { markBoxes } from '../../render/rackOps'

const GS = 40, inch = (v) => Math.round((v / GS) * 12 * 100) / 100
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8'))
const mk = (over = {}) => ({ id: 's', type: 'rack_shelving', x: 1000, y: 1000, rotation: 0, ...shelfNew(GS), ...over })
const parts = (o) => shelfParts(o, GS).map(p => [p.part, p.size, p.qty])

describe('(r7-shelving) a new run', () => {
  it('4 units of 48 × 24, 5 shelves, 7 ft, not back-to-back; the head S1 · 4 units · 48×24 · 5 shelves · 7 ft', () => {
    const o = mk(), s = shelfSpec(o, GS)
    expect([s.units, s.unitIn, s.depthIn, s.shelves, s.heightIn, s.backToBack]).toEqual([4, 48, 24, 5, 84, false])
    expect([inch(o.width), inch(o.height)]).toEqual([192, 24])
    expect(shelvingLabel(o, GS, 'S1')).toBe('S1 · 4 units · 48×24 · 5 shelves · 7 ft')
  })
})

describe('(r7-shelving) back-to-back', () => {
  it('on: two runs sharing the back — twice as deep, one run\'s depth kept; off: back', () => {
    const o = mk(), b = { ...o, ...backToBackChange(o, true, GS) }
    expect([b.backToBack, inch(b.height), shelfSpec(b, GS).depthIn, shelfSpec(b, GS).runs]).toEqual([true, 48, 24, 2])
    expect(shelvingLabel(b, GS, 'S1')).toBe('S1 · 4 units · 48×24 · 5 shelves · 7 ft · back-to-back')
    const c = { ...b, ...backToBackChange(b, false, GS) }
    expect([c.backToBack, inch(c.height)]).toEqual([false, 24])
  })
  it('an X box per unit on each run', () => {
    const o = mk(), b = { ...o, ...backToBackChange(o, true, GS) }
    expect([markBoxes(o, GS).length, markBoxes(b, GS).length]).toEqual([4, 8])
  })
})

describe('(r7-shelving) the end handles: whole units', () => {
  it('mr dragged 1.6 units: 2 more, the left end held; ml: the right end held; a depth side: the plain resize', () => {
    const o = mk(), uw = (48 / 12) * GS
    const r = shelfResize(o, 'mr', uw * 1.6, 0, GS)
    expect([Math.round(r.width / uw), r.x]).toEqual([6, o.x])
    const l = shelfResize(o, 'ml', uw, 0, GS)
    expect([Math.round(l.width / uw), l.x + l.width]).toEqual([3, o.x + o.width])
    expect(shelfResize(o, 'bc', 0, 50, GS)).toBeNull()
    expect(shelfResize(o, 'ml', uw * 9, 0, GS).width).toBe(uw)
  })
})

describe('(r7-shelving) the BOM', () => {
  it('a new run (4 units, 5 shelves): Post 10 by height, Long beam 40 by width, Short beam 25 by depth, Deck 20', () => {
    expect(parts(mk())).toEqual([
      ['Post', '7 ft', (4 + 1) * 2],
      ['Long beam', '48 in', 4 * 5 * 2],
      ['Short beam', '24 in', (4 + 1) * 5],
      ['Deck', '48 × 24 in', 4 * 5],
    ])
  })
  it('back-to-back: every line doubled (two runs)', () => {
    const o = mk(), b = { ...o, ...backToBackChange(o, true, GS) }
    expect(parts(b).map(p => p[2])).toEqual(parts(o).map(p => p[2] * 2))
    expect(parts(b).map(p => p[1])).toEqual(parts(o).map(p => p[1]))
  })
})

describe('(r7-shelving) a saved run keeps its size exactly', () => {
  it('walls-racks: 4 units of 48 × 24, 5 shelves; height reads 7 ft, back-to-back off; nothing resized', () => {
    const o = load('walls-racks').objects.find(x => x.type === 'rack_shelving'), s = shelfSpec(o, GS)
    expect([s.units, s.unitIn, s.depthIn, s.shelves, s.heightIn, s.backToBack]).toEqual([4, 48, 24, 5, 84, false])
    expect([o.heightIn, o.backToBack]).toEqual([undefined, undefined])
  })
})

describe('(r7-shelving) back-to-back: only the two fronts get the pick check', () => {
  it('a rack 1 ft off the top front: that run\'s 4 units lost (an X each), the bottom run\'s kept', async () => {
    const { faceLostMarks } = await import('../../generate/coverLost')
    const { MHE_PROFILES } = await import('../../generate/columnCheck')
    const o = mk(), b = { ...o, ...backToBackChange(o, true, GS) }
    const wall = { id: 'r', type: 'rack_row', x: b.x - 200, y: b.y - GS - 140, width: b.width + 400, height: 140, rotation: 0 }
    const marks = faceLostMarks([b, wall], { gridSize: GS, profile: MHE_PROFILES.reach, walkwayIn: 44 }).filter(m => m.rackId === b.id)
    expect(marks.length).toBe(4)
    expect(marks.every(m => m.y + m.h <= b.y + b.height / 2 + 1e-6)).toBe(true)
  })
})
