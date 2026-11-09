// BOM v1 — the count, by hand (utils/bom.js computeBom). Each fixture is a small layout built here; every expected
// quantity is written by hand with its arithmetic in the comment beside it, never read back from the code.
//
// Conventions in every fixture: gridSize 40 px per ft; uprights 3″; frame depth 42″; a pair's flue 9″.
//   elevation A: 4 levels (floor, 60, 120, 180) — level 1 on the floor, so 3 beam levels; upright 192″ = 16′; face 4″
//   elevation B: 3 levels (floor, 60, 120) — 2 beam levels; upright 168″ = 14′; face 5″
//   deck table (defaults): 96″ → 46+46 · 108″ → 52+52 · 144″ → 46+46+46; anchors 1 per foot; spacers 1 per frame pair up to 16′, 2 above
//   beams counted one by one: 2 per beam pair
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeBom, bomSettings, bomCsv, BOM_DEFAULTS, qtyText } from '../../utils/bom'
import { buildBomSheets } from '../../export/bomSheet'

const GS = 40, UP = 3, DEPTH = 42, FLUE = 9
const px = (inch) => (inch / 12) * GS
const A = { id: 'A', name: 'A', uprightHeightIn: 192, beamFaceIn: 4, levels: [0, 60, 120, 180].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2000 })) }
const B = { id: 'B', name: 'B', uprightHeightIn: 168, beamFaceIn: 5, levels: [0, 60, 120].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2000 })) }
const table = (types = [A, B], project = null) => ({ version: 3, defaultId: 'A', types, project })

let n = 0
/** a rack: `beams` (in) from x (px) along the run; a single row is DEPTH deep, a pair DEPTH + FLUE + DEPTH */
function rack(type, beams, x = 0, y = 0, extra = {}) {
  const width = px(UP * (beams.length + 1) + beams.reduce((t, b) => t + b, 0))
  const height = px(type === 'rack_double_row' ? DEPTH * 2 + FLUE : DEPTH)
  return { id: extra.id || `r${++n}`, type, x, y, width, height, rotation: 0, beams, uprightWidth: UP, depthIn: DEPTH, flueSpaceIn: FLUE, levels: 4, ...extra }
}
const line = (bom, part, size = '') => bom.lines.find(l => l.part === part && l.size === size)?.qty ?? 0
const parts = (bom) => Object.fromEntries(bom.lines.map(l => [l.part + (l.size ? ' ' + l.size : ''), l.qty]))

