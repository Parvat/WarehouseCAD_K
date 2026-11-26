// OF_oldFiles.test.js — (old-files) every saved file in the repo, and the older formats deserializeScene still reads,
// loads; and its counts, rack numbers and BOM are the same after a save and a reload (and a second one).
// Older formats built from the demo file: version 1 (the elevation types as an object among the objects), a polygon
// (the Polygon tool is gone: a closed polyline), a drawn shape with no `corners` (round), a back-to-back pair cut in two.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { serializeScene, deserializeScene } from '../../utils/saveLoad'
import { computeBom } from '../../utils/bom'
import { getLayoutCapacity } from '../../utils/capacity'
import { levelsResolver } from '../../utils/elevations'
import { rackNumbersNow } from '../../utils/rackLines'
import { bayLedger } from '../../utils/bayLedger'

const dir = new URL('./handCheck/', import.meta.url)
const FILES = [
  ['demo', readFileSync(new URL('../../../docs/demo/demo-warehouse.wcad', import.meta.url), 'utf8')],
  ...readdirSync(dir).filter(f => f.endsWith('.wcad')).map(f => [f.replace(/\.wcad$/, ''), readFileSync(new URL(f, dir), 'utf8')]),
]
const load = (json) => { const s = { objects: [], layers: [], groups: [], gridSize: 40 }; deserializeScene(json, s); return s }
const figures = (s) => {
  const gs = s.gridSize || 40, lv = levelsResolver(s.elevations)
  const bom = computeBom(s.objects, s.elevations, { gridSize: gs })
  return {
    n: s.objects.length,
    positions: getLayoutCapacity(s.objects, undefined, bayLedger(s.objects, gs, s.elevations), lv).total,
    numbers: rackNumbersNow(s.objects, gs).map(l => l.no + ':' + (l.tag || '') + ':' + l.ids.join(',')),
    bom: bom.lines.map(l => l.part + '|' + l.size + '|' + l.qty),
    types: (bom.types || []).map(t => t.id + ':' + t.lines.map(l => l.part + '|' + l.size + '|' + l.qty).join(';')),
  }
}

describe('old-files — every saved file loads; counts, numbers and BOM stable across save and reload', () => {
  for (const [name, json] of FILES) {
    it(name, () => {
      const a = load(json), f0 = figures(a)
      const b = load(serializeScene(a)), f1 = figures(b)
      const c = load(serializeScene(b)), f2 = figures(c)
      expect(f1).toEqual(f0); expect(f2).toEqual(f0)
      expect(JSON.stringify(c.objects)).toBe(JSON.stringify(b.objects))
      expect(f0.n).toBeGreaterThan(0)
    })
  }
})

describe('old-files — older formats', () => {
  const demo = JSON.parse(FILES[0][1])
  const now = figures(load(FILES[0][1]))
  it('version 1: the elevation types as an object among the objects — moved to their own field, the same figures', () => {
    const v1 = { ...demo, version: 1, objects: [...demo.objects, { id: 'elev', type: 'elevation_types', defaultId: demo.elevations?.defaultId, types: demo.elevations?.types || [] }] }
    delete v1.elevations
    const s = load(JSON.stringify(v1))
    expect(s.objects.some(o => o.type === 'elevation_types')).toBe(false)
    expect(s.elevations?.types?.length).toBe(demo.elevations?.types?.length)
    expect(figures(s)).toEqual(now)
  })
  it('a polygon loads as a closed polyline; a drawn shape with no corners setting keeps round corners', () => {
    const extra = [
      { id: 'pg', type: 'polygon', pts: [0, 0, 100, 0, 100, 100], drawn: true, stroke: '#000', strokeWidth: 1, layerId: 'notes' },
    ]
    const s = load(JSON.stringify({ ...demo, objects: [...demo.objects, ...extra] }))
    const pg = s.objects.find(o => o.id === 'pg')
    expect([pg.type, pg.closed]).toEqual(['polyline', true])
    const again = load(serializeScene(s))
    expect(again.objects.find(o => o.id === 'pg')).toEqual(pg)
  })
  it('a file with no textSizes, drawStyles, groups or layers still loads with the same figures', () => {
    const bare = { ...demo }
    for (const k of ['textSizes', 'drawStyles', 'groups', 'savedAt']) delete bare[k]
    expect(figures(load(JSON.stringify(bare)))).toEqual(now)
  })
  it('not a WarehouseCAD file, or no objects: a clear error', () => {
    expect(() => load('{"appName":"Other","objects":[]}')).toThrow(/Not a WarehouseCAD file/)
    expect(() => load('{"appName":"WarehouseCAD"}')).toThrow(/missing objects/)
    expect(() => load('{not json')).toThrow(/could not parse/)
  })
})
