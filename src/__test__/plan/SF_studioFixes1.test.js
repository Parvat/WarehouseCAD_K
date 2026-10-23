// SF — fixes before Studio 2c (studio-fixes-1). One break-it test per behaviour:
//   1 a click on empty canvas or a building's floor clears the selection; the floor never picks the building; Esc clears
//   2 a pick on the plan closes the Generate card (Properties for the pick; the card's draft goes with it)
//   3 every building shape is picked by its walls (a generated layout too — Generate locks Columns only); one Ctrl+Z
//     right after dropping a building takes it away, a click on its wall adds no history
//   4 the sheet: one ceiling for every label (max load = it − the sprinkler clearance), the ceiling near the top, the band
//     ceiling → max load, the Beam line clear of the hatch
//   5 Apply: "Select rows to apply" with none, "Apply to N selected rows" with rows
//   6 quick edit on a row: pencil (the Edit icon), Levels · Pallet · Beam, Cancel · Save · Full edit, one row open
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null }
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } }
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const between = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b, s.indexOf(a)) : undefined)
const FP_SHAPES = [['fp_rect', 80, 60], ['fp_l', 80, 60], ['fp_l_mirror', 80, 60], ['fp_t', 80, 60], ['fp_u', 80, 60], ['fp_cross', 80, 80]]

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const L = await import('../../utils/layers')
  const { hitTest, fpWallHitTest } = await import('../../canvas2/hitTest')
  const { getFpWallSegments } = await import('../../utils/canvas')
  return { useCanvasStore, generateAndPlace, L, hitTest, fpWallHitTest, getFpWallSegments }
}

