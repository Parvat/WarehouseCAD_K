// crossAisleCut.js — the Cross aisle tool (STUDIO.md §7a Cross-aisles, xaisle-tool round): a cross-aisle cut by hand.
//
// A Fill never cuts its rows (generate/fillRacking.js areaPattern: one run the full length); a cross-aisle is made here.
//   - The tool (the tool pill, after Split): a drag across the rows lays a BAND — its width along the run the width in
//     force (the mode bar's typed width, else the cross-aisle width of the equipment where the band starts: its section's,
//     else the project forklift's), its length across the rows as far as the drag goes. The band's start snaps to the
//     nearest bay line (an upright) of the rows it crosses.
//   - Every row the band crosses is cut there in whole bays: the bays before the band stay (ending on their upright), the
//     band is clear floor exactly as wide as the width, and after it the row carries on with as many whole bays as fit up
//     to where the row ended (the leftover under a bay at that far end — kept on the piece as `xaSpareFt`, so a width
//     change or a Delete gives the row back). A band over a row's end trims it (no run left on that side).
//   - The two runs are told apart by their section stamp (`genSection`): the far run gets a new one, so the gap is a
//     cross-aisle like Generate's (utils/copyChange.js sectionCrossAisles) — picked, dragged and typed as one
//     (utils/crossAisleTool.js), its width changed in the card (setCrossAisleWidth), Delete rejoins its rows
//     (deleteCrossAisle). One undo step each.
//   - A Fill's racks cut here are hand-edited racks of the area (their signatures no longer match): a later resize keeps
//     them as they are and fills round them, as for any rack changed by hand.

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { geom, uprightsOf, withRun, isRowRack } from './rowGroup'
import { carryElev, withElev } from './elevations'
import { joinRacks } from '../canvas2/inlineSnap'
import { rebuildAisles } from './aisleRebuild'
import { fillEquipment, crossOf } from './fillTool'
import { useCrossAislePick, crossAislesNow, runPiece, withEnd } from './crossAisleTool'
import { MIN_RUN_BAYS } from '../generate/sizingLayout'
import { wallSideOf } from './rackDepth'

export const CROSS_AISLE_TOOL = 'cross_aisle'
const EPS = 1e-6

/** The tool's state: the drag ({ from, to } world px), the pointer (`at`: the equipment there gives the default width),
 *  and the width typed in the mode bar (ft; null — the equipment's). */
/* (tunnel round: `mode` — 'cross' cuts the rows, 'tunnel' takes the bottom `levels` levels out of the bays under the band,
   utils/tunnel.js) */
/* (tunnel fixes: `tunnelWidthFt` — Tunnel's Width, its bay's beam length, typed; null: the standard bay) */
export const useCrossAisleTool = create(() => ({ drag: null, at: null, widthFt: null, mode: 'cross', levels: 2, tunnelWidthFt: null }))
export const setTunnelWidthFt = (ft) => useCrossAisleTool.setState({ tunnelWidthFt: Number.isFinite(ft) && ft > 0 ? ft : null })
export const setCutMode = (mode) => useCrossAisleTool.setState({ mode: mode === 'tunnel' ? 'tunnel' : 'cross' })
export const setTunnelRemove = (n) => useCrossAisleTool.setState({ levels: Number.isFinite(n) && n >= 1 ? Math.round(n) : 2 })
export const setCutWidth = (ft) => useCrossAisleTool.setState({ widthFt: Number.isFinite(ft) && ft > 0 ? ft : null })
export const cancelCut = () => { const had = !!useCrossAisleTool.getState().drag; if (had) useCrossAisleTool.setState({ drag: null }); return had }

/** The width a band takes (ft): the typed one, else the cross-aisle width of the equipment in force at `at` (the section
 *  there's, else the project forklift's — utils/fillTool.js fillEquipment). */
export function cutWidthFt(objects, at) {
  const typed = useCrossAisleTool.getState().widthFt
  if (typed) return typed
  return defaultWidthFt(objects, at)
}
export const defaultWidthFt = (objects, at) => crossOf(fillEquipment(objects, at)) || 9

const rev = (o) => { const t = ((((o.rotation || 0) % 360) + 360) % 360); return t === 180 || t === 270 }
const upPx = (o, gs) => ((o.uprightWidth || 3) / 12) * gs

/** Rack `o` rebuilt as its run-order bays `runIdx` (indices into its own run order) starting at `r0` (world px): the
 *  bays' elevation types and empty sides ride with them; `genRunFt` follows the start. */
const piece = (...a) => runPiece(...a)

