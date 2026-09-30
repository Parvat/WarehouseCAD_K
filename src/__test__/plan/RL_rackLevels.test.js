// Area RL — every beam rack has levels: 4 unless set.
//
// Capacity, usable, the column check and the headline all read `levels || 1`,
// so a hand-placed rack (left panel, and paste / duplicate of one) with no
// levels value counted as ONE level while generated racks carry 4. New racks
// are stamped with 4 where they are placed, and a keeper fills 4 on any rack
// still missing it (a loaded older layout, any other path). A rack that has a
// levels value keeps it. Real store, the app's keepers; both orientations.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R, GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { serializeScene, deserializeScene } = await import('../../utils/saveLoad')
  const { installLevelsKeeper, levelsFor, DEFAULT_LEVELS } = await import('../../utils/rackLevels')
  const { installLayerKeeper } = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { pasteAt } = await import('../../utils/pasteAt')
  const { movePlacement, commitPlacement } = await import('../../utils/placement')
  const { getRackCapacity } = await import('../../utils/capacity')
  const { usableCapacity } = await import('../../generate/usableCapacity')
  const { nanoid } = await import('nanoid')
  installLayerKeeper(useCanvasStore); installAisleKeeper(useCanvasStore, nanoid); installLevelsKeeper(useCanvasStore)
  return { useCanvasStore, generateAndPlace, serializeScene, deserializeScene, levelsFor, DEFAULT_LEVELS, pasteAt, movePlacement, commitPlacement, getRackCapacity, usableCapacity, nanoid }
}

/* A double row the left panel would place: 3 × 96" bays, centred on the
   world origin — where the test's column stands — at 0° or 90°. */
const handRack = (rotation, extra = {}) => {
  const width = ((3 * 4 + 3 * 96) / 12) * GS, height = ((42 * 2 + 9) / 12) * GS
  return { type: 'rack_double_row', x: -width / 2, y: -height / 2, width, height, rotation, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42, flueSpaceIn: 9, palletWIn: 40, ...extra }
}

