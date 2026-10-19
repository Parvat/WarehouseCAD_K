// project.js — the project's settings (PROJECT_SETUP.md): ceiling heights, pallet sizes, equipment, rules, advanced.
//
// Part of the layout: kept on the layout's elevation table as `elevations.project`, so it is saved, undone and loaded
// with the layout like the elevation types (the canvas store's approved `elevations` field — the store itself is
// untouched). A layout from before is given one on load from what it already uses (`migrateProject`): nothing moves.
//
//   project = {
//     ceilings: [{ id, name, clearHeightIn | null, sprinklerIn | null }], defaultCeilingId,
//     pallets:  [{ id, name, faceIn, depthIn, heightIn, weightLb, beamFaceIn }], defaultPalletId,
//     equipment: { mhe },                       // the forklift; aisle widths follow it (the rules)
//     rules: { wallClearIn, units },
//     advanced: { clearanceIn, sprinklerClearanceIn, holePitchIn, uprightStepIn, flueIn },
//     building: { lengthFt, widthFt, gridXFt, gridYFt, columnsAlongWall, orientation, maxRunFt },  // the start screen's
//   }                                                                                               // brief (Generate's)
//
// A clear height not set is assumed 24' (ASSUMED_CLEAR_IN) by the fit, the drawing and the checks; Check layout lists
// it as a reminder (`projectReminders`).

import { create } from 'zustand'
import { ELEV_VERSION, isBeamRack, typeById, typeIdAt, sidesOf, snapshotOf, SPRINKLER_CLEARANCE_IN, ASSUMED_CLEAR_IN, migrate, syncAllLevels, PALETTE, editTable } from './elevations'
import { bestFitFor, pairName } from './elevFit'
export { ASSUMED_CLEAR_IN }

export const ADVANCED_DEFAULTS = { clearanceIn: 6, sprinklerClearanceIn: 18, holePitchIn: 2, uprightStepIn: 12, flueIn: 6 }
export const PALLET_DEFAULT = { name: '48×40', faceIn: 40, depthIn: 48, heightIn: 48, weightLb: 2500, beamFaceIn: 4 }
export const RULES_DEFAULTS = { wallClearIn: 3, units: 'ft · in' }
/** The start screen's building and Generate's brief, before anyone changes them. */
export const BUILDING_DEFAULTS = { lengthFt: 240, widthFt: 120, gridXFt: 50, gridYFt: 54, columnsAlongWall: false, orientation: 'auto', maxRunFt: 150 }

let seq = 0
export const newId = (p) => `${p}-${Date.now().toString(36)}${(++seq).toString(36)}`

/** A pallet's name from its size, face × depth the other way round as dealers say it ("48×40": depth × face). */
export const palletName = (p) => `${p.depthIn}×${p.faceIn}`

/** A fresh project — no ceiling yet, one pallet, the given forklift / rules. */
export function newProject({ mhe = 'reach', wallClearIn = RULES_DEFAULTS.wallClearIn, units = RULES_DEFAULTS.units, pallet = null } = {}) {
  const p = { id: newId('pal'), ...PALLET_DEFAULT, ...(pallet || {}) }
  if (!pallet?.name) p.name = palletName(p)
  return { ceilings: [], defaultCeilingId: null, pallets: [p], defaultPalletId: p.id, equipment: { mhe }, rules: { wallClearIn, units }, advanced: { ...ADVANCED_DEFAULTS } }
}

/** The project of table `table` (null without one). */
export const projectOf = (table) => table?.project || null
export const defaultCeiling = (pr) => (pr ? pr.ceilings.find(c => c.id === pr.defaultCeilingId) || pr.ceilings[0] || null : null)
export const defaultPallet = (pr) => (pr ? pr.pallets.find(c => c.id === pr.defaultPalletId) || pr.pallets[0] || null : null)
export const advancedOf = (pr) => ({ ...ADVANCED_DEFAULTS, ...(pr?.advanced || {}) })
export const ceilingById = (pr, id) => (pr && id ? pr.ceilings.find(c => c.id === id) || null : null)
export const palletById = (pr, id) => (pr && id ? pr.pallets.find(c => c.id === id) || null : null)

