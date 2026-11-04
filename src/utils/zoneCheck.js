// zoneCheck.js — what a zone does to the floor around it (STUDIO.md §7a Zone), asked by the live zone check while a
// zone is dragged or resized (canvas2/ZoneCheck.jsx: the preview turns red with the reason before the drop) and by
// Check layout (utils/layoutCheck.js: each one an ERROR — a drop is allowed, never blocked):
//   - it blocks an aisle: a rack face with the zone nearest in front, under the pick width (generate/narrowAisles.js,
//     the same blocks the X marks and usable read);
//   - it cuts off rack faces: racks only a dead-end pocket reaches, a pocket the zones close (generate/aisleAccess.js);
//   - it leaves a zone with no way in: no clear floor beside the zone joins the main floor (aisleAccess.js floorAccess)
//     — for staging a square the truck's travel width wide, for an office, a washroom or a custom area the walkway
//     (Rules: zones.walkwayIn, 44" by default).
// Check layout keeps its warnings for the first two (a face short of the pick width, an aisle a zone closes); only a
// zone with no way in is an ERROR there. Pure: objects in, problems out (walkwayInNow reads the Rules).

import { narrowAisleBlocks } from '../generate/narrowAisles'
import { cutOffRacks, floorAccess } from '../generate/aisleAccess'
import { MHE_PROFILES, TRAVEL_TOL_FT } from '../generate/columnCheck'
import { zoneName } from '../generate/faceAisles'
import { DEFAULT_RULES } from '../rules/defaults'
import { innerOutline, boxOnFloor } from './floorGeom'
import { loadConfig } from '../rules/storage'
import { resolveActive } from '../rules/resolve'

/** The walkway a person zone needs (in): the active Rules', else the shipped 44". */
export function walkwayInNow() {
  try { const v = resolveActive(loadConfig())?.zones?.walkwayIn; return Number.isFinite(v) && v > 0 ? v : DEFAULT_RULES.zones.walkwayIn } catch { return DEFAULT_RULES.zones.walkwayIn }
}
/** The width (ft) a zone's way in needs: staging the truck's travel width; an office, washroom or custom area the walkway. */
export const wayInFt = (z, travelFt, walkwayIn) => (z.type === 'zone_staging' ? travelFt : walkwayIn / 12)

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
export const isZoneObj = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
const inBox = (fp, z) => {
  if (z.parentId) return z.parentId === fp.id
  const vs = fp.fpVerts || [], cx = z.x + z.width / 2, cy = z.y + z.height / 2
  if (!vs.length) return false
  const xs = vs.map(v => v.x), ys = vs.map(v => v.y)
  return cx >= Math.min(...xs) && cx <= Math.max(...xs) && cy >= Math.min(...ys) && cy <= Math.max(...ys)
}

/** The zones in `objects` with no way in: [{ zone, fp }] — each judged at its own width (wayInFt); none in a building
 *  with no main floor at that width (that is Check layout's "No way in" for its racks). */
export function closedZones(objects, { gridSize = 40, travelFt = 8, walkwayIn = DEFAULT_RULES.zones.walkwayIn } = {}) {
  const out = []
  const zones = objects.filter(isZoneObj)
  if (!zones.length) return out
  for (const fp of objects.filter(o => FP.has(o.type))) {
    // only a zone standing on this floor (one past the walls is Check layout's "past the building's walls")
    const inner = innerOutline(fp, gridSize)
    const mine = zones.filter(z => inBox(fp, z) && boxOnFloor(inner, { x: z.x + 0.5, y: z.y + 0.5, w: Math.max(0, z.width - 1), h: Math.max(0, z.height - 1) }))
    const byWidth = new Map()
    for (const z of mine) { const w = wayInFt(z, travelFt, walkwayIn); if (!byWidth.has(w)) byWidth.set(w, []); byWidth.get(w).push(z) }
    for (const [ft, list] of byWidth) {
      const access = floorAccess(objects, fp, { gridSize, travelFt: ft })
      if (!access.main) continue
      const g = Math.max(0, ((ft - TRAVEL_TOL_FT) * gridSize) / 2) + 1
      for (const z of list) if (!access.labelsIn({ x: z.x - g, y: z.y - g, w: z.width + 2 * g, h: z.height + 2 * g }).has(access.main)) out.push({ zone: z, fp })
    }
  }
  return out
}

/** What the zones `ids` (all zones when null) do in `objects`, the reasons in the order the preview shows them:
 *  [{ kind: 'zone-face' | 'zone-no-way-in' | 'zone-closed', zoneId, text }]. `before`: the layout before the drag —
 *  a zone that had no way in already (another zone's, not this change's) is left out. */
export function zoneProblems(objects, { ids = null, before = null, profile = MHE_PROFILES.reach, gridSize = 40, elevations = null, walkwayIn = DEFAULT_RULES.zones.walkwayIn } = {}) {
  const want = ids ? new Set(ids) : null
  const mineZone = (id) => !want || want.has(id)
  const out = [], seen = new Set()
  const add = (kind, zoneId, text) => { const k = kind + ':' + zoneId; if (seen.has(k)) return; seen.add(k); out.push({ kind, zoneId, text }) }
  // blocks an aisle: a face with this zone nearest in front, under the pick width
  for (const b of narrowAisleBlocks(objects, { profile, gridSize, elevations })) {
    const c = b.cause
    if (c && c.kind === 'zone' && c.zone && mineZone(c.zone.id)) add('zone-face', c.zone.id, 'Blocks an aisle')
  }
  // cuts off rack faces: a pocket that is there with these zones and not without them
  const theseOut = objects.filter(o => !(isZoneObj(o) && mineZone(o.id)))
  for (const fp of objects.filter(o => FP.has(o.type))) {
    const opts = { gridSize, travelFt: profile.travelFt ?? 8, aisleFt: profile.aisleFt }
    const now = cutOffRacks(objects, fp, opts).cutOff
    if (!now.length) continue
    const without = new Set(cutOffRacks(theseOut, fp, opts).cutOff.map(c => c.id))
    if (now.some(c => !without.has(c.id))) {
      const z = objects.find(o => isZoneObj(o) && mineZone(o.id) && inBox(fp, o))
      if (z) add('zone-no-way-in', z.id, 'Cuts off rack faces')
    }
  }
  // leaves a zone with no way in (this one, or another it closes in)
  const wide = { gridSize, travelFt: profile.travelFt ?? 8, walkwayIn }
  const closedBefore = before ? new Set(closedZones(before, wide).map(c => c.zone.id)) : new Set()
  for (const { zone } of closedZones(objects, wide)) {
    if (want && !want.has(zone.id) && closedBefore.has(zone.id)) continue
    add('zone-closed', zone.id, `Leaves the ${zoneName(zone)} with no way in`)
  }
  return out
}
