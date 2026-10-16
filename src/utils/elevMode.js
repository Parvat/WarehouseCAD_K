// elevMode.js — Elevation mode (ELEVATIONS_PLAN.md §3): the Layout | Elevations switch, the split, the active
// elevation, and the draft.
//
// Elevations are a separate step after the layout. In Elevation mode the plan (left) is select-only and the elevation
// workspace (right) edits the layout's elevations LIVE — the plan recolours at once — but as a DRAFT: no history entry
// until Apply, which saves it all as ONE undo step; Discard goes back to the last applied state (the history's top);
// leaving with a draft asks. Assigning works like a colour picker: with an elevation active, each new selection on the
// plan takes it. The split's width is presentation state, per browser; everything else is the layout's.

import { create } from 'zustand'
import { editTable, updateType, removeType, setDefault, uniqueTypeName, typeById, PALETTE, ELEV_VERSION } from './elevations'
import { selectionCells } from './elevSelection'
import { assignCells } from './elevations'
import { autoName, isAutoName } from './elevFit'

const KEY = 'trace.elevmode.v1'
export const SPLIT_MIN = 0.25, SPLIT_MAX = 0.7, SPLIT_DEFAULT = 0.4
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { split: Number.isFinite(v.split) ? Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v.split)) : SPLIT_DEFAULT } } catch { return { split: SPLIT_DEFAULT } } }

/** { on, split (the workspace's share of the width), activeId (the elevation assigned by a selection), pending (a
 *  draft not applied yet), view ('front' | 'side'), adding (choosing what to add), leaving (asking before leaving) } */
export const useElevMode = create(() => ({ on: false, activeId: null, pending: false, view: 'front', adding: false, leaving: false, ...read() }))
export function setElevMode(patch) {
  useElevMode.setState(patch)
  try { localStorage.setItem(KEY, JSON.stringify({ split: useElevMode.getState().split })) } catch { /* private window */ }
}

const unselect = (st) => ({ selectedIds: [], activeBaySelection: [], objects: st.objects.some(o => o.activeBayIdx != null) ? st.objects.map(o => (o.activeBayIdx != null ? { ...o, activeBayIdx: null, activeBaySide: null } : o)) : st.objects })

/** Into Elevation mode: Select tool, nothing selected, the default elevation active. */
export function enterElevations(store) {
  const st = store.getState()
  st.setActiveTool?.('select')
  store.setState(unselect(st))
  useElevMode.setState({ on: true, pending: false, adding: false, leaving: false, activeId: st.elevations?.defaultId ?? null })
}
/** Back to Layout: with a draft, ask first (`leaving`) and stay; otherwise leave, nothing selected. Returns whether it left. */
export function leaveElevations(store) {
  if (useElevMode.getState().pending) { useElevMode.setState({ leaving: true }); return false }
  store.setState(unselect(store.getState()))
  useElevMode.setState({ on: false, leaving: false, adding: false })
  return true
}

/** A draft edit: the layout's objects and / or elevations written live, no history entry. */
export function draft(store, { objects, elevations }) {
  const patch = {}
  if (objects && objects !== store.getState().objects) patch.objects = objects
  if (elevations !== undefined && elevations !== store.getState().elevations) patch.elevations = elevations
  if (!Object.keys(patch).length) return false
  store.setState(patch)
  useElevMode.setState({ pending: true })
  return true
}
/** Apply: the draft saved as ONE undo step. */
export function applyDraft(store) {
  if (!useElevMode.getState().pending) return false
  const st = store.getState()
  useElevMode.setState({ pending: false })
  st.commitElevations(st.elevations, st.objects)
  return true
}
/** Discard: back to the last applied state (the history's top). */
export function discardDraft(store) {
  const st = store.getState()
  useElevMode.setState({ pending: false })
  try { const snap = JSON.parse(st.history[st.historyIndex]); store.setState({ objects: snap.objects, elevations: snap.elevations ?? null }) } catch { /* no history */ }
  const T = store.getState().elevations
  if (!typeById(T, useElevMode.getState().activeId)) useElevMode.setState({ activeId: T?.defaultId ?? null })
}

/** Undo in Elevation mode with a draft: the draft discarded (back to the last applied state), never a step further. */
export function undoOrDiscard(store) {
  if (useElevMode.getState().on && useElevMode.getState().pending) { discardDraft(store); return }
  store.getState().undo()
}

/* ── the workspace's edits, each a draft ──────────────────────────────────── */

const withName = (table, t) => ({ ...t, name: uniqueTypeName(table, autoName(t), t.id) })
const freshId = (table) => { let k = table ? table.types.length + 1 : 1, id; do { id = `elev-${Date.now().toString(36)}-${k++}` } while (table && table.types.some(t => t.id === id)); return id }

