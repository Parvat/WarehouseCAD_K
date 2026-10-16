// project.js — the project's settings (PROJECT_SETUP.md): ceiling heights, pallet sizes, equipment, rules, advanced.
//
// Part of the layout: kept on the layout's elevation table as `elevations.project`, so it is saved, undone and loaded
// with the layout like the elevation types (the canvas store's approved `elevations` field — the store itself is
// untouched). A layout from before is given one on load from what it already uses (`migrateProject`): nothing moves.
//
//   project = {
//     ceilings: [{ id, name, clearHeightIn, sprinklerIn | null }], defaultCeilingId,
//     pallets:  [{ id, name, faceIn, depthIn, heightIn, weightLb, beamFaceIn }], defaultPalletId,
//     equipment: { mhe },                       // the forklift; aisle widths follow it (the rules)
//     rules: { wallClearIn, units },
//     advanced: { clearanceIn, sprinklerClearanceIn, holePitchIn, uprightStepIn, flueIn },
//     setupPrompted,                            // the setup screen was shown for a missing ceiling (once)
//   }

import { create } from 'zustand'
import { ELEV_VERSION, isBeamRack, typeById, typeIdAt, sidesOf, snapshotOf, SPRINKLER_CLEARANCE_IN, migrate, syncAllLevels } from './elevations'

export const ADVANCED_DEFAULTS = { clearanceIn: 6, sprinklerClearanceIn: 18, holePitchIn: 2, uprightStepIn: 12, flueIn: 6 }
export const PALLET_DEFAULT = { name: '48×40', faceIn: 40, depthIn: 48, heightIn: 48, weightLb: 2000, beamFaceIn: 4 }
export const RULES_DEFAULTS = { wallClearIn: 3, units: 'ft · in' }

let seq = 0
export const newId = (p) => `${p}-${Date.now().toString(36)}${(++seq).toString(36)}`

/** A pallet's name from its size, face × depth the other way round as dealers say it ("48×40": depth × face). */
export const palletName = (p) => `${p.depthIn}×${p.faceIn}`

/** A fresh project — no ceiling yet (the setup screen asks), one pallet, the given forklift / rules. */
export function newProject({ mhe = 'reach', wallClearIn = RULES_DEFAULTS.wallClearIn, units = RULES_DEFAULTS.units, pallet = null } = {}) {
  const p = { id: newId('pal'), ...PALLET_DEFAULT, ...(pallet || {}) }
  if (!pallet?.name) p.name = palletName(p)
  return { ceilings: [], defaultCeilingId: null, pallets: [p], defaultPalletId: p.id, equipment: { mhe }, rules: { wallClearIn, units }, advanced: { ...ADVANCED_DEFAULTS }, setupPrompted: false }
}

/** The project of table `table` (null without one). */
export const projectOf = (table) => table?.project || null
export const defaultCeiling = (pr) => (pr ? pr.ceilings.find(c => c.id === pr.defaultCeilingId) || pr.ceilings[0] || null : null)
export const defaultPallet = (pr) => (pr ? pr.pallets.find(c => c.id === pr.defaultPalletId) || pr.pallets[0] || null : null)
export const advancedOf = (pr) => ({ ...ADVANCED_DEFAULTS, ...(pr?.advanced || {}) })
export const ceilingById = (pr, id) => (pr && id ? pr.ceilings.find(c => c.id === id) || null : null)
export const palletById = (pr, id) => (pr && id ? pr.pallets.find(c => c.id === id) || null : null)

/** The ceiling an elevation is checked and drawn against → { clearHeightIn, sprinklerIn } or null: its own ceiling
 *  entry, else the project's default, else (a layout without project ceilings) the building's old fields. */
export function ceilingFor(table, type, objects = null, parentId = null) {
  const pr = projectOf(table)
  const c = (type && ceilingById(pr, type.ceilingId)) || defaultCeiling(pr)
  if (c) return { clearHeightIn: c.clearHeightIn > 0 ? c.clearHeightIn : null, sprinklerIn: c.sprinklerIn > 0 ? c.sprinklerIn : null, id: c.id, name: c.name }
  if (!objects) return null
  const isFp = (o) => typeof o.type === 'string' && o.type.startsWith('fp_')
  const fp = objects.find(o => o.id === parentId && isFp(o)) || objects.find(isFp)
  if (!fp) return null
  const ch = fp.clearHeightFt > 0 ? fp.clearHeightFt * 12 : null, sp = fp.sprinklerFt > 0 ? fp.sprinklerFt * 12 : null
  return ch || sp ? { clearHeightIn: ch, sprinklerIn: sp } : null
}
/** The pallet an elevation carries: its own entry, else the project's default. */
export const palletFor = (table, type) => { const pr = projectOf(table); return (type && palletById(pr, type.palletId)) || defaultPallet(pr) }
/** The sprinkler clearance (in) — the project's advanced setting; a table from before: its own; else 18". */
export const projectSprinklerClearance = (table) => {
  const a = projectOf(table)?.advanced?.sprinklerClearanceIn
  if (Number.isFinite(a) && a >= 0) return a
  return Number.isFinite(table?.sprinklerClearanceIn) && table.sprinklerClearanceIn >= 0 ? table.sprinklerClearanceIn : SPRINKLER_CLEARANCE_IN
}

