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
import { PENDING, sectionOf, startPending, pendingChanges, planPending, allPending, actionLines, sectionLabel, generatedSectionCount, rebaseAfterMatch } from './sectionCopy'
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
export const questionText = (q) => `Copy your ${q.count} change${q.count === 1 ? '' : 's'} from section ${sectionLabel(q.section)} to the other sections?`

/** The copy of building `fpId`'s pending set, only when it would really do
 *  something: the building has at least two generated sections AND the plan
 *  copies (or deletes) at least one row. Otherwise null — and then no bar,
 *  no buttons and no question (a layout placed by hand, everything deleted,
 *  changes that stay in their section). Never throws. */
export function copyablePlan(objects, fpId, gridSize = 40, newId = () => 'preview', prof) {
  if (!fpId || generatedSectionCount(objects, fpId) < 2) return null
  let plan = null
  try { plan = planPending(objects, fpId, gridSize, newId, prof) } catch { return null }
  return plan && plan.copies.length > 0 ? plan : null
}

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
    history[history.length - 1] = JSON.stringify({ objects, groups, layers: st.layers })
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
 *  that is still a bay change now ({ id, rowIndex }), or null. `stays` is the
 *  set's net changes that stay (pendingChanges): a row whose bays Match bays
 *  has since resolved is no longer a source. Match bays never adds to the log,
 *  so the source stays the row the user changed, not the last row matched. */
export function matchSource(objects, log, stays = null) {
  const open = stays ? new Set(stays.filter(s => s.bays).flatMap(s => s.ids || [])) : null
  for (let i = (log || []).length - 1; i >= 0; i--) {
    const l = log[i]
    if (!l.bays || !Array.isArray(l.ids)) continue
    const rack = l.ids.map(id => objects.find(o => o.id === id)).find(o => o && (!open || open.has(o.id)))
    if (rack) return { id: rack.id, rowIndex: l.rowIndex ?? rack.rowIndex ?? null }
  }
  return null
}

