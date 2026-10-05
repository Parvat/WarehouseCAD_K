// rowGroup.js — the Row group engine: which racks are one row, which rows a pick takes, what an edit to
// one row of the group was, and that edit replayed on every other row of the group, relative to it.
// Pure: no store, no React (utils/rowGroupTool.js watches the store; canvas2/RowGroupBar.jsx is the bar).
//
// A ROW is the racks in one line in one section:
//   - racks with the generator's / a racking area's stamps (rowIndex + genSection): one row per stamp
//     pair in a building — its gaps, lanes, single halves and split pieces all belong to it;
//   - racks placed by hand (no stamps): one row per line — same orientation, lined up across, chained
//     end to end by a shared frame, a touch or a gap narrower than a cross-aisle (10' 6").
// A wall row is one rack, so one row.
//
// An EDIT to exactly one group row is replayed on the others:
//   - bay edit (a beam length, a bay added or deleted): every target upright within ½" of a source
//     upright goes where that source upright went; uprights past the last such one move with it (their
//     own bays kept), uprights before the first stay. A bay the source deleted goes where both its
//     uprights line up; a bay added at an end is added where the target ends at that same upright. Then
//     a bay that would cross the target's own limit — a wall, a zone, a lane or cross-aisle under the
//     travel width — is dropped, never squeezed. A target none of whose uprights line up is skipped;
//   - move across: the same distance;
//   - delete row: the others deleted;
//   - a row added next to a group row: one next to each other group row, at the same distance across,
//     over that row's own racks (its own length, gaps and uprights).
// A target that can't take it is skipped with the reason: a column on an upright, an overlap, a wall, a
// zone, an aisle under the travel width, uprights that don't line up.

import { rackFootprint } from '../generate/columnCheck'

export const BEAM = new Set(['rack_row', 'rack_double_row'])
export const UP_TOL_FT = 0.5 / 12                          // uprights line up within ½"
const EPS = 1e-6
const norm = (r) => ((((r || 0) % 360) + 360) % 360)
const rightAngle = (o) => norm(o.rotation) % 90 === 0
export const isRowRack = (o) => !!o && BEAM.has(o.type) && Array.isArray(o.beams) && o.beams.length > 0 && o.width > 0 && rightAngle(o)
const stamped = (o) => o.rowIndex != null && o.genSection != null
const reversed = (o) => { const t = norm(o.rotation); return t === 180 || t === 270 }

/** A rack in world px: run (along), across, the orientation, its bays in run order (reversed racks flip). */
export function geom(o) {
  const f = rackFootprint(o), vert = !!f.rotated
  return { vert, r0: vert ? f.y : f.x, r1: vert ? f.y + f.h : f.x + f.w, s0: vert ? f.x : f.y, s1: vert ? f.x + f.w : f.y + f.h, beams: reversed(o) ? [...o.beams].reverse() : [...o.beams] }
}
/** Upright near faces along the run (world px), from a run start and bays in run order. */
export const uprightsOf = (r0, beams, upPx, gridSize) => { const u = [r0]; for (const b of beams) u.push(u[u.length - 1] + upPx + (b / 12) * gridSize); return u }
const upPxOf = (o, gridSize) => ((o.uprightWidth || 3) / 12) * gridSize

/** The rack `o` with its run starting at `r0` (world px) and `beamsRun` (in run order), held across. */
export function withRun(o, r0, beamsRun, gridSize) {
  const beams = reversed(o) ? [...beamsRun].reverse() : [...beamsRun]
  const up = o.uprightWidth || 3
  const width = ((up * (beams.length + 1) + beams.reduce((t, b) => t + b, 0)) / 12) * gridSize
  const vert = !!rackFootprint(o).rotated
  if (!vert) return { ...o, beams, width, x: r0, activeBayIdx: null }
  const cx = o.x + o.width / 2
  return { ...o, beams, width, x: cx - width / 2, y: r0 + width / 2 - o.height / 2, activeBayIdx: null }
}
/** The rack `o` moved `d` px across its run. */
export const movedAcross = (o, d) => (rackFootprint(o).rotated ? { ...o, x: o.x + d } : { ...o, y: o.y + d })

