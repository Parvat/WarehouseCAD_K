// equipment.js — aisle equipment per section (STUDIO.md §7a Sections, aisle-equip).
//
// A section has one field, `equipment`: a key of the forklift list (the Rules' mhe table: Reach truck, VNA / turret,
// Counterbalance, Pallet jack, Walkie stacker), 'custom' — its own two widths, `custom: { pickFt, moveFt }`: the aisle to
// pick (turn and put away) and the space to move (drive straight) — or null — the project's forklift (the default).
// The aisle checks of a rack use its section's equipment (the section holding the rack's centre, as membership() reads
// it); a rack in no section uses the project's forklift. An aisle between two racks is held to the stricter of their
// two (the wider pick aisle). With no section carrying its own equipment every check runs exactly as before, on the
// project's forklift. The column check (checkColumnsFor) reads it the same way, so its plan markings and Check
// layout's list agree.
//
// The forklift list's two widths per truck — Aisle to pick (aisleFt) and Space to move (travelFt) — are editable in
// Project settings (the project's `equipment.trucks`, over the Rules); setProjectTrucks keeps them here for code that
// has no store (the app's keeper calls it whenever the project changes).

import { MHE_PROFILES, checkColumns, aisleColumnBlocks } from '../generate/columnCheck'
import { DEFAULT_RULES, MHE_LABELS } from '../rules/defaults'
import { loadConfig } from '../rules/storage'
import { resolveActive } from '../rules/resolve'
import { isSection, membership } from './sectionAreas'

/** The project's own widths per truck ({ key: { aisleFt, travelFt } }), kept by the app (installTruckKeeper). */
let projectTrucks = null
export const setProjectTrucks = (t) => { projectTrucks = t && typeof t === 'object' ? t : null }
/** The truck keeper: the project's widths whenever the layout's table changes. → unsubscribe. */
export function installTruckKeeper(store) {
  let last
  const run = (st) => { const t = st.elevations?.project?.equipment?.trucks || null; if (t !== last) { last = t; setProjectTrucks(t) } }
  run(store.getState())
  return store.subscribe(run)
}

/** One truck with the project's widths over it (a width set there; the rest as it was). */
export function withTruck(p, t) {
  if (!p || !t) return p
  const out = { ...p }
  if (Number.isFinite(t.aisleFt) && t.aisleFt > 0) out.aisleFt = t.aisleFt
  if (Number.isFinite(t.travelFt) && t.travelFt > 0) out.travelFt = t.travelFt
  return out
}

/** The forklift list as profiles ({ key: { key, label, aisleFt, minAisleFt, travelFt, retrievalFt, crossAisleFt } }):
 *  the shipped table, the active Rules' over it, the project's widths over those — what the checks, the fill and the
 *  pickers use. `trucks`: the project's widths (left out: the ones the keeper holds). */
export function mheProfiles(rules = null, trucks = undefined) {
  let mhe = rules?.mhe
  if (!mhe) { try { mhe = resolveActive(loadConfig()).mhe } catch { mhe = null } }
  const T = trucks === undefined ? projectTrucks : trucks
  const out = {}
  for (const [key, m] of Object.entries({ ...DEFAULT_RULES.mhe, ...(mhe || {}) })) {
    const ship = MHE_PROFILES[key] || {}
    out[key] = withTruck({ ...ship, ...m, key, label: m.label || MHE_LABELS[key] || ship.label || key, retrievalFt: m.retrievalFt ?? ship.retrievalFt }, T?.[key])
  }
  return out
}

/** A section's equipment key ('custom' included), or null (the project's forklift). */
export const equipmentOf = (s) => (isSection(s) && typeof s.equipment === 'string' && s.equipment ? s.equipment : null)
export const CUSTOM = 'custom'
/** A Custom section's two widths, as a profile: the aisle to pick and the space to move, exactly — its minimum the
 *  aisle to pick; its cross-aisle the space to move. */
export function customProfile(s) {
  const pick = Number(s?.custom?.pickFt), move = Number(s?.custom?.moveFt)
  const pickFt = pick > 0 ? pick : 10, moveFt = move > 0 ? move : Math.min(8, pickFt)
  return { key: CUSTOM + ':' + (s?.id || ''), label: 'Custom', aisleFt: pickFt, minAisleFt: pickFt, travelFt: moveFt, crossAisleFt: moveFt, retrievalFt: 4, custom: true }
}
/** The equipment profile of section `s` (its own, or null for the project's forklift). */
export function sectionProfile(s, profiles = null) {
  const k = equipmentOf(s)
  if (!k) return null
  if (k === CUSTOM) return customProfile(s)
  const P = profiles || mheProfiles()
  return P[k] || MHE_PROFILES[k] || null
}

