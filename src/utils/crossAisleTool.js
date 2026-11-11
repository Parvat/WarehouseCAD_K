// crossAisleTool.js — a cross-aisle as something you pick and move (STUDIO.md §7a Cross-aisles, cross-aisle round).
//
// A cross-aisle is not an object: it is the gap along the run where a row passes from one section's racks to the
// next's (utils/copyChange.js sectionCrossAisles, per line). The lines whose gaps line up across are ONE cross-aisle.
// A click in it picks it (the canvas's press, canvas2/useCanvasInteraction.js); a drag along the run moves it in whole
// bays — in every line it crosses the run on one side gains the bays the other loses, the aisle's width unchanged — and
// stops where a run would fall under MIN_RUN_BAYS (3) (xaisle-tool: Max run no longer stops it — a run longer than Max run
// is a Check warning). Its width is typed in the card and Delete rejoins its rows (utils/crossAisleCut.js, which also
// makes one: the Cross aisle tool). The card types its place from the start wall
// (its low end: the left, or the top). One undo per move. A Fill's racks stay its own: the area's pattern and the racks'
// signatures follow the move (generate/rackingArea.js), so a later resize carries the new split on.

import { create } from 'zustand'
import { sectionCrossAisles } from './copyChange'
import { rackFootprint } from '../generate/rackFootprint'
import { piecesFromStates } from '../generate/faceReach'
import { innerOutline } from './floorGeom'
import { rackSig, sigMatch } from '../generate/rackingArea'
import { MIN_RUN_BAYS } from '../generate/sizingLayout'
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
/* tunnel round: a run either side is MIN_RUN_BAYS (3) bays or more, or 0 — the aisle at the row's end, the row trimmed
   there (only where that run is one rack: it goes); never 1 or 2. Max run does not stop it (xaisle-tool: a Check warning). */
const okRun = (n, whole) => n >= MIN_RUN_BAYS || (n === 0 && whole)
/** Is a move of `d` whole bays allowed for cross-aisle `c` (a positive move: toward the run's high end)? */
function moveOk(objects, c, d) {
  for (const l of c.lines) {
    const na = runBays(objects, l.a, c.rot), nb = runBays(objects, l.b, c.rot)
    const A = na + d, B = nb - d
    if (A < 0 || B < 0 || (A === 0 && B === 0)) return false
    if (!okRun(A, na === l.a.beams.length) || !okRun(B, nb === l.b.beams.length)) return false
  }
  return true
}
/** Every allowed move of cross-aisle `c`, sorted (0 included). */
export function allowedMoves(objects, c) {
  let lo = 0, hi = 0
  for (const l of c.lines) { lo = Math.min(lo, -runBays(objects, l.a, c.rot)); hi = Math.max(hi, runBays(objects, l.b, c.rot)) }
  const out = []
  for (let d = lo; d <= hi; d++) if (d === 0 || moveOk(objects, c, d)) out.push(d)
  return out
}
/** How far (whole bays) cross-aisle `c` may move: [dMin, dMax] — the farthest allowed either way (up to a row's end). */
export function moveRange(objects, c) {
  const all = allowedMoves(objects, c)
  return [Math.min(0, ...all), Math.max(0, ...all)]
}
/** The allowed move nearest `d` — a run of 1 or 2 bays is never left: past 3 bays the drag jumps to the row's end
 *  (half way: the nearer of the two; a tie goes the way it is dragged). */
export function snapMove(objects, c, d) {
  d = Math.round(d)
  const all = allowedMoves(objects, c)
  let best = 0
  for (const v of all) { const a = Math.abs(v - d), b = Math.abs(best - d); if (a < b || (a === b && Math.abs(v) > Math.abs(best) && Math.sign(v) === Math.sign(d))) best = v }
  return best
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
    ...(Array.isArray(r.tunnelBays) ? { tunnelBays: pad(r.tunnelBays, 0) } : {}),
    activeBayIdx: null, activeBaySide: null,
  }
}

/** `objects` with cross-aisle `c` moved `d` whole bays along the run (snapped to an allowed move: snapMove) → { objects,
 *  d, end (the aisle went to a row's end: no cross-aisle left there) }. Pure. */
export function planCrossAisleMove(objects, c, d, { gridSize = 40 } = {}) {
  d = snapMove(objects, c, d)
  if (!d) return { objects, d: 0 }
  const changed = new Map(), gone = new Set()
  for (const l of c.lines) {
    // the low side's rack gains d bays toward the aisle, the high side's loses d at its end toward it (and the reverse);
    // a side brought to 0 bays goes — the aisle at the row's end, the row trimmed there
    const a = changed.get(l.a.id) || l.a, b = changed.get(l.b.id) || l.b
    const mid = l.lo + (l.hi - l.lo) / 2
    if (d < 0 && -d >= a.beams.length) { gone.add(a.id); changed.set(l.b.id, growToward(b, -d, mid, c.rot, gridSize)); continue }
    if (d > 0 && d >= b.beams.length) { gone.add(b.id); changed.set(l.a.id, growToward(a, d, mid, c.rot, gridSize)); continue }
    const a2 = growToward(a, d, mid, c.rot, gridSize), b2 = growToward(b, -d, mid, c.rot, gridSize)
    if (!a2 || !b2) return { objects, d: 0 }
    changed.set(l.a.id, a2); changed.set(l.b.id, b2)
  }
  let out = objects.filter(o => !gone.has(o.id)).map(o => changed.get(o.id) || o)
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
    }).filter(p => p.n > 0)
    const placed = { ...(o.placed || {}) }
    // (only a rack the area still holds as it placed it: one cut or changed by hand stays hand-edited — xaisle-tool)
    for (const r of changed.values()) { const was = objects.find(x => x.id === r.id); if (r.areaId === o.id && placed[r.id] != null && sigMatch(placed[r.id], was)) placed[r.id] = rackSig(r) }
    return { ...o, pattern: { ...P, pieces }, placed }
  })
  // the commit's anchor: a rack still there (at a row's end one side's rack is gone)
  const anchor = [...changed.keys()].find(id => !gone.has(id))
  return { objects: rebuildAisles(out, nanoid).objects, d, end: gone.size > 0, anchor }
}
/** Move cross-aisle `c` `d` bays — one undo step; the pick follows it. → the bays moved. */
export function moveCrossAisle(store, c, d) {
  const st = store.getState(), gs = st.gridSize || 40
  const plan = planCrossAisleMove(st.objects, c, d, { gridSize: gs })
  if (!plan.d) return 0
  const anchor = plan.anchor || c.lines[0].a.id
  store.setState({ objects: plan.objects })
  store.getState().commitObjectUpdate(anchor, {})
  const shift = plan.d * bayPitch(c, gs)
  // at a row's end there is no cross-aisle left to pick
  useCrossAislePick.setState({ pick: plan.end ? null : { fpId: c.fpId, rot: c.rot, at: (c.lo + c.hi) / 2 + shift }, drag: null })
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