/** The bar, from the layout as it is now. */
function refresh() {
  const objects = watch.store.getState().objects
  /* The bar when copying would really do something (copyablePlan), or a bay
     change could be matched across the section (its Match bays button). The
     counts are NET: what differs from the section as it was (the same row
     moved twice is one change). */
  let bar = null
  for (const q of allPending(objects, gs())) {
    if (!q.count) continue
    const copyable = !!copyablePlan(objects, q.fpId, gs())
    const matchFrom = matchSource(objects, q.log, q.stays)
    if (!copyable && !matchFrom) continue
    bar = { fpId: q.fpId, section: q.section, count: q.count, copyCount: copyable ? q.copy.length : 0, copyable,
      lines: [...q.copy.map(c => c.text), ...q.stays.map(s => s.text)], matchFrom }
    break
  }
  useCopyPrompt.setState({ pending: bar })
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

/** "Match bays in this section" (the right panel or the bar): its result for
 *  the bar — "Matched bays on 6 rows in section 3 from row 5", any warnings
 *  under it. `r` is applySectionSync's { synced, split }, `warn` its warnings
 *  as one line (or null). */
export function matchReport(r, section, rowIndex, warn) {
  const split = r.split && r.split.length ? `, ${r.split.length} piece${r.split.length > 1 ? 's' : ''} of split rows left as is` : ''
  return {
    // a row placed by hand has no row number: no "from row"
    text: `Matched bays on ${r.synced} row${r.synced === 1 ? '' : 's'} in section ${sectionLabel(section)}${rowIndex != null ? ` from row ${rowIndex}` : ''}${split}`,
    skipped: [], warnings: warn ? [warn] : [],
  }
}

/** Show `report` in the bar until the NEXT action. When the action that
 *  produced it is still settling (the watcher reads it on a microtask), it is
 *  shown once that action has settled — so it outlives its own action. */
export function showAfterAction(report) {
  if (watch && watch.pending) watch.nextReport = report
  else useCopyPrompt.setState({ report, message: null })
}

/** What a copy did, for the bar: "Copied 7 rows" — always, so the button
 *  visibly answers — with anything not copied and any warnings under it. */
const reportOf = (plan) => {
  const n = plan.copies.length
  return { text: `Copied ${n} row${n === 1 ? '' : 's'}`, skipped: skipText(plan), warnings: warnText(plan) }
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
  const asked = !!useCopyPrompt.getState().question
  const st = watch.store.getState()
  const id = fpId || (useCopyPrompt.getState().question || {}).fpId || (useCopyPrompt.getState().pending || {}).fpId
  // whatever happens below, the question closes: the button always does something
  if (!id) { useCopyPrompt.setState({ question: null, hover: false }); refresh(); resumeAfterAnswer(asked); return null }
  const plan = copyablePlan(st.objects, id, gs(), watch.newId, profile())
  try {
    const next = plan ? applied(st.objects, plan) : { objects: st.objects }
    next.objects = withPending(next.objects, id, null)
    watch.busy = true
    try {
      watch.store.setState(next)
      watch.store.getState().commitObjectUpdate(id, {})
    } finally { watch.busy = false }
    sync()
  } finally {
    useCopyPrompt.setState({ question: null, hover: false, message: null, report: plan ? reportOf(plan) : null })
    refresh()
    resumeAfterAnswer(asked)
  }
  return plan
}

/** Mark the next action as "Match bays" (the panel's or the bar's): a finished
 *  action, not pending work — its matched rows are not added to the set, and
 *  the bay changes it resolved stop counting (utils/sectionCopy.js
 *  rebaseAfterMatch). */
export function beginMatch() { if (watch) watch.matchNext = true }

/** After the question is answered: the edit that raised it is completed — a
 *  Delete or a placement run again, a panel change re-applied — or, for a
 *  drag, "Drag cancelled — drag again". A result shown by the answer (Copied
 *  7 rows) outlives that edit. */
function resumeAfterAnswer(asked) {
  if (!watch) return
  const resume = watch.resume, drag = watch.resumeDrag
  watch.resume = null; watch.resumeDrag = false
  // only for the question just answered: the bar's own Copy finishes nothing
  if (!asked) return
  if (drag) { useCopyPrompt.setState({ message: 'Drag cancelled — drag again.' }); return }
  if (!resume) return
  const keep = useCopyPrompt.getState().report
  try { resume() } finally { if (keep && watch.pending) watch.nextReport = keep }
}

/** The question's "Don't copy": the changes stay in their section; the set
 *  clears. */
export function dontCopy() {
  if (!watch) return
  const q = useCopyPrompt.getState().question, asked = !!q
  const id = (q && q.fpId) || (useCopyPrompt.getState().pending || {}).fpId
  try {
    if (id) writeInPlace({ objects: withPending(watch.store.getState().objects, id, null) })
  } finally {
    useCopyPrompt.setState({ question: null, hover: false })
    refresh()
    resumeAfterAnswer(asked)
  }
}

/** Before an edit on `racks` (rack objects or ids): true if it may go
 *  ahead; false — with the question asked — when copyable changes are
 *  pending in another section of the same building. */
export function guardEdit(racks, { resume = null, drag = false } = {}) {
  if (!watch || useCopyPrompt.getState().alwaysCopy) return true
  const st = watch.store.getState()
  // the rows the edit touches, per building, with their sections
  const byFp = new Map()
  for (const r of racks || []) {
    const rack = typeof r === 'string' ? st.objects.find(o => o.id === r) : r
    if (!rack || !isRow(rack) || !rack.parentId) continue
    const inStore = st.objects.some(o => o.id === rack.id)
    const s = sectionOf(inStore ? st.objects : [...st.objects, rack], rack)
    if (s == null) continue
    if (!byFp.has(rack.parentId)) byFp.set(rack.parentId, new Set())
    byFp.get(rack.parentId).add(s)
  }
  for (const [fpId, secs] of byFp) {
    // an edit across several sections (select all + Delete) is never copied, so nothing to ask
    if (secs.size !== 1) continue
    const fp = st.objects.find(o => o.id === fpId)
    const ch = fp ? pendingChanges(st.objects, fp, gs()) : null
    if (!ch || [...secs][0] === ch.section) continue
    if (!copyablePlan(st.objects, fpId, gs())) continue
    // how to finish this edit once the question is answered (resumeAfterAnswer)
    watch.resume = typeof resume === 'function' ? resume : null
    watch.resumeDrag = !!drag
    useCopyPrompt.setState({ question: { fpId, section: ch.section, count: netCount(st.objects, fp) } })
    return false
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
function stopAndAsk(fpId, ch, before, after, wasMatch) {
  const st = watch.store.getState()
  // the edit, to re-apply once the question is answered
  const patch = rowPatch(before, after)
  watch.resume = () => reapply(patch, wasMatch)
  watch.resumeDrag = false
  if (st.historyIndex > 0) {
    const snap = JSON.parse(st.history[st.historyIndex - 1])
    watch.busy = true
    try { watch.store.setState({ objects: snap.objects, groups: snap.groups || st.groups, history: st.history.slice(0, st.historyIndex), historyIndex: st.historyIndex - 1 }) } finally { watch.busy = false }
    sync()
  }
  const now = watch.store.getState().objects, fp = now.find(o => o.id === fpId)
  useCopyPrompt.setState({ question: { fpId, section: ch.section, count: netCount(now, fp) } })
  refresh()
}
/** The set's NET change count (the same row moved twice is one change). */
const netCount = (objects, fp) => { const ch = fp ? pendingChanges(objects, fp, gs()) : null; return ch ? ch.count : 0 }

/** What one action did to the rows: removed ids, added racks, and per changed
 *  rack only the fields it changed — so re-applying it after a copy keeps
 *  whatever the copy did to the same rack's other fields. */
function rowPatch(before, after) {
  const B = new Map(before.filter(isRow).map(o => [o.id, o])), A = new Map(after.filter(isRow).map(o => [o.id, o]))
  const removed = [...B.keys()].filter(id => !A.has(id))
  const added = [...A.values()].filter(o => !B.has(o.id))
  const changed = []
  for (const [id, a] of A) {
    const b = B.get(id)
    if (!b) continue
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    if (keys.length) changed.push([id, Object.fromEntries(keys.map(k => [k, a[k]]))])
  }
  return { removed, added, changed }
}

/** Re-apply a taken-back edit as a new action (one history entry). */
function reapply(patch, wasMatch) {
  const st = watch.store.getState()
  const gone = new Set(patch.removed), ch = new Map(patch.changed)
  const objects = st.objects.filter(o => !gone.has(o.id)).map(o => (ch.has(o.id) ? { ...o, ...ch.get(o.id) } : o))
    .concat(patch.added.filter(a => !st.objects.some(o => o.id === a.id)))
  const anchor = patch.changed[0]?.[0] || patch.added[0]?.id || objects.find(o => o.type && o.type.startsWith('fp_'))?.id
  if (wasMatch) watch.matchNext = true
  watch.store.setState({ objects })
  if (anchor) watch.store.getState().commitObjectUpdate(anchor, {})
}

/** Read the action that just landed. */
function settle(before) {
  watch.pending = false
  const st = watch.store.getState()
  const after = st.objects
  const t = touched(before, after)
  sync()
  // a result shown in the bar lasts until the next action; one held for THIS action shows now
  const carry = watch.nextReport || null
  watch.nextReport = null
  useCopyPrompt.setState({ report: carry, ...(carry ? { message: null } : {}) })
  if (!t) { refresh(); return }
  const fp = after.find(o => o.id === t.fpId)
  const wasMatch = !!watch.matchNext
  watch.matchNext = false
  if (t.generated) {
    // a (re)generated layout: nothing is pending any more
    if (fp && fp[PENDING]) writeInPlace({ objects: withPending(after, t.fpId, null) })
    useCopyPrompt.setState({ question: null, message: null, report: carry })
    refresh()
    return
  }
  const always = useCopyPrompt.getState().alwaysCopy
  const ch = fp ? pendingChanges(after, fp, gs()) : null
  // an edit in another section while copyable changes are pending: stop it, ask
  if (!always && ch && t.sections.length === 1 && t.sections[0] !== ch.section && copyablePlan(after, t.fpId, gs())) { stopAndAsk(t.fpId, ch, before, after, wasMatch); return }
  // Match bays: a finished action — nothing joins the set; the bay changes it resolved stop counting
  if (wasMatch) {
    if (fp && fp[PENDING] && ch && ch.section === t.sections[0]) writeInPlace({ objects: withPending(after, t.fpId, rebaseAfterMatch(fp[PENDING], after, gs())) })
    refresh()
    return
  }
  if (t.sections.length > 1) {
    // only where copying exists at all: a layout placed by hand gets no notice
    if (generatedSectionCount(after, t.fpId) >= 2) useCopyPrompt.setState({ message: multiSectionText(t.sections.length), report: carry })
    refresh()
    return
  }
  const section = t.sections[0]
  if (section == null) { refresh(); return }
  if (always) {
    // copied at once, folded into the action's own history entry
    const objs = withPending(after, t.fpId, startPending(before, t.fpId, section))
    const plan = copyablePlan(objs, t.fpId, gs(), watch.newId, profile())
    if (plan) {
      const next = applied(objs, plan)
      writeInPlace({ ...next, objects: withPending(next.objects, t.fpId, null) })
      useCopyPrompt.setState({ report: reportOf(plan), message: null })
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
  watch = { store, newId, lastObjects: null, lastHistory: null, lastIndex: -1, busy: false, pending: false, nextReport: null, matchNext: false, resume: null, resumeDrag: false }
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
      // undo / redo: the set is whatever the building carried at that step; a shown result is over
      sync()
      watch.resume = null; watch.resumeDrag = false
      useCopyPrompt.setState({ question: null, message: null, report: null })
      refresh()
    }
  })
  return () => { unsub(); if (watch && watch.store === store) watch = null }
}

/** For tests: settle now instead of on the microtask. */
export const flushCopyWatcher = () => new Promise(r => queueMicrotask(r))