/* ── rows ─────────────────────────────────────────────────────────────────── */

/** Every row in `objects`: Map(key → { key, ids, fpId, vert }). Hand rows are keyed by the sorted root ids
 *  of their racks (a split piece's root is the rack it came from), so a row keeps its key through edits. */
export function rowsOf(objects, gridSize = 40) {
  const rows = new Map()
  const racks = objects.filter(isRowRack)
  for (const o of racks.filter(stamped)) {
    const key = `s|${o.parentId ?? ''}|${o.genSection}|${o.rowIndex}`
    if (!rows.has(key)) rows.set(key, { key, ids: [], fpId: o.parentId ?? null, vert: !!rackFootprint(o).rotated })
    rows.get(key).ids.push(o.id)
  }
  // hand racks: chained in one line
  const hand = racks.filter(o => !stamped(o)).map(o => ({ o, g: geom(o) }))
  const parent = new Map(hand.map(h => [h.o.id, h.o.id]))
  const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id }
  const CHAIN = 10.5 * gridSize
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
    const a = hand[i], b = hand[j]
    if (a.g.vert !== b.g.vert || (a.o.parentId ?? null) !== (b.o.parentId ?? null)) continue
    const acr = Math.min(a.g.s1, b.g.s1) - Math.max(a.g.s0, b.g.s0)
    if (acr < Math.min(a.g.s1 - a.g.s0, b.g.s1 - b.g.s0) / 2) continue
    const gap = Math.max(a.g.r0, b.g.r0) - Math.min(a.g.r1, b.g.r1)
    if (gap < CHAIN - EPS) parent.set(find(a.o.id), find(b.o.id))
  }
  const comps = new Map()
  for (const h of hand) { const r = find(h.o.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(h.o) }
  for (const list of comps.values()) {
    const roots = [...new Set(list.map(o => o.pieceOf || o.id))].sort()
    const key = `h|${roots.join(',')}`
    rows.set(key, { key, ids: list.map(o => o.id), fpId: list[0].parentId ?? null, vert: !!rackFootprint(list[0]).rotated, roots })
  }
  return rows
}
/** Whether the row stored as `key` is `row` now (a hand row: shares any root rack). */
export const sameRowKey = (key, row) => key === row.key || (key.startsWith('h|') && row.roots && key.slice(2).split(',').some(r => row.roots.includes(r)))
/** The current key of a stored group key, or null when that row is gone. */
export function resolveKey(rows, key) { for (const r of rows.values()) if (sameRowKey(key, r)) return r.key; return null }
/** The row rack `id` belongs to. */
export function rowOfRack(rows, id) { for (const r of rows.values()) if (r.ids.includes(id)) return r.key; return null }
/** The rows any rack of which overlaps world box `b` ({ x, y, w, h }). */
export function rowsInBox(objects, b, gridSize = 40) {
  const rows = rowsOf(objects, gridSize), out = new Set()
  for (const o of objects.filter(isRowRack)) {
    const f = rackFootprint(o)
    if (Math.min(f.x + f.w, b.x + b.w) - Math.max(f.x, b.x) > EPS && Math.min(f.y + f.h, b.y + b.h) - Math.max(f.y, b.y) > EPS) { const k = rowOfRack(rows, o.id); if (k) out.add(k) }
  }
  return [...out]
}
/** "+ Same row in other sections": the row `key` and the rows with its row number in the building's other
 *  sections (stamped), or in its line beyond a cross-aisle (by hand). */
export function sameRowOtherSections(objects, key, gridSize = 40) {
  const rows = rowsOf(objects, gridSize), me = rows.get(key)
  if (!me) return []
  if (key.startsWith('s|')) { const [, fp, , ri] = key.split('|'); return [...rows.keys()].filter(k => { const p = k.split('|'); return p[0] === 's' && p[1] === fp && p[3] === ri }) }
  const byId = new Map(objects.map(o => [o.id, o]))
  const band = (r) => { const gs = r.ids.map(id => geom(byId.get(id))); return [Math.min(...gs.map(g => g.s0)), Math.max(...gs.map(g => g.s1))] }
  const [a0, a1] = band(me)
  return [...rows.values()].filter(r => r.key === key || (r.key.startsWith('h|') && r.vert === me.vert && r.fpId === me.fpId && (() => { const [b0, b1] = band(r); return Math.min(a1, b1) - Math.max(a0, b0) > (a1 - a0) / 2 })())).map(r => r.key)
}

