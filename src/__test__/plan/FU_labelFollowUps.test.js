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
    expect(AL.setAisleLabelSize(store, [a.id], 36)).toBe(1)
    expect(store.getState().historyIndex).toBe(h0 + 1)                              // one undo step
    expect(fsOf(get(a.id)) / GS).toBeCloseTo(3, 9)
    expect(fsOf(get(b.id)) / GS).toBeCloseTo(2, 9)                                  // only that aisle
    // saved with the layout
    const loaded = {}
    deserializeScene(serializeScene({ ...store.getState() }), loaded)
    expect(loaded.objects.find(o => o.id === a.id).labelSizeIn).toBe(36)
    // printed at that size in the PDF, the others at the PDF's own size
    const svg = buildLayoutSVG(store.getState().objects, [], GS, { labels: { labelSize: 'medium' } }).svg
    const fs = labelFontSizes(svg).map(v => +(v / GS).toFixed(6))
    expect(fs.filter(v => v === 3)).toHaveLength(1)
    // Default: back to the global size, the field gone
    AL.setAisleLabelSize(store, [a.id], null)
    expect('labelSizeIn' in get(a.id)).toBe(false)
    expect(fsOf(get(a.id)) / GS).toBeCloseTo(2, 9)
    // undo brings the override back, redo removes it again
    store.getState().undo()
    expect(get(a.id).labelSizeIn).toBe(36)
    store.getState().redo()
    expect(get(a.id).labelSizeIn).toBeUndefined()
    // Apply to all aisles: one step, every aisle
    const h1 = store.getState().historyIndex
    AL.setAisleLabelSize(store, store.getState().objects.filter(o => o.type === 'aisle').map(o => o.id), 18)
    expect(store.getState().historyIndex).toBe(h1 + 1)
    expect(store.getState().objects.filter(o => o.type === 'aisle').every(o => o.labelSizeIn === 18)).toBe(true)
  })

  it('FU-pdf-min: at the default (Auto) every printed label is at least 2.5 mm tall on the sheet — this building and much bigger / smaller ones', () => {
    for (const dims of [[1080, 410, 25, 30, 'reach'], MATRIX.M13, MATRIX.M23, MATRIX.M1]) {
      const o = layout(orientation, dims)
      const svg = buildLayoutSVG(o, [], GS).svg
      const mm = svgScale(svg), sizes = labelFontSizes(svg)
      expect(sizes.length, String(dims)).toBeGreaterThan(0)
      expect(Math.min(...sizes) * mm, String(dims)).toBeGreaterThanOrEqual(2.5 - 1e-9)
    }
    // and the setting matters: a fixed Small on the 1,500 ft building prints under 2.5 mm
    useLabelPrefs.setState({ pdfLabelSize: 'small' })
    const big = buildLayoutSVG(layout(orientation, MATRIX.M23), [], GS).svg
    expect(Math.min(...labelFontSizes(big)) * svgScale(big)).toBeLessThan(2.5)
    // 'screen' follows the drawing's Label size
    useLabelPrefs.setState({ pdfLabelSize: 'screen', labelSize: 'xlarge' })
    const scr = buildLayoutSVG(objs, [], GS).svg
    expect(Math.max(...labelFontSizes(scr)) / GS).toBeCloseTo(4, 9)
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

  it('FU-sizes: Extra large is 48 in; the View menu offers it and a PDF label size (Auto by default)', () => {
    expect(LABEL_SIZES.xlarge).toBe(48)
    expect(labelScale('xlarge', GS)).toBeCloseTo(10 / (4 * GS), 12)
    expect(useLabelPrefs.getState().pdfLabelSize).toBe('auto')
    expect(autoPdfLabelInches(0.1, GS)).toBe(Math.ceil((2.5 / 0.9 / 0.1 / GS) * 12))
    const top = readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')
    expect(top).toMatch(/\['xlarge','XL'\]/)
    expect(top).toMatch(/<MenuRow label="PDF label size">[\s\S]*?<option value="auto">Auto \(≥ 2\.5 mm\)<\/option>/)
  })

  it('FU-panel: with aisles selected the right panel offers Default / Small / Medium / Large / Extra large / custom and Apply to all', () => {
    const objs = layout('horizontal'), ids = objs.filter(o => o.type === 'aisle').slice(0, 2).map(o => o.id)
    load(objs.map(o => (o.id === ids[0] ? { ...o, labelSizeIn: 36 } : o)))
    Object.assign(store.getInitialState(), store.getState())
    const one = renderToStaticMarkup(createElement(AL.AisleLabelSize, { ids: [ids[0]] }))
    for (const t of ['Default', 'Small', 'Medium', 'Large', 'Extra large', 'custom (inches)', 'Apply to all aisles']) expect(one).toContain(t)
    expect(one).toMatch(/aria-pressed="true"[^>]*>Large</)
    const mixed = renderToStaticMarkup(createElement(AL.AisleLabelSize, { ids }))
    expect(mixed).toContain('Mixed sizes')
    expect(AL.parseLabelInches('30')).toBe(30)
    expect(AL.parseLabelInches("2.5'")).toBe(30)
    expect(AL.parseLabelInches('1')).toBe(null)                                       // below 3 in
    // "Apply to all aisles" targets every aisle in the layout, not just the selection
    const panel = readFileSync('src/components/RightPanel/panels/AisleLabelSize.jsx', 'utf8')
    expect(panel).toMatch(/const allAisles = objects\.filter\(o => o\.type === 'aisle'\)\.map\(o => o\.id\)/)
    expect(panel).toMatch(/onClick=\{\(\) => setAisleLabelSize\(useCanvasStore, allAisles, current\)\}/)
    const props = readFileSync('src/components/RightPanel/PropertiesPanel.jsx', 'utf8')
    expect(props).toMatch(/<AisleLabelSize ids=\{\[obj\.id\]\} \/>/)                  // one aisle
    expect(props).toMatch(/<AisleLabelSize ids=\{selected\.filter\(o => o\.type === 'aisle'\)\.map\(o => o\.id\)\} \/>/)   // several
  })

  it('FU-columns: solid body at >= 0.8 opacity in the strong column colour, I-beam web and flanges, outline in drawing units (1") inset to the real size; conflict marks still drawn above them', () => {
    const grid = { ...columnGridObject({ lengthFt: 240, widthFt: 120, gridXFt: 25, gridYFt: 30, columnsAlongWall: true }, 0, 0), id: 'cg' }
    const g = columnGridOps(grid, GS)
    expect(g.opacity.body).toBeGreaterThanOrEqual(0.8)
    expect(COLUMN_OPACITY).toEqual({ body: 0.85, web: 0.5, flanges: 0.9 })
    expect(g.color).toBe(grid.stroke)                                                  // the strong colour, not the pale fill wash
    expect(g.outlineWidth).toBeCloseTo(GS / 12, 9)                                    // 1 inch, a drawing unit
    const first = g.outline.match(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/), body = g.body.match(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/)
    expect(+first[1] - g.outlineWidth / 2).toBeCloseTo(+body[1], 9)                   // outer edge of the outline = the column edge
    expect(+first[3] + g.outlineWidth).toBeCloseTo(+body[3], 9)
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
    expect(canvas.indexOf('<Scene listening />')).toBeLessThan(canvas.indexOf('<Overlays '))
    // the PDF prints the same column look
    expect(buildLayoutSVG([grid], [], GS).svg).toContain(`fill="${grid.stroke}" opacity="0.85"`)
  })

  it.each(['horizontal', 'vertical'])('FU-columns-top (%s): columns paint ABOVE racks — on the canvas and in the PDF — even though the grid comes first in the array', (orientation) => {
    const objs = layout(orientation)
    const iGrid = objs.findIndex(o => o.type === 'column_grid'), iRack = objs.findIndex(o => o.type && o.type.startsWith('rack_'))
    expect(iGrid).toBeLessThan(iRack)                                                  // the array alone would bury them
    const noLabels = { labels: { showAisles: false, showMarks: false } }
    const svg = buildLayoutSVG(objs, [], GS, noLabels).svg, color = objs[iGrid].stroke
    const without = buildLayoutSVG(objs.filter(o => o.type !== 'column_grid'), [], GS, noLabels).svg
    const col = svg.indexOf(`fill="${color}" opacity="0.85"`)
    expect(col).toBeGreaterThan(0)
    // everything up to and including the last rack is identical with or without the grid: the columns come after it
    // (from the first newline: the header's viewBox may differ, the grid can widen the bounds)
    const s0 = svg.indexOf('\n'), w0 = without.indexOf('\n'), racksLen = without.indexOf('<g class="labels">') - w0
    expect(racksLen).toBeGreaterThan(1000)
    expect(svg.slice(s0, s0 + racksLen)).toBe(without.slice(w0, w0 + racksLen))
    expect(col).toBeGreaterThanOrEqual(s0 + racksLen)
    expect(col).toBeLessThan(svg.indexOf('<g class="labels">'))                      // below the labels and marks
    const scene = readFileSync('src/canvas2/Scene.jsx', 'utf8')
    expect(scene).toMatch(/if \(o\.type === 'column_grid'\) \{ columns\.push\(/)
    expect(scene).toMatch(/return \{ floors, rest: rest\.concat\(columns\) \}/)
  })
})
