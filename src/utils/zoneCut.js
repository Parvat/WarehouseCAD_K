// zoneCut.js — what a zone (office, staging, washroom, custom area) does to the racks under it. Pure.
//
// THE RULE: a zone removes ONLY the bays its footprint covers. A single row's bay the zone touches goes; a
// back-to-back pair's bay goes half by half — the half the zone touches goes, the other half stays as a single row
// on the same uprights (faceReach.js piecesFromStates). Nothing outside the footprint is deleted, ever: a face the
// zone leaves without an aisle is a WARNING (generate/faceAisles.js — the plan's labels and X marks, Check layout's
// list), never a delete. A row piece shorter than MIN_PIECE_BAYS left beside a zone goes with the cut.
//
// REVERSIBLE: every rack a zone has cut carries `zoneBase`, the rack exactly as it stood before any zone touched it
// (row, bays, elevation types, position — every field). A rack the zones cover entirely leaves no piece to carry it,
// so its base is kept on the zone that covers most of it (`cutRacks`). On every zone change each cut rack is worked
// out again from its base against the zones as they are now: a bay no zone covers any more comes back exactly as it
// was, and with no zone on it at all the rack is its base again — same id, same everything. Several zones on one
// rack, a zone moved off one rack onto another, zones deleted: all the same computation.
//
// A cut rack edited by hand since (a piece moved, deleted, re-typed — its pieces no longer what its base and the
// zones before gave) keeps the edit: its pieces become their own bases and only the footprint is taken off them.

import { uprightXs } from '../render/rackOps'
import { piecesFromStates } from '../generate/faceReach'
import { splitRackForBayDelete } from './baySplit'
import { rebuildAisles } from './aisleRebuild'
import { rackFootprint } from '../generate/columnCheck'
import { rackSig, sigMatch } from '../generate/rackingArea'

export const MIN_PIECE_BAYS = 2           // a piece shorter than this, left beside a zone, goes with the cut
export const STUB_NEAR_FT = 2             // "beside": within this of the zone's footprint

const E = 1e-3
const BEAM = new Set(['rack_row', 'rack_double_row'])
const isRack = (o) => typeof o?.type === 'string' && o.type.startsWith('rack_')
export const isZoneObj = (o) => typeof o?.type === 'string' && o.type.startsWith('zone_') && o.width > 0 && o.height > 0
const isAreaObj = (o) => o?.type === 'racking_area'
const zoneBox = (z) => ({ x: z.x, y: z.y, w: z.width, h: z.height })
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > E && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > E
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const footBox = (r) => { const f = rackFootprint(r); return { x: f.x, y: f.y, w: f.w, h: f.h } }

/** A rack without its zone bookkeeping. */
export const strip = (r) => { if (!r || !('zoneBase' in r)) return r; const { zoneBase, ...rest } = r; return rest }
/* what a rack IS, for "did it change": every field but its id, its piece link, its bookkeeping and its UI state */
const SKIP = new Set(['id', 'pieceOf', 'zoneBase', 'activeBayIdx', 'activeBaySide'])
const canon = (o) => JSON.stringify(Object.keys(o).filter(k => !SKIP.has(k)).sort().map(k => [k, o[k]]))
const sameSet = (a, b) => {
  if (a.length !== b.length) return false
  const x = a.map(canon).sort(), y = b.map(canon).sort()
  return x.every((v, i) => v === y[i])
}

