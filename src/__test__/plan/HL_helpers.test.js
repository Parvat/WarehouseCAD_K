// HL — nothing on the plan is invisible but selectable; Ctrl+A takes only real layout objects.
//
// The bug (studio-card-a, a real layout after Generate): Ctrl+A drew three outlines around things that were otherwise
// not drawn —
//   - a purple dashed box wider than the building: the multi-selection outline (canvas2/groupRotate.js), not an
//     object. The aisles Ctrl+A took have no rotation, the vertical racks are at 90°, and their world boxes were read
//     as if already in the racks' turned frame — every aisle laid sideways.
//   - a light blue box round the building: the building outline (fp_rect) and the Regenerate racking area, whose
//     dashed edge ran along the inner wall and hid under it.
//   - a blue box round a middle block of rows: the column grid's frame (a real object: its columns are drawn).
// Now: Ctrl+A takes no helper (utils/layers.js isHelper — building outline, aisle, racking area, elevation types);
// a racking area is drawn faintly as the Fill box is in the mockup and still picked on its edge; the group outline
// carries a member's world box into the group's frame; a delete takes the racking area it empties.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const { generateAndPlace, regenerateRacking } = await import('../../generate/traceGenerate')
  const L = await import('../../utils/layers')
  const { computeGroupOutline } = await import('../../canvas2/groupRotate')
  const { boundsOf } = await import('../../canvas2/hitTest')
  const D = await import('../../utils/deleteSelection')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { nanoid } = await import('nanoid')
  return { useCanvasStore, generateAndPlace, regenerateRacking, L, computeGroupOutline, boundsOf, D, installAisleKeeper, nanoid }
}
const allOpen = (layers) => layers.map(l => ({ ...l, visible: true, locked: false }))
const types = (list) => [...new Set(list.map(o => o.type))].sort()

describe.each(['horizontal', 'vertical'])('HL — %s', (orientation) => {
  let m, st, stop
  beforeEach(async () => {
    m = await fresh()
    m.L.installLayerKeeper(m.useCanvasStore)
    stop?.(); stop = m.installAisleKeeper(m.useCanvasStore, m.nanoid)
    m.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    st = () => m.useCanvasStore.getState()
  })

  it('HL-ctrlA: Ctrl+A takes every real layout object — racks, zones, walls, doors, columns, equipment, text, dimensions — and never a helper (building outline, aisle, racking area), even with every layer unlocked; after Regenerate too', () => {
    expect(m.regenerateRacking({ orientation })).toBeTruthy()
    const fp = st().objects.find(o => o.type === 'fp_rect')
    const extra = [
      { id: 'z', type: 'zone_office', x: fp.x + 40, y: fp.y + 40, width: 400, height: 400 },
      { id: 'w', type: 'struct_partition', x: fp.x, y: fp.y, width: 400, height: 10 },
      { id: 'd', type: 'struct_loading_dock', x: fp.x, y: fp.y, width: 120, height: 40 },
      { id: 'c', type: 'struct_column', x: 0, y: 0, width: 40, height: 40 },
      { id: 'f', type: 'mhe_forklift', x: 0, y: 0, width: 40, height: 80 },
      { id: 't', type: 'text', x: 0, y: 0, text: 'Hi' },
      { id: 'n', type: 'annot_dimension', x1: 0, y1: 0, x2: 400, y2: 0 },
    ]
    m.useCanvasStore.setState({ objects: [...st().objects, ...extra], layers: allOpen(st().layers) })
    const { objects, layers } = st()
    expect(types(objects)).toEqual(expect.arrayContaining(['aisle', 'column_grid', 'fp_rect', 'racking_area']))
    const ids = new Set(m.L.selectAllIds(objects, layers)), picked = objects.filter(o => ids.has(o.id))
    expect(picked.filter(m.L.isHelper).map(o => o.type)).toEqual([])
    expect(types(picked)).toEqual(['annot_dimension', 'column_grid', 'mhe_forklift', 'rack_double_row', 'rack_row', 'struct_column', 'struct_loading_dock', 'struct_partition', 'text', 'zone_office'].filter(t => objects.some(o => o.type === t)))
    expect(objects.filter(o => !m.L.isHelper(o) && !ids.has(o.id))).toEqual([])            // nothing real left out
    // locked layers still keep theirs (Generate locks Columns): and the key uses this one function
    expect(m.L.selectAllIds(objects, layers.map(l => l.id === 'columns' ? { ...l, locked: true } : l)).includes(objects.find(o => o.type === 'column_grid').id)).toBe(false)
    expect(read('hooks/useKeyboardShortcuts.js')).toMatch(/case 'a':[\s\S]{0,400}const ids = selectAllIds\(st\.objects, st\.layers\)/)
  })

  it('HL-outline: the multi-selection outline of racks and aisles stays on the racks — never wider or taller than the building (vertical racks at 90°, aisles at 0°)', () => {
    m.useCanvasStore.setState({ layers: allOpen(st().layers) })
    const { objects } = st(), fp = objects.find(o => o.type === 'fp_rect'), b = m.boundsOf(fp)
    const sel = objects.filter(o => o.type.startsWith('rack_') || o.type === 'aisle')
    expect(sel.some(o => o.type === 'aisle')).toBe(true)
    const g = m.computeGroupOutline(sel, 0.1, objects), turned = Math.abs(g.R % 180) === 90
    const w = turned ? g.maxY - g.minY : g.maxX - g.minX, h = turned ? g.maxX - g.minX : g.maxY - g.minY
    expect([w <= b.width, h <= b.height]).toEqual([true, true])
    // the racks alone give the same size of box: an aisle sits between two of them, so it never widens it (its
    // corners can shift a hair — the aisles move the group's centre, the frame's pivot)
    const racksOnly = m.computeGroupOutline(sel.filter(o => o.type !== 'aisle'), 0.1, objects)
    expect([g.maxX - g.minX, g.maxY - g.minY].map(Math.round)).toEqual([racksOnly.maxX - racksOnly.minX, racksOnly.maxY - racksOnly.minY].map(Math.round))
  })

  it('HL-delete: Ctrl+A + Delete after Regenerate clears the racks, their aisles and the racking area they emptied — one undo brings all back; a delete that leaves the area a rack keeps it', () => {
    m.regenerateRacking({ orientation })
    const before = st().objects.length, area = st().objects.find(o => o.type === 'racking_area')
    expect(area).toBeTruthy()
    // part of its racks: the area stays (it keeps its record of the racks removed by hand)
    const some = st().objects.filter(o => o.areaId === area.id).slice(0, 2).map(o => o.id)
    expect(m.D.areasEmptiedBy(st().objects, some)).toEqual([])
    st().selectGroup(m.L.selectAllIds(st().objects, st().layers))
    expect(m.D.areasEmptiedBy(st().objects, st().selectedIds)).toEqual([area.id])
    m.D.deleteSelectionWithAreas(m.useCanvasStore)
    expect(types(st().objects)).toEqual(['column_grid', 'fp_rect'])
    st().undo()
    expect(st().objects.length).toBe(before)
    // every Delete in the app goes through it: the key and the card's buttons
    expect(read('hooks/useKeyboardShortcuts.js')).toMatch(/deleteSelectionWithAreas\(useCanvasStore\)/)
    const pp = read('components/RightPanel/PropertiesPanel.jsx')
    expect([(pp.match(/onClick=\{\(\) => deleteSelectionWithAreas\(useCanvasStore\)\}/g) || []).length, /onClick=\{deleteSelected\}/.test(pp)]).toEqual([3, false])
  })
})

