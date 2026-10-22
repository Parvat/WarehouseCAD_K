// typing.js — is the key going into a field? Then it is the field's: Ctrl/Cmd + A C V X Z Y, Delete / Backspace, the
// arrows and the single-letter tool keys act on the text, never on the canvas. EVERY keydown listener that acts on
// one of those keys asks textOwnsKey(e) first (src/__test__/plan/KT_keysTyping.test.js finds them all).

/* inputs that take no typing — a key on a focused checkbox, slider or button still reaches the canvas */
const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image'])

/** True when `el` is somewhere the user types or picks text: a text-like input, a select, a textarea, editable content. */
export function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NOT_TEXT.has(String(el.type || 'text').toLowerCase())
  return !!el.isContentEditable
}

/** The Ctrl/Cmd keys a field keeps for its own text. */
export const TEXT_EDIT_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y'])

/** True when this key belongs to the field being typed in (its target, or the focused element): Ctrl/Cmd + A C V X
 *  Z Y, Delete, Backspace, the arrows, any single character (the tool letters, a space). Escape, Enter and other
 *  Ctrl shortcuts (save, open…) are not the field's. */
export function textOwnsKey(e) {
  const active = typeof document !== 'undefined' ? document.activeElement : null
  if (!e || (!isTypingTarget(e.target) && !isTypingTarget(active))) return false
  const k = String(e.key ?? '')
  if (e.ctrlKey || e.metaKey) return TEXT_EDIT_KEYS.has(k.toLowerCase())
  return k === 'Delete' || k === 'Backspace' || k.startsWith('Arrow') || k.length === 1
}
