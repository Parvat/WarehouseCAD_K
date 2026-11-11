// crossAisleTool.js — a cross-aisle as something you pick and move (STUDIO.md §7a Cross-aisles, cross-aisle round).
//
// A cross-aisle is not an object: it is the gap along the run where a row passes from one section's racks to the
// next's (utils/copyChange.js sectionCrossAisles, per line). The lines whose gaps line up across are ONE cross-aisle.
// A click in it picks it (the canvas's press, canvas2/useCanvasInteraction.js); a drag along the run moves it in whole
// bays — in every line it crosses the run on one side gains the bays the other loses, the aisle's width unchanged — and
// stops where a run would pass Max run or fall under MIN_RUN_BAYS (3). The card types its place from the start wall
// (its low end: the left, or the top). One undo per move. A Fill's racks stay its own: the area's pattern and the racks'
// signatures follow the move (generate/rackingArea.js), so a later resize carries the new split on.

import { create } from 'zustand'
import { sectionCrossAisles } from './copyChange'
import { rackFootprint } from '../generate/rackFootprint'
import { piecesFromStates } from '../generate/faceReach'
import { innerOutline } from './floorGeom'
import { rackSig, areaSettings } from '../generate/rackingArea'
import { MIN_RUN_BAYS } from '../generate/sizingLayout'
import { rackingSettings } from './fillTool'
import { rebuildAisles } from './aisleRebuild'
import { nanoid } from 'nanoid'

const EPS = 1e-6
const FP = /^fp_/
const RACK = new Set(['rack_row', 'rack_double_row'])

/** The picked cross-aisle — { fpId, rot, at (a run position inside it, world px) } — and a drag in progress: { d (bays),
 *  labels: { a, w, b } } (canvas2/CrossAislePick.jsx draws both). */
export const useCrossAislePick = create(() => ({ pick: null, drag: null }))
export const clearCrossAislePick = () => { if (useCrossAislePick.getState().pick || useCrossAislePick.getState().drag) useCrossAislePick.setState({ pick: null, drag: null }) }

/** Every cross-aisle: [{ key, fpId, rot (rows up and down), lines: [{ a, b, lo, hi, cross }], lo, hi (along, world px),
 *  c0, c1 (across) }] — the per-line gaps whose stretches along the run overlap, one cross-aisle. */
export function crossAislesNow(objects) {
  const out = []
  for (const fp of (objects || []).filter(o => FP.test(o.type || ''))) {
    for (const rot of [false, true]) {
      const lines = sectionCrossAisles(objects, fp.id, rot).filter(g => g.hi - g.lo > EPS && RACK.has(g.a.type) && RACK.has(g.b.type)).sort((p, q) => p.lo - q.lo)
      const clusters = []
      for (const l of lines) {
        const c = clusters.find(k => Math.min(k.hi, l.hi) - Math.max(k.lo, l.lo) > EPS)
        if (c) { c.lines.push(l); c.lo = Math.min(c.lo, l.lo); c.hi = Math.max(c.hi, l.hi); c.c0 = Math.min(c.c0, l.cross[0]); c.c1 = Math.max(c.c1, l.cross[1]) }
        else clusters.push({ fpId: fp.id, rot, lines: [l], lo: l.lo, hi: l.hi, c0: l.cross[0], c1: l.cross[1] })
      }
      for (const c of clusters) out.push({ ...c, key: `${fp.id}|${rot ? 'v' : 'h'}|${Math.round(c.lo)}` })
    }
  }
  return out
}
/** The cross-aisle under world point `w` (inside the gap of one of its lines), or null. */
export function crossAisleAt(objects, w) {
  for (const c of crossAislesNow(objects)) {
    const along = c.rot ? w.y : w.x, across = c.rot ? w.x : w.y
    if (c.lines.some(l => along >= l.lo - EPS && along <= l.hi + EPS && across >= l.cross[0] - EPS && across <= l.cross[1] + EPS)) return c
  }
  return null
}
/** The picked one now (it follows a move: the one holding its run position, else the nearest of its building and
 *  direction). */
