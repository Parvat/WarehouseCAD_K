// DA — the equipment a fill or Generate was designed for (fill-design-aisle, utils/equipment.js areaProfile): each
// racking area keeps it (`equip`: a truck's key, or a Fill's Custom widths); Check, the aisle label colours and the X
// marks read a rack's equipment as its section's, else its area's, else the project's forklift (racks placed by hand).
import { describe, it, expect, vi } from 'vitest'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const RG = await import('../../generate/regenerate')
  const RA = await import('../../generate/rackingArea')
  const E = await import('../../utils/equipment')
  const { nanoid } = await import('nanoid')
  return { s: () => useCanvasStore.getState(), useCanvasStore, RG, RA, E, nanoid }
}

describe('DA — the designed-for equipment', () => {
  it('DA-store: Generate stores the truck it used on its racking area; a Fill’s Custom design is stored as its two widths (the space to move as much when left out)', async () => {
    const { s, RG, RA, nanoid } = await fresh()
    s().placeFpObject({ type: 'fp_rect', widthFt: 200, heightFt: 120 })
    const fp = s().objects.find(o => o.type === 'fp_rect')
    const r = RG.planRegenerate(s().objects, fp, { orientation: 'horizontal', beamIn: 96, palletWIn: 40, palletDIn: 48, mhe: 'counterbalance', aisleFt: 12.5, maxRunFt: 150, wallClearIn: 3, levels: 4 }, { gridSize: GS, newId: nanoid })
    expect(r.area.equip).toEqual({ key: 'counterbalance' })
    const box = { x: fp.x + 2 * GS, y: fp.y + 2 * GS, w: 100 * GS, h: 80 * GS }
    const made = RA.planAreaCreate(s().objects, box, { orientation: 'horizontal', mhe: 'reach', aisleFt: 6, travelFt: 6, equip: { custom: { pickFt: 6, moveFt: 6 } } }, { gridSize: GS, newId: nanoid })
    expect(made.area.equip).toEqual({ custom: { pickFt: 6, moveFt: 6 } })
  })

  it('DA-resolve: a rack’s equipment — its section’s (a section on the project forklift too) over its area’s stored design; else the area’s; else (by hand) the project forklift; the summary line per Custom design', async () => {
    const { E } = await fresh()
    const base = E.mheProfiles(null, null).reach
    const rack = (id, x, areaId) => ({ id, type: 'rack_row', x, y: 0, width: 400, height: 140, rotation: 0, beams: [96], areaId })
    const objects = [
      { id: 'A', type: 'racking_area', x: 0, y: 0, width: 2000, height: 400, equip: { custom: { pickFt: 6 } } },
      { id: 'G', type: 'racking_area', x: 0, y: 1000, width: 2000, height: 400, equip: { key: 'vna' } },
      rack('a1', 0, 'A'), rack('a2', 3000, 'A'), rack('g1', 0, 'G'), rack('h1', 6000, null),
      { id: 'S', type: 'section_area', shape: 'rect', x: 2900, y: -100, width: 800, height: 400, equipment: null },
    ]
    const R = E.equipmentResolver(objects, base)
    expect([R.of('a1').key, R.of('a2').key, R.of('g1').key, R.of('h1').key]).toEqual(['design:6/6', 'reach', 'vna', 'reach'])   // a2 is in section S (on the project forklift)
    expect([R.of('a1').aisleFt, R.of('a1').travelFt]).toEqual([6, 6])
    expect(E.designNotes(objects)).toEqual(['Designed for 6 ft aisles, equipment to be confirmed'])
    // the PDF check page lists it, even with nothing else to list
    const { buildCheckSheets } = await import('../../export/checkSheet')
    const pages = buildCheckSheets(null, { title: 't', notes: E.designNotes(objects) })
    expect([pages.length, /Designed for 6 ft aisles, equipment to be confirmed/.test(pages[0].svg)]).toEqual([1, true])
  })
})
