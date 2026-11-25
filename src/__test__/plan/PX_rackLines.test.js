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
import { rackDrawOps, uprightDrawRects, RACK_LINE, rackBorderWidth } from '../../render/rackOps'
import { RACK_FAMILIES } from '../../render/rackFamily'
import { paintHairlines, crispAt } from '../../render/hairlines'
import { snapBorderRects, snapFillRect, isAxisAligned, deviceBox, minDevicePx, deviceScale } from '../../render/pixelSnap'
/** (rack-design) the outline's width in world px for transform m: its SCREEN width (RACK_LINE.edge) × the pixel ratio, as the painter takes it */
const bw = (o, m, pr = 1) => (o.strokeWidth * pr) / deviceScale(m)
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
  // each rack's draw ops, worked out once (the same for every zoom and pan) — under the full run's parallel load the
  // loops below are CPU-bound, so nothing in them is recomputed per zoom × pan
  const ops = new Map()
  const opsOf = (r) => { if (!ops.has(r.id)) ops.set(r.id, rackDrawOps(r, { gridSize: GS })); return ops.get(r.id) }
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
    expect(rackBorderWidth(GS)).toBe(RACK_LINE.edge)
  })

  it('PX-in: zoomed in (100 %, 300 %, 500 %), outline and upright widths equal their actual size, to the whole pixel', () => {
    // every check of every rack at every zoom and pan, the misses collected and asserted once (tens of thousands of
    // single expect() calls were what made this test slow enough to time out under the full run)
    const bad = []
    let checked = 0
    const want = (ok, what) => { checked++; if (!ok) bad.push(what) }
    for (const zoom of [1, 3, 5]) for (const [px, py] of PANS) for (const r of racks) {
      const m = deviceMatrix(r, zoom, px, py), at = `${r.id} at ${zoom} pan ${px},${py}`
      for (const o of borders(r)) {
        const actual = o.strokeWidth                                  // device px: its screen width, at every zoom
        const strips = snapBorderRects(m, o, bw(o, m), 1)
        want(strips.length === 4, `${at}: ${strips.length} border strips`)
        // top/bottom strips are the line's thickness in y, left/right in x
        for (const s of [strips[0].h, strips[1].h, strips[2].w, strips[3].w]) {
          want(s === Math.round(actual), `${at}: border ${s} px, actual ${actual}`)
          want(Math.abs(s - actual) <= 0.5, `${at}: border ${s} px more than ½ px off ${actual}`)
        }
      }
      for (const u of uprights(r)) for (const rect of uprightDrawRects(u)) {
        const d = snapFillRect(m, rect, 1), b = deviceBox(m, rect.x, rect.y, rect.w, rect.h)
        const actual = rect.w * zoom
        want(Math.abs(acrossPx(r, d) - actual) <= 1, `${at}: upright ${acrossPx(r, d)} px, actual ${actual}`)   // both edges rounded
        // each snapped edge is the actual edge rounded: never more than half a pixel off
        want(Math.abs(d.x - b.x0) <= 0.5 && Math.abs(d.y - b.y0) <= 0.5 && Math.abs(d.x + d.w - b.x1) <= 0.5 && Math.abs(d.y + d.h - b.y1) <= 0.5, `${at}: upright edge more than ½ px off`)
      }
    }
    expect(checked).toBeGreaterThan(1000)
    expect(bad.slice(0, 10)).toEqual([])
  })

  it('PX-out: zoomed out (2 %, 5 %, 10 %), every outline and every thin upright is EXACTLY 1 px on screen — not thinner, not thicker', () => {
    let thinUprights = 0
    for (const zoom of [0.02, 0.05, 0.1]) for (const [px, py] of PANS) for (const r of racks) {
      const m = deviceMatrix(r, zoom, px, py)
      for (const o of borders(r)) {
        expect(bw(o, m) * zoom).toBeCloseTo(o.strokeWidth, 9)        // (rack-design) its screen width at every zoom
        const strips = snapBorderRects(m, o, bw(o, m), 1)
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
      for (const o of borders(r)) for (const s of snapBorderRects(m, o, bw(o, m, pr), floor)) {
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

  it('PX-pdf: (rack-design — was: 0.45″ in #3E6B54 with a fill) the PDF prints each outline in the pallet navy, no fill, and real-width uprights in the same navy', () => {
    const svg = buildLayoutSVG(racks, [], GS).svg
    const n = racks.reduce((k, r) => k + borders(r).length, 0)
    expect((svg.match(/fill="none" stroke="#2B3A67" stroke-width="1\.25"/g) || []).length).toBe(n)
    expect(svg).not.toMatch(/#DCE8DC/i)
    expect((svg.match(/<g fill="#2B3A67">/g) || []).length).toBe(racks.length)
  })

  /* (rack-design) a 1 px hairline (a lane line, a slot) is one sharp pixel: on the half pixel at every zoom asked for —
     30, 50, 100 and 200 % — and on the whole pixel for an even device width (pixel ratio 2) */
  it('PX-hair: every straight hairline and slot edge of every rack lands on the half pixel (odd width) or the whole pixel (even), at 30, 50, 100 and 200 %', () => {
    const lanes = { id: 'h1', type: 'rack_drive_in', x: 13.7, y: 21.3, width: 700, height: 800, lanes: 4, palletDeep: 5, uprightWidth: 4 }
    const bad = []
    let n = 0
    for (const pr of [1, 2]) for (const zoom of [0.3, 0.5, 1, 2]) for (const [px, py] of PANS) for (const r of [...racks.slice(0, 4), lanes]) {
      const m = deviceMatrix(r, zoom, px, py, pr)
      for (const o of rackDrawOps(r, { gridSize: GS }).filter(q => q.op === 'lines' || q.op === 'slots')) {
        const raw = o.strokeWidth * pr, lw = raw >= 1 ? Math.max(1, Math.round(raw)) : raw   // its device width (a lane line 1.5 px — rack-design-match; a beam slot 0.75 px at ratio 1 — rack-fixes 4)
        const xs = [], calls = []
        const c = { getTransform: () => m, setTransform: () => {}, save: () => {}, restore: () => {}, setLineDash: () => {}, beginPath: () => {}, stroke: () => {},
          moveTo: (x, y) => calls.push([x, y]), lineTo: (x, y) => calls.push([x, y]), set lineWidth(v) { xs.push(v) }, set strokeStyle(v) { void v } }
        paintHairlines({ _context: c, canvas: { getPixelRatio: () => pr } }, o)
        for (let k = 0; k + 1 < calls.length; k += 2) {
          const [a, b] = [calls[k], calls[k + 1]]
          if (a[0] === b[0]) { n++; if (a[0] !== crispAt(a[0], lw) || (lw % 2 ? Math.abs(a[0] % 1) !== 0.5 : !Number.isInteger(a[0]))) bad.push([r.id, zoom, pr, 'x', a[0]]) }
          else if (a[1] === b[1]) { n++; if (lw % 2 ? Math.abs(a[1] % 1) !== 0.5 : !Number.isInteger(a[1])) bad.push([r.id, zoom, pr, 'y', a[1]]) }
        }
        if (calls.length) expect(xs[0]).toBe(lw)
      }
    }
    expect(n).toBeGreaterThan(500)
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('PX — wiring', () => {
  it('PX-wire: the canvas paints outlines and uprights through the snapper; the fill and the columns stay actual size', () => {
    const shapes = readFileSync('src/canvas2/shapes.jsx', 'utf8').split(String.fromCharCode(13)).join('')
    const ops = shapes.slice(shapes.indexOf('export function Ops('), shapes.indexOf('\n}\n', shapes.indexOf('export function Ops(')))
    expect(ops).toMatch(/if \(o\.op === 'rect' && o\.border\)/)
    expect(ops).toMatch(/snapBorderRects\(m, o, \(o\.strokeWidth \* pr\) \/ \(deviceScale\(m\) \|\| 1\), minPx\)/)   // (rack-design) a screen width
    expect(ops).toMatch(/sceneFunc=\{\(ctx\) => paintHairlines\(ctx, o\)\}/)
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
