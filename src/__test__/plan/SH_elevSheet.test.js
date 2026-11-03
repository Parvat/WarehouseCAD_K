// SH — job 2c: one elevation drawing everywhere (the card's sheet the reference; STUDIO.md §2, §7), and Regenerate one
// undo step. One break-it test per behaviour — each fails when the behaviour it names is undone:
//   1 full screen draws the card's drawing, scaled up (same labels, same positions, same colours)
//   2 edit on the sheet works in full screen: the pencil, Save, ✕ Cancel; Esc cancels the edit there, then closes
//   3 the PDF's elevation sheets draw the card's drawing on the paper palette — white, square, no theme variables —
//     its labels readable at print size (the smallest at least 12 pt)
//   4 one drawing function: the card, full screen and the PDF all draw elevationLayout, in its own palette
//   5 Regenerate (and Generate) is one undo step: the racks and the Forklift / Wall clearance it wrote come back
//     together with one Ctrl+Z
//   6 no Simple | Detailed: the switch, its stored choice and the old drawing behind it are gone
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R } from './fixtures'

globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0))   // Generate's batches yield a frame

globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null }
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } }
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const between = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b, s.indexOf(a)) : undefined)
/* the mockup's elevation (C2): beams at 4′-10″ … 19′-4″, a 21′ frame, 48″ loads; ceiling and sprinklers at 30′ */
const MOCK = { id: 'a', name: 'x', color: '#D98324', uprightHeightIn: 252, clearanceIn: 6, beamFaceIn: 4, holePitchIn: 2, levels: [0, 58, 116, 174, 232].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2500 })) }
const OPTS = { palletWIn: 40, depthIn: 42, building: { clearHeightIn: 360, sprinklerIn: 360 }, sprinklerClearanceIn: 18, view: 'front' }

describe('SH-1 — full screen is the card\'s drawing, scaled up', () => {
  it('SH-full-scaled: full screen lays out the Studio sheet with the card\'s labels times how many times the card\'s sheet fits — every label the card draws, at the same place on the rack, k times as large', async () => {
    const { elevationLayout, sheetScale, CARD_SHEET, CARD_FONT_PX } = await import('../../utils/elevationDrawing')
    const card = elevationLayout(MOCK, 96, CARD_SHEET, { ...OPTS, fontPx: CARD_FONT_PX })
    const box = { w: 1440, h: 850 }, k = sheetScale(box)
    expect(k).toBeCloseTo(850 / 420, 6)
    // full screen centres the card's composition in its wider box: the same drawing, k times as large
    const fs = elevationLayout(MOCK, 96, box, { ...OPTS, fontPx: CARD_FONT_PX * k })
    const tc = card.items.filter(i => i.t === 'text'), tf = fs.items.filter(i => i.t === 'text')
    expect(tf.map(i => i.s)).toEqual(tc.map(i => i.s))
    expect(fs.scale / card.scale).toBeCloseTo(k, 2)
    // positions against the left upright, in rack widths: the same — but the max load label, which slides left only where the
    // sheet is too narrow for it (the card's), and the beam label's fixed few px under the hatch
    const rel = (d, i) => [(i.x - d.Xf(0)) / (d.frontW * d.scale), (i.y - d.floor) / (d.frontW * d.scale)]
    tc.forEach((c, n) => { if (/^Max load|^Beam /.test(c.s)) return; const a = rel(card, c), b = rel(fs, tf[n]); expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeLessThan(0.005) })
    expect(tf.every((f, n) => Math.abs(f.size / tc[n].size - k) < 1e-6)).toBe(true)
    // the same colours
    const cols = (d) => [...new Set(d.items.flatMap(i => [i.fill, i.stroke, ...(i.runs || []).map(r => r.fill)]).filter(Boolean))].sort()
    expect(cols(fs)).toEqual(cols(card))
    // wired: full screen draws 'studio' scaled up, on the card's white gridded sheet
    const dr = read('components/Elevations/ElevationDrawing.jsx')
    expect(dr).toMatch(/<DrawingCore \{\.\.\.props\} sheetEdit=\{[^}]*\} readOnly=\{[^}]*\} fill height=\{null\} controls fitSignal=\{0\} scaleUp \/>/)
    expect(dr).toMatch(/const fontPx = scaleUp \? CARD_FONT_PX \* sheetScale\(box\) : paneFontPx\(box\)/)
    expect(dr).toMatch(/data-sheet="full" style=\{\{ flex: 1, minHeight: 0, \.\.\.SHEET_BG \}\}/)
  })
})

