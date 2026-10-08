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
// An EDIT to a group row (or to several, the same way) is replayed on the others:
//   - bay edit (a beam length, a bay added or deleted): every target upright within ½" of a source
//     upright goes where that source upright went; uprights past the last such one move with it (their
//     own bays kept), uprights before the first stay. A bay the source deleted goes where both its
//     uprights line up; a bay added at an end is added where the target ends at that same upright. A
//     target none of whose uprights line up is skipped;
//   - a move, across or along: the same distance on its dominant axis (a drag of a group row is locked to
//     that axis, so there is nothing on the other). Part of a row dragged: each target's racks more than
//     half inside that stretch move; a rack only partly inside it skips that target (a rack is never
//     split);
//   - delete row: the others deleted; levels: the same levels;
//   - a row added next to a group row: one next to each other group row, at the same distance across,
//     over that row's own racks (its own length, gaps and uprights).
// A target gets exactly what the source got — a bay through a wall or a zone, a move into one, included.
// What Check layout would flag after the apply and didn't before — through a wall, inside a zone, an
// overlap, an aisle under the travel (or pick) width, a cross-aisle that leaves no way in, a column on an
// upright, a rack nobody can reach — is a WARNING on that target, never a skip and never a dropped bay.
// Skipped only: uprights that don't line up (and a rack only partly inside a dragged stretch, which would
// have to be split).

import { rackFootprint } from '../generate/columnCheck'
import { checkLayout } from './layoutCheck'

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
/** The rack `o` moved `d` px along its run. */
export const movedAlong = (o, d) => (rackFootprint(o).rotated ? { ...o, y: o.y + d } : { ...o, x: o.x + d })

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
/* a clicked bay's highlight (activeBayIdx / activeTowerIdx) is selection state kept on the rack and written
   without a history entry — clicking a bay in another row clears it on this one — so it is never an edit */
const UI_KEYS = ['activeBayIdx', 'activeTowerIdx']
const without = (o, keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return JSON.stringify(c) }
const sameRack = (a, b) => without(a, UI_KEYS) === without(b, UI_KEYS)
const sameExceptGeom = (a, b) => without(a, [...GEOM_KEYS, ...UI_KEYS, 'pieceOf', 'genRunFt', 'genCrossFt', 'id', 'flueSpaceIn']) === without(b, [...GEOM_KEYS, ...UI_KEYS, 'pieceOf', 'genRunFt', 'genCrossFt', 'id', 'flueSpaceIn'])
/** Only the levels differ (geometry, bays, depth, kind the same). */
const onlyLevels = (a, b) => a.levels !== b.levels && without(a, [...UI_KEYS, 'levels']) === without(b, [...UI_KEYS, 'levels'])

/** What one action did to the group. `groupKeys` are the group's row keys BEFORE the action.
 *  Returns { kind: 'none' } | { kind: 'multi', count } | { kind: 'other', why } |
 *  { kind: 'bays'|'across'|'along'|'delete'|'add'|'levels', source, ... } (source = the edited row's key before;
 *  `sources` = every edited row's key when one action changed several group rows the same way). */
