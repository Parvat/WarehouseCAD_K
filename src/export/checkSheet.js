// checkSheet.js — the layout check as a PDF page (export/pdfExport.js adds it after the bill of materials): the errors,
// the warnings, then the items marked as OK, listed as accepted (utils/layoutCheck.js shownCheck). Paper palette as the
// BOM sheet (white sheet, ink #1F2321, words #767C74, errors red #B23A2A, warnings amber #9A5F0A); as many pages as the
// items need. None when the check finds nothing and nothing is accepted.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const INK = '#1F2321', WORDS = '#767C74', RULE = '#D9D6CC', ERR = '#B23A2A', WARN = '#9A5F0A'
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/** `shown`: { errors, warnings, marked } → [{ svg }]. Sizes in mm. */
export function buildCheckSheets(shown, { title = '', paperW = 841, paperH = 594 } = {}) {
  if (!shown) return []
  const groups = [
    { name: 'Errors', colour: ERR, items: shown.errors || [] },
    { name: 'Warnings', colour: WARN, items: shown.warnings || [] },
    { name: 'Accepted — marked as OK', colour: WORDS, items: shown.marked || [], accepted: true },
  ].filter(g => g.items.length)
  if (!groups.length) return []
  const M = 24, ROW = 9, rows = []
  for (const g of groups) { rows.push({ head: g }); for (const it of g.items) rows.push({ it, g }) }
  const perPage = Math.max(5, Math.floor((paperH - M * 2 - 34) / ROW) - 1), pages = []
  for (let at = 0, n = 0; at < rows.length; at += perPage, n++) {
    const out = []
    let y = M
    out.push(`<text x="${M}" y="${y + 10}" font-family="${FONT}" font-size="14" font-weight="600" fill="${INK}">Layout check</text>`)
    out.push(`<text x="${paperW - M}" y="${y + 10}" text-anchor="end" font-family="${FONT}" font-size="8" fill="${WORDS}">${esc(title)} · ${(shown.errors || []).length} errors · ${(shown.warnings || []).length} warnings · ${(shown.marked || []).length} accepted${rows.length > perPage ? ` · page ${n + 1}` : ''}</text>`)
    y += 26
    for (const r of rows.slice(at, at + perPage)) {
      y += ROW
      if (r.head) {
        out.push(`<line x1="${M}" y1="${y - ROW + 2}" x2="${paperW - M}" y2="${y - ROW + 2}" stroke="${RULE}" stroke-width="0.4"/>`)
        out.push(`<text x="${M}" y="${y}" font-family="${FONT}" font-size="8.5" font-weight="700" fill="${r.head.colour}" data-check-group="${esc(r.head.name)}">${esc(r.head.name)}</text>`)
        continue
      }
      const lvl = r.g.accepted ? (r.it.level === 'error' ? 'error, accepted' : 'warning, accepted') : ''
      out.push(`<text x="${M + 8}" y="${y}" font-family="${FONT}" font-size="8" fill="${r.g.accepted ? WORDS : INK}">${esc(r.it.text)}${lvl ? `<tspan fill="${WORDS}"> · ${lvl}</tspan>` : ''}</text>`)
    }
    pages.push({ svg: `<svg xmlns="http://www.w3.org/2000/svg" data-check-sheet width="${paperW}mm" height="${paperH}mm" viewBox="0 0 ${paperW} ${paperH}"><rect width="${paperW}" height="${paperH}" fill="#FFFFFF"/>${out.join('')}</svg>` })
  }
  return pages
}