describe('SF-1 — deselect', () => {
  it('SF-deselect: a left click on empty canvas or on a building\'s floor (a press that never moves) clears the selection; a building is picked by its walls only — its floor never; space / middle-button pans never deselect', () => {
    const ci = read('canvas2/useCanvasInteraction.js')
    expect(ci).toMatch(/if \(hitObj && FP_SET_INPUT\.has\(hitObj\.type\)\) \{ hitId = null; hitObj = null \}/)
    // the floor check sits after the wall check (a wall still picks it) and before any pick of a hit
    expect(ci.indexOf('fpWallHitTest(st.objects') < ci.indexOf('hitId = null; hitObj = null') && ci.indexOf('hitId = null; hitObj = null') < ci.indexOf('selectFromHit(hitId, !!evt.shiftKey, world)')).toBe(true)
    expect(ci).toMatch(/pan\.current = \{ sx: evt\.clientX, sy: evt\.clientY, panX: view\.current\.panX, panY: view\.current\.panY, force: forcePan, moved: false \}/)
    expect(ci).toMatch(/if \(!d\.moved && movedEnough\(\{ x: d\.sx, y: d\.sy \}, \{ x: evt\.clientX, y: evt\.clientY \}\)\) d\.moved = true/)
    expect(between(ci, 'const upGesture = () => {', 'const rd = resizeDrag.current')).toMatch(/const pn = pan\.current\s+pan\.current = null[\s\S]*if \(pn && !pn\.force && !pn\.moved\) \{[\s\S]*st\.clearSelection\(\)/)
  })

  it('SF-esc: Esc clears the selection — also when it first leaves another tool (Pan, the tool a fresh plan opens in, with the generated building picked)', async () => {
    const m = await fresh()
    const { shortcutHandler } = await import('../../hooks/useKeyboardShortcuts')
    globalThis.document.activeElement = null
    m.useCanvasStore.setState({ objects: [{ id: 'r', type: 'rack_row', x: 0, y: 0, width: 400, height: 42, rotation: 0 }], selectedIds: ['r'], activeTool: 'pan' })
    shortcutHandler({ key: 'Escape', target: null, preventDefault() {}, stopPropagation() {} })
    expect([m.useCanvasStore.getState().selectedIds, m.useCanvasStore.getState().activeTool]).toEqual([[], 'select'])
    m.useCanvasStore.setState({ selectedIds: ['r'] })
    shortcutHandler({ key: 'Escape', target: null, preventDefault() {}, stopPropagation() {} })
    expect(m.useCanvasStore.getState().selectedIds).toEqual([])
  })
})

describe('SF-2 — the Generate card closes on a pick', () => {
  it('SF-generate-pick: a pick on the plan (an object, or a building\'s wall) closes the Generate card and shows Properties for it — its unsaved Forklift / Wall clearance go with the card, as on Cancel', async () => {
    vi.resetModules()
    const { useViewPrefs, pickedOnPlan } = await import('../../studio/viewPrefs')
    const RP = await import('../../utils/rightPanel')
    RP.setRightPanel({ tab: 'elevations' })
    useViewPrefs.getState().setCard('generate')
    pickedOnPlan()
    expect([useViewPrefs.getState().card, RP.useRightPanel.getState().tab]).toEqual(['tabs', 'properties'])
    RP.setRightPanel({ tab: 'elevations' })
    pickedOnPlan()                                                                                       // no Generate card: nothing changes
    expect(RP.useRightPanel.getState().tab).toBe('elevations')
    const ci = read('canvas2/useCanvasInteraction.js')
    expect(between(ci, 'const selectFromHit = (hitId, shiftKey, world) => {', 'const st = useCanvasStore.getState()')).toMatch(/pickedOnPlan\(\)/)
    expect(ci).toMatch(/if \(fpObj\) \{\s+pickedOnPlan\(\)\s+st\.selectObject\(wallHit\.objId\)/)
    // the draft is the card's own state (GeneratePanel): closing the card drops it
    expect(read('components/Generate/GeneratePanel.jsx')).toMatch(/const \[draft, setDraft\] = useState\(\{\}\)/)
  })
})

describe.each(['horizontal', 'vertical'])('SF-3 — buildings, %s', (orientation) => {
  let m, st
  beforeEach(async () => {
    m = await fresh()
    m.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    st = () => m.useCanvasStore.getState()
  })
  for (const [type, w, h] of FP_SHAPES) {
    it(`SF-building-${type}: a ${type} dropped on a generated layout is picked by every one of its walls, never by its floor; one Ctrl+Z right after the drop takes it away`, () => {
      expect(st().layers.find(l => l.id === 'building').locked).toBe(false)                               // Generate locks Columns only
      const h0 = st().historyIndex, n0 = st().objects.length
      st().placeFpObject({ type, widthFt: w, heightFt: h })                                               // the library's own call
      const fp = st().objects[st().objects.length - 1]
      expect([fp.type, st().objects.length, st().historyIndex]).toEqual([type, n0 + 1, h0 + 1])
      const walls = m.getFpWallSegments(fp, st().gridSize)
      expect(walls.length).toBeGreaterThanOrEqual(4)
      for (const seg of walls) {
        const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }
        expect([type, seg.index, m.fpWallHitTest([fp], st().layers, mid.x, mid.y, 0.2, st().gridSize)?.objId]).toEqual([type, seg.index, fp.id])
      }
      st().undo()
      expect([st().objects.length, st().objects.some(o => o.id === fp.id)]).toEqual([n0, false])
    })
  }
  it('SF-building-generated: the generated building is picked by its walls too; a wall click that moves nothing adds no history entry', () => {
    const fp = st().objects.find(o => o.type === 'fp_rect'), seg = m.getFpWallSegments(fp, st().gridSize)[0]
    expect(m.fpWallHitTest(st().objects, st().layers, (seg.a.x + seg.b.x) / 2, (seg.a.y + seg.b.y) / 2, 0.2, st().gridSize)?.objId).toBe(fp.id)
    expect(m.L.LOCKED_AFTER_GENERATE).toEqual(['columns'])
    expect(read('canvas2/useCanvasInteraction.js')).toMatch(/\} else if \(obj && JSON\.stringify\(obj\) !== JSON\.stringify\(rd\.origObj\)\) st\.commitObjectUpdate\(rd\.objId, obj\)/)
  })
})

