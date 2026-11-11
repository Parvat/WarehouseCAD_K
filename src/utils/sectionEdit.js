// sectionEdit.js — a section's edits against the layout (STUDIO.md §7a Sections): kept inside its building's inner wall
// face and off its neighbours (drag, arrows, resize, typed size, a point dragged), its colour and boundary, a duplicate
// beside it, its racks carried with it, and the pen's helpers (angle and edge snaps, the close along the walls).
// The geometry is utils/sectionAreas.js; this reads the buildings too.

import { innerOutline } from './floorGeom'
import { clampMove, clampGrowth } from './floorClamp'
import { notify } from './notice'
import { isSection, polygonOf, membership, nextName, normalPoly, edgesOf, pointInPolygon, polysOverlap, boxPoly, SECTION } from './sectionAreas'
import { afterSectionResize } from './sectionShrink'

const FP = /^fp_/
const E = 1e-6
const boxOf = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
const sides = (b) => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h })

/** The building a section stands in: its parent, else the one holding its centre. */
export function buildingOf(objects, s) {
  return (objects || []).find(o => o.id === s.parentId && FP.test(o.type || ''))
    || (objects || []).find(o => FP.test(o.type || '') && s.x + s.width / 2 >= o.x && s.x + s.width / 2 <= o.x + o.width && s.y + s.height / 2 >= o.y && s.y + s.height / 2 <= o.y + o.height) || null
}
/** Its building's inner wall face (world points { x, y }), or null. */
export function floorOf(objects, s, gridSize = 40) {
  const fp = buildingOf(objects, s)
  return fp ? innerOutline(fp, gridSize) : null
}
/** The other sections as their real shapes (world polygons) — an L is an L, never its box. */
const others = (objects, ids) => (objects || []).filter(o => isSection(o) && !ids.has(o.id)).map(polygonOf)
const hitsAny = (poly, ns) => ns.some(n => polysOverlap(poly, n))
const shift = (poly, dx, dy) => poly.map(([x, y]) => [x + dx, y + dy])
/** The largest t in [0, 1] for which `at(t)` (a polygon) overlaps none of `ns` — from t = 0, which must be clear: a stop
 *  on the neighbour's actual edge, touching it (`travel`: the move's length, world px, for the hair it backs off). */
function reach(at, ns, travel = 0) {
  if (!hitsAny(at(1), ns)) return 1
  let lo = 0, hi = 1
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (hitsAny(at(m), ns)) hi = m; else lo = m }
  // backed off a hair (twice the overlap test's own reach): touching, never a sliver over — a sliver would block the next move
  return travel > 0 ? Math.max(0, lo - (2 * 1e-4) / travel) : lo
}

/** A move of section `s` by (dx, dy): stopped at its building's inner wall face and at a neighbour's actual edge (its
 *  real shape: a rectangle slides into an L's notch and touches it) — the run first, then across. */
export function clampSectionMove(objects, s, dx, dy, { gridSize = 40, moving = null } = {}) {
  const b = boxOf(s), poly = floorOf(objects, s, gridSize)
  if (poly) ({ dx, dy } = clampMove(poly, b, dx, dy))
  const ns = others(objects, new Set(moving || [s.id])), base = polygonOf(s)
  if (hitsAny(base, ns)) return { dx, dy }                             // already over one (an older layout): never trapped
  if (dx) dx *= reach(t => shift(base, dx * t, 0), ns, Math.abs(dx))
  if (dy) dy *= reach(t => shift(base, dx, dy * t), ns, Math.abs(dy))
  return { dx, dy }
}
/** A resize (or a typed size) of section `s` to box `next` ({ x, y, w, h }): every edge that moved out stopped at the
 *  inner wall face and at a neighbour's actual edge (its real shape). */
export function clampSectionBox(objects, s, next, { gridSize = 40 } = {}) {
  const prev = boxOf(s), poly = floorOf(objects, s, gridSize)
  return growClear(sides(prev), sides(poly ? clampGrowth(poly, prev, next) : next), others(objects, new Set([s.id])))
}
/** Box `n` grown from `p` ({ x0, y0, x1, y1 }): each edge that moved out pulled back until the box overlaps none of
 *  `ns` (polygons) — the right, left, bottom, then top edge. → { x, y, w, h }. */
