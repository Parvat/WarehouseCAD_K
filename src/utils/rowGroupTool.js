// rowGroupTool.js — the Row group on the store: the group, its tool, the watcher that reads each action,
// and the bar's Apply (utils/rowGroup.js plans; canvas2/RowGroupBar.jsx and RowGroupPreview.jsx show it).
//
//   - The group is presentation state: it lives here, never in the canvas store, never in a saved file.
//     It stays outlined until Esc or ✕. A row deleted outside the group drops out of it.
//   - The Row group tool (ROW_GROUP_TOOL, next to Fill racking): a box adds every row it touches, a click
//     on a row adds or removes it — one action, then the tool goes back to Select (canvas2/Canvas2.jsx).
//   - An action (a new history entry following the one seen before) that edits a group row is planned on
//     the others. "Ask": the bar asks "Apply to the other N rows?" with a live preview; Apply writes it as
//     ONE history entry, Skip leaves it. "Auto apply": applied at once, folded into the action's own
//     history entry — one Ctrl+Z undoes the edit and its apply together.
//   - An action editing several group rows the same way is applied to the rest (every edited row is a
//     source); edits that differ are not replayed (the bar says so). Undo / redo end a pending apply. A
//     change that isn't the user's edit (a racking area's refit, a join, Generate) is passed over: the
//     caller calls skipNextAction() (Generate: clearGroup()) first.

import { create } from 'zustand'
import { rowsOf, resolveKey, rowOfRack, rowsInBox, sameRowOtherSections, classifyEdit, planReplay, applyReplay, planSummary, groupDragExclusions } from './rowGroup'
import { layoutColumns } from '../generate/usableCapacity'
import { innerOutline } from './floorGeom'
import { rebuildAisles } from './aisleRebuild'
import { autoSave, serializeScene } from './saveLoad'
import { takeOverCarriedBays } from './pairCarryOn'

/** The Row group tool's id (the store's activeTool), beside Fill racking's. */
export const ROW_GROUP_TOOL = 'row_group'
const LS_KEY = 'trace.rowGroup.always'   // "Auto apply" (on) or "Ask" (off), per browser
const readAlways = () => { try { return localStorage.getItem(LS_KEY) === '1' } catch { return false } }

export const useRowGroup = create((set) => ({
  keys: [],              // the group's rows (utils/rowGroup.js keys)
  drag: null,            // the Row group tool's box being dragged: { from, to } (world)
  pending: null,         // { plan, summary, edit } — waiting for Apply
  message: null,         // a line for the bar ("Applied to 11 rows", "Nothing applied. 3 skipped", "… isn't replayed")
  report: null,          // with the message: { warned, skipped } — the rows it names, listed under it
  hover: false,
  alwaysApply: readAlways(),
  setAlwaysApply: (on) => { try { localStorage.setItem(LS_KEY, on ? '1' : '0') } catch { /* private window */ } set({ alwaysApply: !!on }) },
  setHover: (h) => set({ hover: !!h }),
}))

let watch = null
const FP = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const gs = () => (watch && watch.store.getState().gridSize) || 40

/** The context the plan checks against: each building's inner outline, the columns. */
function contextFor(objects, newId) {
  const gridSize = gs(), poly = {}
  for (const fp of objects.filter(o => FP.has(o.type))) poly[fp.id] = innerOutline(fp, gridSize)
  return { gridSize, poly, columns: layoutColumns(objects, gridSize), travelFt: 8, newId, finalize: (a, w) => takeOverCarriedBays(a, w, gridSize).objects }
}

/* ── the group ── */
export function clearGroup() { useRowGroup.setState({ keys: [], drag: null, pending: null, message: null, hover: false }) }
const objectsNow = () => (watch ? watch.store.getState().objects : [])
function setKeys(keys) { useRowGroup.setState({ keys: [...new Set(keys)], pending: null }) }
/** A click with the tool: the rack's row in or out of the group. */
export function toggleRowOf(rackId) {
  const objects = objectsNow(), rows = rowsOf(objects, gs()), key = rowOfRack(rows, rackId)
  if (!key) return false
  const keys = useRowGroup.getState().keys, i = keys.findIndex(k => resolveKey(rows, k) === key)
  setKeys(i >= 0 ? keys.filter((_, j) => j !== i) : [...keys, key])
  return true
}
/** A box with the tool: every row it touches joins the group. */
export function addRowsInBox(box) { const add = rowsInBox(objectsNow(), box, gs()); if (add.length) setKeys([...useRowGroup.getState().keys, ...add]); return add.length }
/** A rack's row (and, with otherSections, the rows with its row number in the building's other sections)
 *  into the group — no button any more; for scripts and tests that build a group directly. */
