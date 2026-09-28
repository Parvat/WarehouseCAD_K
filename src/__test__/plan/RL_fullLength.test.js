// Area RL — a pasted row's copies take the right LENGTH per section.
// A full-length row (as long as the rows next to it) is full length in every
// section: each copy takes the bays of the row next to it there, and starts
// and ends with that section's rows. A shorter row is copied at its own
// length (cut only if it can't fit). The panel says which bays each got.
// 1080 x 410, 25 x 30, reach; both orientations.
import { describe, it, expect, beforeAll } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sizingSheetLayout } from '../../generate/sizingLayout'
import { placementToObject } from '../../generate/traceGenerate'
import { rackFootprint } from '../../generate/columnCheck'
import { DEFAULT_RULES } from '../../rules/defaults'
import { buildingSections } from '../../utils/syncSections'
import { makeBaseline, planReplay } from '../../utils/rowEdits'
import { pasteAt } from '../../utils/pasteAt'
import { GS } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
let store, Panel, seq = 0
const newId = () => 'l' + (++seq)
beforeAll(async () => {
  store = (await import('../../store/useCanvasStore')).useCanvasStore
  Panel = await import('../../components/RightPanel/panels/RackRowPanelCore.jsx')
})

const strip = (o) => JSON.parse(JSON.stringify(o))
const render = (report) => renderToStaticMarkup(createElement(Panel.ApplyReport, { report })).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const near = (a, b) => Math.abs(a - b) < 1e-6
function layout(orientation) {
  const brief = { lengthFt: 1080, widthFt: 410, gridXFt: 25, gridYFt: 30, mhe: 'reach', orientation, rackType: 'rack_double_row' }
  const racks = sizingSheetLayout(brief, DEFAULT_RULES).map((p, i) => ({ ...placementToObject(p), id: 'r' + i, parentId: 'fp' }))
  const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 1080 * GS, height: 410 * GS, wallThicknessFt: 0.25 }
  fp.rowBaseline = makeBaseline([fp, ...racks], fp)
  return [fp, ...racks]
}
const objs = () => store.getState().objects
const get = (id) => objs().find(o => o.id === id)
const history = () => { const st = store.getState(); return st.history.slice(0, st.historyIndex + 1) }

