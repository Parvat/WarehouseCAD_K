// canvas2/debugLog.js
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY diagnostic channel. Delete with DebugPanel.jsx once the two
// reported bugs are understood.
//
// On-screen rather than console, because the console is one more thing to open,
// scroll and crop — and a screenshot of the canvas with the log beside it shows
// the gesture AND what the code thought it was doing in the same frame.
// ─────────────────────────────────────────────────────────────────────────────

const MAX = 40
let entries = []
let census = null
let seq = 0
const listeners = new Set()

/* The snapshot must be a STABLE reference between changes. useSyncExternalStore
   compares snapshots by identity, so returning a fresh object each call makes
   every render look like a change and loops until React gives up. */
let snapshot = { entries: [], census: null }
const emit = () => {
  snapshot = { entries, census }
  listeners.forEach(fn => fn())
}

/** Push one entry. `title` is the headline, `lines` the detail. */
export function dlog(title, lines = []) {
  entries = [{ id: ++seq, t: new Date().toLocaleTimeString(), title, lines },
    ...entries].slice(0, MAX)
  emit()
}

/** A value that is replaced in place rather than appended — the live census. */
export function dcensus(lines) { census = lines; emit() }

export const getDebug = () => snapshot
export function clearDebug() { entries = []; seq = 0; emit() }
export function subscribeDebug(fn) { listeners.add(fn); return () => listeners.delete(fn) }

/** Debug output is on by default in this build so it cannot be missed; ?debug=0
 *  turns it off. */
export function debugOn() {
  try { return new URLSearchParams(window.location.search).get('debug') !== '0' }
  catch { return true }
}