export function pickedCrossAisle(objects, pick = useCrossAislePick.getState().pick) {
  if (!pick) return null
  const all = crossAislesNow(objects).filter(c => c.fpId === pick.fpId && c.rot === pick.rot)
  return all.find(c => pick.at >= c.lo - EPS && pick.at <= c.hi + EPS) || all.reduce((b, c) => (!b || Math.abs((c.lo + c.hi) / 2 - pick.at) < Math.abs((b.lo + b.hi) / 2 - pick.at) ? c : b), null)
}

/* a rack's run along the cross-aisle's axis, and the run (the racks of one section in one line) a rack belongs to */
const runOf = (o, rot) => { const f = rackFootprint(o); return rot ? [f.y, f.y + f.h] : [f.x, f.x + f.w] }
const acrossOf = (o, rot) => { const f = rackFootprint(o); return rot ? [f.x, f.x + f.w] : [f.y, f.y + f.h] }
function runBays(objects, rack, rot) {
  const [c0, c1] = acrossOf(rack, rot)
  return objects.filter(o => RACK.has(o.type) && o.parentId === rack.parentId && o.genSection === rack.genSection && (() => { const [d0, d1] = acrossOf(o, rot); return Math.min(d1, c1) - Math.max(d0, c0) > EPS })())
    .reduce((t, o) => t + (o.beams?.length || 0), 0)
}
/** The longest run allowed, in bays: the area's Max run when its racks are a Fill's, else the Racking settings'. */
function maxBaysFor(objects, rack) {
  const area = rack.areaId ? objects.find(o => o.id === rack.areaId) : null
  const maxRunFt = (area ? areaSettings(area).maxRunFt : rackingSettings().maxRunFt) || 150
  const beam = rack.beams?.[0] || 96, up = rack.uprightWidth || 3
  return Math.max(1, Math.floor((maxRunFt * 12 - up) / (beam + up)))
}
/** How far (whole bays) cross-aisle `c` may move: [dMin, dMax] — every run either side kept within MIN_RUN_BAYS and Max
 *  run (a positive move: toward the run's high end). */
export function moveRange(objects, c) {
  let lo = -Infinity, hi = Infinity
  for (const l of c.lines) {
    const na = runBays(objects, l.a, c.rot), nb = runBays(objects, l.b, c.rot), M = maxBaysFor(objects, l.a)
    hi = Math.min(hi, M - na, nb - MIN_RUN_BAYS)
    lo = Math.max(lo, MIN_RUN_BAYS - na, nb - M)
  }
  return [Math.min(0, lo), Math.max(0, hi)]
}
/** A bay's pitch along the run at cross-aisle `c` (world px). */
export const bayPitch = (c, gridSize = 40) => { const r = c.lines[0].a; const beam = r.beams[r.beams.length - 1] || 96; return ((beam + (r.uprightWidth || 3)) / 12) * gridSize }

/** Rack `r` with `k` bays more (k < 0: fewer) at its end toward world run position `toward` along the cross-aisle's axis. */
function growToward(r, k, toward, rot, gridSize) {
  if (!k) return r
  const t = ((r.rotation || 0) * Math.PI) / 180, dir = { x: Math.cos(t), y: Math.sin(t) }
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const high = ((rot ? toward - cy : toward - cx) * (rot ? dir.y : dir.x)) > 0          // its local high end faces the aisle
  const n = r.beams.length
  if (k < 0) {
    const m = -k
    if (m >= n) return null
    const state = r.beams.map((_, i) => ((high ? i >= n - m : i < m) ? '-' : 'D'))
    return piecesFromStates(r, state, { gridSize, newId: nanoid })[0]
  }
  const beam = high ? r.beams[n - 1] : r.beams[0]
  const dw = k * ((beam + (r.uprightWidth || 3)) / 12) * gridSize, w = r.width + dw
  const ncx = cx + dir.x * (high ? dw / 2 : -dw / 2), ncy = cy + dir.y * (high ? dw / 2 : -dw / 2)
  const pad = (arr, v) => (Array.isArray(arr) ? (high ? arr : [...Array(k).fill(v), ...arr]) : arr)
  return {
    ...r, beams: high ? [...r.beams, ...Array(k).fill(beam)] : [...Array(k).fill(beam), ...r.beams], width: w, x: ncx - w / 2, y: ncy - r.height / 2,
    ...(r.elevBays ? { elevBays: r.elevBays.map(a => pad(a, undefined)) } : {}),
    ...(r.bayEmpty ? { bayEmpty: r.bayEmpty.map(a => pad(a, false)) } : {}),
    activeBayIdx: null, activeBaySide: null,
  }
}