/** The ceiling an elevation is checked and drawn against → { clearHeightIn, sprinklerIn, id, name, assumed } or null:
 *  its own ceiling entry, else the project's default; a clear height not set (or no entry at all) assumed 24'. A table
 *  without a project: the building's old fields. */
export function ceilingFor(table, type, objects = null, parentId = null) {
  const pr = projectOf(table)
  const c = (type && ceilingById(pr, type.ceilingId)) || defaultCeiling(pr)
  if (c) { const set = c.clearHeightIn > 0; return { clearHeightIn: set ? c.clearHeightIn : ASSUMED_CLEAR_IN, sprinklerIn: c.sprinklerIn > 0 ? c.sprinklerIn : null, id: c.id, name: c.name, assumed: !set } }
  if (pr) return { clearHeightIn: ASSUMED_CLEAR_IN, sprinklerIn: null, id: null, name: null, assumed: true }
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

/** Is ceiling `id` used by an elevation of `table` (its own, or the saved default for one without)? */
export function ceilingInUse(table, id) {
  const pr = projectOf(table), def = defaultCeiling(pr)?.id
  return !!table?.types?.some(t => (ceilingById(pr, t.ceilingId) ? t.ceilingId : def) === id)
}
/** Is pallet `id` used by an elevation of `table` (its own, or the saved default for one without)? */
export function palletInUse(table, id) {
  const pr = projectOf(table), def = defaultPallet(pr)?.id
  return !!table?.types?.some(t => (palletById(pr, t.palletId) ? t.palletId : def) === id)
}

/** What the project leaves unset, for Check layout's reminders → [{ severity: 'reminder', kind, ceilingId, text }]:
 *  per ceiling in use (the default when no elevation yet), a clear height not set (24' assumed) and a sprinkler
 *  height not set. */
export function projectReminders(table) {
  const pr = projectOf(table)
  if (!pr) return []
  const resolve = (t) => (ceilingById(pr, t?.ceilingId) || defaultCeiling(pr))?.id ?? null
  const ids = new Set(table?.types?.length ? table.types.map(resolve) : [resolve(null)])
  const many = pr.ceilings.length > 1, ft = Math.round(ASSUMED_CLEAR_IN / 12), out = []
  for (const id of ids) {
    const c = ceilingById(pr, id), of = many && c ? ' for ' + c.name : ''
    if (!(c?.clearHeightIn > 0)) out.push({ severity: 'reminder', kind: 'unset-clear', ceilingId: id, text: `Clear height not set${of} — elevations assume ${ft}'` })
    if (!(c?.sprinklerIn > 0)) out.push({ severity: 'reminder', kind: 'unset-sprinkler', ceilingId: id, text: `Sprinkler height not set${of} — sprinkler clearance not checked` })
  }
  return out
}

/** Generate's brief from the project (the default pallet, the forklift's aisle, the wall clearance) and the building
 *  values `b` ({ lengthFt, widthFt, gridXFt, gridYFt, maxRunFt, columnsAlongWall, orientation }). The one rack type
 *  Generate produces: double rows (single along the walls). */
export function generateBrief(project, mheOptions, b) {
  const pal = defaultPallet(project), mhe = project?.equipment?.mhe || 'reach'
  return {
    lengthFt: Number(b.lengthFt) || 100, widthFt: Number(b.widthFt) || 60, rackType: 'rack_double_row',
    aisleFt: Number(mheOptions?.[mhe]?.aisleFt) || 11, gridXFt: Number(b.gridXFt) || 0, gridYFt: Number(b.gridYFt) || 0,
    wallClearIn: Number(project?.rules?.wallClearIn) || 0, maxRunFt: Number(b.maxRunFt) || 150, columnsAlongWall: !!b.columnsAlongWall,
    palletWIn: Number(pal?.faceIn) || 40, palletDIn: Number(pal?.depthIn) || 48, levels: 4, mhe, orientation: b.orientation || 'auto',
  }
}

/** Write `project` into the layout — ONE undo step (the table's own commit). `objects`: replaced too (elevations
 *  following a pallet change). */
export function commitProject(store, project, objects = null, table = undefined) {
  const st = store.getState()
  st.commitElevations(withProject(table === undefined ? st.elevations : table, project), objects)
}
/** A ceiling (`{ name, clearHeightIn, sprinklerIn }`) added to the layout's project — one undo step → its id. */
export function addCeiling(store, c) {
  const pr = projectOf(store.getState().elevations)
  if (!pr) return null
  const e = { id: newId('ceil'), name: String(c.name || '').trim() || `Ceiling ${pr.ceilings.length + 1}`, clearHeightIn: c.clearHeightIn > 0 ? c.clearHeightIn : null, sprinklerIn: c.sprinklerIn > 0 ? c.sprinklerIn : null }
  commitProject(store, { ...pr, ceilings: [...pr.ceilings, e], defaultCeilingId: pr.defaultCeilingId || e.id })
  return e.id
}
/** A pallet size (`{ name?, faceIn, depthIn, heightIn, weightLb, beamFaceIn }`) added to the layout's project — one
 *  undo step → its id. Named from its size when no name is given. */
export function addPallet(store, p) {
  const pr = projectOf(store.getState().elevations)
  if (!pr) return null
  const e = { ...PALLET_DEFAULT, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== '')), id: newId('pal') }
  e.name = String(p.name || '').trim() || palletName(e)
  commitProject(store, { ...pr, pallets: [...pr.pallets, e] })
  return e.id
}

