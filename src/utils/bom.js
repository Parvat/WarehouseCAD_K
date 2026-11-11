// bom.js — the layout's bill of materials (BOM v1, round 2): selective single rows (rack_row) and back-to-back pairs
// (rack_double_row), quantities only, no prices. One pure function: the layout (objects) and its elevations in, BOM
// lines and flags out — it never reads the screen. Every part is counted on its rack line (utils/rackLines.js: R1, R2
// …, a pair's two sides two lines), so the BOM reads per line (By row), per drawn section (a line is in the section
// holding its middle; else Unassigned) and in total.
//
// What counts, and once (utils/bayLedger.js decides): a bay more than half covered by another rack's bay is not
// counted — overlapping racks never count twice; a frame two racks stand on together (in-line, a shared upright)
// counts once; on a pair side a frame stands only beside a bay that exists on that side (an empty side bay drops the
// frames between empty bays). Bays with X marks (lost positions) still count: the steel is there.
//
//   Upright frames    one per frame position and side; by height × depth (the taller of the two bays' elevations it
//                     stands between, on its side; the rack's own frame depth)
//   Beams             2 per beam pair; a pair per bay side × beam levels — the levels the elevation sheet draws with a
//                     beam (elevations.js drawnLevels: a level above 0; level 1 at 0 on the floor has none); by length ×
//                     face. Counted one by one, the pairs beside ("Beam 96″ × 4″ face: 18 (9 pairs)")
//   Safety pins       2 per beam: 4 per beam pair
//   Wire decks        per bay side × beam level × the deck set for that beam length (the project's deck table); by
//                     deck width × depth (the frame depth). No deck row for a length: none counted, flagged
//   Row spacers       back-to-back only, between the two uprights of each frame pair (both sides' frames at one upright
//                     position): 1 per pair up to the height set (default 16 ft), 2 above; by flue. On the lines: 2 —
//                     1 on each side's line; 1 — on the pair's first line
//   Anchors           per frame × 2 feet × anchors per foot (setting, default 1)
//   Upright guards    (setting, off by default) on the frames at a row end that faces an aisle
//   End-of-aisle      (setting, off by default) one per row end facing an aisle — a pair's end counts once
//
// A bay side with no elevation (none resolves) is counted with the layout's default elevation, and flagged.

import { bayLedger } from './bayLedger'
import { typeAt, typeById, beamFace, sidesOf, beamLevelCount, tunnelType, tunnelAt } from './elevations'
import { isEmptySide } from './bayEmpty'
import { sectionMap } from '../canvas2/sections'
import { numberLines, worldSide } from './rackLines'
import { isSection, polygonOf, pointInPolygon } from './sectionAreas'

export const BOM_DEFAULTS = {
  decks: [
    { beamIn: 96, widthsIn: [46, 46] },
    { beamIn: 108, widthsIn: [52, 52] },
    { beamIn: 144, widthsIn: [46, 46, 46] },
  ],
  anchorsPerFoot: 1,
  spacerBreakFt: 16,                  // row spacers: 1 per frame pair up to this frame height, 2 above
  uprightGuards: false, endGuards: false,
}
/** Row spacers per frame pair: 1 up to the height set, 2 above (fixed — the 2 / 3 counts of before are gone). */
export const SPACERS_UP_TO = 1, SPACERS_ABOVE = 2
/** The project's BOM settings over the defaults (`project.bom`; an older project's spacer counts are dropped). */
export function bomSettings(project) {
  const { spacersUpTo, spacersAbove, ...b } = project?.bom || {}    // eslint-disable-line no-unused-vars
  return { ...BOM_DEFAULTS, ...b, decks: Array.isArray(b.decks) ? b.decks : BOM_DEFAULTS.decks }
}

/** How far past a row end the floor must be open to call it an aisle (in): a forklift's turn needs more, a wall
 *  clearance (3") or a flue far less — 4 ft tells them apart. */