export function classifyEdit(before, after, groupKeys, gridSize = 40) {
  const rowsB = rowsOf(before, gridSize), rowsA = rowsOf(after, gridSize)
  const B = new Map(before.filter(isRowRack).map(o => [o.id, o])), A = new Map(after.filter(isRowRack).map(o => [o.id, o]))
  const changed = new Set()
  for (const [id, o] of B) if (!A.has(id) || !sameRack(o, A.get(id))) changed.add(id)
  const added = [...A.values()].filter(o => !B.has(o.id))
  // racks of group rows the action touched (a split piece belongs to the row of the rack it came from)
  const keys = groupKeys.map(k => resolveKey(rowsB, k)).filter(Boolean)
  const touched = keys.filter(k => rowsB.get(k).ids.some(id => changed.has(id)) || added.some(o => o.pieceOf && rowsB.get(k).ids.includes(o.pieceOf)))
  if (touched.length > 1) return sameEditOnAll(before, after, touched, gridSize)
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
  const one = pairs.every(p => p.s.length === 1)
  // levels: only the levels changed, every rack of the row to the same number
  if (one && pairs.some(p => onlyLevels(p.r, p.s[0])) && pairs.every(p => p.r.levels === p.s[0].levels || onlyLevels(p.r, p.s[0]))) {
    const L = pairs.find(p => onlyLevels(p.r, p.s[0])).s[0].levels
    if (pairs.every(p => p.s[0].levels === L)) return { kind: 'levels', source, levels: L }
  }
  // a move: the racks that moved shifted the same, nothing else changed — replayed on its DOMINANT axis,
  // across or along (a drag of a group row is locked to it, so the other part is nothing; a move made some
  // other way keeps only its larger part). Across is measured centre to centre (a live-flue drag that
  // narrows the rack, 12" → 9", moves it exactly the drag). Some racks of the row moved, the rest
  // untouched: a move of the stretch along the run the moved racks covered.
  if (one) {
    const ds = pairs.map(p => { const a = gB(p.r), b = gB(p.s[0]); return { r: p.r, dS: (b.s0 + b.s1 - a.s0 - a.s1) / 2, dR: b.r0 - a.r0, same: JSON.stringify(a.beams) === JSON.stringify(b.beams) && sameExceptGeom(p.r, p.s[0]) } })
    const moved = ds.filter(d => Math.abs(d.dS) > EPS || Math.abs(d.dR) > EPS), still = ds.filter(d => !moved.includes(d) && d.same)
    if (moved.length && moved.every(d => d.same && Math.abs(d.dS - moved[0].dS) < EPS && Math.abs(d.dR - moved[0].dR) < EPS) && moved.length + still.length === ds.length) {
      const along = Math.abs(moved[0].dR) > Math.abs(moved[0].dS)
      const e = { kind: along ? 'along' : 'across', source, delta: along ? moved[0].dR : moved[0].dS }
      if (still.length) e.span = [Math.min(...moved.map(d => gB(d.r).r0)), Math.max(...moved.map(d => gB(d.r).r1))]
      return e
    }
  }
  // a bay edit: positions across unchanged, the uprights mapped
  const tol = UP_TOL_FT * gridSize
  const map = [], deleted = [], appended = []
  for (const { r, s } of pairs) {
    const a = gB(r), up = upPxOf(r, gridSize), U = uprightsOf(a.r0, a.beams, up, gridSize)
    if (s.some(o => Math.abs(gB(o).s0 - a.s0) > EPS || Math.abs(gB(o).s1 - a.s1) > EPS)) return { kind: 'other', source, why: 'a change across with its bays' }
    if (s.some(o => !sameExceptGeom(r, o))) return { kind: 'other', source, why: 'a change of depth or kind' }
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

/** One action changed several group rows: if each was changed the same way — the same delta across, the
 *  same levels, all deleted, or bays that replaying the first row's edit on it reproduces exactly — it is
 *  that one edit with every changed row a source; otherwise { kind: 'multi' } (not replayed). */
function sameEditOnAll(before, after, touched, gridSize) {
  const multi = { kind: 'multi', count: touched.length }
  const edits = touched.map(k => classifyEdit(before, after, [k], gridSize))
  const e0 = edits[0]
  if (!['bays', 'across', 'along', 'delete', 'levels'].includes(e0.kind) || edits.some(e => e.kind !== e0.kind)) return multi
  const same = { ...e0, sources: touched }
  if (e0.kind === 'delete') return same
  if (e0.kind === 'levels') return edits.every(e => e.levels === e0.levels) ? same : multi
  if (e0.kind === 'across' || e0.kind === 'along') return edits.every(e => Math.abs(e.delta - e0.delta) < EPS && !e.span) && !e0.span ? same : multi
  // bays: the first row's edit replayed on each other changed row as it was must give what the user made
  const rowsB = rowsOf(before, gridSize), rowsA = rowsOf(after, gridSize)
  const sig = (racks) => racks.map(o => { const g = geom(o); return Math.round(g.r0 * 100) + ':' + g.beams.join('/') }).sort().join('|')
  for (const k of touched.slice(1)) {
    const was = new Set(rowsB.get(k).ids)
    const nowIds = new Set((rowsA.get(resolveKey(rowsA, k)) || { ids: [] }).ids)
    const mixed = [...after.filter(o => !nowIds.has(o.id)), ...before.filter(o => was.has(o.id))]
    const t = planReplay(mixed, e0, [touched[0], k], { gridSize, newId: () => 'chk' + Math.random(), warnings: false }).targets.find(x => x.key === resolveKey(rowsOf(mixed, gridSize), k))
    if (!t || t.status !== 'apply') return multi
    const out = applyReplay(mixed, { targets: [t] }).filter(o => isRowRack(o) && (was.has(o.id) || (o.pieceOf && was.has(o.pieceOf))))
    if (sig(out) !== sig([...nowIds].map(id => after.find(o => o.id === id)))) return multi
  }
  return same
}

/* ── the replay on one target row ─────────────────────────────────────────── */

/** While a group row is dragged: the racks it must not snap to — the other group rows' racks, and every rack
 *  lined up with where the dragged racks started (an edge on the same line, across or along): those could
 *  only ever pull it back to where it was, so a move of a few inches never stuck. Returns a Set of ids, or
 *  null when the drag holds no group row. */
export function groupDragExclusions(objects, ids, groupKeys, gridSize = 40) {
  const rows = rowsOf(objects, gridSize)
  const keys = new Set(groupKeys.map(k => resolveKey(rows, k)).filter(Boolean))
  const dragged = objects.filter(o => ids.includes(o.id) && isRowRack(o))
  if (!dragged.some(o => { const k = rowOfRack(rows, o.id); return k && keys.has(k) })) return null
  const out = new Set()
  for (const k of keys) for (const id of rows.get(k).ids) if (!ids.includes(id)) out.add(id)
  const lines = (f) => ({ xs: [f.x, f.x + f.w], ys: [f.y, f.y + f.h] })
  const starts = dragged.map(o => lines(rackFootprint(o)))
  const on = (a, b) => a.some(p => b.some(q => Math.abs(p - q) < 0.5))
  for (const o of objects) {
    if (!BEAM.has(o.type) || ids.includes(o.id)) continue
    const l = lines(rackFootprint(o))
    if (starts.some(st => on(st.xs, l.xs) || on(st.ys, l.ys))) out.add(o.id)
  }
  // ...but never the rack a dragged split piece came from, nor its other pieces: brought back to their shared
  // upright, they join again (the in-line snap needs them as targets)
  const root = (o) => o.splitOf || o.id
  const family = new Set(dragged.filter(o => o.splitOf || objects.some(q => q.splitOf === o.id)).map(root))
  for (const o of objects) if (family.has(root(o))) out.delete(o.id)
  return out
}
/** The drag delta locked to its dominant axis (screen x or y — a row runs along one of them). */
export const lockToAxis = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy })

