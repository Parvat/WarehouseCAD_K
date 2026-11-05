import { notify } from './notice'
import { pickableIn } from './layers'

// deleteSelection.js — Delete (the key and the card's Delete buttons): the selection, plus each racking area the delete
// empties, so a delete of its racks never leaves its box on an empty floor. An area that still owns a rack after the delete stays: it keeps its
// record of the racks removed by hand (generate/rackingArea.js).

/** Ids of the racking areas whose racks are all in `ids` (and that own at least one) — gone with them. */
export function areasEmptiedBy(objects, ids) {
  const del = new Set(ids), owned = new Map()
  for (const o of objects || []) {
    if (o?.areaId == null || typeof o.type !== 'string' || !o.type.startsWith('rack_')) continue
    const n = owned.get(o.areaId) || { all: 0, gone: 0 }
    n.all++; if (del.has(o.id)) n.gone++
    owned.set(o.areaId, n)
  }
  return (objects || []).filter(o => o?.type === 'racking_area' && !del.has(o.id) && owned.get(o.id)?.all > 0 && owned.get(o.id).all === owned.get(o.id).gone).map(o => o.id)
}

const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

/** A building deleted: the building only — its racks, zones, columns and everything else in it stay (the store's
 *  deleteSelected takes its children with it). The selection (and its groups' members) goes; what was in the building
 *  loses only its link to it. One undo step; a notice offers Undo. */
function deleteBuildingOnly(store) {
  const s = store.getState(), sel = new Set(s.selectedIds)
  for (const g of s.groups || []) if (g.ids.some(id => sel.has(id))) for (const id of g.ids) sel.add(id)
  for (const id of areasEmptiedBy(s.objects, [...sel])) sel.add(id)
  const objects = s.objects.filter(o => !sel.has(o.id)).map(o => {
    if (!(o.parentId && sel.has(o.parentId))) return o
    const { parentId, ...rest } = o; void parentId
    return rest
  })
  const n = s.objects.filter(o => sel.has(o.id) && FP.has(o.type)).length
  const kept = s.objects.some(o => o.parentId && sel.has(o.parentId) && !sel.has(o.id)), gone = s.objects.length - objects.length
  store.setState({ groups: (s.groups || []).filter(g => g.ids.some(id => !sel.has(id))), selectedIds: [], activeWall: null })
  store.getState().commitElevations(store.getState().elevations, objects)      // the one history step
  // everything in it deleted too (Ctrl+A, then Delete): nothing was kept, so the notice says what went
  if (!kept) notify(`${gone} objects deleted`, null, { undo: true })
  else notify(n === 1 ? 'Building deleted' : `${n} buildings deleted`, 'racks, zones and columns kept', { undo: true })
}

/** The store's deleteSelected, with the emptied areas added to the selection first — one undo step. A building in the
 *  selection: the building only (deleteBuildingOnly). */
export function deleteSelectionWithAreas(store) {
  // a locked object (or a locked layer's) is never deleted: it leaves the selection first; nothing else, nothing goes
  { const s0 = store.getState(), ok = pickableIn(s0.layers), keep = s0.selectedIds.filter(id => ok(s0.objects.find(o => o.id === id)))
    if (keep.length !== s0.selectedIds.length) { if (!keep.length) return; s0.selectGroup(keep) } }
  if (store.getState().selectedIds.some(id => FP.has(store.getState().objects.find(o => o.id === id)?.type))) return deleteBuildingOnly(store)
  const s = store.getState(), extra = areasEmptiedBy(s.objects, s.selectedIds)
  if (extra.length) s.selectGroup([...s.selectedIds, ...extra])
  store.getState().deleteSelected()
}
