// copyPrompt.js — the "Copy this change" note and the "Always copy" switch
// (utils/copyChange.js does the geometry).
//
// A watcher on the canvas store reads every action as it lands: a new
// history entry is one action, and the layout before it and after it say
// what it was. After a row / bay change it offers a copy in a note at the
// bottom of the canvas — one button, or two for a row dragged both across
// and along (each copies only its own part), each with its copy count:
//   - clicking the button copies — as its OWN undo step (the first Ctrl+Z
//     takes the copies away, the second the change);
//   - ignoring it: the note goes at the next action (or undo / redo) and the
//     change stays where it was made. Nothing piles up.
// With "Always copy" on (a toolbar switch, off by default, remembered in
// localStorage) the copy is made straight away, with no note, and folded
// into the action's own history entry: one Ctrl+Z takes the change and its
// copies together. A copy that could not go in is still reported, in a note
// without a button.
//
// A row / bay change that can't be copied (rows in several sections, an
// upright width, a mixed edit, ...) is never silent: the note says so, and
// why, with no button.
//
// The watcher and the copy write without the protected store's own actions:
// setState, plus commitObjectUpdate for the one history entry (or a
// replacement of the last one, for Always copy).

import { create } from 'zustand'
import { readChange, planCopy, applyPlan, describeChange, copyButtonLabel } from './copyChange'
import { rebuildAisles } from './aisleRebuild'
import { getColumnCheckView } from '../generate/columnCheckView'
import { autoSave, serializeScene } from './saveLoad'

const LS_KEY = 'trace.copyChange.always'
const readAlways = () => { try { return localStorage.getItem(LS_KEY) === '1' } catch { return false } }

/** The note's state:
 *   `offer` = { text, before, parts: [{ change, plan, button, count,
 *     skipped, warnings }], notes, done } while a copy is on offer, or
 *     { text, blocked: true } for a change that can't be copied;
 *   `report` = what the last copy did (skips) when there is nothing to click;
 *   `hover` = which part's button is hovered (its copies are previewed on
 *     the canvas), or null. */
export const useCopyPrompt = create((set) => ({
  offer: null,
  report: null,
  hover: null,
  alwaysCopy: readAlways(),
  setHover: (hover) => set({ hover: hover === true ? 0 : (hover === false || hover == null ? null : hover) }),
  setAlwaysCopy: (on) => {
    try { localStorage.setItem(LS_KEY, on ? '1' : '0') } catch { /* private window */ }
    set({ alwaysCopy: !!on })
  },
  dismiss: () => set({ offer: null, report: null, hover: null }),
}))

let watch = null   // { store, newId, lastObjects, lastHistory, lastIndex, busy, quiet }

/** The next action is a copy of its own ("Match bays in this section"):
 *  read it, but say nothing about it. */
export function quietNextAction() { if (watch) watch.quiet = true }

/** The button's words: "Copy to all sections · 7 copies". */
export const buttonText = (label, n) => `${label} · ${n} ${n === 1 ? 'copy' : 'copies'}`

const skipText = (plan) => [...plan.skipped, ...plan.held].map(s => `${cap(s.name)}: ${s.reason}`)
const warnText = (plan) => plan.warnings.map(s => `${cap(s.name)}: ${s.reason}`)
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

/** Write a plan into the store: rows, re-paired aisles, one history entry
 *  (`merge`: folded into the last entry instead — Always copy). */
function writePlan(store, plan, newId, merge) {
  const st = store.getState()
  const gone = plan.deletes
  const objects = rebuildAisles(applyPlan(st.objects, plan), newId).objects
  const groups = (st.groups || []).map(g => ({ ...g, ids: g.ids.filter(id => !gone.has(id)) })).filter(g => g.ids.length >= 2)
  const sel = {
    selectedIds: (st.selectedIds || []).filter(id => !gone.has(id)),
    activeBaySelection: (st.activeBaySelection || []).filter(e => !gone.has(e.objId)),
  }
  if (merge && st.historyIndex >= 0) {
    const history = st.history.slice(0, st.historyIndex + 1)
    history[history.length - 1] = JSON.stringify({ objects, groups })
    store.setState({ objects, groups, ...sel, history, historyIndex: history.length - 1 })
    try { autoSave(serializeScene(store.getState())) } catch { /* storage full */ }
  } else {
    store.setState({ objects, groups, ...sel })
    const anchor = objects.find(o => o.id === plan.change.fpId) || objects[0]
    if (anchor) store.getState().commitObjectUpdate(anchor.id, {})
  }
}

const planFor = (before, after, change, st) =>
  planCopy(before, after, change, st.gridSize || 40, watch.newId, { profile: getColumnCheckView().profile })

/** A note part for one change. */
function partFor(before, after, change, st) {
  const plan = planFor(before, after, change, st)
  if (!plan || (!plan.copies.length && !plan.skipped.length && !plan.held.length)) return null
  return { change, plan, button: copyButtonLabel(change), count: plan.copies.length, skipped: skipText(plan), warnings: warnText(plan) }
}