export function addRowOf(rackId, { otherSections = false } = {}) {
  const objects = objectsNow(), rows = rowsOf(objects, gs()), key = rowOfRack(rows, rackId)
  if (!key) return 0
  const add = otherSections ? sameRowOtherSections(objects, key, gs()) : [key]
  setKeys([...useRowGroup.getState().keys, ...add])
  return add.length
}
/** For the drag (canvas2/useCanvasInteraction.js): the racks a dragged group row must not snap to, or null
 *  when the drag holds no group row. */
export function groupDragFor(objects, ids) {
  const keys = useRowGroup.getState().keys
  return keys.length ? groupDragExclusions(objects, ids, keys, gs()) : null
}

/* ── the tool: one box or one click, then back to Select ── */
/** Press: the box starts here; `hitRackId` is the rack under the press, if any (a click toggles its row). */
export function startGroupBox(world, hitRackId = null) { useRowGroup.setState({ drag: { from: world, to: world, hit: hitRackId } }) }
export function moveGroupBox(world) { const d = useRowGroup.getState().drag; if (d) useRowGroup.setState({ drag: { ...d, to: world } }) }
/** Release: a box (`moved`) adds the rows it touches; a click toggles the row under it. Either way the tool is
 *  done and Select is back. Returns the rows added (box) or whether a row was toggled (click). */
export function commitGroupBox(store, moved, selectTool) {
  const d = useRowGroup.getState().drag
  useRowGroup.setState({ drag: null })
  let out = 0
  if (d && moved) {
    const box = { x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) }
    out = addRowsInBox(box)
  } else if (d && d.hit) out = toggleRowOf(d.hit) ? 1 : 0
  if (selectTool) store.getState().setActiveTool(selectTool)
  return out
}
export function cancelGroupBox() { useRowGroup.setState({ drag: null }) }

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
/** The layout an apply writes: the plan applied, each grown pair taking over its carried-on single's bay
 *  (utils/pairCarryOn.js — the same rule as for a hand edit), the aisles re-paired. */
const written = (objects, plan) => rebuildAisles(takeOverCarriedBays(objects, applyReplay(objects, plan), gs()).objects, watch.newId).objects

/** The bar's line after an apply: "Applied to 11 rows · 2 with warnings — see Check layout · 1 skipped". */
const resultLine = (s) => `Applied to ${s.apply} row${s.apply === 1 ? '' : 's'}${s.warned.length ? ` · ${s.warned.length} with warnings — see Check layout` : ''}${s.skipped.length ? ` · ${s.skipped.length} skipped` : ''}`

const reportOf = (s) => ({ warned: s.warned, skipped: s.skipped })

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
  useRowGroup.setState({ pending: null, hover: false, message: resultLine(p.summary), report: reportOf(p.summary) })
  return true
}
/** The bar's Skip on a pending apply: nothing is applied, the edit stays on its own row. */
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
  if (edit.kind === 'multi') { useRowGroup.setState({ keys: keep, pending: null, message: `These ${edit.count} rows were changed in different ways, so the change isn't applied to the others.` }); return }
  if (edit.kind === 'other') { useRowGroup.setState({ keys: keep, pending: null, message: `Not applied to the other rows: ${edit.why} isn't replayed.` }); return }
  const plan = planReplay(after, edit, keys, contextFor(after, watch.newId))
  const summary = planSummary(plan)
  const groupKeys = edit.kind === 'delete' ? keep : keys
  // nothing to apply — Ask or Auto, no question: say so, with the reasons
  if (!summary.apply) {
    const n = summary.skipped.length
    const message = n ? `Nothing applied. ${n} skipped` : plan.targets.length ? 'Nothing applied: no other group row has racks there.' : null
    useRowGroup.setState({ keys: groupKeys, pending: null, message, report: n ? reportOf(summary) : null })
    return
  }
  if (st.alwaysApply) {
    writeInPlace(written(after, plan))
    useRowGroup.setState({ keys: edit.kind === 'delete' ? groupRowsNow().map(r => r.key) : groupKeys, pending: null, message: resultLine(summary), report: reportOf(summary) })
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
