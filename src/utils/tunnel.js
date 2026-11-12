// tunnel.js — a tunnel through racking (STUDIO.md §7a Cross-aisles, tunnel round).
//
// The Cross aisle tool's Tunnel (its mode bar: Cross aisle | Tunnel): the band dragged across rows does not cut them — the
// bays under it keep their frames and their upper levels, and their bottom N levels (L1–LN; the mode bar's Levels
// removed, 2 by default) go, with their pallet positions. Stored per bay on the rack (`tunnelBays`, utils/elevations.js:
// the bay's type reads as its type less those levels, so positions, beams and decks and its elevation all follow).
// A row that stands along a wall is never touched (the wall-row rule — crossAisleCut.js bandOf).
//
// A tunnel is not an object: it is read off the racks — in each rack the bays in a row with the same N (a segment);
// segments of one building, one direction, overlapping along the run, are one tunnel. Drawn hatched with a TUNNEL label
// (canvas2/TunnelMarks.jsx); a click in it picks it (its card: Levels removed, its elevation, Delete); a drag along the
// run moves it in whole bays; Delete gives the levels back. One undo step each. A tunnel is a way in for Check layout:
// a truck drives through it (generate/aisleAccess.js rackBlocks).
//
// Its WIDTH (tunnel fixes): a tunnel is ONE bay in each row — the bay at the band's start — whose beam length is the
// tunnel's width (the mode bar's Width, typed; empty: the bay as it is — the standard bay). Its kept levels take beams that
// long (the BOM counts them at that length). The row grows or shrinks by the difference at its OPEN end (the end with more
// free floor before a wall — less the wall clearance — a rack or a zone: endRoom); where it would run into one, whole bays
// go at that end. The card's Width does the same; a move carries the wide bay along (the row's length unchanged); Delete
// gives the levels back and the row's own bay length (its other bays'). One undo step each.

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { geom, uprightsOf, isRowRack } from './rowGroup'
import { levelsAt, typeById } from './elevations'
import { rackFootprint } from '../generate/rackFootprint'
import { innerOutline } from './floorGeom'
import { runPiece } from './crossAisleTool'
import { rebuildAisles } from './aisleRebuild'
import { rackingSettings } from './fillTool'

const EPS = 1e-6
const isRev = (o) => { const t = ((((o.rotation || 0) % 360) + 360) % 360); return t === 180 || t === 270 }
const upPx = (o, gs) => ((o.uprightWidth || 3) / 12) * gs
/** Run-order bay `j` of rack `o` → its own (local) bay index. */
const localOf = (o, j) => (isRev(o) ? o.beams.length - 1 - j : j)
const tb = (o, i) => (Array.isArray(o.tunnelBays) ? o.tunnelBays[i] || 0 : 0)

/** The picked tunnel — { fpId, rot, at (a run position inside it, world px) } — and a drag in progress: { d (bays) }. */
export const useTunnelPick = create(() => ({ pick: null, drag: null }))
export const clearTunnelPick = () => { if (useTunnelPick.getState().pick || useTunnelPick.getState().drag) useTunnelPick.setState({ pick: null, drag: null }) }

/** Every tunnel segment: [{ rack, runIdx (run-order bays), lo, hi (along, world px — its first and last upright's outer
 *  faces), n (levels removed), vert, s0, s1 (across), fpId }]. */
