// SBR — Studio step 3: the selection bar, the mode bars, the notices (STUDIO.md §1, §4, §6, §9; design/studio/
// Studio.dc.html C1, C6, C8, C9, C10). One break-it test per behaviour — each fails when the behaviour it names is undone:
//   1 the selection bar floats just above the selection, never over it; below it when there is no room above; it
//     follows the pan and the zoom; it keeps off the rail and the right card
//   2 its contents per selection, as the §6 table (one rack row, several rows, zone, column, aisle label, building)
//   3 its actions are the app's own — Add bay, Remove bay, Rotate, Duplicate, Delete, Row group — one undo step each
//   4 the mode bars (Row group, Split, Fill racking) at the top, top 76, as C8–C10; ✕ (and Esc) leave the mode
//   5 the notices above the tool pill, 76 from the bottom: the message, Undo when it reports the step just made, ✕
//   6 icons from §9 only: every bar icon is in the generated set (Add bay, Remove bay added to Icons.dc.html)
//   7 the floor's right-click menu: Paste · Fill racking · Add zone ▾, on empty floor only
//   8 the Row group's card (C8): "Editing row N · changes go to all M", the group's positions, the fields, the note
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null }
if (!globalThis.document.querySelector) globalThis.document.querySelector = () => null
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } }
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0))
const WIN = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {} }   // the selection bar's window (server-rendered: no layout)
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')