describe('SH-2 — edit on the sheet in full screen (C21)', () => {
  it('SH-full-edit: the pencil starts edit on the sheet; while editing, ✕ Cancel and Save are the card\'s own; drag, typed values, + Add level and − are the same DrawingCore; Esc cancels the edit there first, then closes — never also taken by the card behind it', () => {
    const dr = read('components/Elevations/ElevationDrawing.jsx'), tab = read('components/Elevations/ElevationsTab.jsx')
    const head = between(dr, 'edit on the sheet here too', '</span>\n        </div>')
    expect(head).toMatch(/\{props\.onEdit && !sheetEdit && <button type="button" aria-label="Edit on the sheet"[^>]*onClick=\{side \? undefined : props\.onEdit\}/)
    expect(head).toMatch(/\{sheetEdit && <>\s*<button type="button" aria-label="Cancel" title="Cancel \(Esc\)" onClick=\{onCancel\}[^>]*>✕ Cancel<\/button>\s*<button type="button" onClick=\{props\.onSave\}[^>]*>Save<\/button>/)
    expect(tab).toMatch(/onEdit=\{!e && active \? \(\) => startSheet\(store, active\.id\) : null\} onSave=\{\(\) => saveTyped\(store\)\} onCancel=\{cancelEdit\}/)
    // the same core, so the drag (hole pitch), the typed box, + Add level and − all come along (props spread: sheetEdit, holePitchIn)
    expect(dr).toMatch(/<DrawingCore \{\.\.\.props\} sheetEdit=\{sheetEdit && !side\}/)
    // the typed value's box follows the drawing's scale
    expect(dr).toMatch(/const kIn = scaleUp \? fontPx \/ CARD_FONT_PX : 1/)
    expect(dr).toMatch(/width: 46 \* kIn, height: 16 \* kIn, boxSizing: 'border-box', fontSize: 10 \* kIn/)
    // Esc: the box's own; a picked beam; editing → cancel; else close — taken first and stopped
    const esc = between(dr, 'const k = (e) => {', 'window.addEventListener')
    expect(esc).toMatch(/if \(e\.target instanceof Element && \/\^\(INPUT\|SELECT\|TEXTAREA\)\$\/\.test\(e\.target\.tagName\)\) return\s+e\.stopPropagation\(\); e\.stopImmediatePropagation\(\)\s+if \(useElevEditor\.getState\(\)\.sel != null\) \{ setPane\(\{ sel: null \}\); return \}\s+if \(sheetEdit && onCancel\) \{ onCancel\(\); return \}\s+setFull\(false\)/)
    // the card's own Esc (C21's row, C3's editor) leaves it to full screen while that is open
    expect(tab).toMatch(/useElevEditor\.getState\(\)\.sel != null \|\| elevFullOpen\(\)\) return;/)
    expect(tab).toMatch(/if \(ev\.key === 'Escape' && !sel && !elevFullOpen\(\) &&/)
    // the dialog counts as the pane: a beam picked there stays picked, Delete removes its level
    expect(dr).toMatch(/aria-label="Elevation full screen" data-elev-full data-pane="open"/)
  })
})

describe('SH-3 / SH-4 — the PDF, and one drawing function', () => {
  let store
  beforeEach(async () => {
    vi.resetModules()
    ;({ useCanvasStore: store } = await import('../../store/useCanvasStore'))
  })
  const layout = async (orientation) => {
    const gen = await import('../../generate/traceGenerate'), P = await import('../../utils/project'), E = await import('../../utils/elevations')
    const stop = E.installElevationsKeeper(store)
    store.setState({ objects: [], groups: [], elevations: null, history: [JSON.stringify({ objects: [], groups: [] })], historyIndex: 0 })
    gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    if (!P.projectOf(store.getState().elevations)) P.commitProject(store, P.newProject({ mhe: 'reach', wallClearIn: 3 }))
    const pr = P.projectOf(store.getState().elevations)
    P.commitProject(store, { ...pr, ceilings: pr.ceilings.length ? pr.ceilings.map((c, i) => (i ? c : { ...c, clearHeightIn: 360, sprinklerIn: 360 })) : [{ id: 'c1', name: 'Main', clearHeightIn: 360, sprinklerIn: 360 }], defaultCeilingId: pr.defaultCeilingId || 'c1' })
    stop()
    return store.getState()
  }

  for (const orientation of ['horizontal', 'vertical']) it(`SH-pdf (${orientation}): each elevation cell is the card's front view — the card's labels exactly — and its side view, on white paper: no rounded corners, no grid, no theme variables; the smallest label at least 12 pt`, async () => {
    const st = await layout(orientation)
    const X = await import('../../export/pdfExport'), D = await import('../../utils/elevationDrawing'), P = await import('../../utils/project'), E = await import('../../utils/elevations')
    const pages = X.buildElevationSheets(st.objects, { title: 'T', elevations: st.elevations })
    expect(pages.length).toBeGreaterThan(0)
    const svg = pages[0].svg
    expect([/ rx=/.test(svg), /EFEEE9/.test(svg), /var\(--/.test(svg), svg.includes('PITCH')]).toEqual([false, false, false, false])
    // the first cell: its front labels are the card's, drawn from the same ceiling and pallet (ceilingFor, palletFor)
    const T = st.elevations, used = E.legendCounts(st.objects, T, () => null)
    const type = used[0].type, e = D.lengthsByType(st.objects, T, E.typeIdAt).get(type.id)[0]
    const cell = X.elevationCell(st.objects, T, type, e, { w: 260, h: 230 })
    const pal = P.palletFor(T, type)
    const card = D.elevationLayout(type, e.beamIn, D.CARD_SHEET, { palletWIn: pal?.faceIn || e.palletWIn, palletDIn: pal?.depthIn ?? null, depthIn: e.depthIn, pair: e.pair, flueIn: e.flueIn, building: P.ceilingFor(T, type, st.objects, e.parentId), fontPx: D.CARD_FONT_PX, sprinklerClearanceIn: E.sprinklerClearance(T), view: 'front' })
    const cardTexts = card.items.filter(i => i.t === 'text').map(i => i.s)
    expect(cell.d.items.filter(i => i.t === 'text').slice(0, cardTexts.length).map(i => i.s)).toEqual(cardTexts)
    expect(cardTexts).toEqual(expect.arrayContaining(['Ceiling 30′-0″', 'Max load height 28′-6″ (18″ below sprinklers)']))
    // readable at print size: every label on the drawing, in points (font size px × k mm/px → pt)
    const pts = [...svg.matchAll(/<g transform="translate\(0 [\d.]+\) scale\(([\d.]+)\)" data-elev-drawing>([\s\S]*?)<\/g>/g)].flatMap(([, k, body]) => [...body.matchAll(/<text [^>]*font-size="([\d.]+)"/g)].map(m => (+m[1] * +k) / 25.4 * 72))
    expect(pts.length).toBeGreaterThan(10)
    expect(Math.min(...pts)).toBeGreaterThanOrEqual(12)
  })

  it('SH-one-drawing: the card, full screen and the PDF all draw elevationLayout — no other drawing in the export — and it keeps the paper palette whatever colours its caller passes', async () => {
    const { elevationLayout } = await import('../../utils/elevationDrawing')
    const pdf = read('export/pdfExport.js'), sheets = between(pdf, 'export function buildElevationSheets', '/** Top-level entry')
    expect((sheets.match(/elevationLayout\(/g) || []).length).toBe(4)                                   // the front and side views, fitted then at scale
    expect(/useElevEditor|detail/.test(pdf.slice(pdf.indexOf('export function buildElevationSheets')))).toBe(false)
    // the theme's variables never reach the Studio set (a print window has none): its own §2 colours
    const d = elevationLayout(MOCK, 96, { w: 600, h: 420 }, { ...OPTS, view: 'both', fontPx: 9, bg: 'var(--surface)', frame: 'var(--elev-frame)', ink: 'var(--elev-ink)', blue: 'var(--elev-dim)', red: 'var(--elev-clr)' })
    expect(JSON.stringify(d.items).includes('var(--')).toBe(false)
    expect(d.items.filter(i => i.t === 'rect' && ['beam', 'upright', 'frame'].includes(i.tag)).every(i => i.fill === '#14392B')).toBe(true)
    expect(d.items.filter(i => i.t === 'text').every(i => i.haloColor === '#FFFFFF')).toBe(true)
  })
})

describe.each(['horizontal', 'vertical'])('SH-5 — Regenerate is one undo step, %s', (orientation) => {
  let store, gen, P, st
  beforeEach(async () => {
    vi.resetModules()
    ;({ useCanvasStore: store } = await import('../../store/useCanvasStore'))
    gen = await import('../../generate/traceGenerate'); P = await import('../../utils/project')
    st = () => store.getState()
  })
  const racks = () => JSON.stringify(st().objects.filter(o => /^rack_/.test(o.type)).map(o => [o.id, o.x, o.y, o.rotation]))

  it('SH-regen-undo: Regenerate writes the Wall clearance and Forklift inside its own undo step — one Ctrl+Z brings the racks and both values back together, one Ctrl+Y both forward', async () => {
    gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    if (!P.projectOf(st().elevations)) P.commitProject(store, P.newProject({ mhe: 'reach', wallClearIn: 3 }))
    const pr = P.projectOf(st().elevations), h0 = st().historyIndex, r0 = racks()
    const next = { ...pr, equipment: { ...pr.equipment, mhe: 'vna' }, rules: { ...pr.rules, wallClearIn: pr.rules.wallClearIn + 24 } }
    const out = gen.regenerateRacking({ orientation, mhe: 'vna', aisleFt: 10.5, wallClearIn: next.rules.wallClearIn, maxRunFt: 150, palletWIn: 40, palletDIn: 48, levels: 4 }, { before: () => P.commitProject(store, next) })
    expect(!!out).toBe(true)
    const r1 = racks()
    expect([st().historyIndex - h0, P.projectOf(st().elevations).rules.wallClearIn, P.projectOf(st().elevations).equipment.mhe, r1 !== r0]).toEqual([1, pr.rules.wallClearIn + 24, 'vna', true])
    st().undo()
    expect([racks() === r0, P.projectOf(st().elevations).rules.wallClearIn, P.projectOf(st().elevations).equipment.mhe, st().historyIndex]).toEqual([true, pr.rules.wallClearIn, pr.equipment.mhe, h0])
    st().redo()
    expect([racks() === r1, P.projectOf(st().elevations).rules.wallClearIn]).toEqual([true, pr.rules.wallClearIn + 24])
    // the card and Project settings hand their writes to it (never a separate step first)
    const card = read('components/Generate/GeneratePanel.jsx'), setup = read('components/Project/ProjectSetup.jsx')
    expect(between(card, 'const regenerate = () => {', 'setResult')).toMatch(/before: next \? \(\) => commitProject\(useCanvasStore, next\) : null/)
    expect(between(setup, 'const regenerate = () => {', 'setAsk(null)')).toMatch(/\{ beamIn: r\.beamIn \?\? 96, before: \(\) => write\(project\) \}/)
    expect(/write\(project\)\s+const pal/.test(setup)).toBe(false)
  })

  it('SH-gen-undo: Generate on an empty plan does the same — the building, its racks and the values come back with one Ctrl+Z', async () => {
    store.setState({ objects: [], groups: [], elevations: null, history: [JSON.stringify({ objects: [], groups: [], layers: store.getState().layers, elevations: null })], historyIndex: 0 })
    P.commitProject(store, P.newProject({ mhe: 'reach', wallClearIn: 3 }))
    const pr = P.projectOf(st().elevations), h0 = st().historyIndex
    const next = { ...pr, rules: { ...pr.rules, wallClearIn: 9 } }
    await gen.generateAndPlaceBatched({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 }, { batch: 1000, before: () => P.commitProject(store, next) })
    expect([st().historyIndex - h0, P.projectOf(st().elevations).rules.wallClearIn, st().objects.some(o => /^rack_/.test(o.type))]).toEqual([1, 9, true])
    st().undo()
    expect([P.projectOf(st().elevations).rules.wallClearIn, st().objects.some(o => /^rack_/.test(o.type)), st().historyIndex]).toEqual([3, false, h0])
  })
})

describe('SH-6 — no Simple | Detailed', () => {
  it('SH-no-detail: full screen has no Simple | Detailed switch and nothing stores a choice; the old drawing behind it is gone — any `detail` asked for draws the one sheet, never the pitch, the side clearances, the per-level chain (an Install guide export option later, never on screen) or the old uppercase labels; STUDIO.md says so', async () => {
    const dr = read('components/Elevations/ElevationDrawing.jsx'), tab = read('components/Elevations/ElevationsTab.jsx'), ed = read('utils/elevEditor.js'), drawing = read('utils/elevationDrawing.js')
    expect([/Drawing detail|'detailed'|Simple/.test(dr), /fullDetail|detail=/.test(tab), /localStorage|detail/.test(ed.slice(0, ed.indexOf('/* ── the edits')))]).toEqual([false, false, false])
    // the old drawing's code: its building lines, its chain, its uppercase labels
    expect(/const shell = |const ground = |detailed|'simple'|PITCH|CLEARANCE |CLEAR HEIGHT |DOESN'T FIT|frameDepthNote\(|compact/.test(drawing)).toBe(false)
    const { elevationLayout } = await import('../../utils/elevationDrawing'), ED = await import('../../utils/elevEditor')
    const one = (o) => elevationLayout(MOCK, 96, { w: 900, h: 600 }, { ...OPTS, view: 'both', fontPx: 9, ...o })
    for (const detail of [undefined, 'simple', 'detailed']) {
      const d = one({ detail }), s = d.items.filter(i => i.t === 'text').map(i => i.s)
      expect([detail, s.some(x => /PITCH|CLR|FRAME |BEAM |SPRINKLERS|CLEARANCE/.test(x)), d.items.some(i => ['pallet', 'gap', 'open', 'chain'].includes(i.role?.id)), s.includes('Top of load 23′-4″')]).toEqual([detail, false, false, true])
    }
    expect(JSON.stringify(one({ detail: 'detailed' }).items)).toBe(JSON.stringify(one({}).items))
    expect(['open', 'chain', 'gap', 'pallet'].every(id => ED.setDimension(MOCK, id, 1, 60) === MOCK)).toBe(true)
    expect('detail' in ED.useElevEditor.getState()).toBe(false)
    const doc = read('../STUDIO.md')
    expect(doc).toMatch(/There is no Simple \| Detailed switch: one drawing, one label set\. The per-level install chain \(pallet, gap and beam face at every level\) may return later as an \*\*Install guide\*\* export option — not on screen\./)
    expect(/Simple \| Detailed is in the full-screen view/.test(doc)).toBe(false)
  })
})

describe('SH-7 — Front | Depth in full screen', () => {
  it('SH-full-view: full screen\'s header has a Front | Depth control left of the close button — the neutral segmented style (inset track, active = separator fill + strong text), 28 high — on the card\'s own view state (one switch shows in both); D toggles it unless typing; edit on the sheet is the front view\'s: in Depth the pencil is disabled, titled "Edit in Front view", and nothing on the drawing edits', async () => {
    const dr = read('components/Elevations/ElevationDrawing.jsx'), tab = read('components/Elevations/ElevationsTab.jsx')
    const head = between(dr, 'edit on the sheet here too', '</span>\n        </div>')
    // left of the close button, after the edit actions
    expect(head.indexOf('aria-label="Elevation view"')).toBeGreaterThan(head.indexOf('Save</button>'))
    expect(head.indexOf('aria-label="Elevation view"')).toBeLessThan(head.indexOf('aria-label="Close full screen"'))
    // the neutral style, 28 high
    expect(head).toMatch(/role="group" aria-label="Elevation view"[^>]*style=\{\{ display: 'flex', height: 28, boxSizing: 'border-box', padding: 2, gap: 2, borderRadius: 6, background: C\.inset \}\}/)
    expect(head).toMatch(/\[\['front', 'Front'\], \['side', 'Depth'\]\]/)
    expect(head).toMatch(/aria-pressed=\{on\} onClick=\{\(\) => onView\(v\)\} style=\{\{ height: 24, [^}]*background: on \? C\.separator : 'transparent', color: on \? C\.strong : C\.muted/)
    const { C } = await import('../../studio/cardParts')
    expect([C.inset, C.separator, C.strong]).toEqual(['#2A2F2C', '#3A403C', '#F2F4F1'])
    // one state: the card's (useElevTab.view) — the card's Depth button and full screen's control both write it
    expect(tab).toMatch(/onView=\{\(v\) => useElevTab\.setState\(\{ view: v \}\)\} \/>/)
    expect(tab).toMatch(/onClick=\{\(\) => useElevTab\.setState\(\{ view: side \? 'front' : 'side' \}\)\}/)
    expect(tab).toMatch(/view=\{view\} height=\{sheetH\}/)
    // D, while full screen is open, unless typing or with a modifier
    const keyD = between(dr, "if (e.key !== 'd' && e.key !== 'D') return", 'window.addEventListener')
    expect(keyD).toMatch(/if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey \|\| textOwnsKey\(e\)\) return\s+e\.preventDefault\(\); e\.stopPropagation\(\); e\.stopImmediatePropagation\(\)\s+onView\(side \? 'front' : 'side'\)/)
    expect(between(dr, "const side = props.view === 'side', onView = props.onView", "if (e.key !== 'd'")).toMatch(/if \(!full \|\| !onView\) return/)
    const T = await import('../../utils/typing')
    globalThis.document.activeElement = null
    expect(T.textOwnsKey({ key: 'd', target: { tagName: 'INPUT', isContentEditable: false } })).toBe(true)   // typing: the text's
    // Depth: the pencil disabled with its title; the drawing read-only there
    expect(head).toMatch(/aria-label="Edit on the sheet" title=\{side \? 'Edit in Front view' : 'Edit on sheet'\} disabled=\{side\} onClick=\{side \? undefined : props\.onEdit\} style=\{\{[^}]*cursor: side \? 'not-allowed' : 'pointer', opacity: side \? 0\.45 : 1/)
    expect(dr).toMatch(/<DrawingCore \{\.\.\.props\} sheetEdit=\{sheetEdit && !side\} readOnly=\{props\.readOnly \|\| \(sheetEdit && side\)\} fill height=\{null\}/)
  })
})
