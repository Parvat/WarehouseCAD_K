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
    expect([pal.faceIn, pal.depthIn, pal.heightIn, pal.beamFaceIn, pal.name]).toEqual([40, 48, 48, 4, '48×40'])
    expect([pr.equipment.mhe, pr.rules.wallClearIn, pr.rules.units, pr.advanced.holePitchIn, pr.advanced.sprinklerClearanceIn, pr.advanced.clearanceIn, pr.advanced.uprightStepIn, pr.advanced.flueIn]).toEqual(['turret', 6, 'meters', 3, 24, 6, 12, 6])
    // no heights on the building: no ceiling (the setup asks)
    expect(P.migrateProject(filled(false), null, {}).ceilings).toEqual([])
    // the ceiling the checks and the drawing read; the sprinkler clearance
    const T2 = P.withProject(T, pr)
    expect([E.ceilingOf(T2, null).clearHeightIn, E.sprinklerClearance(T2), E.sprinklerClearance({ sprinklerClearanceIn: 12 })]).toEqual([360, 24, 12])
  })

  it('PS-start-screen: Hub → New project (Draw on an empty layout) opens the start screen at once; File → New with the CAD already open opens it at once; a refresh on an empty new project too; an existing project never; nothing while the CAD is off screen', () => {
    const was = globalThis.confirm; globalThis.confirm = () => true
    const open = () => P.useProjectSetup.getState().open && P.useProjectSetup.getState().reason === 'new'
    const shut = () => P.useProjectSetup.setState({ open: false, reason: null })
    const existing = { objects: [{ id: 'r', type: 'rect', x: 0, y: 0, width: 10, height: 10 }], elevations: P.withProject(null, P.newProject()), history: ['{}'], historyIndex: 0 }
    // an existing project: entering the CAD (ProjectSetup mounted) opens nothing
    shut(); store.setState(existing)
    let leave = P.installStartScreen(store)
    expect(open()).toBe(false)
    // File → New while the CAD is open: the scene resets (history [] / -1) — the start screen opens at once, not on the
    // next visit
    store.getState().newScene()
    expect([store.getState().historyIndex, open()]).toEqual([-1, true])
    leave()
    // Hub → New project: the CAD entered on an empty layout with no project — at once, on mount
    shut()
    leave = P.installStartScreen(store)
    expect(open()).toBe(true)
    // Draw it myself (a project written): it stays shut afterwards; Undo back to nothing: a new project again
    shut(); store.setState({ elevations: P.withProject(null, P.newProject()) })
    expect(open()).toBe(false)
    store.setState({ elevations: null })
    expect(open()).toBe(true)
    leave()
    // off screen (the Hub): a reset opens nothing; a refresh (a fresh store state, empty, then the CAD entered) opens it
    shut(); store.setState(existing)
    store.getState().newScene()
    expect(open()).toBe(false)
    store.setState({ objects: [], elevations: null, history: [], historyIndex: -1 })
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

  it('PS-changes: what moves racks (the default pallet\'s face or depth, the forklift, the wall clearance) asks Regenerate / Keep; a pallet\'s height, weight or beam face updates the elevations that carry it; ceilings drive the checks', () => {
    const pr = P.newProject(), pal = P.defaultPallet(pr)
    const with_ = (f) => { const n = JSON.parse(JSON.stringify(pr)); f(n); return n }
    expect([P.layoutAffecting(pr, with_(n => { n.pallets[0].faceIn = 42 })), P.layoutAffecting(pr, with_(n => { n.equipment.mhe = 'turret' })), P.layoutAffecting(pr, with_(n => { n.rules.wallClearIn = 9 })), P.layoutAffecting(pr, with_(n => { n.pallets[0].heightIn = 60 })), P.layoutAffecting(pr, with_(n => { n.ceilings.push({ id: 'c', name: 'x', clearHeightIn: 300 }) }))]).toEqual([true, true, true, false, false])
    const T = { version: 1, defaultId: 'a', types: [E.makeType({ id: 'a', levelsCount: 4 })], project: pr }
    const next = with_(n => { n.pallets[0].heightIn = 54; n.pallets[0].weightLb = 2500; n.pallets[0].beamFaceIn = 5 })
    const r = P.syncTypesToPallets([], T, pr, next)
    expect([r.table.types[0].levels.every(l => l.palletHeightIn === 54 && l.loadLb === 2500), r.table.types[0].beamFaceIn, r.table.types[0].levels.map(l => l.beamIn)]).toEqual([true, 5, [0, 60, 120, 180]])
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
    // the start screen: building, pallet, forklift + walls, Advanced; then the layout step; Generate layout / Draw it myself
    expect(inOrder(startUi, ['aria-label="New project"', 'aria-label="Building"', 'label="Clear height (ft)"', 'label="Sprinkler height (ft)"', 'aria-label="Pallet"', 'label="Beam face (in)"', 'aria-label="Equipment and rules"', 'label="Wall clearance (in)"', '<Advanced ', 'label="Column grid X (ft)"', 'label="Max rack run (ft)"', 'aria="Row direction"', ' Draw it myself</button>', ' Generate layout</button>'])).toBe(true)
    // Project settings: the same sections, lists with + Add, delete not when in use, set default
    expect(inOrder(setUi, ['aria-label="Project setup"', 'aria-label="Ceiling heights"', 'aria-label="Pallet sizes"', 'aria-label="Equipment and rules"', '<Advanced '])).toBe(true)
    for (const k of ['name="defaultCeiling"', 'name="defaultPallet"', 'aria="Pallet weight (lb)"', 'aria="Beam face (in)"', 'aria-label="Add ceiling height"', 'aria-label="Add pallet size"', 'disabled={used}', 'disabled={blocked}', '>Regenerate racking</button>', '>Keep layout</button>']) expect([k, setUi.includes(k)]).toEqual([k, true])
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
    expect(tab).toMatch(/if \(same\) \{ useElevTab\.setState\(\{ activeId: same\.id, adding: false, made: \{ id: same\.id, kind: 'exists'/)
    expect(tab).toMatch(/\{made\.kind === 'exists' \? 'Already exists' : 'Created'\}: \{madeType \? nameOf\(T, madeType\) : ''\}<\/strong>\. Select rows on the plan, then click this elevation\./)
    expect(tab).toMatch(/if \(v === NEW\) \{ setNewForm\(key === 'ceilingId' \? 'ceiling' : 'pallet'\); return \}/)
    expect(tab).toMatch(/const madeNew = \(key\) => \(id\) => \{ setNewForm\(null\); if \(id\) setPick\(p => \(\{ \.\.\.p, \[key\]: id \}\)\) \}/)
  })
})
