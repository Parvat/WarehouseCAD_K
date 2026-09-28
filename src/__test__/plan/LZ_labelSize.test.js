// Area LZ — labels are DRAWING size (like CAD text): a fixed size in feet that
// scales with the racks, set by the Label size setting (Small / Medium /
// Large = 12 / 24 / 36 in reference text), never by the view zoom. The PDF
// export draws the same ops at the same size.
// 1080 x 410, 25 x 30, reach; both orientations.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sizingSheetLayout, columnGridObject } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint, aisleColumnBlocks, MHE_PROFILES } from '../../generate/columnCheck'
import { layoutColumns } from '../../generate/usableCapacity'
import { DEFAULT_RULES } from '../../rules/defaults'
import { rebuildAisles } from '../../utils/aisleRebuild'
import { aisleLabelLayout } from '../../canvas2/hitTest'
import { crossAisleLabels } from '../../canvas2/crossAisles'
import { LABEL_SIZES, labelScale } from '../../render/labelSize'
import { aisleLabelOps, clearanceOps, blockedFaceOps, uprightOps, oversizedOps } from '../../render/labelOps'
import { buildLayoutSVG } from '../../export/pdfExport'
import { useLabelPrefs } from '../../canvas2/labelPrefs'
import { GS } from './fixtures'

globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
let seq = 0
const newId = () => 'z' + (++seq)
function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS, fpVerts: [{ x: 0, y: 0 }, { x: 1080 * GS, y: 0 }, { x: 1080 * GS, y: 410 * GS }, { x: 0, y: 410 * GS }] }
  const grid = { ...columnGridObject(brief, 0, 0), id: 'cg' }
  return rebuildAisles([fp, grid, ...racks], newId).objects
}
/** a column pinched in an aisle: the far row pushed to 3 ft from it */
function pinched(objs) {
  const racks = objs.filter(o => o.type && o.type.startsWith('rack_')), cols = layoutColumns(objs, GS)
  const b = aisleColumnBlocks({ racks, columns: cols, profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks.find(q => !q.pinched && q.nearClearFt < 8)
  const d = -(b.farClearFt * GS - 3 * GS), id = b.betweenRows[1]
  return objs.map(o => (o.id === id ? { ...o, x: o.x + (b.axis === 'x' ? d : 0), y: o.y + (b.axis === 'y' ? d : 0) } : o))
}
const texts = (ops) => ops.filter(o => o.op === 'text')
const sizes = (ops) => ops.flatMap(o => [o.fontSize, o.strokeWidth, o.w, o.h].filter(v => typeof v === 'number' && v > 0))
const inFt = (px) => px / GS

describe.each(['horizontal', 'vertical'])('LZ — %s', (orientation) => {
  const objs = layout(orientation)
  const aisles = objs.filter(o => o.type === 'aisle')
  const racks = objs.filter(o => o.type && o.type.startsWith('rack_'))

  it('LZ-feet: an aisle label\'s text is exactly the Label size tall, in feet — Small / Medium / Large = 1 / 2 / 3 ft', () => {
    for (const [size, inches] of Object.entries(LABEL_SIZES)) {
      const ops = aisleLabelOps(aisleLabelLayout(aisles[0], objs, GS), labelScale(size, GS))
      expect(texts(ops)).toHaveLength(1)                                     // one label per aisle
      expect(inFt(texts(ops)[0].fontSize)).toBeCloseTo(inches / 12, 9)
    }
  })

  it('LZ-all: changing Label size scales EVERY label and mark by the same factor (aisle, cross-aisle, clearance + warning, X marks, upright flags, oversized bays), anchors unchanged', () => {
    const p = pinched(objs)
    const pr = p.filter(o => o.type && o.type.startsWith('rack_')), cols = layoutColumns(p, GS)
    const block = aisleColumnBlocks({ racks: pr, columns: cols, profile: MHE_PROFILES.reach, gridSize: GS }).aisleBlocks.find(q => q.pinched)
    const rack = racks.find(r => r.type === 'rack_double_row')
    const gens = {
      aisle: (lz) => aisleLabelOps(aisleLabelLayout(aisles[3], objs, GS), lz),
      cross: (lz) => aisleLabelOps(crossAisleLabels(objs, GS)[0], lz),
      clearance: (lz) => clearanceOps(block, cols[block.columnIndex], lz, GS, true),
      xmark: (lz) => blockedFaceOps({ rackId: rack.id, bayIndex: 1, faces: [0, 1], positionIndices: [0, 1] }, rack, GS, lz),
      upright: (lz) => uprightOps({ rackId: rack.id, upright: 2, faces: [0, 1] }, rack, GS, lz),
      oversized: (lz) => oversizedOps({ ...rack, beams: [96, 30, 96] }, GS, lz),
    }
    for (const [name, gen] of Object.entries(gens)) {
      const S = gen(labelScale('small', GS)), L = gen(labelScale('large', GS))
      expect(S.length, name).toBeGreaterThan(0)
      expect(L.length, name).toBe(S.length)
      // every size (font, stroke, pill box) grows 3x; text stays centred on the same point
      const s = sizes(S).filter(v => v > 1e-9), l = sizes(L).filter(v => v > 1e-9)
      if (['aisle', 'cross', 'clearance'].includes(name)) {
        const fsS = texts(S).map(t => t.fontSize), fsL = texts(L).map(t => t.fontSize)
        fsL.forEach((v, i) => expect(v / fsS[i], name).toBeCloseTo(3, 9))
        // a width label stays centred on its gap (a clearance pill may slide aside when it no longer fits)
        if (name !== 'clearance') texts(L).forEach((t, i) => { const u = texts(S)[i]; expect(t.x + t.w / 2).toBeCloseTo(u.x + u.w / 2, 6); expect(t.y + t.h / 2).toBeCloseTo(u.y + u.h / 2, 6) })
      }
      const strokesS = S.filter(o => o.strokeWidth).map(o => o.strokeWidth), strokesL = L.filter(o => o.strokeWidth).map(o => o.strokeWidth)
      strokesL.forEach((v, i) => expect(v / strokesS[i], name + ' stroke').toBeCloseTo(3, 9))
      expect(s.length).toBe(l.length)
    }
  })

  it('LZ-zoom: nothing on the drawing is sized by the view zoom — the overlays read the Label size, the op generators take no zoom', () => {
    const ov = readFileSync('src/canvas2/Overlays.jsx', 'utf8')
    expect(ov).toMatch(/const lz = labelScale\(labelSize, gridSize\)/)
    expect(ov).not.toMatch(/\bzoom=\{zoom\}|s => s\.zoom|zoom = 1,/)
    for (const comp of ['AisleLabelItem', 'CrossAisleLabels', 'ColumnClearanceLabels', 'BlockedFaceMarks', 'UprightConflictMarks', 'OversizedBayMarks']) {
      const line = ov.split('\n').find(l => l.includes('<' + comp + ' '))
      expect(line, comp).toMatch(/\blz=\{lz\}/)
    }
    // the selection-only dimension labels too
    expect(ov).toMatch(/<RackLabels [^>]*zoom=\{lz\}/)
    expect(ov).toMatch(/<FpDimLabels [^>]*zoom=\{lz\}/)
    const canvas = readFileSync('src/canvas2/Canvas2.jsx', 'utf8')
    expect(canvas).not.toMatch(/<Overlays [^>]*\bzoom=/)
  })

  it('LZ-pdf: the PDF draws the same labels at the same size — aisle and cross-aisle labels, Label size honoured, Column labels switch honoured (warnings kept)', () => {
    const p = pinched(objs)
    const at = (labels) => buildLayoutSVG(p, [], GS, { labels: { showAisles: true, showMarks: true, profile: MHE_PROFILES.reach, pickBothSides: false, ...labels } }).svg
    const fontSizes = (svg) => [...svg.matchAll(/<text x="[^"]*" y="[^"]*" font-size="([^"]+)" font-family="JetBrains/g)].map(m => +m[1])
    const med = at({ labelSize: 'medium', showColumnLabels: true }), big = at({ labelSize: 'large', showColumnLabels: true })
    const nAisle = aisles.length, nCross = crossAisleLabels(p, GS).length
    expect(nCross).toBeGreaterThan(0)
    // aisle + cross-aisle labels at exactly the Label size
    expect(fontSizes(med).filter(v => Math.abs(inFt(v) - 2) < 1e-9)).toHaveLength(nAisle + nCross)
    expect(fontSizes(big).filter(v => Math.abs(inFt(v) - 3) < 1e-9)).toHaveLength(nAisle + nCross)
    // switch off: the blue "clear" labels go, the red "under travel" labels and shades stay
    const off = at({ labelSize: 'medium', showColumnLabels: false })
    expect((med.match(/' clear</g) || []).length).toBeGreaterThan(0)
    expect((off.match(/' clear</g) || []).length).toBe(0)
    expect((off.match(/under travel</g) || []).length).toBe((med.match(/under travel</g) || []).length)
    expect((off.match(/under travel</g) || []).length).toBeGreaterThan(0)
    expect((off.match(/stroke-dasharray/g) || []).length).toBe((med.match(/stroke-dasharray/g) || []).length)   // the red shades
    // X marks (red polylines) and upright flags (orange polygons) unchanged by the switch
    const red = (svg) => (svg.match(/<polyline[^>]*stroke="#C0392B"/g) || []).length, orange = (svg) => (svg.match(/stroke="#E67E22"/g) || []).length
    expect(red(off)).toBe(red(med))                                                    // X marks, oversized crosses, under-travel arrows
    expect(red(med)).toBeGreaterThan(0)
    expect(orange(off)).toBe(orange(med))
  })
})

describe('LZ — the setting', () => {
  beforeEach(() => useLabelPrefs.setState({ labelSize: 'medium', showColumnLabels: true }))
  it('LZ-default: Medium by default; the View menu offers Small / Medium / Large; Column labels on by default', () => {
    expect(useLabelPrefs.getState().labelSize).toBe('medium')
    expect(useLabelPrefs.getState().showColumnLabels).toBe(true)
    useLabelPrefs.getState().setLabelSize('huge')                        // not a size: ignored
    expect(useLabelPrefs.getState().labelSize).toBe('medium')
    useLabelPrefs.getState().setLabelSize('large')
    expect(useLabelPrefs.getState().labelSize).toBe('large')
    const top = readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')
    expect(top).toMatch(/<MenuRow label="Label size">[\s\S]*?\['small','S'\],\['medium','M'\],\['large','L'\]/)
    expect(top).toMatch(/onClick=\{\(\) => setLabelSize\(val\)\}/)
  })
})
