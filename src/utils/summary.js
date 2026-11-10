// summary.js — the right card's summary (STUDIO.md §7a Summary follows selection): the figures the Properties tab shows
// for the whole layout, a section, a rack line or pair, several racks or a bay. Pure: the layout in, figures out. Every
// number is one the app already counts, asked here, never recounted another way:
//   positions   the bay ledger's per rack (utils/capacity.js getLayoutCapacity — the Layout totals, the Sections list);
//               a rack line's the Tally's (studio/tally.js lineFigures: each counted bay side's, empty sides left out)
//   lost        generate/usableCapacity.js lostPositions — the blocks usableCapacity takes off, with their reason
//   bays        the BOM's (utils/bom.js): each counted bay side that is not empty, on its rack line
//   frames      the BOM's Upright frames: the ledger's frame sides, each on its side's rack line
//   parts       the BOM's By row table (byRowTable): a line's mini BOM is its column there
//   lines       the BOM's rows (R1 …); a section's are its BOM section's (the line's middle in it)

import { computeBom, byRowTable, partShort, sizeWords } from './bom'
import { bayLedger } from './bayLedger'
import { getRackCapacity } from './capacity'
import { typeAt, typeById, sidesOf, levelsResolver } from './elevations'
import { isEmptySide } from './bayEmpty'
import { numberLines, worldSide } from './rackLines'
import { positionsPerBeam } from './palletFit'
import { lostPositions } from '../generate/usableCapacity'
import { membership, isSection, areaOf } from './sectionAreas'

export const LOST_REASONS = [
  { key: 'narrow', label: 'Narrow aisle' },
  { key: 'column', label: 'Column' },
  { key: 'zone', label: 'Zone' },
  { key: 'other', label: 'Other' },
]
const isFp = (o) => typeof o?.type === 'string' && o.type.startsWith('fp_')

/** A building's floor area (world px²): its outline's, else its box. */
export function floorArea(fp) {
  const v = Array.isArray(fp?.fpVerts) && fp.fpVerts.length > 2 ? fp.fpVerts : null
  if (!v) return (fp?.width || 0) * (fp?.height || 0)
  let a = 0
  for (let i = 0; i < v.length; i++) { const p = v[i], q = v[(i + 1) % v.length]; a += p.x * q.y - q.x * p.y }
  return Math.abs(a) / 2
}

/**
 * What every scope reads, worked out once for the layout.
 * @param objects  the layout
 * @param T        its elevations table
 * @param opts     { gridSize, ledger, check (the column check's result), profile (the project forklift), bom }
 * → { objects, T, gridSize, ledger, bom, table (byRowTable), pos: Map(rackId → positions), sides: [{ rackId, b, s, no,
 *   typeId, levels, positions }], frames: [{ rackId, no }], lost: [lostPositions entries] }
 */
export function summaryBase(objects, T, { gridSize = 40, ledger = null, check, profile, bom = null } = {}) {
  const L = ledger || bayLedger(objects, gridSize, T)
  const B = bom || computeBom(objects, T, { gridSize })
  const lv = levelsResolver(T), fallback = typeById(T, T?.defaultId)
  const lineOf = new Map()
  for (const l of numberLines(objects, gridSize)) for (const id of l.ids) lineOf.set(id + ':' + l.ws, l.no)
  const pos = new Map(), sides = [], frames = []
  for (const o of objects) {
    if (typeof o?.type !== 'string' || !o.type.startsWith('rack_')) continue
    const e = L.racks.get(o.id)
    pos.set(o.id, e ? e.positions : (getRackCapacity(o)?.total || 0))
    if (!e || !Array.isArray(o.beams)) continue
    const noOf = (s) => lineOf.get(o.id + ':' + worldSide(o, s)) ?? 0
    for (let s = 0; s < sidesOf(o); s++) o.beams.forEach((beamIn, b) => {
      if (!e.counted[b] || isEmptySide(o, b, s)) return
      const levels = lv ? lv(o, b, s) : (o.levels || 1)
      const face = lv && lv.face ? lv.face(o, b, s) : (o.palletWIn || 40)
      sides.push({ rackId: o.id, b, s, no: noOf(s), typeId: (typeAt(o, b, s, T) || fallback)?.id ?? null, levels, positions: positionsPerBeam(beamIn, face) * levels })
    })
    ;(e.frameSides || []).forEach(list => { for (const s of list) frames.push({ rackId: o.id, no: noOf(s) }) })
  }
  const lost = lostPositions(objects, { profile, gridSize, check, ledger: L, elevations: T })
  return { objects, T, gridSize, ledger: L, bom: B, table: byRowTable(B), pos, sides, frames, lost }
}