/** What Check layout flags that a target gets as a warning (its kind → the bar's words). */
export const WARN_KINDS = {
  outside: 'through a wall',
  zone: 'inside a zone',
  overlap: 'an overlap',
  'aisle-drive': 'an aisle under the travel width',
  'aisle-pick': 'an aisle under the pick width',
  'cross-aisle': 'a cross-aisle under the travel width',
  'no-way-in': 'a cross-aisle blocked — no way in',
  upright: 'a column on an upright',
  unreachable: 'a rack nobody can reach',
}

/** Plan the replay of `edit` on every group row but its source, in `after` (the layout with the edit).
 *  `ctx` = { gridSize, newId, warnings (false: don't run Check layout), finalize ((before, written) → objects:
 *  what the writer does to the applied layout, applied before the warnings are judged) }. Returns { targets: [{ key, status: 'apply'|'skip'|'none', reason,
 *  racks, removeIds, addRacks, warnings: [words] }] }. */
export function planReplay(after, edit, groupKeys, ctx) {
  const { gridSize = 40, newId = () => Math.random().toString(36).slice(2, 12) } = ctx
  if (!edit || !['bays', 'across', 'along', 'delete', 'add', 'levels'].includes(edit.kind)) return { targets: [] }
  const rows = rowsOf(after, gridSize)
  const byId = new Map(after.map(o => [o.id, o]))
  const tol = UP_TOL_FT * gridSize
  const srcKeyNow = edit.kind === 'delete' ? null : resolveKey(rows, edit.source)
  const targets = []
  const sourcesNow = new Set((edit.sources || []).map(k => resolveKey(rows, k)).filter(Boolean))
  const keysNow = groupKeys.map(k => resolveKey(rows, k)).filter(Boolean).filter(k => k !== srcKeyNow && !sourcesNow.has(k) && !(edit.kind === 'delete' && sameRowKey(edit.source, rows.get(k))))
  for (const key of keysNow) {
    const row = rows.get(key), mine = row.ids.map(id => byId.get(id))
    const mineIds = new Set(row.ids)
    if (edit.kind === 'delete') { targets.push({ key, status: 'apply', removeIds: [...mineIds], racks: [], addRacks: [] }); continue }
    if (edit.kind === 'levels') {
      const racks = mine.filter(o => o.levels !== edit.levels).map(o => ({ ...o, levels: edit.levels }))
      targets.push(racks.length ? { key, status: 'apply', racks, removeIds: [], addRacks: [] } : { key, status: 'none' })
      continue
    }

    if (edit.kind === 'across' || edit.kind === 'along') {
      // part of a row dragged: the target's racks more than half inside that stretch move; one only partly
      // inside it would have to be split, so the target is skipped
      let movers = mine
      if (edit.span) {
        const [a, b] = edit.span, inside = (o) => { const g = geom(o); return Math.max(0, Math.min(g.r1, b) - Math.max(g.r0, a)) }
        movers = mine.filter(o => { const g = geom(o); return inside(o) > (g.r1 - g.r0) / 2 + EPS })
        if (mine.some(o => !movers.includes(o) && inside(o) > EPS)) { targets.push({ key, status: 'skip', reason: 'a rack only partly inside the stretch that moved' }); continue }
        if (!movers.length) { targets.push({ key, status: 'none' }); continue }
      }
      const moved = movers.map(o => (edit.kind === 'along' ? movedAlong : movedAcross)(o, edit.delta))
      targets.push({ key, status: 'apply', racks: moved, removeIds: [], addRacks: [] })
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
      targets.push({ key, status: 'apply', racks: [], removeIds: [], addRacks: adds, added: true })
      continue
    }

    // a bay edit
    const srcOld = edit.map.map(([u]) => u)
    const lined = mine.some(o => { const g = geom(o); return uprightsOf(g.r0, g.beams, upPxOf(o, gridSize), gridSize).some(t => srcOld.some(u => Math.abs(u - t) <= tol)) })
    const srcLo = Math.min(...srcOld), srcHi = Math.max(...srcOld)
    const overlapsSource = mine.some(o => { const g = geom(o); return Math.min(g.r1, srcHi) - Math.max(g.r0, srcLo) > EPS })
    if (!lined) {
      if (!overlapsSource) { targets.push({ key, status: 'none' }); continue }
      // by how much: the nearest a target upright comes to a source one, where both have racks
      let off = Infinity
      for (const o of mine) { const g = geom(o); for (const t of uprightsOf(g.r0, g.beams, upPxOf(o, gridSize), gridSize)) if (t >= srcLo - tol && t <= srcHi + tol) for (const u of srcOld) off = Math.min(off, Math.abs(u - t)) }
      targets.push({ key, status: 'skip', reason: `uprights don't line up${Number.isFinite(off) ? ` (${fmtIn(off / gridSize * 12)} off)` : ''}` })
      continue
    }
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
    // written as replayed: a bay through a wall or a zone is applied like any other — Check layout's warning
    // says so (markWarnings), the same as for a hand edit of the source
    const result = [], removeIds = []
    for (const p of plan) {
      p.pieces.forEach((pc, pi) => result.push(withRun(pi === 0 ? p.o : { ...p.o, id: newId(), pieceOf: p.o.pieceOf || p.o.id }, pc.r0, pc.beams, gridSize)))
      if (!p.pieces.length || !result.some(r => r.id === p.o.id)) removeIds.push(p.o.id)
    }
    targets.push({ key, status: 'apply', racks: result.filter(r => byId.has(r.id)), addRacks: result.filter(r => !byId.has(r.id)), removeIds })
  }
  if (ctx.warnings !== false) markWarnings(after, targets, gridSize, ctx.finalize)
  return { targets }
}

