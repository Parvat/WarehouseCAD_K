// KT — keys while typing (STUDIO.md §5): with focus in an input, a select or a textarea, Ctrl/Cmd + A C V X Z Y,
// Delete / Backspace, the arrows and the single-letter tool keys act on the text only — the layout, the selection,
// the tool and the history never change. With focus anywhere else they do what they always did.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
    expect(kb).toMatch(/if \(textOwnsKey\(e\)\) return/)
    expect(readFileSync('src/canvas2/useCanvasInteraction.js', 'utf8')).toMatch(/if \(e\.code === 'Space' && !textOwnsKey\(e\)\)/)
  })
})

/* ── every key listener in the app ─────────────────────────────────────────────
   Finds each keydown / keyup / keypress listener — window, document, an element, capture or not — and each React
   onKeyDown / onKeyUp / onKeyPress on an element that is not itself a field, takes its handler's code, and fails when
   a handler that acts on a guarded key (Delete, Backspace, an arrow, a letter, a Ctrl/Cmd combination, or a delegate
   like the shortcut handler) does not ask textOwnsKey first. Escape / Enter / Space-only handlers need no check. */

const SRC_DIR = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const walkSrc = (d) => readdirSync(d).flatMap(n => { const f = join(d, n); return statSync(f).isDirectory() ? (/__test__|_svg_reference/.test(n) ? [] : walkSrc(f)) : [f] })

/** the code of the function starting at `from` (an arrow or a function body), by brace matching */
function bodyAt(src, from) {
  const open = src.indexOf('{', from), arrow = src.indexOf('=>', from)
  // an arrow without braces: up to the end of the line
  if (arrow >= 0 && (open < 0 || src.slice(arrow + 2, open).trim() !== '')) return src.slice(from, src.indexOf('\n', arrow))
  let depth = 0
  for (let i = open; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) return src.slice(from, i + 1) }
  return src.slice(from)
}
/** a named handler's code in the same file */
function named(src, id) {
  const m = new RegExp(`(?:const|let|var)\\s+${id}\\s*=|function\\s+${id}\\s*\\(`).exec(src)
  return m ? bodyAt(src, m.index) : null
}
/* does the handler act on a key the field owns? */
const GUARDED = /'Delete'|"Delete"|'Backspace'|"Backspace"|'Arrow|"Arrow|ctrlKey|metaKey|toLowerCase\(\)|toolMap|e\.key\.length|key\.length|\['?[a-z]'?\]|=== '[a-z]'|=== "[a-z]"|case '[a-z]'/

