// CV_cantilever.test.js — (r6-cantilever, docs/reports/r6-cantilever.md) the cantilever engine: its properties and size,
// card edits, end handles in whole columns, load spots (not pallet positions) and BOM; a saved cantilever unchanged.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { cantSpec, cantNew, cantChange, cantResize, cantSizeIn, cantSpots, cantParts, cantHeadline, CANT_DEFAULTS } from '../../racks/cantilever'
import { rackCantileverOps, markBoxes } from '../../render/rackOps'
import { getLayoutCapacity, getRackCapacity } from '../../utils/capacity'

const GS = 40, inch = (v) => Math.round((v / GS) * 12 * 100) / 100
const load = (name) => JSON.parse(readFileSync(new URL(`./handCheck/${name}.wcad`, import.meta.url), 'utf8'))
const mk = (over = {}) => ({ id: 'c', type: 'rack_cantilever', x: 1000, y: 1000, rotation: 0, ...cantNew(GS), ...over })
const ch = (o, p) => ({ ...o, ...cantChange(o, p, GS) })
const parts = (o) => cantParts(o, GS).map(p => [p.part, p.size, p.qty])

describe('(r6-cantilever) a new cantilever: the defaults', () => {
  it('single-sided, 4 columns at 8 ft, 4 ft arms, 3 levels, first arm 12 in, column 12 ft, straight, base 4 ft 6 in', () => {
    const s = cantSpec(mk(), GS)
    expect([s.doubleSided, s.columns, s.spacingIn, s.armIn, s.levels, s.firstArmIn, s.columnHeightIn, s.armType, s.baseIn, s.baseTyped])
      .toEqual([false, 4, 96, 48, 3, 12, 144, 'straight', 54, false])
  })
  it('its size: 3 bays × 8 ft long, the arm + the column line deep', () => {
    const o = mk()
    expect([inch(o.width), inch(o.height)]).toEqual([3 * 96, 48 + 4])
  })
  it('the head: C1 · 4 columns · 3 bays · 3 levels · single-sided', () => {
    expect(cantHeadline(mk(), 'C1', GS)).toBe('C1 · 4 columns · 3 bays · 3 levels · single-sided')
  })
  it('load spots: 3 bays × 3 levels × 1 side = 9; never pallet positions', () => {
    const o = mk()
    expect(cantSpots(cantSpec(o, GS))).toBe(9)
    expect(cantSpots(cantSpec(ch(o, { doubleSided: true }), GS))).toBe(18)
    expect(getRackCapacity(o)).toBeNull()
    expect(getLayoutCapacity([o]).total).toBe(0)
  })
})

describe('(r6-cantilever) the card edits', () => {
  it('Double: arms both ways — the depth is 2 arms + the column line, the anchored corner held', () => {
    const o = mk(), d = ch(o, { doubleSided: true })
    expect([d.doubleSided, inch(d.height), d.x, d.y]).toEqual([true, 2 * 48 + 4, o.x, o.y])
  })
  it('Columns, spacing, arm length: the size follows', () => {
    const o = mk()
    expect(inch(ch(o, { columns: 6 }).width)).toBe(5 * 96)
    expect(ch(o, { columns: 6 }).towers).toEqual([48, 48, 48, 48, 48, 48])
    expect(inch(ch(o, { spacingIn: 120 }).width)).toBe(3 * 120)
    const a = ch(o, { armIn: 60 })
    expect([inch(a.height), a.towers, cantSpec(a, GS).baseIn]).toEqual([64, [60, 60, 60, 60], 66])
    expect(ch(o, { columns: 1 }).towers.length).toBe(2)
  })
  it('levels, first arm, column height, arm type: the size unchanged', () => {
    const o = mk()
    for (const p of [{ levels: 5 }, { firstArmIn: 18 }, { columnHeightIn: 192 }, { armType: 'inclined' }]) {
      const r = ch(o, p)
      expect([r.width, r.height]).toEqual([o.width, o.height])
    }
    expect(cantSpec(ch(o, { armType: 'inclined' }), GS).armType).toBe('inclined')
  })
  it('Base length: typed, kept; null goes back to arm + 6 in', () => {
    const o = ch(mk(), { baseIn: 60 })
    expect([cantSpec(o, GS).baseIn, cantSpec(o, GS).baseTyped]).toEqual([60, true])
    expect(cantSpec(ch(o, { armIn: 72 }), GS).baseIn).toBe(60)
    expect(cantSpec(ch(o, { baseIn: null }), GS).baseIn).toBe(54)
  })
})

