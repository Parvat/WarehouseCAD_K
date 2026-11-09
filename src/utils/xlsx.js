// xlsx.js — a plain .xlsx file from a table of cells (the BOM's By row sheet). No library: an .xlsx is a zip of a few
// XML parts; the zip here is stored (no compression), which every spreadsheet reads.
//
//   writeXlsx({ sheet: 'BOM', rows: [[cell, …], …], merges: ['A1:C1'], widths: [24, 18, 8 …], bold: Set(rowIndex) })
//     a cell: a number (written as a number) or text; null / '' leaves it empty → Uint8Array (the file's bytes)

const enc = new TextEncoder()
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A column's letters: 0 → A, 25 → Z, 26 → AA. */
export function colName(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

/** A stored zip of `files` ([{ name, data: Uint8Array }]) → Uint8Array. */
export function zipStored(files) {
  const parts = [], central = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); local.setUint32(14, crc, true); local.setUint32(18, size, true)
    local.setUint32(22, size, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, f.data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true)
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + size
  }
  const cSize = central.reduce((t, p) => t + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0))
  let at = 0
  for (const p of all) { out.set(p, at); at += p.length }
  return out
}

/** The workbook's bytes: one sheet. */
export function writeXlsx({ sheet = 'Sheet1', rows = [], merges = [], widths = [], bold = new Set() }) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    if (v == null || v === '') return ''
    const ref = colName(ci) + (ri + 1), s = bold.has(ri) ? ' s="1"' : ''
    return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(v)}</t></is></c>`
  }).join('')}</row>`).join('')
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData>${mergeXml}</worksheet>`,
  }
  return zipStored(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })))
}

/** Read back a stored zip (this file's own) → { name: text } — for the tests. */
export function readStoredZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder(), out = {}
  let at = 0
  while (at + 30 <= bytes.length && dv.getUint32(at, true) === 0x04034b50) {
    const size = dv.getUint32(at + 18, true), nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true)
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nl)), start = at + 30 + nl + xl
    out[name] = dec.decode(bytes.subarray(start, start + size))
    at = start + size
  }
  return out
}
/** The cells of a sheet this file wrote → rows of values (numbers as numbers), for the tests. */
export function sheetCells(sheetXml) {
  const rows = []
  for (const m of sheetXml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    const r = []
    for (const c of m[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?: t="inlineStr")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g)) {
      let i = 0
      for (const ch of c[1]) i = i * 26 + (ch.charCodeAt(0) - 64)
      r[i - 1] = c[2] != null ? Number(c[2]) : c[3].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    }
    rows[Number(m[1]) - 1] = r
  }
  return rows
}
