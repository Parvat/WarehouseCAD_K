// MZ_mezzanine.test.js — (r9-mezzanine, docs/reports/r9-mezzanine.md) a mezzanine: its size and area, the column grid
// auto-fitted to whole bays, the deck type, stairs (a footprint outside an edge, its run from the deck height, an arrow up,
// moved along the edges) and pallet gates, the handrail on the open edges, its checks (warnings), a saved one unchanged.
import { describe, it, expect } from 'vitest'
import { mezzSpec, mezzChange, mezzColumns, mezzStairs, mezzGates, mezzRail, moveOnEdge, mezzHeadline, stairRunIn } from '../../racks/mezzanine'
import { mezzWarnings } from '../../racks/mezzCheck'
import { rackDrawOps } from '../../render/rackOps'
import { getLayoutCapacity } from '../../utils/capacity'

const GS = 40, px = (inch) => (inch / 12) * GS
const mk = (over = {}) => ({ id: 'm', type: 'rack_mezzanine', x: 0, y: 0, rotation: 0, width: 30 * GS, height: 20 * GS, ...over })
const fp = { id: 'fp', type: 'fp_rect', x: -2000, y: -2000, width: 6000, height: 6000, wallThicknessFt: 0.25, rotation: 0 }

describe('(r9-mezzanine) size, area, head', () => {
  it('30 × 20 ft: 600 sq ft, deck 10 ft — M1 · 30 × 20 ft · 600 sq ft · deck 10 ft; 55.7 m² in metric', () => {
    const o = mk(), s = mezzSpec(o, GS)
    expect([Math.round(s.areaSqFt), s.deckHeightIn, s.deckType, s.handrail]).toEqual([600, 120, 'bdeck', true])
    expect(mezzHeadline(o, 'M1', GS)).toBe('M1 · 30 × 20 ft · 600 sq ft · deck 10 ft')
    expect(mezzHeadline(o, 'M1', GS, true)).toBe('M1 · 9.1 × 6.1 m · 55.7 m² · deck 3.05 m')
  })
  it('width and depth typed: its box, the left-top corner held', () => {
    const o = mk(), r = mezzChange(o, { widthIn: 40 * 12, depthIn: 25 * 12 }, GS)
    expect([r.width, r.height, r.x, r.y]).toEqual([40 * GS, 25 * GS, undefined, undefined])
  })
  it('never pallet positions', () => {
    expect(getLayoutCapacity([mk()]).total).toBe(0)
  })
})

describe('(r9-mezzanine) the column grid: about 20 ft each way, whole bays', () => {
  it('30 × 20 ft at 20 ft: 2 × 1 bays (15 ft × 20 ft) — 6 columns; 60 × 40 ft: 3 × 2 — 12', () => {
    expect([mezzSpec(mk(), GS).baysX, mezzSpec(mk(), GS).baysY]).toEqual([2, 1])
    expect(mezzColumns(mk(), GS).length).toBe(6)
    expect(mezzColumns(mk({ width: 60 * GS, height: 40 * GS }), GS).length).toBe(12)
  })
  it('the spacing edited: the bays follow', () => {
    const o = { ...mk(), ...mezzChange(mk(), { colSpacingIn: 120 }, GS) }
    expect([mezzSpec(o, GS).baysX, mezzSpec(o, GS).baysY]).toEqual([3, 2])
  })
  it('drawn as small squares at the grid', () => {
    const col = rackDrawOps(mk(), { gridSize: GS }).find(op => op.name === 'mezz-columns')
    expect(col.rects.length).toBe(6)
  })
})

