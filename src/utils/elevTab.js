// elevTab.js — the Elevations tab (ELEVATIONS_PLAN.md §3): the active elevation, the view, and its edits.
//
// Elevations are made from the project (Project setup): each one names a ceiling entry and a pallet size, and its
// levels are the best fit for that pair. The tab shows the active one's drawing; assigning is selecting rows on the
// canvas as usual, then clicking an elevation chip (or "Apply to selected rows") — whole row sides take it. Every edit
// here is ONE undo step through the store's commitElevations; there is no draft.

import { create } from 'zustand'
import { editTable, updateType, removeType, setDefault, uniqueTypeName, typeById, assignCells, PALETTE, ELEV_VERSION } from './elevations'
import { selectionCells } from './elevSelection'
import { bestFitFor } from './elevFit'
import { projectOf, defaultCeiling, defaultPallet, ceilingById, palletById, dropUnusedTypes, nameOf, refreshNames, previewName, newId, withProject, palletName, PALLET_DEFAULT } from './project'

/** { activeId (the elevation the list's drawing shows), view ('front' | 'side'), editing (the editor: null, or { id
 *  (null: a new elevation), draft (the elevation being made or changed — nothing is written until Save), touched (the
 *  drawing has changed its levels) }), made (the last Save's outcome: { id, kind: 'new' | 'exists' | 'saved' | 'none',
 *  at } — its chip highlighted, the hint shown, until the next Save or an assignment) } — presentation state.
 *  The list (choosing, assigning) and the editor (making, changing) are never shown at the same time. */
export const useElevTab = create(() => ({ activeId: null, view: 'front', editing: null, made: null }))

/** The selection as whole ROW SIDES — "select rows": each picked bay brings every bay of its rack on that side. */
export function rowSideCells(st) {
  const cells = selectionCells(st), byId = new Map(st.objects.map(o => [o.id, o])), out = new Map()
  for (const [id, list] of cells) { const r = byId.get(id); if (!r) continue; const sides = [...new Set(list.map(c => c[0]))]; out.set(id, sides.flatMap(sd => r.beams.map((_, b) => [sd, b]))) }
  return out
}

/** Names (shown and stored, always unique) — utils/project.js, where the keeper also dedupes a layout on load. */
export { nameOf, refreshNames }

const commit = (store, table, objects = null) => store.getState().commitElevations(table, objects)
const freshId = (table) => { let k = (table?.types?.length || 0) + 1, id; do { id = `elev-${Date.now().toString(36)}-${k++}` } while (table?.types?.some(t => t.id === id)); return id }

/** The elevation already giving the best fit for that ceiling and pallet (same pair, same beams and upright) → it, or
 *  null. */
export function sameBestFit(table, { ceilingId = null, palletId = null } = {}) {
  const pr = projectOf(table)
  const c = ceilingById(pr, ceilingId) || defaultCeiling(pr), p = palletById(pr, palletId) || defaultPallet(pr)
  const d = bestFitFor(pr, c, p)
  if (!d) return null
  const beams = (t) => t.levels.map(l => l.beamIn).join(',')
  return (table?.types || []).find(t => (t.ceilingId ?? null) === d.ceilingId && (t.palletId ?? null) === d.palletId && t.uprightHeightIn === d.uprightHeightIn && beams(t) === beams(d)) || null
}

/** The best-fit elevation for ceiling `ceilingId` and pallet `palletId` added (the project's defaults when not given;
 *  no ceiling: 24' assumed), made active → its id, or null (nothing fits). The first one becomes the default. */
export function addBestFit(store, { ceilingId = null, palletId = null } = {}) {
  const st = store.getState(), T = st.elevations, pr = projectOf(T)
  const c = ceilingById(pr, ceilingId) || defaultCeiling(pr), p = palletById(pr, palletId) || defaultPallet(pr)
  const d = bestFitFor(pr, c, p)
  if (!d) return null
  const id = freshId(T)
  const base = T || { version: ELEV_VERSION, defaultId: null, types: [] }
  const t = { ...d, id, name: '', color: PALETTE[base.types.length % PALETTE.length] }
  const table = refreshNames({ ...base, defaultId: base.defaultId || id, types: [...base.types, t] })
  const r = editTable(st.objects, table, tb => tb)
  commit(store, r.table, r.objects === st.objects ? null : r.objects)
  useElevTab.setState({ activeId: id })
  return id
}
/* ── the editor: a draft, written once on Save (one undo step) ─────────────────────────────────────────────────────── */

