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
    expect([T.types.length, T.types[0].name, T.types[0].levels.length, T.types[0].uprightHeightIn, T.defaultId === T.types[0].id]).toEqual([1, '5 levels · 40×48 · Main', 5, 252, true])
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
    // theme-p2: captions are written in sentence case (t-cap uppercases them) and the unit sits inside the input
    for (const k of ['label="Length"', 'label="Width"', '>Column grid<', '>Row direction<', 'label="Max rack run"', 'aria-label="Max rack run (ft)"']) expect([k, gen.includes(k)]).toEqual([k, true])
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
    expect(inOrder(startUi, ['aria-label="New project"', 'aria-label="Building"', '<Times label="Length × width">', 'aria="Length (ft)"', 'aria="Width (ft)"', 'aria="Clear height (ft)"', 'aria="Sprinkler height (ft)"', 'aria-label="Pallet"', '<Times label="Face × depth × height">', 'aria="Pallet face (in)"', 'aria="Pallet depth (in)"', 'aria="Pallet height (in)"', 'aria="Pallet weight (lb)"', 'aria-label="Layout"', '<ForkliftSelect ', '<Times label="Column grid">', 'aria="Row direction"', 'aria="Max rack run (ft)"', 'aria="Wall clearance (in)"', '<Advanced ', ' Draw it myself</button>', '<Sparkles {...ICON} /> Generate layout</>'])).toBe(true)
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
    expect(tab).toMatch(/\{made\.kind === 'exists' \? 'Already exists' : made\.kind === 'saved' \? 'Saved' : 'Created'\}: \{nameOf\(T, madeType\)\}\.<\/strong>/)
    expect(tab).toMatch(/onChange=\{ev => editDraft\(store, \{ ceilingId: ev\.target\.value \|\| null \}\)\}/)
    expect(tab).toMatch(/onChange=\{ev => editDraft\(store, \{ newPallet: \{ \[k\]: ev\.target\.value \} \}\)\}/)
  })
  it('PS-names: auto names are "N levels · FACE×DEPTH · CEILING"; " · X in beam" only where two would read the same (they once both read "5 levels · 48×40 · sf"); no number suffixes ("· copy" only for two the same in every way); an existing layout is renamed on load, in that same history entry, nothing moving', () => {
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'sf', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }
    const fit = bestFitFor(pr, pr.ceilings[0], P.defaultPallet(pr))
    const pair = '5 levels · 40×48 · sf'
    expect(P.nameOf(P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...fit, id: 'a', name: '' }] }, pr), { ...fit, id: 'a' })).toBe(pair)   // alone: no extras
    // the same pairing, different beam faces: the beam says which
    const two = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...fit, id: 'a', name: pair, color: '#f00' }, { ...fit, id: 'b', name: pair, beamFaceIn: 5, color: '#00f' }, { ...fit, id: 'c1', name: 'Mezz racks', named: true }] }, pr)
    const u = P.uniqueNames(two)
    expect(u.types.map(t => P.nameOf(u, t))).toEqual([pair + ' · 4 in beam', pair + ' · 5 in beam', 'Mezz racks'])
    expect(P.uniqueNames(u)).toBe(u)                                                          // already unique: untouched
    expect(u.types.some(t => / \d+$/.test(t.name))).toBe(false)                               // no number suffixes
    // a NEW draft the same as an existing one: named like it, never "· copy" (the editor says "Same as …" instead)
    const one = P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...fit, id: 'a', name: pair }] }, pr)
    expect([P.previewName(one, { ...fit }, null), T_.sameElevation(one, { ...fit })?.id, P.previewName(one, { ...fit, beamFaceIn: 5 }, null)]).toEqual([pair, 'a', pair + ' · 5 in beam'])   // the name follows the beam live
    // the same in every way (a duplicate): "· copy" — the beam (the same) not added
    const same = P.uniqueNames(P.withProject({ version: E.ELEV_VERSION, defaultId: 'a', types: [{ ...fit, id: 'a', name: '' }, { ...fit, id: 'b', name: '' }] }, pr))
    expect(same.types.map(t => t.name)).toEqual([pair, pair + ' · copy'])
    // on load: the keeper folds the renaming into that history entry; the bays and beams don't move
    stop = P.installProjectKeeper(store, () => ({}))
    const o = filled(), m = E.migrate(o)
    const dup = P.withProject({ ...two, types: two.types.map(t => (t.named ? t : { ...t, name: pair })) }, pr)   // as saved before: the same stored name
    store.setState({ objects: m.objects, elevations: dup, history: [JSON.stringify({ objects: m.objects, groups: [], elevations: dup })], historyIndex: 0 })
    const T = store.getState().elevations
    expect([T.types.map(t => P.nameOf(T, t)), store.getState().historyIndex, JSON.parse(store.getState().history[0]).elevations.types[0].name, store.getState().objects === m.objects]).toEqual([[pair + ' · 4 in beam', pair + ' · 5 in beam', 'Mezz racks'], 0, pair + ' · 4 in beam', true])
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
  it('PS-frame-depth: an elevation whose pallet needs deeper frames than the racks carrying it (frame ≈ pallet depth − 6", 3" overhang each side) is said on the drawing and as a Check layout warning — "Pallet 60" deep needs ~54" frames — these racks are 42"" — and the racks are not changed', () => {
    expect([E.frameNeededFor(60), E.frameDepthNote(60, 42), E.frameDepthNote(60, [42, 36, 54], 'Selected rows'), E.frameDepthNote(48, 42), E.frameDepthNote(60, 54), E.frameDepthNote(null, 42)])
      .toEqual([54, '60 in deep pallet needs about 54 in frames. These rows are 42 in.', '60 in deep pallet needs about 54 in frames. Selected rows are 36 and 42 in.', null, null, null])
    const o = filled(), m = E.migrate(o)
    const racks = m.objects.filter(E.isBeamRack), d = racks[0].depthIn ?? 42, deep = d + 18
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }
    pr.pallets = [...pr.pallets, { id: 'pd', name: 'deep', faceIn: 40, depthIn: deep, heightIn: 48, weightLb: 2500 }]
    // every rack carries the default elevation; give it the deep pallet
    const T = P.withProject({ ...m.table, types: m.table.types.map(t => ({ ...t, palletId: t.id === m.table.defaultId ? 'pd' : t.palletId })) }, pr)
    const before = JSON.stringify(m.objects.map(r => [r.id, r.depthIn]))
    const issues = E.elevationIssues(m.objects, T).filter(e => e.kind === 'elev-frame-depth')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every(e => e.severity === 'warning' && e.text.startsWith('Elevation ') && e.text.includes(`${deep} in deep pallet needs about ${deep - 6} in frames. These rows are `))).toBe(true)
    const flagged = new Set(issues.flatMap(e => e.ids))
    expect(racks.filter(r => (r.depthIn ?? 42) < deep - 6 && flagged.has(r.id)).length).toBe(flagged.size)
    expect(JSON.stringify(m.objects.map(r => [r.id, r.depthIn]))).toBe(before)                // no automatic change to the racks
    // Check layout: a warning, not an error
    const res = checkLayout(m.objects, { gridSize: GS, elevations: T })
    expect([res.warnings.some(w => w.kind === 'elev-frame-depth'), res.errors.some(e => e.kind === 'elev-frame-depth')]).toEqual([true, false])
    // the default pallet (48" deep) on these frames: nothing said
    expect(E.elevationIssues(m.objects, P.withProject(m.table, pr)).some(e => e.kind === 'elev-frame-depth')).toBe(false)
    // the drawing: the note in red under it, only when short
    const t = T.types[0], texts = (o2) => E_D.elevationLayout(t, 96, { w: 800, h: 600 }, o2).items.filter(i => i.t === 'text')
    const note = texts({ palletDIn: 60, depthIn: 42 }).find(i => i.tag === 'frame-depth')
    expect([note?.s, note?.fill]).toEqual(['60 IN DEEP PALLET NEEDS ABOUT 54 IN FRAMES. THESE ROWS ARE 42 IN.', '#B5730F'])   // amber: a warning, not an error
    expect([texts({ palletDIn: 48, depthIn: 42 }).some(i => i.tag === 'frame-depth'), texts({ palletDIn: 60, depthIn: 54 }).some(i => i.tag === 'frame-depth'), texts({ depthIn: 42 }).some(i => i.tag === 'frame-depth')]).toEqual([false, false, false])
    // the tab and the PDF hand the drawing the elevation's pallet depth
    const tab = src('components/Elevations/ElevationsTab.jsx')
    expect(tab).toMatch(/palletDIn: pal\?\.depthIn \?\? null/)
    // the panel: the amber note in the pallet box — the selected rows, else (editing) the rows using it
    expect(tab).toMatch(/frameDepthNote\(pallet\.depthIn, rows\.map\(r => r\.depthIn \?\? 42\), selRacks\.length \? 'Selected rows' : 'Rows using it'\)/)
    expect(tab).toMatch(/\{depthNote && \(\s*<Note level="warning" role="note" aria-label="Pallet depth">\s*\{depthNote\}/)
    expect(src('components/Elevations/ElevationDrawing.jsx')).toMatch(/palletDIn: entry\.palletDIn/)
    expect(src('export/pdfExport.js')).toMatch(/palletDIn: palletOfType\(T, type\)\?\.depthIn \?\? null/)
    // the row menu: portalled to the themed root, fixed, over everything — below the row, flipped above near the bottom
    expect(tab).toMatch(/return createPortal\(\s*<div ref=\{ref\} role="menu"[^>]*position: 'fixed', left, \.\.\.pos, zIndex: 500/)
    expect(tab).toMatch(/const host = document\.querySelector\('\[data-theme\]'\) \|\| document\.body/)
    expect(tab).toMatch(/<RowMenu t=\{t\} T=\{T\} anchor=\{menu\.el\} onClose=\{closeMenu\} \/>/)
    expect(tab).toMatch(/const pos = r\.bottom \+ 6 \+ MENU_H > window\.innerHeight - 8 \? \{ bottom: window\.innerHeight - r\.top \+ 6 \} : \{ top: r\.bottom \+ 6 \}/)
  })

  it('PS-editor-new: "+ New ceiling height" and "+ New pallet size" stay in the editor draft — the fit and the name follow them, the project untouched — until the ONE Save adds both and the elevation in one undo step; Cancel discards them', () => {
    const pr = { ...P.newProject(), ceilings: [{ id: 'c', name: 'Main', clearHeightIn: 360, sprinklerIn: 354 }], defaultCeilingId: 'c' }
    store.setState({ objects: [], elevations: P.withProject(null, pr), history: [JSON.stringify({ objects: [], groups: [], elevations: P.withProject(null, pr) })], historyIndex: 0 })
    const tab = () => T_.useElevTab.getState(), s = () => store.getState()
    T_.startNew(store)
    T_.editDraft(store, { ceilingId: T_.NEW_CEILING }); T_.editDraft(store, { newCeiling: { name: 'Mezz', clearFt: '20' } })
    T_.editDraft(store, { palletId: T_.NEW_PALLET }); T_.editDraft(store, { newPallet: { faceIn: '40', depthIn: '60', heightIn: '48' } })
    // the draft: refitted to the new pair (20' → 4 levels of 48"), named after it; the project and history untouched
    const dT = T_.draftTable(s().elevations, tab().editing)
    expect([tab().editing.draft.levels.length, P.previewName(dT, tab().editing.draft, null), P.projectOf(s().elevations).ceilings.length, P.projectOf(s().elevations).pallets.length, s().historyIndex]).toEqual([4, '4 levels · 40×60 · Mezz', 1, 1, 0])
    // Cancel: nothing written
    T_.cancelEdit()
    expect([P.projectOf(s().elevations).ceilings.length, P.projectOf(s().elevations).pallets.length, s().historyIndex, (s().elevations.types || []).length]).toEqual([1, 1, 0, 0])
    // again, and Save: the ceiling, the pallet and the elevation — one undo step, the elevation pointing at both
    T_.startNew(store)
    T_.editDraft(store, { ceilingId: T_.NEW_CEILING }); T_.editDraft(store, { newCeiling: { name: 'Mezz', clearFt: '20' } })
    T_.editDraft(store, { palletId: T_.NEW_PALLET }); T_.editDraft(store, { newPallet: { faceIn: '40', depthIn: '60', heightIn: '48' } })
    const out = T_.saveEdit(store), T = s().elevations, pr2 = P.projectOf(T), t = T.types.find(x => x.id === out.id)
    const c = pr2.ceilings.find(x => x.name === 'Mezz'), p = pr2.pallets.find(x => x.depthIn === 60)
    expect([out.kind, s().historyIndex, !!c, c?.clearHeightIn, !!p, p?.name, t.ceilingId === c?.id, t.palletId === p?.id, P.nameOf(T, t)]).toEqual(['new', 1, true, 240, true, '60×40', true, true, '4 levels · 40×60 · Mezz'])
    // one undo: all three gone
    s().undo()
    expect([P.projectOf(s().elevations).ceilings.length, P.projectOf(s().elevations).pallets.length, (s().elevations.types || []).length]).toEqual([1, 1, 0])
  })
  it('PS-frame-fix: the side view draws each level\'s pallets at their real depth, centred on the frame, the overhang past frame + 6" in amber; "Set these rows to N in" (the pallet less 6", up to the app\'s frame depths) deepens only the target rows that are too shallow, one undo step, only on the click', () => {
    // the depth: the pallet less 6", rounded up to the frame depths the app uses; past the deepest, the need itself
    expect([T_.frameDepthFor(60), T_.frameDepthFor(46), T_.frameDepthFor(54), T_.frameDepthFor(60, [36, 42, 48, 54, 60]), T_.frameDepthFor(47)]).toEqual([54, 42, 48, 54, 42])
    // the side view
    const t = E.makeType({ id: 's', levelsCount: 3 }), side = (o) => E_D.elevationLayout(t, 96, { w: 800, h: 600 }, { view: 'side', ...o })
    const d = side({ palletDIn: 60, depthIn: 42 }), loads = d.items.filter(i => i.tag === 'side-load' && i.fill === '#E8DCC2'), over = d.items.filter(i => i.tag === 'side-overhang')
    expect(loads.length).toBe(3)                                                               // one per level
    expect(Math.round(loads[0].w / d.scale)).toBe(60)                                          // its real depth
    const frames = d.items.filter(i => i.tag === 'frame'), fx0 = Math.min(...frames.map(f => f.x)), fx1 = Math.max(...frames.map(f => f.x + f.w))
    expect(Math.abs((loads[0].x + loads[0].w / 2) - (fx0 + fx1) / 2)).toBeLessThan(0.5)        // centred on the frame
    expect([over.length, over.every(o => o.fill === '#B5730F'), Math.round(over[0].w / d.scale)]).toEqual([6, true, 6])   // 60 − (42 + 6) = 12: 6" a side, per level
    expect(side({ palletDIn: 48, depthIn: 42 }).items.some(i => i.tag === 'side-overhang')).toBe(false)   // within frame + 6": none
    const pair = E_D.elevationLayout(t, 96, { w: 800, h: 600 }, { view: 'side', palletDIn: 60, depthIn: 42, pair: true, flueIn: 9 })
    expect(pair.items.filter(i => i.tag === 'side-load' && i.fill === '#E8DCC2').length).toBe(6)  // back-to-back: both frames
    // the fix: only the target rows that are too shallow, one undo step; undo puts them back
    const o = filled(), m = E.migrate(o)
    const racks = m.objects.filter(E.isBeamRack), deepOne = { ...racks[1], depthIn: 60 }
    const objs = m.objects.map(r => (r.id === deepOne.id ? deepOne : r))
    store.setState({ objects: objs, elevations: m.table, history: [JSON.stringify({ objects: objs, groups: [], elevations: m.table })], historyIndex: 0 })
    const targets = [racks[0].id, deepOne.id], h0 = store.getState().historyIndex
    const n = T_.deepenRows(store, targets, 54)
    const s1 = store.getState(), byId = (id) => s1.objects.find(x => x.id === id)
    expect([n, s1.historyIndex - h0, byId(racks[0].id).depthIn, byId(deepOne.id).depthIn, byId(racks[2].id).depthIn]).toEqual([1, 1, 54, 60, racks[2].depthIn ?? 42])
    expect(Math.abs((byId(racks[0].id).y + byId(racks[0].id).height / 2) - (racks[0].y + racks[0].height / 2))).toBeLessThan(1e-6)   // about its centre
    expect(T_.deepenRows(store, targets, 54)).toBe(0)                                          // deep enough: nothing (no empty undo step)
    s1.undo()
    expect(store.getState().objects.find(x => x.id === racks[0].id).depthIn).toBe(racks[0].depthIn ?? 42)
    // the wiring: the button under both notes; deepenRows only from it; the toolbar's Simple | Detailed
    const tab = src('components/Elevations/ElevationsTab.jsx')
    expect(tab).toMatch(/onClick=\{\(\) => deepenRows\(store, rows\.map\(r => r\.id\), to\)\}/)
    expect(tab).toMatch(/Set these rows to \{to\} in/)
    expect(tab).toMatch(/\{drawFix && \(\s*<div style=\{\{ height: FIX_H,[\s\S]*?<FixButton rows=\{fixRows\} to=\{fixTo\}/)
    expect(tab).toMatch(/<FixButton rows=\{rows\.filter\(r => \(r\.depthIn \?\? 42\) < frameNeededFor\(pallet\.depthIn\) - 1e-6\)\} to=\{frameDepthFor\(pallet\.depthIn, frameDepths\)\}/)
    expect((tab.match(/deepenRows\(/g) || []).length).toBe(1)                                  // never without the click
    const bar = tab.slice(tab.indexOf('role="toolbar" aria-label="Drawing toolbar"'), tab.indexOf('data-drawing-box'))
    expect(['aria-label="View"', 'aria-label="Drawing detail"', 'aria-label="Beam length"'].map(k => bar.indexOf(k)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]))).toBe(true)
    expect(src('components/Elevations/ElevationDrawing.jsx')).toMatch(/role="group" aria-label="Drawing detail"/)   // full screen keeps it
  })
  it('PS-depth-action: "Set these rows to N in" and Properties\' Frame depth are ONE action — a wall row keeps its wall face (its clearance) and grows away from the wall, also turned; a back-to-back pair keeps its centre and flue and grows outward; one undo step; the aisle checks run after', async () => {
    const RD = await import('../../utils/rackDepth'), RA = await import('../../utils/rackDepthAction'), LCm = await import('../../utils/layoutCheck')
    const GS = 40, ft = (inch) => inch / 12 * GS
    // a building with 3" walls (10 px): the inner face at 10 px
    const fp = { id: 'fp', type: 'fp_rect', x: 0, y: 0, width: 4000, height: 2400, wallThicknessFt: 0.25 }
    const beams = Array(10).fill(96)
    const wall = { id: 'w', type: 'rack_row', parentId: 'fp', x: 400, y: 10 + ft(3), width: 1000, height: ft(42), depthIn: 42, beams, rotation: 0 }                            // 3" off the top wall
    const pair = { id: 'p', type: 'rack_double_row', parentId: 'fp', x: 400, y: 1000, width: 1000, height: ft(2 * 42 + 9), depthIn: 42, flueSpaceIn: 9, beams, rotation: 0 }      // in the open
    const cx = 10 + ft(3) + ft(42) / 2, turned = { id: 't', type: 'rack_row', parentId: 'fp', x: cx - 500, y: 1200 - ft(42) / 2, width: 1000, height: ft(42), depthIn: 42, beams, rotation: 90 }   // turned, 3" off the left wall
    const objs = [fp, wall, pair, turned]
    expect([RD.wallSideOf(wall, objs, GS), RD.wallSideOf(pair, objs, GS), RD.wallSideOf(turned, objs, GS)]).toEqual([-1, 0, 1])
    // ONE on-wall rule, Fill's and Generate's (generate/wallRun.js wallLineFor): within the rack's depth — 3 ft 6 in for a
    // 42" frame — of a wall counts as on it; no second threshold of its own
    const WR = await import('../../generate/wallRun')
    expect([WR.WALL_REACH_FT, WR.wallReachFt(42), WR.wallReachFt(54), WR.wallReachFt(null)]).toEqual([3.5, 3.5, 4.5, 3.5])
    expect([WR.wallLineFor(100, [10, 70, 200], -1, 40), WR.wallLineFor(100, [10, 50], -1, 40), WR.wallLineFor(100, [130, 160], +1, 40), WR.wallLineFor(100, [150], +1, 40)]).toEqual([70, null, 130, null])
    const at = (gapIn, depthIn = 42) => RD.wallSideOf({ ...wall, y: 10 + ft(gapIn), depthIn, height: ft(depthIn) }, objs, GS)
    expect([at(3), at(30), at(42), at(43), at(50), at(50, 54)]).toEqual([-1, -1, -1, 0, 0, -1])   // 30" on the wall (the old 18" said no); 50" off: a 54" rack's reach, not a 42"'s
    expect(src('utils/rackDepth.js')).toMatch(/return wallLineFor\(m\.x \* n\.x \+ m\.y \* n\.y, lines, \+1, reach\) != null/)
    expect(src('utils/rackDepth.js')).toMatch(/reach = wallReachFt\(r\.depthIn \?\? 42\) \* gridSize/)
    expect(/WALL_FACE_IN|\b18\b/.test(src('utils/rackDepth.js'))).toBe(false)
    expect(src('generate/fillRacking.js')).toMatch(/const lo = \(v, lines\) => wallLineFor\(v, lines, -1, reach\) \?\? v/)
    expect(src('generate/fillRacking.js')).toMatch(/export function snapToWalls\(boxPx, fp, gridSize = 40, reachFt = WALL_REACH_FT,/)
    store.setState({ objects: objs, gridSize: GS, history: [JSON.stringify({ objects: objs, groups: [] })], historyIndex: 0 })
    LCm.useLayoutCheck.setState({ open: true, result: { errors: [], warnings: [], at: 0 } })
    const n = RA.setRackDepths(store, ['w', 'p', 't'], 54)
    const s1 = store.getState(), by = (id) => s1.objects.find(o => o.id === id)
    expect([n, s1.historyIndex]).toEqual([3, 1])                                               // one undo step
    // the wall row: its wall face where it was (3" clearance kept), the new depth all away from the wall
    expect([by('w').y, by('w').height, by('w').depthIn]).toEqual([wall.y, ft(54), 54])
    // the turned wall row: its wall face (the left, in the world) where it was
    const leftFace = (r) => r.x + r.width / 2 - r.height / 2
    expect([Math.round(leftFace(by('t')) * 1000) / 1000, Math.round(leftFace(turned) * 1000) / 1000, by('t').height]).toEqual([Math.round(leftFace(turned) * 1000) / 1000, Math.round(leftFace(turned) * 1000) / 1000, ft(54)])
    // the pair: centre and flue kept, both halves outward by the same
    expect([by('p').y + by('p').height / 2, by('p').height, by('p').flueSpaceIn]).toEqual([pair.y + pair.height / 2, ft(2 * 54 + 9), 9])
    // the aisle checks: an open Check layout ran again
    expect(LCm.useLayoutCheck.getState().result.at).toBeGreaterThan(0)
    LCm.useLayoutCheck.setState({ open: false, result: null })
    // undo: all three back
    s1.undo()
    expect(store.getState().objects.find(o => o.id === 'w').y).toBe(wall.y)
    expect(store.getState().objects.find(o => o.id === 'w').depthIn).toBe(42)
    // the fix only deepens what is too shallow
    store.setState({ objects: objs.map(o => (o.id === 'p' ? { ...o, depthIn: 60, height: ft(129) } : o)), history: ['{}'], historyIndex: 0 })
    expect(T_.deepenRows(store, ['w', 'p'], 54)).toBe(1)
    expect(store.getState().objects.find(o => o.id === 'p').depthIn).toBe(60)
    // ONE action: Properties (several racks, one rack), the Row group's replay and the button all go through it
    expect(src('components/RightPanel/PropertiesPanel.jsx')).toMatch(/const setDepth = \(v\) => \{ setRackDepths\(useCanvasStore, racks\.map\(r => r\.id\), v\) \}/)
    expect(src('components/RightPanel/panels/RackRowPanelCore.jsx')).toMatch(/onCommit=\{v => \{ setRackDepths\(useCanvasStore, \[obj\.id\], v\) \}\}/)
    expect(src('utils/elevTab.js')).toMatch(/export const deepenRows = \(store, ids, depthIn\) => setRackDepths\(store, ids, depthIn, \{ onlyShallower: true \}\)/)
    expect(src('utils/rowGroup.js')).toMatch(/rackDepthAt\(o, edit\.depthIn, after, gridSize\)/)
    expect(/rackDepthUpdate\(/.test(src('components/RightPanel/PropertiesPanel.jsx') + src('components/RightPanel/panels/RackRowPanelCore.jsx') + src('utils/elevTab.js') + src('utils/rowGroup.js'))).toBe(false)
  })
})
