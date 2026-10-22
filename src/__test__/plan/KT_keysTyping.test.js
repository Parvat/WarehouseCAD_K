// KT — keys while typing (STUDIO.md §5): with focus in an input, a select or a textarea, Ctrl/Cmd + A C V X Z Y,
// Delete / Backspace, the arrows and the single-letter tool keys act on the text only — the layout, the selection,
// the tool and the history never change. With focus anywhere else they do what they always did.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
globalThis.document = globalThis.document || { activeElement: null, getElementById: () => null, querySelector: () => null, body: {} }
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {}, innerWidth: 1440, innerHeight: 900 }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0))

let store, shortcutHandler, isTypingTarget, measure
const GS = 40
const rack = (id, x) => ({ id, type: 'rack_row', x, y: 100, width: 10 * GS, height: 4 * GS, rotation: 0, beams: [96], uprightWidth: 3, layerId: 'layer-racking', levels: 4 })

beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  ;({ shortcutHandler } = await import('../../hooks/useKeyboardShortcuts'))
  ;({ isTypingTarget } = await import('../../utils/typing'))
  ;({ useMeasureMode: measure } = await import('../../utils/toolSwitch'))
})

const FIELDS = {
  'number input': { tagName: 'INPUT', type: 'number' },
  'text input': { tagName: 'INPUT', type: 'text' },
  select: { tagName: 'SELECT' },
  textarea: { tagName: 'TEXTAREA' },
  'editable text': { tagName: 'DIV', isContentEditable: true },
}
const press = (key, focus, mods = {}) => {
  document.activeElement = focus
  let prevented = false
  shortcutHandler({ key, code: key, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, target: focus || document.body, preventDefault: () => { prevented = true }, stopPropagation() {} })
  return prevented
}
const snap = () => { const s = store.getState(); return JSON.stringify({ objects: s.objects, selected: s.selectedIds, tool: s.activeTool, hist: s.historyIndex, measure: measure.getState().on }) }

beforeEach(() => {
  const s = store.getState()
  store.setState({ objects: [rack('a', 100), rack('b', 800)], selectedIds: ['a'], activeTool: 'select', gridSize: GS })
  s.pushHistory?.()
  measure.setState({ on: false })
})

describe('KT — typing in a field', () => {
  it('KT-target: an input that takes text, a select, a textarea and editable content are typing targets; a checkbox, slider or button is not', () => {
    for (const [name, el] of Object.entries(FIELDS)) expect([name, isTypingTarget(el)]).toEqual([name, true])
    for (const type of ['checkbox', 'radio', 'range', 'button', 'color']) expect([type, isTypingTarget({ tagName: 'INPUT', type })]).toEqual([type, false])
    expect([isTypingTarget(null), isTypingTarget({ tagName: 'DIV' }), isTypingTarget({ tagName: 'BUTTON' })]).toEqual([false, false, false])
  })

  it.each(Object.keys(FIELDS))('KT-break (%s): Ctrl/Cmd + A C V X Z Y, Delete, Backspace, the arrows and every tool letter leave the layout, selection, tool and history exactly as they were — and the text keeps its own key (no preventDefault)', (name) => {
    const el = FIELDS[name]
    store.getState().copySelected()          // something on the clipboard, so a paste would show
    const before = snap()
    for (const mod of [{ ctrl: true }, { meta: true }]) for (const k of ['a', 'c', 'v', 'x', 'z', 'y', 'A', 'V']) {
      const prevented = press(k, el, mod)
      expect([name, k, mod.ctrl ? 'ctrl' : 'meta', snap() === before, prevented]).toEqual([name, k, mod.ctrl ? 'ctrl' : 'meta', true, false])
    }
    for (const k of ['Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'v', 'p', 'l', 't', 'f', 'g', 's', 'm', 'a', 'c', 'r']) {
      const prevented = press(k, el)
      expect([name, k, snap() === before, prevented]).toEqual([name, k, true, false])
    }
  })
})

describe('KT — the same keys with focus on the page', () => {
  it('KT-control: Ctrl+A selects everything, Delete deletes, an arrow nudges, F picks Fill racking, M turns Measure on, Ctrl+Z undoes', () => {
    press('a', null, { ctrl: true }); expect([...store.getState().selectedIds].sort()).toEqual(['a', 'b'])
    store.setState({ selectedIds: ['a'] })
    const x0 = store.getState().objects.find(o => o.id === 'a').x
    press('ArrowRight', null); expect(store.getState().objects.find(o => o.id === 'a').x).toBeGreaterThan(x0)
    press('f', null); expect(store.getState().activeTool).toBe('fill_racking')
    press('v', null); press('m', null); expect(measure.getState().on).toBe(true)
    press('m', null); expect(measure.getState().on).toBe(false)
    store.setState({ selectedIds: ['b'] })
    press('Delete', null); expect(store.getState().objects.some(o => o.id === 'b')).toBe(false)
    press('z', null, { ctrl: true }); expect(store.getState().objects.some(o => o.id === 'b')).toBe(true)
  })
  it('KT-wire: the shortcut handler asks utils/typing.js first; the space-to-pan key ignores a space typed into a field', () => {
    const kb = readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')
    expect(kb).toMatch(/const isInput = isTypingTarget\(document\.activeElement\) \|\| isTypingTarget\(e\.target\)/)
    expect(kb).toMatch(/if \(ctrl && isInput && TEXT_EDIT_KEYS\.has\(String\(e\.key\)\.toLowerCase\(\)\)\) return/)
    expect(readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')).toMatch(/if \(e\.code === 'Space' && !isTypingTarget\(e\.target\)\)/)
  })
})
