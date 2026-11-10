// sectionAreas.js — sections: named areas drawn on the plan (STUDIO.md §7a Sections). Nothing else — no racking
// settings, no Generate or Fill change; racks keep working as before. (Not the rack "sections" of canvas2/sections.js —
// pieces of one row — nor a zone: a zone_* cuts the racks under it, a section never does.)
//
//   { id, type: 'section_area', layerId: 'sections', label: 'Section 1', shape: 'rect' | 'poly',
//     x, y, width, height,               // the box (world px); a rectangle is its box
//     pts: [[dx, dy], …] }               // a custom shape: its points, from x/y — so a move (x/y) moves them all
//
// Membership: a rack belongs to the section that holds its centre; otherwise it is Unassigned — derived every time,
// never stored, so it follows every move of a rack or a section. Sections can touch but never overlap: a draw that
// overlaps a neighbour snaps to the neighbour's edge.

import { rackFootprint } from '../generate/rackFootprint'

export const SECTION = 'section_area'
export const isSection = (o) => !!o && o.type === SECTION
export const isRackObj = (o) => !!o && typeof o.type === 'string' && /^rack_/.test(o.type) && o.width > 0 && o.height > 0

/** The section's outline, world points [[x, y], …]. */
export function polygonOf(s) {
  if (s.shape === 'poly' && Array.isArray(s.pts) && s.pts.length >= 3) return s.pts.map(([px, py]) => [s.x + px, s.y + py])
  return [[s.x, s.y], [s.x + s.width, s.y], [s.x + s.width, s.y + s.height], [s.x, s.y + s.height]]
}
/** Is world point (x, y) inside polygon `poly` (even-odd)? */
export function pointInPolygon(poly, x, y) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const contains = (s, x, y) => pointInPolygon(polygonOf(s), x, y)
/** The section whose area holds world (x, y) — `ok`: which sections count (a layer shown and not locked, say). */
export const sectionAt = (objects, x, y, ok = () => true) => (objects || []).find(o => isSection(o) && ok(o) && contains(o, x, y)) || null
/** Distance from (x, y) to segment a–b. */
function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}
/** The nearest point on the outline of polygon `poly` to (x, y). */
function nearestOnOutline(poly, x, y) {
  let best = null
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0
    const p = [ax + t * dx, ay + t * dy], d = Math.hypot(x - p[0], y - p[1])
    if (!best || d < best.d) best = { p, d }
  }
  return best ? best.p : [x, y]
}
/** Is (x, y) within `band` of the section's outline? */
export function onOutline(s, x, y, band) {
  const poly = polygonOf(s)
  for (let i = 0; i < poly.length; i++) if (segDist(x, y, poly[i], poly[(i + 1) % poly.length]) <= band) return true
  return false
}

/* the name chip (sections-3): the size tag's dark chip — #1F2321, white Plus Jakarta Sans 11px 600 (6 px across, 4 px up
   and down) — screen px, so ÷ zoom; `inset`: 12 px in from the section's left when it sits on the outline */
export const LABEL = { px: 11, inset: 12, padX: 6, padY: 4, color: '#FFFFFF', bg: '#1F2321', font: "'Plus Jakarta Sans', sans-serif" }
const rackBoxOf = (o) => { const f = rackFootprint(o); return { x: f.x, y: f.y, w: f.w, h: f.h } }
const boxesMeet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** The name chip's box (world px) at `zoom` (sections-3): INSIDE the section, in its largest empty area — the spot inside
 *  it with no rack and no zone under the chip that lies farthest from every rack, zone and the section's own edges — like
 *  a zone's label; where no empty spot holds the chip, on the outline OUTSIDE the section — above it, else below it, where
 *  there is room (the building's floor with no rack and no other section under it), else above. → { x, y, w, h, place:
 *  'inside' | 'above' | 'below', crowded (no room outside either) }. Without `objects` (nothing to measure by): the middle of the section. */
