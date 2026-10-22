// deleteSelection.js — Delete (the key and the card's Delete buttons): the selection, plus each racking area the delete
// empties. A racking area is a helper (utils/layers.js isHelper) — Ctrl+A never selects it — so Ctrl+A → Delete would
// otherwise leave its box on an empty floor. An area that still owns a rack after the delete stays: it keeps its
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

/** The store's deleteSelected, with the emptied areas added to the selection first — one undo step. */
export function deleteSelectionWithAreas(store) {
  const s = store.getState(), extra = areasEmptiedBy(s.objects, s.selectedIds)
  if (extra.length) s.selectGroup([...s.selectedIds, ...extra])
  store.getState().deleteSelected()
}