function growClear(p, n, ns) {
  n = { ...n }
  if (!hitsAny(boxPoly(p), ns)) {
    for (const [k, k0] of [['x1', 'x1'], ['x0', 'x0'], ['y1', 'y1'], ['y0', 'y0']]) {
      if (Math.abs(n[k] - p[k0]) < E) continue
      const from = p[k0], to = n[k]
      const t = reach(u => boxPoly({ ...n, [k]: from + (to - from) * u }), ns, Math.abs(to - from))
      n[k] = from + (to - from) * t
    }
  }
  return { x: n.x0, y: n.y0, w: Math.max(1, n.x1 - n.x0), h: Math.max(1, n.y1 - n.y0) }
}

/* ── drawing, kept in: a rectangle and the pen's points stop at the inner wall face and at a neighbour's edge ── */
/** The building a point is drawn in: the one whose inner face holds it, else the nearest. → { fp, poly ([x, y][]) } */
function floorAt(objects, x, y, gridSize = 40) {
  let best = null
  for (const fp of (objects || []).filter(o => FP.test(o.type || ''))) {
    const poly = innerOutline(fp, gridSize).map(v => [v.x, v.y])
    if (pointInPolygon(poly, x, y)) return { fp, poly }
    const q = nearestOn(poly, x, y), d = Math.hypot(q[0] - x, q[1] - y)
    if (!best || d < best.d) best = { fp, poly, d }
  }
  return best ? { fp: best.fp, poly: best.poly } : null
}
/** A drawn point kept in: on its building's floor (else onto the nearest inner wall face) and out of every section (else
 *  onto the nearest edge of the one it is in). */
export function keepPointIn(objects, x, y, gridSize = 40) {
  let p = [x, y]
  const f = floorAt(objects, x, y, gridSize)
  if (f && !pointInPolygon(f.poly, x, y)) p = nearestOn(f.poly, x, y)
  for (const o of (objects || []).filter(isSection)) { const g = polygonOf(o); if (pointInPolygon(g, p[0], p[1])) p = nearestOn(g, p[0], p[1]) }
  return p
}
/** A rectangle drawn from `from` to `to` (world { x, y }): its start kept in (keepPointIn), the box grown toward `to`
 *  stopped at the inner wall face and at every neighbour's actual edge. → { x, y, w, h } or null (nothing left). */
export function drawnBox(objects, from, to, gridSize = 40) {
  const [sx, sy] = keepPointIn(objects, from.x, from.y, gridSize)
  const f = floorAt(objects, sx, sy, gridSize)
  // grown from a hair of a box at the start, on the side drawn toward (the wall stop sweeps an edge with some extent)
  const hx = to.x >= sx ? 0.01 : -0.01, hy = to.y >= sy ? 0.01 : -0.01
  const prev = { x: Math.min(sx, sx + hx), y: Math.min(sy, sy + hy), w: 0.01, h: 0.01 }, next = { x: Math.min(sx, to.x), y: Math.min(sy, to.y), w: Math.abs(to.x - sx), h: Math.abs(to.y - sy) }
  const walled = f ? clampGrowth(f.poly.map(([x, y]) => ({ x, y })), prev, next) : next
  const b = growClear(sides(prev), sides(walled), others(objects, new Set()))
  return b.w > E && b.h > E && (b.w > 1 || b.h > 1) ? b : null
}
/** A new rectangle section's fields for a drag from `from` to `to` (drawnBox), or null — at least `min` each way. */
export function drawnRect(objects, from, to, { gridSize = 40, min = 1 } = {}) {
  const b = drawnBox(objects, from, to, gridSize)
  if (!b || b.w < min || b.h < min) return null
  const f = floorAt(objects, b.x + b.w / 2, b.y + b.h / 2, gridSize)
  return { type: SECTION, layerId: 'sections', label: nextName(objects), shape: 'rect', x: b.x, y: b.y, width: b.w, height: b.h, ...(f ? { parentId: f.fp.id } : {}) }
}
/** A custom shape's point dragged to world (x, y): kept on its building's floor and out of every other section. */
export function clampSectionPoint(objects, s, x, y, gridSize = 40) {
  const poly = floorOf(objects, s, gridSize)
  let p = [x, y]
  if (poly && !pointInPolygon(poly.map(v => [v.x, v.y]), x, y)) p = nearestOn(poly.map(v => [v.x, v.y]), x, y)
  for (const o of (objects || []).filter(q => isSection(q) && q.id !== s.id)) { const g = polygonOf(o); if (pointInPolygon(g, p[0], p[1])) p = nearestOn(g, p[0], p[1]) }
  return p
}
function nearestOn(poly, x, y) {
  let best = null
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy
    const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(x - q[0], y - q[1])
    if (!best || d < best.d) best = { q, d }
  }
  return best ? best.q : [x, y]
}