export function labelBox(s, zoom = 1, objects = null) {
  const z = zoom > 0 ? zoom : 1, poly = polygonOf(s)
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys)
  const w = (Math.max(3, String(s.label || 'Section').length) * LABEL.px * 0.62 + LABEL.padX * 2) / z, h = (LABEL.px + LABEL.padY * 2) / z
  if (!objects) return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h, place: 'inside' }
  const ox = x0 + LABEL.inset / z
  const at = { above: { x: ox, y: y0 - h, w, h, place: 'above' }, below: { x: ox, y: y1, w, h, place: 'below' } }
  // inside: the empty spot farthest from everything (racks and zones in it, and its own edges)
  const obstacles = objects.filter(o => o && o.id !== s.id && (isRackObj(o) || (typeof o.type === 'string' && o.type.startsWith('zone_') && o.width > 0)))
    .map(o => (isRackObj(o) ? rackBoxOf(o) : { x: o.x, y: o.y, w: o.width, h: o.height }))
    .filter(q => q.x < x1 && q.x + q.w > x0 && q.y < y1 && q.y + q.h > y0)
  const m = 3 / z                                                          // the chip's own clear margin
  const inPoly = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].every(([px, py]) => pointInPolygon(poly, px, py))
  const gap = (b, q) => Math.max(q.x - (b.x + b.w), b.x - (q.x + q.w), q.y - (b.y + b.h), b.y - (q.y + q.h))
  let best = null
  const N = 24, sx = Math.max((x1 - x0 - w) / N, 1e-6), sy = Math.max((y1 - y0 - h) / N, 1e-6)
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const b = { x: x0 + i * sx, y: y0 + j * sy, w, h }
    if (b.x + b.w > x1 + 1e-6 || b.y + b.h > y1 + 1e-6) continue
    const grown = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }
    if (!inPoly(grown) || obstacles.some(q => boxesMeet(grown, q))) continue
    const clear = Math.min(b.x - x0, x1 - (b.x + b.w), b.y - y0, y1 - (b.y + b.h), ...obstacles.map(q => gap(b, q)))
    if (!best || clear > best.clear + 1e-9) best = { clear, b }
  }
  if (best) return { ...best.b, place: 'inside' }
  const fp = objects.find(o => o.id === s.parentId && /^fp_/.test(o.type || '')) || objects.find(o => /^fp_/.test(o.type || ''))
  const onFloor = (b) => !fp || (b.x >= fp.x && b.y >= fp.y && b.x + b.w <= fp.x + fp.width && b.y + b.h <= fp.y + fp.height)
  const blocks = objects.filter(o => (isRackObj(o) || (isSection(o) && o.id !== s.id)))
    .map(o => (isSection(o) ? (() => { const p = polygonOf(o), a = p.map(q => q[0]), c = p.map(q => q[1]); return { x: Math.min(...a), y: Math.min(...c), w: Math.max(...a) - Math.min(...a), h: Math.max(...c) - Math.min(...c) } })() : rackBoxOf(o)))
  const room = (b) => onFloor(b) && !blocks.some(q => boxesMeet(b, q))
  return room(at.above) ? at.above : room(at.below) ? at.below : { ...at.above, crowded: true }   // no room anywhere: above all the same (crowded)
}
export const onLabel = (s, x, y, zoom, objects = null) => { const b = labelBox(s, zoom, objects); return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h }

/** Area (world px²) — shoelace. */
export function areaOf(s) {
  const p = polygonOf(s)
  let a = 0
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0 }
  return Math.abs(a) / 2
}

/** The next default name: Section N, one past the highest N in use. */
export function nextName(objects) {
  let n = 0
  for (const o of objects || []) if (isSection(o)) { const m = /^Section (\d+)$/.exec(o.label || ''); if (m) n = Math.max(n, Number(m[1])) }
  return `Section ${n + 1}`
}

const box = (s) => ({ x0: s.x, y0: s.y, x1: s.x + s.width, y1: s.y + s.height })
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-6

/** A rectangle drawn as `r` ({ x, y, w, h }, world px): snapped off every section it overlaps — the drawn box keeps the
 *  side that loses least, its edge on the neighbour's edge (touching, never overlapping). Null when nothing is left. */
export function snapRect(r, objects, minPx = 1) {
  let b = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }
  const others = (objects || []).filter(isSection).map(box)
  for (let pass = 0; pass < others.length + 1; pass++) {
    const hit = others.find(n => overlap(b, n))
    if (!hit) break
    const area = (q) => Math.max(0, q.x1 - q.x0) * Math.max(0, q.y1 - q.y0)
    const opts = [
      { ...b, x1: Math.min(b.x1, hit.x0) }, { ...b, x0: Math.max(b.x0, hit.x1) },
      { ...b, y1: Math.min(b.y1, hit.y0) }, { ...b, y0: Math.max(b.y0, hit.y1) },
    ].filter(q => q.x1 - q.x0 >= minPx && q.y1 - q.y0 >= minPx && !overlap(q, hit))
    if (!opts.length) return null
    b = opts.sort((p, q) => area(q) - area(p))[0]
  }
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
}
/** A custom shape's clicked points (world): any point inside a neighbour section snaps to that neighbour's nearest edge. */
export function snapPoints(points, objects) {
  const polys = (objects || []).filter(isSection).map(polygonOf)
  return points.map(([x, y]) => { const hit = polys.find(p => pointInPolygon(p, x, y)); return hit ? nearestOnOutline(hit, x, y) : [x, y] })
}

