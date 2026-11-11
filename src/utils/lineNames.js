// lineNames.js — what a rack line is called (STUDIO.md §7a BOM, row-numbering round). The lines are numbered R1, R2 …
// section by section (utils/rackLines.js, bom.js). The BOM tab's numbering, saved with the layout on its elevation table
// (`lineNumbering`, so it is saved, loaded and undone with it):
//   'continuous' — R1, R2, R3 … across the layout (as ever);
//   'section'    — each section restarts at 1 with its code in front: L1, L2 … then R1, R2 …; racks outside every
//                  section are U1, U2 ….
// A section's code (`code`, typed in its card) is its own, unique in the layout; by default the first letter(s) of its
// name — the initials of its words, digits left out ("Left" L, "Pick face" PF), a letter more of its first word while
// another section already has it. The plan's R labels, the BOM tab, By row, the Tally, the xlsx, the CSV and the PDF all
// name a line through lineNamer, so they can never disagree.

import { isSection, polygonOf, pointInPolygon } from './sectionAreas'
import { numberLines } from './rackLines'

export const LINE_NUMBERING = ['continuous', 'section']
/** The layout's numbering: 'continuous' (default) or 'section'. */
export const lineNumbering = (T) => (T?.lineNumbering === 'section' ? 'section' : 'continuous')
/** Set it — one undo step (the history entry carries the table). */
export function setLineNumbering(store, mode) {
  const st = store.getState(), T = st.elevations || { version: 3, types: [], defaultId: null }
  if (lineNumbering(T) === mode) return
  store.setState({ elevations: { ...T, lineNumbering: mode === 'section' ? 'section' : 'continuous' } })
  const anchor = st.objects.find(o => /^rack_/.test(o.type || ''))?.id || st.objects[0]?.id
  if (anchor) store.getState().commitObjectUpdate(anchor, {})
}

const clean = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** A code from a name: its words' initials, digits left out ("Pick face" → PF; "Section 1" → S). */
export function codeFromName(name) {
  const words = String(name || '').split(/\s+/).filter(w => /[A-Za-z]/.test(w))
  return clean(words.map(w => w.replace(/[^A-Za-z]/g, '')[0]).join('')) || 'S'
}
/** Every section's code, unique in the layout: Map(id → code). A typed one kept (the first to hold it); a default one
 *  the name's initials, grown by the next letters of its first word (then a number) while taken. 'U' is the unassigned. */
export function sectionCodes(objects) {
  const secs = (objects || []).filter(isSection), out = new Map(), taken = new Set(['U'])
  for (const s of secs) { const c = clean(s.code); if (c && !taken.has(c)) { out.set(s.id, c); taken.add(c) } }
  for (const s of secs) {
    if (out.has(s.id)) continue
    const base = codeFromName(s.label || 'Section'), first = String(s.label || 'Section').replace(/[^A-Za-z]/g, '').toUpperCase()
    let c = base
    for (let k = base.length; taken.has(c) && k < first.length; k++) c = base.length === 1 ? first.slice(0, k + 1) : base + first[k]
    for (let n = 2; taken.has(c); n++) c = base + n
    out.set(s.id, c); taken.add(c)
  }
  return out
}
/** Whether \`code\` may be section \`id\`'s (not empty, not U, no other section's). */
export function codeFree(objects, id, code) {
  const c = clean(code)
  if (!c || c === 'U') return false
  const codes = sectionCodes(objects)
  return ![...codes].some(([sid, k]) => sid !== id && k === c)
}

/** The layout's line names: (no) → 'R6' (continuous) or 'L2' (per section). */
export function lineNamer(objects, T, gridSize = 40) {
  if (lineNumbering(T) !== 'section') return (no) => 'R' + no
  const secs = (objects || []).filter(isSection), polys = secs.map(polygonOf), codes = sectionCodes(objects)
  const order = new Map(), count = new Map()
  for (const l of numberLines(objects || [], gridSize)) {
    // a line is in the section holding its middle (as the BOM files it), else unassigned
    const a = (l.r0 + l.r1) / 2, c = (l.s0 + l.s1) / 2, x = l.vert ? c : a, y = l.vert ? a : c
    const i = polys.findIndex(p => pointInPolygon(p, x, y))
    const code = i >= 0 ? codes.get(secs[i].id) : 'U'
    const n = (count.get(code) || 0) + 1
    count.set(code, n); order.set(l.no, code + n)
  }
  return (no) => order.get(no) || 'R' + no
}
/** Line numbers as words with their names: "R1–R4, R7" / "L1–L3, R2" — a run of lines one after another in the same
 *  section joined. `name`: a namer (lineNamer) or a { no: label } map. */
export function namedRows(nos, name = (n) => 'R' + n) {
  const nm = typeof name === 'function' ? name : (n) => name?.[n] || 'R' + n
  const s = [...nos].sort((a, b) => a - b), out = []
  const split = (lab) => { const m = /^([A-Z]*)(\d+)$/.exec(lab); return m ? [m[1], Number(m[2])] : [lab, NaN] }
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1 && (() => { const [p, a] = split(nm(s[j])), [q, b] = split(nm(s[j + 1])); return p === q && b === a + 1 })()) j++
    out.push(j > i ? `${nm(s[i])}–${nm(s[j])}` : nm(s[i]))
    i = j
  }
  return out.join(', ')
}
