// konvaFlag.js
// ─────────────────────────────────────────────────────────────────────────────
// Feature flag for the Konva renderer migration.
//
// The Konva Stage mounts ALONGSIDE the existing SVG renderer rather than
// replacing it, so the canvas is never in a half-migrated state: flag off is
// today's app, byte for byte. Parity gets built up behind the flag, and the SVG
// renderer is only deleted once it is actually redundant.
//
// Presentation state, so it lives in localStorage — never the canvas store,
// which would push it through undo, autosave and the .wcad file.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'trace.renderer.konva'

function initial() {
  try {
    /* ?konva=1 wins, so the flag can be flipped without a UI round-trip. */
    const q = new URLSearchParams(window.location.search).get('konva')
    if (q === '1' || q === 'true')  return true
    if (q === '0' || q === 'false') return false
    return localStorage.getItem(KEY) === '1'
  } catch { return false }
}

let enabled = initial()
const listeners = new Set()

export const isKonvaEnabled = () => enabled

export function subscribeKonvaFlag(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setKonvaEnabled(v) {
  const next = !!v
  if (next === enabled) return
  enabled = next
  try { localStorage.setItem(KEY, next ? '1' : '0') } catch { /* private mode */ }
  listeners.forEach(fn => fn())
}