/** Warnings, the way a hand edit gets them: Check layout on the layout as it will be after the WHOLE apply
 *  (every target moved together), against the layout now; what is new and involves a target's racks is
 *  that target's warning. Issues are matched by kind and by the racks' roots (a split piece is its rack). */
function markWarnings(after, targets, gridSize, finalize) {
  const applying = targets.filter(t => t.status === 'apply' && t.removeIds.length + t.racks.length + t.addRacks.length > 0)
  if (!applying.length) return
  // the layout as the apply will write it — `finalize` is what the writer does after (a pair taking over its
  // carried-on single's bay: utils/pairCarryOn.js), so a bay taken over is no overlap
  let final = applyReplay(after, { targets })
  if (finalize) final = finalize(after, final)
  const issues = (objects) => {
    const root = new Map(objects.map(o => [o.id, o.pieceOf || o.id]))
    const res = checkLayout(objects, { gridSize })
    return [...res.errors, ...res.warnings].filter(i => WARN_KINDS[i.kind]).map(i => ({ i, k: i.kind + '|' + (i.ids || []).map(id => root.get(id) || id).sort().join(',') }))
  }
  const was = new Set(issues(after).map(x => x.k))
  const fresh = issues(final).filter(x => !was.has(x.k))
  if (!fresh.length) return
  // a target's racks by id, from the layout now — not by its row key after the apply: a hand row moved up to
  // another can chain with it and change key
  const rowsNow = rowsOf(after, gridSize)
  for (const t of applying) {
    const was = ((rowsNow.get(t.key) || { ids: [] }).ids).filter(id => !t.removeIds.includes(id))
    const ids = new Set(t.added ? t.addRacks.map(r => r.id) : [...was, ...t.racks.map(r => r.id), ...t.addRacks.map(r => r.id)])
    const words = [...new Set(fresh.filter(x => (x.i.ids || []).some(id => ids.has(id))).map(x => WARN_KINDS[x.i.kind]))]
    if (words.length) t.warnings = words
  }
}