/* ── the racks a section carries ────────────────────────────────────────────────────────────────────────────────── */
/** The racks whose centre is in one of the sections `ids`, and the doors in their Fence or Wall (moved with them). */
export function membersOf(objects, ids) {
  const m = membership(objects), out = []
  for (const id of ids || []) for (const r of m.bySection.get(id) || []) out.push(r)
  for (const o of objects || []) if (o && o.sectionId && (ids || []).includes(o.sectionId)) out.push(o.id)
  return out
}
/** An arrow-key nudge of `ids` by (dx, dy): a section takes its racks with it, stopped at the walls and its neighbours. */
export function nudgeWithSections(objects, ids, dx, dy, gridSize = 40) {
  const secs = (objects || []).filter(o => ids.includes(o.id) && isSection(o))
  if (!secs.length) return { ids, dx, dy }
  for (const s of secs) ({ dx, dy } = clampSectionMove(objects, s, dx, dy, { gridSize, moving: secs.map(x => x.id) }))
  return { ids: [...new Set([...ids, ...membersOf(objects, secs.map(x => x.id))])], dx, dy }
}

/* ── colour, boundary, size ──────────────────────────────────────────────────────────────────────────────────────── */
const selectedSections = (st) => st.objects.filter(o => st.selectedIds.includes(o.id) && isSection(o) && !o.locked)
function commitEach(store, ids, patch) {
  if (!ids.length) return
  const st = store.getState()
  store.setState({ objects: st.objects.map(o => (ids.includes(o.id) ? { ...o, ...(typeof patch === 'function' ? patch(o) : patch) } : o)) })
  store.getState().commitObjectUpdate(ids[0], {})                       // one undo step
}
/** The selected sections' colour (an id of SECTION_COLORS, or null: plain). */
export const setSectionColor = (store, color) => commitEach(store, selectedSections(store.getState()).map(o => o.id), { color: color || null })
/** A section's boundary: 'none' | 'fence' | 'wall'. */
export const setSectionBoundary = (store, id, boundary) => commitEach(store, [id], { boundary })
/** A Wall boundary's thickness (in). */
export const setSectionWallIn = (store, id, wallIn) => { if (wallIn > 0) commitEach(store, [id], { wallIn }) }
/** A rectangle typed to `w` × `h` (world px): its top-left stays; kept inside the walls and off its neighbours. */
export function sizeSection(store, id, w, h) {
  const st = store.getState(), s = st.objects.find(o => o.id === id)
  if (!s || s.shape === 'poly') return
  const b = clampSectionBox(st.objects, s, { x: s.x, y: s.y, w: w > 0 ? w : s.width, h: h > 0 ? h : s.height }, { gridSize: st.gridSize || 40 })
  if (Math.abs(b.w - s.width) < E && Math.abs(b.h - s.height) < E) return
  st.commitObjectUpdate(id, { width: b.w, height: b.h })
  // made smaller: its rows' bays that no longer fit go in the same undo step (sectionShrink.js)
  afterSectionResize(store, s)
}

/** Duplicate (the bar, Ctrl+D) for a selection of sections: each copy goes beside its section — right, below, left or
 *  above, the first spot inside the building and clear of every section — with the next name; the copies are
 *  selected; one undo step. No room anywhere: a notice, nothing copied. → the copies' ids. */
