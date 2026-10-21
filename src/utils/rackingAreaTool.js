// rackingAreaTool.js — racking areas and zones in the running app: the one
// place their store writes happen (the pure planning is generate/rackingArea.js).
//
//   - An area's box never goes past a wall: an edge dragged out stops at the
//     wall's inner face (utils/floorClamp.js; the canvas clamps it live too).
//   - An area's edge dragged (canvas2 calls finishAreaResize on release) and
//     an area's settings changed (the right panel calls requestAreaRebuild)
//     each land as ONE history entry: the area's new box or settings and the
//     racks trimmed / filled / rebuilt with it.
//   - When the area has hand edits, the change waits for an answer first:
//     "You've changed racks in this area. …" [Continue] [Cancel]. Cancel
//     leaves everything as it was.
//   - A zone placed, moved, resized or deleted (any way at all — the left
//     panel, a drag, a resize, a nudge, a paste) is caught after the fact by
//     the area keeper and taken back, then landed with its consequences as ONE
//     history entry (utils/zoneCut.js applyZones): only the bays its footprint
//     covers go (a pair's half it covers goes, the other half stays a single
//     row), a piece shorter than two bays left beside it goes too, and every
//     bay a zone no longer covers comes back exactly as it was — moved off,
//     shrunk, deleted. A face the zone leaves without an aisle is a warning
//     (Check layout, the plan), never a delete. Any rack: Generate's, a Fill
//     area's, hand-placed. The bar notes it: "Office moved · 13 bays removed ·
//     9 restored".
//   - A racking area deleted (any way — Delete, the panel's bin, a cut) while
//     its racks are still there: taken back the same way, and asked "Delete
//     the racks in this area too?" [Keep racks] [Delete racks]; either answer
//     puts the delete back as one history entry.
// The Row group watcher is told these are the app's own actions, not row edits
// (rowGroupTool.skipNextAction): the Row group passes it over.

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { planAreaResize, planAreaRebuild, areaEdits, areaSettings, removedRowBays, isArea, isZone, boxOf } from '../generate/rackingArea'
import { applyZones } from './zoneCut'
import { skipNextAction } from './rowGroupTool'
import { rebuildAisles } from './aisleRebuild'
import { floorFor, clampGrowth } from './floorClamp'

export const EDIT_WARNING = "You've changed racks in this area. The new part will use the default settings; your changes stay as they are."

/** The open question: { text, run } — run() is what Continue does — or
 *  { text, choices: [{ label, run }] } for a question with its own answers. */
export const useAreaPrompt = create(() => ({ question: null, note: null }))
/** The bar's note after a zone change ("Office placed · 12 bays removed"); ✕ or the next change clears it. */
export const dismissAreaNote = () => useAreaPrompt.setState({ note: null })

const sameBox = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6

/** Write `objects` as ONE history entry (anchored on `id`, which must exist). */
function commitAll(store, objects, id) {
  const anchor = objects.find(o => o.id === id) ? id : (objects.find(o => isArea(o) || isZone(o)) || objects[0] || {}).id
  skipNextAction()
  store.setState({ objects: rebuildAisles(objects, nanoid).objects })
  if (anchor) store.getState().commitObjectUpdate(anchor, {})
}

/** Ask, or go ahead at once when there is nothing to ask. */
function askOr(text, run) {
  if (!text) { run(); return true }
  useAreaPrompt.setState({ question: { text, run } })
  return false
}

/** Continue / Cancel on the open question. */
export function answerArea(go) {
  const q = useAreaPrompt.getState().question
  useAreaPrompt.setState({ question: null })
  if (go && q && q.run) q.run()
}

/** One of the open question's own answers (`choices[i]`). */
export function answerChoice(i) {
  const q = useAreaPrompt.getState().question
  useAreaPrompt.setState({ question: null })
  const c = q && q.choices && q.choices[i]
  if (c) c.run()
}

export const DELETE_AREA_TEXT = 'Delete the racks in this area too?'

/** An area's edge was dragged to where it is now; `oldBox` is where it was.
 *  The area goes back to `oldBox` at once (the drag wrote no history), then
 *  the resize lands as one entry — after the warning, if it has hand edits. */