/** Inches as the bar says them: whole or to the quarter, 3" / 2.5" / 0.25". */
export const fmtIn = (inches) => `${Math.round(inches * 4) / 4}"`

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

/** The bar's words for a plan: "Apply to the other N rows?", "W will have warnings.", "S skipped." */
export function planSummary(plan) {
  const apply = plan.targets.filter(t => t.status === 'apply'), skip = plan.targets.filter(t => t.status === 'skip')
  const warned = apply.filter(t => t.warnings && t.warnings.length)
  const n = apply.length
  let text = `Apply to the other ${n} row${n === 1 ? '' : 's'}?`
  if (warned.length) text += ` ${warned.length} will have warnings.`
  if (skip.length) text += ` ${skip.length} skipped.`
  return { text, apply: n, warned: warned.map(t => ({ key: t.key, reasons: t.warnings })), skipped: skip.map(t => ({ key: t.key, reason: t.reason })) }
}

/** The rects the preview paints for a pending plan: { kind: 'target'|'warned'|'skipped', f, key } — a target
 *  that will have warnings paints its racks 'warned'. */
export function previewRects(objects, plan, gridSize = 40) {
  const out = [], rows = rowsOf(objects, gridSize), byId = new Map(objects.map(o => [o.id, o]))
  for (const t of plan.targets) {
    if (t.status === 'apply') {
      const kind = t.warnings && t.warnings.length ? 'warned' : 'target'
      for (const r of [...(t.racks || []), ...(t.addRacks || [])]) out.push({ kind, f: rackFootprint(r), key: 't' + t.key + r.id })
    } else if (t.status === 'skip') {
      const row = rows.get(t.key)
      for (const id of row ? row.ids : []) if (byId.has(id)) out.push({ kind: 'skipped', f: rackFootprint(byId.get(id)), key: 's' + t.key + id })
    }
  }
  return out
}
