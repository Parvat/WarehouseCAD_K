// exportMode.js
// ─────────────────────────────────────────────────────────────────────────────
// A render-only flag: "draw the whole scene at full detail, ignore the
// viewport".
//
// Why this exists (historical): the OLD PDF export built its PDF by cloning
// the live #canvas-svg node, so viewport culling and the rack level-of-detail
// switch — both correct for the screen, both wrong for a printed plan — had
// to be disabled first via withFullRender. PDF export no longer does this at
// all (export/pdfExport.js draws straight from the store's objects, headless
// — see CANVAS2_BUGLOG.md), so withFullRender has no callers left. Left in
// place rather than deleted: isExporting/subscribeExportMode are still read
// by ShapeGeometry.jsx's own LOD gate, part of the SVG engine this file
// belongs to, not this change's scope.
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