describe('BOM — hand-counted layouts', () => {
  it('BOM-single: one single row, 3 bays of 96″, elevation A', () => {
    const bom = computeBom([rack('rack_row', [96, 96, 96])], table())
    expect(parts(bom)).toEqual({
      'Upright frame 16′ × 42″': 4,          // 3 bays → 3 + 1 = 4 frame positions × 1 side
      'Beam 96″ × 4″ face': 18,              // 3 bays × (4 levels − the floor level) = 9 pairs × 2 beams
      'Safety pin': 36,                      // 9 beam pairs × 4 pins
      'Wire deck 46″ × 42″': 18,             // 9 beam levels × 2 decks (96″ → 46 + 46)
      'Anchor': 8,                           // 4 frames × 2 feet × 1 anchor
    })
    expect(bom.flags).toEqual([])
  })

  it('BOM-pair-empty: one pair, 4 bays of 96″, the back side\'s last bay empty', () => {
    const r = rack('rack_double_row', [96, 96, 96, 96], 0, 0, { bayEmpty: [[false, false, false, false], [false, false, false, true]] })
    const bom = computeBom([r], table())
    expect(parts(bom)).toEqual({
      // front: 4 bays → 5 frames; back: bays 1–3 full, bay 4 empty → the frame past bay 4 goes (it stands beside no
      // bay of that side) → 4 frames. 5 + 4 = 9
      'Upright frame 16′ × 42″': 9,
      'Beam 96″ × 4″ face': 42,              // pairs: front 4 bays × 3 = 12; back 3 bays × 3 = 9; 21 pairs × 2
      'Safety pin': 84,                      // 21 × 4
      'Wire deck 46″ × 42″': 42,             // 21 beam levels × 2 decks
      'Row spacer 9″ flue': 4,               // frame pairs (both sides at one upright): positions 1–4 = 4 × 1 (16′ is not above 16′)
      'Anchor': 18,                          // 9 frames × 2 × 1
    })
  })

  it('BOM-joined: two single rows joined in line on a shared upright', () => {
    const a = rack('rack_row', [96, 96])
    const b = rack('rack_row', [96, 96], a.x + a.width - px(UP))   // its first upright is a's last
    const bom = computeBom([a, b], table())
    expect(parts(bom)).toEqual({
      'Upright frame 16′ × 42″': 5,          // 3 + 3 frames, the shared one once: 6 − 1
      'Beam 96″ × 4″ face': 24,              // 4 bays × 3 levels = 12 pairs × 2
      'Safety pin': 48,                      // 12 × 4
      'Wire deck 46″ × 42″': 24,             // 12 × 2
      'Anchor': 10,                          // 5 × 2
    })
  })

  it('BOM-split-apart: a pair split into two pieces and moved 10 ft apart — no frame shared', () => {
    const a = rack('rack_double_row', [96, 96], 0, 0, { id: 'p1' })
    const b = rack('rack_double_row', [96, 96], a.width + px(120), 0, { id: 'p2', pieceOf: 'p1', splitOf: 'p1' })
    const bom = computeBom([a, b], table())
    expect(parts(bom)).toEqual({
      'Upright frame 16′ × 42″': 12,         // each piece: 3 positions × 2 sides = 6; 6 + 6
      'Beam 96″ × 4″ face': 48,              // 4 bays × 2 sides × 3 levels = 24 pairs × 2
      'Safety pin': 96,                      // 24 × 4
      'Wire deck 46″ × 42″': 48,             // 24 × 2
      'Row spacer 9″ flue': 6,               // 6 frame pairs × 1 (16′)
      'Anchor': 24,                          // 12 × 2
    })
  })

  it('BOM-mixed-elevations: a pair, front A and back B, 2 bays of 96″', () => {
    const r = rack('rack_double_row', [96, 96], 0, 0, { elevSides: ['A', 'B'] })
    const bom = computeBom([r], table())
    expect(parts(bom)).toEqual({
      'Upright frame 14′ × 42″': 3,          // back (B, 168″): 3 positions
      'Upright frame 16′ × 42″': 3,          // front (A, 192″): 3 positions
      'Beam 96″ × 4″ face': 12,              // front: 2 bays × 3 levels = 6 pairs × 2
      'Beam 96″ × 5″ face': 8,               // back: 2 bays × 2 levels (B's face 5″) = 4 pairs × 2
      'Safety pin': 40,                      // (6 + 4) × 4
      'Wire deck 46″ × 42″': 20,             // 10 beam levels × 2
      'Row spacer 9″ flue': 3,               // 3 frame pairs × 1 (the taller, 16′, is not above 16′)
      'Anchor': 12,                          // 6 frames × 2
    })
  })

  it('BOM-no-deck-row: 9 ft (108″) beams with no 108″ row in the deck table — no decks, a flag; a 120″ beam on the defaults the same', () => {
    const settings = { ...BOM_DEFAULTS, decks: [{ beamIn: 96, widthsIn: [46, 46] }] }
    const bom = computeBom([rack('rack_row', [108, 108])], table(), { settings })
    expect(parts(bom)).toEqual({
      'Upright frame 16′ × 42″': 3,          // 2 bays → 3 frames
      'Beam 108″ × 4″ face': 12,             // 2 × 3 = 6 pairs × 2 — beams still counted
      'Safety pin': 24,                      // 6 × 4
      'Anchor': 6,                           // 3 × 2  — and no wire deck line at all
    })
    expect(bom.flags.map(f => f.text)).toEqual(['Set decks for 108 in beams'])
    const dflt = computeBom([rack('rack_row', [120])], table())
    expect([line(dflt, 'Wire deck', '46″ × 42″'), dflt.flags.map(f => f.text)]).toEqual([0, ['Set decks for 120 in beams']])
  })

  it('BOM-overlap: a copy dropped exactly on a single row counts once', () => {
    const a = rack('rack_row', [96, 96, 96]), b = { ...a, id: 'copy' }
    const bom = computeBom([a, b], table())
    expect(parts(bom)).toEqual({
      'Upright frame 16′ × 42″': 4,          // as one row of 3 bays: 4 frames (the copy's bays are covered: none of its own)
      'Beam 96″ × 4″ face': 18,          // 3 × 3 pairs × 2
      'Safety pin': 36,
      'Wire deck 46″ × 42″': 18,
      'Anchor': 8,
    })
  })

  it('BOM-settings: level 1 above the floor (6″) has a beam; 2 anchors per foot; a tall pair takes 2 spacers per frame pair', () => {
    const C = { ...A, id: 'C', uprightHeightIn: 240, levels: [6, 60, 120, 180].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2000 })) }   // 4 beam levels, 20′ frames
    const r = rack('rack_double_row', [96], 0, 0, { elevType: 'C' })
    const bom = computeBom([r], table([A, C]), { settings: { ...BOM_DEFAULTS, anchorsPerFoot: 2 } })
    expect(parts(bom)).toEqual({
      'Upright frame 20′ × 42″': 4,          // 1 bay → 2 positions × 2 sides
      'Beam 96″ × 4″ face': 16,              // 1 bay × 2 sides × 4 levels, every one above 0 = 8 pairs × 2
      'Safety pin': 32,                      // 8 × 4
      'Wire deck 46″ × 42″': 16,             // 8 × 2
      'Row spacer 9″ flue': 4,               // 2 frame pairs × 2 (20′ is above 16′)
      'Anchor': 16,                          // 4 frames × 2 feet × 2
    })
  })

  it('BOM-no-elevation: a bay side whose elevation is gone is counted with the default, and flagged', () => {
    const r = rack('rack_row', [96], 0, 0, { elevType: 'gone' })
    const bom = computeBom([r], table())
    expect([line(bom, 'Beam', '96″ × 4″ face'), bom.flags.map(f => f.text)]).toEqual([6, ['1 bay side with no elevation — counted with the default']])   // 1 bay × 3 (A) = 3 pairs × 2
  })

  it('BOM-guards: on, a row end facing open floor gets its end frames guarded and one end guard (a pair once)', () => {
    const fp = { id: 'fp', type: 'fp_rect', x: -px(240), y: -px(240), width: px(960), height: px(600) }
    const s = rack('rack_row', [96, 96, 96])
    const p = rack('rack_double_row', [96, 96, 96, 96], 0, px(240), { bayEmpty: [[false, false, false, false], [false, false, false, true]] })
    const on = { ...BOM_DEFAULTS, uprightGuards: true, endGuards: true }
    const bom = computeBom([fp, s, p], table(), { settings: on })
    expect([line(bom, 'Upright guard'), line(bom, 'End-of-aisle guard')]).toEqual([
      5,     // single: 1 frame at each end = 2; pair: low end 2 frames, high end 1 (the back's last frame dropped) = 3; 2 + 3
      4,     // 2 rows × 2 ends, the pair's end once
    ])
    // off (the defaults): none
    const off = computeBom([fp, s, p], table())
    expect([line(off, 'Upright guard'), line(off, 'End-of-aisle guard')]).toEqual([0, 0])
    // an end against the wall (3″ off it) faces no aisle
    const w = rack('rack_row', [96], fp.x + px(3), px(-120))
    expect(line(computeBom([fp, w], table(), { settings: on }), 'End-of-aisle guard')).toBe(1)   // its far end only
  })

  it('BOM-csv and settings: the CSV has section, rows, part, size, qty, pairs with the flags as comments; the project\'s settings ride over the defaults (an older project\'s spacer counts dropped)', () => {
    const bom = computeBom([rack('rack_row', [120])], table())
    expect(bomCsv(bom).split('\r\n').slice(0, 4)).toEqual(['# Set decks for 120 in beams', 'Section,Rows,Part,Size,Qty,Pairs', 'Total,R1,Upright frame,16′ × 42″,2,', 'Total,R1,Beam,120″ × 4″ face,6,3'])
    expect(bomSettings({ bom: { anchorsPerFoot: 3, spacersUpTo: 2, spacersAbove: 3 } })).toEqual({ ...BOM_DEFAULTS, anchorsPerFoot: 3 })
  })

  it('BOM-drawing-agrees: the elevation decides — level 1 at 0 sits on the floor, no beam; a level above 0 has one — the elevation drawing (card, full screen and the PDF draw this one layout) shows exactly the beams the BOM counts; a saved First level on floor field is ignored', async () => {
    const { elevationLayout } = await import('../../utils/elevationDrawing')
    const lay = (t, edit = null) => elevationLayout(t, 96, { w: 276, h: 420 }, { fontPx: 9, edit })
    const beams = (t) => lay(t).items.filter(i => i.t === 'rect' && i.tag === 'beam')
    const elevLabels = (t, edit) => lay(t, edit).items.filter(i => i.t === 'text' && i.role?.id === 'elev').map(i => i.role.value).sort((a, b) => a - b)
    const up = { ...A, id: 'U', levels: [6, 60, 120, 180].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2000 })) }
    const oldSave = { ...A, id: 'O', firstOnFloor: false }                                   // a field an earlier build saved
    expect([beams(A).length, elevLabels(A)]).toEqual([3, [60, 120, 180]])                    // level 1 at 0: levels 2–4 on beams
    expect([beams(up).length, elevLabels(up)]).toEqual([4, [6, 60, 120, 180]])               // level 1 at 6″: its beam and its label
    expect([beams(oldSave).length, elevLabels(oldSave)]).toEqual([3, [60, 120, 180]])        // the old field changes nothing
    expect(elevLabels(A, {})).toEqual([0, 60, 120, 180])                                     // on the sheet: level 1's 0″, to type it up
    expect(lay(A, {}).items.filter(i => i.tag === 'handle' && i.role?.k === 0).length).toBe(2)   // and its handles at the floor, to drag it up
    for (const t of [A, B, up, oldSave]) {
      const bom = computeBom([rack('rack_row', [96])], { version: 3, defaultId: t.id, types: [t], project: null })
      expect([t.id, line(bom, 'Beam', `96″ × ${t.beamFaceIn}″ face`), bom.lines.find(l => l.part === 'Beam')?.pairs ?? 0]).toEqual([t.id, beams(t).length * 2, beams(t).length])   // 1 bay: beam pairs = beams drawn (2 beams each)
    }
    const pdf = readFileSync(new URL('../../export/pdfExport.js', import.meta.url), 'utf8')
    expect(pdf).toMatch(/import \{ elevationLayout,/)                                         // the PDF's sheets: the same layout
  })

  it('BOM-fit: Check layout measures every level from its beam top, and the drawing never trims a load — one that runs into the beam above is drawn full height, red', async () => {
    const { elevationIssues } = await import('../../utils/elevations')
    const { elevationLayout, misfitLevels } = await import('../../utils/elevationDrawing')
    const at = (l1) => ({ ...A, id: 'F', clearanceIn: 6, levels: [l1, 60, 120, 180].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2000 })) })
    const issues = (t) => elevationIssues([rack('rack_row', [96], 0, 0, { elevType: 'F' })], table([t])).filter(i => i.kind === 'elev-fit').map(i => i.level)
    // level 1 from the floor: 48″ pallet + 6″ clearance = 54″ ≤ 60 − 4 (face) = 56″ → fits
    expect([issues(at(0)), [...misfitLevels(at(0)).keys()]]).toEqual([[], []])
    // level 1 on a beam at 6″: 56 − 6 = 50″ < 54″ → level 1 doesn't fit, from its beam top
    expect([issues(at(6)), [...misfitLevels(at(6)).keys()]]).toEqual([[1], [0]])
    // drawn full height: a 52″ load on the beam at 6″ reaches 58″ — past the beam above's underside (56″) — red, not cut
    const tall = { ...at(6), levels: at(6).levels.map((l, k) => (k === 0 ? { ...l, palletHeightIn: 52 } : l)) }
    const d = elevationLayout(tall, 96, { w: 276, h: 420 }, { fontPx: 9 })
    const load = d.items.find(i => i.t === 'rect' && i.tag === 'load' && i.level === 0 && i.fill !== '#C9A870' && i.stroke)
    expect([Math.abs(load.y - d.Y(6 + 52)) < 1e-6, load.stroke]).toEqual([true, '#C0452A'])   // its top at 58″ = 6 + 52 (cut, it would end at 55.5″)
  })

  it('BOM-pdf: the proposal PDF gets the BOM table after the plan and the elevations — paper palette, part / size / qty, the flags first', () => {
    const bom = computeBom([rack('rack_row', [96, 96, 96]), rack('rack_row', [120], 0, px(200))], table())
    const [page, more] = buildBomSheets(bom, { title: 'Test', paperW: 841, paperH: 594 })
    expect([!!page, more]).toEqual([true, undefined])
    expect(page.svg).toContain('<rect width="841" height="594" fill="#FFFFFF"/>')                        // a white sheet
    expect(page.svg.indexOf('Set decks for 120 in beams')).toBeLessThan(page.svg.indexOf('Upright frame'))   // the flag first
    for (const l of bom.lines) expect(page.svg).toContain('>' + qtyText(l) + '<')                         // beams: "24 (12 pairs)"
    expect(buildBomSheets(computeBom([], table()))).toEqual([])                                     // no racks: no page
    const src = readFileSync(new URL('../../export/pdfExport.js', import.meta.url), 'utf8')
    expect(src).toContain('const bomPages = buildBomSheets(computeBom(objects, storeState.elevations, { gridSize }), { title, paperW, paperH })')
    expect(src.indexOf('${sheets.map(')).toBeLessThan(src.indexOf('${bomPages.map('))
  })
})
