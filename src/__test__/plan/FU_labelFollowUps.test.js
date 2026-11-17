// Area FU — follow-ups: upright frames at their real width; rack travel arrows
// drawing size by Label size; Extra large; a PDF label size whose default
// prints every label at least 2.5 mm tall; a per-aisle label size; the SVG
// engine's column look (solid, I-beam, outline in drawing units).
// 1080 x 410, 25 x 30, reach; both orientations.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sizingSheetLayout, columnGridObject } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint, checkColumns, MHE_PROFILES } from '../../generate/columnCheck'
import { layoutColumns } from '../../generate/usableCapacity'
import { DEFAULT_RULES } from '../../rules/defaults'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { rackDrawOps, uprightDrawRects, travelArrowGeom } from '../../render/rackOps'
import { LABEL_SIZES, labelScale, aisleLabelScale, autoPdfLabelInches } from '../../render/labelSize'
import { aisleLabelOps, blockedFaceOps } from '../../render/labelOps'
import { columnGridOps, COLUMN_OPACITY } from '../../render/columnDraw'
import { aisleLabelLayout } from '../../canvas2/hitTest'
import { buildLayoutSVG } from '../../export/pdfExport'
import { useLabelPrefs } from '../../canvas2/labelPrefs'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { TEXT_TYPES, useTextSizes, textLz, textHeight } from '../../utils/textSizes'
import { ViewTextSizes } from '../../studio/textSizeCard'
import * as TS from '../../studio/textSizeCard'
import { GS, MATRIX } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
let store, AL, seq = 0
const newId = () => 'f' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  AL = await import('../../components/RightPanel/panels/AisleLabelSize.jsx')
})
beforeEach(() => useLabelPrefs.setState({ labelSize: 'medium', pdfLabelSize: 'auto', showColumnLabels: true }))

function layout(orientation, dims = [1080, 410, 25, 30, 'reach']) {
  const [lengthFt, widthFt, gridXFt, gridYFt, mhe] = dims
  const brief = { lengthFt, widthFt, gridXFt, gridYFt, mhe, orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const L = lengthFt * GS, W = widthFt * GS
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: L, height: W, fpVerts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }] }
  return rebuildAisles([fp, { ...columnGridObject(brief, 0, 0), id: 'cg' }, ...racks], newId).objects
}
const svgScale = (svg) => { // paper mm per world px, as the browser fits the viewBox into the page (meet)
  const w = +svg.match(/width="([\d.]+)mm"/)[1], h = +svg.match(/height="([\d.]+)mm"/)[1]
  const vb = svg.match(/viewBox="([-\d.e]+) ([-\d.e]+) ([\d.e]+) ([\d.e]+)"/)
  return Math.min(w / +vb[3], h / +vb[4])
}
const labelFontSizes = (svg) => {
  const a = svg.indexOf('<g class="labels">'), g = svg.slice(a, svg.indexOf('</g>', a))   // the labels layer only (no nested groups)
  return [...g.matchAll(/<text [^>]*font-size="([\d.e+-]+)"/g)].map(m => +m[1])
}
const load = (objs) => store.setState({ objects: JSON.parse(JSON.stringify(objs)), groups: [], selectedIds: [], activeBaySelection: [], gridSize: GS,
  history: [JSON.stringify({ objects: objs, groups: [] })], historyIndex: 0 })