const beamsOf = (t) => t.levels.map(l => l.beamIn).join(',')
/** An elevation of `table` the same as `t` — same ceiling and pallet, beams, upright and beam face — other than
 *  `exceptId` → it, or null. */
export function sameElevation(table, t, exceptId = null) {
  return (table?.types || []).find(x => x.id !== exceptId && (x.ceilingId ?? null) === (t.ceilingId ?? null) && (x.palletId ?? null) === (t.palletId ?? null)
    && x.uprightHeightIn === t.uprightHeightIn && (x.beamFaceIn ?? null) === (t.beamFaceIn ?? null) && beamsOf(x) === beamsOf(t)) || null
}
/** The editor's own new ceiling / pallet, until Save: their ids in the draft. */
export const NEW_CEILING = '__new-ceiling', NEW_PALLET = '__new-pallet'
const ftToIn = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 12) : null }
const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }
/** The draft's new ceiling / pallet as project entries (null when not chosen). */
const newCeilingOf = (e) => (e?.newCeiling ? { id: NEW_CEILING, name: String(e.newCeiling.name || '').trim() || 'New ceiling', clearHeightIn: ftToIn(e.newCeiling.clearFt), sprinklerIn: ftToIn(e.newCeiling.sprFt) } : null)
const newPalletOf = (e) => { if (!e?.newPallet) return null; const p = { faceIn: pos(e.newPallet.faceIn) ?? PALLET_DEFAULT.faceIn, depthIn: pos(e.newPallet.depthIn) ?? PALLET_DEFAULT.depthIn, heightIn: pos(e.newPallet.heightIn) ?? PALLET_DEFAULT.heightIn, weightLb: pos(e.newPallet.weightLb) ?? PALLET_DEFAULT.weightLb }; return { id: NEW_PALLET, name: palletName(p), ...p } }
/** `table` as the editor sees it: the project with the draft's new ceiling / pallet in it (not written). */
export function draftTable(table, e) {
  const pr = projectOf(table), c = newCeilingOf(e), p = newPalletOf(e)
  if (!pr || (!c && !p)) return table
  return { ...table, project: { ...pr, ceilings: c ? [...pr.ceilings, c] : pr.ceilings, pallets: p ? [...pr.pallets, p] : pr.pallets } }
}
/** The best fit for a draft's ceiling, pallet and beam face (its name, colour and id kept) → the refitted draft, or the
 *  draft unchanged when nothing fits. `table`: the editor's (draftTable). */
export function refitDraft(table, draft) {
  const pr = projectOf(table), c = ceilingById(pr, draft.ceilingId) || defaultCeiling(pr), p = palletById(pr, draft.palletId) || defaultPallet(pr)
  const d = bestFitFor(pr, c, p, { beamFaceIn: draft.beamFaceIn })
  return d ? { ...draft, ...d } : draft
}
/** "+ New elevation": the editor opens on the best fit for the default ceiling and pallet (the project's beam face). */
export function startNew(store) {
  const T = store.getState().elevations, pr = projectOf(T)
  const d = bestFitFor(pr, defaultCeiling(pr), defaultPallet(pr))
  if (!d) return false
  useElevTab.setState({ editing: { id: null, draft: { ...d, name: '', named: false }, touched: false, newCeiling: null, newPallet: null }, made: null })
  return true
}
/** ✎ on a row: the editor opens on a copy of that elevation. */
export function startEdit(store, id) {
  const t = typeById(store.getState().elevations, id)
  if (!t) return false
  useElevTab.setState({ editing: { id, draft: JSON.parse(JSON.stringify(t)), touched: false, newCeiling: null, newPallet: null }, activeId: id, made: null })
  return true
}
/** The draft changed — `patch` from the editor's fields (with `newCeiling` / `newPallet`: the "+ New" fields, merged),
 *  or `next` from the drawing (`touched`). A new ceiling or pallet picked refits it (the best fit for the new pair);
 *  a new beam face, or the new ceiling's / pallet's own values, refit it until the drawing has changed its levels —
 *  after that the levels stay and the checks say what no longer fits. */
