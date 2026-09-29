// Area LY — Layers: the six standard layers, their eye and padlock.
//
// Drives the REAL store and the real generateAndPlace entry, in both
// orientations. The canvas's Konva wiring cannot load in node, so what it
// decides is tested through the pure functions it calls (hitTest,
// fpWallHitTest, objectsInMarquee, snapTargets + computeSmartGuides, the PDF's
// buildLayoutSVG) and the wiring itself is read from source.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }

const LAYOUT_TYPES = { fp_rect: 'building', column_grid: 'columns', rack_double_row: 'racking', rack_row: 'racking', aisle: 'aisles' }

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { serializeScene, deserializeScene } = await import('../../utils/saveLoad')
  const L = await import('../../utils/layers')
  const { hitTest, fpWallHitTest, worldBoundsOf } = await import('../../canvas2/hitTest')
  const { objectsInMarquee } = await import('../../canvas2/selection')
  const { computeSmartGuides } = await import('../../canvas2/smartGuides')
  const { buildLayoutSVG } = await import('../../export/pdfExport')
  const { usableCapacity } = await import('../../generate/usableCapacity')
  return { useCanvasStore, generateAndPlace, serializeScene, deserializeScene, L, hitTest, fpWallHitTest, worldBoundsOf, objectsInMarquee, computeSmartGuides, buildLayoutSVG, usableCapacity }
}

const withLayer = (layers, id, patch) => layers.map(l => l.id === id ? { ...l, ...patch } : l)
const allOpen = (layers) => layers.map(l => ({ ...l, visible: true, locked: false }))
const noLabels = { showAisles: false, showMarks: false }