export function finishAreaResize(store, areaId, oldBox, { gridSize } = {}) {
  const st = store.getState()
  const area = st.objects.find(o => o.id === areaId)
  if (!area) return false
  const gs = gridSize || st.gridSize || 40
  // kept inside the building: an edge dragged past a wall stops at its inner face (utils/floorClamp.js)
  const poly = floorFor(st.objects, area, gs)
  const newBox = poly ? clampGrowth(poly, oldBox, boxOf(area)) : boxOf(area)
  // back to where it was, with no history: the resize itself is the one entry
  const before = st.objects.map(o => (o.id === areaId ? { ...o, x: oldBox.x, y: oldBox.y, width: oldBox.w, height: oldBox.h } : o))
  store.setState({ objects: before })
  if (sameBox(newBox, oldBox)) return false
  const run = () => {
    const now = store.getState().objects
    const next = planAreaResize(now, areaId, newBox, { gridSize: gs, newId: nanoid })
    if (next) commitAll(store, next, areaId)
  }
  return askOr(areaEdits(before, area).count ? EDIT_WARNING : null, run)
}

/** An area's settings changed in the right panel: rebuild the whole area with
 *  them, as one entry — after the warning, if it has hand edits. */
export function requestAreaRebuild(store, areaId, settings, { gridSize } = {}) {
  const st = store.getState()
  const area = st.objects.find(o => o.id === areaId)
  if (!area) return false
  const gs = gridSize || st.gridSize || 40
  const run = () => {
    const next = planAreaRebuild(store.getState().objects, areaId, settings, { gridSize: gs, newId: nanoid, elevations: store.getState().elevations })
    if (next) commitAll(store, next, areaId)
  }
  return askOr(areaEdits(st.objects, area).count ? EDIT_WARNING : null, run)
}

const zb = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
const isRackObj = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
/** A zone change landed (utils/zoneCut.js applyZones): every rack worked out again from what it was before any zone
 *  cut it, against the zones as they are now. `before`: the layout before the change (its zones tell a cut rack
 *  edited by hand since from one simply waiting; a zone it deleted hands back what it covered — unless the same
 *  action deleted racks too: a bulk delete brings nothing back). The keeper commits it; the resize preview draws
 *  what it removes (zonePreview) — the same function, so they cannot disagree. */
export function landZones(objects, before = [], { gridSize = 40, newId = nanoid } = {}) {
  const ids = new Set(objects.map(o => o.id))
  const droppedZones = before.filter(o => isZone(o) && !ids.has(o.id))
  const bulk = before.some(o => isRackObj(o) && !ids.has(o.id))
  return applyZones(objects, {
    gridSize, newId,
    prevZones: before.filter(isZone).map(zb),
    extraBases: bulk ? [] : droppedZones.flatMap(z => z.cutRacks || []),
  })
}
/** While zone `zoneId` is resized: the bays (per row) it will remove on release, as world px boxes. */
export function zonePreview(objects, zoneId, was, { gridSize = 40 } = {}) {
  const z = objects.find(o => o.id === zoneId)
  if (!z) return []
  let n = 0
  const before = objects.map(o => (o.id === zoneId && was ? { ...o, ...was } : o))
  return removedRowBays(objects, landZones(objects, before, { gridSize, newId: () => 'preview' + (++n) }).objects, gridSize)
}

/** The bar's note for zone `z`: placed / resized / moved / deleted, and the bays (per row) the change removed and
 *  brought back — "Office moved · 13 bays removed · 9 restored". */
export const zoneNote = (z, was, removed, restored = 0, deleted = false) => {
  const how = deleted ? 'deleted' : !was ? 'placed' : (Math.abs(was.width - z.width) > 1e-6 || Math.abs(was.height - z.height) > 1e-6) ? 'resized' : 'moved'
  const n = (k) => `${k} bay${k === 1 ? '' : 's'}`
  return `${z.label || 'Zone'} ${how}${removed > 0 ? ` · ${n(removed)} removed` : ''}${restored > 0 ? ` · ${restored} restored` : ''}`
}

/** Zones placed / moved / resized / deleted, and racking areas deleted with their racks still
 *  there: take the action back, then
 *    - land the zone change with its consequences (landZones → zoneCut.js applyZones) as ONE
 *      history entry — covered bays go, uncovered ones come back — and the bar notes it
 *      ("Office moved · 13 bays removed · 9 restored");
 *    - a deleted area with its racks asks "Delete the racks in this area too?".
 *  Returns the unsubscribe. */
