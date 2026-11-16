// doorWall.js — a door on its wall (doors-edit round; STUDIO.md, Doors): which wall or section edge it stands in, where
// along it, its neighbours there and the gaps between them, its number. Pure — the door card, the door tool's live
// gap, the gap chain on the plan and the PDF, the Dock door row tool and the tags all read it.
//
//   - A wall: { kind: 'fp' | 'section', id, axis ('x': a wall along x — top or bottom; 'y': along y), lo, hi (its ends,
//     world px along the axis), at (its line across), inward (+1 / -1: the floor's side; 0 for a section edge, where
//     the door straddles the line) }.
//   - Distances are from the wall's LOW end — its left end (a wall along x) or its top end (along y): "From left corner".
//   - Doors are numbered per wall, the walls taken top, right, bottom, left (several facing the same way: left to right,
//     or top to bottom), each wall's doors left to right (top to bottom on a wall along y): dock and drive-in doors D1,
//     D2 …, man doors M1, M2 …; doors in a section's Fence or Wall after the building's, by section and along their edge.
//   - A building wall also carries `outer`: its outer face's line across (the gap chain is drawn just outside it).

import { innerOutline, buildingOutline } from './floorGeom'
import { isDoor } from './doorTool'
import { isSection, edgesOf } from './sectionAreas'

const E = 1                                                                 // px: a door's face on a wall line
export const DOCK_TYPES = new Set(['struct_loading_dock', 'struct_drive_in'])

/* a door's footprint, world box (a door turned 90° / 270° is stored wide and drawn tall, as a rack is) */
export const doorFoot = (o) => {
  const rot = ((((o.rotation || 0) % 180) + 180) % 180)
  if (rot === 90) { const cx = o.x + o.width / 2, cy = o.y + o.height / 2; return { x0: cx - o.height / 2, y0: cy - o.width / 2, x1: cx + o.height / 2, y1: cy + o.width / 2 } }
  return { x0: o.x, y0: o.y, x1: o.x + o.width, y1: o.y + o.height }
}
/** The axis a door's width runs along. */
export const doorAxis = (d) => (((((d.rotation || 0) % 180) + 180) % 180) === 90 ? 'y' : 'x')
/** A door's span along its wall: [s0, s1] (world px). */
export function spanOf(d) { const f = doorFoot(d); return doorAxis(d) === 'x' ? [f.x0, f.x1] : [f.y0, f.y1] }

/** The wall door `d` stands in, or null. */
export function doorWall(d, objects, gs = 40) {
  if (!isDoor(d)) return null
  const f = doorFoot(d), axis = doorAxis(d), cA = axis === 'x' ? (f.x0 + f.x1) / 2 : (f.y0 + f.y1) / 2
  const segs = (pts) => pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length], i }))
  const along = (e) => (axis === 'x' ? Math.abs(e.a.y - e.b.y) < 1e-6 : Math.abs(e.a.x - e.b.x) < 1e-6)
  const range = (e) => (axis === 'x' ? [Math.min(e.a.x, e.b.x), Math.max(e.a.x, e.b.x)] : [Math.min(e.a.y, e.b.y), Math.max(e.a.y, e.b.y)])
  const lineOf = (e) => (axis === 'x' ? e.a.y : e.a.x)
  if (d.sectionId) {
    const s = (objects || []).find(o => o.id === d.sectionId && isSection(o))
    if (!s) return null
    const c = axis === 'x' ? (f.y0 + f.y1) / 2 : (f.x0 + f.x1) / 2
    for (const e of edgesOf(s).map(q => ({ a: { x: q.a[0], y: q.a[1] }, b: { x: q.b[0], y: q.b[1] }, i: q.i }))) {
      const [lo, hi] = range(e)
      if (along(e) && Math.abs(lineOf(e) - c) < E + 2 && cA >= lo - E && cA <= hi + E) return { kind: 'section', id: s.id, edge: e.i, axis, lo, hi, at: lineOf(e), inward: 0 }
    }
    return null
  }
  const fp = (objects || []).find(o => o.id === d.parentId && /^fp_/.test(o.type || ''))
  if (!fp) return null
  const poly = innerOutline(fp, gs)
  for (const e of segs(poly)) {
    if (!along(e)) continue
    const [lo, hi] = range(e), at = lineOf(e)
    if (cA < lo - E || cA > hi + E) continue
    const near = axis === 'x' ? f.y0 : f.x0, far = axis === 'x' ? f.y1 : f.x1
    if (Math.abs(near - at) < E) return { kind: 'fp', id: fp.id, edge: e.i, axis, lo, hi, at, inward: 1, outer: outerOf(fp, axis, at, 1) }
    if (Math.abs(far - at) < E) return { kind: 'fp', id: fp.id, edge: e.i, axis, lo, hi, at, inward: -1, outer: outerOf(fp, axis, at, -1) }
  }
  return null
}
/** The outer face of building `fp`'s wall whose inner face is the line `at` across `axis`, the floor on side `inward`:
 *  the outline's nearest parallel line on the outside. */