describe('(r6-cantilever) the end handles: whole columns', () => {
  it('mr dragged 1.4 bays: one column more, the left end held; ml: the right end held', () => {
    const o = mk(), step = (96 / 12) * GS
    const r = cantResize(o, 'mr', step * 1.4, 0, GS)
    expect([r.towers.length, inch(r.width), r.x]).toEqual([5, 4 * 96, o.x])
    const l = cantResize(o, 'ml', step, 0, GS)
    expect([l.towers.length, inch(l.width), l.x + l.width]).toEqual([3, 2 * 96, o.x + o.width])
  })
  it('never under 2 columns; a small drag changes nothing; the depth sides change nothing', () => {
    const o = mk(), step = (96 / 12) * GS
    expect(cantResize(o, 'ml', step * 9, 0, GS).towers.length).toBe(2)
    expect(cantResize(o, 'mr', step * 0.3, 0, GS)).toEqual({ width: o.width, height: o.height, x: o.x, y: o.y })
    expect(cantResize(o, 'bc', 0, 500, GS)).toEqual({ width: o.width, height: o.height, x: o.x, y: o.y })
  })
})

describe('(r6-cantilever) the drawing: the arm reach dashed, both sides when double; an X box per arm bay', () => {
  it('single: one reach zone, 3 arm bays; double: two, 6', () => {
    const o = mk(), d = ch(o, { doubleSided: true })
    const zones = (x) => rackCantileverOps(x, GS).find(op => op.name === 'arm-reach').rects.length
    expect([zones(o), zones(d)]).toEqual([1, 2])
    expect([markBoxes(o, GS).length, markBoxes(d, GS).length]).toEqual([3, 6])
  })
})

describe('(r6-cantilever) the BOM', () => {
  it('a new one (4 columns, 3 levels, single): Column 4 by height, Arm 12 by length, Base 4, Brace 3 by spacing, Anchor 8', () => {
    expect(parts(mk())).toEqual([
      ['Column', '12 ft', 4],
      ['Arm', '4 ft · Straight', 4 * 3 * 1],
      ['Base', '4 ft 6 in', 4],
      ['Brace', '8 ft', 3],
      ['Anchor', '', 2 * 4],
    ])
  })
  it('double-sided: arms × 2; the base spans both sides (2 × base length)', () => {
    const p = parts(ch(mk(), { doubleSided: true }))
    expect(p.find(l => l[0] === 'Arm')[2]).toBe(4 * 3 * 2)
    expect(p.find(l => l[0] === 'Base')).toEqual(['Base', '9 ft', 4])
  })
})

describe('(r6-cantilever) a saved cantilever keeps its size exactly', () => {
  it('walls-racks: double (unset reads double), 4 columns at 4 ft (its width / 3), 36 in arms; its size, towers and drawing kept', () => {
    const o = load('walls-racks').objects.find(x => x.type === 'rack_cantilever'), s = cantSpec(o, GS)
    expect([s.doubleSided, s.columns, s.spacingIn, s.armIn, s.levels, s.baseIn]).toEqual([true, 4, 48, 36, CANT_DEFAULTS.armLevels, 42])
    const { w, h } = cantSizeIn(s)
    expect([Math.abs((w / 12) * GS - o.width) < 1e-6, Math.abs((h / 12) * GS - o.height) < 1e-6]).toEqual([true, true])
    const r = ch(o, { levels: 4 })
    expect([r.width, r.height, r.towers, r.x, r.y]).toEqual([o.width, o.height, o.towers, o.x, o.y])
    expect(rackCantileverOps({ ...o, ...r }, GS)).toEqual(rackCantileverOps(o, GS))
  })
})
