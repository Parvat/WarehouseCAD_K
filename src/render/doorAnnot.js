// render/doorAnnot.js — the doors' tags and the chain along a wall (doors-edit round; STUDIO.md, Doors; mockup doors2.png),
// as label ops (render/labelOps.js): the canvas paints them with LabelOps, the PDF writes the same ops as SVG. Every size is
// in label px `u` (world px): the PDF passes 1 / its label scale; the canvas passes the same with the 11 px floor already in
// it (CLAUDE.md Rule 8), so what is laid out is what is drawn.
//
//   - The tags: inside, on the doors — each door's number (D1 … dock and drive-in, M1 … man doors — utils/doorWall.js
//     doorNumbers) on a white pill outlined in the door's colour. Tags that would overlap collapse into one range tag
//     over their doors (D1–D11) until there is room again; when even one tag for the whole wall no longer fits the wall,
//     the wall's tags hide, and come back zooming in. The doors themselves are always drawn at their true size.
//   - The chain: OUTSIDE the building, just past the wall's outer face, as the building's size lines are — the corner, the
//     gap to the first door, its width, the gap to the next, its width … the gap to the far corner. Door widths bold,
//     gaps regular, in the dimension blue (render/dimChain.js: a value too long for its segment moves outside with a
//     leader, never hides; the whole chain hides only when it no longer fits its wall). A door in a section's Fence or
//     Wall: on the edge's +1 side, past the door. The canvas shows it for the wall of a selected door; the PDF for every
//     wall with doors.

import { pillOps } from './labelOps'
import { DIM_INK } from './buildingDims'
import { ftIn } from '../utils/bom'
import { doorWall, doorNumbers, doorFoot, wallKey, doorsOnWall, spanOf, chainStops } from '../utils/doorWall'
import { isDoor } from '../utils/doorTool'
import { dimChain } from './dimChain'
import { buildingOutline } from '../utils/floorGeom'

const OFF = 14                       // the chain's line past the outer face (label px) — the column chain's 14

/** A run of numbers as a tag says it: D1, D1–D4; several kinds joined: D1–D3, M1. */
export function rangeText(nums) {
  const by = new Map()
  for (const n of nums) { const m = /^([A-Z]+)(\d+)$/.exec(n || ''); if (!m) continue; if (!by.has(m[1])) by.set(m[1], []); by.get(m[1]).push(+m[2]) }
  return [...by.entries()].map(([p, v]) => { v.sort((a, b) => a - b); return v.length > 1 && v[v.length - 1] !== v[0] ? `${p}${v[0]}–${p}${v[v.length - 1]}` : `${p}${v[0]}` }).join(', ')
}

const tagSize = (text, u) => { const fs = 10.5 * u; return { fs, w: text.length * fs * 0.62 + 8 * u, h: fs * 1.5 } }

/** The tags of every door (one per door, or one per run that had to collapse) → [{ ids, text, x, y, w, h, ops }]. `u`:
 *  one label px (world px). */
export function doorTags(objects, gridSize = 40, u = 1) {
  const doors = (objects || []).filter(isDoor)
  if (!doors.length) return []
  const nums = doorNumbers(objects, gridSize), out = [], done = new Set()
  for (const d0 of doors) {
    if (done.has(d0.id)) continue
    const w = doorWall(d0, objects, gridSize)
    const ds = w ? doorsOnWall(objects, w, gridSize) : [d0]
    ds.forEach(d => done.add(d.id))
    const axis = w?.axis || 'x'
    // runs along the wall, left to right: a run takes the next door until its tag fits its share of the wall (from half way
    // to the run before it to half way to the next door); a last run that cannot fit joins the one before it. A run's tag
    // over its doors' middle. One run for the whole wall that still does not fit: the wall's tags hide.
    const lo = w ? w.lo : -Infinity, hi = w ? w.hi : Infinity
    const textOf = (r) => rangeText(r.ds.map(d => nums.get(d.id)))
    const ext = (r) => { const t = tagSize(textOf(r), u); return axis === 'x' ? t.w : t.h }
    const sp = ds.map(spanOf)
    const run = (i, j) => ({ ds: ds.slice(i, j + 1), s0: sp[i][0], s1: sp[j][1], i, j })
    const fits = (r, prev) => {
      const c = (r.s0 + r.s1) / 2, e = ext(r) / 2
      const a0 = prev ? (prev.s1 + r.s0) / 2 + u : lo, b0 = r.j < ds.length - 1 ? (r.s1 + sp[r.j + 1][0]) / 2 - u : hi
      return c - e >= a0 - 1e-6 && c + e <= b0 + 1e-6
    }
    const runs = []
    for (let i = 0; i < ds.length;) {
      let j = i
      while (j < ds.length - 1 && !fits(run(i, j), runs[runs.length - 1])) j++
      runs.push(run(i, j)); i = j + 1
    }
    while (runs.length > 1 && !fits(runs[runs.length - 1], runs[runs.length - 2])) { const q = runs.pop(), p = runs.pop(); runs.push(run(p.i, q.j)) }
    const hidden = !!w && runs.length === 1 && !fits(runs[0], null)
    if (hidden || !w) { if (!w && !hidden) runs.forEach(r => out.push(tagOf(r.ds, textOf(r), (r.s0 + r.s1) / 2, null, axis, u))); continue }
    for (const r of runs) out.push(tagOf(r.ds, textOf(r), (r.s0 + r.s1) / 2, w, axis, u))
  }
  return out
}

