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
//   - A zone placed, moved or resized over racks (any way at all — the left
//     panel, a drag, a resize, a nudge, a paste) is caught after the fact by
//     the area keeper: the action is taken back and a question asks; Continue
//     puts it back with the racks under the zone removed or trimmed, as one
//     history entry.
//   - A racking area deleted (any way — Delete, the panel's bin, a cut) while
//     its racks are still there: taken back the same way, and asked "Delete
//     the racks in this area too?" [Keep racks] [Delete racks]; either answer
//     puts the delete back as one history entry.
// The copy watcher is told these are the app's own actions, not row edits
// (copyPrompt.skipNextAction): nothing joins the copy-to-sections set.

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { planAreaResize, planAreaRebuild, areaEdits, racksUnderZone, clearZone, isArea, isZone, boxOf } from '../generate/rackingArea'
import { skipNextAction } from './copyPrompt'
import { rebuildAisles } from './aisleRebuild'
import { floorFor, clampGrowth } from './floorClamp'

export const EDIT_WARNING = "You've changed racks in this area. The new part will use the default settings; your changes stay as they are."

/** The open question: { text, run } — run() is what Continue does — or
 *  { text, choices: [{ label, run }] } for a question with its own answers. */
export const useAreaPrompt = create(() => ({ question: null }))

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
    const next = planAreaRebuild(store.getState().objects, areaId, settings, { gridSize: gs, newId: nanoid })
    if (next) commitAll(store, next, areaId)
  }
  return askOr(areaEdits(st.objects, area).count ? EDIT_WARNING : null, run)
}

const zoneText = (zone, n) => `This ${(zone.label || 'zone').toLowerCase()} covers ${n} rack${n === 1 ? '' : 's'}. Racks under it will be removed or trimmed to the bays outside it.`

/** Zones placed / moved / resized over racks, and racking areas deleted with
 *  their racks still there: take the action back and ask (see the file
 *  comment). Returns the unsubscribe. */
export function installAreaKeeper(store) {
  let lastHistory = store.getState().history, lastIndex = store.getState().historyIndex, lastObjects = store.getState().objects, busy = false
  const geo = (o) => (o ? [o.x, o.y, o.width, o.height].join(',') : '')
  const check = (st) => {
    if (busy) return
    if (st.history === lastHistory && st.historyIndex === lastIndex) { lastObjects = st.objects; return }
    const prevTop = lastIndex >= 0 && lastHistory ? lastHistory[lastIndex] : undefined
    const action = st.historyIndex > 0 && prevTop !== undefined && st.history[st.historyIndex - 1] === prevTop
    const before = lastObjects
    lastHistory = st.history; lastIndex = st.historyIndex; lastObjects = st.objects
    if (!action || !before) return
    const B = new Map(before.map(o => [o.id, o]))
    const gs = st.gridSize || 40
    const moved = st.objects.filter(o => isZone(o) && geo(o) !== geo(B.get(o.id)))
    const hits = moved.map(z => ({ z, n: racksUnderZone(st.objects, z, gs).length })).filter(h => h.n > 0)
    // racking areas this action deleted whose racks are still there
    const afterIds = new Set(st.objects.map(o => o.id))
    const gone = before.filter(o => isArea(o) && !afterIds.has(o.id)).map(o => o.id)
    const orphaned = new Set(gone.filter(id => st.objects.some(o => o.areaId === id)))
    if (!hits.length && !orphaned.size) return
    // take the action back (its entry dropped), then ask
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
      const n = hits.reduce((t, h) => t + h.n, 0)
      useAreaPrompt.setState({
        question: {
          text: hits.length === 1 ? zoneText(hits[0].z, n) : `These zones cover ${n} racks. Racks under them will be removed or trimmed to the bays outside them.`,
          run: () => {
            let objs = after
            for (const { z } of hits) objs = clearZone(objs, objs.find(o => o.id === z.id) || z, { gridSize: gs, newId: nanoid }).objects
            commitAll(store, objs, hits[0].z.id)
          },
        },
      })
    })
  }
  return store.subscribe(check)
}