describe.each(['horizontal', 'vertical'])('RL — %s', (orientation) => {
  const base = layout(orientation)
  const { sections } = buildingSections(base, 'r0')
  const rot = rackFootprint(base[1]).rotated
  const run = (o) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
  const cross = (o) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
  const env = (s) => [Math.min(...s.rows.map(r => run(r)[0])), Math.max(...s.rows.map(r => run(r)[1]))]
  const lens = sections.map(s => env(s)[1] - env(s)[0])
  const secOf = (o) => { const m = (run(o)[0] + run(o)[1]) / 2; return sections.find(s => m > env(s)[0] - 1e-6 && m < env(s)[1] + 1e-6) }
  const shortest = lens.indexOf(Math.min(...lens)), longest = lens.indexOf(Math.max(...lens))

  /** Copy a double row of section `si` (Ctrl+C), paste it in place and move
   *  it across into the middle of the aisle after its line — the same run
   *  start and end as its neighbours. `keep` bays: shorten it first. */
  function pasteInAisle(si, keep = null) {
    store.setState({ objects: strip(base), groups: [], activeBaySelection: [], selectedIds: [], gridSize: GS, clipboard: [], pasteCount: 0,
      zoom: 1, panX: 0, panY: 0, history: [JSON.stringify({ objects: base, groups: [] })], historyIndex: 0 })
    const s = sections[si]
    const lines = [...new Set(s.rows.map(r => r.rowIndex))].sort((a, b) => a - b)
    const rA = s.rows.find(r => r.rowIndex === lines[4]), rB = s.rows.find(r => r.rowIndex === lines[5])
    store.setState({ selectedIds: [rA.id] }); store.getState().copySelected()
    pasteAt(store, 'inPlace', newId)
    const id = store.getState().selectedIds[0]
    if (keep != null) {
      // keep the first `keep` bays (run order), the row starting where it did
      const o = get(id), up = o.uprightWidth || 3, beams = o.beams.slice(0, keep)
      const width = ((up * (beams.length + 1) + beams.reduce((a, b) => a + b, 0)) / 12) * GS
      const r0 = run(o)[0]
      let n = { ...o, beams, width, x: o.x - (width - o.width) / 2 }
      const d = r0 - run(n)[0]
      n = { ...n, x: n.x + (rot ? 0 : d), y: n.y + (rot ? d : 0) }
      store.setState({ objects: objs().map(q => (q.id === id ? n : q)) })
    }
    const o = get(id), gapMid = (cross(rA)[1] + cross(rB)[0]) / 2, d = gapMid - (cross(o)[0] + cross(o)[1]) / 2
    store.getState().moveObjects([id], rot ? d : 0, rot ? 0 : d)
    return { id, src: rA }
  }
  // the row next to the copy in its section: the nearest (across) generated row there
  const neighbour = (copy) => {
    const s = secOf(copy), m = (cross(copy)[0] + cross(copy)[1]) / 2
    return s.rows.map(r => get(r.id)).filter(Boolean).sort((a, b) => Math.abs((cross(a)[0] + cross(a)[1]) / 2 - m) - Math.abs((cross(b)[0] + cross(b)[1]) / 2 - m))[0]
  }

  it.each([['the shortest', shortest], ['the longest', longest]])('RL-full %s section: a full-length row -> every copy has the bays, start and end of its own section\'s rows', (_, si) => {
    const { id } = pasteInAisle(si)
    const plan = planReplay(objs(), 'fp', GS, newId, history())
    expect(plan.added).toHaveLength(1)
    const add = plan.added[0]
    expect(add.fullLength).toBe(true)
    expect(add.sections).toHaveLength(sections.length - 1)
    expect(plan.skipped).toEqual([])
    const hist = store.getState().historyIndex
    const report = Panel.applyRowEdits(store.getState, 'fp')
    expect(store.getState().historyIndex).toBe(hist + 1)                       // one undo step
    const copies = objs().filter(o => o.rowIndex === add.rowIndex && o.id !== id)
    expect(copies).toHaveLength(sections.length - 1)
    for (const c of copies) {
      const nb = neighbour(c)
      expect(c.beams, `section ${secOf(c).rows[0].genSection}`).toEqual(nb.beams)
      expect(near(run(c)[0], run(nb)[0]) && near(run(c)[1], run(nb)[1]), `section ${secOf(c).rows[0].genSection} ends`).toBe(true)
      // across it stays in the aisle, where the new row is
      expect(near(cross(c)[0], cross(get(id))[0])).toBe(true)
    }
    // sections differ in length, so the copies really differ in bay count
    expect(new Set(copies.map(c => c.beams.length)).size).toBeGreaterThan(1)
    // the panel: one line per section with the pattern it used
    const html = render(report)
    for (const x of add.patterns.filter(p => p.section !== add.section)) {
      expect(x.from).toMatch(/^row \d+$/)
      expect(html).toContain(`Section ${x.section}: ${x.bays} bays (${Panel.fmtBeams(x.beams)}), full length, bays from ${x.from}`)
    }
    expect(html).toContain(`Section ${add.section}: the new row`)
  })

  it('RL-short: a row shorter than its section (6 bays) -> every copy keeps exactly its length', () => {
    const { id } = pasteInAisle(shortest, 6)
    const plan = planReplay(objs(), 'fp', GS, newId, history())
    const add = plan.added[0]
    expect(add.fullLength).toBe(false)
    expect(add.sections).toHaveLength(sections.length - 1)
    const report = Panel.applyRowEdits(store.getState, 'fp')
    const src = get(id), len = run(src)[1] - run(src)[0]
    const copies = objs().filter(o => o.rowIndex === add.rowIndex && o.id !== id)
    expect(copies).toHaveLength(sections.length - 1)
    for (const c of copies) {
      expect(c.beams).toEqual(src.beams)
      expect(near(run(c)[1] - run(c)[0], len)).toBe(true)
      // at the same place in its section as the new row in its own
      expect(near(run(c)[0] - env(secOf(c))[0], run(src)[0] - env(sections[shortest])[0])).toBe(true)
    }
    const html = render(report)
    for (const x of add.patterns.filter(p => p.section !== add.section)) {
      expect(x.from).toBe('source')
      expect(html).toContain(`Section ${x.section}: 6 bays (${Panel.fmtBeams(x.beams)}), the new row's own length`)
    }
  })

  it('RL-cut: a shorter row that cannot fit a section is cut at its far end, and says so', () => {
    // one bay short of the LONGEST section's rows: fits there, too long for the shorter sections
    const nb = sections[longest].rows[0].beams.length
    const { id } = pasteInAisle(longest, nb - 1)
    const plan = planReplay(objs(), 'fp', GS, newId, history())
    const add = plan.added[0]
    expect(add.fullLength).toBe(false)
    const cut = add.patterns.filter(p => p.from === 'source-shortened')
    expect(cut.length).toBeGreaterThan(0)
    for (const x of cut) {
      const s = sections.find(q => q.rows[0].genSection === x.section)
      expect(x.bays).toBe(nb - 1 - x.dropped)
      expect(env(s)[1] - env(s)[0]).toBeLessThan(lens[longest])
    }
    const html = render(Panel.applyRowEdits(store.getState, 'fp'))
    for (const x of cut) expect(html).toContain(`the new row cut by ${x.dropped} bay`)
    expect(get(id).beams).toHaveLength(nb - 1)
  })
})