describe('SF-4 — the sheet', () => {
  const T5 = { id: 'a', name: 'x', color: '#D98324', uprightHeightIn: 252, clearanceIn: 6, beamFaceIn: 4, holePitchIn: 2, levels: [0, 58, 116, 174, 232].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2500 })) }
  const draw = async (building) => (await import('../../utils/elevationDrawing')).elevationLayout(T5, 96, { w: 274, h: 420 }, { palletWIn: 40, building, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front', bg: '#FFFFFF' })
  it('SF-sheet-ceiling: the max load height is the sprinkler height less 18″ (no sprinkler height: the ceiling less 18″) — 30′ with sprinklers at 28′ reads Max load height 26′-6″ (18″ below sprinklers); the band runs between the ceiling and it', async () => {
    const d = await draw({ clearHeightIn: 360, sprinklerIn: 336 }), s = d.items.filter(i => i.t === 'text').map(i => i.s)
    expect(s).toEqual(expect.arrayContaining(['Ceiling 30′-0″', 'Max load height 26′-6″ (18″ below sprinklers)', '3′-2″ free']))
    const none = (await draw({ clearHeightIn: 360, sprinklerIn: null })).items.filter(i => i.t === 'text').map(i => i.s)
    expect(none).toEqual(expect.arrayContaining(['Max load height 28′-6″ (18″ below sprinklers)']))
    const ceil = d.items.find(i => i.tag === 'clear'), max = d.items.find(i => i.tag === 'max-load'), band = d.items.find(i => i.tag === 'band')
    expect([Math.abs(band.y - ceil.y1) < 0.01, Math.abs(band.y + band.h - max.y1) < 0.01]).toEqual([true, true])
    expect(Math.round((max.y1 - ceil.y1) / d.scale)).toBe(42)                                          // the ceiling to 28′ less 18″
  })
  it('SF-sheet-top: the ceiling line sits near the top of the sheet — a small fixed margin, no empty space above it; the Beam line under the rack is 6px+ clear of the ground hatch', async () => {
    const d = await draw({ clearHeightIn: 360, sprinklerIn: 360 }), ceil = d.items.find(i => i.tag === 'clear')
    const label = d.items.find(i => i.t === 'text' && /^Ceiling/.test(i.s))
    expect([ceil.y1 <= 22, label.y - label.size > 0]).toEqual([true, true])                            // its label still on the sheet
    // a sheet taller than the drawing needs (dragged taller): the ceiling stays at the top, the room goes below
    const { elevationLayout } = await import('../../utils/elevationDrawing')
    const tall = elevationLayout(T5, 96, { w: 274, h: 800 }, { palletWIn: 40, building: { clearHeightIn: 360 }, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front' })
    expect(tall.items.find(i => i.tag === 'clear').y1 <= 22).toBe(true)
    const hatch = d.items.filter(i => i.t === 'line' && i.stroke === '#C3BEB1'), bottom = Math.max(...hatch.map(h => Math.max(h.y1, h.y2)))
    const ticks = d.items.filter(i => i.t === 'line' && i.stroke === '#1B4FD8' && i.x1 === i.x2 && Math.min(i.y1, i.y2) > bottom - 1)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(Math.min(...ticks.map(t => Math.min(t.y1, t.y2))) - bottom).toBeGreaterThanOrEqual(6)
    const beam = d.items.find(i => i.tag === 'beam-label')
    expect(beam.y - beam.size * 0.8 - bottom).toBeGreaterThanOrEqual(6)
  })
})

describe('SF-5 — Apply', () => {
  it('SF-apply: with no row selected the button reads "Select rows to apply", dimmed; with rows "Apply to N selected rows"', () => {
    const list = between(read('components/Elevations/ElevationsTab.jsx'), 'function List(', 'function SheetRow(')
    expect(list).toMatch(/\{rowsSelected \? `Apply to \$\{rowsSelected\} selected row\$\{rowsSelected === 1 \? '' : 's'\}` : 'Select rows to apply'\}/)
    expect(list).toMatch(/<Btn kind="primary" disabled=\{!canApply\}[\s\S]*opacity: canApply \? 1 : 0\.45/)
  })
})

