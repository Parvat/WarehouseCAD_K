// Area PX — rack lines: rack body outlines and upright frames are drawn at
// their ACTUAL size, never thinner than 1 screen px, every edge on a whole
// device pixel. Rack fill and columns stay actual size.
// 1080 x 410, 25 x 30, reach; both orientations. Every rack of the layout,
// through the same transform the canvas paints with: pixel ratio x stage
// (zoom, pan) x the rack's own centre rotation (shapes.jsx spin()).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { DEFAULT_RULES } from '../../rules/defaults'
import { rackDrawOps, uprightDrawRects, RACK_BORDER_IN, rackBorderWidth } from '../../render/rackOps'
import { snapBorderRects, snapFillRect, isAxisAligned, deviceBox, minDevicePx } from '../../render/pixelSnap'
import { buildLayoutSVG } from '../../export/pdfExport'
import { GS } from './fixtures'

globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }

/** The canvas's device transform for a rack: pr · (zoom · spin(rack) + pan). */
function deviceMatrix(rack, zoom, panX, panY, pr = 1) {
  const t = (rack.rotation || 0) * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t)
  const cx = rack.x + rack.width / 2, cy = rack.y + rack.height / 2
  const k = pr * zoom
  return {
    a: k * cos, b: k * sin, c: -k * sin, d: k * cos,
    e: pr * (zoom * (cx - cos * cx + sin * cy) + panX),
    f: pr * (zoom * (cy - sin * cx - cos * cy) + panY),
  }
}
const whole = (r) => [r.x, r.y, r.w, r.h].every(Number.isInteger)
/** An upright's width across the rack (its narrow side), in device px, whichever way the rack is turned. */
const acrossPx = (rack, r) => ((rack.rotation || 0) % 180 === 0 ? r.w : r.h)
const alongPx = (rack, r) => ((rack.rotation || 0) % 180 === 0 ? r.h : r.w)

function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  return sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i }))
}
// fractional pans, so no line lands on a pixel by luck
const PANS = [[0, 0], [0.37, 0.61], [-123.49, 58.5], [777.77, -0.25]]

