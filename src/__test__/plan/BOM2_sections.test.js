// BOM round 2 — the count per rack line and per section, by hand (utils/bom.js computeBom, byRowTable; utils/rackLines.js;
// export/bomXlsx.js). Every expected quantity is written by hand with its arithmetic beside it, never read back from the code.
//
// The hand-count layout (gridSize 40 px per ft; uprights 3″; frame depth 42″; flue 9″; rows run across, rotation 0):
//   Section 1 holds pair P1 — elevation A: levels 0, 60, 120, 180 → 3 beam levels; upright 192″ = 16′ (not above 16′:
//     1 row spacer per frame pair); 2 bays of 96″
//   Section 2 holds pair P2 — elevation C: levels 6, 60, 120, 180 → 4 beam levels; upright 240″ = 20′ (above 16′: 2 row
//     spacers per frame pair); 1 bay of 96″
//   Lines, top to bottom: P1's top side R1, its bottom side R2; P2 (below it) R3, R4.
import { describe, it, expect } from 'vitest'
import { computeBom, byRowTable, bomCsv, BY_ROW_PARTS } from '../../utils/bom'
import { numberLines } from '../../utils/rackLines'
import { bomXlsx, bomXlsxSheet } from '../../export/bomXlsx'
import { readStoredZip, sheetCells } from '../../utils/xlsx'

const GS = 40, UP = 3, DEPTH = 42, FLUE = 9
const px = (inch) => (inch / 12) * GS
const lv = (ins) => ins.map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2000 }))
const A = { id: 'A', name: 'A', uprightHeightIn: 192, beamFaceIn: 4, levels: lv([0, 60, 120, 180]) }
const C = { id: 'C', name: 'C', uprightHeightIn: 240, beamFaceIn: 4, levels: lv([6, 60, 120, 180]) }
const table = (rackLines) => ({ version: 3, defaultId: 'A', types: [A, C], project: null, ...(rackLines ? { rackLines } : {}) })
function pair(id, beams, x, y, elevType) {
  const width = px(UP * (beams.length + 1) + beams.reduce((t, b) => t + b, 0)), height = px(DEPTH * 2 + FLUE)
  return { id, type: 'rack_double_row', x, y, width, height, rotation: 0, beams, uprightWidth: UP, depthIn: DEPTH, flueSpaceIn: FLUE, levels: 4, elevType, parentId: 'fp' }
}
const fp = { id: 'fp', type: 'fp_rect', x: -px(240), y: -px(480), width: px(1200), height: px(1200) }
const P1 = pair('P1', [96, 96], 0, 0, 'A')
const P2 = pair('P2', [96], 0, px(240), 'C')
const S1 = { id: 's1', type: 'section_area', layerId: 'sections', shape: 'rect', x: -px(60), y: -px(60), width: px(480), height: px(170), label: 'Section 1' }
const S2 = { id: 's2', type: 'section_area', layerId: 'sections', shape: 'rect', x: -px(60), y: px(180), width: px(480), height: px(170), label: 'Section 2' }
const layout = [fp, S1, S2, P1, P2]
const parts = (lines) => Object.fromEntries(lines.map(l => [l.part + (l.size ? ' ' + l.size : ''), l.part === 'Beam' ? `${l.qty} (${l.pairs})` : l.qty]))

