// equipment.js — aisle equipment per section (STUDIO.md §7a Sections, aisle-equip).
//
// A section has one field, `equipment`: a key of the forklift list (the Rules' mhe table: Reach truck, VNA / turret,
// Counterbalance, Pallet jack, Walkie stacker), or null — the project's forklift (the default). The aisle checks of a
// rack use its section's equipment (the section holding the rack's centre, as membership() reads it); a rack in no
// section uses the project's forklift. An aisle between two racks is held to the stricter of their two (the wider pick
// aisle). With no section carrying its own equipment every check runs exactly as before, on the project's forklift.

import { MHE_PROFILES } from '../generate/columnCheck'
import { DEFAULT_RULES, MHE_LABELS } from '../rules/defaults'
import { loadConfig } from '../rules/storage'
import { resolveActive } from '../rules/resolve'
import { isSection, membership } from './sectionAreas'

/** The forklift list as profiles ({ key: { key, label, aisleFt, minAisleFt, travelFt, retrievalFt, crossAisleFt } }):
 *  the active Rules' mhe table over the shipped one — what the Rules editor and the pickers offer. */
export function mheProfiles(rules = null) {
  let mhe = rules?.mhe
  if (!mhe) { try { mhe = resolveActive(loadConfig()).mhe } catch { mhe = null } }
  const out = {}
  for (const [key, m] of Object.entries({ ...DEFAULT_RULES.mhe, ...(mhe || {}) })) {
    const ship = MHE_PROFILES[key] || {}
    out[key] = { ...ship, ...m, key, label: m.label || MHE_LABELS[key] || ship.label || key, retrievalFt: m.retrievalFt ?? ship.retrievalFt }
  }
  return out
}

/** A section's equipment key, or null (the project's forklift). */
export const equipmentOf = (s) => (isSection(s) && typeof s.equipment === 'string' && s.equipment ? s.equipment : null)

/** Stricter of two profiles: the wider pick aisle (then the wider drive). */
export const stricter = (a, b) => (!a ? b : !b ? a : (b.aisleFt > a.aisleFt + 1e-9 || (Math.abs(b.aisleFt - a.aisleFt) < 1e-9 && (b.travelFt ?? 0) > (a.travelFt ?? 0))) ? b : a)

const cache = new WeakMap()
/** The aisle equipment of every rack in `objects`, the project's forklift `base` for racks in no section (or in one on
 *  the project's forklift). → { single (no rack on other equipment), of(rackId) → profile, pair(...ids) → the stricter
 *  profile of those racks (none of them a rack: base), inUse: [profiles, base first] }. */
export function equipmentResolver(objects, base, profiles = null) {
  base = base || MHE_PROFILES.reach
  const list = objects || []
  const hit = cache.get(list)
  if (hit && hit.base === base) return hit.r
  const secs = list.filter(o => equipmentOf(o) && equipmentOf(o) !== base.key)
  let r
  if (!secs.length) r = { single: true, of: () => base, pair: () => base, inUse: [base] }
  else {
    const P = profiles || mheProfiles(), m = membership(list), rackP = new Map()
    for (const s of secs) {
      const p = P[equipmentOf(s)] || MHE_PROFILES[equipmentOf(s)]
      if (!p) continue
      for (const id of m.bySection.get(s.id) || []) rackP.set(id, p)
    }
    const of = (id) => rackP.get(id) || base
    const pair = (...ids) => { let p = null; for (const id of ids.flat()) if (id != null) p = stricter(p, of(id)); return p || base }
    const inUse = [base, ...[...new Set(rackP.values())].filter(p => p.key !== base.key)]
    r = rackP.size ? { single: false, of, pair, inUse } : { single: true, of: () => base, pair: () => base, inUse: [base] }
  }
  cache.set(list, { base, r })
  return r
}

/** The equipment name a section shows (its own, or "Project forklift (Reach truck)"). */
export function equipmentLabel(s, projectKey, profiles = null) {
  const P = profiles || mheProfiles(), k = equipmentOf(s)
  return k ? (P[k]?.label || k) : `Project forklift (${P[projectKey]?.label || projectKey || 'Reach truck'})`
}
