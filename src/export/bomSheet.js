// bomSheet.js — the bill of materials as PDF pages (export/pdfExport.js adds them after the plan and the elevation
// sheets): the lines grouped by part (part, size, qty — beams one by one, their pairs beside), per drawn section (its
// rows R…) then Unassigned and the grand Total (with no section drawn, the Total alone), the flags first. Paper palette
// (STUDIO.md §2: white sheet, ink #1F2321, words #767C74, warnings amber #9A5F0A), the same paper size as the plan; as
// many pages as the lines need.

import { bomGroups, qtyText, rowsText } from '../utils/bom'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const INK = '#1F2321', WORDS = '#767C74', RULE = '#D9D6CC', WARN = '#9A5F0A'
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif", MONO = "'JetBrains Mono', monospace"

/** The BOM (utils/bom.js computeBom) as pages: [{ svg }] — none when it has no lines. Sizes in mm. */
export function buildBomSheets(bom, { title = '', paperW = 841, paperH = 594 } = {}) {
  if (!bom?.lines?.length) return []
  const M = 24, ROW = 9, HEAD = 34, colPart = M, colSize = M + 150, colQty = paperW - M
  // the sheet's rows: each group's head (a section, Unassigned, the Total — none for a lone Total), then its lines
  const items = []
  for (const g of bomGroups(bom)) {
    if (bom.hasSections) items.push({ head: g })
    let last = null
    for (const l of g.lines) { items.push({ l, first: l.part !== last, total: g.total }); last = l.part }
  }
  const rowsPerPage = Math.max(5, Math.floor((paperH - M * 2 - HEAD - (bom.flags.length * 8)) / ROW) - 2)
  const pages = []
  for (let at = 0, n = 0; at < items.length; at += rowsPerPage, n++) {
    const part = items.slice(at, at + rowsPerPage)
    let y = M
    const out = []
    out.push(`<text x="${M}" y="${y + 10}" font-family="${FONT}" font-size="14" font-weight="600" fill="${INK}">Bill of materials</text>`)
    out.push(`<text x="${paperW - M}" y="${y + 10}" text-anchor="end" font-family="${FONT}" font-size="8" fill="${WORDS}">${esc(title)} · selective and back-to-back racking · quantities only${pages.length || at + rowsPerPage < items.length ? ` · page ${n + 1}` : ''}</text>`)
    y += 20
    if (n === 0) for (const f of bom.flags) { out.push(`<text x="${M}" y="${y + 6}" font-family="${FONT}" font-size="7.5" fill="${WARN}">⚠ ${esc(f.text)}</text>`); y += 8 }
    y += 4
    out.push(`<text x="${colPart}" y="${y + 6}" font-family="${FONT}" font-size="7" font-weight="600" fill="${WORDS}">PART</text>`)
    out.push(`<text x="${colSize}" y="${y + 6}" font-family="${FONT}" font-size="7" font-weight="600" fill="${WORDS}">SIZE</text>`)
    out.push(`<text x="${colQty}" y="${y + 6}" text-anchor="end" font-family="${FONT}" font-size="7" font-weight="600" fill="${WORDS}">QTY</text>`)
    y += 9
    out.push(`<line x1="${M}" y1="${y}" x2="${paperW - M}" y2="${y}" stroke="${INK}" stroke-width="0.5"/>`)
    for (const it of part) {
      y += ROW
      if (it.head) {
        out.push(`<line x1="${M}" y1="${y - ROW + 2}" x2="${paperW - M}" y2="${y - ROW + 2}" stroke="${it.head.total ? INK : RULE}" stroke-width="${it.head.total ? 0.5 : 0.4}"/>`)
        out.push(`<text x="${colPart}" y="${y}" font-family="${FONT}" font-size="8.5" font-weight="700" fill="${INK}" data-bom-group="${esc(it.head.id)}">${esc(it.head.name)}<tspan font-weight="400" fill="${WORDS}" font-size="7.5">${it.head.rows.length ? '  ' + esc(rowsText(it.head.rows)) : ''}</tspan></text>`)
        continue
      }
      const l = it.l
      if (it.first && !bom.hasSections && items.indexOf(it) > 0) out.push(`<line x1="${M}" y1="${y - ROW + 2}" x2="${paperW - M}" y2="${y - ROW + 2}" stroke="${RULE}" stroke-width="0.4"/>`)
      out.push(`<text x="${colPart}" y="${y}" font-family="${FONT}" font-size="8" fill="${INK}"${it.first ? ' font-weight="600"' : ''}>${it.first ? esc(l.part) : ''}</text>`)
      out.push(`<text x="${colSize}" y="${y}" font-family="${MONO}" font-size="8" fill="${INK}">${esc(l.size || '—')}</text>`)
      out.push(`<text x="${colQty}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="8" fill="${INK}">${esc(qtyText(l))}</text>`)
    }
    pages.push({ svg: `<svg xmlns="http://www.w3.org/2000/svg" data-bom-sheet width="${paperW}mm" height="${paperH}mm" viewBox="0 0 ${paperW} ${paperH}"><rect width="${paperW}" height="${paperH}" fill="#FFFFFF"/>${out.join('')}</svg>` })
  }
  return pages
}