describe.each(['horizontal', 'vertical'])('LY — %s', (orientation) => {
  let m, st, fp, stopKeeper
  beforeEach(async () => {
    m = await fresh()
    m.L.installLayerKeeper(m.useCanvasStore)
    // the app's aisle keeper re-pairs aisles after Generate — it must keep them on Aisles
    const { installAisleKeeper } = await import('../../utils/aisleKeeper')
    const { nanoid } = await import('nanoid')
    stopKeeper?.(); stopKeeper = installAisleKeeper(m.useCanvasStore, nanoid)
    m.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    st = () => m.useCanvasStore.getState()
    fp = st().objects.find(o => o.type === 'fp_rect')
  })

  it('LY-assign: Generate puts every object on its layer — the building on Building, the column grid on Columns, racks on Racking, aisles on Aisles — stamped on the object itself; the list is the six standard layers', () => {
    const { layers, objects } = st()
    expect(layers.map(l => l.id)).toEqual(['building', 'columns', 'racking', 'aisles', 'checks', 'notes'])
    const seen = new Set()
    for (const o of objects) {
      const want = LAYOUT_TYPES[o.type]
      expect(want, o.type).toBeTruthy()
      expect(o.layerId, o.type).toBe(want)
      expect(m.L.layerOf(o, layers)).toBe(want)
      seen.add(want)
    }
    expect([...seen].sort()).toEqual(['aisles', 'building', 'columns', 'racking'])
  })

  it('LY-generate-locked: after Generate, Building and Columns are locked (and shown); the rest open. A press or drag on the building floor, or on its wall, picks nothing — the drag pans instead of moving the building', () => {
    const { layers, objects, gridSize } = st()
    const by = Object.fromEntries(layers.map(l => [l.id, l]))
    expect([by.building.locked, by.columns.locked, by.building.visible, by.columns.visible]).toEqual([true, true, true, true])
    for (const id of ['racking', 'aisles', 'checks', 'notes']) expect([by[id].visible, by[id].locked]).toEqual([true, false])
    // floor points that pick the building when it is unlocked
    const open = allOpen(layers), z = 0.2
    const floor = []
    for (let i = 1; i < 40 && floor.length < 12; i++) for (let j = 1; j < 20; j++) {
      const x = fp.x + (fp.width * i) / 40, y = fp.y + (fp.height * j) / 20
      if (m.hitTest(objects, open, x, y, z, gridSize) === fp.id) floor.push({ x, y })
    }
    expect(floor.length).toBeGreaterThan(3)
    for (const p of floor) expect(m.hitTest(objects, layers, p.x, p.y, z, gridSize)).toBe(null)
    // its wall: grabbed when unlocked, not when locked
    const wall = { x: fp.x, y: fp.y + fp.height / 2 }
    expect(m.fpWallHitTest(objects, open, wall.x, wall.y, z, gridSize)?.objId).toBe(fp.id)
    expect(m.fpWallHitTest(objects, layers, wall.x, wall.y, z, gridSize)).toBe(null)
    // a column square: picked when Columns is unlocked, not locked
    const grid = objects.find(o => o.type === 'column_grid')
    const xs = [grid.x], ys = [grid.y]
    for (const s of grid.spacingX || []) xs.push(xs[xs.length - 1] + s)
    for (const s of grid.spacingY || []) ys.push(ys[ys.length - 1] + s)
    const onlyColumnsOpen = withLayer(open, 'building', { locked: true })
    const c = xs.flatMap(x => ys.map(y => ({ x: x + (grid.columnW || gridSize) / 2, y: y + (grid.columnH || gridSize) / 2 })))
      .find(p => m.hitTest(objects, onlyColumnsOpen, p.x, p.y, z, gridSize) === grid.id)
    expect(c).toBeTruthy()
    expect(m.hitTest(objects, layers, c.x, c.y, z, gridSize)).not.toBe(grid.id)
  })

  it('LY-locked: a locked layer is drawn, printed and still snapped to, but not pickable or caught by a marquee — Racking locked: no rack picked or marqueed; Building and Columns locked: a rack dragged to the wall or a column still gets its guide; hidden: no guide', () => {
    const { layers, objects, gridSize } = st()
    const rack = objects.find(o => o.type === 'rack_double_row')
    const b = { x: rack.x + rack.width / 2, y: rack.y + rack.height / 2 }
    const racksLocked = withLayer(layers, 'racking', { locked: true })
    expect(m.hitTest(objects, layers, b.x, b.y, 1, gridSize)).toBe(rack.id)
    expect(m.hitTest(objects, racksLocked, b.x, b.y, 1, gridSize)).not.toBe(rack.id)
    const all = { x: fp.x - 10, y: fp.y - 10, width: fp.width + 20, height: fp.height + 20 }
    const caught = (ls) => m.objectsInMarquee(objects, all, { isVisible: m.L.pickableIn(ls) }).map(id => objects.find(o => o.id === id).type)
    expect(caught(layers).filter(t => t.startsWith('rack_')).length).toBe(objects.filter(o => o.type.startsWith('rack_')).length)
    expect(caught(racksLocked).filter(t => t.startsWith('rack_'))).toEqual([])
    // locked still draws and prints
    expect(m.L.isShown(racksLocked, rack)).toBe(true)
    expect(m.buildLayoutSVG(objects, racksLocked, gridSize, { labels: noLabels }).svg).toBe(m.buildLayoutSVG(objects, layers, gridSize, { labels: noLabels }).svg)
    // snap: drag the rack so its left edge sits 3 px from the building's left wall
    const moved = new Set([rack.id])
    const dx = fp.x + 3 - rack.x
    const wallGuides = (ls) => m.computeSmartGuides([rack.id], m.L.snapTargets(objects, ls, moved), gridSize, 1, dx, 0).guides.filter(g => g.isWall)
    const open = allOpen(layers)
    expect(wallGuides(open).length).toBeGreaterThan(0)
    expect(wallGuides(layers)).toEqual(wallGuides(open))                // Building locked after Generate: the same guide
    expect(wallGuides(withLayer(layers, 'building', { visible: false })).filter(g => g.axis === 'x' && Math.abs(g.val - fp.x) < 1)).toEqual([])   // hidden: no wall guide
    const targets = m.L.snapTargets(objects, layers, moved)
    expect(targets.some(o => o.type === 'fp_rect') && targets.some(o => o.type === 'column_grid')).toBe(true)
    // a column: Building hidden so only the grid can give a purple guide; Columns locked still does, hidden doesn't
    const grid = objects.find(o => o.type === 'column_grid')
    const faceR = grid.x + (grid.spacingX || [0])[0] + (grid.columnW || gridSize) / 2   // a column's right face (lines run through column centres)
    const rb = m.worldBoundsOf(rack, objects)
    const colGuides = (ls) => m.computeSmartGuides([rack.id], m.L.snapTargets(objects, ls, moved), gridSize, 1, faceR + 3 - rb.x, 0).guides.filter(g => g.isWall && g.axis === 'x' && Math.abs(g.val - faceR) < 1)
    const noBuilding = withLayer(layers, 'building', { visible: false })
    expect(colGuides(noBuilding).length).toBeGreaterThan(0)            // Columns locked
    expect(colGuides(withLayer(noBuilding, 'columns', { visible: false }))).toEqual([])
  })

  it('LY-undo: a layer change is one undo step — undo and redo restore the eye and padlock; each undo entry carries the layers; one more undo goes back before Generate', () => {
    const s = () => m.useCanvasStore.getState()
    const state = () => s().layers.map(l => [l.id, l.visible, l.locked].join(':')).join(' ')
    const gen = state()
    m.L.setLayer(m.useCanvasStore, 'racking', { visible: false })
    const hid = state()
    m.L.setLayer(m.useCanvasStore, 'building', { locked: false })
    const unlocked = state()
    expect(hid).not.toBe(gen)
    expect(unlocked).not.toBe(hid)
    const objects = s().objects
    s().undo(); expect(state()).toBe(hid)
    s().undo(); expect(state()).toBe(gen)
    expect(s().objects).toEqual(objects)                              // a layer step changes no object
    s().redo(); expect(state()).toBe(hid)
    s().redo(); expect(state()).toBe(unlocked)
    // every undo entry carries its layers
    expect(JSON.parse(s().history[s().historyIndex]).layers).toEqual(s().layers)
    // Generate is one step (GU): one more Ctrl+Z goes back before it — no
    // objects, Building no longer locked
    s().undo(); s().undo(); s().undo()
    expect(s().objects).toEqual([])
    expect(s().layers.find(l => l.id === 'building').locked).toBe(false)
  })

  it('LY-hidden: a hidden layer is not drawn, not pickable and not in the PDF — each layer in turn prints exactly as the layout without its objects', () => {
    const { layers, objects, gridSize } = st()
    const open = allOpen(layers)
    for (const id of ['building', 'columns', 'racking', 'aisles']) {
      const hidden = withLayer(open, id, { visible: false })
      const on = objects.filter(o => m.L.layerOf(o, layers) === id)
      expect(on.length, id).toBeGreaterThan(0)
      for (const o of on) {
        expect(m.L.isShown(hidden, o)).toBe(false)
        expect(m.L.isPickable(hidden, o)).toBe(false)
      }
      const without = objects.filter(o => m.L.layerOf(o, layers) !== id)
      expect(m.buildLayoutSVG(objects, hidden, gridSize, { labels: noLabels }).svg, id)
        .toBe(m.buildLayoutSVG(without, open, gridSize, { labels: noLabels }).svg)
    }
    // a hidden rack is not picked
    const rack = objects.find(o => o.type === 'rack_double_row'), c = { x: rack.x + rack.width / 2, y: rack.y + rack.height / 2 }
    expect(m.hitTest(objects, withLayer(open, 'racking', { visible: false }), c.x, c.y, 1, gridSize)).not.toBe(rack.id)
    // Aisles hidden: no aisle or cross-aisle labels in the PDF
    const lab = { showAisles: true, showMarks: false }
    expect(m.buildLayoutSVG(objects, withLayer(open, 'aisles', { visible: false }), gridSize, { labels: lab }).svg)
      .toBe(m.buildLayoutSVG(objects, open, gridSize, { labels: noLabels }).svg)
    expect(m.buildLayoutSVG(objects, open, gridSize, { labels: lab }).svg)
      .not.toBe(m.buildLayoutSVG(objects, open, gridSize, { labels: noLabels }).svg)
    // the canvas: Scene draws through the same rule
    const scene = readFileSync('src/canvas2/Scene.jsx', 'utf8')
    expect(scene).toMatch(/const isVisible = useMemo\(\(\) => shownIn\(layers\), \[layers\]\)/)
    expect(scene).toMatch(/if \(!o \|\| !isVisible\(o\)\) continue/)
  })

  it('LY-checks: Checks hidden draws no marks — no X marks, red aisle warnings, upright flags or column clearance arrows/labels, on the canvas or in the PDF — while capacity and usable are unchanged', () => {
    const { layers, objects, gridSize } = st()
    const shown = m.buildLayoutSVG(objects, layers, gridSize, { labels: { showAisles: false } }).svg
    const hidden = m.buildLayoutSVG(objects, withLayer(layers, 'checks', { visible: false }), gridSize, { labels: { showAisles: false } }).svg
    expect(shown).not.toBe(hidden)                                      // this layout has marks to hide
    expect(hidden).toBe(m.buildLayoutSVG(objects, layers, gridSize, { labels: { showAisles: false, showMarks: false } }).svg)
    // capacity: worked out from the objects alone — no layer is an input
    const cap = (s) => m.usableCapacity(s.objects, { gridSize: s.gridSize })
    const before = cap(st())
    m.L.setLayer(m.useCanvasStore, 'checks', { visible: false })
    expect(st().layers.find(l => l.id === 'checks').visible).toBe(false)
    expect(cap(st())).toEqual(before)
    for (const f of ['src/generate/usableCapacity.js', 'src/generate/useColumnCheck.jsx', 'src/generate/columnCheck.js']) expect(readFileSync(f, 'utf8')).not.toMatch(/\blayers\b|layerShown|isShown/)
    // the canvas: every mark behind marksOn = the column check's showMarks AND the Checks layer
    const ov = readFileSync('src/canvas2/Overlays.jsx', 'utf8')
    expect(ov).toMatch(/const marksOn = showMarks && layerShown\(layers, 'checks'\)/)
    expect(ov).toMatch(/const aislesOn = showAisles && layerShown\(layers, 'aisles'\)/)
    for (const comp of ['ColumnClearanceLabels', 'BlockedFaceMarks', 'UprightConflictMarks', 'OversizedBayMarks']) expect(ov).toMatch(new RegExp('\\{marksOn && <' + comp + ' '))
    for (const comp of ['CrossAisleLabels']) expect(ov).toMatch(new RegExp('\\{aislesOn && <' + comp + ' '))
  })

  it('LY-select: locking or hiding a layer drops its objects from the selection, so nothing locked can be dragged; select-all and a drag take only pickable objects', () => {
    const rack = st().objects.find(o => o.type === 'rack_double_row')
    st().selectGroup([rack.id])
    m.L.setLayer(m.useCanvasStore, 'racking', { locked: true })
    expect(st().selectedIds).toEqual([])
    m.L.setLayer(m.useCanvasStore, 'racking', { locked: false })
    st().selectGroup([rack.id])
    m.L.setLayer(m.useCanvasStore, 'racking', { visible: false })
    expect(st().selectedIds).toEqual([])
    const ci = readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')
    expect(ci).toMatch(/const ok = pickableIn\(st\.layers\)\r?\n\s*if \(!ok\(grabbed\)\) return\r?\n\s*const ids = st\.selectedIds\.filter/)   // \r?: a fresh checkout is CRLF
    expect(ci).toMatch(/objectsInMarquee\(st\.objects, rect, \{ isVisible: ok \}\)/)
    expect(ci).toMatch(/bayEntriesInMarquee\(st\.objects\.filter\(ok\), rect/)
    expect(ci.match(/computeSmartGuides\(\s*d\.ids, snapTargets\(/g)).toHaveLength(2)
    expect(readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')).toMatch(/const ids = st\.objects\.filter\(ok\)\.map\(o => o\.id\)/)
  })

  it('LY-save: layer state is saved with the layout and survives a reload; an older layout (the old five layers) loads onto the six', async () => {
    m.L.setLayer(m.useCanvasStore, 'notes', { visible: false })
    m.L.setLayer(m.useCanvasStore, 'building', { locked: false })
    m.L.setLayer(m.useCanvasStore, 'racking', { locked: true })
    const want = st().layers.map(l => [l.id, l.visible, l.locked])
    const saved = m.serializeScene(st())
    const m2 = await fresh()
    m2.L.installLayerKeeper(m2.useCanvasStore)
    m2.useCanvasStore.setState((s) => { m2.deserializeScene(saved, s) })
    expect(m2.useCanvasStore.getState().layers.map(l => [l.id, l.visible, l.locked])).toEqual(want)
    // an older file: its own layer list, layerIds 'racks' / 'structural'
    const old = JSON.parse(saved)
    old.layers = [{ id: 'structural', name: 'Structural', visible: true, locked: false }, { id: 'racks', name: 'Racks & Storage', visible: true, locked: false }]
    old.objects = old.objects.map(o => ({ ...o, layerId: o.type.startsWith('rack_') ? 'racks' : 'structural' }))
    m2.useCanvasStore.setState((s) => { m2.deserializeScene(JSON.stringify(old), s) })
    const s2 = m2.useCanvasStore.getState()
    expect(m2.L.isStandard(s2.layers)).toBe(true)
    for (const o of s2.objects) expect(m2.L.layerOf(o, s2.layers)).toBe(LAYOUT_TYPES[o.type])
  })
})

describe('LY — hand-placed objects and the panel', () => {
  it('LY-hand: a hand-placed object goes on the layer its type belongs on', async () => {
    const { layerForType } = await import('../../utils/layers')
    const want = {
      fp_rect: 'building', fp_l: 'building', struct_loading_dock: 'building', struct_partition: 'building',
      column_grid: 'columns', struct_column: 'columns',
      rack_row: 'racking', rack_double_row: 'racking', rack_cantilever: 'racking', mhe_forklift: 'racking',
      aisle: 'aisles',
      text: 'notes', annot_dimension: 'notes', line: 'notes', freehand: 'notes', rect: 'notes',
    }
    for (const [t, l] of Object.entries(want)) expect(layerForType(t), t).toBe(l)
    for (const f of ['FloatingToolbar', 'WarehouseObjectPicker']) {
      const src = readFileSync(`src/components/LeftPanel/${f}.jsx`, 'utf8')
      expect(src).toMatch(/layerId: ?layerForType\(item\.type\)/)
      expect(src).not.toMatch(/layerId: ?activeLayerId/)
    }
  })

  it('LY-panel: the Layers panel lists the six with an eye and a padlock each, both through setLayer; no add, rename or delete (custom layers later)', () => {
    const src = readFileSync('src/components/RightPanel/LayerPanel.jsx', 'utf8')
    expect(src).toMatch(/aria-label=\{`\$\{hidden \? 'Show' : 'Hide'\} \$\{layer\.name\} layer`\}/)
    expect(src).toMatch(/aria-label=\{`\$\{locked \? 'Unlock' : 'Lock'\} \$\{layer\.name\} layer`\}/)
    expect(src).toMatch(/setLayer\(useCanvasStore, layer\.id, \{ visible: hidden \}\)/)
    expect(src).toMatch(/setLayer\(useCanvasStore, layer\.id, \{ locked: !locked \}\)/)
    expect(src).not.toMatch(/addLayer|deleteLayer|rename/)
  })
})
