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
//     the area keeper and taken back. Inside or beside a racking area (within
//     an aisle of its box) it refits that area at once, as one history entry
//     with the zone change: racks come back at their pattern places where the
//     zone left, go where it now stands, and faces beside it lose their bays.
//     Racks under it that no area manages are cut at once, no question
//     (rackingArea.js cutForZones: a half a zone covers goes, a face it leaves
//     without an aisle goes) — the zone stays where it was dropped, the whole
//     change is one entry, and the bar notes it: "Office placed · 12 bays
//     removed". They don't come back when the zone shrinks — undo does that.
//   - A racking area deleted (any way — Delete, the panel's bin, a cut) while
//     its racks are still there: taken back the same way, and asked "Delete
//     the racks in this area too?" [Keep racks] [Delete racks]; either answer
//     puts the delete back as one history entry.
// The Row group watcher is told these are the app's own actions, not row edits
// (rowGroupTool.skipNextAction): the Row group passes it over.

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { planAreaResize, planAreaRebuild, areaEdits, areaSettings, cutForZones, removedRowBays, isArea, isZone, boxOf } from '../generate/rackingArea'
import { useRackingSettings } from './fillTool'
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
    const next = planAreaRebuild(store.getState().objects, areaId, settings, { gridSize: gs, newId: nanoid })
    if (next) commitAll(store, next, areaId)
  }
  return askOr(areaEdits(st.objects, area).count ? EDIT_WARNING : null, run)
}

/** The racking areas a zone change reaches: the zone (where it is now, or where it was) inside the
 *  area or beside it — within a forklift aisle of its box, where a face could lose its aisle. */
function areasNear(objects, boxes, gridSize) {
  const reach = (a) => (a.pattern?.aisleFt ?? areaSettings(a).aisleFt) * gridSize
  const meets = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-6 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-6
  return objects.filter(o => isArea(o) && boxes.some(b => { const a = boxOf(o), d = reach(o); return meets({ x: a.x - d, y: a.y - d, w: a.w + 2 * d, h: a.h + 2 * d }, b) }))
}

/** Refit areas `ids` in `objects`: each shows its pattern through its box again with the zones as
 *  they are now — racks come back where a zone left, go where it now is, and faces beside it lose
 *  their bays (planAreaResize to its own box). */
function refitAreas(objects, ids, gridSize, newId = nanoid) {
  let objs = objects
  for (const id of ids) {
    const a = objs.find(o => o.id === id)
    if (a) objs = planAreaResize(objs, id, boxOf(a), { gridSize, newId }) || objs
  }
  return objs
}

const zb = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
/** A zone change landed: the racking areas it reaches refitted (where the zones are now, and where they were:
 *  `was`), then the racks no area manages cut for the zones (cutForZones). The keeper commits it; the resize
 *  preview draws what it removes (zonePreview) — the same function, so they cannot disagree. */
export function landZones(objects, zones, was = [], { gridSize = 40, newId = nanoid } = {}) {
  const boxes = [...zones.map(zb), ...was.map(zb)]
  const areas = boxes.length ? areasNear(objects, boxes, gridSize).map(a => a.id) : []
  const objs = refitAreas(objects, areas, gridSize, newId)
  // (an area's own racks are clear of the zones after its refit: untouched)
  return cutForZones(objs, zones.map(z => zb(objs.find(o => o.id === z.id) || z)), { gridSize, aisleFt: useRackingSettings.getState().aisleFt ?? 10.5, newId }).objects
}
/** While zone `zoneId` is resized: the bays (per row) it will remove on release, as world px boxes. */
export function zonePreview(objects, zoneId, was, { gridSize = 40 } = {}) {
  const z = objects.find(o => o.id === zoneId)
  if (!z) return []
  let n = 0
  return removedRowBays(objects, landZones(objects, [z], was ? [was] : [], { gridSize, newId: () => 'preview' + (++n) }), gridSize)
}

/** The bar's note for zone `z`: placed / resized / moved, and the bays (per row) the change removed. */
const zoneNote = (z, was, removed) => {
  const how = !was ? 'placed' : (Math.abs(was.width - z.width) > 1e-6 || Math.abs(was.height - z.height) > 1e-6) ? 'resized' : 'moved'
  return `${z.label || 'Zone'} ${how}${removed > 0 ? ` · ${removed} bay${removed === 1 ? '' : 's'} removed` : ''}`
}

/** Zones placed / moved / resized / deleted, and racking areas deleted with their racks still
 *  there: take the action back, then
 *    - a zone inside or beside a racking area refits that area at once (refitAreas), as ONE
 *      history entry with the zone change;
 *    - racks it reaches that no area manages are cut at once (cutForZones), in the same entry, and
 *      the bar notes it ("Office placed · 12 bays removed");
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
    if (!action || !before) return
    const B = new Map(before.map(o => [o.id, o]))
    const gs = st.gridSize || 40
    const afterIds = new Set(st.objects.map(o => o.id))
    // zones placed, moved or resized (and deleted): where they are now, and where they were
    const moved = st.objects.filter(o => isZone(o) && geo(o) !== geo(B.get(o.id)))
    const dropped = before.filter(o => isZone(o) && !afterIds.has(o.id))
    const touched = [...moved.map(zb), ...moved.map(o => B.get(o.id)).filter(Boolean).map(zb), ...dropped.map(zb)]
    // racking areas this action deleted whose racks are still there
    const gone = before.filter(o => isArea(o) && !afterIds.has(o.id)).map(o => o.id)
    const orphaned = new Set(gone.filter(id => st.objects.some(o => o.areaId === id)))
    // the areas the zones reach refit; racks a zone reaches that none of them manages are cut
    const areas = touched.length ? areasNear(st.objects, touched, gs).map(a => a.id) : []
    const managed = new Set(areas)
    const isManaged = (id) => { const r = st.objects.find(o => o.id === id); return !!(r && r.areaId && managed.has(r.areaId)) }
    // racks a zone change reaches that no refitted area manages: cut at once (cutForZones)
    const cutNow = moved.length ? cutForZones(st.objects, moved.map(zb), { gridSize: gs, aisleFt: useRackingSettings.getState().aisleFt ?? 10.5, newId: () => 'probe', skip: (r) => isManaged(r.id) }).count : 0
    if (useAreaPrompt.getState().note) useAreaPrompt.setState({ note: null })
    if (!cutNow && !orphaned.size && !areas.length) { if (moved.length === 1) useAreaPrompt.setState({ note: zoneNote(moved[0], B.get(moved[0].id), 0) }); return }
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
      /* the zone change with its consequences, as one entry, at once: the areas refitted, then the racks
         no area manages cut for the zones (cutForZones) */
      const land = () => {
        const objs = landZones(after, moved, [...moved.map(o => B.get(o.id)).filter(Boolean), ...dropped], { gridSize: gs, newId: nanoid })
        const anchor = (moved[0] || objs.find(o => isZone(o)) || objs.find(o => isArea(o)) || {}).id
        // written while this keeper looks away: it is the zone change's own result, not a new one
        busy = true
        try { commitAll(store, objs, anchor) } finally { busy = false }
        const c = store.getState()
        lastHistory = c.history; lastIndex = c.historyIndex; lastObjects = c.objects
        if (moved.length === 1) useAreaPrompt.setState({ note: zoneNote(moved[0], B.get(moved[0].id), removedRowBays(after, c.objects, gs).length) })
      }
      land()
    })
  }
  return store.subscribe(check)
}