/** `objects` with cross-aisle `c` moved `d` whole bays along the run (clamped to moveRange) → { objects, d }. Pure. */
export function planCrossAisleMove(objects, c, d, { gridSize = 40 } = {}) {
  const [dMin, dMax] = moveRange(objects, c)
  d = Math.max(dMin, Math.min(dMax, Math.round(d)))
  if (!d) return { objects, d: 0 }
  const changed = new Map()
  for (const l of c.lines) {
    // the low side's rack gains d bays toward the aisle, the high side's loses d at its end toward it (and the reverse)
    const a = changed.get(l.a.id) || l.a, b = changed.get(l.b.id) || l.b
    const a2 = growToward(a, d, l.lo + (l.hi - l.lo) / 2, c.rot, gridSize), b2 = growToward(b, -d, l.lo + (l.hi - l.lo) / 2, c.rot, gridSize)
    if (!a2 || !b2) return { objects, d: 0 }
    changed.set(l.a.id, a2); changed.set(l.b.id, b2)
  }
  let out = objects.map(o => changed.get(o.id) || o)
  // a Fill's racks stay its own: the area's pattern split moves too, and the racks' signatures follow
  const areas = new Set([...changed.values()].map(r => r.areaId).filter(Boolean))
  out = out.map(o => {
    if (!areas.has(o.id) || !o.pattern) return o
    const P = o.pattern, pitchFt = (P.upIn + P.beamIn) / 12, runLen = (n) => (P.upIn * (n + 1) + n * P.beamIn) / 12
    const lo = c.lo / gridSize, hi = c.hi / gridSize
    const pieces = P.pieces.map(p => {
      if (Math.abs(p.r0 + runLen(p.n) - lo) < 0.02) return { ...p, n: p.n + d }
      if (Math.abs(p.r0 - hi) < 0.02) return { ...p, r0: p.r0 + d * pitchFt, n: p.n - d }
      return p
    })
    const placed = { ...(o.placed || {}) }
    for (const r of changed.values()) if (r.areaId === o.id && placed[r.id] != null) placed[r.id] = rackSig(r)
    return { ...o, pattern: { ...P, pieces }, placed }
  })
  return { objects: rebuildAisles(out, nanoid).objects, d }
}
/** Move cross-aisle `c` `d` bays — one undo step; the pick follows it. → the bays moved. */
export function moveCrossAisle(store, c, d) {
  const st = store.getState(), gs = st.gridSize || 40
  const plan = planCrossAisleMove(st.objects, c, d, { gridSize: gs })
  if (!plan.d) return 0
  const anchor = c.lines[0].a.id
  store.setState({ objects: plan.objects })
  store.getState().commitObjectUpdate(anchor, {})
  const shift = plan.d * bayPitch(c, gs)
  useCrossAislePick.setState({ pick: { fpId: c.fpId, rot: c.rot, at: (c.lo + c.hi) / 2 + shift }, drag: null })
  return plan.d
}

/** Its place from the start wall (ft): from the building's inner wall at the run's low end (the left, the top) to the
 *  aisle's near edge, as a line crossing it reads (its first). */
export function positionFt(objects, c, gridSize = 40) {
  const fp = objects.find(o => o.id === c.fpId), inner = fp ? innerOutline(fp, gridSize) : null
  const wall = inner ? Math.min(...inner.map(p => (c.rot ? p.y : p.x))) : 0
  return (c.lines[0].lo - wall) / gridSize
}
/** The runs either side and the width, for the live label and the card: { a (bays), w (ft), b (bays) } after `d`. */
export function runsAt(objects, c, d = 0, gridSize = 40) {
  const l = c.lines[0]
  return { a: runBays(objects, l.a, c.rot) + d, w: (l.hi - l.lo) / gridSize, b: runBays(objects, l.b, c.rot) - d }
}
/** The pick goes when anything is selected (a click elsewhere, Ctrl+A …). Returns the unsubscribe. */
export function installCrossAisleKeeper(store) {
  return store.subscribe((st, prev) => { if (st.selectedIds !== prev.selectedIds && st.selectedIds.length) clearCrossAislePick() })
}
