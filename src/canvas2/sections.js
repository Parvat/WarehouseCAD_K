// canvas2/sections.js — a section: the racks that are one row piece on the plan (STUDIO.md §7, the section rule).
//
// A bay delete replaces a rack with its pieces (utils/baySplit.js, generate/faceReach.js). A bay deleted on ONE side
// of a back-to-back pair leaves the other side's bay standing — a one-side piece sharing an upright with the pair
// pieces either side — so the pair is still ONE section. Only when both facing bays at a position go is there a gap,
// and two sections; a single row splits at a middle bay the same way (a gap). So a section is the chain of pieces of
// one rack (the same root: `pieceOf`, else its own id) that touch end to end in one line — sharing an upright, or
// butting — never across a gap. The Split tool's pieces (`splitOf`) are two sections even where they still touch.
// Selection, the selection bar, the dimension labels and the Row group treat a section as one object.
// Nothing is stored: sections are read off the pieces, so a layout saved before this rule reads the same way.

import { rackFootprint } from '../generate/columnCheck'

const PIECE_TYPES = new Set(['rack_row', 'rack_double_row'])
export const isPiece = (o) => !!o && PIECE_TYPES.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0
const rootOf = (o) => o.pieceOf || o.id
const norm = (r) => ((((r || 0) % 360) + 360) % 360)

/** A piece in world px along its run (r0..r1) and across (s0..s1). */
function span(o) {
  const f = rackFootprint(o), vert = !!f.rotated
  return { vert, r0: vert ? f.y : f.x, r1: vert ? f.y + f.h : f.x + f.w, s0: vert ? f.x : f.y, s1: vert ? f.x + f.w : f.y + f.h }
}

/** Do pieces `a` and `b` (of one rack) touch end to end — butting, or sharing an upright? */
export function piecesTouch(a, b, gridSize = 40) {
  if (rootOf(a) !== rootOf(b) || (a.splitOf || null) !== (b.splitOf || null)) return false
  if ((a.parentId ?? null) !== (b.parentId ?? null) || norm(a.rotation) % 180 !== norm(b.rotation) % 180) return false
  const A = span(a), B = span(b)
  if (A.vert !== B.vert) return false
  if (Math.min(A.s1, B.s1) - Math.max(A.s0, B.s0) <= 0.5) return false                   // not in one line
  const up = Math.max(a.uprightWidth || 3, b.uprightWidth || 3) / 12 * gridSize
  const gap = Math.max(A.r0, B.r0) - Math.min(A.r1, B.r1)                                // < 0: they overlap
  return gap <= 1 && gap >= -(up + 1)
}

const cache = new WeakMap()
/** Every piece's section in `objects`: Map(id → [ids, run order]). */
export function sectionMap(objects, gridSize = 40) {
  if (!Array.isArray(objects)) return new Map()
  const hit = cache.get(objects)
  if (hit && hit.gridSize === gridSize) return hit.map
  const pieces = objects.filter(isPiece)
  const byRoot = new Map()
  for (const o of pieces) { const r = rootOf(o); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(o) }
  const map = new Map()
  for (const list of byRoot.values()) {
    if (list.length === 1) { map.set(list[0].id, [list[0].id]); continue }
    const parent = new Map(list.map(o => [o.id, o.id]))
    const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (piecesTouch(list[i], list[j], gridSize)) parent.set(find(list[i].id), find(list[j].id))
    const comps = new Map()
    for (const o of list) { const r = find(o.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(o) }
    for (const c of comps.values()) {
      const ids = c.sort((p, q) => span(p).r0 - span(q).r0).map(o => o.id)
      for (const id of ids) map.set(id, ids)
    }
  }
  cache.set(objects, { gridSize, map })
  return map
}
/** The section rack `id` is in (its ids), or [id] for anything that is not a piece. */
export const sectionIds = (objects, id, gridSize = 40) => sectionMap(objects, gridSize).get(id) || [id]
/** `ids` with every piece's whole section. */
export function withSections(objects, ids, gridSize = 40) {
  const m = sectionMap(objects, gridSize), out = []
  for (const id of ids) for (const x of m.get(id) || [id]) if (!out.includes(x)) out.push(x)
  return out
}
/** The sections among `ids` (each once, as its ids). */
export function sectionsOf(objects, ids, gridSize = 40) {
  const m = sectionMap(objects, gridSize), seen = new Set(), out = []
  for (const id of ids) { const s = m.get(id) || [id]; if (seen.has(s[0])) continue; seen.add(s[0]); out.push(s) }
  return out
}
/** Is `ids` exactly one section of two or more pieces? */
export function isOneSection(objects, ids, gridSize = 40) {
  if (ids.length < 2) return false
  const s = sectionIds(objects, ids[0], gridSize)
  return s.length === ids.length && ids.every(id => s.includes(id))
}

/** A section drawn as one rack for its labels and its box: the pair piece's look (else the first piece's), its run
 *  the union of the pieces' runs, its bays every piece's in run order. One piece: that piece. */
export function sectionView(objects, ids, gridSize = 40) {
  const pieces = ids.map(id => objects.find(o => o.id === id)).filter(isPiece)
  if (pieces.length <= 1) return pieces[0] || null
  const ordered = [...pieces].sort((p, q) => span(p).r0 - span(q).r0)
  const base = ordered.find(o => o.type === 'rack_double_row') || ordered[0]
  const S = ordered.map(span), r0 = Math.min(...S.map(s => s.r0)), r1 = Math.max(...S.map(s => s.r1))
  const bs = span(base), vert = bs.vert, rot = norm(base.rotation), back = rot === 180 || rot === 270
  // bays in run order (a turned-back piece lists its bays against the run)
  let beams = ordered.flatMap(o => { const t = norm(o.rotation); return t === 180 || t === 270 ? [...o.beams].reverse() : [...o.beams] })
  if (back) beams = beams.reverse()
  const up = base.uprightWidth || 3
  const width = ((up * (beams.length + 1) + beams.reduce((t, b) => t + b, 0)) / 12) * gridSize
  const cRun = (r0 + r1) / 2, cAcross = (bs.s0 + bs.s1) / 2
  const cx = vert ? cAcross : cRun, cy = vert ? cRun : cAcross
  return { ...base, id: base.id, beams, width, x: cx - width / 2, y: cy - base.height / 2, activeBayIdx: null, activeBaySide: null, sectionOf: ordered.map(o => o.id) }
}