export function tunnelSegs(objects, gs = 40) {
  const out = []
  for (const r of objects || []) {
    if (!isRowRack(r) || !Array.isArray(r.tunnelBays) || !r.tunnelBays.some(n => n > 0)) continue
    const g = geom(r), n = g.beams.length, up = upPx(r, gs), ups = uprightsOf(g.r0, g.beams, up, gs)
    for (let j = 0; j < n;) {
      const k = tb(r, localOf(r, j))
      if (!(k > 0)) { j++; continue }
      const start = j
      while (j < n && tb(r, localOf(r, j)) === k) j++
      out.push({ rack: r, runIdx: Array.from({ length: j - start }, (_, q) => start + q), lo: ups[start], hi: ups[j] + up, n: k, vert: g.vert, s0: g.s0, s1: g.s1, fpId: r.parentId ?? null })
    }
  }
  return out
}
/** Every tunnel: [{ key, fpId, rot (rows up and down), lo, hi, c0, c1, n, segs }] — segments overlapping along the run. */
export function tunnelsNow(objects, gs = 40) {
  const out = []
  for (const s of tunnelSegs(objects, gs).sort((p, q) => p.lo - q.lo)) {
    const t = out.find(k => k.fpId === s.fpId && k.rot === s.vert && Math.min(k.hi, s.hi) - Math.max(k.lo, s.lo) > EPS)
    if (t) { t.segs.push(s); t.lo = Math.min(t.lo, s.lo); t.hi = Math.max(t.hi, s.hi); t.c0 = Math.min(t.c0, s.s0); t.c1 = Math.max(t.c1, s.s1); t.n = Math.max(t.n, s.n) }
    else out.push({ fpId: s.fpId, rot: s.vert, lo: s.lo, hi: s.hi, c0: s.s0, c1: s.s1, n: s.n, segs: [s] })
  }
  return out.map(t => ({ ...t, key: `${t.fpId}|${t.rot ? 'v' : 'h'}|${Math.round(t.lo)}` }))
}
/** The tunnel under world point `w` (inside one of its segments), or null. */
export function tunnelAt(objects, w, gs = 40) {
  for (const t of tunnelsNow(objects, gs)) {
    const along = t.rot ? w.y : w.x, across = t.rot ? w.x : w.y
    if (t.segs.some(s => along >= s.lo - EPS && along <= s.hi + EPS && across >= s.s0 - EPS && across <= s.s1 + EPS)) return t
  }
  return null
}
/** The picked tunnel now (it follows a move: the one holding its run position, else the nearest of its building). */
export function pickedTunnel(objects, pick = useTunnelPick.getState().pick, gs = 40) {
  if (!pick) return null
  const all = tunnelsNow(objects, gs).filter(t => t.fpId === pick.fpId && t.rot === pick.rot)
  return all.find(t => pick.at >= t.lo - EPS && pick.at <= t.hi + EPS) || all.reduce((b, t) => (!b || Math.abs((t.lo + t.hi) / 2 - pick.at) < Math.abs((b.lo + b.hi) / 2 - pick.at) ? t : b), null)
}

/** Rack `o` with its run-order bays `runIdx` set to `n` levels removed (0: back to whole). */
function withTunnel(o, runIdx, n) {
  const arr = o.beams.map((_, i) => tb(o, i))
  for (const j of runIdx) arr[localOf(o, j)] = n
  const out = { ...o, activeBayIdx: null }
  if (arr.some(v => v > 0)) out.tunnelBays = arr; else delete out.tunnelBays
  return out
}
/** A Fill's rack changed here is a hand-edited rack of its area (its signature dropped from the area's record): a later
 *  resize keeps it as it is (generate/rackingArea.js). */
function asHandEdited(objects, ids) {
  const areas = new Set(objects.filter(o => ids.has(o.id) && o.areaId).map(o => o.areaId))
  if (!areas.size) return objects
  return objects.map(o => {
    if (!areas.has(o.id) || !o.placed) return o
    const placed = { ...o.placed }
    for (const id of ids) delete placed[id]
    return { ...o, placed }
  })
}

/** The levels a bay holds before any tunnel (its type's, else the rack's). */
const baseLevels = (r, i, T) => levelsAt({ ...r, tunnelBays: undefined }, i, 0, T)
/** What a tunnel of `n` levels removed does to the band's bays: { n, keeps (the fewest levels left in a bay), base } — with
 *  no band (or no bay crossed), the layout default type's levels (else 4). */
export function tunnelSummary(objects, T, band, n, gs = 40) {
  let base = Infinity
  if (band) for (const id of band.racks) {
    const r = objects.find(o => o.id === id)
    if (!r) continue
    for (const j of bandBays(r, band, gs)) base = Math.min(base, baseLevels(r, localOf(r, j), T))
  }
  if (!Number.isFinite(base)) base = T ? (typeById(T, T.defaultId)?.levels.length ?? 4) : 4
  return { n, base, keeps: Math.max(0, base - n) }
}
/** "Removes L1–L2 · keeps 2 levels" */
export const tunnelWords = ({ n, keeps }) => `Removes ${n > 1 ? `L1–L${n}` : 'L1'} · keeps ${keeps} level${keeps === 1 ? '' : 's'}`

