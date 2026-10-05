// rowGroupTool.js — the Row group on the store: the group, the picking, the watcher that reads each action,
// and the bar's Apply (utils/rowGroup.js plans; canvas2/RowGroupBar.jsx and RowGroupPreview.jsx show it).
//
//   - The group is presentation state: it lives here, never in the canvas store, never in a saved file.
//     It stays outlined until Esc or ✕. A row deleted outside the group drops out of it.
//   - Picking: while `picking`, a click on a rack adds or removes its row and a box adds every row it
//     touches (useCanvasInteraction.js). "+ Same row in other sections" adds a selected row and its
//     namesakes.
//   - An action (a new history entry following the one seen before) that edits exactly one group row is
//     planned on the others: the bar asks "Apply to the other N rows?" with a live preview; Apply writes
//     it as ONE history entry. With "Always apply" it is applied at once, folded into the action's own
//     history entry — one Ctrl+Z undoes the edit and its apply together.
//   - An action editing two or more group rows is not replayed (the bar says so); undo / redo clear a
//     pending apply. A change that isn't the user's edit (a racking area's refit, a join) is passed over:
//     the caller calls skipNextAction() first.

import { create } from 'zustand'
import { rowsOf, resolveKey, rowOfRack, rowsInBox, sameRowOtherSections, classifyEdit, planReplay, applyReplay, planSummary } from './rowGroup'
import { layoutColumns } from '../generate/usableCapacity'
import { innerOutline } from './floorGeom'
import { rebuildAisles } from './aisleRebuild'
import { autoSave, serializeScene } from './saveLoad'

const LS_KEY = 'trace.rowGroup.always'
const readAlways = () => { try { return localStorage.getItem(LS_KEY) === '1' } catch { return false } }

export const useRowGroup = create((set) => ({
  keys: [],              // the group's rows (utils/rowGroup.js keys)
  picking: false,
  pending: null,         // { plan, summary, edit } — waiting for Apply
  message: null,         // a line for the bar ("Applied to 11 rows", "touches 2 rows …")
  hover: false,
  alwaysApply: readAlways(),
  setAlwaysApply: (on) => { try { localStorage.setItem(LS_KEY, on ? '1' : '0') } catch { /* private window */ } set({ alwaysApply: !!on }) },
  setPicking: (on) => set({ picking: !!on }),
  setHover: (h) => set({ hover: !!h }),
}))

let watch = null
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const gs = () => (watch && watch.store.getState().gridSize) || 40

/** The context the plan checks against: each building's inner outline, the columns. */
function contextFor(objects, newId) {
  const gridSize = gs(), poly = {}
  for (const fp of objects.filter(o => FP.has(o.type))) poly[fp.id] = innerOutline(fp, gridSize)
  return { gridSize, poly, columns: layoutColumns(objects, gridSize), travelFt: 8, newId }
}

/* ── the group ── */
export function clearGroup() { useRowGroup.setState({ keys: [], picking: false, pending: null, message: null, hover: false }) }
const objectsNow = () => (watch ? watch.store.getState().objects : [])
function setKeys(keys) { useRowGroup.setState({ keys: [...new Set(keys)], pending: null }) }
/** A click while picking: the rack's row in or out of the group. */
export function toggleRowOf(rackId) {
  const objects = objectsNow(), rows = rowsOf(objects, gs()), key = rowOfRack(rows, rackId)
  if (!key) return false
  const keys = useRowGroup.getState().keys, i = keys.findIndex(k => resolveKey(rows, k) === key)
  setKeys(i >= 0 ? keys.filter((_, j) => j !== i) : [...keys, key])
  return true
}
/** A box while picking: every row it touches joins the group. */
export function addRowsInBox(box) { const add = rowsInBox(objectsNow(), box, gs()); if (add.length) setKeys([...useRowGroup.getState().keys, ...add]); return add.length }
/** "+ This row" / "+ Same row in other sections" for a selected rack. */
export function addRowOf(rackId, { otherSections = false } = {}) {
  const objects = objectsNow(), rows = rowsOf(objects, gs()), key = rowOfRack(rows, rackId)
  if (!key) return 0
  const add = otherSections ? sameRowOtherSections(objects, key, gs()) : [key]
  setKeys([...useRowGroup.getState().keys, ...add])
  return add.length
}
/** The group's rows as they are now (gone ones left out). */
export function groupRowsNow(objects = objectsNow()) {
  const rows = rowsOf(objects, gs())
  return useRowGroup.getState().keys.map(k => resolveKey(rows, k)).filter(Boolean).map(k => rows.get(k))
}