/** A project made from what layout `objects` (with table `table`) already uses — the default entries; nothing moves.
 *  `current` gives what lives outside the layout today ({ mhe, wallClearIn, units, palletWIn, palletDIn }). */
export function migrateProject(objects, table, current = {}) {
  const racks = objects.filter(isBeamRack)
  const count = (key) => { const n = new Map(); for (const r of racks) { const v = r[key]; if (Number.isFinite(v)) n.set(v, (n.get(v) || 0) + 1) } return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }
  const def = table ? typeById(table, table.defaultId) || table.types?.[0] : null
  const lv0 = def?.levels?.[0]
  const pal = {
    faceIn: count('palletWIn') ?? current.palletWIn ?? PALLET_DEFAULT.faceIn, depthIn: count('palletDIn') ?? current.palletDIn ?? PALLET_DEFAULT.depthIn,
    heightIn: lv0?.palletHeightIn ?? table?.fit?.palletHeightIn ?? PALLET_DEFAULT.heightIn, weightLb: lv0?.loadLb ?? PALLET_DEFAULT.weightLb,
    beamFaceIn: Number.isFinite(def?.beamFaceIn) ? def.beamFaceIn : table?.fit?.beamFaceIn ?? PALLET_DEFAULT.beamFaceIn,
  }
  const pr = newProject({ mhe: current.mhe || 'reach', wallClearIn: Number.isFinite(current.wallClearIn) ? current.wallClearIn : RULES_DEFAULTS.wallClearIn, units: current.units || RULES_DEFAULTS.units, pallet: pal })
  const fp = objects.find(o => typeof o.type === 'string' && o.type.startsWith('fp_') && ((o.clearHeightFt > 0) || (o.sprinklerFt > 0)))
  if (fp) {
    const c = { id: newId('ceil'), name: 'Main', clearHeightIn: fp.clearHeightFt > 0 ? Math.round(fp.clearHeightFt * 12) : null, sprinklerIn: fp.sprinklerFt > 0 ? Math.round(fp.sprinklerFt * 12) : null }
    pr.ceilings = [c]; pr.defaultCeilingId = c.id
  }
  const f = table?.fit || {}
  pr.advanced = { ...ADVANCED_DEFAULTS, ...(Number.isFinite(f.clearanceIn) ? { clearanceIn: f.clearanceIn } : Number.isFinite(def?.clearanceIn) ? { clearanceIn: def.clearanceIn } : {}), ...(Number.isFinite(table?.sprinklerClearanceIn) ? { sprinklerClearanceIn: table.sprinklerClearanceIn } : {}), ...(Number.isFinite(f.holePitchIn) ? { holePitchIn: f.holePitchIn } : Number.isFinite(def?.holePitchIn) ? { holePitchIn: def.holePitchIn } : {}), ...(Number.isFinite(f.uprightStepIn) ? { uprightStepIn: f.uprightStepIn } : {}) }
  return pr
}

/** `table` without the types no bay carries (never the default) — the one-time tidy of a layout given its project. */
export function dropUnusedTypes(objects, table) {
  if (!table?.types?.length) return table
  const used = new Set([table.defaultId])
  for (const r of objects.filter(isBeamRack)) for (let s = 0; s < sidesOf(r); s++) r.beams.forEach((_, b) => used.add(typeIdAt(r, b, s, table)))
  const types = table.types.filter(t => used.has(t.id))
  return types.length === table.types.length ? table : { ...table, types }
}

/** Does `next` move racks against `prev`: the default pallet's face or depth, the forklift, or the wall clearance? */
export function layoutAffecting(prev, next) {
  if (!prev || !next) return false
  const a = defaultPallet(prev), b = defaultPallet(next)
  return (a?.faceIn !== b?.faceIn) || (a?.depthIn !== b?.depthIn) || (prev.equipment?.mhe !== next.equipment?.mhe) || (prev.rules?.wallClearIn !== next.rules?.wallClearIn)
}

/** The elevations following the pallets they carry: a type's pallet (its own, else the default) whose height, weight
 *  or beam face changed from `prev` gives every level that pallet height and load, and the type that beam face →
 *  { objects, table }. Levels and beams stay where they are (the checks show what no longer fits). */