describe('BOM2 — sections, rack lines, By row (hand count)', () => {
  const bom = computeBom(layout, table())

  it('BOM2-lines: R1–R4 top to bottom, a pair two lines; each in its section', () => {
    expect(bom.rows.map(r => [r.label, r.ids.join(), r.ws, r.sectionId])).toEqual([
      ['R1', 'P1', 'lo', 's1'], ['R2', 'P1', 'hi', 's1'],      // P1: its top side, then its bottom side
      ['R3', 'P2', 'lo', 's2'], ['R4', 'P2', 'hi', 's2'],      // P2, below P1
    ])
    expect(bom.sections.map(s => [s.name, s.rows])).toEqual([['Section 1', [1, 2]], ['Section 2', [3, 4]]])   // no Unassigned: every line is in one
  })

  it('BOM2-sections: each section\'s lines and totals, and the grand total', () => {
    expect(parts(bom.sections[0].lines)).toEqual({
      'Upright frame 16′ × 42″': 6,          // 2 bays → 3 frame positions × 2 sides
      'Beam 96″ × 4″ face': '24 (12)',       // 2 bays × 2 sides × 3 beam levels = 12 pairs; × 2 = 24 beams
      'Safety pin': 48,                      // 12 pairs × 4
      'Wire deck 46″ × 42″': 24,             // 12 beam levels × 2 decks (96″ → 46 + 46)
      'Row spacer 9″ flue': 3,               // 3 frame pairs × 1 (16′ is not above 16′)
      'Anchor': 12,                          // 6 frames × 2 feet × 1
    })
    expect(parts(bom.sections[1].lines)).toEqual({
      'Upright frame 20′ × 42″': 4,          // 1 bay → 2 frame positions × 2 sides
      'Beam 96″ × 4″ face': '16 (8)',        // 1 bay × 2 sides × 4 beam levels (6″ is above the floor) = 8 pairs; 16 beams
      'Safety pin': 32,                      // 8 × 4
      'Wire deck 46″ × 42″': 16,             // 8 × 2
      'Row spacer 9″ flue': 4,               // 2 frame pairs × 2 (20′ is above 16′)
      'Anchor': 8,                           // 4 frames × 2
    })
    expect(parts(bom.lines)).toEqual({
      'Upright frame 16′ × 42″': 6,
      'Upright frame 20′ × 42″': 4,
      'Beam 96″ × 4″ face': '40 (20)',       // 24 + 16 beams; 12 + 8 pairs
      'Safety pin': 80,                      // 48 + 32
      'Wire deck 46″ × 42″': 40,             // 24 + 16
      'Row spacer 9″ flue': 7,               // 3 + 4
      'Anchor': 20,                          // 12 + 8
    })
  })

  it('BOM2-by-row: per line — a 1-per-pair spacer on the pair\'s first line, 2 per pair one on each line; the section totals and the grand total = the Summary', () => {
    const { groups, parts: rows } = byRowTable(bom)
    expect(groups.map(g => [g.name, g.rows])).toEqual([['Section 1', [1, 2]], ['Section 2', [3, 4]]])
    const at = (part, size) => rows.find(p => p.part === part && (size == null || p.size === size))
    const cells = (p) => [1, 2, 3, 4].map(no => p.cells[no])
    expect(rows.map(p => p.part)).toEqual(['Upright frame', 'Upright frame', 'Beam', 'Beam pairs', 'Wire deck', 'Row spacer', 'Anchor'])   // no pins
    expect(cells(at('Upright frame', '16′ × 42″'))).toEqual([3, 3, 0, 0])    // P1: 3 positions on each side
    expect(cells(at('Upright frame', '20′ × 42″'))).toEqual([0, 0, 2, 2])    // P2: 2 positions on each side
    expect(cells(at('Beam'))).toEqual([12, 12, 8, 8])                        // P1 side: 2 bays × 3 levels × 2 beams; P2 side: 1 × 4 × 2
    expect(cells(at('Beam pairs'))).toEqual([6, 6, 4, 4])
    expect(cells(at('Wire deck'))).toEqual([12, 12, 8, 8])                   // a deck pair per beam level: 6 × 2; 4 × 2
    expect(cells(at('Row spacer'))).toEqual([3, 0, 2, 2])                    // P1: 1 per pair, all on R1; P2: 2 per pair, 1 on each line
    expect(cells(at('Anchor'))).toEqual([6, 6, 4, 4])                        // 3 frames × 2; 2 frames × 2
    expect([at('Row spacer').totals.s1, at('Row spacer').totals.s2, at('Row spacer').total]).toEqual([3, 4, 7])
    // every part's grand total is the Summary's
    for (const p of rows) {
      const l = bom.lines.find(x => x.key === p.key.replace(/\|pairs$/, ''))
      expect([p.key, p.total]).toEqual([p.key, p.pairs ? l.pairs : l.qty])
      expect(p.totals.s1 + p.totals.s2).toBe(p.total)
    }
    expect(BY_ROW_PARTS).not.toContain('Safety pin')
  })

  it('BOM2-sequential: the numbers are always R1 to Rn by position, no gaps — a pair added above takes R1–R2 and the others move down; a pair deleted closes the gap; a pair moved is renumbered where it now stands (rule changed: was, a number once given stayed)', () => {
    const rows = (objs) => numberLines(objs, GS).map(l => 'R' + l.no + ' ' + l.ids.join() + ' ' + l.ws)
    expect(rows(layout)).toEqual(['R1 P1 lo', 'R2 P1 hi', 'R3 P2 lo', 'R4 P2 hi'])
    // added above P1: top to bottom it comes first
    const P0 = pair('P0', [96], 0, -px(240), 'A')
    expect(rows([...layout, P0])).toEqual(['R1 P0 lo', 'R2 P0 hi', 'R3 P1 lo', 'R4 P1 hi', 'R5 P2 lo', 'R6 P2 hi'])
    // P1 deleted: no gap — P0 R1–R2, P2 R3–R4
    expect(rows([fp, S1, S2, P0, P2])).toEqual(['R1 P0 lo', 'R2 P0 hi', 'R3 P2 lo', 'R4 P2 hi'])
    // P2 moved above P0: it is first now
    const up = { ...P2, y: -px(480) + px(20) }
    expect(rows([fp, P0, P1, up])).toEqual(['R1 P2 lo', 'R2 P2 hi', 'R3 P0 lo', 'R4 P0 hi', 'R5 P1 lo', 'R6 P1 hi'])
    // a copy of P1 on its row line, right of it: after P1 (left to right along the line), before P2 (below)
    const copy = { ...P1, id: 'P1copy', x: px(600) }
    expect(rows([...layout, copy])).toEqual(['R1 P1 lo', 'R2 P1 hi', 'R3 P1copy lo', 'R4 P1copy hi', 'R5 P2 lo', 'R6 P2 hi'])
    // a number saved by the earlier build changes nothing: the BOM reads position only
    expect(computeBom(layout, table({ 'P1:lo': 7, 'P1:hi': 8 })).rows.map(r => r.label)).toEqual(['R1', 'R2', 'R3', 'R4'])
  })

  it('BOM2-files: the CSV per section with the Total; the xlsx is the By row table, numbers as numbers', () => {
    const csv = bomCsv(bom).split('\r\n')
    expect(csv[0]).toBe('Section,Rows,Part,Size,Qty,Pairs')
    expect(csv).toContain('Section 1,R1–R2,Beam,96″ × 4″ face,24,12')
    expect(csv).toContain('Section 2,R3–R4,Row spacer,9″ flue,4,')
    expect(csv).toContain('Total,R1–R4,Row spacer,9″ flue,7,')
    const sheet = bomXlsxSheet(bom, 'hand')
    expect(sheet.rows[1].slice(0, 9)).toEqual(['', '', 'Section 1', '', '', 'Section 2', '', '', ''])
    expect(sheet.rows[2]).toEqual(['Part', 'Size', 'R1', 'R2', 'Total', 'R3', 'R4', 'Total', 'Grand total'])
    expect(sheet.merges).toEqual(['C2:E2', 'F2:H2'])
    const cells = sheetCells(readStoredZip(bomXlsx(bom, 'hand'))['xl/worksheets/sheet1.xml'])
    const row = (label, size) => cells.find(r => r && r[0] === label && (size == null || r[1] === size))
    expect(row('Row spacer').slice(2)).toEqual([3, 0, 3, 2, 2, 4, 7])        // R1 R2 | S1 total | R3 R4 | S2 total | grand
    expect(row('Upright frame', '20′ × 42″').slice(2)).toEqual([0, 0, 0, 2, 2, 4, 4])
    expect(row('  pairs').slice(2)).toEqual([6, 6, 12, 4, 4, 8, 20])
  })

  it('BOM2-unassigned: a pair outside both sections is Unassigned, before the Total; no section drawn: the Total alone', () => {
    const P3 = pair('P3', [96], px(600), 0, 'A')
    const b = computeBom([...layout, P3], table())
    // numbered fresh: P3 stands on P1's row line, right of it — top to bottom, then left to right: P1 R1–R2, P3 R3–R4, P2 R5–R6
    expect(b.sections.map(s => [s.name, s.rows])).toEqual([['Section 1', [1, 2]], ['Section 2', [5, 6]], ['Unassigned', [3, 4]]])
    expect(parts(b.sections[2].lines)['Row spacer 9″ flue']).toBe(2)       // 1 bay → 2 frame pairs × 1
    const none = computeBom([fp, P1, P2], table())
    expect([none.hasSections, none.sections.map(s => s.name)]).toEqual([false, ['Unassigned']])
  })
})
