// SG — studio-fixes-1, round 2 (the 2c design update: STUDIO.md §7, Studio.dc.html panels "elev" / "edit" / "sheet").
// One break-it test per behaviour:
//   1 max load = the sprinkler height − 18″ (no sprinkler height: the ceiling − 18″); a sprinkler height above its ceiling
//     is a field error in Project settings and cannot be saved
//   2 the elevation sheet has square corners
//   3 edit on the sheet (C21): the pencil; the list collapses to the row, the sheet grows; drag snaps to the hole pitch;
//     a click types a blue value; + Add level; − on the top level; dotted underlines; a level over max load red; one
//     undo step; Esc cancels
//   4 More → Full edit: C3 on that elevation, "Edit elevation · N bays"
//   5 C3: every value typed, no dropdowns; the frame warning in the Rack box; Frame depth and Beam length from the rows
//   6 Project settings → Storage → Uprights: Hole pitch, 2″
//   7 the right card's left edge widens it, 300–640, double-click resets, remembered, one width for every tab
//   8 pallet sizes read depth × width once (48×40)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { R } from './fixtures'

globalThis.document = globalThis.document || { getElementById: () => null, querySelector: () => null }
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } }
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const between = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b, s.indexOf(a)) : undefined)
const T5 = { id: 'a', name: 'x', color: '#D98324', uprightHeightIn: 252, clearanceIn: 6, beamFaceIn: 4, holePitchIn: 2, levels: [0, 58, 116, 174, 232].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2500 })) }
const draw = async (building, more = {}) => (await import('../../utils/elevationDrawing')).elevationLayout(more.t || T5, 96, { w: 274, h: 560 }, { palletWIn: 40, building, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front', bg: '#FFFFFF', ...more })
const texts = (d) => d.items.filter(i => i.t === 'text').map(i => i.s)

describe('SG-1 — max load height', () => {
  it('SG-maxload: the max load height is the sprinkler height less 18″, else the ceiling less 18″ — labelled "(18″ below sprinklers)"; the band runs between the ceiling and it', async () => {
    expect(texts(await draw({ clearHeightIn: 360, sprinklerIn: 336 }))).toEqual(expect.arrayContaining(['Max load height 26′-6″ (18″ below sprinklers)']))
    expect(texts(await draw({ clearHeightIn: 360, sprinklerIn: null }))).toEqual(expect.arrayContaining(['Max load height 28′-6″ (18″ below sprinklers)']))
    expect(read('utils/elevationDrawing.js')).toMatch(/const maxLoadS = ceilS \? \(bSprink \|\| bClear\) - sprinklerClearanceIn : null/)
  })
  it('SG-sprinkler-error: in Project settings a sprinkler height above its ceiling is a field error and Save does nothing', async () => {
    const { sprinklerError } = await import('../../components/Project/ProjectSetup.jsx')
    expect([sprinklerError({ clearHeightIn: 360, sprinklerIn: 384 }), sprinklerError({ clearHeightIn: 360, sprinklerIn: 360 }), sprinklerError({ clearHeightIn: 360, sprinklerIn: null }), sprinklerError({ clearHeightIn: null, sprinklerIn: 384 })]).toEqual(['Sprinkler height above the ceiling', null, null, null])
    const ui = read('components/Project/ProjectSetup.jsx')
    expect(ui).toMatch(/<NumIn aria="Sprinkler height \(ft\)"[^>]*error=\{sprinklerError\(c\)\}/)
    expect(ui).toMatch(/const hasError = pr\.ceilings\.some\(sprinklerError\)/)
    expect(ui).toMatch(/const save = \(\) => \{\s+if \(hasError\) return/)
    expect(ui).toMatch(/disabled=\{!!ask \|\| hasError\}/)
  })
})

describe('SG-1b — the max load label fits', () => {
  it('SG-maxload-short: where "Max load height N (18″ below sprinklers)" does not fit the sheet\'s width it reads "Max load N" — on the 6-level draft C3 opens on, never running to the edge; with room, the full label', async () => {
    const P = await import('../../utils/project'), F = await import('../../utils/elevFit'), { elevationLayout } = await import('../../utils/elevationDrawing')
    const pr = P.newProject(), ceiling = { id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 360 }
    const draft = { ...F.bestFitFor(pr, ceiling, P.defaultPallet(pr)), id: 'draft' }
    expect(draft.levels.length).toBe(6)                                                                  // the draft C3 opens on (30′ ceiling)
    const lab = (box) => elevationLayout(draft, 96, box, { palletWIn: 40, building: { clearHeightIn: 360, sprinklerIn: 360 }, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front' }).items.find(i => i.t === 'text' && /^Max load/.test(i.s))
    const right = (l) => l.x + l.s.length * l.size * 0.53
    const c3 = lab({ w: 274, h: 238 })                                                                    // C3's sheet
    expect([c3.s, right(c3) <= 274 - 4]).toEqual(['Max load 28′-6″', true])
    const narrow = lab({ w: 100, h: 238 })                                                               // tighter still: it slides left, off the edge
    expect([narrow.s, right(narrow) <= 100 - 4, narrow.x >= 0]).toEqual(['Max load 28′-6″', true, true])
    // C2's elevation on C2's sheet: the full label, slid left (no further than the Ceiling label) to stay off the edge
    const c2 = elevationLayout(T5, 96, { w: 274, h: 420 }, { palletWIn: 40, building: { clearHeightIn: 360, sprinklerIn: null }, sprinklerClearanceIn: 18, fontPx: 9, detail: 'studio', view: 'front' }).items.filter(i => i.t === 'text')
    const c2max = c2.find(i => /^Max load/.test(i.s)), c2ceil = c2.find(i => /^Ceiling/.test(i.s))
    expect([c2max.s, right(c2max) <= 274 - 4, c2max.x >= c2ceil.x]).toEqual(['Max load height 28′-6″ (18″ below sprinklers)', true, true])
    const wide = lab({ w: 560, h: 420 })                                                                  // the card widened
    expect([wide.s, right(wide) <= 560 - 4]).toEqual(['Max load height 28′-6″ (18″ below sprinklers)', true])
  })
})

describe('SG-2 — square corners', () => {
  it('SG-square: the elevation sheet has square corners (radius 0) — the card\'s sheet in every state', () => {
    const tab = read('components/Elevations/ElevationsTab.jsx')
    expect(tab).toMatch(/data-drawing-box data-sheet style=\{\{ margin: '0 12px', height: sheetH, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRadius: 0,/)
    expect(/data-sheet style=\{\{[^}]*borderRadius: 8/.test(tab)).toBe(false)
  })
})

describe('SG-3 — edit on the sheet (C21)', () => {
  it('SG-sheet-marks: in edit mode the sheet draws a handle at each beam end (the active one filled), the snap hint over the active beam, a dotted underline under each typeable value (beam heights, the pallet\'s height and width — never the 96″ beam), + Add level over the top load and − on the top level', async () => {
    const d = await draw({ clearHeightIn: 360, sprinklerIn: 360 }, { edit: { hint: '2″' }, active: 'beam:2' })
    const handles = d.items.filter(i => i.tag === 'handle')
    expect(handles.length).toBe(8)                                                                       // four beams, two ends
    expect(handles.filter(h => h.fill === '#2E7D5B').length).toBe(2)                                     // the active beam's
    expect(d.items.find(i => i.tag === 'snap-hint')?.s).toBe('2″ steps')                                 // text only, no arrow glyph
    const under = d.items.filter(i => i.tag === 'editable')
    expect(under.length).toBe(5)                                                                         // three beam heights (the active one boxed) + 48″ + 40″
    const beamLabel = d.items.find(i => i.tag === 'beam-label')
    expect(under.some(u => Math.abs(u.y1 - beamLabel.y) < 6)).toBe(false)                               // 96″: no underline
    const add = d.items.find(i => i.tag === 'add-level'), topLoad = Math.min(...d.items.filter(i => i.tag === 'load').map(i => i.y))
    expect([add.role.kind, add.y + add.h < topLoad, add.dash != null, add.stroke]).toEqual(['add', true, true, '#2E7D5B'])
    expect(d.items.find(i => i.tag === 'remove-level')?.role).toEqual({ kind: 'remove', k: 4 })
    expect(d.items.find(i => i.tag === 'remove-level-bar')?.role).toEqual({ kind: 'remove', k: 4 })   // a click on its bar removes too
    // drawn over every label (a long Max load label never covers −): the controls come last
    const lastLabel = Math.max(...d.items.map((i, n) => (i.t === 'text' && !/add-level/.test(i.tag) ? n : -1)))
    expect(['handle', 'add-level', 'remove-level', 'remove-level-bar'].every(tag => d.items.findIndex(i => i.tag === tag) > lastLabel)).toBe(true)
    expect(read('components/Elevations/ElevationDrawing.jsx')).toMatch(/pointerEvents=\{r \? undefined : 'none'\}/)   // a label with no action never takes a click
    // not in the list's read-only sheet
    const plain = await draw({ clearHeightIn: 360, sprinklerIn: 360 })
    expect(plain.items.some(i => ['handle', 'add-level', 'remove-level', 'editable'].includes(i.tag))).toBe(false)
  })
  it('SG-sheet-red: a level whose load is above the max load height turns red on the sheet — never against an assumed ceiling', async () => {
    // loads topping at 4′, 9′, 14′-10″, 20′-8″ and 26′-6″; the levels all fit their gaps (no "doesn't fit" red)
    const tall = { ...T5, uprightHeightIn: 300, levels: [0, 60, 130, 200, 270].map(beamIn => ({ beamIn, palletHeightIn: 48, loadLb: 2500 })) }
    const red = (d, k) => d.items.filter(i => i.tag === 'load' && i.level === k).every(i => i.stroke === '#C0452A' || i.fill === '#C0452A')
    const set = await draw({ clearHeightIn: 258, sprinklerIn: 258 }, { t: tall })                      // max load 20′-0″
    expect([red(set, 3), red(set, 2)]).toEqual([true, false])                                         // L4 (20′-8″) over it — not the top level
    const assumed = await draw({ clearHeightIn: 258, sprinklerIn: null, assumed: true }, { t: tall })
    expect(red(assumed, 3)).toBe(false)
  })
  it('SG-sheet-snap: a dragged beam snaps to Project settings → Uprights → Hole pitch; + Add level adds one over the top (the upright grows when it must); − takes the top level away', async () => {
    const E = await import('../../utils/elevEditor')
    expect(E.moveBeam(T5, 2, 119.2, { pitch: 3 }).levels[2].beamIn).toBe(120)                            // the project's 3″, not the type's 2″
    expect(E.moveBeam(T5, 2, 119.2).levels[2].beamIn).toBe(120)
    expect(E.moveBeam(T5, 2, 118.4, { pitch: 3 }).levels[2].beamIn).toBe(117)
    const added = E.addTopLevel(T5, 2)
    expect([added.levels.length, Math.max(...added.levels.map(l => l.beamIn)), added.uprightHeightIn]).toEqual([6, 290, 302])   // 232 + 48 + 6 + 4
    expect(E.removeLevel(T5, 4).levels.length).toBe(4)
    const core = read('components/Elevations/ElevationDrawing.jsx')
    expect(core).toMatch(/moveBeam\(t, role\.k, zAt\(p\), \{ pitch: sheetEdit \? holePitchIn : null \}\)/)
    expect(core).toMatch(/r\?\.kind === 'add'\) \{ handlers\.onClick = \(e\) => \{ e\.stopPropagation\(\); commit\(x => addTopLevel\(x, holePitchIn\)\) \}/)
    expect(core).toMatch(/if \(sheetEdit\) handlers\.onClick = \(e\) => startTyping\(e, r\); else handlers\.onDoubleClick/)      // a single click types on the sheet
    expect(read('components/Elevations/ElevationsTab.jsx')).toMatch(/sheetEdit=\{onSheet\} holePitchIn=\{holePitchIn\} onValue=\{\(id, v\) => sheetValue\(store, id, v\)\}/)
  })
})

describe.each(['horizontal', 'vertical'])('SG-3 — the sheet\'s draft and save, %s', (orientation) => {
  let store, T_, P, gen
  beforeEach(async () => {
    vi.resetModules()
    ;({ useCanvasStore: store } = await import('../../store/useCanvasStore'))
    T_ = await import('../../utils/elevTab'); P = await import('../../utils/project'); gen = await import('../../generate/traceGenerate')
    gen.generateAndPlace({ ...R.R1, orientation, rackType: 'rack_double_row', dockDoors: 0 })
    if (!P.projectOf(store.getState().elevations)) P.commitProject(store, P.newProject({ mhe: 'reach', wallClearIn: 3 }))
    const pr = P.projectOf(store.getState().elevations)
    P.commitProject(store, { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 360 }], defaultCeilingId: 'c' })
    T_.addBestFit(store, { ceilingId: 'c', palletId: pr.defaultPalletId })
  })
  const st = () => store.getState(), ed = () => T_.useElevTab.getState().editing
  it('SG-sheet-save: the pencil opens the sheet edit (the list collapses to that row); a typed pallet height or width changes the draft (every level\'s pallet height too); Save is ONE undo step, a new pallet named depth×width; Cancel writes nothing', () => {
    const t0 = st().elevations.types[0], id = t0.id, before = JSON.stringify(t0)
    expect(T_.startSheet(store, id)).toBe(true)
    expect([ed().id, ed().sheet]).toEqual([id, true])
    T_.sheetValue(store, 'palletH', 54)
    expect(ed().draft.levels.every(l => l.palletHeightIn === 54)).toBe(true)
    T_.cancelEdit()
    expect(JSON.stringify(st().elevations.types.find(t => t.id === id))).toBe(before)
    T_.startSheet(store, id); T_.sheetValue(store, 'palletW', 42)
    const h0 = st().historyIndex, n0 = P.projectOf(st().elevations).pallets.length
    expect(T_.saveTyped(store)?.kind).toBe('saved')
    const pr = P.projectOf(st().elevations), t1 = st().elevations.types.find(t => t.id === id)
    expect([st().historyIndex - h0, pr.pallets.length, P.palletById(pr, t1.palletId).name, t1.named]).toEqual([1, n0 + 1, '48×42', false])
    st().undo()
    expect(P.projectOf(st().elevations).pallets.length).toBe(n0)
    const tab = read('components/Elevations/ElevationsTab.jsx')
    expect(tab).toMatch(/: onSheet\s+\? <SheetRow e=\{e\} T=\{T\} bays=\{counts\.get\(e\.id\) \|\| 0\} \/>/)        // the list collapses to the row
    expect(tab).toMatch(/onSheet \? Math\.min\(SHEET_EDITING, room - ROW_MIN\)/)
    expect(tab).toMatch(/const SHEET_EDITING = 560/)
  })
  it('SG-sheet-row: the row shows the elevation, "Editing · N bays" in mint, ✕ Cancel and a 24h Save, the hint under it; Esc cancels — and never also clears the plan\'s selection', () => {
    const row = between(read('components/Elevations/ElevationsTab.jsx'), 'function SheetRow(', '/* the editor\'s small fields')
    expect(row).toMatch(/height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 10px', borderRadius: 8, background: C\.active/)
    expect(row).toMatch(/color: C\.accent, fontSize: 12 \}\}>Editing · <span style=\{\{ fontFamily: MONO \}\}>\{bays\}<\/span> bays/)
    expect(row).toMatch(/aria-label="Cancel" title="Cancel \(Esc\)" onClick=\{cancelEdit\}/)
    expect(row).toMatch(/onClick=\{\(\) => saveTyped\(store\)\} style=\{\{ height: 24, padding: '0 10px'/)
    expect(row).toMatch(/Drag a beam to move it\. Click a blue value to type it\. Esc cancels\./)
    expect(row).toMatch(/ev\.stopPropagation\(\); cancelEdit\(\) \}\s+window\.addEventListener\('keydown', k, true\)/)
  })
})

describe('SG-4 / SG-5 — Full edit and C3', () => {
  let store, T_, P
  beforeEach(async () => {
    vi.resetModules()
    ;({ useCanvasStore: store } = await import('../../store/useCanvasStore'))
    T_ = await import('../../utils/elevTab'); P = await import('../../utils/project')
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 360 }], defaultCeilingId: 'c' }
    store.setState({ objects: [], elevations: P.withProject(null, pr), history: [JSON.stringify({ objects: [], groups: [], elevations: null })], historyIndex: 0 })
    T_.addBestFit(store, { ceilingId: 'c', palletId: pr.defaultPalletId })
  })
  const st = () => store.getState(), ed = () => T_.useElevTab.getState().editing
  it('SG-full-edit: More → Full edit opens C3 on that elevation (not the sheet), titled "Edit elevation · N bays"', () => {
    const id = st().elevations.types[0].id
    T_.startFull(store, id)
    expect([ed().id, !!ed().sheet]).toEqual([id, false])
    const tab = read('components/Elevations/ElevationsTab.jsx')
    expect(between(tab, 'function RowMenu(', 'export function ElevationsTab(')).toMatch(/\{item\('Full edit', \(\) => startFull\(store, t\.id\)\)\}\s+<label/)
    expect(tab).toMatch(/\{e\.id \? <>Edit elevation <span style=\{\{ color: C\.muted, fontWeight: 400 \}\}>· <span style=\{\{ fontFamily: MONO \}\}>\{bays\}<\/span> bays<\/span><\/> : 'New elevation'\}/)
  })
  it('SG-typed: C3\'s ceiling and pallet are typed — the project\'s entry with those values when there is one, else Save adds one (the ceiling named by its height, its sprinklers at it; the pallet depth×width) — one undo step', () => {
    T_.startNew(store)
    T_.typeCeiling(store, 360)
    expect(ed().draft.ceilingId).toBe('c')                                                               // matched: nothing new
    T_.typeCeiling(store, 300)
    expect([ed().draft.ceilingId, ed().newCeiling.name]).toEqual([T_.NEW_CEILING, '25′-0″'])
    T_.typePallet(store, 'depthIn', 60)
    expect([ed().draft.palletId, ed().newPallet.depthIn]).toEqual([T_.NEW_PALLET, 60])
    const pr0 = P.projectOf(st().elevations), h0 = st().historyIndex
    T_.saveTyped(store, { name: '' })
    const pr = P.projectOf(st().elevations), t = st().elevations.types[st().elevations.types.length - 1]
    expect([st().historyIndex - h0, pr.ceilings.length - pr0.ceilings.length, pr.pallets.length - pr0.pallets.length]).toEqual([1, 1, 1])
    expect([P.ceilingById(pr, t.ceilingId).clearHeightIn, P.ceilingById(pr, t.ceilingId).sprinklerIn, P.palletById(pr, t.palletId).name]).toEqual([300, 300, '60×40'])
    // typed back to the project's own values: the entry is used, nothing added
    T_.startNew(store); T_.typePallet(store, 'depthIn', 60); T_.typePallet(store, 'depthIn', 48)
    expect(ed().draft.palletId).toBe(pr.defaultPalletId)
  })
  it('SG-c3-ui: every C3 value is a typed input, no dropdowns or presets; Frame depth and Beam length are the rows\' (read-only, "From the rows. Change in rack Properties."); the frame warning sits inside the Rack box', () => {
    const e3 = between(read('components/Elevations/ElevationsTab.jsx'), 'function Editor(')
    expect(/<select|SelectField|<option|BEAM_FACES/.test(e3)).toBe(false)
    expect(e3).toMatch(/<SmallField label="Frame depth"><Typed readOnly aria="Frame depth \(in\)" value=\{frameDepth\} \/><\/SmallField>/)
    expect(e3).toMatch(/<SmallField label="Beam size"><Typed aria="Beam size \(in\)" value=\{beamFace\(d\)\} onCommit=\{v => editDraft\(store, \{ beamFaceIn: v \}\)\} \/><\/SmallField>/)
    expect(e3).toMatch(/<SmallField label="Beam length"><Typed readOnly aria="Beam length \(in\)" value=\{beamLength\} \/><\/SmallField>/)
    expect(e3).toMatch(/>From the rows\. Change in rack Properties\.<\/span>/)
    expect(e3).toMatch(/const frameDepth = rows\.length \? mostCommon\(rows\.map\(r => r\.depthIn \?\? 42\)\) : spec\.depthIn/)
    const rack = between(e3, 'aria-label="Rack"', '{/* the footer')
    expect(rack).toMatch(/role="note" aria-label="Pallet depth"[\s\S]*<FixButton/)
  })
})

describe('SG-6 / SG-7 / SG-8', () => {
  it('SG-hole-pitch: Project settings → Storage has Uprights → Hole pitch (2″ by default), "Beams snap to this step when dragged on an elevation."', async () => {
    const ui = read('components/Project/ProjectSetup.jsx'), P = await import('../../utils/project')
    expect(P.ADVANCED_DEFAULTS.holePitchIn).toBe(2)
    expect(ui).toMatch(/role="group" aria-label="Uprights">\s*<span style=\{S\.h\}>Uprights<\/span>/)
    expect(ui).toMatch(/<Num label="Hole pitch \(in\)" value=\{pr\.advanced\?\.holePitchIn \?\? ADVANCED_DEFAULTS\.holePitchIn\}/)
    expect(ui).toMatch(/Beams snap to this step when dragged on an elevation\./)
    expect(read('components/Elevations/ElevationsTab.jsx')).toMatch(/const holePitchIn = advancedOf\(projectOf\(T\)\)\.holePitchIn/)
  })
  it('SG-card-width: the right card\'s left edge widens it between 300 and 640; double-click resets to 300; remembered; one width for every tab', async () => {
    vi.resetModules()
    const V = await import('../../studio/viewPrefs')
    expect([V.clampCardW(200), V.clampCardW(700), V.clampCardW(420)]).toEqual([300, 640, 420])
    V.useViewPrefs.getState().setCardW(480)
    expect([V.useViewPrefs.getState().cardW, localStorage.getItem('trace.studio.cardw.v1')]).toEqual([480, '480'])
    V.useViewPrefs.getState().setCardW(520, { save: false })
    expect(localStorage.getItem('trace.studio.cardw.v1')).toBe('480')
    const f = read('studio/StudioFrame.jsx')
    expect(f).toMatch(/right: 16, top: 76, width: cardW, maxHeight: 'calc\(100vh - 152px\)'/)
    expect(f).toMatch(/role="separator" aria-orientation="vertical" aria-label="Resize right panel"[\s\S]*onDoubleClick=\{\(\) => useViewPrefs\.getState\(\)\.setCardW\(CARD_W\)\}[\s\S]*width: 6, cursor: 'col-resize'/)
    expect(f).toMatch(/<span aria-hidden style=\{\{ width: 3, height: 32, borderRadius: 2, background: '#4A514D' \}\} \/>/)
    expect((f.match(/width: cardW/g) || []).length).toBe(1)                                             // the one card, every tab
  })
  it('SG-pallet-text: a pallet size reads depth × width once (48×40) — never the name and its size again', () => {
    expect(/\{p\.name\} · \{p\.depthIn\}/.test(read('components/Elevations/ElevationsTab.jsx'))).toBe(false)
    expect(read('components/RightPanel/panels/RackRowPanelCore.jsx')).toMatch(/\{obj\.palletDIn \|\| 48\}×\{obj\.palletWIn \|\| 40\}<\/span>/)
    expect(read('components/Project/ProjectSetup.jsx')).toMatch(/<Times label="Depth × width × height">\s*<Field aria="Pallet depth \(in\)"/)
    expect(read('components/Project/ProjectSetup.jsx')).toMatch(/<th style=\{S\.th\}>Depth \(in\)<\/th><th style=\{S\.th\}>Width \(in\)<\/th>/)
  })
})