/* one tag: over its doors' run along the wall, across at the shallowest door's middle (inside every door of the run) */
function tagOf(ds, text, c, w, axis, u) {
  const feet = ds.map(doorFoot)
  const mid = (f) => (axis === 'x' ? (f.y0 + f.y1) / 2 : (f.x0 + f.x1) / 2)
  const depth = (f) => (axis === 'x' ? f.y1 - f.y0 : f.x1 - f.x0)
  const f0 = feet.reduce((b, f) => (depth(f) < depth(b) ? f : b))
  const across = w && w.inward ? w.at + w.inward * depth(f0) / 2 : mid(f0)
  const [x, y] = axis === 'x' ? [c, across] : [across, c]
  const color = ds[0].stroke || '#6366f1', { fs, w: tw, h } = tagSize(text, u)
  return { ids: ds.map(d => d.id), text, x: x - tw / 2, y: y - h / 2, w: tw, h,
    ops: pillOps(x, y, text, fs, 1 / u, { color, bg: '#FFFFFF', stroke: color, strokeWidth: 1 * u, opacity: 1, padX: 4 * u, rx: 3 * u }) }
}

/** Where wall `w`'s chain runs: { at (its line across), out (+1 / -1: the side away from the building) }. `clear`: what
 *  already reaches past the outer face there (world px) — the chain goes just past it. */
export function chainLine(w, objects, gridSize = 40, u = 1, clear = 0) {
  if (w.inward) {
    const out = -w.inward, face = w.outer ?? w.at
    return { at: face + out * Math.max(OFF * u, clear + 3 * u + 10.5 * u * 0.7), out }
  }
  // a section edge: past the deepest door standing in it, on its +1 side
  const ds = doorsOnWall(objects, w, gridSize).map(doorFoot)
  const half = Math.max(0, ...ds.map(f => (w.axis === 'x' ? f.y1 - f.y0 : f.x1 - f.x0) / 2))
  return { at: w.at + half + OFF * u, out: 1 }
}

/** Wall `w`'s chain → { items: [{ stop: { kind: 'gap' | 'door', lo, hi, gap | id, text }, box }], ops, reach, hidden, at, out }. */
export function doorChain(objects, w, gridSize = 40, u = 1, { clear = 0 } = {}) {
  if (!w) return { items: [], ops: [], reach: 0, hidden: false }
  const stops = chainStops(objects, w, gridSize).map(s => ({ ...s, text: ftIn(((s.hi - s.lo) / gridSize) * 12), bold: s.kind === 'door' }))
  if (!stops.length) return { items: [], ops: [], reach: 0, hidden: false }
  const L = chainLine(w, objects, gridSize, u, clear)
  return { ...dimChain(stops, { axis: w.axis, at: L.at, out: L.out, u, ink: DIM_INK, lo: w.lo, hi: w.hi }), ...L }
}

/** The live gap while placing (DoorBar.jsx): from `lo` to `hi` along wall `w`, its value `text`, outside the wall as the
 *  chain is → { ops, box }. `cursor`: a thin text cursor after the value (a gap being typed). */
export function gapOps(w, lo, hi, text, u = 1, { cursor = false, objects = [], gridSize = 40 } = {}) {
  const L = chainLine(w, objects, gridSize, u)
  const c = dimChain([{ lo, hi: Math.max(hi, lo + 1e-3), text }], { axis: w.axis, at: L.at, out: L.out, u, ink: DIM_INK, lo: Math.min(lo, w.lo), hi: Math.max(hi, w.hi), cursor: cursor ? 0 : -1 })
  return { ops: c.ops, box: c.items[0]?.box || null }
}

/** Every wall with doors (one per wall): [w] — the PDF's chains. */
export function doorWalls(objects, gridSize = 40) {
  const seen = new Map()
  for (const d of (objects || []).filter(isDoor)) { const w = doorWall(d, objects, gridSize); if (w && !seen.has(wallKey(w))) seen.set(wallKey(w), w) }
  return [...seen.values()]
}

/** How far the chains of walls `walls` reach past building `fp`'s outline box on each side (world px): { top, right,
 *  bottom, left } — the column chain and the building's size lines step out past them. */
export function doorChainReach(objects, walls, fp, gridSize = 40, u = 1) {
  const r = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!fp) return r
  const o = buildingOutline(fp), xs = o.map(p => p.x), ys = o.map(p => p.y)
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  for (const w of walls) {
    if (w.kind !== 'fp' || w.id !== fp.id) continue
    const c = doorChain(objects, w, gridSize, u)
    if (c.hidden || !c.items.length) continue
    const far = c.at + c.out * c.reach
    if (w.axis === 'x') { if (c.out < 0) r.top = Math.max(r.top, box.y0 - far); else r.bottom = Math.max(r.bottom, far - box.y1) }
    else if (c.out < 0) r.left = Math.max(r.left, box.x0 - far); else r.right = Math.max(r.right, far - box.x1)
  }
  return r
}

/** How far building `fp`'s door chains (every wall with doors — the PDF) reach past its box: { top, right, bottom, left }. */
export const doorReachOf = (objects, fp, gridSize = 40, u = 1) => doorChainReach(objects, doorWalls(objects, gridSize), fp, gridSize, u)

/** Every door's tag ops and every wall's chain ops — the PDF (always both). `lz`: its label scale. */
export function doorAnnotOps(objects, gridSize = 40, lz = 1) {
  const u = 1 / lz, out = []
  for (const t of doorTags(objects, gridSize, u)) out.push(...t.ops)
  for (const w of doorWalls(objects, gridSize)) { const c = doorChain(objects, w, gridSize, u); if (!c.hidden) out.push(...c.ops) }
  return out
}
