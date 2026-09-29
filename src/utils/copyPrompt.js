// copyPrompt.js — copying row changes across sections: the pending bar, the
// question when the user moves on to another section, and "Always copy"
// (utils/sectionCopy.js keeps the pending set, utils/copyChange.js copies).
//
// Always copy OFF (the default):
//   - the user makes any number of changes in ONE section; nothing is copied
//     or locked meanwhile, and a bar at the bottom says "Section N: K changes
//     · Copy to other sections" (its tooltip lists them). Clicking copies
//     them — one undo step — and clears the set;
//   - an edit started on a row in a DIFFERENT section while copyable changes
//     are pending is stopped (drag start, Delete and placing are checked
//     before they happen; anything else is taken back the moment it lands)
//     and the user is asked "Copy your K changes from section N to the other
//     sections?" [Copy] [Don't copy]. Either way the set clears, and edits in
//     the new section start a new one;
//   - one action that changes rows in more than one section is not copied:
//     "This change affects rows in 2 sections, so it stays where you made it."
// Always copy ON (a top-bar switch, remembered in localStorage): each move
// across, add and delete is copied to every other section at once, folded
// into the action's own history entry — one Ctrl+Z undoes both. No set, no
// question.
// Bay changes and moves along a row are never copied to other sections.
//
// A new history entry that follows the one seen before is an action; the
// layout just before it and after it say what it touched. The watcher
// writes with setState and the protected store's commitObjectUpdate (one
// history entry), or folds a write into the current entry.

import { create } from 'zustand'
import { applyPlan, isRow } from './copyChange'
import { PENDING, sectionOf, startPending, pendingChanges, planPending, allPending, actionLines } from './sectionCopy'
import { rebuildAisles } from './aisleRebuild'
import { getColumnCheckView } from '../generate/columnCheckView'
import { autoSave, serializeScene } from './saveLoad'

const LS_KEY = 'trace.copyChange.always'
const readAlways = () => { try { return localStorage.getItem(LS_KEY) === '1' } catch { return false } }

/** The bar's state:
 *   `pending`  = { fpId, section, count, copyCount, lines } (the set), or null;
 *   `question` = { fpId, section, count } while the user is asked, or null;
 *   `message`  = a one-line notice (rows in several sections), or null;
 *   `report`   = what the last copy did (skips), or null;
 *   `hover`    = the Copy button is hovered (the canvas previews the copies). */
export const useCopyPrompt = create((set) => ({
  pending: null,
  question: null,
  message: null,
  report: null,
  hover: false,
  alwaysCopy: readAlways(),
  setHover: (hover) => set({ hover: !!hover }),
  setAlwaysCopy: (on) => {
    try { localStorage.setItem(LS_KEY, on ? '1' : '0') } catch { /* private window */ }
    set({ alwaysCopy: !!on })
  },
  dismissReport: () => set({ report: null, message: null }),
}))

export const multiSectionText = (n) => `This change affects rows in ${n} sections, so it stays where you made it.`
export const questionText = (q) => `Copy your ${q.count} change${q.count === 1 ? '' : 's'} from section ${q.section} to the other sections?`

let watch = null   // { store, newId, lastObjects, lastHistory, lastIndex, busy, pending }

const skipText = (plan) => [...plan.skipped, ...plan.held].map(s => `${cap(s.name)}: ${s.reason}`)
const warnText = (plan) => plan.warnings.map(s => `${cap(s.name)}: ${s.reason}`)
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)
const gs = () => watch.store.getState().gridSize || 40
const profile = () => { try { return getColumnCheckView().profile } catch { return undefined } }

function sync() {
  const st = watch.store.getState()
  watch.lastObjects = st.objects
  watch.lastHistory = st.history
  watch.lastIndex = st.historyIndex
}

/** Write into the store folded into the current history entry (no new undo
 *  step). */