export const AISLE_PROBE_IN = 48

export const PARTS = ['Upright frame', 'Beam', 'Safety pin', 'Wire deck', 'Row spacer', 'Anchor', 'Upright guard', 'End-of-aisle guard']
/** The By row table's parts, top to bottom (no safety pins): frames, beams, decks, spacers, guards, anchors. */
export const BY_ROW_PARTS = ['Upright frame', 'Beam', 'Wire deck', 'Row spacer', 'Upright guard', 'End-of-aisle guard', 'Anchor']
/** A line's quantity as shown: beams with their pairs beside ("18 (9 pairs)"). */
export const qtyText = (l) => (l.part === 'Beam' ? `${l.qty.toLocaleString('en-US')} (${l.pairs.toLocaleString('en-US')} pair${l.pairs === 1 ? '' : 's'})` : l.qty.toLocaleString('en-US'))
/** A part's name and size as the tables show them (ui-polish-4: Part | Size, "Frame" | "21 ft x 42 in"). */
const SHORT = { 'Upright frame': 'Frame' }
export const partShort = (part) => SHORT[part] || part
export const sizeWords = (s) => String(s || '').replace(/(\d+(?:\.\d+)?)′-(\d+(?:\.\d+)?)″/g, '$1 ft $2 in').replace(/(\d+(?:\.\d+)?)′/g, '$1 ft').replace(/(\d+(?:\.\d+)?)″/g, '$1 in').replace(/ × /g, ' x ')
/** A part on one line: "Frame 21 ft x 42 in", "Beam 96 in x 4 in face", "Anchor". */
export const partName = (l) => [partShort(l.part), l.size ? sizeWords(l.size) : ''].filter(Boolean).join(' ')
export const UNASSIGNED = 'unassigned'
const BEAM = new Set(['rack_row', 'rack_double_row'])
const isBomRack = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && o.width > 0 && o.height > 0
const OTHER_RACK = /^rack_/
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
const footprint = (r) => {
  if (norm(r.rotation) % 180 === 90) { const cx = r.x + r.width / 2, cy = r.y + r.height / 2; return { x: cx - r.height / 2, y: cy - r.width / 2, w: r.height, h: r.width, rotated: true } }
  return { x: r.x, y: r.y, w: r.width, h: r.height, rotated: false }
}
const n2 = (v) => Math.round(v * 100) / 100
/** 192 → 16′; 198 → 16′-6″ */
export const ftIn = (inches) => { const v = Math.round(inches), f = Math.floor(v / 12), i = v - f * 12; return i ? `${f}′-${i}″` : `${f}′` }
const inch = (v) => `${n2(v)}″`

/** The deck set for a beam length (in): its widths, or null with no row for it (within ½"). */
export function deckSet(decks, beamIn) {
  const row = (decks || []).find(d => Math.abs(Number(d.beamIn) - beamIn) <= 0.5)
  return row ? (row.widthsIn || []).map(Number).filter(w => w > 0) : null
}

/**
 * The BOM of a layout.
 * @param objects   the layout's objects (the store's `objects`)
 * @param T         its elevations table (the store's `elevations`; the project rides on it)
 * @param opts      { gridSize = 40, settings (else the project's) }
 * @returns { lines: [{ key, part, size, qty, pairs (beams), ids: [rackId], rows: { [no]: qty, ['p' + no]: pairs } }]
 *   (the total), sections: [{ id, name, rows: [no], lines }] (each drawn section, then Unassigned when it has lines),
 *   rows: [{ no, label 'R1', sectionId, ids, ws, bays (its counted bays, on its side) }], hasSections, flags: [{ key, text, ids }], counted: { racks, bays } }
 */