/* a generated layout in `orientation`, the store fresh */
async function layout(orientation) {
  vi.resetModules()
  const { useCanvasStore: store } = await import('../../store/useCanvasStore')
  const gen = await import('../../generate/traceGenerate'), E = await import('../../utils/elevations')
  const stop = E.installElevationsKeeper(store)
  store.setState({ objects: [], groups: [], elevations: null, selectedIds: [], activeBaySelection: [], activeWall: null, activeTool: 'select', zoom: 0.2, panX: 100, panY: 120, history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
  gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
  stop()
  return store
}
const rackOf = (store) => store.getState().objects.find(o => o.type === 'rack_double_row' || o.type === 'rack_row')
/** Server rendering reads each store's initial state: the live one is copied in first (as the RG / PD tests do). */
async function ssr(C) {
  const mods = await Promise.all(['../../store/useCanvasStore', '../../utils/rowGroupTool', '../../utils/placement', '../../canvas2/dragPreview', '../../utils/rackingAreaTool', '../../utils/notice', '../../utils/fillTool', '../../studio/SelectionBar'].map(p => import(p)))
  for (const m of mods) for (const v of Object.values(m)) if (v && typeof v.getInitialState === 'function' && typeof v.getState === 'function') Object.assign(v.getInitialState(), v.getState())
  const had = 'window' in globalThis, prev = globalThis.window
  globalThis.window = prev || WIN
  const { ColumnCheckProvider } = await import('../../generate/useColumnCheck'), { RulesProvider } = await import('../../rules/useRules')
  try { return renderToStaticMarkup(createElement(RulesProvider, null, createElement(ColumnCheckProvider, null, createElement(C)))) } finally { if (!had) delete globalThis.window }
}

describe.each(['horizontal', 'vertical'])('SBR — the selection bar, %s', (orientation) => {
  let store, SB
  beforeEach(async () => { store = await layout(orientation); SB = await import('../../studio/SelectionBar') })

  it('SBR-place: just above the selection (8px), never over it; below it under the top islands; off the rail and the right card; it follows the pan and the zoom', async () => {
    const st = store.getState(), r = rackOf(store)
    const view = { zoom: st.zoom, panX: st.panX, panY: st.panY }
    const box = SB.screenBox([r], st.objects, view)
    const win = { w: 1440, h: 900 }, w = 474, h = 42
    // room above: 8px above, centred, not covering
    const above = SB.placeBar({ x0: 600, x1: 640, y0: 400, y1: 600 }, w, h, win)
    expect([above.top, above.flipped, above.top + h <= 400 - 8]).toEqual([400 - 8 - h, false, true])
    expect(Math.abs(above.left + w / 2 - 620)).toBeLessThan(1)
    // no room above (under the top islands): below it, still not covering
    const below = SB.placeBar({ x0: 600, x1: 640, y0: 80, y1: 500 }, w, h, win)
    expect([below.flipped, below.top]).toEqual([true, 508])
    // the rail (left 72) and the right card
    expect(SB.placeBar({ x0: 0, x1: 20, y0: 400, y1: 500 }, w, h, win).left).toBe(88)
    const card = { left: 1124, top: 76, bottom: 560 }
    const nearCard = SB.placeBar({ x0: 1100, x1: 1140, y0: 400, y1: 500 }, w, h, win, card)
    expect(nearCard.left + w).toBeLessThanOrEqual(card.left - 16)
    // the view: pan moves it by the pan, zoom scales it about the origin
    const panned = SB.screenBox([r], st.objects, { ...view, panX: view.panX + 50, panY: view.panY - 30 })
    expect([panned.x0 - box.x0, panned.y0 - box.y0]).toEqual([50, -30])
    const zoomed = SB.screenBox([r], st.objects, { ...view, zoom: view.zoom * 2 })
    expect(zoomed.x1 - zoomed.x0).toBeCloseTo((box.x1 - box.x0) * 2, 6)
    // wired: the bar reads the store's view and places itself with placeBar, absolute in the canvas, under the islands
    const src = read('studio/SelectionBar.jsx')
    expect(src).toMatch(/const box = screenBox\(what\.objs, objects, \{ zoom, panX, panY \}\)/)
    expect(src).toMatch(/style=\{\{ \.\.\.pill, position: 'absolute', zIndex: 140,/)
    expect(read('canvas2/Canvas2.jsx')).toMatch(/<SelectionBar \/>/)
  })

  it('SBR-contents: the §6 table per selection — one rack row, several rows, a zone, a column grid, an aisle label, a building; nothing for other objects; hidden in another tool, while placing or while a Row group is open', async () => {
    const st = store.getState(), r = rackOf(store), racks = st.objects.filter(o => o.type === 'rack_double_row' || o.type === 'rack_row')
    expect(SB.barFor(st.objects, [r.id], null).kind).toBe('rack')
    expect(SB.barFor(st.objects, racks.slice(0, 3).map(o => o.id), null).kind).toBe('rows')
    const fp = st.objects.find(o => o.type === 'fp_rect'), grid = st.objects.find(o => o.type === 'column_grid')
    expect(SB.barFor(st.objects, [fp.id], null).kind).toBe('building')
    expect(SB.barFor(st.objects, [], { objId: fp.id, wallIdx: 0 }).kind).toBe('building')
    if (grid) expect(SB.barFor(st.objects, [grid.id], null).kind).toBe('column')
    const zone = { id: 'z', type: 'zone_office', x: fp.x + 400, y: fp.y + 400, width: 1600, height: 1200, rotation: 0, label: 'Office' }
    const aisle = st.objects.find(o => o.type === 'aisle')
    expect(SB.barFor([...st.objects, zone], ['z'], null).kind).toBe('zone')
    if (aisle) expect(SB.barFor(st.objects, [aisle.id], null).kind).toBe('aisle')
    expect(SB.barFor([...st.objects, { id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10 }], ['t'], null)).toBe(null)
    // the buttons, in C1's order
    store.setState({ selectedIds: [r.id], activeTool: 'select' })
    const one = (await ssr(SB.SelectionBar))
    const labels = [...one.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]).filter(l => l !== 'Selection')
    expect(labels).toEqual(['Elevation', 'Add bay', 'Remove bay', 'Split', 'Row group', 'Rotate', 'Duplicate', 'Delete', 'More'])
    store.setState({ selectedIds: racks.slice(0, 3).map(o => o.id) })
    expect([...(await ssr(SB.SelectionBar)).matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]).filter(l => l !== 'Selection')).toEqual(['Apply elevation', 'Row group', 'Delete'])
    store.setState({ objects: [...store.getState().objects, zone], selectedIds: ['z'] })
    const z = (await ssr(SB.SelectionBar))
    expect([...z.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]).filter(l => l !== 'Selection')).toEqual(['Zone width', 'Zone length', 'Lock', 'Duplicate', 'Delete'])
    expect(z).toMatch(/value="40′"[\s\S]*×[\s\S]*value="30′"/)
    store.setState({ selectedIds: [fp.id] })
    expect((await ssr(SB.SelectionBar))).toMatch(/Thickness[\s\S]*aria-label="Wall thickness"[\s\S]*>3″<[\s\S]*>6″<[\s\S]*>9″<[\s\S]*>12″<[\s\S]*Add door[\s\S]*Wall clearance/)
    if (grid) { store.setState({ selectedIds: [grid.id] }); expect((await ssr(SB.SelectionBar))).toMatch(/aria-pressed="(true|false)"[^>]*>Show clearances</) }
    // hidden: another tool, a placement, a Row group
    store.setState({ selectedIds: [r.id], activeTool: 'split' })
    expect((await ssr(SB.SelectionBar))).toBe('')
    store.setState({ activeTool: 'select' })
    const RG = await import('../../utils/rowGroupTool')
    RG.useRowGroup.setState({ keys: ['k'] })
    expect((await ssr(SB.SelectionBar))).toBe('')
    RG.useRowGroup.setState({ keys: [] })
    const PL = await import('../../utils/placement')
    PL.usePlacement.setState({ active: { items: [] } })
    expect((await ssr(SB.SelectionBar))).toBe('')
    PL.usePlacement.setState({ active: null })
  })

  it('SBR-actions: Add bay, Remove bay and Rotate are the card\'s and the rotate handle\'s own writes — one undo step each; Duplicate is Ctrl+D; Delete the Delete key; Row group puts the selected rows in the group', async () => {
    const A = await import('../../studio/selectionActions'), RG = await import('../../utils/rowGroupTool')
    RG.installRowGroupWatcher?.(store)
    const r = rackOf(store), get = () => store.getState().objects.find(o => o.id === r.id), h = () => store.getState().historyIndex
    const n0 = r.beams.length, h0 = h()
    A.addBayTo(get())
    expect([get().beams.length, h() - h0, get().beams[n0]]).toEqual([n0 + 1, 1, r.beams[n0 - 1]])
    A.removeBayFrom(get())
    expect([get().beams.length, h() - h0]).toEqual([n0, 2])
    const rot0 = get().rotation || 0
    A.rotateQuarter(get())
    expect([((get().rotation - rot0) % 360 + 360) % 360, h() - h0]).toEqual([90, 3])
    store.getState().undo()
    expect(get().rotation || 0).toBe(rot0)
    // Delete: the selection gone, one undo step
    store.setState({ selectedIds: [r.id] })
    const count = store.getState().objects.length, h1 = h()
    A.deleteSelection()
    expect([store.getState().objects.some(o => o.id === r.id), h() - h1]).toEqual([false, 1])
    store.getState().undo()
    // wired to the same calls as the keys and the card
    const src = read('studio/selectionActions.js')
    expect(src).toMatch(/store\.getState\(\)\.copySelected\(\)\s+pasteAt\(store, 'nudge', nanoid\)/)
    expect(src).toMatch(/export const deleteSelection = \(\) => deleteSelectionWithAreas\(store\)/)
    expect(src).toMatch(/st\.commitObjectUpdate\(obj\.id, addBayUpdate\(obj, beamIn \?\? beams\[beams\.length - 1\] \?\? 96, st\.gridSize \|\| 40\)\)/)
    expect(src).toMatch(/if \(deleteBaySelection\(store, nanoid\)\) return true[\s\S]*store\.getState\(\)\.deleteSingleBay\(obj\.id, obj\.activeBayIdx != null \? obj\.activeBayIdx : beams\.length - 1\)/)
    expect(src).toMatch(/for \(const id of st\.selectedIds\) n \+= addRowOf\(id\)/)
    expect(store.getState().objects.length).toBe(count)
  })
})

describe('SBR — the mode bars and the notices', () => {
  let store
  beforeEach(async () => { store = await layout('vertical') })

  it('SBR-mode-bars: Row group, Split and Fill racking at the top — fixed, top 76, translateX(-62%), radius 12 — with their name, what to do and ✕ (Esc too): C8 Ask | Auto apply and Apply to N, C9 the hint and Esc to finish, C10 Rows ↔ | Rows ↕, Aisle, rows · pos', async () => {
    const P = await import('../../studio/barParts')
    expect([P.modePill.position, P.modePill.top, P.modePill.transform, P.modePill.borderRadius, P.modePill.boxShadow]).toEqual(['fixed', 76, 'translateX(-62%)', 12, '0 10px 28px rgba(15,18,16,.22)'])
    const RGB = await import('../../canvas2/RowGroupBar'), RG = await import('../../utils/rowGroupTool')
    RG.useRowGroup.setState({ keys: ['a', 'b', 'c'], pending: { summary: { text: 'Apply to the other 2 rows?', apply: 2, warned: [], skipped: [], narrowLost: 48 } } })
    const g = (await ssr(RGB.RowGroupBar))
    expect(g).toMatch(/data-mode-bar="row-group"[\s\S]*>Row group<\/span>[\s\S]*>3<\/span> rows[\s\S]*>Ask<\/span><span[^>]*>Auto apply<[\s\S]*−48<\/span>[\s ]positions[\s\S]*aria-label="Skip"[\s\S]*>Apply to 2<\/button>[\s\S]*aria-label="Clear the row group"/)
    RG.useRowGroup.setState({ keys: [], pending: null })
    expect((await ssr(RGB.RowGroupBar))).toBe('')
    // Split: only in the tool; ✕ leaves it as Esc does
    const SPL = await import('../../canvas2/SplitBar')
    expect((await ssr(SPL.SplitBar))).toBe('')
    store.setState({ activeTool: 'split' })
    expect((await ssr(SPL.SplitBar))).toMatch(/data-mode-bar="split"[\s\S]*>Split<\/span>[\s\S]*Click a row where to cut · drag the piece away[\s\S]*>Esc<\/span> to finish[\s\S]*aria-label="Close Split"/)
    expect(read('canvas2/SplitBar.jsx')).toMatch(/const close = \(\) => \{ useSplit\.setState\(\{ hover: null \}\); useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\) \}/)
    // Fill racking: the settings, the aisle, the live estimate
    const FT = await import('../../canvas2/FillBar'), FL = await import('../../utils/fillTool')
    FL.useRackingSettings.getState().setSetting('orientation', 'vertical')
    FL.useFillTool.setState({ plan: { rows: 16, positions: 1920, racks: [] } })
    const f = (await ssr(FT.FillOptionsBar))
    expect(f).toMatch(/data-mode-bar="fill"[\s\S]*>Fill racking<\/span>[\s\S]*aria-pressed="false"[^>]*>Rows ↔<\/button><button[^>]*aria-pressed="true"[^>]*>Rows ↕<[\s\S]*aria-label="Beam"[\s\S]*aria-label="Max rack run \(ft\)"[\s\S]*>Aisle<\/span><span aria-label="Aisle"[^>]*>10′ 6″<[\s\S]*>16<\/span> rows · <span[^>]*>1,920<\/span> pos[\s\S]*aria-label="Close Fill racking"/)
    FL.useFillTool.setState({ plan: null })
    expect(read('canvas2/FillBar.jsx')).toMatch(/const close = \(\) => \{ cancelFill\(\); useCanvasStore\.getState\(\)\.setActiveTool\(TOOLS\.SELECT\) \}/)
    // the old light chrome is gone from the bars
    for (const fl of ['canvas2/RowGroupBar.jsx', 'canvas2/FillBar.jsx', 'canvas2/FillTool.jsx', 'canvas2/SplitBar.jsx', 'studio/SelectionBar.jsx']) expect([fl, /var\(--surface|var\(--accent-solid|var\(--border/.test(read(fl))]).toEqual([fl, false])
  })

  it('SBR-notices: above the tool pill, 76 from the bottom, stacked — the zone\'s result with Undo (one Ctrl+Z) and ✕, the Row group\'s result with Undo only for the step just made, Ctrl+A\'s note with ✕ and no Undo, a placement with ✕; the racking area\'s question keeps its answers', async () => {
    const RGB = await import('../../canvas2/RowGroupBar'), AT = await import('../../utils/rackingAreaTool'), RG = await import('../../utils/rowGroupTool'), N = await import('../../utils/notice')
    const src = read('canvas2/RowGroupBar.jsx')
    expect(src).toMatch(/const stack = \{\s*position: 'fixed', left: '50%', bottom: 76, transform: 'translateX\(-50%\)', zIndex: 150,/)
    AT.useAreaPrompt.setState({ question: null, note: 'Office moved · 12 bays removed · 9 restored' })
    const z = (await ssr(RGB.RowGroupBar))
    expect(z).toMatch(/aria-label="Zone change"[\s\S]*Office moved<\/span><span> · <span[^>]*>12<\/span> bays removed<\/span><span> · <span[^>]*color:#7BD3A4[^>]*>9<\/span> restored[\s\S]*>Undo<\/button>[\s\S]*aria-label="Dismiss"/)
    expect(src).toMatch(/<NoticePill label="Zone change" onUndo=\{undo\(dismissAreaNote\)\} onClose=\{dismissAreaNote\} closeLabel="Dismiss">/)
    expect(src).toMatch(/const undo = \(then\) => \(\) => \{ useCanvasStore\.getState\(\)\.undo\(\); then\?\.\(\) \}/)
    AT.useAreaPrompt.setState({ note: null })
    RG.useRowGroup.setState({ message: 'Applied to 11 rows · 2 skipped', report: { warned: [], skipped: [] }, pending: null })
    expect((await ssr(RGB.RowGroupBar))).toMatch(/aria-label="Row group result"[\s\S]*Applied to 11 rows · 2 skipped[\s\S]*>Undo<\/button>/)
    RG.useRowGroup.setState({ message: 'Nothing applied. 3 skipped' })
    expect((await ssr(RGB.RowGroupBar))).not.toMatch(/>Undo</)
    RG.useRowGroup.setState({ message: null, report: null })
    N.notify('Building and columns are kept', 'locked layers')
    const n = (await ssr(RGB.RowGroupBar))
    expect([/aria-label="Notice"/.test(n), />Undo</.test(n), /aria-label="Close"/.test(n)]).toEqual([true, false, true])
    N.clearNotice()
    AT.useAreaPrompt.setState({ question: { text: 'Delete the racks in this area too?', choices: [{ label: 'Keep racks' }, { label: 'Delete racks' }] } })
    expect((await ssr(RGB.RowGroupBar))).toMatch(/role="alertdialog" aria-label="Racking area question"[\s\S]*Delete the racks in this area too\?[\s\S]*>Keep racks<\/button>[\s\S]*>Delete racks<\/button>/)
    AT.useAreaPrompt.setState({ question: null })
    // a placement: ✕ cancels it (as Esc)
    expect(src).toMatch(/onClose=\{\(\) => cancelPlacement\(\)\} closeLabel="Cancel placing"/)
    // the notice's look (C6): 36 high, radius 10, Undo 26h in the accent
    const P = read('studio/barParts.jsx')
    expect(P).toMatch(/minHeight: 36, boxSizing: 'border-box'[\s\S]*?borderRadius: 10/)
    expect(P).toMatch(/height: 26, padding: '0 10px', border: 0, borderRadius: 6, background: B\.inset, color: B\.accent, fontSize: 12, fontWeight: 600 \}\}>Undo/)
    // the old bars are gone
    expect(read('canvas2/Canvas2.jsx')).not.toMatch(/AreaPrompt/)
  })

  it('SBR-icon-moves: the rendered icons with a section-9 equivalent come from the icon set — Project settings (Close, Chevron, Edit, Generate, Delete), Rules (Close, Lock), the export check (Close), the Elevations card (Close, Back = Chevron), the print window (Close, Export); only those with none stay (Plus, the spinner, reset, warning)', async () => {
    const PSu = read('components/Project/ProjectSetup.jsx'), RU = read('components/Rules/RulesPanel.jsx'), LC = read('components/RightPanel/LayoutCheckPanel.jsx'), EL = read('components/Elevations/ElevationsTab.jsx'), PDF = read('export/pdfExport.js')
    expect(PSu).toMatch(/^import \{ Plus, Loader2 \} from 'lucide-react'/m)
    expect(/<(ChevronRight|X|PenLine|Sparkles|Trash2)\b/.test(PSu)).toBe(false)
    for (const n of ['Chevron', 'Close', 'Edit', 'Generate', 'Delete']) expect([n, PSu.includes(`<Icon name="${n}"`)]).toEqual([n, true])
    expect(RU).toMatch(/^import \{ Plus, RotateCcw, AlertTriangle \} from 'lucide-react'/m)
    expect(/<(X|Lock)\b/.test(RU)).toBe(false)
    expect((RU.match(/<Icon name="Lock"/g) || []).length + (RU.match(/<Icon name="Close"/g) || []).length).toBe(5)
    expect(LC.slice(LC.indexOf('export function ExportCheckDialog'))).not.toMatch(/<X\b/)
    // the hand-drawn ✕ and back chevron gone; only the Depth arrow and New's plus (no section-9 icon) are drawn here
    expect([EL.includes('M7 7l10 10'), EL.includes('M15 18l-6-6 6-6'), (EL.match(/<svg/g) || []).length]).toEqual([false, false, 2])
    expect(EL).toMatch(/const Arrow = \(\) => <svg/)
    expect(EL).toMatch(/const Plus = \(\) => <svg/)
    expect(EL).toMatch(/const Back = \(\) => <Icon name="Chevron" size=\{14\} color="currentColor" style=\{\{ transform: 'rotate\(90deg\)' \}\} \/>/)
    expect(PDF).toMatch(/const ICON_X = icon\('Close'\), ICON_PRINTER = icon\('Export'\)/)
    // a light dialog's icon: its grey the text colour, its cut-outs the dialog's surface (not the dark island's #1F2321)
    const { Icon } = await import('../../studio/Icon')
    const lock = renderToStaticMarkup(createElement(Icon, { name: 'Lock', size: 10, color: 'currentColor', cut: 'var(--surface)' }))
    expect([lock.includes('#1F2321'), lock.includes('fill:var(--surface)'), lock.includes('currentColor'), lock.includes('#C9CEC9')]).toEqual([false, true, true, false])
  })

  it('SBR-icons: every bar icon is §9\'s (the generated set) — Add bay and Remove bay among them, from Icons.dc.html; no hand-drawn svg in the bars', async () => {
    const I = await import('../../studio/iconData')
    for (const n of ['Add bay', 'Remove bay', 'Split', 'Row group', 'Rotate', 'Duplicate', 'Delete', 'More', 'Lock', 'Close', 'Chevron']) expect([n, !!I.TOOLS[n]?.idle, !!I.TOOLS[n]?.active]).toEqual([n, true, true])
    expect(I.TOOLS['Add bay'].idle.body).toContain('<rect x="18" y="9" width="2" height="6" fill="#C9CEC9"')
    expect(I.TOOLS['Remove bay'].active.body).toContain('fill="#7BD3A4"')
    expect(I.TOOLS['Remove bay'].idle.body.includes('x="18" y="9"')).toBe(false)
    expect(read('../design/studio/Icons.dc.html')).toMatch(/>Delete<\/span><\/div>[\s\S]{0,40}<div[^>]*>[\s\S]*?>Add bay<\/span><\/div><div[^>]*>[\s\S]*?>Remove bay<\/span>/)
    const used = [...read('studio/SelectionBar.jsx').matchAll(/IconBtn name="([^"]+)"/g)].map(m => m[1])
    expect(used.every(n => I.TOOLS[n])).toBe(true)
    for (const fl of ['studio/SelectionBar.jsx', 'studio/barParts.jsx', 'canvas2/RowGroupBar.jsx', 'canvas2/SplitBar.jsx']) expect([fl, /<svg|<path/.test(read(fl))]).toEqual([fl, false])
  })

  it('SBR-floor-menu: a right-click on empty floor (outside every object, or inside the building) opens Paste · Fill racking · Add zone ▾ there (the browser\'s own menu never)', async () => {
    const SB = await import('../../studio/SelectionBar')
    const st = store.getState(), fp = st.objects.find(o => o.type === 'fp_rect')
    let prevented = 0
    const host = { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    const at = (wx, wy) => ({ clientX: wx * st.zoom + st.panX, clientY: wy * st.zoom + st.panY, preventDefault: () => { prevented++ } })
    store.setState({ selectedIds: [] })
    // outside every object
    expect(SB.openFloorMenu(at(fp.x - 400, fp.y - 400), host)).toBe('floor')
    expect([!!SB.useFloorMenu.getState().at, SB.useFloorMenu.getState().objId, store.getState().selectedIds]).toEqual([true, null, []])
    SB.useFloorMenu.setState({ at: null })
    expect(prevented).toBe(1)
    // another tool on: nothing opens
    store.setState({ activeTool: 'split' })
    expect(SB.openFloorMenu(at(fp.x - 400, fp.y - 400), host)).toBe(false)
    store.setState({ activeTool: 'select' })
    const src = read('studio/SelectionBar.jsx')
    expect(src).toMatch(/<MenuItem disabled=\{!clipboard\?\.length\} title="Paste \(Ctrl\+V\)" onClick=\{run\(pasteHere\)\}>Paste<\/MenuItem>\s*<MenuItem title="Fill racking \(F\) — drag a box" onClick=\{run\(tool\(FILL_TOOL\)\)\}>Fill racking<\/MenuItem>\s*<MenuItem onClick=\{\(\) => setZones\(z => !z\)\}[\s\S]*?>Add zone<\/MenuItem>\s*\{zones && ZONE_KINDS\.map/)
    expect(read('canvas2/Canvas2.jsx')).toMatch(/onContextMenu=\{\(e\) => openFloorMenu\(e, e\.currentTarget\)\}/)
  })

  it('SBR-object-menu: a right-click on any object selects it (its group, as a click) and opens its More items — Lock, To back, Back, Forward, To front, Copy, Cut — in the floor menu\'s card style; a building by its wall', async () => {
    const SB = await import('../../studio/SelectionBar')
    const st = store.getState(), fp = st.objects.find(o => o.type === 'fp_rect'), r = rackOf(store)
    const host = { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    const at = (wx, wy) => ({ clientX: wx * st.zoom + st.panX, clientY: wy * st.zoom + st.panY, preventDefault: () => {} })
    store.setState({ selectedIds: [] })
    // a rack: selected, its menu
    expect(SB.openFloorMenu(at(r.x + r.width / 2, r.y + r.height / 2), host)).toBe('object')
    expect([store.getState().selectedIds, SB.useFloorMenu.getState().objId]).toEqual([[r.id], r.id])
    // in a group: the group, as a click picks it
    const other = st.objects.find(o => o !== r && /^rack_/.test(o.type))
    store.setState({ groups: [{ id: 'g', ids: [r.id, other.id] }], selectedIds: [] })
    expect(SB.openFloorMenu(at(r.x + r.width / 2, r.y + r.height / 2), host)).toBe('object')
    expect(store.getState().selectedIds.slice().sort()).toEqual([r.id, other.id].sort())
    store.setState({ groups: [], selectedIds: [] })
    // a building by its wall (its inside is the floor): a point on its wall with nothing else on it
    const H = await import('../../canvas2/hitTest')
    let wp = null
    for (let k = 1; k < 40 && !wp; k++) for (const p of [{ x: fp.x + fp.width * k / 40, y: fp.y }, { x: fp.x, y: fp.y + fp.height * k / 40 }]) {
      const id = H.hitTest(st.objects, st.layers, p.x, p.y, st.zoom, st.gridSize || 40)
      if ((!id || id === fp.id) && H.fpWallHitTest(st.objects, st.layers, p.x, p.y, st.zoom, st.gridSize || 40)) { wp = p; break }
    }
    expect(SB.openFloorMenu(at(wp.x, wp.y), host)).toBe('object')
    expect([store.getState().selectedIds, SB.useFloorMenu.getState().objId]).toEqual([[fp.id], fp.id])
    // ...its inside (hit as the building, off its walls, nothing else there) is the floor: the floor menu, no selection
    let ip = null
    for (let i = 1; i < 30 && !ip; i++) for (let j = 1; j < 30; j++) {
      const p = { x: fp.x + fp.width * i / 30, y: fp.y + fp.height * j / 30 }
      if (H.hitTest(st.objects, st.layers, p.x, p.y, st.zoom, st.gridSize || 40) === fp.id && !H.fpWallHitTest(st.objects, st.layers, p.x, p.y, st.zoom, st.gridSize || 40)) { ip = p; break }
    }
    store.setState({ selectedIds: [] })
    expect([SB.openFloorMenu(at(ip.x, ip.y), host), SB.useFloorMenu.getState().objId, store.getState().selectedIds]).toEqual(['floor', null, []])
    SB.useFloorMenu.setState({ at: null, objId: null })
    // its items: the More items, one list with the ⋯ menu's
    const items = renderToStaticMarkup(createElement(SB.MoreItems, { obj: r, close: () => {} }))
    expect([...items.matchAll(/role="menuitem"[^>]*>(?:<span[^>]*>)?([^<]+)</g)].map(m => m[1])).toEqual(['Lock', 'To back', 'Back', 'Forward', 'To front', 'Copy', 'Cut'])
    expect(renderToStaticMarkup(createElement(SB.MoreItems, { obj: { ...r, locked: true }, close: () => {} }))).toMatch(/>Unlock</)
    const src = read('studio/SelectionBar.jsx')
    expect(src).toMatch(/if \(objId\) return <Menu label="Object" at=\{at\} onClose=\{close\}><MoreItems obj=\{obj\} close=\{close\} \/><\/Menu>/)
    expect(src).toMatch(/<Menu label="More" anchor=\{ref\.current\} onClose=\{\(\) => setOpen\(false\)\}>\s*<MoreItems obj=\{obj\} close=\{\(\) => setOpen\(false\)\} \/>/)
  })

  it('SBR-elev-chip: the rack bar\'s Elevation chip is the swatch and the level count only ("5 levels"); the full name is its hover title and in its dropdown', async () => {
    const SB = await import('../../studio/SelectionBar'), P = await import('../../utils/project'), E = await import('../../utils/elevations')
    const r = rackOf(store), T0 = store.getState().elevations
    const ids = new Set(); for (let b = 0; b < r.beams.length; b++) for (let s = 0; s < 2; s++) ids.add(E.typeIdAt(r, b, s, T0))
    // a full name of its own (the app's are "5 levels · 48×40 · Main"), so the chip's count and the title differ
    const id = [...ids][0]
    store.setState({ elevations: { ...T0, types: T0.types.map(x => (x.id === id ? { ...x, name: 'Bulk 4 levels high bay', named: true } : x)) }, selectedIds: [r.id], activeTool: 'select' })
    const T = store.getState().elevations, t = E.typeById(T, id), name = P.nameOf(T, t), n = t.levels.length
    expect(name).toBe('Bulk 4 levels high bay')
    const bar = await ssr(SB.SelectionBar)
    const chip = bar.match(/<button[^>]*aria-label="Elevation"[^>]*>[\s\S]*?<\/button>/)[0]
    expect(chip).toContain(`title="${name}"`)
    expect(chip).toMatch(new RegExp(`background:${t.color}[\\s\\S]*>${n} levels<\\/span>`))
    expect(chip.includes(name) && !chip.replace(/title="[^"]*"/, '').includes(name)).toBe(true)   // the name only as the title
    expect(read('studio/SelectionBar.jsx')).toMatch(/\{T\.types\.map\(t => <MenuItem key=\{t\.id\} swatch=\{t\.color\} onClick=\{\(\) => \{ assignSelected\(store, t\.id\); setOpen\(false\) \}\}>\{nameOf\(T, t\)\}<\/MenuItem>\)\}/)
  })

  it('SBR-c8-card: a selected Row group row shows C8 — "Editing row N · changes go to all M", the group\'s positions, Bays · Depth · Beam · Flue, the pending edit\'s note; a row outside the group keeps C1', async () => {
    const RG = await import('../../utils/rowGroupTool')
    RG.installRowGroupWatcher?.(store)
    const PP = await import('../../components/RightPanel/PropertiesPanel')
    const racks = store.getState().objects.filter(o => o.type === 'rack_double_row')
    const [a, b] = racks
    store.setState({ selectedIds: [a.id] })
    expect((await ssr(PP.PropertiesPanel))).not.toMatch(/Editing /)
    RG.useRowGroup.setState({ keys: [] })
    RG.addRowOf(a.id); RG.addRowOf(b.id)
    const n = RG.useRowGroup.getState().keys.length
    RG.useRowGroup.setState({ pending: { summary: { text: 'Apply to the other 1 row?', apply: 1, warned: [], skipped: [], narrowLost: 0 } } })
    const c8 = (await ssr(PP.PropertiesPanel))
    expect(c8).toMatch(new RegExp(`Editing ${a.rowIndex != null ? `row ${a.rowIndex}` : 'this row'} · changes go to all ${n}`))
    expect(c8).toMatch(/positions in group/)
    expect(c8).toMatch(/aria-label="Bays"[\s\S]*aria-label="Rack depth"[\s\S]*aria-label="New bay beam"[\s\S]*aria-label="Flue"/)
    expect(c8).toMatch(/role="note" aria-label="Row group edit"[^>]*>[\s\S]*Apply to the other 1 row\?/)
    RG.useRowGroup.setState({ keys: [], pending: null })
  })
})