export function installAreaKeeper(store) {
  let lastHistory = store.getState().history, lastIndex = store.getState().historyIndex, lastObjects = store.getState().objects, busy = false
  const geo = (o) => (o ? [o.x, o.y, o.width, o.height].join(',') : '')
  const check = (st) => {
    if (busy) return
    if (st.history === lastHistory && st.historyIndex === lastIndex) { lastObjects = st.objects; return }
    const prevTop = lastIndex >= 0 && lastHistory ? lastHistory[lastIndex] : undefined
    const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
    /* "before" is the last COMMITTED state (the history entry the action follows), not the last write
       seen: an action that writes its objects first and its history entry second (a placement, a
       paste, a fill) would otherwise already be in "before" and look like no change at all */
    let before = lastObjects
    try { if (action) before = JSON.parse(prevTop).objects || lastObjects } catch { /* keep the last write */ }
    lastHistory = st.history; lastIndex = st.historyIndex; lastObjects = st.objects
    // the layout replaced outright (a file opened, a fresh start) or undone: the bar's last note no longer applies
    if (!action || !before) { if (useAreaPrompt.getState().note) useAreaPrompt.setState({ note: null }); return }
    const B = new Map(before.map(o => [o.id, o]))
    const gs = st.gridSize || 40
    const afterIds = new Set(st.objects.map(o => o.id))
    // zones placed, moved or resized (and deleted): where they are now, and where they were
    const moved = st.objects.filter(o => isZone(o) && geo(o) !== geo(B.get(o.id)))
    const dropped = before.filter(o => isZone(o) && !afterIds.has(o.id))
    // racking areas this action deleted whose racks are still there
    const gone = before.filter(o => isArea(o) && !afterIds.has(o.id)).map(o => o.id)
    const orphaned = new Set(gone.filter(id => st.objects.some(o => o.areaId === id)))
    // does the zone change cut or bring back anything? (zoneCut.js: probed, not committed)
    const zoneChange = moved.length > 0 || dropped.length > 0
    const probe = zoneChange ? landZones(st.objects, before, { gridSize: gs, newId: () => 'probe' }).changed : false
    if (useAreaPrompt.getState().note) useAreaPrompt.setState({ note: null })
    const one = moved.length + dropped.length === 1 ? (moved[0] || dropped[0]) : null
    if (!probe && !orphaned.size) { if (one) useAreaPrompt.setState({ note: zoneNote(one, B.get(one.id), 0, 0, !moved.length) }); return }
    // take the action back (its entry dropped), then land it with its consequences at once (or ask, for an area deleted)
    const after = st.objects
    queueMicrotask(() => {
      const now = store.getState()
      if (now.history !== lastHistory) return                      // something else happened first
      const snap = JSON.parse(now.history[now.historyIndex - 1])
      busy = true
      try { store.setState({ objects: snap.objects, groups: snap.groups || now.groups, history: now.history.slice(0, now.historyIndex), historyIndex: now.historyIndex - 1 }) } finally { busy = false }
      const cur = store.getState()
      lastHistory = cur.history; lastIndex = cur.historyIndex; lastObjects = cur.objects
      if (orphaned.size) {
        const anchor = (after.find(o => o.parentId && !o.areaId) || after.find(o => !o.areaId) || after[0] || {}).id
        useAreaPrompt.setState({
          question: {
            text: DELETE_AREA_TEXT,
            choices: [
              // the racks stay, no longer part of an area
              { label: 'Keep racks', run: () => commitAll(store, after.map(o => (o.areaId && orphaned.has(o.areaId) ? (({ areaId, ...rest }) => rest)(o) : o)), anchor) },
              { label: 'Delete racks', run: () => commitAll(store, after.filter(o => !(o.areaId && orphaned.has(o.areaId))), anchor) },
            ],
          },
        })
        return
      }
      /* the zone change with its consequences, as one entry, at once (zoneCut.js applyZones) */
      const land = () => {
        const objs = landZones(after, before, { gridSize: gs, newId: nanoid }).objects
        const anchor = (moved[0] || objs.find(o => isZone(o)) || objs.find(o => isArea(o)) || {}).id
        // written while this keeper looks away: it is the zone change's own result, not a new one
        busy = true
        try { commitAll(store, objs, anchor) } finally { busy = false }
        const c = store.getState()
        lastHistory = c.history; lastIndex = c.historyIndex; lastObjects = c.objects
        if (one) useAreaPrompt.setState({ note: zoneNote(one, B.get(one.id), removedRowBays(before, c.objects, gs).length, removedRowBays(c.objects, before, gs).length, !moved.length) })
      }
      land()
    })
  }
  return store.subscribe(check)
}