export function computeBom(objects, T, { gridSize = 40, settings = null } = {}) {
  const S = settings || bomSettings(T?.project)
  const racks = (objects || []).filter(isBomRack)
  const ledger = bayLedger(objects || [], gridSize, T)
  const flags = new Map(), entries = [], baysOn = new Map()
  // the rack lines (R1 …) and which line each rack side is on
  const numbered = numberLines(objects || [], gridSize)
  const lineOf = new Map()
  for (const l of numbered) for (const id of l.ids) lineOf.set(id + ':' + l.ws, l.no)
  const noOf = (r, s) => lineOf.get(r.id + ':' + worldSide(r, s)) ?? 0
  const add = (part, size, qty, id, sort = 0, no = 0, pairs = 0) => {
    if (!(qty > 0)) return
    entries.push({ key: part + '|' + size, part, size, qty, pairs, id, sort, no })
  }
  const flag = (key, text, id) => { if (!flags.has(key)) flags.set(key, { key, text, ids: new Set(), n: 0 }); const f = flags.get(key); f.n++; f.ids.add(id); f.text = typeof text === 'function' ? text(f.n) : text }
  const fallback = typeById(T, T?.defaultId)

  /** The elevation of bay `b` side `s`: its own, else the default (flagged). */
  const elevOf = (r, b, s) => {
    const t = typeAt(r, b, s, T)
    if (t) return t
    flag('no-elev', (n) => `${n} bay side${n === 1 ? '' : 's'} with no elevation — counted with the default`, r.id)
    // (a tunnel bay: the default less its tunnel's levels — tunnel round)
    return tunnelType(fallback, tunnelAt(r, b))
  }

  for (const r of racks) {
    const e = ledger.racks.get(r.id)
    if (!e) continue
    const depth = r.depthIn ?? 42, sides = sidesOf(r)
    // the bays on each line: every counted bay side that is not empty
    for (let s = 0; s < sides; s++) r.beams.forEach((_, b) => { if (e.counted[b] && !isEmptySide(r, b, s)) { const no = noOf(r, s); baysOn.set(no, (baysOn.get(no) || 0) + 1) } })
    // beams, pins and decks: every counted bay side that is not empty
    for (let s = 0; s < sides; s++) r.beams.forEach((beamIn, b) => {
      if (!e.counted[b] || isEmptySide(r, b, s)) return
      const t = elevOf(r, b, s)
      // the beam levels as the elevation sheet draws them (elevations.js drawnLevels: a level above 0 has a beam pair);
      // no elevation at all: the rack's levels, level 1 on the floor
      // (a tunnel bay without a types table: its bottom levels — the floor one first — gone; tunnel round)
      const tn = Array.isArray(r.tunnelBays) ? r.tunnelBays[b] || 0 : 0
      const beamed = t ? beamLevelCount(t) : tn ? Math.max(0, (r.levels || 1) - tn) : Math.max(0, (r.levels || 1) - 1)
      if (!beamed) return
      const face = beamFace(t), no = noOf(r, s)
      add('Beam', `${inch(beamIn)} × ${inch(face)} face`, beamed * 2, r.id, beamIn * 100 + face, no, beamed)
      add('Safety pin', '', beamed * 4, r.id, 0, no)
      const set = deckSet(S.decks, beamIn)
      if (!set || !set.length) { flag('deck-' + n2(beamIn), `Set decks for ${n2(beamIn)} in beams`, r.id); return }
      for (const w of set) add('Wire deck', `${inch(w)} × ${inch(depth)}`, beamed, r.id, w * 1000 + depth, no)
    })
    // frames: the ledger's (a shared one once; a pair side's only beside a bay of that side)
    /* a frame's height on its side: the taller of the bays it stands between there */
    const heightAt = (k, s) => {
      let h = null
      for (const b of [k - 1, k]) {
        if (b < 0 || b >= r.beams.length || !e.counted[b] || isEmptySide(r, b, s)) continue
        const t = typeAt(r, b, s, T) || fallback
        const v = t?.uprightHeightIn
        if (Number.isFinite(v) && (h == null || v > h)) h = v
      }
      return h
    }
    const sidesAt = e.frameSides || []
    sidesAt.forEach((list, k) => {
      for (const s of list) {
        const h = heightAt(k, s)
        add('Upright frame', h == null ? `height not set × ${inch(depth)}` : `${ftIn(h)} × ${inch(depth)}`, 1, r.id, (h || 0) * 1000 + depth, noOf(r, s))
        if (h == null) flag('no-height', (n) => `${n} frame${n === 1 ? '' : 's'} with no height (no elevation)`, r.id)
        add('Anchor', '', 2 * (Number(S.anchorsPerFoot) || 0), r.id, 0, noOf(r, s))
      }
      // a back-to-back pair's two frames at this upright: tied by row spacers between them — 1 up to the height set, 2
      // above; 2: one on each side's line, 1: on the pair's first line
      if (r.type === 'rack_double_row' && list.includes(0) && list.includes(1)) {
        const h = Math.max(heightAt(k, 0) || 0, heightAt(k, 1) || 0)
        const n = h > (Number(S.spacerBreakFt) || 16) * 12 + 1e-6 ? SPACERS_ABOVE : SPACERS_UP_TO
        const flue = r.flueSpaceIn || 9, size = `${inch(flue)} flue`, a = noOf(r, 0), b = noOf(r, 1)
        if (n >= 2) { add('Row spacer', size, 1, r.id, flue, Math.min(a, b)); add('Row spacer', size, n - 1, r.id, flue, Math.max(a, b)) }
        else add('Row spacer', size, n, r.id, flue, Math.min(a, b))
      }
    })
  }

  // guards at the row ends that face an aisle (dealer's choice: off unless set)
  if (S.uprightGuards || S.endGuards) for (const end of rowEnds(objects || [], racks, ledger, gridSize)) {
    if (!end.aisle) continue
    // an upright guard on each end frame, on its side's line; the end guard on the pair's first line
    const r = racks.find(x => x.id === end.rackId), nos = end.sides.map(s => noOf(r, s))
    if (S.uprightGuards) for (const no of nos) add('Upright guard', '', 1, end.rackId, 0, no)
    if (S.endGuards) add('End-of-aisle guard', '', 1, end.rackId, 0, nos.length ? Math.min(...nos) : 0)
  }

  const others = (objects || []).filter(o => OTHER_RACK.test(o.type || '') && !isBomRack(o))
  if (others.length) for (const o of others) flag('other', (n) => `${n} rack${n === 1 ? '' : 's'} of another kind not in this BOM (selective and back-to-back only)`, o.id)

  // the lines R1 … that have a count, each in the drawn section holding its middle (else Unassigned)
  const secs = (objects || []).filter(isSection), polys = secs.map(polygonOf)
  const counted = new Set(entries.map(e => e.no))
  const rows = numbered.filter(l => counted.has(l.no)).map(l => {
    const a = (l.r0 + l.r1) / 2, c = (l.s0 + l.s1) / 2, x = l.vert ? c : a, y = l.vert ? a : c
    const i = polys.findIndex(p => pointInPolygon(p, x, y))
    return { no: l.no, label: 'R' + l.no, sectionId: i >= 0 ? secs[i].id : UNASSIGNED, ids: l.ids, ws: l.ws, bays: baysOn.get(l.no) || 0 }
  })
  const secOf = new Map(rows.map(r => [r.no, r.sectionId]))
  const sections = [...secs.map(s => ({ id: s.id, name: s.label || 'Section' })), { id: UNASSIGNED, name: 'Unassigned' }]
    .map(s => ({ ...s, rows: rows.filter(r => r.sectionId === s.id).map(r => r.no), lines: linesOf(entries.filter(e => (secOf.get(e.no) || UNASSIGNED) === s.id)) }))
    .filter(s => s.id !== UNASSIGNED || s.lines.length)
  return {
    lines: linesOf(entries),
    sections,
    rows,
    hasSections: secs.length > 0,
    flags: [...flags.values()].map(({ key, text, ids }) => ({ key, text, ids: [...ids] })),
    counted: { racks: racks.filter(r => ledger.racks.get(r.id)?.bays > 0).length, bays: racks.reduce((t, r) => t + (ledger.racks.get(r.id)?.bays || 0), 0) },
  }
}