describe('(r9-mezzanine) stairs and gates', () => {
  it('one stair at the middle of the bottom edge: 4 ft wide, its run from 10 ft (18 risers → 17 × 11 in), outside the edge, the arrow up toward the deck', () => {
    const [st] = mezzStairs(mk(), GS)
    expect(stairRunIn(120)).toBe(17 * 11)
    expect([st.edge, st.box.w, st.box.h, st.box.y]).toEqual(['bottom', px(48), px(187), 20 * GS])
    expect(st.box.x + st.box.w / 2).toBe(15 * GS)
    expect(st.arrow.y1).toBeLessThan(st.arrow.y0)
    expect([st.foot.y, st.foot.h]).toEqual([20 * GS + px(187), px(36)])
  })
  it('a stair dragged to the right edge: its edge and place, one patch', () => {
    const o = mk(), p = moveOnEdge(o, 'stair', 0, 30 * GS + 50, 5 * GS)
    expect(p.stairs).toEqual([{ edge: 'right', at: 0.25 }])
    const [st] = mezzStairs({ ...o, ...p }, GS)
    expect([st.box.x, st.box.w]).toEqual([30 * GS, px(187)])
  })
  it('counts: 2 stairs, 0 gates', () => {
    const o = { ...mk(), ...mezzChange(mk(), { stairCount: 2, gateCount: 0 }, GS) }
    expect([mezzStairs(o, GS).length, mezzGates(o, GS).length]).toEqual([2, 0])
  })
  it('one pallet gate, a 5 ft bar at the middle of the top edge', () => {
    const [g] = mezzGates(mk(), GS)
    expect([g.edge, g.bar.x1, g.bar.x2, g.bar.y1]).toEqual(['top', 15 * GS - px(30), 15 * GS + px(30), 0])
  })
  it('the handrail runs on the open edges only — off: none', () => {
    const segs = mezzRail(mk(), GS), len = (s) => { let t = 0; for (let i = 0; i < s.length; i += 4) t += Math.hypot(s[i + 2] - s[i], s[i + 3] - s[i + 1]); return t }
    expect(Math.round(len(segs))).toBe(Math.round(2 * (30 + 20) * GS - px(48) - px(60)))
    expect(mezzRail(mk({ handrail: false }), GS)).toEqual([])
  })
})

describe('(r9-mezzanine) the checks: warnings', () => {
  it('a rack on a stair\'s landing: a landing warning; clear: none', () => {
    const o = mk({ parentId: 'fp' }), [st] = mezzStairs(o, GS)
    expect(mezzWarnings([fp, o], GS).filter(w => w.kind === 'landing')).toEqual([])
    const rack = { id: 'r', type: 'rack_row', x: st.foot.x, y: st.foot.y + 5, width: 400, height: 140, rotation: 0, parentId: 'fp' }
    expect(mezzWarnings([fp, o, rack], GS).filter(w => w.kind === 'landing').length).toBe(1)
  })
  it('a rack in front of the pallet gate: a gate warning (it needs a face aisle like a rack face)', () => {
    const o = mk({ parentId: 'fp' })
    expect(mezzWarnings([fp, o], GS).filter(w => w.kind === 'gate')).toEqual([])
    const rack = { id: 'r', type: 'rack_row', x: 10 * GS, y: -3 * GS - 140, width: 400, height: 140, rotation: 0, parentId: 'fp' }
    const w = mezzWarnings([fp, o, rack], GS).filter(x => x.kind === 'gate')
    expect(w.length).toBe(1)
    expect(w[0].text).toMatch(/Pallet gate 1: its face aisle is 3/)
  })
  it('racks under the mezzanine stay allowed: no warning for them', () => {
    const o = mk({ parentId: 'fp' }), rack = { id: 'r', type: 'rack_row', x: 2 * GS, y: 5 * GS, width: 400, height: 140, rotation: 0, parentId: 'fp' }
    expect(mezzWarnings([fp, o, rack], GS)).toEqual([])
  })
})

describe('(r9-mezzanine) a saved mezzanine keeps its box', () => {
  it('no new fields: the defaults, its box untouched by an edit that does not size it', () => {
    const o = mk({ width: 40 * GS, height: 20 * GS }), r = mezzChange(o, { deckType: 'grating' }, GS)
    expect([r.width, r.height, r.x, r.y, r.deckType]).toEqual([undefined, undefined, undefined, undefined, 'grating'])
  })
})
