// rackLines.js — rack line numbers R1, R2 … (BOM round 2, STUDIO.md §7a BOM).
//
// A rack line is one line of beam racking: the selective rows (rack_row) or back-to-back pairs (rack_double_row) of
// one kind standing end to end in one line — butting or sharing an upright, the same depth across. A row line CUT BY
// CROSS-AISLES stays one line (fixes-x — was: a cross-aisle started a new line): racks in one line across a gap with no
// rack standing in it, both carrying a section stamp (genSection — every cross-aisle's racks do: Generate's, Fill's, the
// Cross aisle tool's) and in one drawn section, are one line, one number; its stretches between the gaps are its PIECES (each labelled with the
// number). A single row is one line; a back-to-back pair is TWO lines, its two sides.
//
// Numbering: always R1 to Rn in order, no gaps, recomputed whenever rows are added, deleted or moved — section by
// section, in the Sections list's order (the layout's), then Unassigned (a line is in the drawn section holding its
// middle), one continuous run, so a row added or deleted in a later section never renumbers an earlier one. Inside each
// (with no section drawn: the whole building, as one), by position — left to right across the building for rows that run up and down, top to bottom for rows that run across (then left
// to right along one row line), each building in turn (within one, the up-and-down rows first); a pair's two sides
// one after the other, its left (top) side first. Nothing is stored: the plan's labels and the BOM read this same
// computation.

import { rackFootprint } from '../generate/rackFootprint'
import { faceIndex } from '../generate/faceAisles'
import { isSection, polygonOf, pointInPolygon } from './sectionAreas'

const BEAM = new Set(['rack_row', 'rack_double_row'])
const isLineRack = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && o.width > 0 && o.height > 0
const norm = (r) => ((((r || 0) % 360) + 360) % 360)

/** A rack in world px along its run (r0..r1) and across (s0..s1). */
function span(o) {
  const f = rackFootprint(o), vert = !!f.rotated
  return { vert, r0: vert ? f.y : f.x, r1: vert ? f.y + f.h : f.x + f.w, s0: vert ? f.x : f.y, s1: vert ? f.x + f.w : f.y + f.h }
}
/** Do racks `a` and `b` stand end to end in one line (one kind, one building, the same band across)? */
function inLine(a, b, gridSize) {
  if (a.type !== b.type || (a.parentId ?? null) !== (b.parentId ?? null) || norm(a.rotation) % 180 !== norm(b.rotation) % 180) return false
  const A = span(a), B = span(b)
  if (A.vert !== B.vert || Math.abs(A.s0 - B.s0) > 0.5 || Math.abs(A.s1 - B.s1) > 0.5) return false
  const up = Math.max(a.uprightWidth || 3, b.uprightWidth || 3) / 12 * gridSize
  const gap = Math.max(A.r0, B.r0) - Math.min(A.r1, B.r1)
  return gap <= 1 && gap >= -(up + 1)
}

/** Do racks `a` and `b` stand in one line across a cross-aisle (fixes-x): one kind, one building, the same band across,
 *  both section-stamped, a gap between them along the run with no rack (of `racks`) standing in it? */
function acrossGap(a, b, racks) {
  if (a.genSection == null || b.genSection == null) return false
  if (a.type !== b.type || (a.parentId ?? null) !== (b.parentId ?? null) || norm(a.rotation) % 180 !== norm(b.rotation) % 180) return false
  const A = span(a), B = span(b)
  if (A.vert !== B.vert || Math.abs(A.s0 - B.s0) > 0.5 || Math.abs(A.s1 - B.s1) > 0.5) return false
  const g0 = Math.min(A.r1, B.r1), g1 = Math.max(A.r0, B.r0)
  if (!(g1 - g0 > 1)) return false
  return !racks.some(q => {
    if (q === a || q === b) return false
    const Q = span(q), c0 = Q.vert === A.vert ? Q.s0 : Q.r0, c1 = Q.vert === A.vert ? Q.s1 : Q.r1, r0 = Q.vert === A.vert ? Q.r0 : Q.s0, r1 = Q.vert === A.vert ? Q.r1 : Q.s1
    return Math.min(c1, A.s1) - Math.max(c0, A.s0) > 0.5 && Math.min(r1, g1) - Math.max(r0, g0) > 0.5
  })
}

/** The world side ('lo' | 'hi' across) of local side `s` of rack `r` — 'one' for a single row. */
export const worldSide = (r, s) => (r.type === 'rack_double_row' ? (faceIndex(r, 'lo') === s ? 'lo' : 'hi') : 'one')

const cache = new WeakMap()
/** The rack lines of `objects`, in numbering order (before the numbers): [{ key, ids (run order), ws ('lo' | 'hi' |
 *  'one'), vert, r0, r1 (along), s0, s1 (across, this side's band), fpId, pieces: [{ r0, r1, ids }] (its stretches between
 *  cross-aisles, along) }]. A pair gives two, its 'lo' side first. */