/** The building whose box holds (x, y) — a section is its child, so a building drag carries it like its racks. */
const parentAt = (objects, x, y) => (objects || []).find(o => /^fp_/.test(o.type || '') && x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height)?.id
const withParent = (f, objects) => { const p = parentAt(objects, f.x + f.width / 2, f.y + f.height / 2); return p ? { ...f, parentId: p } : f }

/** A new rectangle section's fields (to add), or null. */
export function rectSection(r, objects) {
  const s = snapRect(r, objects)
  if (!s || !(s.w > 0) || !(s.h > 0)) return null
  return withParent({ type: SECTION, layerId: 'sections', label: nextName(objects), shape: 'rect', x: s.x, y: s.y, width: s.w, height: s.h }, objects)
}
/** A new custom-shape section's fields from its world points (3 or more), or null. */
export function polySection(points, objects) {
  const p = snapPoints(points, objects)
  if (p.length < 3) return null
  return withParent({ type: SECTION, layerId: 'sections', label: nextName(objects), shape: 'poly', ...normalPoly(p) }, objects)
}
/** World points → { x, y, width, height, pts } (pts from the box's top-left). */
export function normalPoly(p) {
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, pts: p.map(([px, py]) => [px - x, py - y]) }
}
/** Point `i` of a custom shape moved to world (wx, wy): the section's new fields. */
export const movePoint = (s, i, wx, wy) => normalPoly(polygonOf(s).map((q, k) => (k === i ? [wx, wy] : q)))

/** Which section each rack is in — its centre in the section; else Unassigned. → { bySection: Map(id → [rackId]),
 *  unassigned: [rackId] } — sections in the layout's order. */
export function membership(objects) {
  const secs = (objects || []).filter(isSection), polys = secs.map(polygonOf)
  const bySection = new Map(secs.map(s => [s.id, []])), unassigned = []
  for (const r of (objects || []).filter(isRackObj)) {
    const f = rackFootprint(r), cx = f.x + f.w / 2, cy = f.y + f.h / 2
    const i = polys.findIndex(p => pointInPolygon(p, cx, cy))
    if (i >= 0) bySection.get(secs[i].id).push(r.id); else unassigned.push(r.id)
  }
  return { bySection, unassigned }
}

/* ── colour and boundary ──────────────────────────────────────────────────────────────────────────────────────────── */

