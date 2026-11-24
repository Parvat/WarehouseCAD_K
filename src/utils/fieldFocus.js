// fieldFocus.js — (gen-lock) a field's whole box is the field. Many fields draw a box (fieldBox, cardParts.jsx) with a
// narrow input inside it — as wide as its digits, a unit mark after it (the Generate card's 240′). The box shows the
// I-beam (studio.css, :has) and a press anywhere on it that is not on a control of its own puts the caret in its field
// (the nearest one, for a box of two: Column grid X × Y), at the end of the text. Set once for the whole app.
const TEXT = 'input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="email"], input[type="password"], input[type="tel"], input[type="url"], textarea'
const CONTROL = 'input, textarea, select, button, a[href], [role="button"], [role="option"], [role="tab"], [contenteditable]:not([contenteditable="false"])'
const MAX_BOX_H = 48            // a field's box, not a panel that happens to hold a field

/** The field a press at (x, y) on `target` belongs to, or null. */
export function fieldOfBox(target, x) {
  if (!(target instanceof Element) || target.closest(CONTROL)) return null
  for (let box = target; box && box !== document.body; box = box.parentElement) {
    const fields = [...box.children].filter(c => c.matches(TEXT) && !c.disabled && !c.readOnly)
    if (!fields.length) continue
    if (box.getBoundingClientRect().height > MAX_BOX_H) return null
    let best = null, bd = Infinity
    for (const f of fields) { const r = f.getBoundingClientRect(), d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (d < bd) { bd = d; best = f } }
    return best
  }
  return null
}

export function installFieldFocus(win = window) {
  const down = (e) => {
    if (e.button !== 0) return
    const f = fieldOfBox(e.target, e.clientX)
    if (!f || win.document.activeElement === f) return
    e.preventDefault()                     // no blur-then-focus flicker; the caret goes straight in
    f.focus()
    try { const n = String(f.value ?? '').length; f.setSelectionRange?.(n, n) } catch { /* a number field has no caret API */ }
  }
  win.addEventListener('mousedown', down, true)
  return () => win.removeEventListener('mousedown', down, true)
}
