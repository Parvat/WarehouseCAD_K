// rackDepthAction.js — THE frame-depth change on the layout: Properties' Frame depth (one rack, several racks) and the
// Elevations tab's "Set these rows to N in" both call setRackDepths, so they do exactly the same thing.
//
// Each rack is resized by rackDepthAt (utils/rackDepth.js): against a wall it keeps its wall face and grows away from
// the wall; otherwise about its centre line (a pair's flue kept, growing outward). One undo step, committed the way
// Properties always has (the objects set, then one commitObjectUpdate — which the Row group reads to offer its replay).
// The aisle checks run after: the aisle keeper re-pairs the aisles on the change, and an open Check layout runs again.

import { rackDepthAt } from './rackDepth'
import { useLayoutCheck, runLayoutCheck } from './layoutCheck'

/** Racks `ids` given frame depth `depthIn` — `onlyShallower`: only those shallower than it (the Elevations tab's fix)
 *  → how many changed (0: nothing written, no undo step). */
export function setRackDepths(store, ids, depthIn, { onlyShallower = false } = {}) {
  const st = store.getState(), gs = st.gridSize || 40, want = new Set(ids)
  let first = null
  const objects = st.objects.map(o => {
    if (!want.has(o.id)) return o
    if (onlyShallower && !((o.depthIn ?? 42) < depthIn - 1e-6)) return o
    const u = rackDepthAt(o, depthIn, st.objects, gs)
    if (!u) return o
    first = first || o.id
    return { ...o, ...u }
  })
  if (!first) return 0
  store.setState({ objects })
  store.getState().commitObjectUpdate(first, {})
  if (useLayoutCheck.getState().open) runLayoutCheck(store)
  return objects.filter((o, i) => o !== st.objects[i]).length
}
