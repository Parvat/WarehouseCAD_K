// Area UNITS — the project's units (units round; utils/units.js): one parser for every typed length, one formatter for
// every length shown, Imperial (ft-in) or Metric at a chosen precision. Storage never changes, so Fill gives the same
// racks, positions and BOM in either unit (Rule 7: identical positions and counts).
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import { useUnits, DEFAULT_UNITS, parseLength, fmtLength, fmtImperial, fmtMetric, pxToFtIn, pxToFtInCard, unitsOfRules } from '../../utils/units'
import { planAreaCreate } from '../../generate/rackingArea'
import { innerBox } from '../../generate/regenerate'
import { getLayoutCapacity } from '../../utils/capacity'
import { computeBom, ftIn } from '../../utils/bom'
import { parseFeet } from '../../components/RightPanel/panels/RackingAreaPanel'

const GS = 40
const IMP = { metric: false, precisionIn: 1, precisionMm: 1 }, MET = { metric: true, precisionIn: 1, precisionMm: 1 }
afterEach(() => useUnits.setState({ ...DEFAULT_UNITS }))

describe('UNITS — one parser', () => {
  const ft = (t, u = IMP) => { const v = parseLength(t, u); return v == null ? null : Math.round(v * 1e6) / 1e6 }
  it.each([
    ["12'6", 12.5], ["12' 6\"", 12.5], ['12 ft 6 in', 12.5], ['12′-6″', 12.5], ['12ft', 12], ["12'", 12],
    ['150 in', 12.5], ['150"', 12.5], ['12', 12], ['12.5', 12.5], ["12' 6 1/2\"", 12 + 6.5 / 12],
  ])('imperial %s → %s ft', (t, v) => expect(ft(t)).toBeCloseTo(v, 6))
  it('metric forms, and a bare number in the project unit', () => {
    expect(ft('3.8 m')).toBeCloseTo(3800 / 25.4 / 12, 6)
    expect(ft('3800 mm')).toBeCloseTo(3800 / 25.4 / 12, 6)
    expect(ft('380 cm')).toBeCloseTo(3800 / 25.4 / 12, 6)
    expect(ft('3800', MET)).toBeCloseTo(3800 / 25.4 / 12, 6)   // bare: mm in metric
    expect(ft('12', IMP)).toBe(12)                               // bare: feet in imperial
    expect(ft("12'6", MET)).toBe(12.5)                           // a unit typed wins in either
  })
  it('not a length → null; the card parser refuses 0', () => {
    expect(parseLength('abc')).toBe(null); expect(parseLength('')).toBe(null); expect(parseLength('12 kg')).toBe(null)
    expect(parseFeet('0')).toBe(null); expect(parseFeet('3.8 m')).toBeCloseTo(3800 / 25.4 / 12, 6)
  })
})

describe('UNITS — one formatter', () => {
  it('Imperial 1″ shows exactly what it always did', () => {
    expect(pxToFtIn(500, GS)).toBe("12' 6\""); expect(pxToFtIn(480, GS)).toBe("12'"); expect(ftIn(150)).toBe('12′-6″')
  })
  it('imperial precision: fractions to 1/16, 1/8, 1/2', () => {
    expect(fmtImperial(150.5, 'plain', { precisionIn: 1 / 2 })).toBe('12\' 6 ½"')
    expect(fmtImperial(150.375, 'dash', { precisionIn: 1 / 8 })).toBe('12′-6 3/8″')
    expect(fmtImperial(150.0625, 'space', { precisionIn: 1 / 16 })).toBe('12′ 6 1/16″')
    expect(fmtImperial(150.3, 'plain', { precisionIn: 1 })).toBe('12\' 6"')
  })
  it('metric: mm in cards and tables to the precision, metres to 2 decimals on the plan', () => {
    expect(fmtMetric(150, 'card', MET)).toBe('3810 mm')
    expect(fmtMetric(150, 'card', { ...MET, precisionMm: 10 })).toBe('3810 mm')
    expect(fmtMetric(150, 'card', { ...MET, precisionMm: 100 })).toBe('3800 mm')
    expect(fmtMetric(150, 'plan', MET)).toBe('3.81 m')
    useUnits.setState(MET)
    expect(pxToFtIn(500, GS)).toBe('3.81 m'); expect(pxToFtInCard(500, GS)).toBe('3810 mm'); expect(ftIn(150)).toBe('3810 mm')
    expect(fmtLength(150, 'table')).toBe('3810 mm')
  })
  it("an older project's units map on", () => {
    expect(unitsOfRules({ units: 'meters' }).metric).toBe(true)
    expect(unitsOfRules({ units: 'ft · in' }).metric).toBe(false)
    expect(unitsOfRules({ unitSystem: 'metric', precisionMm: 10 })).toEqual({ metric: true, precisionIn: 1, precisionMm: 10 })
    expect(unitsOfRules({ precisionIn: 0.3 }).precisionIn).toBe(1)   // not a listed precision → 1″
  })
})

describe('UNITS — Rule 7: identical positions and counts in both units', () => {
  const SETTINGS = { beamIn: 96, palletWIn: 40, palletDIn: 48, mhe: 'reach', aisleFt: 10.5, maxRunFt: 150, wallClearIn: 3, levels: 4 }
  const load = (f) => JSON.parse(fs.readFileSync('src/__test__/plan/handCheck/' + f, 'utf8'))
  const run = (j, orientation, u) => {
    useUnits.setState(u)
    let n = 0
    const objs = (j.objects || j.scene.objects).filter(o => !/^rack_/.test(o.type) && o.type !== 'racking_area')
    const fp = objs.find(o => /^fp_/.test(o.type)), box = innerBox(fp, GS)
    const out = planAreaCreate(objs, box, { ...SETTINGS, orientation }, { gridSize: GS, newId: () => 'u' + (++n), from: { x: box.x, y: box.y } }).objects
    const racks = out.filter(o => /^rack_/.test(o.type)).map(o => [o.type, o.x, o.y, o.width, o.height, (o.beams || []).join(',')])
    const cap = getLayoutCapacity(out)
    const T = (j.elevations || j.scene?.elevations) || null
    const bom = T ? computeBom(out, T, { gridSize: GS }).lines.map(l => [l.part, l.qty]) : null
    return { racks, cap: cap.totalPositions ?? cap.total ?? JSON.stringify(cap), bom }
  }
  for (const f of ['older-horizontal', 'older-vertical', 'crowded-horizontal', 'crowded-vertical'])
    for (const o of ['horizontal', 'vertical'])
      it(`${f} filled ${o}: the same racks, positions and BOM quantities`, () => {
        const j = load(f + '.wcad'), a = run(j, o, IMP), b = run(j, o, MET), c = run(j, o, { metric: false, precisionIn: 1 / 16, precisionMm: 1 })
        expect(a.racks.length).toBeGreaterThan(0)
        expect(b).toEqual(a); expect(c).toEqual(a)
      })
})