/** The 8 soft colours a section may take (the card's and the bar's swatches); none — the plain look. */
export const SECTION_COLORS = [
  { id: 'sage', name: 'Sage', c: '#6FA287' }, { id: 'sky', name: 'Sky', c: '#6E9CC8' },
  { id: 'sand', name: 'Sand', c: '#C9A462' }, { id: 'rose', name: 'Rose', c: '#C98585' },
  { id: 'lilac', name: 'Lilac', c: '#9C8CC8' }, { id: 'teal', name: 'Teal', c: '#5FA8A8' },
  { id: 'peach', name: 'Peach', c: '#D69466' }, { id: 'slate', name: 'Slate', c: '#8B97A3' },
]
export const colorOf = (s) => SECTION_COLORS.find(k => k.id === s?.color) || null
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const toHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r}, ${g}, ${b}, ${a})` }
/** A section's look — { stroke, width, dash, fill (null: none), label }: no colour — no fill and a grey #9AA29C dashed
 *  outline, selected (or hovered) the green #2E7D5B 1.5 outline only, no tint; a colour — its outline, a tint and a deeper
 *  label, selected the outline solid and 1.5. */
export function sectionStyle(s, on = false) {
  const k = colorOf(s)
  if (!k) return on ? { stroke: '#2E7D5B', width: 1.5, dash: null, fill: null, label: LABEL.color } : { stroke: '#9AA29C', width: 1, dash: [6, 4], fill: null, label: LABEL.color }
  const deep = toHex(hex(k.c).map(v => v * 0.62))
  return { stroke: on ? deep : k.c, width: on ? 1.5 : 1, dash: on ? null : [6, 4], fill: rgba(k.c, on ? 0.16 : 0.10), label: deep }
}

/** Boundary: 'none' (an area only), 'fence' (a thin wire partition) or 'wall' (typed thickness, in) — WALL_IN default. */
export const BOUNDARIES = [{ id: 'none', label: 'None' }, { id: 'fence', label: 'Fence' }, { id: 'wall', label: 'Wall' }]
export const WALL_IN = 6
export const boundaryOf = (s) => (s?.boundary === 'fence' || s?.boundary === 'wall' ? s.boundary : 'none')
export const wallInOf = (s) => (Number.isFinite(s?.wallIn) && s.wallIn > 0 ? s.wallIn : WALL_IN)
/** Does the section have a real edge — a door snaps to it and cuts it? */
export const hasBoundary = (s) => boundaryOf(s) !== 'none'
/** Its edges, world segments [{ a: [x, y], b: [x, y], i }]. */
export const edgesOf = (s) => { const p = polygonOf(s); return p.map((a, i) => ({ a, b: p[(i + 1) % p.length], i })) }

/* a door's footprint, world box (a door turned 90° / 270° is stored wide and drawn tall, as a rack is) */
const footOf = (o) => {
  const rot = ((((o.rotation || 0) % 180) + 180) % 180)
  if (rot === 90) { const cx = o.x + o.width / 2, cy = o.y + o.height / 2; return { x0: cx - o.height / 2, y0: cy - o.width / 2, x1: cx + o.height / 2, y1: cy + o.width / 2 } }
  return { x0: o.x, y0: o.y, x1: o.x + o.width, y1: o.y + o.height }
}
/** The part [t0, t1] (0..1) of segment a–b inside box `f` (Liang–Barsky), or null. */
function clipT(a, b, f) {
  let t0 = 0, t1 = 1
  const dx = b[0] - a[0], dy = b[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - f.x0], [dx, f.x1 - a[0]], [-dy, a[1] - f.y0], [dy, f.y1 - a[1]]]) {
    if (Math.abs(p) < 1e-12) { if (q < -1e-6) return null; continue }
    const r = q / p
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r } else { if (r < t0) return null; if (r < t1) t1 = r }
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : null
}
/** The section's edges as drawn with a boundary: each edge less the stretches a door stands in (a door cuts the edge)
 *  → [{ a, b, i }] world segments. `doors`: door objects (any; those across an edge cut it). */
export function edgeRuns(s, doors = []) {
  const out = []
  for (const e of edgesOf(s)) {
    const cuts = doors.map(d => clipT(e.a, e.b, footOf(d))).filter(Boolean).sort((p, q) => p[0] - q[0])
    let t = 0
    const at = (u) => [e.a[0] + (e.b[0] - e.a[0]) * u, e.a[1] + (e.b[1] - e.a[1]) * u]
    for (const [c0, c1] of cuts) { if (c0 > t + 1e-6) out.push({ a: at(t), b: at(c0), i: e.i }); t = Math.max(t, c1) }
    if (t < 1 - 1e-6) out.push({ a: at(t), b: at(1), i: e.i })
  }
  return out
}

/* ── real shapes: do two sections overlap (touching is not overlapping)? ─────────────────────────────────────────── */
const EPS_IN = 1e-4                              // world px: how far in a point is taken to test "inside" (an overlap thinner than this is none)
/** Do segments a–b and c–d cross at a point inside both (a proper crossing — not touching, not lying along)? */
function crosses(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d), e = 1e-9
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))
}
/** Points just inside polygon `p`: each edge's middle, nudged EPS_IN toward the inside. */
function insidePoints(p) {
  const out = []
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-9) continue
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L
    const q1 = [mx + nx * EPS_IN, my + ny * EPS_IN], q2 = [mx - nx * EPS_IN, my - ny * EPS_IN]
    out.push(pointInPolygon(p, q1[0], q1[1]) ? q1 : q2)
  }
  return out
}
/** Do polygons `A` and `B` (world points) overlap — share any area? Touching along an edge or at a corner does not. */
export function polysOverlap(A, B) {
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (crosses(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true
  return insidePoints(A).some(q => pointInPolygon(B, q[0], q[1])) || insidePoints(B).some(q => pointInPolygon(A, q[0], q[1]))
}
/** The polygon of a box { x0, y0, x1, y1 }. */
export const boxPoly = (b) => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]
