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
  it('CC-y: the left chain the same, down the lines across (its last line on the far wall: a bay made shorter, every line beyond moves up)', () => {
    const r = chainEdit(grid, fp, 'y', 0, ft(30), ft(25), GS)
    expect(gridLines({ ...grid, ...r.patch }).ys.map(v => v / GS)).toEqual([0, 25, 55, 85, 115])
    // and longer: its last line past the far wall — refused
    expect(chainEdit(grid, fp, 'y', 0, ft(30), ft(35), GS).error).toMatch(/pass the wall/)
  })
  it('CC-refused: a line past the wall, a bay zero or less — refused, nothing changed', () => {
    expect(apply(25, 50, 45).error).toMatch(/pass the wall/)          // the last line to 245 ft
    expect(apply(225, 240, 40).error).toMatch(/zero or less/)         // the last line onto the one before it (200 ft)
    expect(apply(25, 50, 0).error).toMatch(/longer than zero/)
  })
})
