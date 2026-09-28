// Area RS — (1) after any paste or duplicate the NEW object is the selection
// and nothing else looks selected (the original's bay highlight is cleared);
// (2) "Apply my changes to all sections" puts a pasted row in every section,
// or reports that section with the reason — never a silent skip.
// 1080 x 410, 25 x 30, reach; both orientations.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline, planReplay } from '../../utils/rowEdits'
import { pasteAt, setCanvasPointer } from '../../utils/pasteAt'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, seq = 0
const newId = () => 's' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const render = (report) => renderToStaticMarkup(createElement(Panel.ApplyReport, { report })).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const strip = (o) => JSON.parse(JSON.stringify(o))
function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)
  return [fp, ...racks]
}
function load(objects) {
  store.setState({ objects: strip(objects), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], pasteCount: 0,
    zoom: 1, panX: 0, panY: 0, history: [JSON.stringify({ objects, groups: [] })], historyIndex: 0 })
}
const objs = () => store.getState().objects
const history = () => { const st = store.getState(); return st.history.slice(0, st.historyIndex + 1) }

describe.each(['horizontal', 'vertical'])('RS — %s', (orientation) => {
  const base = layout(orientation)
  const { sections } = buildingSections(base, 'r0')
  const rot = rackFootprint(base[1]).rotated
  const run = (o) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const cross = (o) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
  const env = (s) => [Math.min(...s.rows.map(r => run(r)[0])), Math.max(...s.rows.map(r => run(r)[1]))]
  const secNo = (s) => s.rows[0].genSection

  // ── bug 1: selection after paste / duplicate ────────────────────────────
  it.each(['cursor', 'inPlace', 'nudge'])('RS-select %s: only the pasted object is selected; the original keeps no bay highlight', (mode) => {
    load(base)
    const orig = base.find(o => o.type === 'rack_double_row')
    // the user clicked a bay of the original: it carries activeBayIdx
    store.setState({ objects: objs().map(o => (o.id === orig.id ? { ...o, activeBayIdx: 2 } : o)), selectedIds: [orig.id] })
    store.getState().copySelected()
    setCanvasPointer({ x: 300 * GS, y: 200 * GS })
    const before = new Set(objs().map(o => o.id))
    pasteAt(store, mode, newId)
    const st = store.getState()
    const pasted = st.objects.filter(o => !before.has(o.id))
    expect(pasted).toHaveLength(1)
    expect(st.selectedIds).toEqual([pasted[0].id])
    expect(st.selectedIds).not.toContain(orig.id)
    // nothing else is drawn as selected: no bay / tower highlight anywhere
    expect(st.objects.filter(o => o.activeBayIdx != null || o.activeTowerIdx != null)).toEqual([])
    expect(st.activeBaySelection).toEqual([])
  })

  // ── bug 2: a pasted row at 10 positions → every section, or a reason ────
  const lens = sections.map(s => env(s)[1] - env(s)[0])
  const nS = sections.length, last = nS - 1
  const shortest = lens.indexOf(Math.min(...lens)), longest = lens.indexOf(Math.max(...lens))
  const CASES = [
    ['middle of section 1', 0, 0.5, 3], ['middle, shortest section', shortest, 0.5, 5], ['middle, longest section', longest, 0.5, 5],
    ['near the start edge', Math.min(1, last), 0.1, 7], ['near the far edge / cross-aisle', Math.min(1, last), 0.9, 7],
    ['last section, middle', last, 0.5, 9], ['first aisle, first section', 0, 0.3, 1], ['last aisle', Math.min(2, last), 0.5, -1],
    ['middle section', Math.floor(nS / 2), 0.6, 11], ['in the cross-aisle', 0, 1.02, 4],
  ]

  function pasteRow([, si, where, aisle]) {
    load(base)
    const s = sections[si]
    const lines = [...new Set(s.rows.map(r => r.rowIndex))].sort((a, b) => a - b)
    const k = aisle < 0 ? lines.length - 2 : Math.min(aisle, lines.length - 2)
    const rA = s.rows.find(r => r.rowIndex === lines[k]), rB = s.rows.find(r => r.rowIndex === lines[k + 1])
    const crossMid = (cross(rA)[1] + cross(rB)[0]) / 2
    const [e0, e1] = env(s), runPt = e0 + (e1 - e0) * where
    const single = s.rows.find(r => r.type === 'rack_row') || s.rows[0]
    store.setState({ selectedIds: [single.id] }); store.getState().copySelected()
    setCanvasPointer(rot ? { x: crossMid, y: runPt } : { x: runPt, y: crossMid })
    pasteAt(store, 'cursor', newId)
    return store.getState().selectedIds[0]
  }

  it.each(CASES)('RS-10 %s: every other section gets the new row or is reported with a reason', (...c) => {
    const label = c[0]
    const pastedId = pasteRow(c)
    const plan = planReplay(objs(), 'fp', GS, newId, history())
    expect(plan.added).toHaveLength(1)
    const add = plan.added[0]
    const skips = plan.skipped.filter(k => k.rowIndex === add.rowIndex)
    for (const s of sections) {
      const n = secNo(s)
      if (n === add.section) continue
      const placed = add.sections.includes(n), skip = skips.filter(k => k.section === n)
      // exactly one outcome per section, and a skip always says why
      expect(placed !== (skip.length === 1), `section ${n}: placed=${placed} skips=${skip.length}`).toBe(true)
      for (const k of skip) expect(k.reason).toMatch(/^(overlaps .+ by \d|would pass the wall by \d|is .+ longer than this section)/)
      // a skip for the new row itself is real: the pasted row does reach into that section
      for (const k of skip.filter(k => /the new row itself/.test(k.reason))) {
        const [a0, a1] = run(objs().find(o => o.id === pastedId)), [s0, s1] = env(s)
        expect(Math.min(a1, s1) - Math.max(a0, s0)).toBeGreaterThan(0)
      }
    }
    // a paste that reaches into no other section skips nothing
    const [p0, p1] = run(objs().find(o => o.id === pastedId))
    const reaches = sections.filter(s => secNo(s) !== add.section && Math.min(p1, env(s)[1]) - Math.max(p0, env(s)[0]) > 1e-6)
    if (!reaches.length) expect(skips, `${label}: ${JSON.stringify(skips)}`).toEqual([])
    // it reaches into a neighbour section: exactly those copies have no room
    else expect(skips.map(k => k.section).sort((a, b) => a - b), label).toEqual(reaches.map(secNo).sort((a, b) => a - b))
    // Apply: the copies really are there — one per placed section — and no report is lost
    const report = Panel.applyRowEdits(store.getState, 'fp')
    const copies = objs().filter(o => o.rowIndex === add.rowIndex && o.id !== pastedId)
    expect(copies).toHaveLength(add.sections.length)
    expect(add.sections.length + skips.length).toBe(nS - 1)
    const html = render(report)
    for (const k of skips) expect(html).toContain(`Section ${k.section}: new row not added — ${k.reason}`)
    if (!skips.length) expect(html).not.toContain('new row not added')
  })

  it('RS-fit: a full-length row pasted in the longest section: every section gets a full-length copy, each line says whose bays (RL has the geometry)', () => {
    const c = CASES.find(x => x[0] === 'middle, longest section')
    pasteRow(c)
    const plan = planReplay(objs(), 'fp', GS, newId, history())
    const add = plan.added[0]
    expect(add.sections.length).toBe(nS - 1)
    expect(add.fullLength).toBe(true)
    expect(add.patterns.filter(x => x.section !== add.section).every(x => /^row \d+$/.test(x.from))).toBe(true)
    const report = Panel.applyRowEdits(store.getState, 'fp')
    const html = render(report)
    for (const x of add.patterns) expect(html).toContain(Panel.patternLine(x, add.section))
  })
})