describe.each(['horizontal', 'vertical'])('FU — %s', (orientation) => {
  const objs = layout(orientation)
  const racks = objs.filter(o => o.type && o.type.startsWith('rack_'))
  const aisles = objs.filter(o => o.type === 'aisle')

  it('FU-upright: every upright frame is drawn exactly uprightWidth wide, at any zoom (no on-screen minimum)', () => {
    let n = 0
    for (const r of racks) {
      const op = rackDrawOps(r, { gridSize: GS }).find(o => o.op === 'uprights')
      const want = ((r.uprightWidth || 3) / 12) * GS
      for (const scale of [0.02, 0.2, 2]) for (const d of uprightDrawRects(op, scale)) { expect(d.w).toBeCloseTo(want, 9); n++ }
    }
    expect(n).toBeGreaterThan(1000)
  })

  it('FU-aisle: an aisle override changes only that aisle\'s label; Default restores it; Apply to all gives every aisle the size; one undo each; it survives save / reload and prints in the PDF', () => {
    load(objs)
    const [a, b] = aisles, fsOf = (aisle) => aisleLabelOps(aisleLabelLayout(aisle, store.getState().objects, GS), aisleLabelScale(aisle, 'medium', GS)).find(o => o.op === 'text').fontSize
    const get = (id) => store.getState().objects.find(o => o.id === id)
    expect(fsOf(get(a.id)) / GS).toBeCloseTo(2, 9)                                  // Medium: 24 in
    const h0 = store.getState().historyIndex
    // (labels-final: 21 in — a size whose pill still fits its aisle, so the PDF draws it; a larger one is left out)
    expect(AL.setAisleLabelSize(store, [a.id], 21)).toBe(1)
    expect(store.getState().historyIndex).toBe(h0 + 1)                              // one undo step
    expect(fsOf(get(a.id)) / GS).toBeCloseTo(1.75, 9)
    expect(fsOf(get(b.id)) / GS).toBeCloseTo(2, 9)                                  // only that aisle
    // saved with the layout
    const loaded = {}
    deserializeScene(serializeScene({ ...store.getState() }), loaded)
    expect(loaded.objects.find(o => o.id === a.id).labelSizeIn).toBe(21)
    // printed at that size in the PDF, the others at the PDF's own size
    const svg = buildLayoutSVG(store.getState().objects, [], GS, { labels: { labelSize: 'medium' } }).svg
    const fs = labelFontSizes(svg).map(v => +(v / GS).toFixed(6))
    expect(fs.filter(v => v === 1.75)).toHaveLength(1)
    // Default: back to the global size, the field gone
    AL.setAisleLabelSize(store, [a.id], null)
    expect('labelSizeIn' in get(a.id)).toBe(false)
    expect(fsOf(get(a.id)) / GS).toBeCloseTo(2, 9)
    // undo brings the override back, redo removes it again
    store.getState().undo()
    expect(get(a.id).labelSizeIn).toBe(21)
    store.getState().redo()
    expect(get(a.id).labelSizeIn).toBeUndefined()
    // Apply to all aisles: one step, every aisle
    const h1 = store.getState().historyIndex
    AL.setAisleLabelSize(store, store.getState().objects.filter(o => o.type === 'aisle').map(o => o.id), 18)
    expect(store.getState().historyIndex).toBe(h1 + 1)
    expect(store.getState().objects.filter(o => o.type === 'aisle').every(o => o.labelSizeIn === 18)).toBe(true)
  })

  it('FU-pdf-real: (labels-cad, CLAUDE.md Rule 8 — the CAD text model; was: Auto, every label at least 2.5 mm on the sheet) the PDF prints the aisle widths at their real text height, 1 ft 6 in, on this building and much bigger / smaller ones — the same drawing units as the plan, whatever the sheet scale; a type\'s Text size changed prints at the new height', () => {
    for (const dims of [[1080, 410, 25, 30, 'reach'], MATRIX.M13, MATRIX.M23, MATRIX.M1]) {
      const o = layout(orientation, dims)
      const svg = buildLayoutSVG(o, [], GS).svg
      const sizes = labelFontSizes(svg)
      expect(sizes.length, String(dims)).toBeGreaterThan(0)
      expect(sizes.filter(v => Math.abs(v / GS - 1.5) < 1e-9).length, String(dims)).toBeGreaterThan(0)
    }
    useTextSizes.getState().setSize('aisle', 30)
    const big = buildLayoutSVG(objs, [], GS).svg
    expect(labelFontSizes(big).some(v => Math.abs(v / GS - 2.5) < 1e-9)).toBe(true)
    useTextSizes.getState().resetAll()
  })
})