/* ── what the edit was ────────────────────────────────────────────────────── */

const GEOM_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'beams']
const sameRack = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sameExceptGeom = (a, b) => { const strip = (o) => { const c = { ...o }; for (const k of [...GEOM_KEYS, 'activeBayIdx', 'pieceOf', 'genRunFt', 'genCrossFt', 'id', 'flueSpaceIn']) delete c[k]; return JSON.stringify(c) }; return strip(a) === strip(b) }

/** What one action did to the group. `groupKeys` are the group's row keys BEFORE the action.
 *  Returns { kind: 'none' } | { kind: 'multi', count } | { kind: 'other', why } |
 *  { kind: 'bays'|'across'|'delete'|'add', source, ... } (source = the edited row's key before). */
export function classifyEdit(before, after, groupKeys, gridSize = 40) {
  const rowsB = rowsOf(before, gridSize), rowsA = rowsOf(after, gridSize)
  const B = new Map(before.filter(isRowRack).map(o => [o.id, o])), A = new Map(after.filter(isRowRack).map(o => [o.id, o]))
  const changed = new Set()
  for (const [id, o] of B) if (!A.has(id) || !sameRack(o, A.get(id))) changed.add(id)
  const added = [...A.values()].filter(o => !B.has(o.id))
  // racks of group rows the action touched (a split piece belongs to the row of the rack it came from)
  const keys = groupKeys.map(k => resolveKey(rowsB, k)).filter(Boolean)
  const touched = keys.filter(k => rowsB.get(k).ids.some(id => changed.has(id)) || added.some(o => o.pieceOf && rowsB.get(k).ids.includes(o.pieceOf)))
  if (touched.length > 1) return { kind: 'multi', count: touched.length }
  if (!touched.length) {
    // a new row next to a group row
    const fresh = added.filter(o => !o.pieceOf)
    if (!fresh.length || changed.size) return { kind: 'none' }
    const n = fresh[0], g = geom(n)
    let best = null
    for (const k of keys) for (const id of rowsB.get(k).ids) {
      const q = geom(B.get(id))
      if (q.vert !== g.vert || !(Math.min(q.r1, g.r1) - Math.max(q.r0, g.r0) > EPS)) continue
      const d = Math.min(Math.abs(g.s0 - q.s1), Math.abs(q.s0 - g.s1))
      if (!best || d < best.d) best = { d, key: k, offset: g.s0 - Math.min(...rowsB.get(k).ids.map(i => geom(B.get(i)).s0)) }
    }
    if (!best || best.d > 3 * 10.5 * gridSize) return { kind: 'none' }
    return { kind: 'add', source: best.key, offset: best.offset, template: n, addedIds: fresh.map(o => o.id) }
  }
  const source = touched[0], srcB = rowsB.get(source).ids.map(id => B.get(id))
  // a rack's successors: itself and the pieces this action split off it (a rack that was already there with
  // pieceOf pointing here — a pair's free half — is its own rack, not a new piece)
  const succ = (r) => [...A.values()].filter(o => o.id === r.id || (o.pieceOf === r.id && !B.has(o.id)))
  if (srcB.every(r => !succ(r).length) && !added.some(o => !o.pieceOf)) return { kind: 'delete', source }
  // the source's racks after, matched to before
  const pairs = srcB.map(r => ({ r, s: succ(r) }))
  if (pairs.some(p => !p.s.length) || added.some(o => !o.pieceOf && !srcB.some(r => r.id === o.pieceOf))) return { kind: 'other', source, why: 'that kind of change' }
  const gB = (o) => geom(o)
  // move across: every rack shifted the same across, nothing else changed
  const one = pairs.every(p => p.s.length === 1)
  // the delta across is centre to centre: a live-flue drag that narrows the rack (12" → 9") moves it exactly the drag
  if (one) {
    const ds = pairs.map(p => { const a = gB(p.r), b = gB(p.s[0]); return { dS: (b.s0 + b.s1 - a.s0 - a.s1) / 2, dR: b.r0 - a.r0, same: JSON.stringify(a.beams) === JSON.stringify(b.beams) && sameExceptGeom(p.r, p.s[0]) } })
    if (ds.every(d => d.same && Math.abs(d.dR) < EPS) && ds.every(d => Math.abs(d.dS - ds[0].dS) < EPS) && Math.abs(ds[0].dS) > EPS) return { kind: 'across', source, delta: ds[0].dS }
    if (ds.every(d => d.same && Math.abs(d.dS) < EPS) && ds.some(d => Math.abs(d.dR) > EPS)) return { kind: 'other', source, why: 'a move along the row' }
  }
  // a bay edit: positions across unchanged, the uprights mapped
  const tol = UP_TOL_FT * gridSize
  const map = [], deleted = [], appended = []
  for (const { r, s } of pairs) {
    const a = gB(r), up = upPxOf(r, gridSize), U = uprightsOf(a.r0, a.beams, up, gridSize)
    if (s.some(o => Math.abs(gB(o).s0 - a.s0) > EPS || Math.abs(gB(o).s1 - a.s1) > EPS)) return { kind: 'other', source, why: 'a change across with its bays' }
    if (s.some(o => !sameExceptGeom(r, o))) return { kind: 'other', source, why: 'a change of levels, depth or kind' }
    if (s.length === 1) {
      const b = gB(s[0]), V = uprightsOf(b.r0, b.beams, up, gridSize), n = a.beams.length, m = b.beams.length
      if (m === n && Math.abs(V[0] - U[0]) < tol) { U.forEach((u, i) => map.push([u, V[i]])); continue }
      if (m > n && Math.abs(V[0] - U[0]) < tol && a.beams.every((x, i) => x === b.beams[i])) { U.forEach((u, i) => map.push([u, V[i]])); appended.push({ at: U[n], side: 1, beams: b.beams.slice(n) }); continue }
      if (m > n && Math.abs(V[m] - U[n]) < tol && a.beams.every((x, i) => x === b.beams[m - n + i])) { U.forEach((u, i) => map.push([u, V[m - n + i]])); appended.push({ at: U[0], side: -1, beams: b.beams.slice(0, m - n) }); continue }
    }
    // bays deleted: every upright after is one of the uprights before
    const kept = new Set()
    let ok = true
    for (const o of s) {
      const b = gB(o), V = uprightsOf(b.r0, b.beams, up, gridSize)
      const idx = V.map(v => U.findIndex(u => Math.abs(u - v) < tol))
      if (idx.some(i => i < 0) || idx.some((v, i) => i && v !== idx[i - 1] + 1)) { ok = false; break }
      for (let i = 0; i + 1 < idx.length; i++) kept.add(idx[i])
    }
    if (!ok) return { kind: 'other', source, why: 'a change of bays it can\'t follow' }
    U.forEach(u => map.push([u, u]))
    for (let i = 0; i + 1 < U.length; i++) if (!kept.has(i)) deleted.push([U[i], U[i + 1]])
  }
  if (!deleted.length && !appended.length && map.every(([u, v]) => Math.abs(u - v) < EPS)) return { kind: 'none' }
  return { kind: 'bays', source, map, deleted, appended }
}