/** The run-order bay of rack `r` a band makes its tunnel: of the bays under it (overlapping it along the run), the one
 *  starting nearest the band's start (tunnel fixes: one bay a row) → [j], or [] (none under it). */
export function bandBays(r, band, gs = 40) {
  const g = geom(r), up = upPx(r, gs), ups = uprightsOf(g.r0, g.beams, up, gs)
  let best = null, bd = Infinity
  for (let j = 0; j < g.beams.length; j++) {
    if (!(Math.min(ups[j + 1] + up, band.s1) - Math.max(ups[j], band.s0) > EPS)) continue
    const d = Math.abs(ups[j] + up - band.s0)
    if (d < bd - EPS) { bd = d; best = j }
  }
  return best == null ? [] : [best]
}

/* ── the tunnel's width: its bay's beam length, the row longer or shorter at its open end ── */

const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
/** The standard bay (in): the Racking settings' bay (beam) length. */
export const standardBayIn = () => rackingSettings().beamIn || 96
/** Free floor past each end of rack `o` along its run (world px): { lo, hi } — to the nearest wall across its line (less
 *  the wall clearance), rack or zone standing across it. */
export function endRoom(o, objects, gs = 40) {
  const g = geom(o), room = { lo: Infinity, hi: Infinity }
  const across = (c0, c1) => Math.min(c1, g.s1) - Math.max(c0, g.s0) > EPS
  const block = (a0, a1, c0, c1) => {
    if (!across(c0, c1)) return
    if (a0 >= g.r1 - EPS) room.hi = Math.min(room.hi, a0 - g.r1)
    else if (a1 <= g.r0 + EPS) room.lo = Math.min(room.lo, g.r0 - a1)
  }
  for (const q of objects || []) {
    if (q.id === o.id) continue
    if (isRack(q)) { const f = rackFootprint(q); if (g.vert) block(f.y, f.y + f.h, f.x, f.x + f.w); else block(f.x, f.x + f.w, f.y, f.y + f.h) }
    else if (/^zone_/.test(q.type || '') && q.width > 0 && q.height > 0) { if (g.vert) block(q.y, q.y + q.height, q.x, q.x + q.width); else block(q.x, q.x + q.width, q.y, q.y + q.height) }
  }
  const fp = (objects || []).find(q => q.id === o.parentId && /^fp_/.test(q.type || ''))
  if (fp) {
    const poly = innerOutline(fp, gs), clear = ((rackingSettings().wallClearIn ?? 3) / 12) * gs
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      // the walls across the run: parallel to the rack's depth
      if (g.vert ? Math.abs(a.y - b.y) > EPS : Math.abs(a.x - b.x) > EPS) continue
      const at = g.vert ? a.y : a.x, c0 = g.vert ? Math.min(a.x, b.x) : Math.min(a.y, b.y), c1 = g.vert ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
      if (!across(c0, c1)) continue
      if (at >= g.r1 - EPS) room.hi = Math.min(room.hi, at - clear - g.r1)
      else if (at <= g.r0 + EPS) room.lo = Math.min(room.lo, g.r0 - at - clear)
    }
  }
  return { lo: Math.max(0, room.lo), hi: Math.max(0, room.hi) }
}
/** Rack `o` with its run-order bays `runIdx` `beamIn` long: the row longer or shorter by the difference at its open end
 *  (endRoom: the end with more free floor; a tie — the high end); past the free floor there, whole bays go at that end
 *  (never one of `runIdx`). → { rack, idx (`runIdx` in the rack now) } or null (it cannot fit). */