describe('RS — wiring and panel', () => {
  it('RS-wire: Ctrl+V / Ctrl+Shift+V / Ctrl+D, the top bar and the Arrange Paste all go through pasteAt (which sets the selection)', () => {
    const kb = readFileSync('src/hooks/useKeyboardShortcuts.js', 'utf8')
    expect(kb).toMatch(/pasteAt\(useCanvasStore, e\.shiftKey \? 'inPlace' : 'cursor', nanoid\)/)
    expect(kb).toMatch(/copySelected\(\)\s*\n\s*pasteAt\(useCanvasStore, 'nudge', nanoid\)/)
    const top = readFileSync('src/components/Toolbar/TopBar.jsx', 'utf8')
    expect(top).toMatch(/pasteAt\(useCanvasStore, 'cursor', nanoid\)/)
    expect(top).toMatch(/pasteAt\(useCanvasStore, 'inPlace', nanoid\)/)
    expect(readFileSync('src/components/RightPanel/GroupPanel.jsx', 'utf8')).toMatch(/label="Paste" onClick=\{\(\) => pasteAt\(useCanvasStore, 'cursor', nanoid\)\}/)
  })

  it('RS-panel: every skipped section gets its own line with the reason', () => {
    const report = { applied: 1, deleted: [], moved: [], held: [], clashes: [], missing: [], trimmed: [], trimSkipped: [],
      added: [{ rowIndex: 40, section: 2, sections: [1, 4], ids: ['x'], patterns: [
        { section: 1, bays: 16, beams: Array(16).fill(96), from: 'row 12' },
        { section: 2, bays: 14, beams: Array(14).fill(96), from: 'source' },
        { section: 4, bays: 13, beams: [...Array(12).fill(96), 120], from: 'source-shortened', dropped: 1 }] }],
      skipped: [{ section: 6, rowIndex: 40, reason: `overlaps row 4 by 1' 2"` }, { section: 3, rowIndex: 40, reason: `would pass the wall by 2' 0"` }] }
    const html = render(report)
    expect(html).toContain(`Section 6: new row not added — overlaps row 4 by 1' 2"`)
    expect(html).toContain(`Section 3: new row not added — would pass the wall by 2' 0"`)
    expect(html).toContain(`Section 1: 16 bays (16 × 8'), full length, bays from row 12`)
    expect(html).toContain(`Section 2: the new row, 14 bays (14 × 8')`)
    expect(html).toContain(`Section 4: 13 bays (12 × 8' + 1 × 10'), the new row cut by 1 bay to fit`)
    expect(html).toContain('role="alert"')
  })
})