/* ── the replay on one target row ─────────────────────────────────────────── */

/** The floor along the run at a band across, as world-px intervals (inner outline, even-odd). */
function floorAlong(poly, vert, s0, s1, lo, hi) {
  const ivs = []
  for (const sv of [s0 + 0.5, (s0 + s1) / 2, s1 - 0.5]) {
    const cuts = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length]
      const [as, cs, ar, cr] = vert ? [a.x, c.x, a.y, c.y] : [a.y, c.y, a.x, c.x]
      if (Math.abs(ar - cr) > EPS) continue                                // an edge across the run
      if (sv > Math.min(as, cs) + EPS && sv < Math.max(as, cs) - EPS) cuts.push(ar)
    }
    cuts.sort((p, q) => p - q)
    const here = []
    for (let i = 0; i + 1 < cuts.length; i += 2) here.push([Math.max(lo, cuts[i]), Math.min(hi, cuts[i + 1])])
    ivs.push(here)
  }
  return ivs
}

/** Plan the replay of `edit` on every group row but its source, in `after` (the layout with the edit).
 *  `ctx` = { gridSize, poly (inner outline world px, per building: fpId → points), columns (world px rects),
 *  travelFt, newId }. Returns { targets: [{ key, status: 'apply'|'skip'|'none', reason, dropped, racks,
 *  removeIds, addRacks, droppedBays: [world rects] }] }. */