/** every key listener in a file's code: { where, code, guarded, acts } */
function keyListeners(src, file = '') {
  const out = []
  const push = (where, code) => { const acts = GUARDED.test(code) || /shortcutHandler/.test(where); out.push({ file, where, code, acts, guarded: /textOwnsKey\(/.test(code) }) }
  for (const m of src.matchAll(/addEventListener\(\s*['"](keydown|keyup|keypress)['"]\s*,\s*([A-Za-z_$][\w$]*)?/g)) {
    const line = src.slice(0, m.index).split('\n').length
    if (m[2] === 'function' || m[2] === 'async') m[2] = undefined          // an inline function, not a name
    const code = m[2] ? (named(src, m[2]) || (m[2] === 'shortcutHandler' ? named(src, 'shortcutHandler') : null)) : bodyAt(src, m.index + m[0].length)
    push(`${file}:${line} ${m[1]} ${m[2] || 'inline'}`, code ?? '')
  }
  for (const m of src.matchAll(/onKey(Down|Up|Press)=\{/g)) {
    const tagStart = src.lastIndexOf('<', m.index), tag = (src.slice(tagStart + 1).match(/^[A-Za-z]+/) || [''])[0]
    if (/^(input|textarea|select)$/i.test(tag)) continue          // a field's own keys (Enter to commit) — the field's by definition
    const line = src.slice(0, m.index).split('\n').length
    const v = src.slice(m.index + m[0].length).match(/^\s*([A-Za-z_$][\w$]*)\s*\}/)
    const code = v ? (named(src, v[1]) || '') : bodyAt(src, m.index + m[0].length)
    push(`${file}:${line} onKey${m[1]} <${tag}>`, code)
  }
  return out
}

describe('KT — every key listener asks first', () => {
  it('KT-scan: every listener that acts on Ctrl/Cmd + A C V X Z Y, Delete, Backspace, an arrow or a tool letter asks textOwnsKey before acting', () => {
    const all = walkSrc(SRC_DIR).filter(f => /\.(jsx?|tsx?)$/.test(f)).flatMap(f => keyListeners(readFileSync(f, 'utf8').split('\r\n').join('\n'), f.slice(SRC_DIR.length)))
    expect(all.length).toBeGreaterThan(10)
    const missing = all.filter(l => l.acts && !l.guarded).map(l => l.where)
    expect(missing).toEqual([])
    // the ones that act on those keys today — each guarded
    const acting = all.filter(l => l.acts).map(l => l.where.split(':')[0].replace(/\\/g, '/'))
    for (const f of ['hooks/useKeyboardShortcuts.js', 'components/Elevations/ElevationDrawing.jsx', 'components/Toolbar/TopBar.jsx']) expect([f, acting.includes(f)]).toEqual([f, true])
  })
  it('KT-scan-self: the scan catches a listener that skips the check — window, document, capture, a React handler on a div — and passes one that asks', () => {
    const bad = [
      `window.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'a') selectAll() })`,
      `const k = (e) => { if (e.key === 'Delete') del() }\ndocument.addEventListener('keydown', k, true)`,
      `<div tabIndex={0} onKeyDown={e => { if (e.key === 'Backspace') remove() }} />`,
      `stage.container().addEventListener('keydown', function (e) { switch (e.key.toLowerCase()) { case 'v': tool() } })`,
    ]
    for (const code of bad) expect([code.slice(0, 40), keyListeners(code).some(l => l.acts && !l.guarded)]).toEqual([code.slice(0, 40), true])
    const good = [
      `window.addEventListener('keydown', (e) => { if (textOwnsKey(e)) return; if (e.ctrlKey && e.key === 'a') selectAll() })`,
      `document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })`,
      `<input onKeyDown={e => { if (e.key === 'Enter') commit() }} />`,
    ]
    for (const code of good) expect([code.slice(0, 40), keyListeners(code).some(l => l.acts && !l.guarded)]).toEqual([code.slice(0, 40), false])
  })
  it('KT-owns: textOwnsKey — the field keeps Ctrl/Cmd + A C V X Z Y, Delete, Backspace, arrows and single characters; Escape, Enter and Ctrl+S are not its', async () => {
    const { textOwnsKey } = await import('../../utils/typing')
    const input = { tagName: 'INPUT', type: 'number' }
    const owns = (key, mods = {}, target = input) => { document.activeElement = target; return textOwnsKey({ key, target, ...mods }) }
    for (const k of ['a', 'c', 'v', 'x', 'z', 'y', 'A']) expect([k, owns(k, { ctrlKey: true }), owns(k, { metaKey: true })]).toEqual([k, true, true])
    for (const k of ['Delete', 'Backspace', 'ArrowLeft', 'f', 'g', 's', 'm', 'v', ' ']) expect([k, owns(k)]).toEqual([k, true])
    for (const [k, m] of [['Escape', {}], ['Enter', {}], ['s', { ctrlKey: true }], ['d', { ctrlKey: true }]]) expect([k, owns(k, m)]).toEqual([k, false])
    expect([owns('a', { ctrlKey: true }, { tagName: 'INPUT', type: 'checkbox' }), owns('Delete', {}, { tagName: 'DIV' })]).toEqual([false, false])
    // the focus counts too: a key whose target is the page while a field has the focus
    document.activeElement = { tagName: 'TEXTAREA' }
    expect(textOwnsKey({ key: 'a', ctrlKey: true, target: { tagName: 'BODY' } })).toBe(true)
  })
})
