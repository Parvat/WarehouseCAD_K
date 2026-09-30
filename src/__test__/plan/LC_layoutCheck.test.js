// Area LC — "Check layout": every problem in the layout, listed, grouped
// ERRORS / WARNINGS; clicking one selects it and zooms to it; the PDF export
// asks when there are errors (never blocks). Every rule is an existing one
// (utils/layoutCheck.js). Both orientations; a HAND-DRAWN building (four
// double rows placed by hand, 11 ft aisles) with one problem made at a time,
// and a clean GENERATED layout.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const LC = await import('../../utils/layoutCheck')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { rackFootprint, MHE_PROFILES } = await import('../../generate/columnCheck')
  return { useCanvasStore, LC, generateAndPlace, rackFootprint, MHE_PROFILES }
}

const W = ((3 * 4 + 3 * 96) / 12) * GS            // 3 × 96" bays, 3" uprights: 1000 px
const H = ((42 * 2 + 9) / 12) * GS                // 42" deep faces + 9" flue: 310 px
const AISLE = 11 * GS                              // over the reach truck's 10' 6"

describe.each(['horizontal', 'vertical'])('LC — %s', (orientation) => {
  const rot = orientation === 'vertical' ? 90 : 0
  let m, s, fp
  /** A double row with its centre at (along, across) in the building. */
  const rack = (along, across, extra = {}) => {
    const cx = rot ? across : along, cy = rot ? along : across
    return { type: 'rack_double_row', x: cx - W / 2, y: cy - H / 2, width: W, height: H, rotation: rot, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, levels: 4, ...extra }
  }
  const across = (d) => (rot ? { x: d } : { y: d })        // a move across, as fields to add
  const racks = () => s().objects.filter(o => o.type === 'rack_double_row')
  const move = (r, dAcross, dAlong = 0) => s().commitObjectUpdate(r.id, rot ? { x: r.x + dAcross, y: r.y + dAlong } : { x: r.x + dAlong, y: r.y + dAcross })
  const check = () => m.LC.checkLayout(s().objects, { gridSize: GS })
  const kinds = (list) => list.map(i => i.kind)
  /** Hand-drawn: a 400 × 400 building, four double rows across it, 11 ft aisles. */
  const handDrawn = () => {
    s().placeFpObject({ type: 'fp_rect', widthFt: 400, heightFt: 400 })
    fp = s().objects.find(o => o.type === 'fp_rect')
    for (let i = 0; i < 4; i++) s().addObject({ ...rack(0, -1500 + i * (H + AISLE)), parentId: fp.id })
  }
  /** One column centred at (along, across). */
  const columnAt = (along, acrossC) => {
    const cx = rot ? acrossC : along, cy = rot ? along : acrossC
    s().addObject({ type: 'column_grid', x: cx, y: cy, spacingX: [100000], spacingY: [100000], columnW: GS, columnH: GS, colSizeIn: 12, parentId: fp.id })
  }
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })

  it('LC-clean: a clean generated layout (240 × 120, 30 × 30 grid) and the hand-drawn one have no errors', async () => {
    m.generateAndPlace({ lengthFt: 240, widthFt: 120, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    expect(check().errors).toEqual([])
    const m2 = await fresh(); m = m2
    handDrawn()
    expect(check()).toEqual({ errors: [], warnings: [] })
  })

  it('LC-aisle: an aisle too narrow to drive is an ERROR ("… 7\', needs 8\' to drive"); one it can drive but not pick from is a WARNING ("… 9\', needs 10\' 6\" to pick"); generated rows are named "rows 4 and 5, section 3"', async () => {
    handDrawn()
    const [a, b] = racks()
    move(b, -(AISLE - 7 * GS))                                               // 7' from row a
    let r = check()
    expect(kinds(r.errors)).toEqual(['aisle-drive'])
    expect(r.errors[0].text).toBe("Aisle between double row 1 and double row 2: 7', needs 8' to drive")
    expect(r.errors[0].ids.sort()).toEqual([a.id, b.id].sort())
    move(racks()[1], 2 * GS)                                                 // 9'
    r = check()
    expect(r.errors).toEqual([])
    expect(kinds(r.warnings)).toEqual(['aisle-pick'])
    expect(r.warnings[0].text).toBe("Aisle between double row 1 and double row 2: 9', needs 10' 6\" to pick")
    // generated naming
    const m2 = await fresh(); m = m2
    m.generateAndPlace({ lengthFt: 240, widthFt: 120, gridXFt: 30, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const inS1 = racks().filter(o => o.genSection === 1), k = Math.min(...inS1.map(o => o.rowIndex))
    const r5 = inS1.find(o => o.rowIndex === k), r6 = inS1.find(o => o.rowIndex === k + 1)
    const f5 = m.rackFootprint(r5), f6 = m.rackFootprint(r6)
    const gap = rot ? f6.x - (f5.x + f5.w) : f6.y - (f5.y + f5.h)
    move(r5, gap - 7 * GS)
    expect(check().errors.map(e => e.text)).toContain(`Aisle between rows ${k} and ${k + 1}, section 1: 7', needs 8' to drive`)
  })

  it('LC-overlap: racks overlapping each other — an ERROR naming both, with how far', () => {
    handDrawn()
    const [a, b] = racks()
    move(b, -(AISLE + GS))                                                   // 1' into row a
    const r = check()
    const o = r.errors.find(e => e.kind === 'overlap')
    expect(o.text).toBe("Double row 1 overlaps double row 2 by 1'")
    expect(o.ids.sort()).toEqual([a.id, b.id].sort())
  })

  it('LC-outside: a rack past a wall (how far) and one outside the building — ERRORS', () => {
    handDrawn()
    const [a] = racks()
    const wall = (fp.wallThicknessFt ?? 0.25) * GS, f = m.rackFootprint(a)
    const innerEnd = rot ? fp.y + fp.height - wall : fp.x + fp.width - wall, end = rot ? f.y + f.h : f.x + f.w
    move(a, 0, innerEnd - end + (9 / 12) * GS)                               // along, 9" past the inner face
    let r = check()
    expect(r.errors.find(e => e.kind === 'outside').text).toBe('Double row 1: past the wall by 9"')
    s().addObject(rack(0, 20000))                                            // no building around it
    r = check()
    expect(r.errors.map(e => e.text)).toContain('Double row 5: outside the building')
  })

  it('LC-upright: a column on an upright frame — an ERROR on that rack', () => {
    handDrawn()
    const [a] = racks()
    const f = m.rackFootprint(a)
    const alongStart = rot ? f.y : f.x, acrossStart = rot ? f.x : f.y
    columnAt(alongStart + (1.5 / 12) * GS, acrossStart + (21 / 12) * GS)      // on the first frame, in face 0
    const e = check().errors.find(x => x.kind === 'upright')
    expect(e.text).toBe('Double row 1: a column stands on an upright frame')
    expect(e.ids).toEqual([a.id])
  })

  it('LC-unreachable: a rack with no aisle on any pick side (back to back both ways) — an ERROR; the rows either side are still reachable', () => {
    handDrawn()
    const [a, b, c] = racks()
    move(b, -AISLE)                                                           // back to back with a
    move(c, -2 * AISLE)                                                       // back to back with b
    const r = check()
    expect(r.errors.filter(e => e.kind === 'unreachable').map(e => e.ids[0])).toEqual([b.id])
    expect(r.errors.find(e => e.kind === 'unreachable').text).toBe('Double row 2: no aisle on any pick side — nobody can reach it')
    void a; void c
  })

  it('LC-columns: columns blocking pallets — a WARNING with the count of lost positions', () => {
    handDrawn()
    const [a] = racks()
    const f = m.rackFootprint(a)
    const alongStart = rot ? f.y : f.x, acrossStart = rot ? f.x : f.y
    columnAt(alongStart + ((3 + 48) / 12) * GS, acrossStart + (21 / 12) * GS)  // mid bay 1, face 0
    const w = check().warnings.find(x => x.kind === 'columns-lost')
    expect(w.text).toMatch(/^Double row 1: columns block \d+ pallet positions$/)
    expect(w.positions).toBeGreaterThan(0)
    expect(check().errors).toEqual([])
  })

  it('LC-oversized: a bay too short for the pallet — a WARNING', () => {
    handDrawn()
    const [a] = racks()
    s().commitObjectUpdate(a.id, { beams: [96, 36, 96] })
    const w = check().warnings.find(x => x.kind === 'oversized')
    expect(w.text).toBe('Double row 1: bay 2 (36") too short for a 40" pallet — holds nothing')
  })

  it('LC-angled: an angled rack whose column losses weren\'t checked — a WARNING (only where there are columns)', () => {
    handDrawn()
    const [, , , d] = racks()
    s().commitObjectUpdate(d.id, { rotation: rot + 30 })
    expect(check().warnings.filter(x => x.kind === 'angled')).toEqual([])      // no columns: nothing unchecked
    columnAt(5000, 5000)
    const w = check().warnings.find(x => x.kind === 'angled')
    expect(w.text).toBe(`Double row 4: angled ${rot + 30}° — its column losses weren't checked`)
  })

  it('LC-click: clicking an item selects its object(s) and zooms so the spot fills the view', () => {
    handDrawn()
    const [a, b] = racks()
    move(b, -(AISLE - 7 * GS))
    const item = check().errors[0]
    const ids = m.LC.goToIssue(m.useCanvasStore, item, { w: 1200, h: 800 })
    expect(ids.sort()).toEqual([a.id, b.id].sort())
    expect([...s().selectedIds].sort()).toEqual([a.id, b.id].sort())
    const { zoom, panX, panY } = s()
    const sx = item.box.x * zoom + panX, ex = (item.box.x + item.box.w) * zoom + panX
    const sy = item.box.y * zoom + panY, ey = (item.box.y + item.box.h) * zoom + panY
    expect(sx).toBeGreaterThanOrEqual(0); expect(ex).toBeLessThanOrEqual(1200)
    expect(sy).toBeGreaterThanOrEqual(0); expect(ey).toBeLessThanOrEqual(800)
    expect(Math.max(ex - sx, ey - sy)).toBeGreaterThanOrEqual(300)             // it fills a good part of the view
  })

  it('LC-recheck: fixing the problem and pressing again removes it; the button counts ("Check layout · 1 error" → "· no issues")', () => {
    handDrawn()
    const [, b] = racks()
    move(b, -(AISLE - 7 * GS))
    let r = m.LC.runLayoutCheck(m.useCanvasStore)
    expect(m.LC.checkLabel(r)).toBe('Check layout · 1 error')
    expect(m.LC.useLayoutCheck.getState()).toMatchObject({ open: true })
    move(racks()[1], AISLE - 7 * GS)                                           // put it back
    r = m.LC.runLayoutCheck(m.useCanvasStore)
    expect(r.errors).toEqual([])
    expect(m.LC.useLayoutCheck.getState().result.errors).toEqual([])          // what the panel and the button show
    expect(m.LC.checkLabel(r)).toBe('Check layout · no issues')
    expect(m.LC.checkLabel({ errors: [], warnings: [{}, {}] })).toBe('Check layout · 2 warnings')
  })

  it('LC-pdf: with errors the export asks "N errors found. Export anyway?" — Show issues opens the list, Export anyway exports; without errors it exports at once', () => {
    handDrawn()
    let exported = 0
    const doExport = () => { exported++ }
    expect(m.LC.exportWithCheck(m.useCanvasStore, doExport)).toBe(true)        // clean: straight out
    expect(exported).toBe(1)
    const [, b] = racks()
    move(b, -(AISLE + GS))                                                     // an overlap (and more)
    const n = check().errors.length
    expect(m.LC.exportWithCheck(m.useCanvasStore, doExport)).toBe(false)       // asked, not blocked
    expect(exported).toBe(1)
    expect(m.LC.useLayoutCheck.getState().askExport).toEqual({ errors: n })
    m.LC.showIssues()
    expect(m.LC.useLayoutCheck.getState()).toMatchObject({ askExport: null, open: true })
    m.LC.exportWithCheck(m.useCanvasStore, doExport)
    m.LC.exportAnyway(doExport)
    expect(exported).toBe(2)
    expect(m.LC.useLayoutCheck.getState().askExport).toBe(null)
    const dlg = readFileSync('src/components/RightPanel/LayoutCheckPanel.jsx', 'utf8')
    expect(dlg).toMatch(/\{n\} error\{n === 1 \? '' : 's'\} found\. Export anyway\?/)
    expect(readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')).toMatch(/onClick=\{\(\) => exportWithCheck\(useCanvasStore, exportAsPDF\)\}/)
  })
})

describe('LC — one rule each', () => {
  it('LC-reuse: the aisle width rule is one function (aisleLevel) asked by the column check, the copy warnings and Check layout; Check layout only calls the existing checks', () => {
    const src = (f) => readFileSync(f, 'utf8')
    const cc = src('src/generate/columnCheck.js')
    expect(cc).toMatch(/const level {4}= aisleLevel\(clearPx, profile, gridSize\)/)
    expect(src('src/utils/copyChange.js')).toMatch(/aisleLevel\(g, profile, gridSize, gridSize \/ 24\) < 3/)
    const lc = src('src/utils/layoutCheck.js')
    for (const f of ['rowGaps', 'aisleLevel', 'rackReachable', 'runColumnCheck', 'rackIssues', 'oversizedBayIndices']) expect(lc).toMatch(new RegExp(f + '\\('))
    expect(lc).not.toMatch(/aisleFt \* gridSize\) *[<>]|travelFt \?\? 8\) \* gridSize *[<>]/)   // no width compared by hand
    expect(src('src/components/RightPanel/index.jsx')).toMatch(/<LayoutCheckPanel \/>/)
    expect(src('src/components/Toolbar/TopBar.jsx')).toMatch(/<CheckLayoutButton \/>/)
  })
})