export function planReplay(after, edit, groupKeys, ctx) {
  const { gridSize = 40, travelFt = 8, newId = () => Math.random().toString(36).slice(2, 12) } = ctx
  if (!edit || !['bays', 'across', 'delete', 'add'].includes(edit.kind)) return { targets: [] }
  const rows = rowsOf(after, gridSize)
  const byId = new Map(after.map(o => [o.id, o]))
  const T = travelFt * gridSize - 1e-3 * gridSize
  const tol = UP_TOL_FT * gridSize
  const srcKeyNow = edit.kind === 'delete' ? null : resolveKey(rows, edit.source)
  const targets = []
  const keysNow = groupKeys.map(k => resolveKey(rows, k)).filter(Boolean).filter(k => k !== srcKeyNow && !(edit.kind === 'delete' && sameRowKey(edit.source, rows.get(k))))
  const zones = after.filter(o => typeof o.type === 'string' && o.type.startsWith('zone_')).map(z => ({ x: z.x, y: z.y, w: z.width, h: z.height }))
  const columns = ctx.columns || []
  const polyOf = (o) => (ctx.poly && ctx.poly[o.parentId]) || null
  const meets = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > EPS && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > EPS
  const insideFloor = (o) => { const poly = polyOf(o); if (!poly) return true; const f = rackFootprint(o); return [[f.x + 0.5, f.y + 0.5], [f.x + f.w - 0.5, f.y + 0.5], [f.x + 0.5, f.y + f.h - 0.5], [f.x + f.w - 0.5, f.y + f.h - 0.5]].every(([x, y]) => pin(poly, x, y)) }
  const columnOnNewUpright = (o, oldUps) => {
    const g = geom(o), up = upPxOf(o, gridSize)
    for (const u of uprightsOf(g.r0, g.beams, up, gridSize)) {
      if (oldUps && oldUps.some(w => Math.abs(w - u) < EPS)) continue
      const box = g.vert ? { x: g.s0, y: u, w: g.s1 - g.s0, h: up } : { x: u, y: g.s0, w: up, h: g.s1 - g.s0 }
      if (columns.some(c => meets(c, box))) return u
    }
    return null
  }
  const others = (excludeIds) => after.filter(o => isRowRack(o) && !excludeIds.has(o.id))

  for (const key of keysNow) {
    const row = rows.get(key), mine = row.ids.map(id => byId.get(id))
    const mineIds = new Set(row.ids)
    if (edit.kind === 'delete') { targets.push({ key, status: 'apply', removeIds: [...mineIds], racks: [], addRacks: [], dropped: 0 }); continue }

    if (edit.kind === 'across') {
      const moved = mine.map(o => movedAcross(o, edit.delta))
      const why = acrossProblem(moved, others(mineIds), zones, insideFloor, gridSize, T)
        || (moved.map(o => columnOnNewUpright(o, null)).find(u => u != null) != null ? 'a column on an upright' : null)
      targets.push(why ? { key, status: 'skip', reason: why } : { key, status: 'apply', racks: moved, removeIds: [], addRacks: [], dropped: 0 })
      continue
    }

    if (edit.kind === 'add') {
      const t = edit.template, adds = mine.map(o => {
        const g = geom(o), base = { ...t, id: newId(), rotation: o.rotation, parentId: o.parentId, layerId: t.layerId ?? o.layerId }
        delete base.rowIndex; delete base.genSection; delete base.genRunFt; delete base.genCrossFt; delete base.pieceOf; delete base.areaId
        // across: the template's own depth at the same distance from this row as from the source
        const s0 = Math.min(...mine.map(q => geom(q).s0)) + edit.offset
        const shaped = { ...base, width: o.width }
        const atRun = withRun({ ...shaped, x: o.x, y: o.y, height: t.height }, g.r0, g.beams, gridSize)
        const now = geom(atRun)
        return movedAcross(atRun, s0 - now.s0)
      })
      const why = acrossProblem(adds, others(new Set()), zones, insideFloor, gridSize, T)
        || (adds.map(o => columnOnNewUpright(o, null)).find(u => u != null) != null ? 'a column on an upright' : null)
      targets.push(why ? { key, status: 'skip', reason: why } : { key, status: 'apply', racks: [], removeIds: [], addRacks: adds, dropped: 0 })
      continue
    }

    // a bay edit
    const srcOld = edit.map.map(([u]) => u)
    const lined = mine.some(o => { const g = geom(o); return uprightsOf(g.r0, g.beams, upPxOf(o, gridSize), gridSize).some(t => srcOld.some(u => Math.abs(u - t) <= tol)) })
    const srcLo = Math.min(...srcOld), srcHi = Math.max(...srcOld)
    const overlapsSource = mine.some(o => { const g = geom(o); return Math.min(g.r1, srcHi) - Math.max(g.r0, srcLo) > EPS })
    if (!lined) { targets.push(overlapsSource ? { key, status: 'skip', reason: 'uprights don\'t line up' } : { key, status: 'none' }); continue }
    const plan = []
    let changed = false
    for (const o of mine) {
      const g = geom(o), up = upPxOf(o, gridSize), t = uprightsOf(g.r0, g.beams, up, gridSize)
      const m = t.map(v => { const j = edit.map.findIndex(([u]) => Math.abs(u - v) <= tol); return j < 0 ? null : edit.map[j][1] })
      const first = m.findIndex(v => v != null)
      let shift = 0
      let nt = t.map((v, i) => { if (m[i] != null) { shift = m[i] - v; return m[i] } return first < 0 || i < first ? v : v + shift })
      let beams = nt.slice(1).map((v, i) => Math.round(((v - nt[i] - up) / gridSize) * 12 * 1000) / 1000)
      // bays added at an end where this rack ends at that same upright
      let pre = 0
      for (const ap of edit.appended) {
        if (ap.side > 0 && Math.abs(t[t.length - 1] - ap.at) <= tol) { beams = [...beams, ...ap.beams]; changed = true }
        if (ap.side < 0 && Math.abs(t[0] - ap.at) <= tol) { const extra = ap.beams.reduce((s, b) => s + up + (b / 12) * gridSize, 0); nt = [nt[0] - extra, ...nt]; beams = [...ap.beams, ...beams]; pre += ap.beams.length; changed = true }
      }
      // bays deleted where both uprights line up: the rack splits into its runs of kept bays
      const delIdx = new Set()
      for (const [a, b] of edit.deleted) for (let i = 0; i + 1 < t.length; i++) if (Math.abs(t[i] - a) <= tol && Math.abs(t[i + 1] - b) <= tol) delIdx.add(i + pre)
      if (delIdx.size) changed = true
      if (t.some((v, i) => Math.abs(nt[i + pre] - v) > EPS)) changed = true
      const pieces = []
      let cur = null
      const ups = uprightsOf(nt[0], beams, up, gridSize)
      beams.forEach((b, i) => { if (delIdx.has(i)) { if (cur) { pieces.push(cur); cur = null } return } if (!cur) cur = { r0: ups[i], beams: [] }; cur.beams.push(b) })
      if (cur) pieces.push(cur)
      plan.push({ o, g, up, oldUps: t, pieces })
    }
    if (!changed) { targets.push({ key, status: 'none' }); continue }
    // limits along: the floor, zones, the travel width to racks along (other rows' and this row's lanes)
    const outer = others(mineIds)
    const result = [], removeIds = [], dropped = [], notes = new Set()
    let droppedN = 0
    for (const p of plan) {
      const poly = polyOf(p.o)
      p.pieces.forEach((pc, pi) => {
        let { r0, beams } = pc
        const endOf = () => uprightsOf(r0, beams, p.up, gridSize)[beams.length] + p.up
        const was = { r0: p.g.r0, r1: p.g.r1 }
        let lo = -Infinity, hi = Infinity, whyLo = null, whyHi = null
        if (poly) for (const iv of floorAlong(poly, p.g.vert, p.g.s0, p.g.s1, -1e9, 1e9)) {
          const f = iv.find(([a, b]) => a <= was.r0 + 0.5 && b >= was.r1 - 0.5) || iv.find(([a, b]) => Math.min(b, was.r1) - Math.max(a, was.r0) > 0)
          if (f) { if (f[0] > lo) { lo = f[0]; whyLo = 'a wall' } if (f[1] < hi) { hi = f[1]; whyHi = 'a wall' } }
        }
        for (const z of zones) {
          const zs = p.g.vert ? [z.x, z.x + z.w] : [z.y, z.y + z.h], zr = p.g.vert ? [z.y, z.y + z.h] : [z.x, z.x + z.w]
          if (!(Math.min(zs[1], p.g.s1) - Math.max(zs[0], p.g.s0) > EPS)) continue
          if (zr[0] >= was.r1 - EPS && zr[0] < hi) { hi = zr[0]; whyHi = 'a zone' }
          if (zr[1] <= was.r0 + EPS && zr[1] > lo) { lo = zr[1]; whyLo = 'a zone' }
        }
        const neighbours = [...outer.map(o => ({ was: geom(o), now: geom(o) })), ...plan.filter(q => q !== p).map(q => ({ was: q.g, now: { r0: q.pieces[0] ? q.pieces[0].r0 : q.g.r0, r1: q.pieces.length ? uprightsOf(q.pieces[q.pieces.length - 1].r0, q.pieces[q.pieces.length - 1].beams, q.up, gridSize).slice(-1)[0] + q.up : q.g.r1, s0: q.g.s0, s1: q.g.s1 } }))]
        for (const n of neighbours) {
          if (!(Math.min(n.was.s1, p.g.s1) - Math.max(n.was.s0, p.g.s0) > EPS)) continue
          const gapHi = n.was.r0 - was.r1, gapLo = was.r0 - n.was.r1
          if (n.was.r0 >= was.r0 - EPS && gapHi > -p.up - EPS) { const at = gapHi >= T ? n.now.r0 - T - 1e-3 * gridSize : n.now.r0 + p.up; if (at < hi) { hi = at; whyHi = gapHi >= T ? 'an aisle under the travel width' : 'an overlap' } }
          if (n.was.r1 <= was.r1 + EPS && gapLo > -p.up - EPS) { const at = gapLo >= T ? n.now.r1 + T + 1e-3 * gridSize : n.now.r1 - p.up; if (at > lo) { lo = at; whyLo = gapLo >= T ? 'an aisle under the travel width' : 'an overlap' } }
        }
        while (beams.length && endOf() > hi + 1e-3 * gridSize) { const ups = uprightsOf(r0, beams, p.up, gridSize); dropped.push(bayRect(p.g, ups[beams.length - 1], ups[beams.length] + p.up)); beams = beams.slice(0, -1); droppedN++; notes.add(whyHi) }
        while (beams.length && r0 < lo - 1e-3 * gridSize) { const ups = uprightsOf(r0, beams, p.up, gridSize); dropped.push(bayRect(p.g, ups[0], ups[1] + p.up)); r0 = ups[1]; beams = beams.slice(1); droppedN++; notes.add(whyLo) }
        if (!beams.length) return
        const rack = withRun(pi === 0 ? p.o : { ...p.o, id: newId(), pieceOf: p.o.pieceOf || p.o.id }, r0, beams, gridSize)
        result.push(rack)
      })
      if (!p.pieces.length || !result.some(r => r.id === p.o.id)) removeIds.push(p.o.id)
    }
    // a column on an upright the target didn't have: skipped
    const col = result.map(r => { const p = plan.find(q => q.o.id === r.id || q.o.id === r.pieceOf); return columnOnNewUpright(r, p ? p.oldUps : null) }).find(u => u != null)
    if (col != null) { targets.push({ key, status: 'skip', reason: 'a column on an upright' }); continue }
    targets.push({ key, status: 'apply', racks: result.filter(r => byId.has(r.id)), addRacks: result.filter(r => !byId.has(r.id)), removeIds, dropped: droppedN, droppedBays: dropped, dropWhy: [...notes] })
  }
  return { targets }
}

