// elevSelection.js — the elevation of what is selected.
//
// The selection — racks clicked, Shift+clicked or boxed, bays picked (one side of a pair, or both) — as bay-sides:
// Map(rackId → [[side, bay]…]): what Elevation mode assigns the active elevation to (utils/elevMode.js) and what
// Properties' read-only elevation line reads. Nothing here moves a rack: the floor plan is untouched.
// The Row group replays a type change to its other rows like any edit (utils/rowGroup.js, kind 'elev').

import { isBeamRack, sidesOf, typeIdAt, typeById, assignCells, editTable } from './elevations'

const allSides = (r) => Array.from({ length: sidesOf(r) }, (_, s) => s)

/** The selected bay-sides of store state `st` → Map(rackId → [[side, bay]…]). Bays picked (a bay marquee, Shift+click,
 *  one clicked bay — on one side, or both) count for their rack; a rack selected whole counts every bay-side. */
export function selectionCells(st) {
  const out = new Map(), byId = new Map(st.objects.map(o => [o.id, o]))
  const picked = new Map()
  for (const e of st.activeBaySelection || []) { if (!picked.has(e.objId)) picked.set(e.objId, []); picked.get(e.objId).push(e) }
  const ids = new Set([...(st.selectedIds || []), ...picked.keys()])
  for (const id of ids) {
    const r = byId.get(id)
    if (!isBeamRack(r)) continue
    const cells = [], add = (side, b) => { for (const s of side == null ? allSides(r) : [sidesOf(r) === 2 ? side : 0]) if (!cells.some(c => c[0] === s && c[1] === b)) cells.push([s, b]) }
    if (picked.has(id)) for (const e of picked.get(id)) add(e.side ?? null, e.bayIdx)
    else if (r.activeBayIdx != null) add(r.activeBaySide ?? null, r.activeBayIdx)
    else for (const s of allSides(r)) r.beams.forEach((_, b) => cells.push([s, b]))
    if (cells.length) out.set(id, cells)
  }
  return out
}

/** The types among `cells`, most bay-sides first → [{ id, bays }] (each side of a back-to-back one bay, as the legend). */
export function cellTypes(objects, table, cells) {
  const n = new Map(), byId = new Map(objects.map(o => [o.id, o]))
  for (const [id, list] of cells) { const r = byId.get(id); if (r) for (const [s, b] of list) { const t = typeIdAt(r, b, s, table); n.set(t, (n.get(t) || 0) + 1) } }
  return [...n].map(([id, bays]) => ({ id, bays })).sort((a, b) => b.bays - a.bays)
}

/** `cells` narrowed to the bay-sides carrying type `typeId`. */
export function cellsOfType(objects, table, cells, typeId) {
  const out = new Map(), byId = new Map(objects.map(o => [o.id, o]))
  for (const [id, list] of cells) { const r = byId.get(id); const keep = r ? list.filter(([s, b]) => typeIdAt(r, b, s, table) === typeId) : []; if (keep.length) out.set(id, keep) }
  return out
}

/** What the drawing shows for `cells`: the beam length of the one bay picked, else the most common among them, with
 *  that bay's rack's depth, flue, pallet width and building → { beamIn, depthIn, pair, flueIn, palletWIn, parentId,
 *  rackIds }. */
export function drawEntry(objects, cells) {
  const byId = new Map(objects.map(o => [o.id, o])), n = new Map()
  let first = null
  for (const [id, list] of cells) { const r = byId.get(id); if (!r) continue; for (const [, b] of list) { const len = r.beams[b]; if (len == null) continue; if (!n.has(len)) n.set(len, { bays: 0, r }); n.get(len).bays++; if (!first) first = { len, r } } }
  if (!n.size) return null
  const [beamIn, { r }] = [...n].sort((a, b) => b[1].bays - a[1].bays || (a[0] === first.len ? -1 : b[0] === first.len ? 1 : 0))[0]
  return { beamIn, depthIn: r.depthIn ?? 42, pair: r.type === 'rack_double_row', flueIn: r.flueSpaceIn ?? 9, palletWIn: r.palletWIn ?? 40, parentId: r.parentId ?? null, rackIds: [...cells.keys()] }
}

/** The table to work on: the layout's, or one made from the racks' levels when there is none yet → { objects, table }. */
const ensureTable = (st) => (st.elevations ? { objects: st.objects, table: st.elevations } : (() => { const r = editTable(st.objects, null, t => ({ ...t })); return { objects: r.objects, table: r.table } })())

/** Type `typeId` on every selected bay-side `cells` — ONE undo step. Returns whether anything changed. */
export function commitAssign(store, cells, typeId) {
  const st = store.getState(), { objects, table } = ensureTable(st)
  if (!typeById(table, typeId)) return false
  const next = assignCells(objects, table, cells, typeId)
  if (next === st.objects && table === st.elevations) return false
  st.commitElevations(table, next)
  return true
}
