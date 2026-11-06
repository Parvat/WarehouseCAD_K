// bomSheet.js — the bill of materials as PDF pages (export/pdfExport.js adds them after the plan and the elevation
// sheets): the lines grouped by part (part, size, qty), the flags first. Paper palette (STUDIO.md §2: white sheet, ink
// #1F2321, words #767C74, warnings amber #9A5F0A), the same paper size as the plan; as many pages as the lines need.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const INK = '#1F2321', WORDS = '#767C74', RULE = '#D9D6CC', WARN = '#9A5F0A'
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif", MONO = "'JetBrains Mono', monospace"

/** The BOM (utils/bom.js computeBom) as pages: [{ svg }] — none when it has no lines. Sizes in mm. */
export function buildBomSheets(bom, { title = '', paperW = 841, paperH = 594 } = {}) {
  if (!bom?.lines?.length) return []
  const M = 24, ROW = 9, HEAD = 34, colPart = M, colSize = M + 150, colQty = paperW - M
  const rowsPerPage = Math.max(5, Math.floor((paperH - M * 2 - HEAD - (bom.flags.length * 8)) / ROW) - 2)
  const pages = []
  for (let at = 0, n = 0; at < bom.lines.length; at += rowsPerPage, n++) {
    const part = bom.lines.slice(at, at + rowsPerPage)
    let y = M
    const out = []
    out.push(`<text x="${M}" y="${y + 10}" font-family="${FONT}" font-size="14" font-weight="600" fill="${INK}">Bill of materials</text>`)
    out.push(`<text x="${paperW - M}" y="${y + 10}" text-anchor="end" font-family="${FONT}" font-size="8" fill="${WORDS}">${esc(title)} · selective and back-to-back racking · quantities only${pages.length || at + rowsPerPage < bom.lines.length ? ` · page ${n + 1}` : ''}</text>`)
    y += 20
    if (n === 0) for (const f of bom.flags) { out.push(`<text x="${M}" y="${y + 6}" font-family="${FONT}" font-size="7.5" fill="${WARN}">⚠ ${esc(f.text)}</text>`); y += 8 }
    y += 4
    out.push(`<text x="${colPart}" y="${y + 6}" font-family="${FONT}" font-size="7" font-weight="600" fill="${WORDS}">PART</text>`)
    out.push(`<text x="${colSize}" y="${y + 6}" font-family="${FONT}" font-size="7" font-weight="600" fill="${WORDS}">SIZE</text>`)
    out.push(`<text x="${colQty}" y="${y + 6}" text-anchor="end" font-family="${FONT}" font-size="7" font-weight="600" fill="${WORDS}">QTY</text>`)
    y += 9
    out.push(`<line x1="${M}" y1="${y}" x2="${paperW - M}" y2="${y}" stroke="${INK}" stroke-width="0.5"/>`)
    let last = at > 0 ? bom.lines[at - 1].part : null
    for (const l of part) {
      y += ROW
      const first = l.part !== last
      if (first && last != null) out.push(`<line x1="${M}" y1="${y - ROW + 2}" x2="${paperW - M}" y2="${y - ROW + 2}" stroke="${RULE}" stroke-width="0.4"/>`)
      out.push(`<text x="${colPart}" y="${y}" font-family="${FONT}" font-size="8" fill="${INK}"${first ? ' font-weight="600"' : ''}>${first ? esc(l.part) : ''}</text>`)
      out.push(`<text x="${colSize}" y="${y}" font-family="${MONO}" font-size="8" fill="${INK}">${esc(l.size || '—')}</text>`)
      out.push(`<text x="${colQty}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="8" fill="${INK}">${l.qty.toLocaleString('en-US')}</text>`)
      last = l.part
    }
    pages.push({ svg: `<svg xmlns="http://www.w3.org/2000/svg" data-bom-sheet width="${paperW}mm" height="${paperH}mm" viewBox="0 0 ${paperW} ${paperH}"><rect width="${paperW}" height="${paperH}" fill="#FFFFFF"/>${out.join('')}</svg>` })
  }
  return pages
}