function toWorld(r) {
  const t = ((r.rotation || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  return (lx, ly) => ({ x: cx + (lx - cx) * c - (ly - cy) * s, y: cy + (lx - cx) * s + (ly - cy) * c })
}
const worldBox = (T, x0, y0, x1, y1) => {
  const p = [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)], xs = p.map(q => q.x), ys = p.map(q => q.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** `base` cut by `zones` (world px boxes): the pieces left — `[base]` itself when no zone covers any of it.
 *  Only covered bays (or pair halves) go; a resulting piece shorter than MIN_PIECE_BAYS beside a zone goes too. */
export function cutRack(base, zones, { gridSize = 40, newId }) {
  if (!zones.length || !(base.width > 0) || !overlapsAny(footBox(base), zones)) return [base]
  const rot = (((base.rotation || 0) % 360) + 360) % 360
  if (!BEAM.has(base.type) || rot % 90 !== 0 || !Array.isArray(base.beams)) {
    // any other rack: whole bays the zone touches (bay-split keeps the rest exactly where it was)
    const { xs, upW } = uprightXs(base, gridSize), T = toWorld(base)
    const gone = new Set()
    for (let i = 0; i + 1 < xs.length; i++) if (overlapsAny(worldBox(T, xs[i], base.y, xs[i + 1] + upW, base.y + base.height), zones)) gone.add(i)
    if (!gone.size) return [base]
    if (gone.size === xs.length - 1) return []
    return splitRackForBayDelete(base, gone, newId, gridSize) || []
  }
  const T = toWorld(base), { xs, upW, beams } = uprightXs(base, gridSize)
  const top = base.y, bot = base.y + base.height, depthPx = ((base.depthIn ?? 42) / 12) * gridSize
  const state = beams.map((_, i) => {
    const a = xs[i], b = xs[i + 1] + upW
    if (base.type === 'rack_row') return overlapsAny(worldBox(T, a, top, b, bot), zones) ? '-' : 'D'
    const goneA = overlapsAny(worldBox(T, a, top, b, top + depthPx), zones), goneB = overlapsAny(worldBox(T, a, bot - depthPx, b, bot), zones)
    return goneA && goneB ? '-' : goneA ? 'B' : goneB ? 'A' : 'D'
  })
  if (state.every(s => s === 'D')) return [base]
  const pieces = piecesFromStates(base, state, { gridSize, newId })
  const near = STUB_NEAR_FT * gridSize
  const reach = zones.map(z => ({ x: z.x - near, y: z.y - near, w: z.w + 2 * near, h: z.h + 2 * near }))
  return pieces.filter(p => (p.beams?.length ?? 0) >= MIN_PIECE_BAYS || !overlapsAny(footBox(p), reach))
}
const overlapsAny = (b, zones) => zones.some(z => overlaps(b, z))

/**
 * The layout with every rack cut for the zones as they are now — each cut rack worked out again from its base.
 *   prevZones:  the zones before this change (world px boxes) — tells a cut rack edited by hand since (its pieces
 *               no longer what its base and these zones gave) from one simply waiting to be worked out again
 *   extraBases: bases kept on zones this change deleted (their `cutRacks`), so what they covered comes back
 * Returns { objects, changed }; `objects` is the same array when nothing changed.
 */
export function applyZones(objects, { gridSize = 40, newId, prevZones = null, extraBases = [] } = {}) {
  const zoneObjs = objects.filter(isZoneObj), zones = zoneObjs.map(zoneBox)
  const live = new Map(objects.map(o => [o.id, o]))
  const groups = new Map()                                           // base id -> { base, pieces, plain }
  for (const o of objects) {
    if (!isRack(o) || !o.zoneBase) continue
    const k = o.zoneBase.id
    if (!groups.has(k)) groups.set(k, { base: o.zoneBase, pieces: [] })
    groups.get(k).pieces.push(o)
  }
  // bases whose racks a zone covers entirely: kept on zones (and on zones this change deleted)
  for (const b of [...zoneObjs.flatMap(z => z.cutRacks || []), ...extraBases]) {
    if (!b || groups.has(b.id)) continue
    const same = live.get(b.id)
    if (same && !same.zoneBase) continue                               // it stands again already (an undo, a paste)
    groups.set(b.id, { base: b, pieces: [] })
  }
  for (const o of objects) {
    if (!isRack(o) || o.zoneBase || groups.has(o.id) || !(o.width > 0)) continue
    if (overlapsAny(footBox(o), zones)) groups.set(o.id, { base: o, pieces: [o], plain: true })
  }
  if (!groups.size) return { objects, changed: false }

  const replace = new Map()                                          // old piece id -> [new racks] (the first carries them all)
  const stash = new Map()                                            // zone id -> bases kept on it
  const became = new Map()                                           // old id -> new ids (area records)
  let changed = false
  for (const [, g] of groups) {
    const base = strip(g.base)
    let next
    const prev = prevZones && g.pieces.length && !g.plain ? cutRack(base, prevZones, { gridSize, newId: () => 'prev' }) : null
    const handEdited = prev && !sameSet(g.pieces.map(strip), prev.map(strip))
    if (handEdited) {
      // edited since it was cut: its pieces are their own bases now, the footprint taken off them
      next = g.pieces.flatMap(p => { const sp = strip(p); return cutRack(sp, zones, { gridSize, newId }).map(q => (q === sp ? q : { ...q, zoneBase: sp })) })
    } else {
      const cut = cutRack(base, zones, { gridSize, newId })
      next = cut.length === 1 && cut[0] === base ? [base] : cut.map(p => ({ ...p, zoneBase: base }))
    }
    if (g.pieces.length && next.length === g.pieces.length && sameSet(g.pieces, next) && g.pieces.every((p, i) => !!p.zoneBase === !!next[i]?.zoneBase)) {
      continue                                                        // as it was: keep the very same objects
    }
    changed = true
    if (!next.length && !handEdited) {
      // all of it under zones: kept on the zone covering most of it
      const fb = footBox(base)
      let best = null, bestA = -1
      for (const z of zoneObjs) { const a = area(fb, zoneBox(z)); if (a > bestA) { bestA = a; best = z } }
      if (best) { if (!stash.has(best.id)) stash.set(best.id, []); stash.get(best.id).push(base) }
    }
    if (g.pieces.length) {
      replace.set(g.pieces[0].id, next)
      for (const p of g.pieces.slice(1)) replace.set(p.id, [])
    } else if (next.length) replace.set('__append__' + base.id, next)
    became.set(g.pieces.map(p => p.id).join('|') || base.id, { old: g.pieces, now: next })
  }
  // the zones' kept bases, rebuilt from scratch: what is still entirely covered
  const zonesChanged = zoneObjs.some(z => JSON.stringify(z.cutRacks || []) !== JSON.stringify(stash.get(z.id) || []))
  if (!changed && !zonesChanged) return { objects, changed: false }

  let out = []
  for (const o of objects) {
    if (replace.has(o.id)) { out.push(...replace.get(o.id)); continue }
    if (isZoneObj(o)) {
      const kept = stash.get(o.id)
      if (kept && kept.length) out.push({ ...o, cutRacks: kept })
      else if (o.cutRacks) { const { cutRacks, ...rest } = o; out.push(rest) } else out.push(o)
      continue
    }
    out.push(o)
  }
  for (const [k, v] of replace) if (k.startsWith('__append__')) out.push(...v)
  out = carryAreaRecords(out, became)
  return { objects: rebuildAisles(out, newId).objects, changed: true }
}

/* A racking area's record of the racks it placed stays true through a zone cut and its undoing: a group whose racks
   were all as placed is recorded as placed in its new shape (so the area does not read the cut as a hand edit). */
function carryAreaRecords(objects, became) {
  if (!became.size || !objects.some(isAreaObj)) return objects
  return objects.map(a => {
    if (!isAreaObj(a) || !a.placed) return a
    const placed = { ...a.placed }
    let touched = false
    for (const { old, now } of became.values()) {
      const mine = old.filter(o => o.areaId === a.id)
      const fromBase = !old.length && now.some(o => o.areaId === a.id)
      if (!mine.length && !fromBase) continue
      const clean = mine.length ? mine.every(o => sigMatch(placed[o.id], o)) : true
      for (const o of mine) delete placed[o.id]
      if (clean) for (const o of now) if (o.areaId === a.id) placed[o.id] = rackSig(o)
      touched = true
    }
    return touched ? { ...a, placed } : a
  })
}

/** Bays per row (a pair's bay counts two). */
export const rowBayCount = (objects) => objects.filter(o => isRack(o) && Array.isArray(o.beams)).reduce((t, o) => t + o.beams.length * (o.type === 'rack_double_row' ? 2 : 1), 0)