/**
 * The figures of one scope.
 * @param D      summaryBase's result
 * @param scope  { rackIds: Set (the racks it holds; null: every rack), nos: Set (its rack lines; null: every line),
 *               lines: true (positions as the Tally counts a line), area: world px² (positions per 1,000 sq ft) }
 * → { positions, usable, lost, lostBy: { narrow, column, zone, other }, lostRacks: [rackId], perK (or null),
 *   lines, bays, frames, levels: [min, max] | null, elevations: [{ id, bays }], parts: [{ key, part, size, qty }] }
 */
export function scopeFigures(D, { rackIds = null, nos = null, lines = false, area = null } = {}) {
  const inR = (id) => !rackIds || rackIds.has(id)
  const inN = (no) => !nos || nos.has(no)
  const sides = D.sides.filter(x => (nos ? inN(x.no) : inR(x.rackId)))
  let positions = 0
  if (lines) for (const x of sides) positions += x.positions
  else for (const [id, n] of D.pos) if (inR(id)) positions += n
  const lostBy = { narrow: 0, column: 0, zone: 0, other: 0 }, lostRacks = new Set()
  for (const c of D.lost) if (inR(c.rackId)) { lostBy[c.reason] += c.n; lostRacks.add(c.rackId) }
  const lost = lostBy.narrow + lostBy.column + lostBy.zone + lostBy.other
  const el = new Map()
  for (const x of sides) el.set(x.typeId, (el.get(x.typeId) || 0) + 1)
  const lv = sides.map(x => x.levels)
  const lineNos = nos ? D.bom.rows.filter(r => nos.has(r.no)).map(r => r.no) : rackIds ? [...new Set(sides.map(x => x.no))].filter(no => D.bom.rows.some(r => r.no === no)) : D.bom.rows.map(r => r.no)
  const sqft = area > 0 ? area / (D.gridSize * D.gridSize) : 0
  return {
    positions, usable: positions - lost, lost, lostBy, lostRacks: [...lostRacks],
    perK: sqft > 0 ? (positions / sqft) * 1000 : null,
    lines: lineNos.length, bays: sides.length,
    frames: D.frames.filter(f => (nos ? inN(f.no) : inR(f.rackId))).length,
    levels: lv.length ? [Math.min(...lv), Math.max(...lv)] : null,
    elevations: [...el].map(([id, bays]) => ({ id, bays })),
    parts: nos ? miniBom(D, nos) : [],
  }
}

/** The parts of rack lines `nos` — their columns of the By row table summed (the Bays row left out): [{ key, part, size,
 *  name, qty }], parts with none dropped. */
export function miniBom(D, nos) {
  const out = []
  for (const p of D.table.parts) {
    if (p.bays) continue
    let qty = 0
    for (const no of nos) qty += p.cells[no] || 0
    if (qty > 0) out.push({ key: p.key, part: p.part, size: p.size, name: [partShort(p.part), p.size ? sizeWords(p.size) : ''].filter(Boolean).join(' '), qty })
  }
  return out
}

/** The rack lines rack `id` stands in (a pair's two; a pair's bay picked on one side, that side's). */
export function linesOfRack(D, obj) {
  const ws = obj.type === 'rack_double_row' && (obj.activeBaySide === 0 || obj.activeBaySide === 1) ? worldSide(obj, obj.activeBaySide) : null
  return D.bom.rows.filter(r => r.ids.includes(obj.id) && (ws == null || r.ws === ws))
}

/** A section's scope: its racks (the Sections list's: the rack's centre in it), its BOM section's lines, its area. */
export function sectionScope(D, s) {
  const m = membership(D.objects)
  const sec = D.bom.sections.find(x => x.id === s.id)
  return { rackIds: new Set(m.bySection.get(s.id) || []), nos: new Set(sec ? sec.rows : []), area: areaOf(s) }
}

/** The whole layout's scope: every rack and line, the buildings' floor. */
export function layoutScope(D) {
  return { rackIds: null, nos: null, area: D.objects.filter(isFp).reduce((t, f) => t + floorArea(f), 0) }
}

/** A bay's figures: its positions and levels on each side shown, lost if X-marked. `side`: one side, else every side. */
export function bayFigures(D, rackId, b, side = null) {
  const sides = D.sides.filter(x => x.rackId === rackId && x.b === b && (side == null || x.s === side))
  const lost = D.lost.filter(c => c.rackId === rackId && c.bayIndex === b && (side == null || !c.faces.length || c.faces.includes(side))).reduce((t, c) => t + c.n, 0)
  const lv = sides.map(x => x.levels)
  return { positions: sides.reduce((t, x) => t + x.positions, 0), lost, levels: lv.length ? [Math.min(...lv), Math.max(...lv)] : null, sides: sides.length }
}

export { isSection }