export function resizeBays(o, objects, runIdx, beamIn, gs = 40) {
  const g = geom(o), n = g.beams.length, up = upPx(o, gs)
  const beamsRun = g.beams.map((b, j) => (runIdx.includes(j) ? beamIn : b))
  const dPx = ((beamsRun.reduce((t, b) => t + b, 0) - g.beams.reduce((t, b) => t + b, 0)) / 12) * gs
  if (Math.abs(dPx) < EPS) return { rack: o, idx: runIdx }
  const room = endRoom(o, objects, gs), hiEnd = room.hi >= room.lo
  let keep = Array.from({ length: n }, (_, j) => j), over = dPx - (hiEnd ? room.hi : room.lo)
  while (over > EPS) {
    const j = hiEnd ? keep[keep.length - 1] : keep[0]
    if (runIdx.includes(j)) return null
    keep = hiEnd ? keep.slice(0, -1) : keep.slice(1)
    over -= (beamsRun[j] / 12) * gs + up
  }
  const len = up + keep.reduce((t, j) => t + (beamsRun[j] / 12) * gs + up, 0)
  const r0 = hiEnd ? g.r0 : g.r1 - len
  const withBeams = { ...o, beams: isRev(o) ? [...beamsRun].reverse() : beamsRun }
  return { rack: runPiece(withBeams, keep, r0, gs), idx: runIdx.map(j => keep.indexOf(j)) }
}
/** A tunnel's width (ft): its first bay's beam length. */
export const tunnelWidthFt = (t) => { const s = t.segs[0]; return (s.rack.beams[localOf(s.rack, s.runIdx[0])] || 96) / 12 }
/** The row's own bay length (in): the commonest beam of its bays outside any tunnel, else the standard bay. */
function ownBayIn(r) {
  const count = new Map()
  r.beams.forEach((b, i) => { if (!(tb(r, i) > 0)) count.set(b, (count.get(b) || 0) + 1) })
  let best = null
  for (const [b, k] of count) if (best == null || k > count.get(best)) best = b
  return best ?? standardBayIn()
}
/** `objects` with a tunnel of `n` levels removed under the band in every row it crosses (crossAisleCut.js bandOf: a wall
 *  row is never crossed) → { objects, ids } or null (no bay under it). Pure. */
/* (tunnel fixes: one bay a row, `widthFt` its beam length — the row longer or shorter at its open end; null: as it is) */
export function planTunnel(objects, band, n, gs = 40, widthFt = null) {
  if (!band || !band.racks.length || !(n > 0)) return null
  const want = new Set(band.racks), ids = new Set()
  let out = objects.map(o => {
    if (!want.has(o.id)) return o
    let bays = bandBays(o, band, gs), r = o
    if (!bays.length) return o
    if (widthFt > 0) { const z = resizeBays(o, objects, bays, widthFt * 12, gs); if (!z) return o; r = z.rack; bays = z.idx }
    ids.add(o.id)
    return withTunnel(r, bays, n)
  })
  if (!ids.size) return null
  out = asHandEdited(out, ids)
  return { objects: widthFt > 0 ? rebuildAisles(out, nanoid).objects : out, ids }
}
/** Lay the tunnel (one undo step); it is picked. → true when a bay took it. */
export function commitTunnel(store, band, n, widthFt = null) {
  const st = store.getState(), gs = st.gridSize || 40
  const plan = planTunnel(st.objects, band, n, gs, widthFt)
  if (!plan) return false
  const first = [...plan.ids][0]
  store.setState({ objects: plan.objects })
  store.getState().commitObjectUpdate(first, {})
  const fpId = plan.objects.find(o => o.id === first)?.parentId ?? null
  const t = tunnelsNow(plan.objects, gs).find(k => k.fpId === fpId && k.rot === band.vert && Math.min(k.hi, band.s1) - Math.max(k.lo, band.s0) > EPS)
  store.getState().clearSelection?.()
  useTunnelPick.setState({ pick: t ? { fpId: t.fpId, rot: t.rot, at: (t.lo + t.hi) / 2 } : null, drag: null })
  return true
}

/* ── the picked tunnel: moved, its levels changed, deleted ── */

