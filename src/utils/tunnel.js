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

import { create } from 'zustand'
import { geom, uprightsOf, isRowRack } from './rowGroup'
import { levelsAt, typeById } from './elevations'

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

/** The run-order bays of rack `r` under the band (overlapping it along the run). */
export function bandBays(r, band, gs = 40) {
  const g = geom(r), up = upPx(r, gs), ups = uprightsOf(g.r0, g.beams, up, gs), out = []
  for (let j = 0; j < g.beams.length; j++) if (Math.min(ups[j + 1] + up, band.s1) - Math.max(ups[j], band.s0) > EPS) out.push(j)
  return out
}
/** `objects` with a tunnel of `n` levels removed under the band in every row it crosses (crossAisleCut.js bandOf: a wall
 *  row is never crossed) → { objects, ids } or null (no bay under it). Pure. */
export function planTunnel(objects, band, n, gs = 40) {
  if (!band || !band.racks.length || !(n > 0)) return null
  const want = new Set(band.racks), ids = new Set()
  let out = objects.map(o => {
    if (!want.has(o.id)) return o
    const bays = bandBays(o, band, gs)
    if (!bays.length) return o
    ids.add(o.id)
    return withTunnel(o, bays, n)
  })
  if (!ids.size) return null
  out = asHandEdited(out, ids)
  return { objects: out, ids }
}
/** Lay the tunnel (one undo step); it is picked. → true when a bay took it. */
export function commitTunnel(store, band, n) {
  const st = store.getState(), gs = st.gridSize || 40
  const plan = planTunnel(st.objects, band, n, gs)
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
  // every segment's bays cleared first, then set where they go
  let next = changeSegs(st.objects, t, (r, s) => withTunnel(r, s.runIdx, 0))
  next = next.map(o => { const ss = t.segs.filter(s => s.rack.id === o.id); return ss.length ? ss.reduce((r, s) => withTunnel(r, s.runIdx.map(j => j + d), s.n), o) : o })
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
/** Tunnel `t` deleted: its bays' levels back — one undo step. */
export function deleteTunnel(store, t) {
  commitChange(store, changeSegs(store.getState().objects, t, (r, s) => withTunnel(r, s.runIdx, 0)), t.segs[0].rack.id)
  useTunnelPick.setState({ pick: null, drag: null })
  return true
}
/** The pick goes when anything is selected. Returns the unsubscribe. */
export function installTunnelKeeper(store) {
  return store.subscribe((st, prev) => { if (st.selectedIds !== prev.selectedIds && st.selectedIds.length) clearTunnelPick() })
}
