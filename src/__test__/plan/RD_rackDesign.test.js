// Area RD — (rack-design) how racking looks on the plan and in the library: design/rack-plan-colour.png and
// design/rack-library.png. One line colour per family, no fill, the slots in the family tint; the selection blue never a
// family colour; the library's rows, groups and tooltips; the PDF in the same colours.
import { describe, it, expect } from 'vitest'
import { RACK_FAMILIES, rackFamilyOf, rackColors, RACK_SELECT, RACK_NUMBER } from '../../render/rackFamily'
import { rackDrawOps, PORTED_RACK_TYPES } from '../../render/rackOps'
import { RACK_LIBRARY, RACK_LIBRARY_HIDDEN } from '../../studio/RackLibrary'
import { WAREHOUSE_CATEGORIES } from '../../constants/warehouseObjects'
import { buildLayoutSVG } from '../../export/pdfExport'

globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
const GS = 40

describe('RD — the family colours', () => {
  it('RD-family: every rack type maps to its family and the family to the colours asked for', () => {
    expect(Object.fromEntries([...PORTED_RACK_TYPES].sort().map(t => [t, rackFamilyOf(t)]))).toEqual({
      rack_cantilever: 'other', rack_double_row: 'pallet', rack_drive_in: 'lane', rack_drive_through: 'lane',
      rack_mezzanine: 'mezz', rack_pallet_flow: 'flow', rack_pushback: 'flow', rack_row: 'pallet', rack_shelving: 'other',
    })
    expect(RACK_FAMILIES).toEqual({
      pallet: { line: '#2B3A67', tint: '#8C95B5', icon: '#8FA0D8' },
      lane:   { line: '#1C7A52', tint: '#86B8A0', icon: '#5BC193' },
      flow:   { line: '#B26A12', tint: '#D9AE78', icon: '#E3A456' },
      other:  { line: '#6A4C93', tint: '#B1A0C8', icon: '#B79BE0' },
      mezz:   { line: '#5A5F5B', tint: '#A9AFAA', icon: '#A9AFAA' },
    })
    expect(rackFamilyOf('struct_column')).toBeNull()
    expect(RACK_NUMBER).toBe('#55605A')
  })

  it('RD-colours-drawn: each type draws in its own family colour and no other, with no fill', () => {
    const base = { x: 0, y: 0, width: 800, height: 400, beams: [96, 96], lanes: 3, palletDeep: 4, towers: [36, 36, 36] }
    for (const t of PORTED_RACK_TYPES) {
      const c = rackColors(t), ops = rackDrawOps({ ...base, type: t }, { gridSize: GS })
      const used = new Set()
      for (const o of ops) for (const k of ['stroke', 'fill', 'color']) if (o[k] && o[k] !== 'transparent') used.add(o[k])
      expect([t, [...used].every(v => v === c.line || v === c.tint)]).toEqual([t, true])
      expect([t, ops.some(o => o.op === 'rect' && o.fill && o.fill !== 'transparent')]).toEqual([t, false])
    }
  })

  it('RD-select: the selection blue is never a family colour (line, tint or icon), nor the rack numbers\' grey', () => {
    expect(RACK_SELECT).toBe('#2F6FD6')
    const all = Object.values(RACK_FAMILIES).flatMap(f => Object.values(f)).map(v => v.toUpperCase())
    expect(all).not.toContain(RACK_SELECT.toUpperCase())
    expect(RACK_NUMBER.toUpperCase()).not.toBe(RACK_SELECT.toUpperCase())
  })

  it('RD-pdf: the PDF prints each type in its family colours, no fill, its face words and its posts', () => {
    const objs = [
      { id: 'a', type: 'rack_row', x: 0, y: 0, width: 330, height: 140, beams: [96, 96], uprightWidth: 3 },
      { id: 'b', type: 'rack_drive_in', x: 0, y: 400, width: 600, height: 800, lanes: 4, palletDeep: 5, uprightWidth: 4 },
      { id: 'c', type: 'rack_pallet_flow', x: 800, y: 400, width: 500, height: 640, lanes: 3, palletDeep: 4, uprightWidth: 3 },
      { id: 'd', type: 'rack_mezzanine', x: 0, y: 1400, width: 1200, height: 800 },
    ]
    const sheet = buildLayoutSVG(objs, [], GS), svg = sheet.svg
    for (const f of ['pallet', 'lane', 'flow', 'mezz']) expect([f, svg.includes(RACK_FAMILIES[f].line)]).toEqual([f, true])
    for (const w of ['ENTRY', 'LOAD', 'PICK', 'MEZZANINE']) expect([w, svg.includes('>' + w + '<')]).toEqual([w, true])
    expect(svg).not.toMatch(/#DCE8DC/i)                                                  // the old rack fill
    // the pallet slots: the canvas's 4 · 3 screen px dash at 0.25 mm a px (lane-fixes 8, pdf-parity — was 4,3 world units)
    expect(svg).toContain(`stroke-dasharray="${4 * sheet.px} ${3 * sheet.px}"`)
  })
})

describe('RD — the racking library', () => {
  const storage = WAREHOUSE_CATEGORIES.find(c => c.id === 'storage').objects.map(o => o.id)

  it('RD-library: four groups in order — Pallet, Lane, Flow, Other — and the ten types in each, as asked', () => {
    expect(RACK_LIBRARY.map(([g, rows]) => [g, rows.map(r => r.name)])).toEqual([
      ['Pallet', ['Selective', 'Back-to-back', 'Double-deep']],
      ['Lane', ['Drive-in', 'Drive-through']],
      ['Flow', ['Push-back', 'Pallet flow', 'Carton flow']],   // Carton flow: not built yet, a disabled row
      ['Other', ['Cantilever', 'Shelving', 'Mezzanine']],
    ])
  })

  it('RD-library-tips: each row\'s tooltip, word for word', () => {
    expect(Object.fromEntries(RACK_LIBRARY.flatMap(([, rows]) => rows.map(r => [r.name, r.tip])))).toEqual({
      Selective: 'Single row, every pallet reachable', 'Back-to-back': 'Two rows sharing a flue', 'Double-deep': 'Two pallets deep, reach truck',
      'Drive-in': 'One entry, last in first out', 'Drive-through': 'Entry both ends, first in first out',
      'Push-back': 'Carts, load and pick one face', 'Pallet flow': 'Load back, pick front, gravity',
      'Carton flow': 'Coming soon', Cantilever: 'Arms for long loads', Shelving: 'Hand-pick units', Mezzanine: 'Raised floor area',
    })
  })

  it('RD-library-items: every row but Carton flow is a library item that exists today; Carton flow (not built — FEATURES.md) has none, so it shows disabled, "Coming soon"; Rack Row (multi-bay) is left out of the flyout but still in the library, so a saved one loads', () => {
    for (const [, rows] of RACK_LIBRARY) for (const r of rows) expect([r.name, storage.includes(r.id)]).toEqual([r.name, r.name !== 'Carton flow'])
    expect([...RACK_LIBRARY_HIDDEN]).toEqual(['rack_row'])
    expect(storage).toContain('rack_row')
    // every storage item is either a row or hidden: nothing dropped by accident
    const shown = new Set(RACK_LIBRARY.flatMap(([, rows]) => rows.map(r => r.id)))
    expect(storage.filter(id => !shown.has(id) && !RACK_LIBRARY_HIDDEN.has(id))).toEqual([])
  })
})
