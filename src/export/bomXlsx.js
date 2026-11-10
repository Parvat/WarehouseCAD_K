// bomXlsx.js — the BOM's By row table as an .xlsx sheet (the full view's Download xlsx), laid out as on screen, like a
// dealer's sheet: a title line; the sections over their rows (merged); Part · Size · R1 … Rn · Total per section, then
// the grand Total; one row per part (utils/bom.js byRowTable — the Bays row first, Part and Size as the tables show them).

import { byRowTable, partShort, sizeWords } from '../utils/bom'
import { writeXlsx, colName } from '../utils/xlsx'

/** The sheet's rows (what writeXlsx gets, and what the tests read back): { rows, merges, widths, bold }. */
export function bomXlsxSheet(bom, title = '') {
  const { groups, parts } = byRowTable(bom)
  const many = bom.hasSections                                  // no drawn section: the rows and one Total, no groups
  const head1 = ['Bill of materials — by row' + (title ? ' · ' + title : '')]
  const head2 = ['', ''], head3 = ['Part', 'Size'], merges = []
  for (const g of groups) {
    const at = head3.length
    for (const no of g.rows) { head2.push(''); head3.push('R' + no) }
    if (many) { head2.push(''); head3.push('Total') }
    if (!many) continue
    head2[at] = g.name
    if (head3.length - at > 1) merges.push(`${colName(at)}2:${colName(head3.length - 1)}2`)
  }
  head2.push(''); head3.push(many ? 'Grand total' : 'Total')
  const body = parts.map(p => {
    const r = [partShort(p.part), sizeWords(p.size)]
    for (const g of groups) { for (const no of g.rows) r.push(p.cells[no] || 0); if (many) r.push(p.totals[g.id] || 0) }
    r.push(p.total)
    return r
  })
  const widths = [18, 20, ...head3.slice(2).map(h => Math.max(7, String(h).length + 2))]
  return { rows: [head1, head2, head3, ...body], merges, widths, bold: new Set([0, 1, 2]) }
}

/** The file's bytes. */
export const bomXlsx = (bom, title = '') => writeXlsx({ sheet: 'BOM by row', ...bomXlsxSheet(bom, title) })