/* ── writing ── */
function sync() { const st = watch.store.getState(); watch.lastObjects = st.objects; watch.lastHistory = st.history; watch.lastIndex = st.historyIndex }
/** Folded into the current history entry (no new undo step). */
function writeInPlace(objects) {
  const st = watch.store.getState(), full = { objects }
  if (st.historyIndex >= 0) {
    const history = st.history.slice(0, st.historyIndex + 1)
    history[history.length - 1] = JSON.stringify({ objects, groups: st.groups || [], layers: st.layers })
    full.history = history; full.historyIndex = history.length - 1
  }
  watch.busy = true
  try { watch.store.setState(full) } finally { watch.busy = false }
  try { autoSave(serializeScene(watch.store.getState())) } catch { /* storage full */ }
  sync()
}
const written = (objects, plan) => rebuildAisles(applyReplay(objects, plan), watch.newId).objects

/** The bar's Apply: the pending plan written as ONE history entry. */
export function applyPending() {
  const p = useRowGroup.getState().pending
  if (!watch || !p) return false
  const st = watch.store.getState()
  const objects = written(st.objects, p.plan)
  const anchor = p.plan.targets.flatMap(t => [...(t.racks || []), ...(t.addRacks || [])])[0]?.id || objects.find(o => FP.has(o.type))?.id
  watch.skipNext = true
  watch.store.setState({ objects })
  if (anchor) watch.store.getState().commitObjectUpdate(anchor, {})
  useRowGroup.setState({ pending: null, hover: false, message: `Applied to ${p.summary.apply} row${p.summary.apply === 1 ? '' : 's'}${p.summary.skipped.length ? ` · ${p.summary.skipped.length} skipped` : ''}` })
  return true
}
/** The bar's ✕ on a pending apply: nothing is applied. */
export function dismissPending() { useRowGroup.setState({ pending: null, hover: false }) }
/** The next history entry is not a user's edit (a racking area's refit, a join): pass it over. */
export function skipNextAction() { if (watch) watch.skipNext = true }

/** Read the action that just landed. */
function settle(before) {
  watch.pending = false
  const after = watch.store.getState().objects
  const skip = watch.skipNext
  watch.skipNext = false
  const st = useRowGroup.getState()
  // rows gone (deleted, regenerated) drop out of the group
  const rowsAfter = rowsOf(after, gs())
  const keys = st.keys
  sync()
  if (skip || !keys.length || !before) { if (keys.length) useRowGroup.setState({ keys: keys.filter(k => resolveKey(rowsAfter, k)), pending: null }); return }
  const edit = classifyEdit(before, after, keys, gs())
  const keep = keys.filter(k => resolveKey(rowsAfter, k))
  if (edit.kind === 'none') { useRowGroup.setState({ keys: keep, pending: null, message: null }); return }
  if (edit.kind === 'multi') { useRowGroup.setState({ keys: keep, pending: null, message: `This change touches ${edit.count} rows in the group, so it isn't applied to the others.` }); return }
  if (edit.kind === 'other') { useRowGroup.setState({ keys: keep, pending: null, message: `Not applied to the other rows: ${edit.why} isn't replayed.` }); return }
  const plan = planReplay(after, edit, keys, contextFor(after, watch.newId))
  const summary = planSummary(plan)
  const groupKeys = edit.kind === 'delete' ? keep : keys
  if (!summary.apply && !summary.skipped.length) { useRowGroup.setState({ keys: groupKeys, pending: null, message: null }); return }
  if (st.alwaysApply && summary.apply) {
    writeInPlace(written(after, plan))
    useRowGroup.setState({ keys: edit.kind === 'delete' ? groupRowsNow().map(r => r.key) : groupKeys, pending: null, message: `Applied to ${summary.apply} row${summary.apply === 1 ? '' : 's'}${summary.lose ? ` · ${summary.lose} lost ${summary.bays === summary.lose ? 'a bay' : 'bays'}` : ''}${summary.skipped.length ? ` · ${summary.skipped.length} skipped` : ''}` })
    return
  }
  useRowGroup.setState({ keys: groupKeys, pending: { plan, summary, edit }, message: null })
}

/** Watch `store` for actions; returns the unsubscribe. */
export function installRowGroupWatcher(store, newId) {
  watch = { store, newId, lastObjects: null, lastHistory: null, lastIndex: -1, busy: false, pending: false, skipNext: false }
  sync()
  const unsub = store.subscribe((st) => {
    if (!watch || watch.busy) return
    if (st.history !== watch.lastHistory) {
      const prevTop = watch.lastHistory && watch.lastIndex >= 0 ? watch.lastHistory[watch.lastIndex] : undefined
      const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
      if (!action && !watch.pending) { watch.skipNext = false; sync(); useRowGroup.setState({ pending: null }); return }
      if (!watch.pending) {
        watch.pending = true
        const before = watch.lastObjects
        // one action may write twice (a move, then its new parent): read it once, when it has landed
        queueMicrotask(() => { if (watch && watch.store === store) settle(before) })
      }
      return
    }
    if (st.historyIndex !== watch.lastIndex) {
      // undo / redo: a pending apply is over
      sync()
      useRowGroup.setState({ pending: null, message: null, hover: false })
    }
  })
  return () => { unsub(); if (watch && watch.store === store) watch = null }
}

/** For tests: settle now instead of on the microtask. */
export const flushRowGroupWatcher = () => new Promise(r => queueMicrotask(r))