/** The band for a drag `from` → `to` (world px): rows run across the drag. → { vert (the rows run up and down), s0, s1
 *  (along the run: the band's width, its start on a bay line), c0, c1 (across: the drag's length), racks (ids crossed) }
 *  or null (no drag yet). `skip(o)`: a rack not to cut (locked). */
export function bandOf(objects, from, to, widthFt, gs = 40, skip = () => false) {
  if (!from || !to) return null
  const dx = to.x - from.x, dy = to.y - from.y
  const vert = Math.abs(dx) > Math.abs(dy)                    // dragged left / right: the rows run up and down
  const c0 = vert ? Math.min(from.x, to.x) : Math.min(from.y, to.y), c1 = vert ? Math.max(from.x, to.x) : Math.max(from.y, to.y)
  const along = vert ? from.y : from.x, W = widthFt * gs
  const all = objects.filter(o => isRowRack(o) && !skip(o)).map(o => ({ o, g: geom(o) })).filter(({ g }) => g.vert === vert && Math.min(g.s1, c1) - Math.max(g.s0, c0) > EPS)
  /* a row that stands along a wall is never cut, nor tunnelled (the wall-row rule — generate/wallRun.js, utils/rackDepth.js
     wallSideOf): it runs unbroken; the band passes it by (`walls`: shown as not cut) */
  const rows = all.filter(({ o }) => !wallSideOf(o, objects, gs))
  // the band's start on the nearest bay line (an upright's far face) of a row it crosses, to where the pointer pressed
  let s0 = along - W / 2, best = Infinity
  for (const { o, g } of rows) {
    if (g.r1 < along - W || g.r0 > along + W) continue
    const ups = uprightsOf(g.r0, g.beams, upPx(o, gs), gs)
    for (let i = 0; i < ups.length; i++) { const line = ups[i] + upPx(o, gs), d = Math.abs(line - (along - W / 2)); if (d < best) { best = d; s0 = line } }
  }
  const s1 = s0 + W
  const racks = rows.filter(({ g }) => Math.min(g.r1, s1) - Math.max(g.r0, s0) > EPS).map(({ o }) => o.id)
  const walls = all.filter(({ o, g }) => wallSideOf(o, objects, gs) && Math.min(g.r1, s1) - Math.max(g.r0, s0) > EPS).map(({ o, g }) => ({ id: o.id, s0: g.s0, s1: g.s1 }))
  return { vert, s0, s1, c0, c1, racks, walls }
}

/** Rack `o` cut by the band [s0, s1] along its run → [low, high] (either may be null: the band over that end). */
function cutRow(o, s0, s1, gs, newId, secLow, secHigh) {
  const g = geom(o), n = g.beams.length, up = upPx(o, gs)
  const ups = uprightsOf(g.r0, g.beams, up, gs), R = ups[n] + up
  let a = 0
  for (let i = 1; i <= n; i++) if (ups[i] + up <= s0 + EPS) a = i
  let b = 0, len = up
  for (let j = n - 1; j >= a; j--) { const l = len + (g.beams[j] / 12) * gs + up; if (s1 + l <= R + EPS) { len = l; b++ } else break }
  /* fixes-x: a run is 3 bays or more, or none — a side left with 1 or 2 bays goes, the aisle trims the row there (an end
     aisle on the side that stays: the gap from it to the band's far edge). Root cause of the 1-bay piece: the cut kept
     whatever whole bays fitted either side, the 3-bay rule lived only in the drag. */
  const shortLow = a > 0 && a < MIN_RUN_BAYS, shortHigh = b > 0 && b < MIN_RUN_BAYS
  if (shortLow || shortHigh) {
    const lowN = shortLow ? 0 : a, highN = shortHigh ? 0 : b
    const at = a > 0 ? s1 : R - len
    if (lowN && !highN) {
      const low = withEnd(piece(o, Array.from({ length: lowN }, (_, j) => j), g.r0, gs, { genSection: secLow }), 'hi', 0)
      delete low.xaSpareFt
      return [b > 0 ? withEnd(low, 'hi', (s1 - geom(low).r1) / gs) : low, null]
    }
    if (highN && !lowN) {
      const high = withEnd(piece(o, Array.from({ length: highN }, (_, j) => n - highN + j), at, gs, {}), 'lo', 0)
      if (high.splitOf) delete high.splitOf
      if (o.xaSpareFt == null) delete high.xaSpareFt
      return [null, a > 0 ? withEnd(high, 'lo', (at - s0) / gs) : high]
    }
    if (!lowN && !highN) return [null, null]
  }
  // nothing left before the band (it lies over the row's start: a trim) — the run keeps the row's far end, the leftover by
  // the band; else the run after starts at the band's far edge (the aisle exactly the width), the leftover at the far end
  const at = a > 0 ? s1 : R - len
  const spare = (R - (at + len)) / gs + (o.xaSpareFt || 0)
  const low = a > 0 ? piece(o, Array.from({ length: a }, (_, j) => j), g.r0, gs, { genSection: secLow }) : null
  if (low) delete low.xaSpareFt
  const high = b > 0 ? piece(o, Array.from({ length: b }, (_, j) => n - b + j), at, gs, low ? { id: newId(), pieceOf: o.pieceOf || o.id, genSection: secHigh, xaSpareFt: spare } : {}) : null
  // (a trim keeps the rack's own section stamp: no cross-aisle there)
  if (high && !low) { if (o.xaSpareFt == null) delete high.xaSpareFt }
  if (high && high.splitOf) delete high.splitOf
  // an end aisle stays at its own end: the run before the band keeps the start's, the run after it the end's (tunnel fixes)
  return [low && withEnd(low, 'hi', 0), high && withEnd(high, 'lo', 0)]
}

