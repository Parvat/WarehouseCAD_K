// Area GU — Generate is ONE undo step.
//
// The store records an entry per action, and Generate is hundreds of them
// (clear the last layout, place the building, every rack and aisle), so
// Ctrl+Z used to walk back object by object and — past the 60-entry cap — the
// layout from before Generate was lost. Now the whole Generate, its layer
// setup and the aisle keeper's re-pairing included, is one entry: one undo
// restores the layout exactly as it was, one redo brings the Generate back.
// Real store, real Generate entries (sync and the batched one the panel
// uses), the app's layer and aisle keepers running; both orientations.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

async function fresh() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const { generateAndPlace, generateAndPlaceBatched } = await import('../../generate/traceGenerate')
  const L = await import('../../utils/layers')
  const { installAisleKeeper } = await import('../../utils/aisleKeeper')
  const { nanoid } = await import('nanoid')
  L.installLayerKeeper(useCanvasStore)
  installAisleKeeper(useCanvasStore, nanoid)
  return { useCanvasStore, generateAndPlace, generateAndPlaceBatched, L }
}

/* What an undo step restores: objects, groups and layers. */
const doc = (s) => JSON.parse(JSON.stringify({ objects: s.objects, groups: s.groups || [], layers: s.layers }))

describe.each(['horizontal', 'vertical'])('GU — %s', (orientation) => {
  const big = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', rackType: 'rack_double_row', dockDoors: 0 }
  const brief = { ...big, orientation }
  const other = { ...R.R1, orientation: orientation === 'horizontal' ? 'vertical' : 'horizontal', rackType: 'rack_double_row', dockDoors: 0 }
  let m, s
  beforeEach(async () => { m = await fresh(); s = () => m.useCanvasStore.getState() })

  it('GU-undo: after a hand-drawn row and a hidden layer, Generate adds exactly one history entry; one Ctrl+Z restores the layout, groups and layers exactly; one Ctrl+Y redoes the Generate', () => {
    s().addObject({ type: 'rack_row', x: -9000, y: -9000, width: 400, height: 60, beams: [96, 96], uprightWidth: 3, depthIn: 42 })
    m.L.setLayer(m.useCanvasStore, 'notes', { visible: false })
    const before = doc(s()), n0 = s().history.length, i0 = s().historyIndex
    m.generateAndPlace(brief)
    const after = doc(s())
    expect(after.objects.length).toBeGreaterThan(200)
    expect(s().history.length).toBe(n0 + 1)
    expect(s().historyIndex).toBe(i0 + 1)
    s().undo()
    expect(doc(s())).toEqual(before)
    s().redo()
    expect(doc(s())).toEqual(after)
    expect(s().layers.find(l => l.id === 'building').locked).toBe(true)
  })

  it('GU-first: Generate on an empty canvas (no history yet) — one Ctrl+Z empties it again, one Ctrl+Y brings it back', () => {
    expect(s().history.length).toBe(0)
    const before = doc(s())
    m.generateAndPlace(brief)
    const after = doc(s())
    expect(s().history.length).toBe(2)                                   // the empty canvas, then the Generate
    s().undo(); expect(doc(s())).toEqual(before); expect(s().objects).toEqual([])
    s().redo(); expect(doc(s())).toEqual(after)
  })

  it('GU-regenerate: a second Generate (the other orientation) is one step too — one Ctrl+Z restores the first layout exactly, even though each Generate is hundreds of objects (more than the 60-entry history)', () => {
    m.generateAndPlace(brief)
    const first = doc(s())
    m.generateAndPlace(other)
    const second = doc(s())
    expect(second).not.toEqual(first)
    s().undo(); expect(doc(s())).toEqual(first)
    s().redo(); expect(doc(s())).toEqual(second)
    s().undo(); s().undo(); expect(s().objects).toEqual([])
  })

  it('GU-batched: the batched Generate the panel runs is one step as well', async () => {
    s().addObject({ type: 'text', x: 0, y: 0, width: 40, height: 20, text: 'note' })
    const before = doc(s()), n0 = s().history.length
    await m.generateAndPlaceBatched(brief, { batch: 50 })
    const after = doc(s())
    expect(s().history.length).toBe(n0 + 1)
    s().undo(); expect(doc(s())).toEqual(before)
    s().redo(); expect(doc(s())).toEqual(after)
  })
})