/** A note button: make that part's copies now, as their own undo step. The
 *  other part (a diagonal drag's) stays on offer. */
export function copyNow(i = 0) {
  if (!watch) return null
  const { offer } = useCopyPrompt.getState()
  if (!offer || !offer.parts || !offer.parts[i]) return null
  const st = watch.store.getState()
  const part = offer.parts[i]
  // planned again against the layout as it is now (the other part may have been copied since)
  const plan = planFor(offer.before, st.objects, part.change, st) || part.plan
  watch.busy = true
  try { writePlan(watch.store, plan, watch.newId, false) } finally { watch.busy = false }
  sync()
  const lines = skipText(plan)
  const rest = offer.parts.filter((_, k) => k !== i)
  const done = `Copied ${part.button.replace(/^Copy /, '')}: ${plan.copies.length} ${plan.copies.length === 1 ? 'copy' : 'copies'}`
  if (rest.length) {
    useCopyPrompt.setState({ offer: { ...offer, parts: rest, done: [...(offer.done || []), done] }, hover: null })
  } else {
    useCopyPrompt.setState({ offer: null, hover: null, report: lines.length || plan.warnings.length ? { text: done, skipped: lines, warnings: warnText(plan) } : null })
  }
  return plan
}

function sync() {
  const st = watch.store.getState()
  watch.lastObjects = st.objects
  watch.lastHistory = st.history
  watch.lastIndex = st.historyIndex
}

/** Read the action that just landed (the before layout -> now). */
function settle(before) {
  watch.pending = false
  const st = watch.store.getState()
  const after = st.objects
  const gridSize = st.gridSize || 40
  const quiet = watch.quiet
  watch.quiet = false
  let read = null
  try { read = quiet ? null : readChange(before, after, gridSize) } catch { read = null }
  sync()
  const clear = () => useCopyPrompt.setState({ offer: null, report: null, hover: null })
  if (!read) { clear(); return }
  if (read.blocked) {
    // a row change the note can't copy: said, never silent
    useCopyPrompt.setState({ offer: { text: read.blocked, blocked: true }, report: null, hover: null })
    return
  }
  const text = describeChange(read.changes, gridSize)
  if (useCopyPrompt.getState().alwaysCopy) {
    const lines = [], warns = [], done = []
    for (const change of read.changes) {
      let plan = null
      try { plan = planFor(before, watch.store.getState().objects, change, watch.store.getState()) } catch { plan = null }
      if (!plan || (!plan.copies.length && !plan.skipped.length && !plan.held.length)) continue
      watch.busy = true
      try { writePlan(watch.store, plan, watch.newId, true) } finally { watch.busy = false }
      sync()
      lines.push(...skipText(plan)); warns.push(...warnText(plan))
      done.push(`${copyButtonLabel(change).replace(/^Copy /, '')}: ${plan.copies.length} ${plan.copies.length === 1 ? 'copy' : 'copies'}`)
    }
    const notes = read.notes || []
    useCopyPrompt.setState({ offer: null, hover: null, report: lines.length || warns.length || notes.length ? { text: `${text} — copied ${done.join(', ')}`, skipped: [...notes, ...lines], warnings: warns } : null })
    return
  }
  let parts = []
  try { parts = read.changes.map(ch => partFor(before, after, ch, st)).filter(Boolean) } catch { parts = [] }
  if (!parts.length && !(read.notes || []).length) { clear(); return }
  useCopyPrompt.setState({ offer: { text, before, parts, notes: read.notes || [], done: [] }, report: null, hover: null })
}

/** Watch `store` for actions; returns the unsubscribe. */
export function installCopyWatcher(store, newId) {
  watch = { store, newId, lastObjects: null, lastHistory: null, lastIndex: -1, busy: false, pending: false }
  sync()
  const unsub = store.subscribe((st) => {
    if (!watch || watch.busy) return
    if (st.history !== watch.lastHistory) {
      /* a new history entry follows the one we last saw: an action. Anything
         else (a load, a new project, a restored autosave) replaced the
         history: start again from here. */
      const prevTop = watch.lastHistory && watch.lastIndex >= 0 ? watch.lastHistory[watch.lastIndex] : undefined
      const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
      watch.lastHistory = st.history
      watch.lastIndex = st.historyIndex
      if (!action && !watch.pending) { sync(); useCopyPrompt.setState({ offer: null, report: null, hover: null }); return }
      if (!watch.pending) {
        watch.pending = true
        const before = watch.lastObjects
        // one action may write twice (a move, then its new parent): read it once, when it has landed
        queueMicrotask(() => { if (watch && watch.store === store) settle(before) })
      }
      return
    }
    if (st.historyIndex !== watch.lastIndex) {
      // undo / redo: the note is about a layout that is no longer there
      sync()
      useCopyPrompt.setState({ offer: null, report: null, hover: null })
    }
  })
  return () => { unsub(); if (watch && watch.store === store) watch = null }
}

/** For tests: settle now instead of on the microtask. */
export const flushCopyWatcher = () => new Promise(r => queueMicrotask(r))