/** `objects` with the band cut through every row it crosses (bandOf) → { objects, cut (ids now either side), lo (the
 *  band's start, world px) } — pure; null when it crosses no row. */
export function planCut(objects, band, { gridSize = 40, newId = nanoid } = {}) {
  if (!band || !band.racks.length) return null
  const ids = new Set(band.racks)
  let next = 1 + Math.max(0, ...objects.filter(o => isRowRack(o)).map(o => o.genSection || 0))
  const freshLow = next++, freshHigh = next++
  const out = [], made = []
  for (const o of objects) {
    if (!ids.has(o.id)) { out.push(o); continue }
    const [low, high] = cutRow(o, band.s0, band.s1, gridSize, newId, o.genSection ?? freshLow, freshHigh)
    for (const p of [low, high]) if (p) { out.push(p); made.push(p.id) }
  }
  return { objects: rebuildAisles(out, newId).objects, cut: made, lo: band.s0 }
}

/** Cut the band (one undo step); the new cross-aisle is picked. → true when something was cut. */
export function commitCut(store, band) {
  const st = store.getState(), gs = st.gridSize || 40
  const plan = planCut(st.objects, band, { gridSize: gs })
  if (!plan) return false
  store.setState({ objects: plan.objects })
  store.getState().commitObjectUpdate(plan.cut[0], {})
  // the cross-aisle it made, picked (a band over row ends only trims: nothing to pick)
  const fpId = plan.objects.find(o => o.id === plan.cut[0])?.parentId
  const c = crossAislesNow(plan.objects).find(k => k.rot === band.vert && k.fpId === fpId && Math.abs(k.lo - band.s0) < 2 * gs && k.hi > band.s0)
  store.getState().clearSelection?.()
  useCrossAislePick.setState({ pick: c ? { fpId: c.fpId, rot: c.rot, at: (c.lo + c.hi) / 2 } : null, drag: null })
  return true
}

/* ── the cross-aisle's width and its Delete ── */

/** The high side's rack `b` re-laid from `start` (world px) with as many of its far-end bays (and the default bay before
 *  them) as fit up to where its row ended (`xaSpareFt` past its end). null when not one bay fits. */
function relayHigh(b, start, gs) {
  const g = geom(b), up = upPx(b, gs), limit = g.r1 + (b.xaSpareFt || 0) * gs
  const n = g.beams.length, beam = g.beams[0]
  let len = up, k = 0
  // its own bays first (from its far end), then bays like its first one before them
  while (true) { const bw = ((k < n ? g.beams[n - 1 - k] : beam) / 12) * gs; if (start + len + bw + up <= limit + EPS) { len += bw + up; k++ } else break }
  if (!k) return null
  const own = Math.min(k, n), extra = k - own
  const runIdx = [...Array(extra).fill(null), ...Array.from({ length: own }, (_, j) => n - own + j)]
  // new bays: the beam of its first bay, nothing carried
  const beamsRun = runIdx.map(j => (j == null ? beam : g.beams[j]))
  const built = withRun(b, start, beamsRun, gs)
  const local = runIdx.map(j => (j == null ? null : rev(b) ? n - 1 - j : j))
  const out = withElev(built, carryElev(b, rev(b) ? [...local].reverse() : local))
  if (b.genRunFt != null) out.genRunFt = b.genRunFt + (start - g.r0) / gs
  out.xaSpareFt = (limit - (start + len)) / gs
  out.activeBaySide = null
  return out
}

/** `objects` with cross-aisle `c` (utils/crossAisleTool.js) `widthFt` wide in every line: the run after it starts that
 *  far from the run before it, its far end held where its row ended. → objects, or null (a run would lose every bay). */
