// lineNames.js — what a rack line is called (STUDIO.md §7a BOM, row-numbering round; its fixes: no section codes). The
// lines are numbered R1, R2 …
// section by section (utils/rackLines.js, bom.js). The BOM tab's numbering, saved with the layout on its elevation table
// (`lineNumbering`, so it is saved, loaded and undone with it):
//   'continuous' — R1, R2, R3 … across the layout (as ever);
//   'section'    — each section restarts at R1 (row-numbering fixes: no letter codes); the plan's chip is filled with the
//                  section's colour (one from the palette for a section with none — its chips only); lists say the section
//                  by name: "Section 2 > R3". Racks outside every section: Unassigned R1 …. The plan's R labels, the BOM tab, By row, the Tally, the xlsx, the CSV and the PDF all
// name a line through lineNamer, so they can never disagree.

import { isSection, polygonOf, pointInPolygon, SECTION_COLORS, colorOf } from './sectionAreas'
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

/** A section's colour for its row chips (row-numbering fixes): its own (SECTION_COLORS), else one from the palette — the
 *  first not taken by a section's own colour, in the layout's order — for its chips only (its floor fill unchanged). */
export function sectionChipColors(objects) {
  const secs = (objects || []).filter(isSection), out = new Map(), used = new Set()
  for (const s of secs) { const k = colorOf(s); if (k) { out.set(s.id, k.c); used.add(k.c) } }
  let i = 0
  for (const s of secs) {
    if (out.has(s.id)) continue
    const free = SECTION_COLORS.map(k => k.c).filter(c => !used.has(c))
    const c = free.length ? free[i % free.length] : SECTION_COLORS[i % SECTION_COLORS.length].c
    out.set(s.id, c); used.add(c); i++
  }
  return out
}
/** Text that reads on fill `hex`: white on a dark fill, dark on a light one. */
export function chipText(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(String(hex).slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#1F2321' : '#FFFFFF'
}
/** Per section: each line's section — Map(no → { id, name, color }) (outside every section: Unassigned, no colour); null
 *  in Continuous. */
export function lineSections(objects, T, gridSize = 40) {
  if (lineNumbering(T) !== 'section') return null
  const secs = (objects || []).filter(isSection), polys = secs.map(polygonOf), colors = sectionChipColors(objects)
  const out = new Map()
  for (const l of numberLines(objects || [], gridSize)) {
    // a line is in the section holding its middle (as the BOM files it), else unassigned
    const a = (l.r0 + l.r1) / 2, c = (l.s0 + l.s1) / 2, x = l.vert ? c : a, y = l.vert ? a : c
    const i = polys.findIndex(p => pointInPolygon(p, x, y))
    out.set(l.no, i >= 0 ? { id: secs[i].id, name: secs[i].label || 'Section', color: colors.get(secs[i].id) } : { id: 'unassigned', name: 'Unassigned', color: null })
  }
  return out
}
/** The layout's line names: (no) → 'R6' — Continuous: across the layout; Per section: R1, R2 … within each section
 *  (row-numbering fixes: no letter codes — the section is said by its name, its chip colour). */
export function lineNamer(objects, T, gridSize = 40) {
  const secOf = lineSections(objects, T, gridSize)
  if (!secOf) return (no) => 'R' + no
  const order = new Map(), count = new Map()
  for (const l of numberLines(objects || [], gridSize)) {
    const k = secOf.get(l.no)?.id || 'unassigned', n = (count.get(k) || 0) + 1
    count.set(k, n); order.set(l.no, 'R' + n)
  }
  return (no) => order.get(no) || 'R' + no
}
/** A line's full name: Per section "Section 2 > R3"; Continuous "R6". */
export function lineFullNamer(objects, T, gridSize = 40) {
  const nm = lineNamer(objects, T, gridSize), secOf = lineSections(objects, T, gridSize)
  return (no) => (secOf?.get(no) ? `${secOf.get(no).name} > ${nm(no)}` : nm(no))
}
/** Line numbers as words with their names: "R1–R4, R7" — a run of lines one after another named one after another
 *  joined. `name`: a namer (lineNamer) or a { no: label } map. `sec` ({ no: section name }, Per section): lines of
 *  several sections said section by section — "Section 1 > R1–R11, Section 2 > R1–R3"; of one, plainly. */
export function namedRows(nos, name = (n) => 'R' + n, sec = null) {
  if (sec) {
    const groups = new Map()
    for (const no of [...nos].sort((a, b) => a - b)) { const k = sec[no] ?? ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(no) }
    if (groups.size > 1) return [...groups].map(([k, ns]) => (k ? `${k} > ` : '') + namedRows(ns, name)).join(', ')
  }
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