const bayRect = (g, a, b) => (g.vert ? { x: g.s0, y: a, w: g.s1 - g.s0, h: b - a } : { x: a, y: g.s0, w: b - a, h: g.s1 - g.s0 })
function pin(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c } return c }

/** Why racks placed across (a move across, an added row) can't go: off the floor, on a zone, over a rack,
 *  or an aisle to a rack across under the travel width — or null. */
function acrossProblem(racks, others, zones, insideFloor, gridSize, T) {
  for (const r of racks) {
    if (!insideFloor(r)) return 'a wall'
    const f = rackFootprint(r)
    if (zones.some(z => Math.min(z.x + z.w, f.x + f.w) - Math.max(z.x, f.x) > EPS && Math.min(z.y + z.h, f.y + f.h) - Math.max(z.y, f.y) > EPS)) return 'a zone'
    const g = geom(r)
    for (const o of others) {
      if (racks.includes(o)) continue
      const q = geom(o)
      if (q.vert !== g.vert) continue
      const along = Math.min(q.r1, g.r1) - Math.max(q.r0, g.r0)
      if (!(along > upPxOf(r, gridSize) + EPS)) continue
      const across = Math.max(q.s0 - g.s1, g.s0 - q.s1)
      if (across < -EPS) return 'an overlap'
      if (across > EPS && across < T) return 'an aisle under the travel width'
    }
  }
  return null
}