export function planCrossAisleWidth(objects, c, widthFt, { gridSize = 40 } = {}) {
  if (!(widthFt > 0)) return null
  const changed = new Map(), gone = new Set()
  for (const l of c.lines) {
    // an end aisle: its gap at the row's end that wide (tunnel fixes)
    if (!l.a || !l.b) { const r0 = l.a || l.b, r = changed.get(r0.id) || r0; changed.set(r.id, withEnd(r, l.a ? 'hi' : 'lo', widthFt)); continue }
    const a = changed.get(l.a.id) || l.a, b = changed.get(l.b.id) || l.b
    const b2 = relayHigh(b, geom(a).r1 + widthFt * gridSize, gridSize)
    // (fixes-x: a run after it of 1 or 2 bays — or none — goes: the aisle at the row's end, an end aisle that wide)
    if (!b2 || b2.beams.length < MIN_RUN_BAYS) { gone.add(b.id); changed.set(a.id, withEnd(a, 'hi', widthFt)); continue }
    changed.set(b.id, b2)
  }
  return rebuildAisles(objects.filter(o => !gone.has(o.id)).map(o => changed.get(o.id) || o), nanoid).objects
}
export function setCrossAisleWidth(store, c, widthFt) {
  const st = store.getState(), gs = st.gridSize || 40
  const next = planCrossAisleWidth(st.objects, c, widthFt, { gridSize: gs })
  if (!next) return false
  store.setState({ objects: next })
  store.getState().commitObjectUpdate((c.lines[0].b || c.lines[0].a).id, {})
  return true
}

/** `objects` with cross-aisle `c` deleted: in every line the run before it and the run after it are one rack again —
 *  the bays the cut took back (as many as fit to where the row ended), the run after's bays as they were. Pure. */
export function planCrossAisleDelete(objects, c, { gridSize = 40 } = {}) {
  const changed = new Map(), gone = new Set()
  for (const l of c.lines) {
    // an end aisle: let go — the row stays as it is (tunnel fixes)
    if (!l.a || !l.b) { const r0 = l.a || l.b, r = changed.get(r0.id) || r0; if (!gone.has(r.id)) changed.set(r.id, withEnd(r, l.a ? 'hi' : 'lo', 0)); continue }
    const a = changed.get(l.a.id) || l.a, b = changed.get(l.b.id) || l.b
    if (gone.has(a.id) || gone.has(b.id)) continue
    const ga = geom(a), gb = geom(b), up = upPx(a, gridSize)
    const limit = gb.r1 + (b.xaSpareFt || 0) * gridSize
    const beam = ga.beams[ga.beams.length - 1], pitch = ((beam + (a.uprightWidth || 3)) / 12) * gridSize
    // the bays between (new, nothing carried): as many as fit with the run after's own bays up to where the row ended
    const have = (ga.r1 - ga.r0) + (gb.r1 - gb.r0) - up
    const k = Math.max(0, Math.floor((limit - ga.r0 - have + EPS) / pitch))
    let merged = a
    if (k) {
      const runIdx = Array.from({ length: ga.beams.length }, (_, j) => j)
      const grown = withRun(a, ga.r0, [...ga.beams, ...Array(k).fill(beam)], gridSize)
      const n = ga.beams.length, local = [...runIdx, ...Array(k).fill(null)].map(j => (j == null ? null : rev(a) ? n - 1 - j : j))
      merged = withElev(grown, carryElev(a, rev(a) ? [...local].reverse() : local))
    }
    // the run after, end to end with it (joinRacks keeps the first one's place)
    const bAt = withRun(b, geom(merged).r1 - up, gb.beams, gridSize)
    merged = joinRacks(merged, bAt, gridSize)
    // (the run after's end aisle, if any, is the joined row's: tunnel fixes)
    merged = withEnd(withEnd(merged, 'hi', b.xaEnd?.hi), 'lo', a.xaEnd?.lo)
    merged.xaSpareFt = (limit - geom(merged).r1) / gridSize
    if (!(merged.xaSpareFt > 1e-6)) delete merged.xaSpareFt
    changed.set(a.id, merged); gone.add(b.id)
  }
  const out = objects.filter(o => !gone.has(o.id)).map(o => changed.get(o.id) || o)
  return rebuildAisles(out, nanoid).objects
}
export function deleteCrossAisle(store, c) {
  const st = store.getState(), gs = st.gridSize || 40
  const next = planCrossAisleDelete(st.objects, c, { gridSize: gs })
  store.setState({ objects: next })
  store.getState().commitObjectUpdate((c.lines[0].a || c.lines[0].b).id, {})
  useCrossAislePick.setState({ pick: null, drag: null })
  return true
}
