// Area CC — a value of a column grid's dimension chain typed (col-bubbles round; utils/columnGrid.js chainEdit): a bay
// moves the gridline at its far end and every line beyond (their bays kept, the last bay to the far wall takes the
// difference); the last bay moves the last line; a line past a wall or a bay zero or less is refused.
// A 240 ft building (x 0 … 9600 px), lines every 25 ft from the wall: 0, 25 … 225 (the last bay 15 ft).
import { describe, it, expect } from 'vitest'
import { chainEdit, gridLines } from '../../utils/columnGrid'

const GS = 40, ft = (v) => v * GS
const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: ft(240), height: ft(120) }
const grid = { id: 'g', type: 'column_grid', parentId: 'fp', x: 0, y: 0, spacingX: Array(9).fill(ft(25)), spacingY: Array(4).fill(ft(30)), columnW: GS, columnH: GS }
const linesFt = (g) => gridLines(g).xs.map(v => v / GS)
const apply = (lo, hi, len, axis = 'x') => { const r = chainEdit(grid, fp, axis, ft(lo), ft(hi), ft(len), GS); return r.error ? r : { ...grid, ...r.patch } }

describe('CC — the chain typed', () => {
  it('CC-bay: B–C typed 30 ft moves C and every line beyond 5 ft — their bays kept, the last bay 10 ft; A and B stay', () => {
    expect(linesFt(apply(25, 50, 30))).toEqual([0, 25, 55, 80, 105, 130, 155, 180, 205, 230])
  })
  it('CC-first: the first bay (the wall to a line, an offset grid) moves every line', () => {
    const off = { ...grid, x: ft(10), spacingX: Array(8).fill(ft(25)) }   // 10, 35 … 210
    const r = chainEdit(off, fp, 'x', 0, ft(10), ft(15), GS)
    expect(gridLines({ ...off, ...r.patch }).xs.map(v => v / GS)).toEqual([15, 40, 65, 90, 115, 140, 165, 190, 215])
  })
  it('CC-last: the last bay typed 20 ft moves the last line only (to 220 ft)', () => {
    expect(linesFt(apply(225, 240, 20))).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 220])
  })
  it('CC-y: the left chain the same, down the lines across — its last line on the far wall stays there (column grid rule 3): a bay made shorter or longer, the lines beyond move with it, the last bay takes the difference', () => {
    const r = chainEdit(grid, fp, 'y', 0, ft(30), ft(25), GS)
    expect(gridLines({ ...grid, ...r.patch }).ys.map(v => v / GS)).toEqual([0, 25, 55, 85, 120])
    const r2 = chainEdit(grid, fp, 'y', 0, ft(30), ft(35), GS)
    expect(gridLines({ ...grid, ...r2.patch }).ys.map(v => v / GS)).toEqual([0, 35, 65, 95, 120])
    // the last bay (to the far wall's line) typed: the last inside line moves, the wall line stays
    const r3 = chainEdit(grid, fp, 'y', ft(90), ft(120), ft(20), GS)
    expect(gridLines({ ...grid, ...r3.patch }).ys.map(v => v / GS)).toEqual([0, 30, 60, 100, 120])
    // a bay that would leave the last one zero or less: refused
    expect(chainEdit(grid, fp, 'y', 0, ft(30), ft(60), GS).error).toMatch(/zero or less/)
  })
  it('CC-refused: a line past the wall, a bay zero or less — refused, nothing changed', () => {
    expect(apply(25, 50, 45).error).toMatch(/pass the wall/)          // the last line to 245 ft
    expect(apply(225, 240, 40).error).toMatch(/zero or less/)         // the last line onto the one before it (200 ft)
    expect(apply(25, 50, 0).error).toMatch(/longer than zero/)
  })
})

// (col-bubbles fix) Columns on the walls: Yes is every wall; the card's Yes / No only adds or takes away the wall lines;
// a spacing typed never centres.
import { layGrid, setWallLines, respaceAxis } from '../../utils/columnGrid'
describe('CW — Columns on the walls', () => {
  it('CW-yes: Yes lays a line on all four walls — from the near walls at the spacing, the far walls\' own line, the last bay the remainder', () => {
    const g = { ...grid, ...layGrid(grid, fp, { spX: 25, spY: 50, walls: true, wIn: 12, dIn: 12 }, GS) }
    expect(linesFt(g)).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 240])
    // (column grid rule 1) 120 at 50: 100 would leave a 20 ft end bay, under half a spacing — it goes, the end bay 70 ft
    expect(gridLines(g).ys.map(v => v / GS)).toEqual([0, 50, 120])
  })
  it('CW-toggle: the card\'s No takes the wall lines away, the inside lines exactly where they were; Yes puts a line on every wall back, the inside lines unmoved', () => {
    const off = { ...grid, ...setWallLines(grid, fp, false, GS) }
    expect(linesFt(off)).toEqual([25, 50, 75, 100, 125, 150, 175, 200, 225])
    expect(gridLines(off).ys.map(v => v / GS)).toEqual([30, 60, 90])
    const on = { ...off, ...setWallLines(off, fp, true, GS) }
    expect(linesFt(on)).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 240])
    expect(gridLines(on).ys.map(v => v / GS)).toEqual([0, 30, 60, 90, 120])
  })
  it('CW-respace: a spacing typed — Yes: wall to wall, a line on both; No: from the first line, none on a wall, never centred', () => {
    expect(gridLines({ ...grid, ...respaceAxis(grid, fp, 'x', ft(50), true, GS) }).xs.map(v => v / GS)).toEqual([0, 50, 100, 150, 200, 240])
    const off = { ...grid, ...setWallLines(grid, fp, false, GS) }
    expect(gridLines({ ...off, ...respaceAxis(off, fp, 'x', ft(50), false, GS) }).xs.map(v => v / GS)).toEqual([25, 75, 125, 175, 225])
  })
})

