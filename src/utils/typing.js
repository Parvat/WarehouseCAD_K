// typing.js — is the key going into a field? Then it is the field's: Ctrl/Cmd + A C V X Z Y, Delete / Backspace, the
// arrows and the single-letter tool keys act on the text, never on the canvas (src/hooks/useKeyboardShortcuts.js).

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