/* ── the equipment a racking area was designed for (fill-design-aisle): each Fill and each Generate stores it on the area
   it makes — `equip`: { project: true } (the project's forklift, by reference: whatever it is now — a change of the
   project forklift rechecks those racks at once), { custom: { pickFt, moveFt } } (a Fill's Custom widths: the aisle to
   pick, and the space to move — as much when left out; kept as stored), or { key } (a truck of the list). ── */
/** Racking area `area`'s stored equipment as a profile, or null — the project's forklift (stored by reference, or none
 *  stored: an area made before). A Custom design's key is its two widths, so every area designed for the same widths
 *  is one profile. */
export function areaProfile(area, profiles = null) {
  const e = area?.equip
  if (!e || typeof e !== 'object' || e.project) return null
  if (e.custom) {
    const pick = Number(e.custom.pickFt), move = Number(e.custom.moveFt)
    if (!(pick > 0)) return null
    const mv = move > 0 ? move : pick
    return { key: `design:${pick}/${mv}`, label: 'Custom', aisleFt: pick, minAisleFt: pick, travelFt: mv, crossAisleFt: mv, retrievalFt: 4, custom: true, design: true }
  }
  if (typeof e.key === 'string' && e.key && !e.key.includes(':')) { const P = profiles || mheProfiles(); return P[e.key] || MHE_PROFILES[e.key] || null }
  return null
}
/** The Custom designs of a layout's racks that no section governs: the layout summary's and the PDF check page's line,
 *  one per design — "Designed for 6 ft aisles, equipment to be confirmed". */
export function designNotes(objects) {
  const list = objects || [], m = membership(list), inSec = new Set([...m.bySection.values()].flat())
  const areas = new Map(list.filter(o => o?.type === 'racking_area').map(a => [a.id, areaProfile(a)]))
  const seen = new Map()
  for (const o of list) {
    if (!o || !o.areaId || inSec.has(o.id) || !/^rack_/.test(o.type || '')) continue
    const p = areas.get(o.areaId)
    if (p && p.design && !seen.has(p.key)) seen.set(p.key, p)
  }
  return [...seen.values()].map(p => `Designed for ${+p.aisleFt.toFixed(2)} ft aisles, equipment to be confirmed`)
}

/** Stricter of two profiles: the wider pick aisle (then the wider drive). */
export const stricter = (a, b) => (!a ? b : !b ? a : (b.aisleFt > a.aisleFt + 1e-9 || (Math.abs(b.aisleFt - a.aisleFt) < 1e-9 && (b.travelFt ?? 0) > (a.travelFt ?? 0))) ? b : a)

const cache = new WeakMap()
/** The aisle equipment of every rack in `objects` (fill-design-aisle): its section's when it is in one (a section on the
 *  project's forklift: `base`); else the equipment its racking area was designed for (areaProfile — a Fill's, a
 *  Generate's); else the project's forklift `base` (racks placed by hand, areas from before). → { single (no rack on
 *  other equipment), of(rackId) → profile, pair(...ids) → the stricter profile of those racks (none of them a rack: base),
 *  inUse: [profiles, base first] }. */