export function syncTypesToPallets(objects, table, prev, next) {
  if (!table?.types?.length || !prev) return { objects, table }
  let changed = false
  const types = table.types.map(t => {
    const p = palletById(next, t.palletId) || defaultPallet(next), q = palletById(prev, t.palletId) || defaultPallet(prev)
    if (!p || !q || p.id !== q.id) return t
    if (p.heightIn === q.heightIn && p.weightLb === q.weightLb && p.beamFaceIn === q.beamFaceIn) return t
    changed = true
    return { ...t, beamFaceIn: p.beamFaceIn ?? t.beamFaceIn, levels: t.levels.map(l => ({ ...l, palletHeightIn: p.heightIn ?? l.palletHeightIn, loadLb: p.weightLb ?? l.loadLb })) }
  })
  return changed ? { objects, table: { ...table, types } } : { objects, table }
}

/** The table with `project` (a layout without a table: one holding only the project — no types yet). */
export const withProject = (table, project) => (table ? { ...table, project } : { version: ELEV_VERSION, defaultId: null, types: [], project })

/** Write `project` into the layout — ONE undo step (the table's own commit). `objects`: replaced too (elevations
 *  following a pallet change). */
export function commitProject(store, project, objects = null, table = undefined) {
  const st = store.getState()
  st.commitElevations(withProject(table === undefined ? st.elevations : table, project), objects)
}

/** The setup screen: open, why (first run of a project, a missing ceiling, or from Project settings), and what to run
 *  when it closes (Generate waits for it). Presentation state. */
export const useProjectSetup = create(() => ({ open: false, reason: null, then: null }))
export const openSetup = (reason = 'settings', then = null) => useProjectSetup.setState({ open: true, reason, then })
export const closeSetup = () => { const t = useProjectSetup.getState().then; useProjectSetup.setState({ open: false, reason: null, then: null }); if (t) t() }

/** The first elevations of a project whose racks have none yet → { table, objects } or null: one type per distinct
 *  level count (migrate's), the most common the default — the project kept. */
export let firstElevations = (objects, table) => {
  const m = migrate(objects)
  if (!m) return null
  const t = { ...table, defaultId: m.table.defaultId, types: m.table.types }
  return { table: t, objects: syncAllLevels(m.objects, t) }
}
/** Replace how a project's first elevations are made (Elevations: the best fit for the default ceiling and pallet). */
export const setFirstElevations = (fn) => { firstElevations = fn }

/** For a store: a layout without a project is given one — a load or an action folds it into that same history entry
 *  (one undo step), migrated from what the layout uses (`current()`), unused elevation types dropped once; a new,
 *  empty layout opens the setup screen; the first racks placed with no ceiling open it once (Skip allowed).
 *  Returns the unsubscribe. */
export function installProjectKeeper(store, current = () => ({})) {
  let busy = false, lastRacks = store.getState().objects.some(isBeamRack), lastHist = store.getState().history
  const fold = (st, table, objects = st.objects) => {
    const full = { elevations: table, ...(objects !== st.objects ? { objects } : {}) }
    if (st.historyIndex >= 0 && st.history.length) {
      const history = st.history.slice(0, st.historyIndex + 1)
      history[history.length - 1] = snapshotOf(st, objects, table)
      full.history = history; full.historyIndex = history.length - 1
    }
    busy = true
    try { store.setState(full) } finally { busy = false }
  }
  const run = (st) => {
    if (busy) return
    const T = st.elevations, racks = st.objects.some(isBeamRack)
    const fresh = st.history !== lastHist && st.historyIndex === 0
    lastHist = st.history
    if (!projectOf(T)) {
      if (!st.objects.length) {                                  // a new, empty layout: set the project up first
        if (fresh && !useProjectSetup.getState().open) openSetup('new')
        lastRacks = racks; return
      }
      fold(st, withProject(dropUnusedTypes(st.objects, T), migrateProject(st.objects, T, current())))
      lastRacks = racks; return
    }
    const pr = projectOf(T)
    let table = T, objects = st.objects, ask = false
    // racks on a project with no elevation yet: their first elevations (`firstElevations`)
    if (racks && !T.types?.length) { const made = firstElevations(st.objects, T); if (made) { table = made.table; objects = made.objects } }
    // the first racks with no ceiling height: the setup screen, once per project
    if (racks && !lastRacks && !pr.ceilings.length && !pr.setupPrompted && !useProjectSetup.getState().open) { table = withProject(table, { ...pr, setupPrompted: true }); ask = true }
    if (table !== T || objects !== st.objects) fold(st, table, objects)
    if (ask) openSetup('ceiling')
    lastRacks = racks
  }
  run(store.getState())
  return store.subscribe(run)
}
