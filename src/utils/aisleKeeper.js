// aisleKeeper.js — keeps aisle pairings right after the store changes in
// ways this app can't hook directly (the protected store's deleteSelected,
// paste, addObject, undo/redo, ...). It watches the store and, whenever the
// set of racks or aisles changes or the history position moves (every
// commit, undo and redo), re-runs rebuildAisles and writes the fix WITHOUT a
// history entry — so a restored snapshot is corrected the moment it's shown,
// and the next commit records the corrected pairs. Syncs and bay splits
// rebuild before they commit, so their own snapshots are already right.
// Moving racks (a drag) doesn't trigger it until the move is committed.

import { rebuildAisles } from './aisleRebuild'

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
  const check = (st) => {
    if (busy || st.objects === lastObjects) return
    const sig = signature(st.objects)
    const structural = sig !== lastSig || st.historyIndex !== lastHist
    lastObjects = st.objects; lastSig = sig; lastHist = st.historyIndex
    if (!structural) return
    const r = rebuildAisles(st.objects, newId)
    if (!r.changed) return
    busy = true
    try { store.setState({ objects: r.objects }) } finally { busy = false }
    lastObjects = store.getState().objects
    lastSig = signature(lastObjects)
  }
  check(store.getState())
  return store.subscribe(check)
}