function writeInPlace(patch) {
  const st = watch.store.getState()
  const objects = patch.objects || st.objects, groups = patch.groups || st.groups || []
  const full = { ...patch, objects, groups }
  if (st.historyIndex >= 0) {
    const history = st.history.slice(0, st.historyIndex + 1)
    history[history.length - 1] = JSON.stringify({ objects, groups })
    full.history = history
    full.historyIndex = history.length - 1
  }
  watch.busy = true
  try { watch.store.setState(full) } finally { watch.busy = false }
  try { autoSave(serializeScene(watch.store.getState())) } catch { /* storage full */ }
  sync()
}

/** The building's pending set replaced (null = cleared). */
const withPending = (objects, fpId, P) => objects.map(o => {
  if (o.id !== fpId) return o
  if (P) return { ...o, [PENDING]: P }
  const { [PENDING]: _gone, ...rest } = o
  return rest
})

/** The bar's "Match bays" source: the row of the LAST bay change in the set
 *  that still stands ({ id, rowIndex }), or null when the set has none. */
export function matchSource(objects, log) {
  for (let i = (log || []).length - 1; i >= 0; i--) {
    const l = log[i]
    if (!l.bays || !Array.isArray(l.ids)) continue
    const rack = l.ids.map(id => objects.find(o => o.id === id)).find(Boolean)
    if (rack) return { id: rack.id, rowIndex: l.rowIndex ?? rack.rowIndex ?? null }
  }
  return null
}

/** The bar, from the layout as it is now. */
function refresh() {
  const objects = watch.store.getState().objects
  const p = allPending(objects, gs()).filter(q => q.log.length > 0)[0] || null
  useCopyPrompt.setState({
    pending: p ? { fpId: p.fpId, section: p.section, count: p.log.length, copyCount: p.copy.length, lines: p.log.map(l => l.text), matchFrom: matchSource(objects, p.log) } : null,
  })
}

/** `objects` with a plan applied: rows, re-paired aisles; the groups and the
 *  selection without deleted racks. */
function applied(objects, plan) {
  const st = watch.store.getState()
  const gone = plan.deletes
  return {
    objects: rebuildAisles(applyPlan(objects, plan), watch.newId).objects,
    groups: (st.groups || []).map(g => ({ ...g, ids: g.ids.filter(id => !gone.has(id)) })).filter(g => g.ids.length >= 2),
    selectedIds: (st.selectedIds || []).filter(id => !gone.has(id)),
    activeBaySelection: (st.activeBaySelection || []).filter(e => !gone.has(e.objId)),
  }
}

const reportOf = (plan, lead) => {
  const lines = skipText(plan), warns = warnText(plan)
  return lines.length || warns.length ? { text: `${lead}: ${plan.copies.length} cop${plan.copies.length === 1 ? 'y' : 'ies'}`, skipped: lines, warnings: warns } : null
}

/** The copies the bar's button would make now, for the hover preview. */
export function pendingPlan() {
  if (!watch) return null
  const p = useCopyPrompt.getState().pending
  if (!p) return null
  try { return planPending(watch.store.getState().objects, p.fpId, gs(), () => 'preview', undefined) } catch { return null }
}

/** "Copy to other sections" (the bar's button, or the question's Copy): the
 *  pending set copied, as ONE undo step, and cleared. */
export function copyPending(fpId) {
  if (!watch) return null
  const st = watch.store.getState()
  const id = fpId || (useCopyPrompt.getState().question || {}).fpId || (useCopyPrompt.getState().pending || {}).fpId
  if (!id) return null
  const plan = planPending(st.objects, id, gs(), watch.newId, profile())
  const next = plan ? applied(st.objects, plan) : { objects: st.objects }
  next.objects = withPending(next.objects, id, null)
  watch.busy = true
  try {
    watch.store.setState(next)
    watch.store.getState().commitObjectUpdate(id, {})
  } finally { watch.busy = false }
  sync()
  useCopyPrompt.setState({ question: null, hover: false, message: null, report: plan ? reportOf(plan, `Copied from section ${plan.section}`) : null })
  refresh()
  return plan
}