/** Entries summed into lines (part order, then size): { key, part, size, qty, pairs, ids, rows: { [no]: qty,
 *  ['p' + no]: pairs } }. */
function linesOf(entries) {
  const m = new Map()
  for (const e of entries) {
    if (!m.has(e.key)) m.set(e.key, { key: e.key, part: e.part, size: e.size, qty: 0, pairs: 0, ids: new Set(), rows: {}, sort: e.sort })
    const l = m.get(e.key)
    l.qty += e.qty; l.pairs += e.pairs; l.ids.add(e.id); l.rows[e.no] = (l.rows[e.no] || 0) + e.qty
    if (e.pairs) l.rows['p' + e.no] = (l.rows['p' + e.no] || 0) + e.pairs
  }
  const order = (p) => PARTS.indexOf(p)
  return [...m.values()].sort((a, b) => order(a.part) - order(b.part) || a.sort - b.sort || a.size.localeCompare(b.size))
    .map(l => ({ key: l.key, part: l.part, size: l.size, qty: l.qty, pairs: l.pairs, ids: [...l.ids], rows: l.rows }))
}

/** The By row table (the Tally's By row, the full view's, the xlsx): the Bays row first (each line's counted bays),
 *  then the parts down (BY_ROW_PARTS; no pairs row — ui-polish-4), the lines R1 … Rn across grouped by section, each
 *  section's Total, the grand Total.
 *  → { groups: [{ id, name, rows: [no] }], parts: [{ key, part, size, bays (the Bays row), cells: { [no]: n },
 *  totals: { [sectionId]: n }, total }] } — a cell with nothing is 0. */