/** How far (whole bays) tunnel `t` may move along the run: [dMin, dMax] — every segment kept inside its rack. */
export function tunnelRange(t) {
  let lo = -Infinity, hi = Infinity
  for (const s of t.segs) { lo = Math.max(lo, -Math.min(...s.runIdx)); hi = Math.min(hi, s.rack.beams.length - 1 - Math.max(...s.runIdx)) }
  return [Math.min(0, lo), Math.max(0, hi)]
}
/** A bay's pitch along the run at tunnel `t` (world px). */
export const tunnelPitch = (t, gs = 40) => { const r = t.segs[0].rack; return (((r.beams[0] || 96) + (r.uprightWidth || 3)) / 12) * gs }
function commitChange(store, objects, anchor) {
  store.setState({ objects })
  store.getState().commitObjectUpdate(anchor, {})
}
const changeSegs = (objects, t, fn) => {
  const byRack = new Map()
  for (const s of t.segs) { if (!byRack.has(s.rack.id)) byRack.set(s.rack.id, []); byRack.get(s.rack.id).push(s) }
  const ids = new Set(byRack.keys())
  return asHandEdited(objects.map(o => (byRack.has(o.id) ? byRack.get(o.id).reduce((r, s) => fn(r, s), o) : o)), ids)
}
/** Tunnel `t` moved `d` bays along the run (clamped) — one undo step; the pick follows. → the bays moved. */
export function moveTunnel(store, t, d) {
  const [lo, hi] = tunnelRange(t)
  d = Math.max(lo, Math.min(hi, Math.round(d)))
  if (!d) return 0
  const st = store.getState(), gs = st.gridSize || 40
  // each segment's bays carried d bays along with their beams and types (tunnel fixes: the wide bay goes with it), the
  // bays they pass the other way — the row's length unchanged
  const next = changeSegs(st.objects, t, (r, s) => {
    const n = r.beams.length, lo = Math.min(...s.runIdx), hi = Math.max(...s.runIdx)
    const rest = Array.from({ length: n }, (_, j) => j).filter(j => j < lo || j > hi)
    const at = lo + d
    const perm = [...rest.slice(0, at), ...s.runIdx, ...rest.slice(at)]
    return runPiece(r, perm, geom(r).r0, gs)
  })
  commitChange(store, next, t.segs[0].rack.id)
  useTunnelPick.setState({ pick: { fpId: t.fpId, rot: t.rot, at: (t.lo + t.hi) / 2 + d * tunnelPitch(t, gs) }, drag: null })
  return d
}
/** Tunnel `t` with `n` levels removed in every bay of it — one undo step. */
export function setTunnelLevels(store, t, n) {
  n = Math.round(n)
  if (!(n > 0) || t.segs.every(s => s.n === n)) return false
  commitChange(store, changeSegs(store.getState().objects, t, (r, s) => withTunnel(r, s.runIdx, n)), t.segs[0].rack.id)
  return true
}
/** Tunnel `t` `widthFt` wide (its bays' beam length; tunnel fixes) — one undo step. → false when no row took it. */
export function setTunnelWidth(store, t, widthFt) {
  if (!(widthFt > 0)) return false
  const st = store.getState(), gs = st.gridSize || 40
  let took = false
  const next = changeSegs(st.objects, t, (r, s) => {
    const z = resizeBays(r, st.objects, s.runIdx, widthFt * 12, gs)
    if (!z || z.rack === r) return r
    took = true
    return z.rack
  })
  if (!took) return false
  commitChange(store, rebuildAisles(next, nanoid).objects, t.segs[0].rack.id)
  return true
}
/** Tunnel `t` deleted: its bays' levels back, and the row's own bay length (tunnel fixes) — one undo step. */
export function deleteTunnel(store, t) {
  const st = store.getState(), gs = st.gridSize || 40
  const next = changeSegs(st.objects, t, (r, s) => {
    const z = resizeBays(r, st.objects, s.runIdx, ownBayIn(r), gs)
    return z ? withTunnel(z.rack, z.idx, 0) : withTunnel(r, s.runIdx, 0)
  })
  commitChange(store, rebuildAisles(next, nanoid).objects, t.segs[0].rack.id)
  useTunnelPick.setState({ pick: null, drag: null })
  return true
}
/** The pick goes when anything is selected. Returns the unsubscribe. */
export function installTunnelKeeper(store) {
  return store.subscribe((st, prev) => { if (st.selectedIds !== prev.selectedIds && st.selectedIds.length) clearTunnelPick() })
}