// The column grid rules (STUDIO.md, Column grid rules): 1 Yes — a line on all four walls, no end bay under half a spacing;
// 2 No — centred, end bays half to 1.5 spacings; 3 a bay typed or a line, bubble or column dragged — that line and every
// line beyond move together, a far-wall line held, the last bay absorbs (a drag stops at the limit).
import { wallLines, dragChain, shiftFrom } from '../../utils/columnGrid'
describe('CR — the column grid rules', () => {
  it('CR-1: Yes — 122.5 ft at 40: 0, 40, 80, 122.5 (the end bay 42.5, no 2.5 ft sliver); 240 at 25: the end bay 15 (half or more: kept); exact: no extra line', () => {
    expect(wallLines(0, ft(40), ft(122.5)).map(v => v / GS)).toEqual([0, 40, 80, 122.5])
    expect(wallLines(0, ft(25), ft(240)).map(v => v / GS)).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 240])
    expect(wallLines(0, ft(30), ft(120)).map(v => v / GS)).toEqual([0, 30, 60, 90, 120])
    const g = { ...grid, ...layGrid(grid, { ...fp, width: ft(122.5) }, { spX: 40, spY: 30, walls: true, wIn: 12, dIn: 12 }, GS) }
    expect(linesFt(g)).toEqual([0, 40, 80, 122.5])
  })
  it('CR-2: No — centred, end bays between half and 1.5 spacings, none on a wall', () => {
    for (const [len, sp] of [[122.5, 40], [240, 25], [120, 30], [100, 30]]) {
      const g = { ...grid, ...layGrid(grid, { ...fp, width: ft(len) }, { spX: sp, spY: 30, walls: false, wIn: 12, dIn: 12 }, GS) }, ls = linesFt(g)
      const ends = [ls[0], len - ls[ls.length - 1]]
      expect([len, Math.abs(ends[0] - ends[1]) < 1e-6, ends.every(e => e >= sp / 2 - 1e-6 && e <= 1.5 * sp + 1e-6)]).toEqual([len, true, true])
    }
  })
  it('CR-3: a drag — that line and every line beyond move with it, their bays kept, the far-wall line held, the last bay absorbing; it stops at the limit (a bay a column wide) instead of refusing', () => {
    const yes = { ...grid, ...layGrid(grid, fp, { spX: 25, spY: 30, walls: true, wIn: 12, dIn: 12 }, GS) }   // 0, 25 … 225, 240
    const at = (g, i, d) => linesFt({ ...g, ...dragChain(g, fp, 'x', i, gridLines(g).xs[i] + ft(d), GS) })
    expect(at(yes, 2, 5)).toEqual([0, 25, 55, 80, 105, 130, 155, 180, 205, 230, 240])
    expect(at(yes, 2, -5)).toEqual([0, 25, 45, 70, 95, 120, 145, 170, 195, 220, 240])
    // far: the last bay down to a column's width (1 ft), no further
    expect(at(yes, 2, 40)).toEqual([0, 25, 64, 89, 114, 139, 164, 189, 214, 239, 240])
    // back: a column's width from the line before
    expect(at(yes, 2, -40)[2]).toBe(26)
    // the same rule as a bay typed on the chain
    const typed = chainEdit(yes, fp, 'x', ft(25), ft(50), ft(30), GS)
    expect(linesFt({ ...yes, ...typed.patch })).toEqual(at(yes, 2, 5))
    // No (no line on the far wall): every line beyond moves, the bay to the wall absorbs, a line at most on the wall
    const no = { ...grid, ...setWallLines(yes, fp, false, GS) }
    expect(at(no, 1, 5)).toEqual([25, 55, 80, 105, 130, 155, 180, 205, 230])
    expect(at(no, 1, 40)[8]).toBe(240)
    expect(shiftFrom([0, 10, 20, 30], 1, 2, 30)).toEqual([0, 12, 22, 30])
  })
})