/** The question's "Don't copy": the changes stay in their section; the set
 *  clears. */
export function dontCopy() {
  if (!watch) return
  const q = useCopyPrompt.getState().question
  const id = (q && q.fpId) || (useCopyPrompt.getState().pending || {}).fpId
  if (id) writeInPlace({ objects: withPending(watch.store.getState().objects, id, null) })
  useCopyPrompt.setState({ question: null, hover: false })
  refresh()
}

/** Before an edit on `racks` (rack objects or ids): true if it may go
 *  ahead; false — with the question asked — when copyable changes are
 *  pending in another section of the same building. */
export function guardEdit(racks) {
  if (!watch || useCopyPrompt.getState().alwaysCopy) return true
  const st = watch.store.getState()
  for (const r of racks || []) {
    const rack = typeof r === 'string' ? st.objects.find(o => o.id === r) : r
    if (!rack || !isRow(rack) || !rack.parentId) continue
    const fp = st.objects.find(o => o.id === rack.parentId)
    const ch = fp ? pendingChanges(st.objects, fp, gs()) : null
    if (!ch || !ch.copy.length) continue
    const inStore = st.objects.some(o => o.id === rack.id)
    const s = sectionOf(inStore ? st.objects : [...st.objects, rack], rack)
    if (s != null && s !== ch.section) {
      useCopyPrompt.setState({ question: { fpId: fp.id, section: ch.section, count: logCount(fp) } })
      return false
    }
  }
  return true
}

/** What one action touched: { fpId, sections, generated } for the rows of
 *  one building it changed, or null (not a row, the building itself moved). */
function touched(before, after) {
  const B = new Map(before.filter(isRow).map(o => [o.id, o])), A = new Map(after.filter(isRow).map(o => [o.id, o]))
  const sig = (o) => JSON.stringify([o.x, o.y, o.width, o.height, o.rotation || 0, o.beams, o.uprightWidth, o.flueSpaceIn])
  const removed = [...B.values()].filter(o => !A.has(o.id))
  const added = [...A.values()].filter(o => !B.has(o.id))
  const changed = [...A.values()].filter(o => B.has(o.id) && sig(B.get(o.id)) !== sig(o))
  if (!removed.length && !added.length && !changed.length) return null
  const fps = new Set([...removed, ...added, ...changed].map(o => o.parentId).filter(Boolean))
  if (fps.size !== 1) return null
  const fpId = [...fps][0]
  const fp = after.find(o => o.id === fpId), fpB = before.find(o => o.id === fpId)
  if (!fp || !fpB) return null
  const geo = (o) => JSON.stringify([o.x, o.y, o.width, o.height, o.rotation || 0, o.fpVerts || null])
  if (geo(fp) !== geo(fpB)) return null                                    // the building moved: its rows ride along
  const generated = (added.length && !changed.length && added.every(o => o.genSection != null && !o.pieceOf))
    || (removed.length && !added.length && !after.some(o => isRow(o) && o.parentId === fpId))
  const secs = new Set([...removed.map(o => sectionOf(before, o)), ...added.map(o => sectionOf(after, o)), ...changed.map(o => sectionOf(after, o))].filter(s => s != null))
  return { fpId, sections: [...secs], generated: !!generated }
}

/** Take back the action that just landed (an edit in another section while
 *  changes were pending) and ask. */
function stopAndAsk(fpId, ch) {
  const st = watch.store.getState()
  if (st.historyIndex > 0) {
    const snap = JSON.parse(st.history[st.historyIndex - 1])
    watch.busy = true
    try { watch.store.setState({ objects: snap.objects, groups: snap.groups || st.groups, history: st.history.slice(0, st.historyIndex), historyIndex: st.historyIndex - 1 }) } finally { watch.busy = false }
    sync()
  }
  const fp = watch.store.getState().objects.find(o => o.id === fpId)
  useCopyPrompt.setState({ question: { fpId, section: ch.section, count: logCount(fp) } })
  refresh()
}
const logCount = (fp) => ((fp && fp[PENDING] && fp[PENDING].log) || []).length