function outerOf(fp, axis, at, inward) {
  const P = buildingOutline(fp), cs = P.map(p => (axis === 'x' ? p.y : p.x)).filter(c => (at - c) * inward > -0.5)
  return cs.length ? cs.reduce((b, c) => (Math.abs(c - at) < Math.abs(b - at) ? c : b)) : at
}

/** A key per wall (two doors on the same wall share it). */
export const wallKey = (w) => (w ? `${w.kind}:${w.id}:${w.axis}:${Math.round(w.at)}:${Math.round(w.lo)}` : '')

/** The doors on wall `w`, low end first. */
export function doorsOnWall(objects, w, gs = 40) {
  const k = wallKey(w)
  return (objects || []).filter(o => isDoor(o) && wallKey(doorWall(o, objects, gs)) === k).sort((p, q) => spanOf(p)[0] - spanOf(q)[0])
}

/** The gaps along wall `w`: from its low corner to the first door, then between each door and the next — [{ lo, hi,
 *  before (the door before it, or null: the corner), after (the door after it) }] (world px). `withEnd`: the last door
 *  to the high corner too (after: null). */
export function wallGaps(objects, w, { withEnd = false, gs = 40 } = {}) {
  const ds = doorsOnWall(objects, w, gs), out = []
  let at = w.lo, before = null
  for (const d of ds) { const [s0, s1] = spanOf(d); out.push({ lo: at, hi: s0, before: before?.id || null, after: d.id }); at = s1; before = d }
  if (withEnd && ds.length) out.push({ lo: at, hi: w.hi, before: before.id, after: null })
  return out
}

/** Door `d`'s gaps to its neighbours on its wall: { prev (to the door before it, or the low corner), next (to the door
 *  after it, or the high corner) } in world px, or null. */
export function neighbourGaps(d, objects, gs = 40) {
  const w = doorWall(d, objects, gs)
  if (!w) return null
  const gaps = wallGaps(objects, w, { withEnd: true, gs })
  const p = gaps.find(g => g.after === d.id), n = gaps.find(g => g.before === d.id)
  return { prev: p ? p.hi - p.lo : null, prevDoor: p?.before || null, next: n ? n.hi - n.lo : null, nextDoor: n?.after || null }
}

/** The patch putting door `d` on wall `w` with its low end at `s0`, `W` wide (along the wall) and `D` deep — the wall
 *  side held (a building door: its face on the wall's inner face; a section door: centred on the edge). */
export function doorPlaced(d, w, s0, W = d.width, D = d.height) {
  const a = s0 + W / 2, c = w.inward ? w.at + w.inward * D / 2 : w.at
  const cx = w.axis === 'x' ? a : c, cy = w.axis === 'x' ? c : a
  return { x: cx - W / 2, y: cy - D / 2, width: W, height: D }
}

/** A gap typed (the gap chain, the door tool's typed gap): the gap `g` (wallGaps) made `len` px — the door after it and
 *  every door beyond it on the wall move together; → { patches: [[id, patch]] } or { error }. */
export function gapEdit(objects, w, g, len, gs = 40) {
  if (!(len >= 0)) return { error: 'A gap can’t be less than zero.' }
  const ds = doorsOnWall(objects, w, gs)
  if (g.after == null && g.before) {
    // the last door to the far corner: the doors keep their gaps to each other and move together
    const delta = (g.hi - g.lo) - len
    if (!ds.length || ds[ds.length - 1].id !== g.before) return { error: 'That value is not a gap of this wall.' }
    if (spanOf(ds[0])[0] + delta < w.lo - 0.5) return { error: 'A door would pass the corner — not changed.' }
    return { patches: ds.map(d => [d.id, doorPlaced(d, w, spanOf(d)[0] + delta)]) }
  }
  const i = ds.findIndex(d => d.id === g.after)
  if (i < 0) return { error: 'That value is not a gap of this wall.' }
  const delta = len - (g.hi - g.lo), moved = ds.slice(i)
  const last = spanOf(moved[moved.length - 1])
  if (last[1] + delta > w.hi + 0.5) return { error: 'A door would pass the corner — not changed.' }
  if (spanOf(moved[0])[0] + delta < (i > 0 ? spanOf(ds[i - 1])[1] : w.lo) - 0.5) return { error: 'Two doors would overlap — not changed.' }
  return { patches: moved.map(d => [d.id, doorPlaced(d, w, spanOf(d)[0] + delta)]) }
}

