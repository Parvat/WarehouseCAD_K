// aisleKeeper.js — keeps aisle pairings right after the store changes in
// ways this app can't hook directly (the protected store's deleteSelected,
// paste, addObject, undo/redo, ...). It watches the store and, whenever the
// set of racks or aisles changes or the history position moves (every
// commit, undo and redo), re-runs rebuildAisles and writes the fix WITHOUT a
// history entry — so a restored snapshot is corrected the moment it's shown,
// and the next commit records the corrected pairs. After an ACTION (a new
// history entry) the fix is folded into that entry too, as the pair keeper
// does: otherwise the entry lacks an aisle the action made, and an undo back
// to it brings that aisle back under a new id. Syncs and bay splits
// rebuild before they commit, so their own snapshots are already right.
// Moving racks (a drag) doesn't trigger it until the move is committed.

import { rebuildAisles } from './aisleRebuild'
import { autoSave, serializeScene } from './saveLoad'

const signature = (objects) => {
  let s = ''
  for (const o of objects) {
    if (o.type === 'aisle') s += 'a' + o.id + ':' + o.row1Id + ':' + o.row2Id + ';'
    else if (typeof o.type === 'string' && o.type.startsWith('rack_')) s += 'r' + o.id + ';'
  }
  return s
}

/** Subscribe to `store` (a zustand store); returns the unsubscribe. */
export function installAisleKeeper(store, newId) {
  let lastObjects = null, lastSig = '', lastHist = null, busy = false
  // the history as last seen, every call (an action: a new entry right after the one that was on top)
  let seenHistory = store.getState().history, seenIndex = store.getState().historyIndex
  const check = (st) => {
    if (busy) return
    const prevTop = seenHistory && seenIndex >= 0 ? seenHistory[seenIndex] : undefined
    const action = st.history !== seenHistory && st.historyIndex > 0 && prevTop !== undefined && st.history?.[st.historyIndex - 1] === prevTop
    seenHistory = st.history; seenIndex = st.historyIndex
    if (st.objects === lastObjects) return
    const sig = signature(st.objects)
    const structural = sig !== lastSig || st.historyIndex !== lastHist
    lastObjects = st.objects; lastSig = sig; lastHist = st.historyIndex
    if (!structural) return
    const r = rebuildAisles(st.objects, newId)
    if (!r.changed) return
    const patch = { objects: r.objects }
    if (action) {
      const history = st.history.slice(0, st.historyIndex + 1)
      history[history.length - 1] = JSON.stringify({ objects: r.objects, groups: st.groups || [], layers: st.layers })
      patch.history = history
    }
    busy = true
    try { store.setState(patch) } finally { busy = false }
    if (action) { try { autoSave(serializeScene(store.getState())) } catch { /* storage full or absent */ } }
    seenHistory = store.getState().history; seenIndex = store.getState().historyIndex
    lastObjects = store.getState().objects
    lastSig = signature(lastObjects)
  }
  check(store.getState())
  return store.subscribe(check)
}
