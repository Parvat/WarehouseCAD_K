// Area PS — Project setup (PROJECT_SETUP.md; utils/project.js, components/Project/*). The project's ceiling heights,
// pallet sizes, forklift, rules and advanced settings live with the layout (elevations.project); a layout from before
// is given one from what it uses, nothing moving; Generate and Fill read the default pallet; the inputs are gone from
// everywhere else.
globalThis.document = globalThis.document || { getElementById: () => null }
const mem = new Map()
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { GS } from './fixtures'
import { REAL_LAYOUT } from './realLayout.fixture'
import { planAreaResize } from '../../generate/rackingArea'
import * as E from '../../utils/elevations'
import * as P from '../../utils/project'
import { checkLayout } from '../../utils/layoutCheck'
import * as LC from '../../utils/layoutCheck'
import * as E_D from '../../utils/elevationDrawing'
import { bestFitFor } from '../../utils/elevFit'
import * as T_ from '../../utils/elevTab'

let store, stop
beforeAll(async () => { store = (await import('../../store/useCanvasStore')).useCanvasStore })
afterAll(() => stop && stop())
const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8')
const filled = (heights = true) => {
  const o0 = REAL_LAYOUT.map(o => ({ ...o })), area = o0.find(o => o.type === 'racking_area')
  return JSON.parse(JSON.stringify(planAreaResize(o0, area.id, { x: area.x, y: area.y, w: area.width, h: area.height }, { gridSize: GS }))).map(o => (heights && o.type === 'fp_rect' ? { ...o, clearHeightFt: 30, sprinklerFt: 29.5 } : o))
}

