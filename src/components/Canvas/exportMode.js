// exportMode.js
// ─────────────────────────────────────────────────────────────────────────────
// A render-only flag: "draw the whole scene at full detail, ignore the
// viewport".
//
// Why this exists: exportToPDF builds its PDF by cloning the live #canvas-svg
// node. That makes the export vector — but it also means the PDF contains
// exactly what the renderer had drawn at that moment. Viewport culling and the
// rack level-of-detail switch are both correct for the screen and both wrong
// for a printed plan: culling drops every rack that is off-screen, and LOD
// replaces bays with a plain block. Exporting while zoomed in silently
// produced a plan missing most of its racks.
//
// Deliberately NOT in the canvas store. This is a transient property of one
// render pass, not scene data — putting it in the store would push it through
// undo, autosave and the .wcad file. React subscribes via useSyncExternalStore
// so flipping it re-renders the canvas exactly once.
// ─────────────────────────────────────────────────────────────────────────────

let exporting = false
const listeners = new Set()

export const isExporting = () => exporting

export function subscribeExportMode(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function set(v) {
  if (exporting === v) return
  exporting = v
  listeners.forEach(fn => fn())
}

/**
 * Render the full scene, run `fn`, then restore normal rendering.
 *
 * Two animation frames separate the flag from the work: one for React to
 * re-render with culling off, one for the browser to commit that render to the
 * DOM. Cloning before the second frame would copy the culled tree — the very
 * bug this exists to prevent.
 */
export async function withFullRender(fn) {
  set(true)
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    return fn()
  } finally {
    set(false)
  }
}