export function duplicateSections(store) {
  const st = store.getState(), gs = st.gridSize || 40
  const src = st.objects.filter(o => st.selectedIds.includes(o.id) && isSection(o))
  if (!src.length) return []
  let objects = st.objects
  const made = []
  for (const s of src) {
    const poly = floorOf(objects, s, gs)
    const spot = [[s.width, 0], [0, s.height], [-s.width, 0], [0, -s.height]].find(([dx, dy]) => {
      const b = { x0: s.x + dx, y0: s.y + dy, x1: s.x + dx + s.width, y1: s.y + dy + s.height }
      if (poly) { const xs = poly.map(v => v.x), ys = poly.map(v => v.y); if (b.x0 < Math.min(...xs) - E || b.y0 < Math.min(...ys) - E || b.x1 > Math.max(...xs) + E || b.y1 > Math.max(...ys) + E) return false }
      return !hitsAny(shift(polygonOf(s), dx, dy), objects.filter(isSection).map(polygonOf))
    })
    if (!spot) continue
    const { id, ...rest } = s; void id
    const copy = { ...rest, id: `${s.id}-c${Date.now().toString(36)}${made.length}`, x: s.x + spot[0], y: s.y + spot[1], label: nextName(objects), locked: false }
    objects = [...objects, copy]
    made.push(copy.id)
  }
  if (!made.length) { notify('No room for a copy', 'a section copy goes beside it, inside the building'); return [] }
  store.setState({ objects, selectedIds: made, activeBaySelection: [] })
  store.getState().commitObjectUpdate(made[0], {})
  return made
}

/* ── the pen's helpers ───────────────────────────────────────────────────────────────────────────────────────────── */
const SNAP_PX = 8, ANGLE_DEG = 6
/** The edges a pen point snaps to: every building's inner wall face and every section's edges. */
export function penEdges(objects, gridSize = 40) {
  const out = []
  for (const fp of (objects || []).filter(o => FP.test(o.type || ''))) {
    const p = innerOutline(fp, gridSize).map(v => [v.x, v.y])
    p.forEach((a, i) => out.push({ a, b: p[(i + 1) % p.length], fpId: fp.id, i, wall: true }))
  }
  for (const s of (objects || []).filter(isSection)) for (const e of edgesOf(s)) out.push({ a: e.a, b: e.b, wall: false })
  return out
}
const proj = (e, x, y) => {
  const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - e.a[0]) * dx + (y - e.a[1]) * dy) / L)) : 0
  const q = [e.a[0] + t * dx, e.a[1] + t * dy]
  return { q, t, d: Math.hypot(x - q[0], y - q[1]) }
}
/** The pen's point for the pointer at `raw` ([x, y]) after `last` (or none): the segment snapped to horizontal,
 *  vertical or 45° — within 6° of one, or always with Shift (the angle locked) — then onto a wall or a section edge
 *  within 8 screen px. → { p, guide: { a, b } | null (the dashed guide along a snapped angle), len }. */
