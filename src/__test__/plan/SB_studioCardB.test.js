// SB — Studio step 2b: the Elevations list (C2), the new-elevation editor (C3) and Generate / Regenerate (C4) in the right
// card (design/studio/Studio.dc.html panels "elev", "edit", "gen"; STUDIO.md §2, §5, §7). One break-it test per
// behaviour: each fails when the behaviour it names is undone.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null }
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } }
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const between = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b, s.indexOf(a)) : undefined)

/* the mockup's elevation (C2): 30′ ceiling, sprinkler clearance 18″, beams at 4′-10″ … 19′-4″, a 21′ frame, 48″ loads */
const MOCK = { id: 'a', name: 'x', color: '#D98324', uprightHeightIn: 252, clearanceIn: 6, beamFaceIn: 4, holePitchIn: 2, levels: [0, 58, 116, 174, 232].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2500 })) }

describe('SB — the sheet (C2, C3)', () => {
  it('SB-sheet: the drawing sits on a white sheet with a 14px #EFEEE9 grid and radius 8, nothing on it but the drawing; a grab handle under it; 420 high under the list and 290 over the editor until dragged; double-click forgets the drag', async () => {
    const tab = read('components/Elevations/ElevationsTab.jsx')
    const sheet = between(tab, 'data-drawing-box data-sheet', 'role="separator"')
    expect(sheet).toMatch(/margin: '0 12px', height: sheetH,[^}]*borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF', backgroundImage: 'linear-gradient\(#EFEEE9 1px, transparent 1px\), linear-gradient\(90deg, #EFEEE9 1px, transparent 1px\)', backgroundSize: '14px 14px'/)
    expect(/<button|<Btn|FixButton|IconBtn/.test(sheet)).toBe(false)                                   // no buttons on the drawing
    expect(sheet).toMatch(/controls=\{false\}/)
    expect(tab).toMatch(/const SHEET_LIST = 420, SHEET_EDIT = 290/)
    expect(tab).toMatch(/full \? Math\.max\(Math\.min\(200, SHEET_EDIT\), Math\.min\(SHEET_EDIT, room - formNeed\)\) : Math\.min\(SHEET_LIST, room - LIST_MIN\)/)
    expect(between(tab, 'role="separator"', '{/* 2.')).toMatch(/height: HANDLE[\s\S]*width: 32, height: 3, borderRadius: 2, background: C\.separator/)
    expect(tab).toMatch(/const HANDLE = 12 /)
    // the drawing is transparent on the sheet, so the grid shows; its labels keep a white halo
    expect(read('components/Elevations/ElevationDrawing.jsx')).toMatch(/background: paper \? 'transparent' : 'var\(--surface\)'/)
    const T = await import('../../utils/elevTab')
    T.setElevSplit(0.5); expect(T.useElevSplit.getState().split).toBe(0.5)
    T.resetElevSplit(); expect([T.useElevSplit.getState().split, localStorage.getItem('trace.elevsplit.v1')]).toEqual([null, null])
  })

  it('SB-labels: the sheet draws exactly STUDIO.md §7\'s labels — Ceiling, Max load height (sprinklers −18″), free + top of load stacked far left, Frame, beam heights on the right, L tags inside the right pallet, the pallet\'s height and width inside L1, face and lift-off left of L1, "Beam · pallets · lb" under the rack — and nothing else', async () => {
    const { elevationLayout } = await import('../../utils/elevationDrawing')
    const d = elevationLayout(MOCK, 96, { w: 274, h: 420 }, { palletWIn: 40, depthIn: 42, building: { clearHeightIn: 360, sprinklerIn: null }, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front', bg: '#FFFFFF' })
    const texts = d.items.filter(i => i.t === 'text'), s = texts.map(i => i.s)
    for (const want of ['Ceiling 30′-0″', 'Max load height 28′-6″ (18″ below sprinklers)', '5′-2″ free', 'Top of load 23′-4″', 'Frame 21′-0″', '4′-10″', '9′-8″', '14′-6″', '19′-4″', 'L1', 'L2', 'L3', 'L4', 'L5', '48″', '40″', '4″', '6″', 'Beam 96″ · 2 pallets · 2,500 lb']) expect([want, s.includes(want)]).toEqual([want, true])
    expect(s.length).toBe(19)                                                                           // nothing else: no pitch, no clearances, no chain
    expect(s.some(x => /PITCH|CLR|CLEAR HEIGHT|FRAME|BEAM /.test(x))).toBe(false)
    expect(texts.every(i => /Plus Jakarta Sans/.test(i.font))).toBe(true)
    // the values 600 in the dimension blue, the words grey (the mockup's tspans)
    const frame = texts.find(i => i.s === 'Frame 21′-0″')
    expect([frame.rot, frame.runs]).toEqual([-90, [{ s: 'Frame ' }, { s: '21′-0″', fill: '#1B4FD8', weight: 600 }]])
    // the level tags inside the right pallet, top-right (8.5 / 600 #8A7A55)
    const loads = d.items.filter(i => i.t === 'rect' && i.tag === 'load' && i.h > 10)
    for (let k = 0; k < 5; k++) {
      const right = loads.filter(r => r.level === k).sort((a, b) => b.x - a.x)[0], tag = texts.find(i => i.s === `L${k + 1}`)
      expect([k, tag.x <= right.x + right.w && tag.x > right.x, tag.y > right.y && tag.y < right.y + right.h, tag.fill, tag.weight]).toEqual([k, true, true, '#8A7A55', 600])
    }
    // the pallet's height and width inside the L1 pallets
    const l1 = loads.filter(r => r.level === 0).sort((a, b) => a.x - b.x)
    const h = texts.find(i => i.s === '48″'), w = texts.find(i => i.s === '40″')
    expect([h.x > l1[0].x && h.x < l1[0].x + l1[0].w, w.x > l1[1].x && w.x < l1[1].x + l1[1].w]).toEqual([true, true])
    // face and lift-off left of the left upright; the free / top of load column left of the frame column
    const up = d.items.find(i => i.tag === 'upright')
    expect(['4″', '6″'].every(v => texts.find(i => i.s === v).x < up.x)).toBe(true)
    expect(texts.find(i => i.s === '5′-2″ free').x).toBeCloseTo(texts.find(i => i.s === 'Top of load 23′-4″').x, 5)
    expect(texts.find(i => i.s === 'Top of load 23′-4″').x < frame.x).toBe(true)
    // the paper palette: uprights and beams #14392B, the ceiling dashed 6 4, the max load line dashed 5 3, the band at 22%
    expect(d.items.filter(i => i.tag === 'upright' || i.tag === 'beam').every(i => i.fill === '#14392B')).toBe(true)
    expect([d.items.find(i => i.tag === 'clear').dash, d.items.find(i => i.tag === 'max-load').dash, d.items.find(i => i.tag === 'band').opacity]).toEqual(['6 4', '5 3', 0.22])
    // the other drawings (full screen, the PDF) keep their own set
    const old = elevationLayout(MOCK, 96, { w: 600, h: 500 }, { palletWIn: 40, building: { clearHeightIn: 360 }, view: 'front' }).items.filter(i => i.t === 'text').map(i => i.s)
    expect(old.some(x => /^FRAME /.test(x))).toBe(true)
  })
})

describe('SB — the list (C2)', () => {
  it('SB-list: "In this layout" with Depth and Full screen (inset 28h); 48h rows — swatch, name without its ceiling, sub line (ceiling · beam if not default · bays in mono), DEFAULT, More; the picked row in the active fill; Apply (primary, disabled at 45% when no row is selected) and New (ghost)', () => {
    const tab = read('components/Elevations/ElevationsTab.jsx'), list = between(tab, 'function List(', 'function Editor(')
    expect(list).toMatch(/<span style=\{caption\}>In this layout<\/span>\s*<SheetButtons view=\{view\} onFull=\{onFull\} \/>/)
    expect(tab).toMatch(/const inset28 = \(on\) => \(\{ height: 28, padding: '0 10px',[^)]*background: on \? C\.active : C\.inset/)
    expect(list).toMatch(/height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 0 10px', borderRadius: 8, cursor: 'pointer', background: on \? C\.active : 'transparent'/)
    expect(list).toMatch(/const title = !t\.named && ceil\?\.name \? name\.replace\(` · \$\{ceil\.name\}`, ''\) : name/)
    expect(list).toMatch(/<span style=\{\{ fontFamily: MONO \}\}>\{counts\.get\(t\.id\) \|\| 0\}<\/span> bays/)
    expect(list).toMatch(/background: C\.island, color: C\.accent, fontSize: 10, fontWeight: 600, letterSpacing: '\.06em'[^>]*>DEFAULT<\/span>/)
    expect(list).toMatch(/<IconBtn name="More" label=\{`\$\{name\} menu`\}/)
    expect(list).toMatch(/<Btn kind="primary" disabled=\{!canApply\}[\s\S]*opacity: canApply \? 1 : 0\.45, cursor: canApply \? 'pointer' : 'not-allowed'/)
    expect(list).toMatch(/<Btn kind="ghost" disabled=\{!pr\} onClick=\{\(\) => startNew\(store\)\}[^>]*><Plus \/>New<\/Btn>/)
    // a picked row has no hover change (STUDIO.md §5): it carries data-on, the hover rule skips it
    expect(list).toMatch(/className="st-hov" data-on=\{on \|\| undefined\}/)
  })

  it('SB-more: a row\'s More opens a menu in the layout menu\'s look — colour, Duplicate, Set as default, Remove unused elevations, Delete (Edit is the row\'s pencil)', () => {
    const menu = between(read('components/Elevations/ElevationsTab.jsx'), 'function RowMenu(', 'export function ElevationsTab(')
    expect(/item\('Edit'/.test(menu)).toBe(false)
    const order = ['aria-label="Elevation colour"', "item('Duplicate',", "item('Set as default',", "item('Remove unused elevations', () => removeUnused(store))", "item('Delete',"]
    expect(order.map(k => menu.indexOf(k)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]))).toBe(true)
    expect(menu).toMatch(/width: MENU_W, padding: 6, borderRadius: 10, background: C\.island, border: '1px solid #323835', boxShadow: '0 16px 40px rgba\(15,18,16,\.3\)'/)
    expect(read('components/Elevations/ElevationsTab.jsx')).toMatch(/const menuRow = \{ height: 34, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', border: 0, borderRadius: 6,/)
  })
})

describe('SB — the editor (C3)', () => {
  it('SB-editor: Back · title · Depth · Full screen; Name and Ceiling typed (30h, 56px labels); the Pallet box (Depth · Width · Height · Weight, 26h mono) and the Rack box (Frame depth · Beam size · Beam length, the frame warning inside it with its amber Set to N″); Cancel (ghost) and Save elevation (primary)', () => {
    const ed = between(read('components/Elevations/ElevationsTab.jsx'), 'function Editor(')
    expect(ed).toMatch(/aria-label="Back" title="Back to the list \(Esc\)" onClick=\{cancelEdit\}/)
    expect(ed).toMatch(/<InlineField label="Name">/)
    expect(ed).toMatch(/<InlineField label="Ceiling">\s*<Typed kind="ftin" aria="Elevation ceiling"/)
    expect(/<select|SelectField|<option/.test(ed)).toBe(false)                                          // no dropdowns, no presets
    expect(ed).toMatch(/role="group" aria-label="Pallet" style=\{box\}>\s*<span style=\{caption\}>Pallet<\/span>/)
    expect(ed).toMatch(/\[\['depthIn', 'Depth', 'in'\], \['faceIn', 'Width', 'in'\], \['heightIn', 'Height', 'in'\], \['weightLb', 'Weight', 'lb'\]\]/)
    expect(ed).toMatch(/role="group" aria-label="Rack" style=\{box\}>\s*<span style=\{caption\}>Rack<\/span>/)
    expect(ed.indexOf('aria-label="Pallet depth"') > ed.indexOf('aria-label="Rack"')).toBe(true)          // the frame warning inside the Rack box
    expect(read('components/Elevations/ElevationsTab.jsx')).toMatch(/background: '#F2C77A', color: '#3A2E17', fontSize: 12, fontWeight: 600[\s\S]{0,120}Set to \{to\}″/)
    expect(ed).toMatch(/<Btn kind="ghost" onClick=\{cancelEdit\}>Cancel<\/Btn>\s*<Btn kind="primary" onClick=\{save\} style=\{\{ flex: 1 \}\}>Save elevation<\/Btn>/)
    expect(read('components/Elevations/ElevationsTab.jsx')).toMatch(/const shown = e \? \{ \.\.\.e\.draft, id: e\.id \|\| 'draft' \} : active/)   // the sheet follows the draft
  })

  it('SB-pallet-fields: a typed value shows its unit (40″, 30′-0″) and the weight its thousands (2,500), all of it selected on focus; a value that does not parse goes back', () => {
    const f = between(read('components/Elevations/ElevationsTab.jsx'), 'function Typed(', 'const primes')
    expect(f).toMatch(/kind === 'ftin' \? primes\(ftInDash\(value\)\) : kind === 'lb' \? Math\.round\(value\)\.toLocaleString\('en-US'\) : `\$\{Math\.round\(value \* 100\) \/ 100\}″`/)
    expect(f).toMatch(/requestAnimationFrame\(\(\) => el\.select\(\)\)/)
    expect(f).toMatch(/if \(raw && Number\.isFinite\(v\) && v > 0 && v !== value\) onCommit\(v\); else setText\(shown\)/)
  })
})

describe.each(['horizontal', 'vertical'])('SB — Generate / Regenerate (C4), %s', (orientation) => {
  let st, gen, G, store
  beforeEach(async () => {
    vi.resetModules()
    ;({ useCanvasStore: store } = await import('../../store/useCanvasStore'))
    gen = await import('../../generate/traceGenerate')
    G = await import('../../utils/genFields')
    st = () => store.getState()
  })

  it('SB-gen-fields: the card\'s building fields feed Generate (Building width / length, Column grid, Max run, Columns along wall, Row direction) and are filled from the project\'s building when the card opens', async () => {
    const P = await import('../../utils/project')
    G.useGenFields.setState({ lengthFt: 200, widthFt: 100, gridXFt: 40, gridYFt: 50, maxRunFt: 120, columnsAlongWall: true, orientation })
    const b = G.genBrief(P.newProject({ mhe: 'reach', wallClearIn: 3 }), { reach: { aisleFt: 10.5 } })
    expect([b.lengthFt, b.widthFt, b.gridXFt, b.gridYFt, b.maxRunFt, b.columnsAlongWall, b.orientation, b.wallClearIn, b.aisleFt]).toEqual([200, 100, 40, 50, 120, true, orientation, 3, 10.5])
    G.fillGenFields({ building: { lengthFt: 300, widthFt: 150, orientation: 'auto', columnsAlongWall: false } })
    expect([G.useGenFields.getState().lengthFt, G.useGenFields.getState().widthFt, G.useGenFields.getState().orientation, G.useGenFields.getState().columnsAlongWall]).toEqual([300, 150, 'auto', false])
    const card = read('components/Generate/GeneratePanel.jsx')
    expect(card).toMatch(/useEffect\(\(\) => \{ fillGenFields\(project\) \}, \[\]\)/)
    expect(card).toMatch(/<Seg aria="Row direction" value=\{f\.orientation\}[\s\S]*?options=\{\[\{ value: 'auto', label: 'Auto' \}, \{ value: 'horizontal', label: 'Horizontal' \}, \{ value: 'vertical', label: 'Vertical' \}\]\}/)
    expect(card).toMatch(/<Seg aria="Columns along wall" value=\{f\.columnsAlongWall\}[\s\S]*?options=\{\[\{ value: true, label: 'Yes' \}, \{ value: false, label: 'No' \}\]\}/)
    // the grid: two columns of 30h fields; Column grid alone on its row so Max run and Wall clearance share the last
    expect(card).toMatch(/gridTemplateColumns: 'repeat\(2, minmax\(0, 1fr\)\)', gap: 10/)
    expect(card).toMatch(/<div style=\{\{ gridColumn: '1 \/ -1' \}\}>\s*<Field label="Column grid">/)
    expect(/Clear height/.test(card)).toBe(false)                                                       // left out: Generate never uses one
  })

  it('SB-gen-layout: on a layout the card says "Keeps zones, doors and columns. Replaces racking." (with the hand edits it loses) and its primary regenerates — the building, zones and hand-placed racks kept; the label is Regenerate when racks exist, Generate on an empty plan', () => {
    gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const R0 = st().objects.filter(o => /^rack_/.test(o.type)).length, fp = st().objects.find(o => o.type === 'fp_rect')
    expect(R0).toBeGreaterThan(0)
    const out = gen.regenerateRacking(G.genBrief(null, { reach: { aisleFt: 10.5 } }), {})
    expect(!!out).toBe(true)
    expect([st().objects.find(o => o.type === 'fp_rect')?.id, st().objects.some(o => /^rack_/.test(o.type))]).toEqual([fp.id, true])   // the same building, racks again
    const card = read('components/Generate/GeneratePanel.jsx'), frame = read('studio/StudioFrame.jsx')
    expect(card).toMatch(/const label = hasRacks \? 'Regenerate' : 'Generate'/)
    expect(card).toMatch(/\{label\} layout<\/span>/)
    expect(frame).toMatch(/const genLabel = hasRacks \? 'Regenerate' : 'Generate'/)
    expect(card).toMatch(/\{ask && \(\s*<Note level="warning" data-testid="regen-edits"/)
  })

  it('SB-gen-project: Forklift and Wall clearance in the card are the project\'s — the run writes them to Project settings in one undo step', async () => {
    gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    const P = await import('../../utils/project')
    if (!P.projectOf(st().elevations)) P.commitProject(store, P.newProject({ mhe: 'reach', wallClearIn: 3 }))
    const pr = P.projectOf(st().elevations), h0 = st().historyIndex
    P.commitProject(store, G.projectWithDraft(pr, { wallClearIn: 6 }))                                   // what the run calls
    expect([P.projectOf(st().elevations).rules.wallClearIn, st().historyIndex]).toEqual([6, h0 + 1])
    st().undo()
    expect(P.projectOf(st().elevations).rules.wallClearIn).toBe(pr.rules.wallClearIn)
    const card = read('components/Generate/GeneratePanel.jsx')
    expect(card).toMatch(/<select aria-label="Forklift" value=\{mhe\} disabled=\{!project\} onChange=\{e => setDraft\(d => \(\{ \.\.\.d, mhe: e\.target\.value \}\)\)\}/)
    expect(card).toMatch(/\{mheOptions\[mhe\]\?\.label \|\| mhe\} · <span style=\{\{ fontFamily: MONO, fontSize: 12 \}\}>\{ftIn\(aisleFt\)\}<\/span><Icon name="Chevron"/)
  })
})

describe('SB — the Generate card\'s note, footer and Start over', () => {
  it('SB-gen-note: the blue note says where the rest comes from — the pallet from Project settings, frame and flue from Rules (the values Generate uses: layoutSpec) — each name opening its dialog', async () => {
    const card = read('components/Generate/GeneratePanel.jsx')
    expect(card).toMatch(/Pallet \{pallet \? pallet\.name : '—'\} comes from <button type="button" onClick=\{\(\) => openSetup\('settings'\)\} style=\{linkSt\}>Project settings<\/button>;/)
    expect(card).toMatch(/frame \{spec\.depthIn\}″ and flue \{spec\.flueIn\}″ from <button type="button" onClick=\{\(\) => useViewPrefs\.getState\(\)\.setRulesOpen\(true\)\} style=\{linkSt\}>Rules<\/button>\./)
    expect(card).toMatch(/const spec = useMemo\(\(\) => layoutSpec\(\{\}, rules\), \[rules\]\)/)
    const { layoutSpec } = await import('../../generate/sizingLayout')
    expect([layoutSpec({}, { selective: { frameDepthsIn: [36, 42] } }).depthIn, layoutSpec({}, { selective: {} }).flueIn]).toEqual([42, 9])
    // the Rules dialog opens from the frame's own state, which the menu and the note share
    expect(read('studio/StudioFrame.jsx')).toMatch(/const rules = useViewPrefs\(s => s\.rulesOpen\), setRules = useViewPrefs\.getState\(\)\.setRulesOpen/)
    const { useViewPrefs } = await import('../../studio/viewPrefs')
    useViewPrefs.getState().setRulesOpen(true); expect(useViewPrefs.getState().rulesOpen).toBe(true)
  })

  it('SB-gen-card: Generate opens inside the right card (no modal), dark, 300 wide like every card state; header with the Generate icon and X; footer Cancel (ghost) and the primary; X and Cancel go back to the card that was showing', () => {
    const frame = read('studio/StudioFrame.jsx'), card = read('components/Generate/GeneratePanel.jsx')
    expect(frame).toMatch(/: card === 'generate'\s*\? <div data-card-dark style=\{\{ flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' \}\}>/)
    expect(frame).toMatch(/<GeneratePanel embedded onClose=\{\(\) => useViewPrefs\.getState\(\)\.setCard\('tabs'\)\} \/>/)
    expect(frame).toMatch(/right: 16, top: 76, width: cardW, maxHeight: 'calc\(100vh - 152px\)',/)
    expect(/height: full \?/.test(frame)).toBe(false)                                                 // every state as tall as its content
    expect(card).toMatch(/<Icon name="Generate" active \/>/)
    expect(card).toMatch(/aria-label="Close" onClick=\{\(\) => onClose\?\.\(\)\}/)
    expect(card).toMatch(/<Btn kind="ghost" onClick=\{\(\) => onClose\?\.\(\)\}>Cancel<\/Btn>\s*<Btn kind="primary" onClick=\{run\}/)
    expect(/position: 'fixed'|role="dialog"|var\(--surface\)/.test(card)).toBe(false)
    // the Elevations tab is dark too, in the same card
    expect(frame).toMatch(/<div data-card-dark style=\{\{ flex: '0 1 auto', minHeight: 0, overflowY: full \? 'hidden' : 'auto'/)
  })

  it('SB-start-over: Start over with a new building is in the layout menu, behind a confirm, drawing the new building from the Generate card\'s fields — never in the Generate card', () => {
    const menu = read('components/Toolbar/TopBar.jsx'), card = read('components/Generate/GeneratePanel.jsx')
    const file = between(menu, '<MenuGroup label="File" first>', '<MenuGroup label="Edit">')
    expect(file).toMatch(/<MenuItem onClick=\{\(\) => setConfirmStart\(true\)\}>Start over with a new building…<\/MenuItem>/)
    expect(file).toMatch(/Everything in this layout goes\. A new \{gen\.widthFt\}′ × \{gen\.lengthFt\}′ building is drawn and generated/)
    expect(file).toMatch(/onClick=\{\(\) => setConfirmStart\(false\)\}[^>]*>Cancel<\/button>[\s\S]*onClick=\{startOver\}[^>]*>Start over<\/button>/)
    expect(/>Start over|setAsk|Regenerate or start over/.test(card)).toBe(false)
    expect(read('utils/genFields.js')).toMatch(/export function startOverLayout\(store, \{ rules, mheOptions, onProgress, project = null, before = null \} = \{\}\) \{[\s\S]*?return generateAndPlaceBatched\(genBrief\(project \|\| projectOf\(store\.getState\(\)\.elevations\), mheOptions\), \{ onProgress, rules, before \}\)/)
  })
})

describe('SB — review fixes', () => {
  it('SB-names: a pallet reads depth first, as the industry says it — "48×40", never "40×48" — in an elevation\'s auto name (list rows, the editor\'s auto name, full screen title), the pallet options, a rack\'s pallet size, the PDF and the plan legend; the stored pallet is unchanged', async () => {
    const P = await import('../../utils/project'), E = await import('../../utils/elevations')
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360 }], defaultCeilingId: 'c' }
    const pal = pr.pallets[0]
    expect([pal.faceIn, pal.depthIn]).toEqual([40, 48])                                                 // stored: face 40, depth 48
    const t = { ...E.makeType ? E.makeType('a', 5) : { id: 'a', levels: [0, 60, 120, 180, 240].map(beamIn => ({ beamIn, palletHeightIn: 48 })) }, id: 'a', named: false, ceilingId: 'c', palletId: pal.id }
    const T = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [t] }, pr)
    expect(P.nameOf(T, t)).toMatch(/^\d+ levels · 48×40 · Main$/)
    const deep = { ...pal, id: 'p60', faceIn: 40, depthIn: 60 }
    const T2 = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...t, palletId: 'p60' }] }, { ...pr, pallets: [pal, deep] })
    expect(P.nameOf(T2, T2.types[0])).toMatch(/· 60×40 · Main$/)
    expect(P.previewName(T2, { ...t, palletId: 'p60' }, null)).toMatch(/· 60×40 · Main$/)                // the editor's auto name
    // a renamed elevation keeps its own name
    expect(P.nameOf(T, { ...t, named: true, name: 'Bulk 40x48' })).toBe('Bulk 40x48')
    // every place a pallet size or an elevation name is written
    expect(/\{p\.name\} · \{p\.depthIn\}/.test(read('components/Elevations/ElevationsTab.jsx'))).toBe(false)     // a size never twice
    expect(read('components/RightPanel/panels/RackRowPanelCore.jsx')).toMatch(/\{obj\.palletDIn \|\| 48\}×\{obj\.palletWIn \|\| 40\}<\/span>/)
    expect(read('export/pdfExport.js')).toMatch(/\$\{esc\(nameOf\(table, type\)\)\}/)
    expect(read('export/pdfExport.js').includes('const label = `${nameOf(T, type)} · ')).toBe(true)
    expect(read('canvas2/ElevationsCanvas.jsx')).toMatch(/\{nameOf\(elevations, type\)\}/)
    expect(read('studio/cards.jsx')).toMatch(/\{t \? nameOf\(T, t\) :/)
    expect(read('components/Elevations/ElevationLine.jsx')).toMatch(/return t \? nameOf\(T, t\) : '—'/)
    for (const f of ['utils/elevFit.js', 'components/Elevations/ElevationsTab.jsx', 'export/pdfExport.js', 'studio/cards.jsx']) expect([f, /faceIn\}×\$?\{?[a-z.]*depthIn/.test(read(f))]).toEqual([f, false])
  })

  it('SB-assumed: a ceiling not set reads "Ceiling 24 ft (assumed)" in grey, and a load above that assumed ceiling is never flagged red — red only against a ceiling the user set', async () => {
    const { elevationLayout } = await import('../../utils/elevationDrawing')
    const tall = { ...MOCK, uprightHeightIn: 300, levels: [0, 60, 120, 180, 240].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2500 })) }   // top of load 24'
    const draw = (building) => elevationLayout(tall, 96, { w: 274, h: 420 }, { palletWIn: 40, building, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front' })
    const red = (d) => d.items.filter(i => i.fill === '#C0452A' || i.stroke === '#C0452A' || i.runs?.some(r => r.fill === '#C0452A'))
    const assumed = draw({ clearHeightIn: 288, sprinklerIn: null, assumed: true })
    const ceil = assumed.items.find(i => i.t === 'text' && /^Ceiling/.test(i.s))
    expect([ceil.s, ceil.fill, ceil.runs]).toEqual(['Ceiling 24 ft (assumed)', '#767C74', undefined])
    expect(red(assumed)).toEqual([])                                                                    // no red "over", no red load
    expect(assumed.items.some(i => i.t === 'text' && / over$/.test(i.s))).toBe(false)
    const set = draw({ clearHeightIn: 288, sprinklerIn: null })                                         // the same 24', set by the user
    expect(set.items.some(i => i.t === 'text' && / over$/.test(i.s))).toBe(true)
    expect(red(set).length).toBeGreaterThan(0)
    expect(set.items.find(i => i.t === 'text' && /^Ceiling/.test(i.s)).s).toBe('Ceiling 24′-0″')
  })

  it('SB-gen-cancel: Forklift and Wall clearance changed in the Generate card are a draft — Cancel or X leaves Project settings as it was; they are written only when Generate / Regenerate runs', async () => {
    const G = await import('../../utils/genFields'), P = await import('../../utils/project')
    const pr = P.newProject({ mhe: 'reach', wallClearIn: 3 })
    expect(G.projectWithDraft(pr, {})).toBe(null)
    expect(G.projectWithDraft(pr, { mhe: 'reach', wallClearIn: 3 })).toBe(null)                          // changed back: nothing to write
    const next = G.projectWithDraft(pr, { mhe: 'vna', wallClearIn: 6 })
    expect([next.equipment.mhe, next.rules.wallClearIn, pr.equipment.mhe, pr.rules.wallClearIn]).toEqual(['vna', 6, 'reach', 3])
    const card = read('components/Generate/GeneratePanel.jsx')
    // the fields only change the draft; the runs alone write it — each inside its own undo step (`before`, job 2c)
    expect((card.match(/commitProject\(/g) || []).length).toBe(2)
    expect(between(card, 'const startOver = async () => {', 'finally')).toMatch(/const next = projectWithDraft\(project, draft\)\s+setDraft\(\{\}\)[\s\S]*startOverLayout\(useCanvasStore, \{[^}]*project: next, before: next \? \(\) => commitProject\(useCanvasStore, next\) : null \}\)/)
    expect(between(card, 'const regenerate = () => {', 'setResult')).toMatch(/const next = projectWithDraft\(project, draft\), pr = next \|\| project\s+setDraft\(\{\}\)\s+const outcome = regenerateRacking\(genBrief\(pr, mheOptions\), \{[^}]*before: next \? \(\) => commitProject\(useCanvasStore, next\) : null \}\)/)
    // Cancel and X only close (the draft is the card's state: it goes with the card)
    expect(card).toMatch(/<Btn kind="ghost" onClick=\{\(\) => onClose\?\.\(\)\}>Cancel<\/Btn>/)
    expect(card).toMatch(/aria-label="Close" onClick=\{\(\) => onClose\?\.\(\)\}/)
    expect(card).toMatch(/const \[draft, setDraft\] = useState\(\{\}\)/)
  })
})
