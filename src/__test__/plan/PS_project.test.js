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

  it('PS-keeper: on load a layout without a project is given one in that same history entry (one undo step), unused elevation types dropped once; a new empty layout opens Project setup; the first racks with no ceiling open it once', async () => {
    stop = P.installProjectKeeper(store, () => ({ mhe: 'reach', wallClearIn: 3, units: 'ft · in' }))
    const o = filled(), m = E.migrate(o)
    const T = { ...m.table, types: [...m.table.types, { ...m.table.types[0], id: 'junk', name: "4 levels · 16' 2" }] }
    store.setState({ objects: m.objects, elevations: T, history: [JSON.stringify({ objects: m.objects, groups: [], elevations: T })], historyIndex: 0 })
    const st = store.getState()
    expect([!!P.projectOf(st.elevations), st.elevations.types.map(t => t.id), st.historyIndex]).toEqual([true, [m.table.defaultId], 0])
    expect(JSON.parse(st.history[0]).elevations.project).toBeTruthy()
    expect(st.objects).toBe(m.objects)                                                 // nothing moves
    // a new, empty layout: Project setup opens
    P.useProjectSetup.setState({ open: false, reason: null })
    store.setState({ objects: [], elevations: null, history: [JSON.stringify({ objects: [], groups: [], elevations: null })], historyIndex: 0 })
    expect([P.useProjectSetup.getState().open, P.useProjectSetup.getState().reason]).toEqual([true, 'new'])
    P.useProjectSetup.setState({ open: false, reason: null })
    // a project with no ceiling; the first racks go down: Project setup once (prompted), types made for them
    const pr = P.newProject()
    store.setState({ elevations: P.withProject(null, pr) })
    store.setState({ objects: o, history: [...store.getState().history, JSON.stringify({ objects: o, groups: [] })], historyIndex: store.getState().history.length })
    const s2 = store.getState()
    expect([P.useProjectSetup.getState().open, P.useProjectSetup.getState().reason, s2.elevations.project.setupPrompted, s2.elevations.types.length > 0]).toEqual([true, 'ceiling', true, true])
    P.useProjectSetup.setState({ open: false, reason: null })
    store.setState({ objects: [], history: [...s2.history, '{}'], historyIndex: s2.history.length })
    store.setState({ objects: o, history: [...store.getState().history, '{}'], historyIndex: store.getState().history.length })
    expect(P.useProjectSetup.getState().open).toBe(false)                              // once per project
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
    expect(gen).toMatch(/const palletWIn = pallet\?\.faceIn \?\? 40, palletDIn = pallet\?\.depthIn \?\? 48/)
    expect(gen).toMatch(/const aisleFt = mheOptions\[mhe\]\?\.aisleFt \?\? 10\.5/)
    expect(gen).toMatch(/openSetup\('ceiling', run\)/)
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
    const order = ['aria-label="Ceiling heights"', 'aria-label="Pallet sizes"', 'aria-label="Equipment"', 'aria-label="Rules"', 'aria-label="Advanced"'].map(k => ui.indexOf(k))
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true)
    for (const k of ['name="defaultCeiling"', 'name="defaultPallet"', 'aria="Pallet weight (lb)"', 'aria="Beam face (in)"', "['clearanceIn', 'Load clearance (in)']", "['sprinklerClearanceIn', 'Sprinkler clearance (in)']", "['holePitchIn', 'Hole pitch (in)']", "['flueIn', 'Flue (in)']", 'Upright step (ft)', '>Regenerate racking</button>', '>Keep layout</button>', '>Skip</button>']) expect([k, ui.includes(k)]).toEqual([k, true])
    expect(ui).toMatch(/const \[adv, setAdv\] = useState\(false\)/)                    // Advanced collapsed
    expect(ui).toMatch(/if \(old && gen && layoutAffecting\(old, pr\)\) \{ setAsk/)
    expect(src('App.jsx')).toMatch(/installProjectKeeper\(useCanvasStore,/)
  })
})