export function penPoint(objects, last, raw, { zoom = 1, shift = false, gridSize = 40 } = {}) {
  const z = zoom || 1
  let p = raw, guide = null
  if (last) {
    const dx = raw[0] - last[0], dy = raw[1] - last[1], r = Math.hypot(dx, dy)
    if (r > E) {
      const a = Math.atan2(dy, dx), k = Math.round(a / (Math.PI / 4)) * (Math.PI / 4)
      if (shift || Math.abs(a - k) <= (ANGLE_DEG * Math.PI) / 180) {
        const ux = Math.cos(k), uy = Math.sin(k), t = dx * ux + dy * uy
        p = [last[0] + ux * t, last[1] + uy * t]
        const far = Math.max(Math.abs(t) * 2, 400 / z) * Math.sign(t || 1)
        guide = { a: last, b: [last[0] + ux * far, last[1] + uy * far] }
      }
    }
  }
  // a wall or a section edge near it: on it (along the snapped angle where that line meets it)
  let best = null
  for (const e of penEdges(objects, gridSize)) { const h = proj(e, p[0], p[1]); if (h.d <= SNAP_PX / z && (!best || h.d < best.h.d)) best = { e, h } }
  if (best) {
    let q = best.h.q
    if (guide) { const x = meet(guide.a, guide.b, best.e.a, best.e.b); if (x && Math.hypot(x[0] - p[0], x[1] - p[1]) <= (SNAP_PX * 1.5) / z) q = x }
    p = q
  }
  // kept in: on the floor, out of every section (drawing stops at the inner wall face and a neighbour's edge)
  p = keepPointIn(objects, p[0], p[1], gridSize)
  return { p, guide, len: last ? Math.hypot(p[0] - last[0], p[1] - last[1]) : 0 }
}
/** Where lines a1–a2 and segment b1–b2 meet, or null. */
function meet(a1, a2, b1, b2) {
  const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0])
  if (Math.abs(d) < E) return null
  const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d
  const u = ((b1[0] - a1[0]) * (a2[1] - a1[1]) - (b1[1] - a1[1]) * (a2[0] - a1[0])) / d
  return u >= -E && u <= 1 + E ? [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])] : null
}
/** Is world point `p` on a building's inner wall face? → { fpId, poly, i (edge), t } or null. */
export function onWall(objects, p, gridSize = 40) {
  for (const fp of (objects || []).filter(o => FP.test(o.type || ''))) {
    const poly = innerOutline(fp, gridSize).map(v => [v.x, v.y])
    for (let i = 0; i < poly.length; i++) { const h = proj({ a: poly[i], b: poly[(i + 1) % poly.length] }, p[0], p[1]); if (h.d <= 0.5) return { fpId: fp.id, poly, i, t: h.t } }
  }
  return null
}
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0 } return Math.abs(a) / 2 }
/** The wall close's two sides: a pen path that starts on a wall and ends on a wall (the same building) finished along
 *  the walls one way round, and the other — each { pts, ok }: `ok` false where that side would overlap another section
 *  (not offered). → [side, side] or null (the path does not run wall to wall). */
export function wallSides(objects, pen, gridSize = 40) {
  if (pen.length < 2) return null
  const q = onWall(objects, pen[0], gridSize), p = onWall(objects, pen[pen.length - 1], gridSize)
  if (!q || !p || q.fpId !== p.fpId) return null
  const V = p.poly, n = V.length, i = p.i, j = q.i
  const fwd = [], back = []
  if (!(i === j && q.t > p.t)) { let k = (i + 1) % n; fwd.push(V[k]); while (k !== j) { k = (k + 1) % n; fwd.push(V[k]) } }
  if (!(i === j && q.t < p.t)) { let k = i; back.push(V[k]); while (k !== (j + 1) % n) { k = (k - 1 + n) % n; back.push(V[k]) } }
  const ns = (objects || []).filter(isSection).map(polygonOf)
  return [[...pen, ...fwd], [...pen, ...back]].map(pts => ({ pts, ok: area(pts) > 1 && !hitsAny(pts, ns) }))
}
/** The side (of wallSides) whose area holds world (x, y) and is offered, → its index or -1. */
export const sideAt = (sides, x, y) => (sides || []).findIndex(sd => sd.ok && pointInPolygon(sd.pts, x, y))
/** The smaller of the two offered sides (no choice to make): its points, or null. */
export function closeAlongWalls(objects, pen, gridSize = 40) {
  const sides = (wallSides(objects, pen, gridSize) || []).filter(sd => sd.ok)
  return sides.length ? sides.sort((a, b) => area(a.pts) - area(b.pts))[0].pts : null
}
/** Generate / Regenerate off (STUDIO.md §7a Sections): the building Generate works on (`fp`) holds 2 or more sections —
 *  each is filled with Fill racking instead. → the title to show, or null (0 or 1 section: as before). */
export const GENERATE_SECTIONS_TITLE = 'Fill each section with Fill racking'
export function generateBlocked(objects, fp) {
  if (!fp) return null
  const n = (objects || []).filter(o => isSection(o) && (o.parentId === fp.id || buildingOf(objects, o)?.id === fp.id)).length
  return n >= 2 ? GENERATE_SECTIONS_TITLE : null
}
export { normalPoly }
