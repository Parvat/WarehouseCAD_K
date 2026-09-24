// TEST_PLAN.md §3I — regenerate.
//
// Drives the REAL store and the real generateAndPlace entry the Generate
// panel calls. The store's placeFpObject reads document.getElementById for
// the viewport size and already falls back when it gets null, so a bare
// `document` stub is all node needs — nothing about generation is mocked.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }

const BRIEF = { ...R.R1, rackType: 'rack_double_row', dockDoors: 0 }

async function freshModules() {
  vi.resetModules()
  const { useCanvasStore } = await import('../../store/useCanvasStore')
  const { generateAndPlace } = await import('../../generate/traceGenerate')
  const { serializeScene, deserializeScene } = await import('../../utils/saveLoad')
  return { useCanvasStore, generateAndPlace, serializeScene, deserializeScene }
}

const count = (objs, type) => objs.filter(o => o.type === type).length

describe('I — regenerate', () => {
  let m
  beforeEach(async () => { m = await freshModules() })

  it('I-twice: generating twice leaves exactly one generated layout', () => {
    m.generateAndPlace(BRIEF)
    const once = m.useCanvasStore.getState().objects
    m.generateAndPlace(BRIEF)
    const twice = m.useCanvasStore.getState().objects
    expect(count(twice, 'fp_rect')).toBe(1)
    expect(count(twice, 'column_grid')).toBe(1)
    expect(twice.length).toBe(once.length)
  })

  it('I-reload: still exactly one layout after a page reload between generations', async () => {
    m.generateAndPlace(BRIEF)
    const saved = m.serializeScene(m.useCanvasStore.getState())
    const before = m.useCanvasStore.getState().objects.length

    // "Reload": every module re-created, all in-memory state gone, then
    // the scene restored from its serialized form the way autosave does.
    const m2 = await freshModules()
    expect(m2.useCanvasStore.getState().objects).toHaveLength(0)
    m2.useCanvasStore.setState((s) => { m2.deserializeScene(saved, s) })
    expect(m2.useCanvasStore.getState().objects).toHaveLength(before)

    m2.generateAndPlace(BRIEF)
    const after = m2.useCanvasStore.getState().objects
    expect(count(after, 'fp_rect')).toBe(1)
    expect(count(after, 'column_grid')).toBe(1)
    expect(after.length).toBe(before)
  })

  it('I-hand-drawn: a hand-drawn floor plan is never removed by Generate', () => {
    m.useCanvasStore.getState().placeFpObject({ type: 'fp_rect', widthFt: 50, heightFt: 40 })
    const handId = m.useCanvasStore.getState().selectedIds[0]
    expect(handId).toBeTruthy()
    m.generateAndPlace(BRIEF)
    m.generateAndPlace(BRIEF)
    const objs = m.useCanvasStore.getState().objects
    expect(objs.some(o => o.id === handId)).toBe(true)
    expect(count(objs, 'fp_rect')).toBe(2)   // the hand-drawn one + exactly one generated
  })
})
