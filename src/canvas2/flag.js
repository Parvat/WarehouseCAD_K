// canvas2/flag.js
// ─────────────────────────────────────────────────────────────────────────────
// Which canvas is live. Exactly one, ever.
//
// ON  → only the new Konva canvas renders and owns all input.
// OFF → only the SVG canvas, exactly as before.
//
// Deliberately its own module with its own key rather than reusing the old
// migration flag: that one meant "mount Konva ALONGSIDE the SVG", which is the
// arrangement this rebuild exists to end. Two flags with two meanings would be
// one flag too many.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'trace.canvas2'
const listeners = new Set()

let override = null
try {
  const q = new URLSearchParams(window.location.search).get('canvas2')
  if (q === '1') override = true
  if (q === '0') override = false
} catch { /* no window (tests, SSR) — fall through to storage */ }

export function isCanvas2Enabled() {
  if (override !== null) return override
  try { return window.localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setCanvas2Enabled(on) {
  override = null                       // an explicit choice beats the URL
  try { window.localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ }
  listeners.forEach(fn => fn())
}

export function subscribeCanvas2Flag(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