/** The setup screen: open, and why — 'new' (the start screen of a new project) or 'settings' (Project settings).
 *  Presentation state. */
export const useProjectSetup = create(() => ({ open: false, reason: null }))
export const openSetup = (reason = 'settings') => useProjectSetup.setState({ open: true, reason })
export const closeSetup = () => useProjectSetup.setState({ open: false, reason: null })
/** Does the layout need the start screen: nothing in it and no project yet (a new project, however it began — Draw
 *  from the Hub, File → New, a refresh on an empty one)? */
export const needsStart = (st) => !st.objects.length && !projectOf(st.elevations)
/** While the CAD is on screen: the start screen opens the moment the layout needs it — on entering, and on every later
 *  change (a new scene clears the layout while the CAD is already open) — never once a layout exists. Returns the
 *  unsubscribe (components/Project/ProjectSetup.jsx runs it for as long as it is mounted). */
export function installStartScreen(store) {
  const check = (st) => { if (needsStart(st) && !useProjectSetup.getState().open) openSetup('new') }
  check(store.getState())
  return store.subscribe(check)
}

/** The first elevations of a project whose racks have none yet → { table, objects } or null: the best fit for the
 *  default ceiling (24' assumed when not set) and pallet; a project with no ceiling entry (a layout from before): one
 *  type per distinct level count (migrate's), the most common the default — the project kept. */
export let firstElevations = (objects, table) => {
  const pr = projectOf(table), c = defaultCeiling(pr)
  const d = c && bestFitFor(pr, c, defaultPallet(pr))
  if (d) {
    const id = newId('elev'), t = { ...d, id, name: pairName(pr, d), color: PALETTE[0] }
    const r = editTable(objects, { ...table, defaultId: id, types: [t] }, tb => tb)
    return { table: r.table, objects: r.objects }
  }
  if (!objects.some(isBeamRack)) return null
  const m = migrate(objects)
  if (!m) return null
  const t = { ...table, defaultId: m.table.defaultId, types: m.table.types }
  return { table: t, objects: syncAllLevels(m.objects, t) }
}
/** Replace how a project's first elevations are made (Elevations: the best fit for the default ceiling and pallet). */
export const setFirstElevations = (fn) => { firstElevations = fn }

/** For a store: a layout without a project is given one — a load or an action folds it into that same history entry
 *  (one undo step), migrated from what the layout uses (`current()`), unused elevation types dropped once. (A new,
 *  empty layout is left to the start screen: `installStartScreen`.) Returns the unsubscribe. */
export function installProjectKeeper(store, current = () => ({})) {
  let busy = false
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
    if (!projectOf(T)) {
      if (!st.objects.length) return                             // a new, empty layout: the start screen's (installStartScreen)
      fold(st, withProject(dropUnusedTypes(st.objects, T), migrateProject(st.objects, T, current())))
      return
    }
    const pr = projectOf(T)
    // no elevation yet: the best fit for the default ceiling and pallet, silently (`firstElevations`)
    if (!T.types?.length && (racks || defaultCeiling(pr))) { const made = firstElevations(st.objects, T); if (made) fold(st, made.table, made.objects) }
  }
  run(store.getState())
  return store.subscribe(run)
}
