// rackLines.js — rack line numbers R1, R2 … (BOM round 2, STUDIO.md §7a BOM).
//
// A rack line is one line of beam racking: the selective rows (rack_row) or back-to-back pairs (rack_double_row) of
// one kind standing end to end in one line — butting or sharing an upright, the same depth across — never across a
// gap (a cross-aisle starts a new line). A single row is one line; a back-to-back pair is TWO lines, its two sides.
//
// Numbering: left to right across the building for rows that run up and down, top to bottom for rows that run across
// (each building in turn; within one, the up-and-down rows first) — a pair's two sides one after the other, its left
// (top) side first. Once given, a
// number stays: it is kept on the layout's elevation table as `rackLines` ({ "<rackId>:<side>": n }, side 'lo' | 'hi'
// for a pair's sides across, 'one' for a single row), so it is saved, undone and loaded with the layout. A line with
// no number yet (a new row, a copy) takes the next numbers after the highest in use, in the same order; two lines
// claiming one number (a copy of a numbered row) — the first in that order keeps it. The keeper writes the table
// without a history entry, folded into the current one (as the elevations keeper does).

import { rackFootprint } from '../generate/rackFootprint'
import { faceIndex } from '../generate/faceAisles'
import { snapshotOf } from './elevations'

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

/** The world side ('lo' | 'hi' across) of local side `s` of rack `r` — 'one' for a single row. */
export const worldSide = (r, s) => (r.type === 'rack_double_row' ? (faceIndex(r, 'lo') === s ? 'lo' : 'hi') : 'one')

const cache = new WeakMap()
/** The rack lines of `objects`, in numbering order (before the numbers): [{ key, ids (run order), ws ('lo' | 'hi' |
 *  'one'), vert, r0, r1 (along), s0, s1 (across, this side's band), fpId }]. A pair gives two, its 'lo' side first. */
export function rackLinesOf(objects, gridSize = 40) {
  if (!Array.isArray(objects)) return []
  const hit = cache.get(objects)
  if (hit && hit.gridSize === gridSize) return hit.lines
  const racks = objects.filter(isLineRack)
  const parent = new Map(racks.map(o => [o.id, o.id]))
  const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id }
  for (let i = 0; i < racks.length; i++) for (let j = i + 1; j < racks.length; j++) if (inLine(racks[i], racks[j], gridSize)) parent.set(find(racks[i].id), find(racks[j].id))
  const comps = new Map()
  for (const o of racks) { const k = find(o.id); if (!comps.has(k)) comps.set(k, []); comps.get(k).push(o) }
  const fpOrder = new Map(objects.filter(o => /^fp_/.test(o.type || '')).map((o, i) => [o.id, i]))
  const lines = []
  for (const list of comps.values()) {
    const sp = list.map(o => ({ o, s: span(o) })).sort((p, q) => p.s.r0 - q.s.r0)
    const ids = sp.map(p => p.o.id), first = sp[0].s
    const r0 = Math.min(...sp.map(p => p.s.r0)), r1 = Math.max(...sp.map(p => p.s.r1)), s0 = first.s0, s1 = first.s1
    const base = { ids, vert: first.vert, r0, r1, band: (s0 + s1) / 2, fpId: sp[0].o.parentId ?? null, fpAt: fpOrder.get(sp[0].o.parentId) ?? 1e9 }
    if (sp[0].o.type === 'rack_double_row') {
      const mid = (s0 + s1) / 2
      lines.push({ ...base, key: ids[0] + ':lo', ws: 'lo', s0, s1: mid }, { ...base, key: ids[0] + ':hi', ws: 'hi', s0: mid, s1 })
    } else lines.push({ ...base, key: ids[0] + ':one', ws: 'one', s0, s1 })
  }
  // left to right (rows running up and down), then top to bottom (rows running across); each building in turn
  // (a pair by its whole band, so its two sides are numbered one after the other)
  const wsAt = { lo: 0, one: 0, hi: 1 }
  lines.sort((a, b) => a.fpAt - b.fpAt || (a.vert === b.vert ? 0 : a.vert ? -1 : 1) || a.band - b.band || a.r0 - b.r0 || wsAt[a.ws] - wsAt[b.ws])
  cache.set(objects, { gridSize, lines })
  return lines
}

/** The numbers: `stored` (the table's `rackLines`) kept where they still name a line, new lines given the next ones.
 *  → { lines: [{ ...line, no }] in R order, map: the `rackLines` to store }. */
export function numberLines(objects, stored, gridSize = 40) {
  const lines = rackLinesOf(objects, gridSize), byId = new Map((objects || []).map(o => [o.id, o]))
  const map = stored || {}, used = new Set(), no = new Map()
  for (const l of lines) {
    // a number of any of its racks on this side (a split piece: its rack's), the lowest
    const known = []
    for (const id of l.ids) {
      for (const k of [id, byId.get(id)?.pieceOf, byId.get(id)?.splitOf].filter(Boolean)) {
        const v = map[k + ':' + l.ws]
        if (Number.isInteger(v) && v > 0) known.push(v)
      }
    }
    const n = known.filter(v => !used.has(v)).sort((a, b) => a - b)[0]
    if (n) { used.add(n); no.set(l, n) }
  }
  let next = Math.max(0, ...used)
  for (const l of lines) if (!no.has(l)) { next++; used.add(next); no.set(l, next) }
  const out = {}
  for (const l of lines) for (const id of l.ids) out[id + ':' + l.ws] = no.get(l)
  return { lines: lines.map(l => ({ ...l, no: no.get(l) })).sort((a, b) => a.no - b.no), map: out }
}

const sameMap = (a, b) => { const ka = Object.keys(a || {}), kb = Object.keys(b || {}); return ka.length === kb.length && ka.every(k => a[k] === b[k]) }

/** The numbered lines of the layout in store state `st` (what the BOM and the plan's labels read). */
export const rackLinesNow = (objects, table, gridSize = 40) => numberLines(objects, table?.rackLines, gridSize).lines

/** Keep the numbers on the table: every change of the racks, the numbers written without a history entry (folded into
 *  the current one). Returns the unsubscribe. */
export function installRackLinesKeeper(store) {
  let busy = false, lastObjects = null, lastTable = null
  const run = (st) => {
    if (busy || (st.objects === lastObjects && st.elevations === lastTable)) return
    lastObjects = st.objects; lastTable = st.elevations
    const T = st.elevations
    if (!T) return
    const { map } = numberLines(st.objects, T.rackLines, st.gridSize || 40)
    if (sameMap(map, T.rackLines)) return
    const table = { ...T, rackLines: map }, full = { elevations: table }
    // the current history entry carries them (redo kept: only that entry is rewritten)
    if (st.historyIndex >= 0 && st.history?.length > st.historyIndex) {
      const history = st.history.slice()
      history[st.historyIndex] = snapshotOf(st, st.objects, table)
      full.history = history
    }
    busy = true
    try { store.setState(full) } finally { busy = false }
    lastObjects = store.getState().objects; lastTable = store.getState().elevations
  }
  run(store.getState())
  return store.subscribe(run)
}