/** A door's width typed on the chain: door `id` made `len` px wide, its low end held — every door beyond it on the wall
 *  moves with its far end, so their gaps are kept; → { patches } or { error }. */
export function widthEdit(objects, w, id, len, gs = 40) {
  if (!(len > 0)) return { error: 'A door must be wider than zero.' }
  const ds = doorsOnWall(objects, w, gs), i = ds.findIndex(d => d.id === id)
  if (i < 0) return { error: 'That door is not on this wall.' }
  const [s0, s1] = spanOf(ds[i]), delta = len - (s1 - s0)
  const lastEnd = spanOf(ds[ds.length - 1])[1] + delta
  if (lastEnd > w.hi + 0.5) return { error: 'A door would pass the corner — not changed.' }
  const d = ds[i], patch = { ...doorPlaced(d, w, s0, len), meta: { ...(d.meta || {}), doorWidth: len / gs } }
  return { patches: [[d.id, patch], ...ds.slice(i + 1).map(o => [o.id, doorPlaced(o, w, spanOf(o)[0] + delta)])] }
}

/** The values of wall `w`'s chain, low corner to high: a gap (`kind: 'gap'`, wallGaps' gap) then a door (`kind:
 *  'door'`, its id), …, the last gap to the far corner — [{ kind, lo, hi, gap | id }]; a gap of nothing is left out. */
export function chainStops(objects, w, gs = 40) {
  const ds = doorsOnWall(objects, w, gs), gaps = wallGaps(objects, w, { withEnd: true, gs }), out = []
  if (!ds.length) return out
  ds.forEach((d, i) => {
    const g = gaps[i]
    if (g && g.hi - g.lo > 0.5) out.push({ kind: 'gap', lo: g.lo, hi: g.hi, gap: g })
    const [s0, s1] = spanOf(d)
    out.push({ kind: 'door', lo: s0, hi: s1, id: d.id })
  })
  const end = gaps[gaps.length - 1]
  if (end && end.after == null && end.hi - end.lo > 0.5) out.push({ kind: 'gap', lo: end.lo, hi: end.hi, gap: end })
  return out
}

/** Every door's number: Map id → 'D1' … (dock and drive-in) / 'M1' … (man doors) — buildings in drawing order; in each,
 *  the walls top, right, bottom, left (several facing one way: left to right, or top to bottom), each wall's doors left
 *  to right (a wall along y: top to bottom); section doors after, by section and along their edge. */
export function doorNumbers(objects, gs = 40) {
  const doors = (objects || []).filter(isDoor)
  if (!doors.length) return new Map()
  const keyOf = new Map()
  const fps = (objects || []).filter(o => /^fp_/.test(o.type || ''))
  // the floor's side → the wall's facing: along x with the floor below it — the top; along y with the floor on its left — the right
  const facing = (w) => (w.axis === 'x' ? (w.inward > 0 ? 0 : 2) : (w.inward < 0 ? 1 : 3))
  for (const d of doors) {
    if (d.sectionId) continue
    const k = fps.findIndex(f => f.id === d.parentId), w = k >= 0 ? doorWall(d, objects, gs) : null
    if (!w || w.kind !== 'fp') continue
    keyOf.set(d.id, [0, k, facing(w), w.lo, w.at, spanOf(d)[0]])
  }
  const secs = (objects || []).filter(isSection)
  for (const d of doors) {
    if (keyOf.has(d.id)) continue
    const k = secs.findIndex(s => s.id === d.sectionId), [s0] = spanOf(d)
    keyOf.set(d.id, [1, k < 0 ? 1e9 : k, doorAxis(d) === 'x' ? 0 : 1, doorAxis(d) === 'x' ? doorFoot(d).y0 : doorFoot(d).x0, 0, s0])
  }
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; if (Math.abs(d) > 1e-6) return d } return 0 }
  const order = [...doors].sort((p, q) => cmp(keyOf.get(p.id), keyOf.get(q.id)))
  const out = new Map()
  let nD = 0, nM = 0
  for (const d of order) out.set(d.id, DOCK_TYPES.has(d.type) ? `D${++nD}` : `M${++nM}`)
  return out
}