export function byRowTable(bom) {
  const groups = bom.sections.filter(s => s.rows.length).map(s => ({ id: s.id, name: s.name, rows: s.rows.slice().sort((a, b) => a - b) }))
  const parts = []
  const shown = bom.lines.filter(x => BY_ROW_PARTS.includes(x.part)).sort((a, b) => BY_ROW_PARTS.indexOf(a.part) - BY_ROW_PARTS.indexOf(b.part))
  const row = (key, part, size, at, bays = false) => {
    const cells = {}, totals = {}
    let total = 0
    for (const g of groups) {
      let t = 0
      for (const no of g.rows) { const v = at(no) || 0; cells[no] = v; t += v }
      totals[g.id] = t; total += t
    }
    parts.push({ key, part, size, bays, cells, totals, total })
  }
  const baysOf = new Map((bom.rows || []).map(r => [r.no, r.bays || 0]))
  row('bays', 'Bays', '', (no) => baysOf.get(no), true)
  for (const l of shown) row(l.key, l.part, l.size, (no) => l.rows[no])
  return { groups, parts }
}

/** Each row's two ends: { rackId, frames (the end frames there, a pair's both sides), aisle (the floor past it is open:
 *  inside a building, no rack or zone within AISLE_PROBE_IN) }. A row is a section: pieces joined end to end. */