/** Read the action that just landed. */
function settle(before) {
  watch.pending = false
  const st = watch.store.getState()
  const after = st.objects
  const t = touched(before, after)
  sync()
  if (!t) { refresh(); return }
  const fp = after.find(o => o.id === t.fpId)
  if (t.generated) {
    // a (re)generated layout: nothing is pending any more
    if (fp && fp[PENDING]) writeInPlace({ objects: withPending(after, t.fpId, null) })
    useCopyPrompt.setState({ question: null, message: null, report: null })
    refresh()
    return
  }
  const always = useCopyPrompt.getState().alwaysCopy
  const ch = fp ? pendingChanges(after, fp, gs()) : null
  // an edit in another section while copyable changes are pending: stop it, ask
  if (!always && ch && ch.copy.length && t.sections.some(s => s !== ch.section)) { stopAndAsk(t.fpId, ch); return }
  if (t.sections.length > 1) {
    useCopyPrompt.setState({ message: multiSectionText(t.sections.length), report: null })
    refresh()
    return
  }
  const section = t.sections[0]
  if (section == null) { refresh(); return }
  if (always) {
    // copied at once, folded into the action's own history entry
    const objs = withPending(after, t.fpId, startPending(before, t.fpId, section))
    const plan = planPending(objs, t.fpId, gs(), watch.newId, profile())
    if (plan) {
      const next = applied(objs, plan)
      writeInPlace({ ...next, objects: withPending(next.objects, t.fpId, null) })
      useCopyPrompt.setState({ report: reportOf(plan, `Copied from section ${section}`), message: null })
    } else if (fp && fp[PENDING]) writeInPlace({ objects: withPending(after, t.fpId, null) })
    refresh()
    return
  }
  // this action's lines join the set here; a new set starts when there is none, it is empty, or it
  // held only changes that stay in their own section (another section's)
  const lines = actionLines(before, after, t.fpId, section, gs())
  const cur = fp[PENDING]
  const P = cur && ch && ch.section === section && (cur.log || []).length ? cur : startPending(before, t.fpId, section)
  writeInPlace({ objects: withPending(after, t.fpId, { ...P, log: [...(P.log || []), ...lines] }) })
  useCopyPrompt.setState({ message: null })
  refresh()
}

/** Watch `store` for actions; returns the unsubscribe. */
export function installCopyWatcher(store, newId) {
  watch = { store, newId, lastObjects: null, lastHistory: null, lastIndex: -1, busy: false, pending: false }
  sync()
  refresh()
  const unsub = store.subscribe((st) => {
    if (!watch || watch.busy) return
    if (st.history !== watch.lastHistory) {
      /* a new history entry that follows the one seen before: an action.
         Anything else (a load, a new project, a restored autosave) replaced
         the history: start again from here (a saved set comes back). */
      const prevTop = watch.lastHistory && watch.lastIndex >= 0 ? watch.lastHistory[watch.lastIndex] : undefined
      const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
      watch.lastHistory = st.history
      watch.lastIndex = st.historyIndex
      if (!action && !watch.pending) { sync(); useCopyPrompt.setState({ question: null, message: null, report: null }); refresh(); return }
      if (!watch.pending) {
        watch.pending = true
        const before = watch.lastObjects
        // one action may write twice (a move, then its new parent): read it once, when it has landed
        queueMicrotask(() => { if (watch && watch.store === store) settle(before) })
      }
      return
    }
    if (st.historyIndex !== watch.lastIndex) {
      // undo / redo: the set is whatever the building carried at that step
      sync()
      useCopyPrompt.setState({ question: null, message: null })
      refresh()
    }
  })
  return () => { unsub(); if (watch && watch.store === store) watch = null }
}

/** For tests: settle now instead of on the microtask. */
export const flushCopyWatcher = () => new Promise(r => queueMicrotask(r))
