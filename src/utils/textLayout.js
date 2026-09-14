/* ═══════════════════════════════════════════════════════════════════════════
   TEXT LAYOUT — word wrapping for SVG text.

   SVG has no automatic wrapping: a <text> node is one line unless you emit the
   lines yourself. So we measure and break manually, then render one <tspan>
   per line.

   Measurement goes through canvas 2D measureText, which uses the same font
   machinery the browser uses to paint, so the wrap matches what is drawn. The
   measuring function is injected rather than reached for directly, which keeps
   the algorithm testable without a DOM and lets callers cache a context.
   ═══════════════════════════════════════════════════════════════════════════ */

const NL = String.fromCharCode(10)

/* One shared offscreen context — creating one per keystroke would be wasteful,
   and its state is fully described by the font string we set each time. */
let ctx = null
function sharedCtx() {
  if (ctx !== undefined && ctx !== null) return ctx
  try { ctx = document.createElement('canvas').getContext('2d') } catch { ctx = null }
  return ctx
}

/** CSS font shorthand for an object, in WORLD units (unscaled by zoom). */
export function fontSpec({ bold, italic, fontSize = 14, fontFamily = 'Montserrat' }) {
  return `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontSize}px ${fontFamily}`
}

/**
 * A measuring function for a given font.
 * Falls back to a per-character estimate where no canvas exists (SSR, tests),
 * so layout degrades to approximate rather than throwing.
 */
export function makeMeasure(spec, fontSize = 14) {
  const c = sharedCtx()
  if (!c) return str => str.length * fontSize * 0.55
  c.font = spec
  return str => c.measureText(str).width
}

/**
 * Break `text` into lines that fit `maxWidth`.
 * Explicit newlines are always honoured. Words that cannot fit alone are
 * broken character-by-character, matching word-break: break-word, so a long
 * unbroken token cannot overflow the frame.
 *
 * `maxWidth` of 0/undefined means "no wrapping" — the caller has not given the
 * object a width yet, so only explicit newlines apply.
 */
export function wrapLines(text, maxWidth, measure) {
  const paragraphs = String(text ?? '').split(NL)
  if (!maxWidth || maxWidth <= 0) return paragraphs

  const out = []
  for (const para of paragraphs) {
    if (para === '') { out.push(''); continue }
    /* keep the spaces so re-joining a line preserves the author's spacing */
    const words = para.split(' ')
    let line = ''
    for (let w = 0; w < words.length; w++) {
      const word = words[w]
      const candidate = line === '' ? word : line + ' ' + word
      if (measure(candidate) <= maxWidth) { line = candidate; continue }

      if (line !== '') { out.push(line); line = '' }
      /* the word alone may still be too wide — break it by character */
      if (measure(word) <= maxWidth) { line = word; continue }
      let chunk = ''
      for (const ch of word) {
        if (chunk !== '' && measure(chunk + ch) > maxWidth) { out.push(chunk); chunk = ch }
        else chunk += ch
      }
      line = chunk
    }
    out.push(line)
  }
  return out
}

/** Convenience: wrap straight from a text object. */
export function layoutText(obj) {
  const size = obj.fontSize || 14
  const raw = makeMeasure(fontSpec(obj), size)
  const ls  = obj.letterSpacing || 0
  /* canvas measureText has no letter-spacing concept, but ShapeGeometry applies
     obj.letterSpacing for real via the SVG letterSpacing attribute — trailing
     every character, not just the gaps between them (measured: a 58-char
     string at letterSpacing:3 rendered 174px wider than reported; 58*3=174
     matched exactly, 57*3=171 did not). Wrapping the measurer here, once,
     means both the wrap-fit check below and the final width both agree with
     what actually renders. */
  const measure = ls ? (str => raw(str) + str.length * ls) : raw
  const lines = wrapLines(obj.text, obj.width, measure)
  const lineH = (obj.lineHeight ?? 1.25) * size
  /* Widest line, so a selection frame can hug text that has no explicit width */
  const widest = lines.reduce((m, l) => Math.max(m, measure(l)), 0)
  return { lines, lineH, width: obj.width || widest || size, height: lines.length * lineH }
}