export function editDraft(store, patch, { fromDrawing = false } = {}) {
  const e = useElevTab.getState().editing
  if (!e) return
  const { newCeiling, newPallet, ...p } = patch
  const next = { ...e }
  if (newCeiling) next.newCeiling = { ...(e.newCeiling || {}), ...newCeiling }
  if (newPallet) next.newPallet = { ...(e.newPallet || {}), ...newPallet }
  // "+ New …" picked: its fields start empty (the ceiling) or from the default pallet; another entry picked: dropped
  if (p.ceilingId === NEW_CEILING && !next.newCeiling) next.newCeiling = { name: '', clearFt: '', sprFt: '' }
  if ('ceilingId' in p && p.ceilingId !== NEW_CEILING) next.newCeiling = null
  if (p.palletId === NEW_PALLET && !next.newPallet) { const dp = defaultPallet(projectOf(store.getState().elevations)) || PALLET_DEFAULT; next.newPallet = { faceIn: dp.faceIn, depthIn: dp.depthIn, heightIn: dp.heightIn, weightLb: dp.weightLb } }
  if ('palletId' in p && p.palletId !== NEW_PALLET) next.newPallet = null
  const T = draftTable(store.getState().elevations, next)
  let draft = { ...e.draft, ...p }, touched = e.touched || fromDrawing
  const pair = ('ceilingId' in p && p.ceilingId !== e.draft.ceilingId) || ('palletId' in p && p.palletId !== e.draft.palletId)
  const values = ('beamFaceIn' in p) || (newCeiling && draft.ceilingId === NEW_CEILING) || (newPallet && draft.palletId === NEW_PALLET)
  if (!fromDrawing && (pair || (values && !e.touched))) { draft = refitDraft(T, draft); if (pair) touched = false }
  useElevTab.setState({ editing: { ...next, draft, touched } })
}
export const cancelEdit = () => useElevTab.setState({ editing: null })
/** Save — the editor's ONE save: a new ceiling or pallet goes into the project, and a new elevation is added (unless
 *  the same one exists — then that one is picked and said so) or a changed one written everywhere it is used; all of
 *  it ONE undo step. Back to the list, the row picked → the outcome. */
export function saveEdit(store) {
  const e = useElevTab.getState().editing
  if (!e) return null
  const st = store.getState(), T0 = st.elevations
  let d = e.draft, T = T0
  // the draft's new ceiling / pallet become real project entries
  const c = d.ceilingId === NEW_CEILING ? newCeilingOf(e) : null, p = d.palletId === NEW_PALLET ? newPalletOf(e) : null
  if (c || p) {
    const pr = projectOf(T0), cid = c ? newId('ceil') : null, pid = p ? newId('pal') : null
    T = withProject(T0, { ...pr, ceilings: c ? [...pr.ceilings, { ...c, id: cid }] : pr.ceilings, pallets: p ? [...pr.pallets, { ...p, id: pid }] : pr.pallets, defaultCeilingId: pr.defaultCeilingId || cid })
    d = { ...d, ...(c ? { ceilingId: cid } : {}), ...(p ? { palletId: pid } : {}) }
  }
  const wanted = String(d.name || '').trim(), named = !!wanted && d.named !== false && wanted !== previewName(T, d, e.id)
  if (!e.id) {
    const same = !c && !p && sameElevation(T, d)
    if (same) { useElevTab.setState({ editing: null, activeId: same.id, made: { id: same.id, kind: 'exists', at: Date.now() } }); return { kind: 'exists', id: same.id } }
    const id = freshId(T), base = T || { version: ELEV_VERSION, defaultId: null, types: [] }
    const t = { ...d, id, color: d.color || PALETTE[base.types.length % PALETTE.length], named, name: named ? uniqueTypeName(base, wanted, id) : '' }
    const r = editTable(st.objects, refreshNames({ ...base, defaultId: base.defaultId || id, types: [...base.types, t] }), tb => tb)
    commit(store, r.table, r.objects === st.objects ? null : r.objects)
    useElevTab.setState({ editing: null, activeId: id, made: { id, kind: 'new', at: Date.now() } })
    return { kind: 'new', id }
  }
  const cur = typeById(T, e.id)
  if (!cur) { useElevTab.setState({ editing: null }); return null }
  const next = { ...d, id: e.id, named, name: named ? uniqueTypeName(T, wanted, e.id) : cur.name }
  const r = editTable(st.objects, T, tb => refreshNames(updateType(tb, e.id, next)))
  commit(store, r.table, r.objects === st.objects ? null : r.objects)
  useElevTab.setState({ editing: null, activeId: e.id, made: { id: e.id, kind: 'saved', at: Date.now() } })
  return { kind: 'saved', id: e.id }
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
  const d = bestFitFor(pr, c, p)
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
