// elevTab.js — the Elevations tab (ELEVATIONS_PLAN.md §3): the active elevation, the view, and its edits.
//
// Elevations are made from the project (Project setup): each one names a ceiling entry and a pallet size, and its
// levels are the best fit for that pair. The tab shows the active one's drawing; assigning is selecting rows on the
// canvas as usual, then clicking an elevation chip (or "Apply to selected rows") — whole row sides take it. Every edit
// here is ONE undo step through the store's commitElevations; there is no draft.

import { create } from 'zustand'
import { editTable, updateType, removeType, setDefault, uniqueTypeName, typeById, assignCells, PALETTE, ELEV_VERSION } from './elevations'
import { selectionCells } from './elevSelection'
import { bestFitFor, pairName } from './elevFit'
import { projectOf, defaultCeiling, defaultPallet, ceilingById, palletById, dropUnusedTypes } from './project'

/** { activeId (the elevation the drawing shows), view ('front' | 'side'), adding (the + Add form open) } —
 *  presentation state. */
export const useElevTab = create(() => ({ activeId: null, view: 'front', adding: false }))

/** The selection as whole ROW SIDES — "select rows": each picked bay brings every bay of its rack on that side. */
export function rowSideCells(st) {
  const cells = selectionCells(st), byId = new Map(st.objects.map(o => [o.id, o])), out = new Map()
  for (const [id, list] of cells) { const r = byId.get(id); if (!r) continue; const sides = [...new Set(list.map(c => c[0]))]; out.set(id, sides.flatMap(sd => r.beams.map((_, b) => [sd, b]))) }
  return out
}

/** An elevation's shown name: its own when renamed, else its level count and pairing ("5 levels · 48×40 · Main"). */
export const nameOf = (table, t) => (t.named ? t.name : pairName(projectOf(table), t))
/** Every elevation not renamed called by its pairing (unique) — after a change to levels, pairing or the project. */
export function refreshNames(table) {
  if (!table?.types?.length) return table
  let changed = false, tb = table
  for (const t of table.types) {
    if (t.named) continue
    const base = pairName(projectOf(table), t)
    // its name already the pairing (or the pairing + " 2"…) and no one else's: kept — so a copy never renames the first
    const tail = String(t.name || '').startsWith(base) ? t.name.slice(base.length) : null
    if (tail !== null && (tail === '' || /^ \d+$/.test(tail)) && !tb.types.some(x => x.id !== t.id && x.name === t.name)) continue
    const want = uniqueTypeName(tb, base, t.id)
    if (want !== t.name) { tb = updateType(tb, t.id, { name: want }); changed = true }
  }
  return changed ? tb : table
}

const commit = (store, table, objects = null) => store.getState().commitElevations(table, objects)
const freshId = (table) => { let k = (table?.types?.length || 0) + 1, id; do { id = `elev-${Date.now().toString(36)}-${k++}` } while (table?.types?.some(t => t.id === id)); return id }

/** The best-fit elevation for ceiling `ceilingId` and pallet `palletId` added (the project's defaults when not given),
 *  made active → its id, or null (no ceiling height, or nothing fits). The first one becomes the default. */
export function addBestFit(store, { ceilingId = null, palletId = null } = {}) {
  const st = store.getState(), T = st.elevations, pr = projectOf(T)
  const c = ceilingById(pr, ceilingId) || defaultCeiling(pr), p = palletById(pr, palletId) || defaultPallet(pr)
  const d = c && bestFitFor(pr, c, p)
  if (!d) return null
  const id = freshId(T)
  const base = T || { version: ELEV_VERSION, defaultId: null, types: [] }
  const t = { ...d, id, name: '', color: PALETTE[base.types.length % PALETTE.length] }
  const table = refreshNames({ ...base, defaultId: base.defaultId || id, types: [...base.types, t] })
  const r = editTable(st.objects, table, tb => tb)
  commit(store, r.table, r.objects === st.objects ? null : r.objects)
  useElevTab.setState({ activeId: id, adding: false })
  return id
}
/** Elevation `id` on every selected row side (one undo step) → whether anything changed. */
export function assignSelected(store, id) {
  const st = store.getState(), T = st.elevations
  if (!typeById(T, id)) return false
  const cells = rowSideCells(st)
  if (!cells.size) return false
  const next = assignCells(st.objects, T, cells, id)
  if (next === st.objects) return false
  commit(store, T, next)
  return true
}
/** Elevation `id` changed to `next` (the drawing's adjustments) — everywhere it is used. */
export function changeElevation(store, id, next) {
  const st = store.getState(), T = st.elevations, cur = typeById(T, id)
  if (!cur) return false
  const r = editTable(st.objects, T, tb => refreshNames(updateType(tb, id, { ...next, id, name: cur.name, named: cur.named })))
  commit(store, r.table, r.objects === st.objects ? null : r.objects)
  return true
}
export function renameElevation(store, id, name) {
  const T = store.getState().elevations, v = String(name || '').trim()
  if (!typeById(T, id)) return false
  // an empty name: back to its pairing
  commit(store, refreshNames(v ? updateType(T, id, { name: uniqueTypeName(T, v, id), named: true }) : updateType(T, id, { named: false })))
  return true
}
export function recolorElevation(store, id, color) { const T = store.getState().elevations; commit(store, updateType(T, id, { color })) }
/** A copy of elevation `id` to adjust — made active. */
export function duplicateElevation(store, id) {
  const st = store.getState(), T = st.elevations, src = typeById(T, id)
  if (!src) return null
  const nid = freshId(T)
  // the copy takes the next free name ("… 2"), so the first keeps its own
  const t = { ...JSON.parse(JSON.stringify(src)), id: nid, color: PALETTE[T.types.length % PALETTE.length], name: uniqueTypeName(T, src.named ? `${src.name} copy` : src.name, null) }
  commit(store, refreshNames({ ...T, types: [...T.types, t] }))
  useElevTab.setState({ activeId: nid })
  return nid
}
export function deleteElevation(store, id) {
  const st = store.getState(), T = st.elevations
  if (!T || T.types.length <= 1) return false
  const r = editTable(st.objects, T, tb => removeType(tb, id))
  commit(store, r.table, r.objects === st.objects ? null : r.objects)
  if (useElevTab.getState().activeId === id) useElevTab.setState({ activeId: r.table.defaultId })
  return true
}
export function defaultElevation(store, id) { const st = store.getState(), r = editTable(st.objects, st.elevations, tb => setDefault(tb, id)); commit(store, r.table, r.objects === st.objects ? null : r.objects) }
/** Elevation `id` paired with another ceiling and / or pallet: its levels refitted to the best fit for the new pair
 *  (its assignments kept) → whether it changed. */
export function setPairing(store, id, { ceilingId, palletId }) {
  const st = store.getState(), T = st.elevations, pr = projectOf(T), cur = typeById(T, id)
  if (!cur) return false
  const c = ceilingById(pr, ceilingId ?? cur.ceilingId) || defaultCeiling(pr), p = palletById(pr, palletId ?? cur.palletId) || defaultPallet(pr)
  const d = c && bestFitFor(pr, c, p)
  if (!d) return false
  return changeElevation(store, id, { ...cur, ...d })
}
/** The elevations no bay uses removed (never the default). */
export function removeUnused(store) {
  const st = store.getState(), T = dropUnusedTypes(st.objects, st.elevations)
  if (T === st.elevations) return false
  commit(store, T)
  if (!typeById(T, useElevTab.getState().activeId)) useElevTab.setState({ activeId: T.defaultId })
  return true
}
