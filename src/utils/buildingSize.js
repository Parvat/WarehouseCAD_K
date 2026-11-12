// buildingSize.js — a building's size typed (STUDIO.md §7: the Properties card's Width and Length, a click on one of its
// dimension labels — canvas2/FpDimEdit.jsx). A building is drawn from its corners (`fpVerts`), so a size is written to
// them: the walls on the far side (the right, the bottom — the walls at or past the typed wall's far end) move, the
// opposite corner stays where it is. Then the handle resize's own rules run in the same undo step (utils/buildingResize.js
// afterBuildingResize): shrunk — the bays that no longer fit go, racking areas, sections and zones are clipped, a notice
// with Undo; enlarged — nothing added, no notice.
//
// Root cause of the fields doing nothing (building-size fix): they wrote `width` / `height` only, and every building has
// carried `fpVerts` since it was placed (store placeFpObject), which the plan, the outline and every rule read instead.

import { getFpVertices } from './canvas'
import { afterBuildingResize } from './buildingResize'

const E = 0.5
const vertsOf = (fp) => (Array.isArray(fp?.fpVerts) && fp.fpVerts.length >= 3 ? fp.fpVerts : getFpVertices(fp) || []).map(v => ({ x: v.x, y: v.y }))
const withVerts = (verts) => {
  const xs = verts.map(v => v.x), ys = verts.map(v => v.y), x = Math.min(...xs), y = Math.min(...ys)
  return { fpVerts: verts, x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Building `fp` stretched along `axis` ('x' | 'y') by `dPx`: every corner at or past `at` moves, the rest stay. → the
 *  update ({ fpVerts, x, y, width, height }) or null (nothing changes, or the far walls would pass the near ones). */
function stretch(fp, axis, at, dPx, gridSize) {
  if (!Number.isFinite(dPx) || Math.abs(dPx) < 1e-6) return null
  const verts = vertsOf(fp)
  const moved = verts.filter(v => v[axis] >= at - E), kept = verts.filter(v => v[axis] < at - E)
  if (!moved.length || !kept.length) return null
  // at least a foot between the near walls and the far ones
  if (Math.min(...moved.map(v => v[axis])) + dPx < Math.max(...kept.map(v => v[axis])) + gridSize - E) return null
  return withVerts(verts.map(v => (v[axis] >= at - E ? { ...v, [axis]: v[axis] + dPx } : v)))
}

/** The update giving building `fp` width `widthFt` and / or length `lengthFt` (its extent across, down), the top-left
 *  held. → update or null. */
export function sizeUpdate(fp, { widthFt = null, lengthFt = null } = {}, gridSize = 40) {
  let cur = fp, out = null
  const xs = () => vertsOf(cur).map(v => v.x), ys = () => vertsOf(cur).map(v => v.y)
  if (widthFt > 0) {
    const w = Math.max(...xs()) - Math.min(...xs()), u = stretch(cur, 'x', Math.max(...xs()), widthFt * gridSize - w, gridSize)
    if (u) { out = { ...(out || {}), ...u }; cur = { ...cur, ...u } }
  }
  if (lengthFt > 0) {
    const h = Math.max(...ys()) - Math.min(...ys()), u = stretch(cur, 'y', Math.max(...ys()), lengthFt * gridSize - h, gridSize)
    if (u) { out = { ...(out || {}), ...u }; cur = { ...cur, ...u } }
  }
  return out
}

/** The update giving wall `wallIdx` of building `fp` the length `lenFt`: the walls at or past its far end (right of it, or
 *  below it) move, its near end held. → update or null. */
export function wallLengthUpdate(fp, wallIdx, lenFt, gridSize = 40) {
  const v = vertsOf(fp), n = v.length
  if (!(lenFt > 0) || n < 3) return null
  const a = v[wallIdx % n], b = v[(wallIdx + 1) % n]
  const axis = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'x' : 'y'
  const len = Math.abs(b[axis] - a[axis])
  return stretch(fp, axis, Math.max(a[axis], b[axis]), lenFt * gridSize - len, gridSize)
}

/** Apply `update` to building `fpId`: one undo step with what the shrink takes (buildingResize.js) and its notice.
 *  → true when the building changed. */
export function setBuildingSize(store, fpId, update) {
  const st = store.getState(), before = st.objects.find(o => o.id === fpId)
  if (!before || !update) return false
  st.commitObjectUpdate(fpId, update)
  afterBuildingResize(store, before)
  return true
}