describe('HL — drawn', () => {
  it('HL-drawn: a racking area is drawn faintly as the Fill box in the mockup (fill #7BD3A4 6%, edge #2E7D5B 1.5 dashed 6 4) and picked on its edge only; the scene skips no object but the elevation types, a helper Ctrl+A never takes', async () => {
    const sh = read('canvas2/shapes.jsx'), area = sh.slice(sh.indexOf('function RackingAreaShapeView'), sh.indexOf('export const RackingAreaShape') > 0 ? sh.indexOf('/** A zone:') : undefined)
    expect(area).toMatch(/fill="#7BD3A4" opacity=\{0\.06\} perfectDrawEnabled=\{false\} listening=\{false\}/)
    expect(area).toMatch(/stroke="#2E7D5B" strokeWidth=\{1\.5\}\s+dash=\{\[6, 4\]\} strokeScaleEnabled=\{false\}/)
    expect(read('../design/studio/Studio.dc.html')).toMatch(/fill="#7BD3A4" fill-opacity="\.06" stroke="#2E7D5B" stroke-width="1\.5" stroke-dasharray="6 4"/)
    expect(read('canvas2/hitTest.js')).toMatch(/if \(obj\.type === 'racking_area'\) \{/)            // picked on its outline
    // every object the scene does not draw is a helper Ctrl+A never takes
    const scene = read('canvas2/Scene.jsx'), skipped = [...scene.matchAll(/if \(o\.type === '([a-z_]+)'\) continue/g)].map(x => x[1])
    expect(skipped).toEqual(['elevation_types'])
    const L = await import('../../utils/layers')
    for (const t of skipped) expect([t, L.isHelper({ type: t })]).toEqual([t, true])
    for (const t of ['fp_rect', 'fp_l', 'aisle', 'racking_area']) expect([t, L.isHelper({ type: t })]).toEqual([t, true])
    for (const t of ['rack_row', 'zone_office', 'column_grid', 'struct_partition', 'struct_egress', 'mhe_forklift', 'text', 'annot_dimension', 'rect']) expect([t, L.isHelper({ type: t })]).toEqual([t, false])
  })
})