/** `design` (a proposal) becomes the elevation of the whole layout: the only type, every override cleared. */
export function useForLayout(store, design, { fit = null, sprinklerClearanceIn = null } = {}) {
  const st = store.getState(), id = freshId(null)
  const t = { ...design, id, name: autoName(design), color: PALETTE[0] }
  const table = { version: ELEV_VERSION, defaultId: id, types: [t], ...(fit ? { fit } : {}), ...(sprinklerClearanceIn != null ? { sprinklerClearanceIn } : st.elevations?.sprinklerClearanceIn != null ? { sprinklerClearanceIn: st.elevations.sprinklerClearanceIn } : {}) }
  const r = editTable(st.objects.map(o => { if (o.elevType == null && o.elevSides == null && o.elevBays == null) return o; const n = { ...o }; delete n.elevType; delete n.elevSides; delete n.elevBays; return n }), null, () => table)
  draft(store, { objects: r.objects, elevations: r.table })
  useElevMode.setState({ activeId: id, adding: false })
  return id
}
/** Another elevation: `design` (a proposal), or a copy of `fromId` to adjust — made active, nothing assigned yet. */
export function addElevation(store, { design = null, fromId = null } = {}) {
  const st = store.getState(), T = st.elevations
  if (!T) return design ? useForLayout(store, design) : null
  const src = design || typeById(T, fromId)
  if (!src) return null
  const id = freshId(T)
  const t = withName(T, { ...JSON.parse(JSON.stringify(src)), id, color: PALETTE[T.types.length % PALETTE.length] })
  draft(store, { elevations: { ...T, types: [...T.types, t] } })
  useElevMode.setState({ activeId: id, adding: false })
  return id
}
/** Elevation `id` changed to `next` (the drawing's adjustments) — everywhere it is used; an auto name follows it. */
export function changeElevation(store, id, next) {
  const st = store.getState(), T = st.elevations, cur = typeById(T, id)
  if (!cur) return false
  const n = isAutoName(cur.name) ? withName(T, { ...next, id }) : { ...next, id, name: cur.name }
  const r = editTable(st.objects, T, tb => updateType(tb, id, n))
  return draft(store, { objects: r.objects, elevations: r.table })
}
export function renameElevation(store, id, name) {
  const st = store.getState(), T = st.elevations, v = String(name || '').trim()
  if (!v || !typeById(T, id)) return false
  return draft(store, { elevations: updateType(T, id, { name: uniqueTypeName(T, v, id) }) })
}
export function recolorElevation(store, id, color) { const T = store.getState().elevations; return draft(store, { elevations: updateType(T, id, { color }) }) }
export function deleteElevation(store, id) {
  const st = store.getState(), T = st.elevations
  if (!T || T.types.length <= 1) return false
  const r = editTable(st.objects, T, tb => removeType(tb, id))
  draft(store, { objects: r.objects, elevations: r.table })
  if (useElevMode.getState().activeId === id) useElevMode.setState({ activeId: r.table.defaultId })
  return true
}
export function defaultElevation(store, id) { const st = store.getState(), r = editTable(st.objects, st.elevations, tb => setDefault(tb, id)); return draft(store, { objects: r.objects, elevations: r.table }) }
/** The building's clear height (ft) set from the workspace — part of the draft. */
export function setBuildingHeights(store, fpId, patch) {
  const st = store.getState()
  return draft(store, { objects: st.objects.map(o => (o.id === fpId ? { ...o, ...patch } : o)) })
}

/** The selection as whole ROW SIDES — "click rows": each picked bay brings every bay of its rack on that side (a box
 *  of bays, a clicked bay alike) → Map(rackId → [[side, bay]…]). */
export function rowSideCells(st) {
  const cells = selectionCells(st), byId = new Map(st.objects.map(o => [o.id, o])), out = new Map()
  for (const [id, list] of cells) { const r = byId.get(id); if (!r) continue; const sides = [...new Set(list.map(c => c[0]))]; out.set(id, sides.flatMap(sd => r.beams.map((_, b) => [sd, b]))) }
  return out
}

/** While on: each new selection on the plan takes the active elevation, row side by row side (a draft) — once the
 *  gesture has settled (a click writes its selection in steps; the microtask sees the last). Picking another elevation
 *  never reassigns what is selected. Returns the unsubscribe. */
export function installAssignWatcher(store) {
  const keyOf = (st) => { const c = rowSideCells(st); return c.size ? JSON.stringify([...c]) : '' }
  let last = keyOf(store.getState()), queued = false
  const run = () => {
    queued = false
    const st = store.getState(), m = useElevMode.getState()
    if (!m.on) { last = ''; return }
    const k = keyOf(st)
    if (k === last) return
    last = k
    if (!k || !m.activeId || !typeById(st.elevations, m.activeId)) return
    const next = assignCells(st.objects, st.elevations, rowSideCells(st), m.activeId)
    if (next !== st.objects) draft(store, { objects: next })
  }
  return store.subscribe(() => { if (!queued) { queued = true; queueMicrotask(run) } })
}