describe.each(['horizontal', 'vertical'])('RL — %s', (orientation) => {
  const rot = orientation === 'vertical' ? 90 : 0
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })

  it('RL-placed: a rack placed from the left panel has 4 levels, and capacity = ground positions × 4 — per rack, gross, usable and the column check\'s losses', () => {
    expect(m.DEFAULT_LEVELS).toBe(4)
    // a generated layout; one of its racks that a column costs positions is
    // deleted and a rack of the same shape placed there by hand
    m.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const lostOf = (objs) => { const u = m.usableCapacity(objs, { gridSize: GS }); return u.gross - u.usable }
    const gen = s().objects, base = lostOf(gen)
    const hit = gen.find(o => o.type === 'rack_double_row' && lostOf(gen.map(q => q.id === o.id ? { ...q, levels: 1 } : q)) !== base)
    expect(hit).toBeTruthy()
    const { id, levels, genSection, rowIndex, parentId, layerId, ...shape } = hit    // eslint-disable-line no-unused-vars
    m.useCanvasStore.setState({ objects: gen.filter(o => o.id !== hit.id) })
    const without = s().objects
    s().addObject({ ...shape, ...m.levelsFor('rack_double_row') })
    const rack = s().objects.find(o => !without.includes(o) && o.type === 'rack_double_row')
    expect(rack.levels).toBe(4)
    const cap = m.getRackCapacity(rack)
    expect(cap.levels).toBe(4)
    expect(cap.total).toBe(cap.groundTotal * 4)
    // gross, usable and the column check's losses all count it at 4 levels
    const four = s().objects, one = four.map(o => o.id === rack.id ? { ...o, levels: 1 } : o)
    const u0 = m.usableCapacity(without, { gridSize: GS }), u4 = m.usableCapacity(four, { gridSize: GS }), u1 = m.usableCapacity(one, { gridSize: GS })
    expect(u4.gross - u0.gross).toBe(cap.groundTotal * 4)
    expect(u1.gross - u0.gross).toBe(cap.groundTotal)
    const lost1 = lostOf(one) - lostOf(without), lost4 = lostOf(four) - lostOf(without)
    expect(lost1).toBeGreaterThan(0)                                  // the column costs it positions
    expect(lost4).toBe(lost1 * 4)
    // the headline for this layout is the generated one again: same rack, same 4 levels
    expect(u4.gross).toBe(m.usableCapacity(gen, { gridSize: GS }).gross)
    // both left-panel placers stamp it (their placement code is JSX-bound)
    for (const f of ['FloatingToolbar', 'WarehouseObjectPicker']) expect(readFileSync(`src/components/LeftPanel/${f}.jsx`, 'utf8')).toMatch(/\.\.\.levelsFor\(item\.type\),/)
    expect(m.levelsFor('rack_row')).toEqual({ levels: 4 })
    expect(m.levelsFor('text')).toEqual({})
  })

  it('RL-missing: a rack that arrives with no levels (any other path) gets 4; a rack with a levels value keeps it', () => {
    s().addObject(handRack(rot))
    s().addObject({ ...handRack(rot), x: 3000, levels: 2 })
    s().addObject({ type: 'rack_row', x: 0, y: 2000, width: 1000, height: 140, rotation: rot, beams: [96, 96, 96], uprightWidth: 3, depthIn: 42 })
    const racks = s().objects.filter(o => o.type.startsWith('rack_'))
    expect(racks.map(o => o.levels)).toEqual([4, 2, 4])
    const gross = m.usableCapacity(s().objects, { gridSize: GS }).gross
    expect(gross).toBe(racks.reduce((t, o) => t + m.getRackCapacity(o).groundTotal * o.levels, 0))
  })

  it('RL-load: an older layout whose hand-placed racks have no levels loads with 4 — capacity counts them at 4; a generated rack\'s 4 and a set value stay', async () => {
    m.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    s().addObject({ ...handRack(rot), x: -40000, levels: 3 })
    const saved = JSON.parse(m.serializeScene(s()))
    const gen = saved.objects.filter(o => o.type === 'rack_double_row' && o.levels === 4).length
    expect(gen).toBeGreaterThan(0)
    // the older file: one hand-placed rack with no levels at all
    saved.objects.push({ ...handRack(rot), id: 'old-hand', x: 40000 })
    delete saved.objects[saved.objects.length - 1].levels
    const m2 = await fresh()
    m2.useCanvasStore.setState((st) => { m2.deserializeScene(JSON.stringify(saved), st) })
    const objs = m2.useCanvasStore.getState().objects
    const old = objs.find(o => o.id === 'old-hand')
    expect(old.levels).toBe(4)
    expect(objs.filter(o => o.type === 'rack_double_row' && o.levels === 3)).toHaveLength(1)
    expect(objs.filter(o => o.type === 'rack_double_row' && o.levels === 4)).toHaveLength(gen + 1)
    const c = m2.getRackCapacity(old)
    expect(c.total).toBe(c.groundTotal * 4)
  })

  it('RL-paste: pasted and duplicated racks keep their source\'s levels (6 stays 6, 4 stays 4)', () => {
    // inside an empty hand-drawn building (a row can only be placed in one)
    s().placeFpObject({ type: 'fp_rect', widthFt: 400, heightFt: 400 })
    s().addObject(handRack(rot, { levels: 6 }))
    s().addObject({ ...handRack(rot), x: 3000, levels: 4 })
    const [six, four] = s().objects.filter(o => o.type === 'rack_double_row')
    for (const [src, mode] of [[six, 'nudge'], [four, 'nudge'], [six, 'inPlace'], [four, 'inPlace']]) {
      s().selectGroup([src.id]); s().copySelected()
      const before = new Set(s().objects.map(o => o.id))
      m.pasteAt(m.useCanvasStore, mode, m.nanoid)
      if (mode !== 'inPlace') { m.movePlacement(m.useCanvasStore, { x: -3000 + 1500 * s().objects.length, y: 3000 }, 1); expect(m.commitPlacement(m.useCanvasStore)).toBe(true) }
      const added = s().objects.filter(o => !before.has(o.id) && o.type === 'rack_double_row')
      expect(added, mode).toHaveLength(1)
      expect(added[0].levels).toBe(src.levels)
    }
  })
})