export function equipmentResolver(objects, base, profiles = null) {
  base = base || MHE_PROFILES.reach
  const list = objects || []
  const hit = cache.get(list)
  if (hit && hit.base === base && hit.trucks === projectTrucks) return hit.r
  const secs = list.filter(o => equipmentOf(o) && equipmentOf(o) !== base.key)
  // only areas designed for other equipment than the project's forklift (a Generate on it adds nothing to resolve)
  const areas = list.filter(o => o?.type === 'racking_area' && o.equip && !o.equip.project && (o.equip.custom || o.equip.key !== base.key))
  let r
  if (!secs.length && !areas.length) r = { single: true, of: () => base, pair: () => base, inUse: [base] }
  else {
    const P = profiles || mheProfiles(), m = membership(list), rackP = new Map()
    for (const s of secs) {
      const p = sectionProfile(s, P)
      if (!p) continue
      for (const id of m.bySection.get(s.id) || []) rackP.set(id, p)
    }
    // a rack in no section: its racking area's stored equipment (a section always wins, its own or the project's)
    if (areas.length) {
      const inSec = new Set([...m.bySection.values()].flat())
      const byArea = new Map(areas.map(a => [a.id, areaProfile(a, P)]))
      for (const o of list) {
        if (!o || !o.areaId || inSec.has(o.id) || !/^rack_/.test(o.type || '')) continue
        const p = byArea.get(o.areaId)
        if (p && p.key !== base.key) rackP.set(o.id, p)
      }
    }
    const of = (id) => rackP.get(id) || base
    const pair = (...ids) => { let p = null; for (const id of ids.flat()) if (id != null) p = stricter(p, of(id)); return p || base }
    const inUse = [base, ...[...new Map([...rackP.values()].map(p => [p.key, p])).values()].filter(p => p.key !== base.key)]
    r = rackP.size ? { single: false, of, pair, inUse } : { single: true, of: () => base, pair: () => base, inUse: [base] }
  }
  cache.set(list, { base, trucks: projectTrucks, r })
  return r
}

/* ── the column check by equipment: each aisle block from the pass of its two rows' equipment, each rack's conflicts and
   pick blocks from its own; the upright hits are the layout's (no equipment in them) ── */
const aisleMark = (b, columns) => {
  const col = columns[b.columnIndex]
  if (!col) return null
  return b.axis === 'x' ? { x: b.gapStart, y: col.y, w: b.gapEnd - b.gapStart, h: col.h, kind: 'aisle-blocked' } : { x: col.x, y: b.gapStart, w: col.w, h: b.gapEnd - b.gapStart, kind: 'aisle-blocked' }
}
/** checkColumns for the racks of `objects`, each held to its own equipment (`inputs.profile`: the project's forklift). */
export function checkColumnsFor(objects, inputs) {
  const R = equipmentResolver(objects, inputs.profile)
  if (R.single) return checkColumns(inputs)
  const runs = R.inUse.map(p => ({ p, res: checkColumns({ ...inputs, profile: p }) }))
  const base = runs[0].res
  const pick = (field, gov) => runs.flatMap(({ p, res }) => (res[field] || []).filter(x => gov(x).key === p.key))
  const aisleBlocks = pick('aisleBlocks', b => R.pair(...b.betweenRows))
  const rackConflicts = pick('rackConflicts', c => R.of(c.rackId))
  const pickBlocks = pick('pickBlocks', c => R.of(c.rackId))
  const redMarks = [...base.redMarks.filter(m => m.kind !== 'aisle-blocked'), ...aisleBlocks.filter(b => b.blocked).map(b => aisleMark(b, inputs.columns)).filter(Boolean)]
  const lost = (list) => list.reduce((t, c) => t + (c.positionsLost || 0), 0)
  return {
    ...base, aisleBlocks, rackConflicts, pickBlocks, redMarks,
    summary: { ...base.summary, rackConflicts: rackConflicts.length, blockedAisles: aisleBlocks.filter(a => a.blocked).length, positionsLostIfAbsorb: lost(rackConflicts) + lost(pickBlocks), positionsLostToPickZone: lost(pickBlocks) },
  }
}
/** aisleColumnBlocks the same way (the live part during a drag, the clearance labels). */
export function aisleBlocksFor(objects, args) {
  const R = equipmentResolver(objects, args.profile)
  if (R.single) return aisleColumnBlocks(args)
  const aisleBlocks = R.inUse.flatMap(p => aisleColumnBlocks({ ...args, profile: p }).aisleBlocks.filter(b => R.pair(...b.betweenRows).key === p.key))
  return { aisleBlocks, redMarks: aisleBlocks.filter(b => b.blocked).map(b => aisleMark(b, args.columns || [])).filter(Boolean) }
}

/** The equipment name a section shows (its own, or "Project forklift (Reach truck)"). */
export function equipmentLabel(s, projectKey, profiles = null) {
  const P = profiles || mheProfiles(), k = equipmentOf(s)
  return k === CUSTOM ? 'Custom' : k ? (P[k]?.label || k) : `Project forklift (${P[projectKey]?.label || projectKey || 'Reach truck'})`
}