describe('FU — arrows, sizes, columns', () => {
  const lane = { id: 'l1', type: 'rack_drive_in', x: 50, y: 60, width: 600, height: 300, lanes: 4, uprightWidth: 4 }
  const op = rackDrawOps(lane, { gridSize: GS }).find(o => o.op === 'arrows')

  it('FU-arrows: travel arrows are drawing size — their length, head, gap and stroke scale with Label size, and the painter and the PDF use it', () => {
    const s = travelArrowGeom(op, labelScale('small', GS)), x = travelArrowGeom(op, labelScale('xlarge', GS))
    expect(x.strokeWidth / s.strokeWidth).toBeCloseTo(4, 9)                          // 48 in / 12 in
    x.arrows.forEach((a, i) => {
      const lenS = Math.abs(s.arrows[i].shaft[1] - s.arrows[i].head[3]), lenX = Math.abs(a.shaft[1] - a.head[3])
      expect(lenX / lenS).toBeCloseTo(4, 9)
    })
    const shapes = readFileSync('src/canvas2/shapes.jsx', 'utf8').split(String.fromCharCode(13)).join('')
    expect(shapes).toMatch(/const g = travelArrowGeom\(o, lz\)/)
    expect(shapes).toMatch(/<Ops ops=\{ops\} listening=\{listening\} lz=\{lz\} \/>/)
    const ops = shapes.slice(shapes.indexOf('export function Ops('), shapes.indexOf('\n}\n', shapes.indexOf('export function Ops(')))
    expect(ops).not.toMatch(/getStage\(\)\?\.scaleX/)                                 // nothing in the op painter reads the zoom
    const scene = readFileSync('src/canvas2/Scene.jsx', 'utf8')
    expect(scene).toMatch(/const lz = labelScale\(useLabelPrefs\(s => s\.labelSize\), gridSize\)/)
    expect(scene).toMatch(/<RackShape [^>]*lz=\{lz\}/)
    const pdf = readFileSync('src/export/pdfExport.js', 'utf8')
    expect(pdf).toMatch(/const g = travelArrowGeom\(o, lz\)/)
  })

  it('FU-sizes: (labels-cad — was: Extra large 48 in, a View-menu Label size and a PDF label size) one real text height per label type, the defaults as asked, saved with the project; the View card shows Text size with Reset; the layout menu no longer offers Label size or PDF label size', () => {
    expect(Object.fromEntries(Object.entries(TEXT_TYPES).map(([k, t]) => [k, t.inches]))).toEqual({ aisle: 18, row: 18, doorValue: 12, doorBadge: 12, column: 18, building: 24, names: 24, clearance: 9 })
    expect(textLz('aisle', GS) * textHeight('aisle', GS)).toBeCloseTo(TEXT_TYPES.aisle.fs, 9)
    useTextSizes.getState().setSize('row', 30)
    const json = serializeScene({ ...store.getState() })
    expect(JSON.parse(json).textSizes).toEqual({ row: 30 })
    useTextSizes.getState().resetAll()
    deserializeScene(json, {})
    expect(useTextSizes.getState().sizes).toEqual({ row: 30 })
    useTextSizes.getState().resetAll()
    const frame = readFileSync('src/studio/StudioFrame.jsx', 'utf8')
    expect(frame).toMatch(/<ViewTextSizes \/>/)
    const top = readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')
    expect([top.includes('<MenuRow label="Label size">'), top.includes('<MenuRow label="PDF label size">')]).toEqual([false, false])
    const html = renderToStaticMarkup(createElement(ViewTextSizes))
    for (const t of ['Text size', 'Reset', 'Aisle widths', 'Row numbers', 'Door chain', 'Door numbers', 'Column chain and bubbles', 'Building size', 'Zone and section names', 'Clearances']) expect(html).toContain(t)
  })

  it('FU-panel: (labels-cad — was: an aisle\'s Label size presets) a selected aisle shows a Text size field in its card — empty: the aisle widths\' size; typed in feet and inches (a bare number is feet); Reset clears it; one or several aisles', () => {
    const objs = layout('horizontal'), ids = objs.filter(o => o.type === 'aisle').slice(0, 2).map(o => o.id)
    load(objs.map(o => (o.id === ids[0] ? { ...o, labelSizeIn: 30 } : o)))
    Object.assign(store.getInitialState(), store.getState())
    const get = (id) => store.getState().objects.find(o => o.id === id)
    const one = renderToStaticMarkup(createElement(TS.TextSizeField, { objs: [get(ids[0])], type: 'aisle' }))
    for (const t of ['Text size', 'Reset']) expect(one).toContain(t)
    expect(one).toContain('value="2′-6″"')
    const mixed = renderToStaticMarkup(createElement(TS.TextSizeField, { objs: ids.map(get), type: 'aisle' }))
    expect(mixed).toContain('placeholder="Mixed"')
    expect([TS.parseTextInches('2.5'), TS.parseTextInches("2.5'"), TS.parseTextInches('1′-6″'), TS.parseTextInches("1'6\""), TS.parseTextInches('18 in'), TS.parseTextInches('9"'), TS.parseTextInches('0.05')]).toEqual([30, 30, 18, 18, 18, 9, null])
    expect(TS.setLabelSizeIn(store, [ids[1]], 24)).toBe(1)
    expect(get(ids[1]).labelSizeIn).toBe(24)
    TS.setLabelSizeIn(store, [ids[1]], null)
    expect('labelSizeIn' in get(ids[1])).toBe(false)
    const props = readFileSync('src/components/RightPanel/PropertiesPanel.jsx', 'utf8')
    expect(props).toMatch(/<TextSizeField objs=\{\[obj\]\} type="aisle" bare \/>/)                                   // one aisle
    expect(props).toMatch(/<TextSizeField objs=\{selected\.filter\(o => o\.type === 'aisle'\)\} type="aisle" bare \/>/)   // several
    for (const t of ['type="names"', 'type="doorBadge"', 'type="column"', 'type="building"']) expect(props).toContain(t)
  })

  it('FU-columns: a column is a solid #1F2321 square at its true size (STUDIO.md §2, PlanDetail C18) — no web, no flanges, no outline; conflict marks still drawn above them', () => {
    const grid = { ...columnGridObject({ lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, columnsAlongWall: true }, 0, 0), id: 'cg' }
    const g = columnGridOps(grid, GS)
    expect(COLUMN_OPACITY).toEqual({ body: 1, web: 0, flanges: 0 })
    expect([g.color, g.opacity.body, g.web, g.flanges, g.outline]).toEqual(['#1F2321', 1, '', '', ''])
    const body = g.body.match(/M([\d.-]+) ([\d.-]+)h([\d.]+)v([\d.]+)/)
    expect(+body[3]).toBeCloseTo((grid.colSizeIn || 12) / 12 * GS, 6)                // its true size
    const shapes = readFileSync('src/canvas2/shapes.jsx', 'utf8').split(String.fromCharCode(13)).join('')
    const view = shapes.slice(shapes.indexOf('function ColumnGridShapeView('), shapes.indexOf('\n}\n', shapes.indexOf('function ColumnGridShapeView(')))
    expect(view).toMatch(/opacity=\{g\.opacity\.body\}/)
    expect(view).toMatch(/strokeWidth=\{g\.outlineWidth\}/)
    expect(view).not.toMatch(/strokeScaleEnabled/)                                   // scales with the zoom
    // conflict colouring: the check still produces the red marks, and the overlay layer is painted after (above) the scene
    const objs = layout('horizontal'), rk = objs.filter(o => o.type && o.type.startsWith('rack_'))
    const res = checkColumns({ racks: rk, columns: layoutColumns(objs, GS), profile: MHE_PROFILES.reach, gridSize: GS })
    const c = res.rackConflicts.find(q => q.bayIndex != null && q.positionIndices.length)
    const marks = blockedFaceOps(c, rk.find(r => r.id === c.rackId), GS, labelScale('medium', GS))
    expect(marks.every(m => m.stroke === '#C0392B')).toBe(true)
    const canvas = readFileSync('src/canvas2/Canvas2.jsx', 'utf8')
    expect(canvas.indexOf('<Scene listening part="body" />')).toBeGreaterThan(0)
    expect(canvas.indexOf('<Scene listening part="body" />')).toBeLessThan(canvas.indexOf('<Overlays part="marks"'))
    // the PDF prints the same column look
    expect(buildLayoutSVG([grid], [], GS).svg).toContain('fill="#1F2321" opacity="1"')
  })

  it.each(['horizontal', 'vertical'])('FU-columns-top (%s): columns paint ABOVE racks AND above the labels and marks — on the canvas and in the PDF — even though the grid comes first in the array', (orientation) => {
    const objs = layout(orientation)
    const iGrid = objs.findIndex(o => o.type === 'column_grid'), iRack = objs.findIndex(o => o.type && o.type.startsWith('rack_'))
    expect(iGrid).toBeLessThan(iRack)                                                  // the array alone would bury them
    const noLabels = { labels: { showAisles: false, showMarks: false } }
    const svg = buildLayoutSVG(objs, [], GS, noLabels).svg
    const without = buildLayoutSVG(objs.filter(o => o.type !== 'column_grid'), [], GS, noLabels).svg
    const col = svg.indexOf('fill="#1F2321" opacity="1"')                              // the solid column square (C18)
    expect(col).toBeGreaterThan(0)
    // everything up to and including the last rack is identical with or without the grid: the columns come after it
    // (from the first newline: the header's viewBox may differ, the grid can widen the bounds)
    const s0 = svg.indexOf('\n'), w0 = without.indexOf('\n'), racksLen = without.indexOf('<g class="labels">') - w0
    expect(racksLen).toBeGreaterThan(1000)
    expect(svg.slice(s0, s0 + racksLen)).toBe(without.slice(w0, w0 + racksLen))
    expect(col).toBeGreaterThanOrEqual(s0 + racksLen)
    expect(col).toBeGreaterThan(svg.indexOf('<g class="labels">'))                   // above the labels and marks
    const scene = readFileSync('src/canvas2/Scene.jsx', 'utf8')
    expect(scene).toMatch(/if \(o\.type === 'column_grid'\) \{ columns\.push\(/)
    expect(scene).toMatch(/return \{ floors, rest, columns, sections, doors, doorClear \}/)      // (+ the sections, drawn under the rest, the doors that cut their boundaries, and the doors' clear spaces — fill-doors round)
    expect(scene).toMatch(/if \(part === 'columns'\) return <>\{colEls\}<\/>/)
    // the canvas: the scene body, then the labels and marks, then the columns, then the selection chrome
    const canvas = readFileSync('src/canvas2/Canvas2.jsx', 'utf8')
    const at = ['<Scene listening part="body" />', '<Overlays part="marks"', '<Scene listening part="columns" />', '<Overlays part="chrome"'].map(k => canvas.indexOf(k))
    expect(at.every((v, i) => v > 0 && (i === 0 || v > at[i - 1]))).toBe(true)
  })
})