describe.each(['horizontal', 'vertical'])('PX — %s', (orientation) => {
  const racks = layout(orientation)
  const opsOf = (r) => rackDrawOps(r, { gridSize: GS })
  const borders = (r) => opsOf(r).filter(o => o.op === 'rect' && o.border)
  const uprights = (r) => opsOf(r).filter(o => o.op === 'uprights')

  it('PX-layout: the layout is the orientation asked for, every rack has an outline and upright frames, and every transform is axis-aligned', () => {
    expect(racks.length).toBeGreaterThan(20)
    expect(new Set(racks.map(r => (r.rotation || 0) % 180)).size).toBe(1)
    expect((racks[0].rotation || 0) % 180).toBe(orientation === 'horizontal' ? 0 : 90)
    for (const r of racks) {
      expect(borders(r).length).toBeGreaterThan(0)
      expect(uprights(r)).toHaveLength(1)
      expect(borders(r).every(o => o.strokeWidth === rackBorderWidth(GS))).toBe(true)
      expect(isAxisAligned(deviceMatrix(r, 0.37, 1.1, 2.2))).toBe(true)
    }
    expect(rackBorderWidth(GS)).toBeCloseTo((RACK_BORDER_IN / 12) * GS, 12)
  })

  it('PX-in: zoomed in (100 %, 300 %, 500 %), outline and upright widths equal their actual size, to the whole pixel', () => {
    for (const zoom of [1, 3, 5]) for (const [px, py] of PANS) for (const r of racks) {
      const m = deviceMatrix(r, zoom, px, py)
      for (const o of borders(r)) {
        const actual = o.strokeWidth * zoom                          // device px
        const strips = snapBorderRects(m, o, o.strokeWidth, 1)
        expect(strips).toHaveLength(4)
        // top/bottom strips are the line's thickness in y, left/right in x
        for (const s of [strips[0].h, strips[1].h, strips[2].w, strips[3].w]) {
          expect(s).toBe(Math.round(actual))
          expect(Math.abs(s - actual)).toBeLessThanOrEqual(0.5)
        }
      }
      for (const u of uprights(r)) for (const rect of uprightDrawRects(u)) {
        const d = snapFillRect(m, rect, 1), b = deviceBox(m, rect.x, rect.y, rect.w, rect.h)
        const actual = rect.w * zoom
        expect(Math.abs(acrossPx(r, d) - actual), `upright ${actual}px at ${zoom}`).toBeLessThanOrEqual(1)   // both edges rounded
        // each snapped edge is the actual edge rounded: never more than half a pixel off
        expect(Math.abs(d.x - b.x0)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(d.y - b.y0)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(d.x + d.w - b.x1)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(d.y + d.h - b.y1)).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it('PX-out: zoomed out (2 %, 5 %, 10 %), every outline and every thin upright is EXACTLY 1 px on screen — not thinner, not thicker', () => {
    let thinUprights = 0
    for (const zoom of [0.02, 0.05, 0.1]) for (const [px, py] of PANS) for (const r of racks) {
      const m = deviceMatrix(r, zoom, px, py)
      for (const o of borders(r)) {
        expect(o.strokeWidth * zoom).toBeLessThan(1)                // the actual size is under a pixel here
        const strips = snapBorderRects(m, o, o.strokeWidth, 1)
        if (strips.length === 4) for (const s of [strips[0].h, strips[1].h, strips[2].w, strips[3].w]) expect(s).toBe(1)
        else expect(Math.min(strips[0].w, strips[0].h)).toBeGreaterThanOrEqual(1)   // a rack under 3 px deep: one solid block
      }
      for (const u of uprights(r)) for (const rect of uprightDrawRects(u)) {
        if (rect.w * zoom >= 1) continue
        thinUprights++
        const d = snapFillRect(m, rect, 1)
        expect(acrossPx(r, d)).toBe(1)
        expect(alongPx(r, d)).toBeGreaterThanOrEqual(1)
      }
    }
    expect(thinUprights).toBeGreaterThan(1000)
  })

  it('PX-whole: every painted edge lands on a whole device pixel — any zoom, any pan, pixel ratio 1, 1.5 and 2 (the floor is one CSS px: 1, 2, 2 device px)', () => {
    expect([1, 1.5, 2].map(minDevicePx)).toEqual([1, 2, 2])
    for (const pr of [1, 1.5, 2]) for (const zoom of [0.02, 0.137, 0.5, 1.33, 4]) for (const [px, py] of PANS) for (const r of racks.slice(0, 12)) {
      const m = deviceMatrix(r, zoom, px, py, pr), floor = minDevicePx(pr)
      for (const o of borders(r)) for (const s of snapBorderRects(m, o, o.strokeWidth, floor)) {
        expect(whole(s)).toBe(true)
        expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(floor)
      }
      for (const u of uprights(r)) for (const rect of uprightDrawRects(u)) {
        const d = snapFillRect(m, rect, floor)
        expect(whole(d)).toBe(true)
        expect(Math.min(d.w, d.h)).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('PX-pdf: the PDF prints the same actual outline width (0.45" = 1.5 world px) and real-width uprights', () => {
    const svg = buildLayoutSVG(racks, [], GS).svg
    const n = racks.reduce((k, r) => k + borders(r).length, 0)
    expect((svg.match(/stroke="#3E6B54" stroke-width="1\.5"/g) || []).length).toBe(n)
  })
})

describe('PX — wiring', () => {
  it('PX-wire: the canvas paints outlines and uprights through the snapper; the fill and the columns stay actual size', () => {
    const shapes = readFileSync('src/canvas2/shapes.jsx', 'utf8').split(String.fromCharCode(13)).join('')
    const ops = shapes.slice(shapes.indexOf('export function Ops('), shapes.indexOf('\n}\n', shapes.indexOf('export function Ops(')))
    expect(ops).toMatch(/if \(o\.op === 'rect' && o\.border\)/)
    expect(ops).toMatch(/snapBorderRects\(m, o, o\.strokeWidth, minPx\)/)
    expect(ops).toMatch(/uprightDrawRects\(o\)\.map\(r => snapFillRect\(m, r, minPx\)\)/)
    // the body's fill Rect carries no stroke of its own (the outline is the snapped strips)
    const body = ops.slice(ops.indexOf("o.op === 'rect' && o.border"), ops.indexOf("if (o.op === 'rect') {"))
    expect(body).not.toMatch(/strokeWidth=|strokeScaleEnabled/)
    expect(shapes).toMatch(/const minPx = minDevicePx\(pixelRatioOf\(ctx\)\)/)
    // columns untouched: real size, no snapping
    const col = shapes.slice(shapes.indexOf('function ColumnGridShapeView('), shapes.indexOf('\n}\n', shapes.indexOf('function ColumnGridShapeView(')))
    expect(col).not.toMatch(/snap|minPx/i)
  })
})