export function rackLinesOf(objects, gridSize = 40) {
  if (!Array.isArray(objects)) return []
  const hit = cache.get(objects)
  if (hit && hit.gridSize === gridSize) return hit.lines
  const racks = objects.filter(isLineRack)
  const parent = new Map(racks.map(o => [o.id, o.id]))
  const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id }
  for (let i = 0; i < racks.length; i++) for (let j = i + 1; j < racks.length; j++) if (inLine(racks[i], racks[j], gridSize)) parent.set(find(racks[i].id), find(racks[j].id))
  // a row line cut by cross-aisles: one line (fixes-x)
  // (only inside one drawn section: a line in two sections is two lines, each numbered with its own section)
  const all = objects.filter(o => typeof o?.type === 'string' && o.type.startsWith('rack_') && o.width > 0 && o.height > 0)
  const secPolys = objects.filter(isSection).map(polygonOf)
  const secOf = new Map(racks.map(o => { const f = rackFootprint(o), x = f.x + f.w / 2, y = f.y + f.h / 2; return [o.id, secPolys.findIndex(q => pointInPolygon(q, x, y))] }))
  for (let i = 0; i < racks.length; i++) for (let j = i + 1; j < racks.length; j++) if (find(racks[i].id) !== find(racks[j].id) && secOf.get(racks[i].id) === secOf.get(racks[j].id) && acrossGap(racks[i], racks[j], all)) parent.set(find(racks[i].id), find(racks[j].id))
  const comps = new Map()
  for (const o of racks) { const k = find(o.id); if (!comps.has(k)) comps.set(k, []); comps.get(k).push(o) }
  const fpOrder = new Map(objects.filter(o => /^fp_/.test(o.type || '')).map((o, i) => [o.id, i]))
  const lines = []
  for (const list of comps.values()) {
    const sp = list.map(o => ({ o, s: span(o) })).sort((p, q) => p.s.r0 - q.s.r0)
    const ids = sp.map(p => p.o.id), first = sp[0].s
    const r0 = Math.min(...sp.map(p => p.s.r0)), r1 = Math.max(...sp.map(p => p.s.r1)), s0 = first.s0, s1 = first.s1
    // its pieces: the racks end to end between its cross-aisles
    const pieces = []
    for (const p of sp) { const last = pieces[pieces.length - 1]; if (last && p.s.r0 - last.r1 <= 1) { last.r1 = Math.max(last.r1, p.s.r1); last.ids.push(p.o.id) } else pieces.push({ r0: p.s.r0, r1: p.s.r1, ids: [p.o.id] }) }
    const base = { ids, pieces, vert: first.vert, r0, r1, band: (s0 + s1) / 2, fpId: sp[0].o.parentId ?? null, fpAt: fpOrder.get(sp[0].o.parentId) ?? 1e9 }
    if (sp[0].o.type === 'rack_double_row') {
      const mid = (s0 + s1) / 2
      lines.push({ ...base, key: ids[0] + ':lo', ws: 'lo', s0, s1: mid }, { ...base, key: ids[0] + ':hi', ws: 'hi', s0: mid, s1 })
    } else lines.push({ ...base, key: ids[0] + ':one', ws: 'one', s0, s1 })
  }
  // section by section (the drawn section holding the line's middle, in the layout's order; Unassigned last), then left
  // to right (rows running up and down), then top to bottom (rows running across); each building in turn (a pair by
  // its whole band, so its two sides are numbered one after the other)
  const polys = objects.filter(isSection).map(polygonOf)
  for (const l of lines) {
    const a = (l.r0 + l.r1) / 2, x = l.vert ? l.band : a, y = l.vert ? a : l.band
    const i = polys.findIndex(q => pointInPolygon(q, x, y))
    l.secAt = i >= 0 ? i : polys.length
  }
  const wsAt = { lo: 0, one: 0, hi: 1 }
  lines.sort((a, b) => a.secAt - b.secAt || a.fpAt - b.fpAt || (a.vert === b.vert ? 0 : a.vert ? -1 : 1) || a.band - b.band || a.r0 - b.r0 || wsAt[a.ws] - wsAt[b.ws])
  cache.set(objects, { gridSize, lines })
  return lines
}

/** The numbers: R1 to Rn in position order (rackLinesOf's), no gaps. → [{ ...line, no }]. */
export function numberLines(objects, gridSize = 40) {
  return rackLinesOf(objects, gridSize).map((l, i) => ({ ...l, no: i + 1 }))
}

/** The numbered lines of a layout (what the BOM and the plan's labels read). */
export const rackLinesNow = (objects, gridSize = 40) => numberLines(objects, gridSize)