describe('PS — the project', () => {
  it('PS-migrate: a layout from before becomes the project\'s default entries — a ceiling from the building\'s heights, a pallet from the racks\' face × depth and the elevation\'s pallet height and beam face, the forklift, wall clearance and units in use, the advanced values; nothing moves', () => {
    const o = filled(), m = E.migrate(o), T = { ...m.table, fit: { holePitchIn: 3 }, sprinklerClearanceIn: 24 }
    const pr = P.migrateProject(m.objects, T, { mhe: 'turret', wallClearIn: 6, units: 'meters' })
    expect(pr.ceilings.map(c => [c.name, c.clearHeightIn, c.sprinklerIn])).toEqual([['Main', 360, 354]])
    expect(pr.defaultCeilingId).toBe(pr.ceilings[0].id)
    const pal = P.defaultPallet(pr)
    expect([pal.faceIn, pal.depthIn, pal.heightIn, 'beamFaceIn' in pal, pal.name, pr.advanced.beamFaceIn]).toEqual([40, 48, 48, false, '48×40', 4])   // the beam face: the project's default for new elevations, not the pallet's
    expect([pr.equipment.mhe, pr.rules.wallClearIn, pr.rules.units, pr.advanced.holePitchIn, pr.advanced.sprinklerClearanceIn, pr.advanced.clearanceIn, pr.advanced.uprightStepIn, pr.advanced.flueIn]).toEqual(['turret', 6, 'meters', 3, 24, 6, 12, 6])
    // no heights on the building: no ceiling (the setup asks)
    expect(P.migrateProject(filled(false), null, {}).ceilings).toEqual([])
    // the ceiling the checks and the drawing read; the sprinkler clearance
    const T2 = P.withProject(T, pr)
    expect([E.ceilingOf(T2, null).clearHeightIn, E.sprinklerClearance(T2), E.sprinklerClearance({ sprinklerClearanceIn: 12 })]).toEqual([360, 24, 12])
  })

  it('PS-start-screen: the start screen opens once per new project — Hub → Draw on a pristine layout, File → New with the CAD already open, a refresh — and never again because of undo or deleting everything; an existing project never; nothing while the CAD is off screen', () => {
    const was = globalThis.confirm; globalThis.confirm = () => true
    const open = () => P.useProjectSetup.getState().open && P.useProjectSetup.getState().reason === 'new'
    const shut = () => P.useProjectSetup.setState({ open: false, reason: null })
    const s = () => store.getState()
    const existing = { objects: [{ id: 'r', type: 'rect', x: 0, y: 0, width: 10, height: 10 }], elevations: P.withProject(null, P.newProject()), history: ['{}'], historyIndex: 0 }
    // an existing project: entering the CAD (ProjectSetup mounted) opens nothing
    shut(); store.setState(existing)
    let leave = P.installStartScreen(store)
    expect(open()).toBe(false)
    // File → New while the CAD is open: a pristine scene (history [] / -1) — the start screen at once
    s().newScene()
    expect([s().history.length, s().historyIndex, open()]).toEqual([0, -1, true])
    // Draw it myself: the project written (one history entry) — shut, and it stays shut
    shut(); s().commitElevations(P.withProject(null, P.newProject()))
    expect([s().historyIndex, open()]).toEqual([0, false])
    // undo: it stops at that first entry — the project stays, nothing opens
    s().undo(); s().undo()
    expect([s().historyIndex, !!P.projectOf(s().elevations), open()]).toEqual([0, true, false])
    // deleting everything: something drawn, then all of it deleted — empty again, still no start screen
    s().addObject({ id: 'a', type: 'rect', x: 0, y: 0, width: 10, height: 10 }); s().addObject({ id: 'b', type: 'rect', x: 40, y: 0, width: 10, height: 10 })
    s().selectAll(); s().deleteSelected()
    expect([s().objects.length, open()]).toEqual([0, false])
    // even an empty layout with no project, but past its first step (a history), is not a new project
    store.setState({ objects: [], elevations: null })
    expect(open()).toBe(false)
    s().undo(); s().undo(); s().undo()
    expect(open()).toBe(false)
    // once per new project: shown for this scene and closed without a project (no commit) — later changes don't reopen it
    s().newScene()
    expect(open()).toBe(true)
    shut(); store.setState({ zoom: 2 }); store.setState({ panX: 10 })
    expect(open()).toBe(false)
    leave()
    // Hub → Draw on a pristine scene: at once, on mount (a fresh scene — File → New made off screen opens nothing there)
    shut(); store.setState(existing)
    s().newScene()
    expect(open()).toBe(false)                                                       // off screen: nothing
    leave = P.installStartScreen(store)
    expect(open()).toBe(true)                                                        // entering: at once
    leave()
    // a refresh on an empty new project (a fresh pristine state, then the CAD entered): at once
    shut(); store.setState({ objects: [], elevations: null, history: [], historyIndex: -1 })
    leave = P.installStartScreen(store)
    expect(open()).toBe(true)
    leave(); shut()
    // the wiring: ProjectSetup runs it for as long as it is mounted; App's on-entry check and the keeper's are gone
    expect(src('components/Project/ProjectSetup.jsx')).toMatch(/useEffect\(\(\) => installStartScreen\(store\), \[\]\)/)
    expect(/openSetup\('new'\)/.test(src('App.jsx') + src('utils/project.js').replace(/export function installStartScreen[\s\S]*?\n\}/, ''))).toBe(false)
    globalThis.confirm = was
  })

  it('PS-keeper: on load a layout without a project is given one in that same history entry (one undo step), unused elevation types dropped once; the keeper opens nothing (the start screen is installStartScreen\'s); nothing opens once a layout exists', async () => {
    stop = P.installProjectKeeper(store, () => ({ mhe: 'reach', wallClearIn: 3, units: 'ft · in' }))
    const o = filled(), m = E.migrate(o)
    const T = { ...m.table, types: [...m.table.types, { ...m.table.types[0], id: 'junk', name: "4 levels · 16' 2" }] }
    store.setState({ objects: m.objects, elevations: T, history: [JSON.stringify({ objects: m.objects, groups: [], elevations: T })], historyIndex: 0 })
    const st = store.getState()
    expect([!!P.projectOf(st.elevations), st.elevations.types.map(t => t.id), st.historyIndex]).toEqual([true, [m.table.defaultId], 0])
    expect(JSON.parse(st.history[0]).elevations.project).toBeTruthy()
    expect(st.objects).toBe(m.objects)                                                 // nothing moves
    // a new, empty layout: the keeper leaves it alone (no project made, nothing opened — installStartScreen's job)
    P.useProjectSetup.setState({ open: false, reason: null })
    store.setState({ objects: [], elevations: null, history: [JSON.stringify({ objects: [], groups: [], elevations: null })], historyIndex: 0 })
    expect([P.useProjectSetup.getState().open, store.getState().elevations]).toEqual([false, null])
    // a project with no ceiling; the first racks go down: nothing opens (never once a layout exists), types made for them
    const pr = P.newProject()
    store.setState({ elevations: P.withProject(null, pr) })
    store.setState({ objects: o, history: [...store.getState().history, JSON.stringify({ objects: o, groups: [] })], historyIndex: store.getState().history.length })
    const s2 = store.getState()
    expect([P.useProjectSetup.getState().open, s2.elevations.types.length > 0]).toEqual([false, true])
    store.setState({ objects: [], history: [...s2.history, '{}'], historyIndex: s2.history.length })
    store.setState({ objects: o, history: [...store.getState().history, '{}'], historyIndex: store.getState().history.length })
    expect(P.useProjectSetup.getState().open).toBe(false)
    stop(); stop = null
  })

  it('PS-bestfit: a project with a ceiling height and no elevation yet gets the best fit for the default ceiling and pallet, silently, in that same history entry — named by its pairing; without a ceiling, racks get types from their levels', () => {
    stop = P.installProjectKeeper(store, () => ({}))
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }
    const T0 = P.withProject(null, pr)
    store.setState({ objects: [], elevations: null, history: [JSON.stringify({ objects: [], groups: [], elevations: null })], historyIndex: 0 })
    P.useProjectSetup.setState({ open: false })
    store.getState().commitElevations(T0)
    const T = store.getState().elevations
    expect([T.types.length, T.types[0].name, T.types[0].levels.length, T.types[0].uprightHeightIn, T.defaultId === T.types[0].id]).toEqual([1, '5 levels · 48×40 · Main', 5, 252, true])
    expect(JSON.parse(store.getState().history[store.getState().historyIndex]).elevations.types.length).toBe(1)   // folded
    // no ceiling: the racks placed take types from their own levels
    store.setState({ objects: [], elevations: P.withProject(null, P.newProject()), history: ['{}'], historyIndex: 0 })
    const o = filled(false)
    store.setState({ objects: o, history: ['{}', '{}'], historyIndex: 1 })
    expect(store.getState().elevations.types.map(t => t.levels.length)).toEqual([4])
    P.useProjectSetup.setState({ open: false })
    stop(); stop = null
  })

  it('PS-changes: what moves racks (the default pallet\'s face or depth, the forklift, the wall clearance) asks Regenerate / Keep; a pallet\'s height or weight updates the elevations that carry it (their beam faces their own); ceilings drive the checks', () => {
    const pr = P.newProject(), pal = P.defaultPallet(pr)
    const with_ = (f) => { const n = JSON.parse(JSON.stringify(pr)); f(n); return n }
    expect([P.layoutAffecting(pr, with_(n => { n.pallets[0].faceIn = 42 })), P.layoutAffecting(pr, with_(n => { n.equipment.mhe = 'turret' })), P.layoutAffecting(pr, with_(n => { n.rules.wallClearIn = 9 })), P.layoutAffecting(pr, with_(n => { n.pallets[0].heightIn = 60 })), P.layoutAffecting(pr, with_(n => { n.ceilings.push({ id: 'c', name: 'x', clearHeightIn: 300 }) }))]).toEqual([true, true, true, false, false])
    const T = { version: 1, defaultId: 'a', types: [E.makeType({ id: 'a', levelsCount: 4 })], project: pr }
    const next = with_(n => { n.pallets[0].heightIn = 54; n.pallets[0].weightLb = 2500 })
    const r = P.syncTypesToPallets([], T, pr, next)
    expect([r.table.types[0].levels.every(l => l.palletHeightIn === 54 && l.loadLb === 2500), r.table.types[0].beamFaceIn, r.table.types[0].levels.map(l => l.beamIn)]).toEqual([true, 4, [0, 60, 120, 180]])
    // a new default beam face (Advanced) changes no existing elevation — only new ones start from it
    expect(P.syncTypesToPallets([], T, pr, with_(n => { n.advanced.beamFaceIn = 6 })).table).toBe(T)
    expect(P.syncTypesToPallets([], T, pr, pr).table).toBe(T)
    // Check layout reads the project's ceiling (the building has none)
    const o = filled(false), m = E.migrate(o)
    const low = P.withProject(m.table, { ...pr, ceilings: [{ id: 'c', name: 'Low', clearHeightIn: 150, sprinklerIn: null }], defaultCeilingId: 'c' })
    const errs = checkLayout(m.objects, { gridSize: GS, elevations: low }).errors.filter(e => /clear height/.test(e.text))
    expect(errs.length).toBeGreaterThan(0)
    expect(checkLayout(m.objects, { gridSize: GS, elevations: m.table }).errors.filter(e => /clear height/.test(e.text)).length).toBe(0)
    void pal
  })

  it('PS-inputs: Generate keeps only building size, column grid, row direction and max rack run (pallet, forklift, aisle, wall clearance from the project); the Fill bar, a racking area, the column check, a building\'s and a rack\'s properties show none of them; Project settings opens Project setup', () => {
    const gen = src('components/Generate/GeneratePanel.jsx')
    expect(/PALLET SIZE|>FORKLIFT<|AISLE \(ft\)|WALL CLEARANCE/.test(gen)).toBe(false)
    for (const k of ['LENGTH (ft)', 'WIDTH (ft)', 'COLUMN GRID (ft)', 'ROW DIRECTION', 'MAX RACK RUN (ft)']) expect([k, gen.includes(k)]).toEqual([k, true])
    expect(gen).toMatch(/const brief = \(\) => generateBrief\(project, mheOptions, \{ lengthFt, widthFt, gridXFt, gridYFt, maxRunFt, columnsAlongWall, orientation \}\)/)
    expect(gen).toMatch(/const aisleFt = mheOptions\[mhe\]\?\.aisleFt \?\? 10\.5/)
    expect(gen).toMatch(/const \[open, setOpen\]     = useState\(false\)/)            // the start screen is a new project's first step
    expect(/openSetup\('ceiling'|setupPrompted/.test(gen + src('utils/project.js'))).toBe(false)   // no "set up first" trigger
    expect(/aria-label="Pallet face"|aria-label="Forklift"|aria-label="Aisle \(ft\)"|aria-label="Wall clearance/.test(src('canvas2/FillTool.jsx'))).toBe(false)
    expect(/Area pallet|Area forklift|Area aisle/.test(src('components/RightPanel/panels/RackingAreaPanel.jsx'))).toBe(false)
    expect(src('components/RightPanel/ColumnCheckPanel.jsx')).not.toMatch(/<select value=\{mheKey\}/)
    const pp = src('components/RightPanel/PropertiesPanel.jsx')
    expect(/aria-label="Sprinkler height"|aria-label="Clear height"|SprinklerClearanceField/.test(pp)).toBe(false)
    expect(/40x48|aria-label=\{?`?Face|palletDIn: p\.d/.test(src('components/RightPanel/panels/RackRowPanelCore.jsx'))).toBe(false)
    expect(src('components/LeftPanel/FloatingToolbar.jsx')).toMatch(/onClick=\{id === 'settings' \? \(\) => openSetup\('settings'\) : undefined\}/)
    // the sync: the column check's forklift, the Fill settings, the units
    const sync = src('components/Project/ProjectSync.jsx')
    expect(sync).toMatch(/if \(mhe !== mheKey\) setMheKey\(mhe\)/)
    expect(sync).toMatch(/palletWIn: pal\.faceIn, palletDIn: pal\.depthIn/)
    // the screen
    const ui = src('components/Project/ProjectSetup.jsx')
    const startUi = ui.slice(ui.indexOf('function StartCard'), ui.indexOf('function SettingsCard')), setUi = ui.slice(ui.indexOf('function SettingsCard'))
    const inOrder = (txt, keys) => { const o = keys.map(k => txt.indexOf(k)); return o.every((v, i) => v > 0 && (i === 0 || v > o[i - 1])) }
    // the start screen: ONE screen, no second step — building (length × width, clear, sprinkler), pallet (face × depth ×
    // height, weight), layout (forklift, column grid, row direction, max run, wall clearance), Advanced; the two buttons
    expect(inOrder(startUi, ['aria-label="New project"', 'aria-label="Building"', '<Times label="Length × width">', 'aria="Length (ft)"', 'aria="Width (ft)"', 'aria="Clear height (ft)"', 'aria="Sprinkler height (ft)"', 'aria-label="Pallet"', '<Times label="Face × depth × height">', 'aria="Pallet face (in)"', 'aria="Pallet depth (in)"', 'aria="Pallet height (in)"', 'aria="Pallet weight (lb)"', 'aria-label="Layout"', '<ForkliftSelect ', '<Times label="Column grid">', 'aria="Row direction"', 'aria="Max rack run (ft)"', 'aria="Wall clearance (in)"', '<Advanced ', ' Draw it myself</button>', '<Sparkles size={14} /> Generate layout</>'])).toBe(true)
    expect(/setStep|step === 2|Beam face \(in\)"/.test(startUi)).toBe(false)                     // no second step; no beam face on the pallet
    expect(startUi).toMatch(/width: 'min\(640px, 100%\)'/)                                          // medium-size
    expect(startUi).toMatch(/gap: 24 \}\}>/)                                                         // more space between groups than within (12)
    // Project settings: the same sections, lists with + Add, delete not when in use, set default
    expect(inOrder(setUi, ['aria-label="Project setup"', 'aria-label="Ceiling heights"', 'aria-label="Pallet sizes"', 'aria-label="Equipment and rules"', '<Advanced '])).toBe(true)
    expect(setUi.includes('aria="Beam face (in)"')).toBe(false)                                     // not a pallet's any more
    expect(ui).toMatch(/\['beamFaceIn', 'Beam face, new elevations \(in\)'\]/)                          // Advanced: the default for new elevations
    for (const k of ['name="defaultCeiling"', 'name="defaultPallet"', 'aria="Pallet weight (lb)"', 'aria-label="Add ceiling height"', 'aria-label="Add pallet size"', 'disabled={used}', 'disabled={blocked}', '>Regenerate racking</button>', '>Keep layout</button>']) expect([k, setUi.includes(k)]).toEqual([k, true])
    for (const k of ["['clearanceIn', 'Load clearance (in)']", "['sprinklerClearanceIn', 'Sprinkler clearance (in)']", "['holePitchIn', 'Hole pitch (in)']", "['flueIn', 'Flue (in)']", 'Upright step (ft)']) expect([k, ui.includes(k)]).toEqual([k, true])
    expect(/>Skip<\/button>/.test(ui)).toBe(false)
    expect(ui).toMatch(/const \[open, setOpen\] = useState\(false\)/)                  // Advanced folded
    expect(setUi).toMatch(/if \(old && gen && layoutAffecting\(old, pr\)\) \{ setAsk/)
    expect(src('App.jsx')).toMatch(/installProjectKeeper\(useCanvasStore,/)
  })

  it('PS-assumed: a clear height not set is 24\' for the fit and the drawing only — no clear-height or sprinkler check against it; Check layout lists what is unset as reminders (per ceiling in use), "No errors · N reminders" when only they remain', () => {
    const p60 = { id: 'p60', name: '48×48', faceIn: 48, depthIn: 48, heightIn: 60, weightLb: 2500, beamFaceIn: 4 }
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: null, sprinklerIn: null }], defaultCeilingId: 'c' }
    // the fit: pitch 60 + 6 + 4 = 70; top load (n − 1) × 70 + 60 ≤ 288 → 4 levels; upright 210 + 12 → 228 (19')
    const d = (c) => { const x = bestFitFor(pr, c, p60); return [x.levels.length, x.uprightHeightIn, x.ceilingId] }
    expect([d(pr.ceilings[0]), d(null)]).toEqual([[4, 228, 'c'], [4, 228, null]])
    expect(d({ id: 'c30', clearHeightIn: 360 })).toEqual([5, 300, 'c30'])                 // a real 30' fits one more
    // the checks and the drawing read 24', assumed
    const T = P.withProject({ version: E.ELEV_VERSION, defaultId: null, types: [] }, pr)
    expect([E.ceilingOf(T, null), P.ceilingFor(T, null)].map(c => [c.clearHeightIn, c.sprinklerIn, c.assumed])).toEqual([[288, null, true], [288, null, true]])
    expect(E.ceilingOf(P.withProject(null, { ...pr, ceilings: [], defaultCeilingId: null }), null).clearHeightIn).toBe(288)
    expect(E.ceilingOf(P.withProject(null, { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360 }] }), null).assumed).toBe(false)
    // reminders: clear and sprinkler not set
    expect(P.projectReminders(T).map(r => r.text)).toEqual(["Clear height not set — elevations assume 24'", 'Sprinkler height not set — sprinkler clearance not checked'])
    expect(P.projectReminders(P.withProject(null, { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }] }))).toEqual([])
    expect(P.projectReminders(null)).toEqual([])
    // two ceilings: per ceiling an elevation uses, by name
    const two = { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }, { id: 'm', name: 'Mezz', clearHeightIn: null, sprinklerIn: 230 }] }
    const T2 = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...bestFitFor(two, two.ceilings[0], p60), id: 'a', name: 'a' }, { ...bestFitFor(two, two.ceilings[1], p60), id: 'b', name: 'b' }] }, two)
    expect(P.projectReminders(T2).map(r => r.text)).toEqual(["Clear height not set for Mezz — elevations assume 24'"])
    // Check layout: no clear height set → no clear-height or sprinkler check at all (a 25' upright, a 26' top beam, a
    // sprinkler height alone), only the reminders; the same elevation under a set 20' ceiling: the errors
    const o = filled(false), m = E.migrate(o)
    const heightKinds = new Set(['elev-height', 'elev-load-clear', 'elev-sprinkler'])
    const tallT = { ...m.table, types: m.table.types.map(t => ({ ...t, uprightHeightIn: 300, levels: [...t.levels.slice(0, -1), { ...t.levels[t.levels.length - 1], beamIn: 312 }] })) }
    const tall = P.withProject(tallT, pr)
    const res = checkLayout(m.objects, { gridSize: GS, elevations: tall })
    expect(res.reminders.map(r => r.kind)).toEqual(['unset-clear', 'unset-sprinkler'])
    expect(res.errors.filter(e => heightKinds.has(e.kind))).toEqual([])
    const sprOnly = checkLayout(m.objects, { gridSize: GS, elevations: P.withProject(tallT, { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: null, sprinklerIn: 200 }] }) })
    expect([sprOnly.errors.filter(e => heightKinds.has(e.kind)).length, sprOnly.reminders.map(r => r.kind)]).toEqual([0, ['unset-clear']])
    const set = checkLayout(m.objects, { gridSize: GS, elevations: P.withProject(tallT, { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 240, sprinklerIn: 230 }] }) })
    expect(['elev-height', 'elev-load-clear'].every(k => set.errors.some(e => e.kind === k))).toBe(true)
    // the drawing: 24' drawn, "(ASSUMED)", never flagged against; a set 24' is flagged
    const tt = tallT.types[0], draw = (b) => E_D.elevationLayout(tt, 96, { w: 800, h: 600 }, { building: b }).items.filter(i => i.t === 'text').map(i => i.s)
    const assumedTexts = draw({ clearHeightIn: 288, sprinklerIn: null, assumed: true })
    expect([assumedTexts.some(x => /ABOVE CLEAR HEIGHT|OF SPRINKLERS/.test(x)), assumedTexts.includes('CLEAR HEIGHT 24\'-0" (ASSUMED)')]).toEqual([false, true])
    expect(draw({ clearHeightIn: 288, sprinklerIn: null }).includes('ABOVE CLEAR HEIGHT')).toBe(true)
    // the header: only reminders left → "No errors · N reminders"; errors / warnings still win
    expect([LC.checkLabel({ errors: [], warnings: [], reminders: [{}, {}] }), LC.checkLabel({ errors: [], warnings: [], reminders: [{}] }), LC.checkLabel({ errors: [{}], warnings: [], reminders: [{}] }), LC.checkLabel({ errors: [], warnings: [{}], reminders: [{}] }), LC.checkLabel({ errors: [], warnings: [] })])
      .toEqual(['Check layout · No errors · 2 reminders', 'Check layout · No errors · 1 reminder', 'Check layout · 1 error', 'Check layout · 1 warning', 'Check layout · no issues'])
    expect(src('components/RightPanel/LayoutCheckPanel.jsx')).toMatch(/\{remindersLabel\(result\) \|\| 'No issues found\.'\}/)
    expect('reminders' in checkLayout(m.objects, { gridSize: GS, elevations: P.withProject(m.table, { ...pr, ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }] }) })).toBe(false)
    // the panel lists them and opens Project settings; the drawing says "assumed"
    expect(src('components/RightPanel/LayoutCheckPanel.jsx')).toMatch(/aria-label="Reminders"[\s\S]*onClick=\{\(\) => openSetup\('settings'\)\}/)
    expect(src('utils/elevationDrawing.js')).toMatch(/\$\{building\?\.assumed \? ' \(ASSUMED\)' : ''\}/)
  })

  it('PS-entries: Project settings deletes no ceiling or pallet an elevation uses; the Elevations tab adds a ceiling or pallet to the project (one undo step) and Create says when that elevation already exists', () => {
    const p60 = { id: 'p60', name: '48×48', faceIn: 48, depthIn: 48, heightIn: 60, weightLb: 2500, beamFaceIn: 4 }
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }, { id: 'm', name: 'Mezz', clearHeightIn: 240, sprinklerIn: null }], defaultCeilingId: 'c' }
    pr.pallets = [...pr.pallets, p60]
    const t = { ...bestFitFor(pr, pr.ceilings[0], null), id: 'a', name: 'a', ceilingId: null, palletId: 'p60' }
    const T = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [t] }, pr)
    // in use: the saved default for an elevation without its own; its own pallet
    expect([P.ceilingInUse(T, 'c'), P.ceilingInUse(T, 'm'), P.palletInUse(T, 'p60'), P.palletInUse(T, pr.pallets[0].id)]).toEqual([true, false, true, false])
    // the tab: + New ceiling height / pallet size → into the project, one undo step each
    store.setState({ objects: [], elevations: P.withProject(null, { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }), history: [JSON.stringify({ objects: [], groups: [], elevations: null })], historyIndex: 0 })
    const h0 = store.getState().historyIndex
    const cid = P.addCeiling(store, { name: 'Mezz', clearHeightIn: 240 }), pid = P.addPallet(store, { faceIn: 48, depthIn: 48, heightIn: 60, weightLb: 2500, beamFaceIn: 4 })
    const pr2 = P.projectOf(store.getState().elevations)
    expect([P.ceilingById(pr2, cid).name, P.ceilingById(pr2, cid).clearHeightIn, P.palletById(pr2, pid).name, store.getState().historyIndex - h0]).toEqual(['Mezz', 240, '48×48', 2])
    // Create: a new chip; the same again: already exists (that one), nothing added
    const pair = { ceilingId: cid, palletId: pid }
    expect(T_.sameBestFit(store.getState().elevations, pair)).toBe(null)
    const id = T_.addBestFit(store, pair)
    expect([T_.sameBestFit(store.getState().elevations, pair)?.id, store.getState().elevations.types.length]).toEqual([id, 1])
    expect(T_.nameOf(store.getState().elevations, T_.sameBestFit(store.getState().elevations, pair))).toBe('3 levels · 48×48 · Mezz')
    expect(T_.sameBestFit(store.getState().elevations, { ceilingId: 'c', palletId: pid })).toBe(null)   // another pair
    const tab = src('components/Elevations/ElevationsTab.jsx')
    expect(tab).toMatch(/\{made\.kind === 'exists' \? 'Already exists' : made\.kind === 'saved' \? 'Saved' : 'Created'\}: \{nameOf\(T, madeType\)\}<\/strong>\. Select rows, then click this elevation\./)
    expect(tab).toMatch(/if \(v === NEW\) \{ setNewForm\(key === 'ceilingId' \? 'ceiling' : 'pallet'\); return \}/)
    expect(tab).toMatch(/const madeNew = \(key\) => \(id\) => \{ setNewForm\(null\); if \(id\) editDraft\(store, \{ \[key\]: id \}\) \}/)
  })
  it('PS-names: names are always unique — two elevations with the same pairing read "… sf" and "… sf 2" (they once both read "5 levels · 48×40 · sf"); renamed duplicates get a suffix; an existing layout is deduped on load, in that same history entry, nothing moving', () => {
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'sf', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }
    const fit = bestFitFor(pr, pr.ceilings[0], P.defaultPallet(pr))
    const pair = '5 levels · 48×40 · sf'
    // the bug: two un-renamed elevations, the same pairing, the same stored name — shown alike
    const dup = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...fit, id: 'a', name: pair, color: '#f00' }, { ...fit, id: 'b', name: pair, color: '#00f' }, { ...fit, id: 'c1', name: 'Mezz racks', named: true }, { ...fit, id: 'c2', name: 'Mezz racks', named: true }] }, pr)
    const u = P.uniqueNames(dup)
    expect(u.types.map(t => P.nameOf(u, t))).toEqual([pair + ' 2', pair, 'Mezz racks', 'Mezz racks 2'])
    expect(new Set(u.types.map(t => t.name)).size).toBe(4)
    expect(P.uniqueNames(u)).toBe(u)                                                          // already unique: untouched
    expect(P.nameOf(u, u.types[0])).not.toBe(P.nameOf(u, u.types[1]))
    // on load: the keeper folds the dedupe into that history entry; the bays and beams don't move
    stop = P.installProjectKeeper(store, () => ({}))
    const o = filled(), m = E.migrate(o)
    store.setState({ objects: m.objects, elevations: dup, history: [JSON.stringify({ objects: m.objects, groups: [], elevations: dup })], historyIndex: 0 })
    const T = store.getState().elevations
    expect([new Set(T.types.map(t => P.nameOf(T, t))).size, store.getState().historyIndex, JSON.parse(store.getState().history[0]).elevations.types[0].name, store.getState().objects === m.objects]).toEqual([4, 0, pair + ' 2', true])
    expect(T.types.map(t => t.levels.map(l => l.beamIn).join('/'))).toEqual(dup.types.map(t => t.levels.map(l => l.beamIn).join('/')))
    stop(); stop = null
  })

  it('PS-beam-face: the beam face left the pallet — the project keeps the default for new elevations (Advanced), each elevation its own; a layout from before migrates on load (the default pallet\'s face becomes the default), nothing moving', () => {
    const old = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }
    old.pallets = old.pallets.map(p => ({ ...p, beamFaceIn: 5 })); old.advanced = { ...old.advanced }; delete old.advanced.beamFaceIn
    const t = { ...E.makeType({ id: 'a', levelsCount: 4 }), beamFaceIn: 4, palletId: old.pallets[0].id, ceilingId: 'c' }
    const n = P.normalizeProject(old)
    expect([n.advanced.beamFaceIn, n.pallets.some(p => 'beamFaceIn' in p), P.normalizeProject(n) === n]).toEqual([5, false, true])
    // new elevations start from the project's face; an elevation keeps its own
    expect([bestFitFor(n, n.ceilings[0], n.pallets[0]).beamFaceIn, bestFitFor(n, n.ceilings[0], n.pallets[0], { beamFaceIn: 6 }).beamFaceIn]).toEqual([5, 6])
    // on load
    stop = P.installProjectKeeper(store, () => ({}))
    const o = filled(), m = E.migrate(o)
    const T0 = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [t] }, old)
    const objs = E.syncAllLevels(m.objects, T0)
    store.setState({ objects: objs, elevations: T0, history: [JSON.stringify({ objects: objs, groups: [], elevations: T0 })], historyIndex: 0 })
    const s1 = store.getState(), pr1 = P.projectOf(s1.elevations)
    expect([pr1.advanced.beamFaceIn, pr1.pallets.some(p => 'beamFaceIn' in p), s1.elevations.types[0].beamFaceIn, s1.elevations.types[0].levels.map(l => l.beamIn), s1.historyIndex, s1.objects === objs]).toEqual([5, false, 4, [0, 60, 120, 180], 0, true])
    stop(); stop = null
  })

  it('PS-editor: + Add elevation and the pencil open the editor on a draft — nothing written until Save (one undo step); a new ceiling or pallet refits it, a new beam face refits it until the drawing has changed it; Save returns to the list with the chip picked ("Created" / "Saved" / "Already exists"); Cancel discards', () => {
    const p60 = { id: 'p60', name: '48×48', faceIn: 48, depthIn: 48, heightIn: 60, weightLb: 2500 }
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }, { id: 'm', name: 'Mezz', clearHeightIn: 240, sprinklerIn: null }], defaultCeilingId: 'c' }
    pr.pallets = [...pr.pallets, p60]
    store.setState({ objects: [], elevations: P.withProject(null, pr), history: ['{}'], historyIndex: 0 })
    const tab = () => T_.useElevTab.getState(), s = () => store.getState()
    // + Add elevation: the best fit for the defaults, the project's beam face
    T_.startNew(store)
    expect([!!tab().editing, tab().editing.id, tab().editing.draft.levels.length, tab().editing.draft.beamFaceIn, s().historyIndex]).toEqual([true, null, 5, 4, 0])
    // another pallet: refitted; beam face 5 (untouched): refitted, pitch 60 + 6 + 5 → 72
    T_.editDraft(store, { palletId: 'p60' })
    T_.editDraft(store, { beamFaceIn: 5 })
    expect([tab().editing.draft.levels.map(l => l.beamIn), tab().editing.draft.beamFaceIn, s().historyIndex]).toEqual([[0, 72, 144, 216], 5, 0])
    // the drawing changes a beam: kept; a later face change no longer refits
    T_.editDraft(store, { ...tab().editing.draft, levels: tab().editing.draft.levels.map((l, k) => (k === 1 ? { ...l, beamIn: 74 } : l)) }, { fromDrawing: true })
    T_.editDraft(store, { beamFaceIn: 6 })
    expect([tab().editing.touched, tab().editing.draft.levels.map(l => l.beamIn), tab().editing.draft.beamFaceIn, s().historyIndex]).toEqual([true, [0, 74, 144, 216], 6, 0])
    // Save: one undo step, back to the list, the chip picked, "Created"
    const out = T_.saveEdit(store)
    const T1 = s().elevations, made = T1.types.find(t => t.id === out.id)
    expect([out.kind, s().historyIndex, tab().editing, tab().activeId === out.id, tab().made.kind, made.levels.map(l => l.beamIn), made.beamFaceIn, P.nameOf(T1, made)]).toEqual(['new', 1, null, true, 'new', [0, 74, 144, 216], 6, '4 levels · 48×48 · Main'])
    // the same again: "Already exists", nothing added
    T_.startNew(store); T_.editDraft(store, { palletId: 'p60' }); T_.editDraft(store, { beamFaceIn: 6 })
    T_.editDraft(store, { ...tab().editing.draft, levels: tab().editing.draft.levels.map((l, k) => (k === 1 ? { ...l, beamIn: 74 } : l)) }, { fromDrawing: true })
    const again = T_.saveEdit(store)
    expect([again.kind, again.id, s().elevations.types.length, s().historyIndex, tab().made.kind]).toEqual(['exists', out.id, 1, 1, 'exists'])
    // the pencil: a draft of that elevation — the store untouched until Save; Cancel discards
    T_.startEdit(store, out.id); T_.editDraft(store, { ceilingId: 'm' })
    expect([tab().editing.id, tab().editing.draft.levels.length, s().elevations.types[0].ceilingId ?? null, s().historyIndex]).toEqual([out.id, 3, 'c', 1])
    T_.cancelEdit()
    expect([tab().editing, s().elevations.types[0].ceilingId, s().historyIndex]).toEqual([null, 'c', 1])
    // the pencil, Mezz, Save: written once, everywhere it is used; named by its new pairing; "Saved"
    T_.startEdit(store, out.id); T_.editDraft(store, { ceilingId: 'm' })
    const saved = T_.saveEdit(store), t2 = s().elevations.types[0]
    expect([saved.kind, s().historyIndex, t2.ceilingId, t2.levels.length, P.nameOf(s().elevations, t2), tab().made.kind]).toEqual(['saved', 2, 'm', 3, '3 levels · 48×48 · Mezz', 'saved'])
  })
})