/** The layout with the plan's applicable targets written: racks replaced, removed, added. */
export function applyReplay(objects, plan) {
  const replace = new Map(), remove = new Set(), add = []
  for (const t of plan.targets) {
    if (t.status !== 'apply') continue
    for (const r of t.racks || []) replace.set(r.id, r)
    for (const id of t.removeIds || []) remove.add(id)
    for (const r of t.addRacks || []) add.push(r)
  }
  return [...objects.filter(o => !remove.has(o.id) || replace.has(o.id)).map(o => replace.get(o.id) || o), ...add]
}

/** The bar's words for a plan: "Apply to the other N rows?" and, when an apply would drop bays, "K rows lose
 *  a bay (B bays)." */
export function planSummary(plan) {
  const apply = plan.targets.filter(t => t.status === 'apply'), skip = plan.targets.filter(t => t.status === 'skip')
  const lose = apply.filter(t => t.dropped > 0), bays = lose.reduce((s, t) => s + t.dropped, 0)
  const n = apply.length
  let text = `Apply to the other ${n} row${n === 1 ? '' : 's'}?`
  if (lose.length) text += ` ${lose.length} row${lose.length === 1 ? ' loses' : 's lose'} ${bays === lose.length ? 'a bay' : 'bays'} (${bays} bay${bays === 1 ? '' : 's'}).`
  if (skip.length) text += ` ${skip.length} skipped.`
  return { text, apply: n, lose: lose.length, bays, skipped: skip.map(t => ({ key: t.key, reason: t.reason })) }
}

/** The rects the preview paints for a pending plan: { kind: 'target'|'dropped'|'skipped', f, key }. */
export function previewRects(objects, plan, gridSize = 40) {
  const out = [], rows = rowsOf(objects, gridSize), byId = new Map(objects.map(o => [o.id, o]))
  for (const t of plan.targets) {
    if (t.status === 'apply') {
      for (const r of [...(t.racks || []), ...(t.addRacks || [])]) out.push({ kind: 'target', f: rackFootprint(r), key: 't' + t.key + r.id })
      for (const [i, b] of (t.droppedBays || []).entries()) out.push({ kind: 'dropped', f: b, key: 'd' + t.key + i })
    } else if (t.status === 'skip') {
      const row = rows.get(t.key)
      for (const id of row ? row.ids : []) if (byId.has(id)) out.push({ kind: 'skipped', f: rackFootprint(byId.get(id)), key: 's' + t.key + id })
    }
  }
  return out
}