export function rowEnds(objects, racks, ledger, gridSize = 40) {
  const sec = sectionMap(objects, gridSize), seen = new Set(), out = []
  const probe = (AISLE_PROBE_IN / 12) * gridSize
  const fps = objects.filter(o => /^fp_/.test(o.type || ''))
  const blockers = objects.filter(o => (OTHER_RACK.test(o.type || '') || /^zone_/.test(o.type || '')) && o.width > 0 && o.height > 0).map(o => ({ id: o.id, ...footprint(o) }))
  const inside = (b) => fps.some(f => b.x >= f.x - 1e-6 && b.y >= f.y - 1e-6 && b.x + b.w <= f.x + f.width + 1e-6 && b.y + b.h <= f.y + f.height + 1e-6)
  const hits = (b, ids) => blockers.some(o => !ids.has(o.id) && Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x) > 1e-6 && Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y) > 1e-6)
  for (const r of racks) {
    const ids = sec.get(r.id) || [r.id], k = ids.slice().sort().join(',')
    if (seen.has(k)) continue
    seen.add(k)
    const pieces = ids.map(id => racks.find(x => x.id === id)).filter(Boolean)
    if (!pieces.length || !pieces.some(p => (ledger.racks.get(p.id)?.bays || 0) > 0)) continue
    const fs = pieces.map(p => ({ p, f: footprint(p) })), rot = fs[0].f.rotated
    const lo = Math.min(...fs.map(q => (rot ? q.f.y : q.f.x))), hi = Math.max(...fs.map(q => (rot ? q.f.y + q.f.h : q.f.x + q.f.w)))
    const c0 = Math.min(...fs.map(q => (rot ? q.f.x : q.f.y))), c1 = Math.max(...fs.map(q => (rot ? q.f.x + q.f.w : q.f.y + q.f.h)))
    const set = new Set(ids)
    for (const [at, dir] of [[lo, -1], [hi, 1]]) {
      // the piece at this end, and its frames at that end
      const q = fs.find(x => Math.abs((dir < 0 ? (rot ? x.f.y : x.f.x) : (rot ? x.f.y + x.f.h : x.f.x + x.f.w)) - at) < 1e-6) || fs[0]
      const e = ledger.racks.get(q.p.id), runLow = norm(q.p.rotation) < 180   // stored bay order runs low → high below 180°
      const kEnd = (dir < 0) === runLow ? 0 : q.p.beams.length
      const frames = (e?.frameSides?.[kEnd] || []).length
      const box = rot ? { x: c0, y: dir < 0 ? at - probe : at, w: c1 - c0, h: probe } : { x: dir < 0 ? at - probe : at, y: c0, w: probe, h: c1 - c0 }
      out.push({ rackId: q.p.id, frames, sides: (e?.frameSides?.[kEnd] || []).slice(), aisle: inside(box) && !hits(box, set) })
    }
  }
  return out
}

/** The BOM's groups as shown (the tab, the full view's Summary, the CSV, the PDF): each section with its lines and rows,
 *  then the grand Total — with no drawn section, the Total alone. → [{ id, name, rows: [no], lines, total }] */
export function bomGroups(bom) {
  const total = { id: 'total', name: 'Total', rows: bom.rows.map(r => r.no), lines: bom.lines, total: true }
  return bom.hasSections ? [...bom.sections.map(s => ({ ...s, total: false })), total] : [total]
}
/** Rows as words: "R1–R4, R7". */
export function rowsText(nos) {
  const s = [...nos].sort((a, b) => a - b), out = []
  for (let i = 0; i < s.length; i++) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(j > i ? `R${s[i]}–R${s[j]}` : `R${s[i]}`); i = j }
  return out.join(', ')
}

/** The BOM as CSV — section, rows, part, size, qty, pairs (beams): each section's lines, then the Total; the flags
 *  first as comment lines. */
export function bomCsv(bom) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const rows = [['Section', 'Rows', 'Part', 'Size', 'Qty', 'Pairs']]
  for (const g of bomGroups(bom)) for (const l of g.lines) rows.push([g.name, rowsText(g.rows), l.part, l.size, l.qty, l.part === 'Beam' ? l.pairs : ''])
  return [...bom.flags.map(f => '# ' + f.text), ...rows.map(r => r.map(esc).join(','))].join('\r\n') + '\r\n'
}
