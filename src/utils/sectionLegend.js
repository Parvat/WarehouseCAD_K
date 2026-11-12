// sectionLegend.js — the sections' legend (STUDIO.md §7a Sections, row-numbering legend round): in place of name tags on
// the floor, one key per building, just outside it at its bottom-left: a line per section — its colour swatch and its
// name. The colour is its own, else one from the palette (utils/lineNames.js sectionChipColors — the same as its R
// chips). Drawn at the drawing's label size (render/labelSize.js), so it scales with the plan like the other labels; the
// canvas (canvas2/SectionLegend.jsx), a click on a line (it selects the section) and the PDF key all read this layout.

import { isSection } from './sectionAreas'
import { sectionChipColors } from './lineNames'
import { buildingOutline } from './floorGeom'

/** Legend metrics at label scale `lz` (the aisle labels' 11 px): font, line height, swatch, gaps. */
export const legendMetrics = (lz = 1) => { const fs = 11 / lz; return { fs, lineH: fs * 1.7, sw: fs * 0.95, gap: fs * 0.6, pad: fs * 0.6, off: fs * 3.3 } }   // off: below the bottom size line (render/buildingDims.js, 22 out + half its value — col-grid round)

/** Every building's legend: [{ fpId, x, y, w, h, items: [{ id, name, color, x, y, w, h (the line's box), sx, sy (the
 *  swatch's corner), tx (the text's left) }] }] (world px) — the key below the building's bottom-left corner. */
export function sectionLegend(objects, gridSize = 40, lz = 1) {
  const secs = (objects || []).filter(isSection)
  if (!secs.length) return []
  const fps = (objects || []).filter(o => /^fp_/.test(o.type || ''))
  const colors = sectionChipColors(objects), m = legendMetrics(lz)
  const byFp = new Map()
  for (const s of secs) {
    const fp = fps.find(f => f.id === s.parentId) || fps[0] || null
    const k = fp ? fp.id : ''
    if (!byFp.has(k)) byFp.set(k, { fp, secs: [] })
    byFp.get(k).secs.push(s)
  }
  const out = []
  for (const [fpId, { fp, secs: list }] of byFp) {
    let x0, y0
    if (fp) { const p = buildingOutline(fp); x0 = Math.min(...p.map(q => q.x)); y0 = Math.max(...p.map(q => q.y)) + m.off }
    else { x0 = Math.min(...list.map(s => s.x)); y0 = Math.max(...list.map(s => s.y + s.height)) + m.off }
    const items = list.map((s, i) => {
      const name = s.label || 'Section', y = y0 + m.pad + i * m.lineH
      const w = m.sw + m.gap + name.length * m.fs * 0.62
      return { id: s.id, name, color: colors.get(s.id), x: x0 + m.pad, y, w, h: m.lineH, sx: x0 + m.pad, sy: y + (m.lineH - m.sw) / 2, tx: x0 + m.pad + m.sw + m.gap }
    })
    const w = Math.max(...items.map(q => q.w)) + m.pad * 2, h = items.length * m.lineH + m.pad * 2
    out.push({ fpId, x: x0, y: y0, w, h, items, m })
  }
  return out
}
/** The legend line under world point `w` → the section's id, or null. */
export function legendHit(objects, w, gridSize = 40, lz = 1) {
  for (const L of sectionLegend(objects, gridSize, lz)) for (const q of L.items) if (w.x >= q.x && w.x <= q.x + q.w && w.y >= q.y && w.y <= q.y + q.h) return q.id
  return null
}
