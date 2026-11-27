// mezzanine.js — (r9-mezzanine) a mezzanine: a raised deck over the floor (racks under it stay allowed — the existing
// rule). Its properties, its column grid, its stairs and pallet gates (each attached to an edge), its checks and its words.
// Its BOM is OFF (dealer setups vary): it is listed under "not in this BOM".
//
// THE OBJECT: width × depth from the drawing (its box, editable on the card) ·
//   deckHeightIn [120 = 10 ft] · colSpacingIn [240 = about 20 ft each way] — auto-fitted to whole bays: each way the
//   bays = round(side / spacing) (at least 1), the columns at side / bays · deckType 'grating' | 'bdeck' | 'plywood'
//   [B-deck with plywood] · stairs [1]: [{ edge: 'top' | 'right' | 'bottom' | 'left', at (0..1, the stair's centre along
//   the edge) }] · handrail [on] (the open edges: every edge length not taken by a stair or a gate) · gates [1]: [{ edge, at }].
// A STAIR is a footprint outside its edge: STAIR_W_IN (4 ft) wide along the edge, its run out from it — the run from the
// deck height at a 7 in rise and 11 in going: (risers − 1) × 11 in, risers = ceil(deck height / 7). An arrow points up
// the stair (toward the deck). A GATE is a short bar on its edge, GATE_W_IN (5 ft) long.
// A MEZZANINE SAVED BEFORE keeps its box exactly; its new fields read their defaults (one stair at the middle of the bottom
// edge, one gate at the middle of the top edge, handrail on, B-deck with plywood, deck 10 ft) — none of them changes its box.
// Pure.

export const MEZZ_DEFAULTS = { deckHeightIn: 120, colSpacingIn: 240, deckType: 'bdeck', handrail: true, stairs: [{ edge: 'bottom', at: 0.5 }], gates: [{ edge: 'top', at: 0.5 }] }
export const DECK_TYPES = [{ value: 'grating', label: 'Bar grating' }, { value: 'bdeck', label: 'B-deck with plywood' }, { value: 'plywood', label: 'Plywood' }]
export const STAIR_W_IN = 48, GATE_W_IN = 60, RISE_IN = 7, GOING_IN = 11, LANDING_IN = 36
export const EDGES = ['top', 'right', 'bottom', 'left']

const pos = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0.5))
const okEdge = (e) => (EDGES.includes(e) ? e : 'bottom')
const list = (v, d) => (Array.isArray(v) ? v : d).map(a => ({ edge: okEdge(a?.edge), at: clamp01(a?.at) }))

/** A stair's run from the deck height (inches). */
export const stairRunIn = (deckIn) => (Math.max(1, Math.ceil(deckIn / RISE_IN)) - 1) * GOING_IN

/** Its properties: inches, its box from the drawing. */
export function mezzSpec(o, gridSize = 40) {
  const d = MEZZ_DEFAULTS
  const wIn = ((o?.width || 0) / gridSize) * 12, hIn = ((o?.height || 0) / gridSize) * 12
  const colSpacingIn = pos(o?.colSpacingIn, d.colSpacingIn)
  const baysX = Math.max(1, Math.round(wIn / colSpacingIn)), baysY = Math.max(1, Math.round(hIn / colSpacingIn))
  const deckHeightIn = pos(o?.deckHeightIn, d.deckHeightIn)
  return {
    wIn, hIn, areaSqFt: (wIn * hIn) / 144, deckHeightIn, colSpacingIn, baysX, baysY, spacingXIn: wIn / baysX, spacingYIn: hIn / baysY,
    deckType: DECK_TYPES.some(t => t.value === o?.deckType) ? o.deckType : d.deckType, handrail: o?.handrail ?? d.handrail,
    stairs: list(o?.stairs, d.stairs), gates: list(o?.gates, d.gates), stairRunIn: stairRunIn(deckHeightIn),
  }
}

/** Its columns, world px: the grid's crossings (corners included). */
export function mezzColumns(o, gridSize = 40) {
  const s = mezzSpec(o, gridSize), pts = []
  for (let i = 0; i <= s.baysX; i++) for (let j = 0; j <= s.baysY; j++) pts.push({ x: o.x + (o.width * i) / s.baysX, y: o.y + (o.height * j) / s.baysY })
  return pts
}

/** An edge as a line, world px: { x1, y1, x2, y2, len, nx, ny (outward) }. */
export function edgeLine(o, edge) {
  const { x, y, width: w, height: h } = o
  if (edge === 'top') return { x1: x, y1: y, x2: x + w, y2: y, len: w, nx: 0, ny: -1 }
  if (edge === 'right') return { x1: x + w, y1: y, x2: x + w, y2: y + h, len: h, nx: 1, ny: 0 }
  if (edge === 'left') return { x1: x, y1: y, x2: x, y2: y + h, len: h, nx: -1, ny: 0 }
  return { x1: x, y1: y + h, x2: x + w, y2: y + h, len: w, nx: 0, ny: 1 }
}
/** A piece `wPx` long centred at `at` along its edge, kept on it: its span { a, b } (px from the edge's start). */
function spanOn(len, at, wPx) {
  const half = Math.min(wPx, len) / 2, c = Math.min(len - half, Math.max(half, at * len))
  return { a: c - half, b: c + half }
}
const pointOn = (e, t) => ({ x: e.x1 + (e.x2 - e.x1) * (t / (e.len || 1)), y: e.y1 + (e.y2 - e.y1) * (t / (e.len || 1)) })

/** Each stair, world px: { i, edge, box: { x, y, w, h } (outside its edge), foot (the landing box at its far end,
 *  LANDING_IN deep), arrow: { x0, y0, x1, y1 } (up the stair — toward the deck), span }. */
export function mezzStairs(o, gridSize = 40) {
  const s = mezzSpec(o, gridSize), px = (v) => (v / 12) * gridSize
  const W = px(STAIR_W_IN), run = px(s.stairRunIn), land = px(LANDING_IN)
  return s.stairs.map((st, i) => {
    const e = edgeLine(o, st.edge), sp = spanOn(e.len, st.at, W), p0 = pointOn(e, sp.a), p1 = pointOn(e, sp.b)
    const lo = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y) }, wAlong = sp.b - sp.a
    const horiz = st.edge === 'top' || st.edge === 'bottom'
    const box = horiz ? { x: lo.x, y: e.ny < 0 ? lo.y - run : lo.y, w: wAlong, h: run } : { x: e.nx < 0 ? lo.x - run : lo.x, y: lo.y, w: run, h: wAlong }
    const foot = horiz ? { x: lo.x, y: e.ny < 0 ? box.y - land : box.y + box.h, w: wAlong, h: land } : { x: e.nx < 0 ? box.x - land : box.x + box.w, y: lo.y, w: land, h: wAlong }
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, half = (horiz ? box.h : box.w) * 0.35
    const arrow = { x0: cx - e.nx * -half, y0: cy - e.ny * -half, x1: cx - e.nx * half, y1: cy - e.ny * half }
    return { i, edge: st.edge, box, foot, arrow, span: sp }
  })
}
/** Each pallet gate, world px: { i, edge, bar: { x1, y1, x2, y2 }, face (the aisle side: outward), span }. */
export function mezzGates(o, gridSize = 40) {
  const s = mezzSpec(o, gridSize), W = (GATE_W_IN / 12) * gridSize
  return s.gates.map((g, i) => {
    const e = edgeLine(o, g.edge), sp = spanOn(e.len, g.at, W), p0 = pointOn(e, sp.a), p1 = pointOn(e, sp.b)
    return { i, edge: g.edge, bar: { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y }, nx: e.nx, ny: e.ny, span: sp }
  })
}
/** The handrail: each edge's open lengths (not under a stair or a gate), world px segments [x1, y1, x2, y2 …]. */
export function mezzRail(o, gridSize = 40) {
  const s = mezzSpec(o, gridSize)
  if (!s.handrail) return []
  const taken = { top: [], right: [], bottom: [], left: [] }
  for (const st of mezzStairs(o, gridSize)) taken[st.edge].push(st.span)
  for (const g of mezzGates(o, gridSize)) taken[g.edge].push(g.span)
  const segs = []
  for (const edge of EDGES) {
    const e = edgeLine(o, edge), cuts = taken[edge].sort((a, b) => a.a - b.a)
    let t = 0
    for (const c of cuts) { if (c.a > t) { const p = pointOn(e, t), q = pointOn(e, c.a); segs.push(p.x, p.y, q.x, q.y) } t = Math.max(t, c.b) }
    if (t < e.len) { const p = pointOn(e, t), q = pointOn(e, e.len); segs.push(p.x, p.y, q.x, q.y) }
  }
  return segs
}

/** The patch that moves stair (or gate) `i` to the edge point nearest world (wx, wy): its edge and `at` — one undo. */
export function moveOnEdge(o, kind, i, wx, wy) {
  const key = kind === 'gate' ? 'gates' : 'stairs', items = mezzSpec(o)[key].slice()
  if (!items[i]) return {}
  let best = null
  for (const edge of EDGES) {
    const e = edgeLine(o, edge), vx = e.x2 - e.x1, vy = e.y2 - e.y1, L2 = vx * vx + vy * vy || 1
    const t = Math.min(1, Math.max(0, ((wx - e.x1) * vx + (wy - e.y1) * vy) / L2))
    const px = e.x1 + vx * t, py = e.y1 + vy * t, d = Math.hypot(wx - px, wy - py)
    if (!best || d < best.d) best = { d, edge, at: t }
  }
  items[i] = { edge: best.edge, at: Math.round(best.at * 1000) / 1000 }
  return { [key]: items }
}

/** The patch for a card edit `p` — width / depth (inches, the left-top corner held), deckHeightIn, colSpacingIn, deckType,
 *  handrail, stairCount, gateCount (new ones at the middle of the next free edge). */
export function mezzChange(o, p = {}, gridSize = 40) {
  const s = mezzSpec(o, gridSize), out = {}
  if (p.widthIn != null && p.widthIn > 0) out.width = (p.widthIn / 12) * gridSize
  if (p.depthIn != null && p.depthIn > 0) out.height = (p.depthIn / 12) * gridSize
  if (p.deckHeightIn != null) out.deckHeightIn = pos(p.deckHeightIn, s.deckHeightIn)
  if (p.colSpacingIn != null) out.colSpacingIn = pos(p.colSpacingIn, s.colSpacingIn)
  if (p.deckType != null) out.deckType = p.deckType
  if (p.handrail != null) out.handrail = !!p.handrail
  const grow = (cur, n, from) => { const k = Math.max(0, Math.round(n)); if (k <= cur.length) return cur.slice(0, k); const add = []; for (let j = cur.length; j < k; j++) add.push({ edge: EDGES[(EDGES.indexOf(from) + j) % 4], at: 0.5 }); return [...cur, ...add] }
  if (p.stairCount != null) out.stairs = grow(s.stairs, p.stairCount, 'bottom')
  if (p.gateCount != null) out.gates = grow(s.gates, p.gateCount, 'top')
  return out
}

const ft = (inches) => { const v = Math.round((inches / 12) * 10) / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1) }
/** Its area in the project's units: "600 sq ft", or "55.7 m²" in metric. */
export function mezzArea(s, metric = false) {
  return metric ? `${(Math.round(s.areaSqFt * 0.09290304 * 10) / 10).toLocaleString('en-US')} m²` : `${Math.round(s.areaSqFt).toLocaleString('en-US')} sq ft`
}
/** "M1 · 30 × 20 ft · 600 sq ft · deck 10 ft". */
export function mezzHeadline(o, tag = '', gridSize = 40, metric = false) {
  const s = mezzSpec(o, gridSize)
  const size = metric ? `${(Math.round(s.wIn * 0.0254 * 10) / 10)} × ${(Math.round(s.hIn * 0.0254 * 10) / 10)} m` : `${ft(s.wIn)} × ${ft(s.hIn)} ft`
  const deck = metric ? `deck ${Math.round(s.deckHeightIn * 0.0254 * 100) / 100} m` : `deck ${ft(s.deckHeightIn)} ft`
  return [tag || null, size, mezzArea(s, metric), deck].filter(Boolean).join(' · ')
}

/** The stair or pallet gate under world point `p` (a stair: inside its footprint; a gate: within `tol` px of its bar),
 *  → { kind: 'stair' | 'gate', i } or null. */
export function mezzPartAt(o, p, gridSize = 40, tol = 6) {
  for (const st of mezzStairs(o, gridSize)) { const b = st.box; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return { kind: 'stair', i: st.i } }
  for (const g of mezzGates(o, gridSize)) {
    const { x1, y1, x2, y2 } = g.bar, vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1
    const t = Math.min(1, Math.max(0, ((p.x - x1) * vx + (p.y - y1) * vy) / L2))
    if (Math.hypot(p.x - (x1 + vx * t), p.y - (y1 + vy * t)) <= tol + (GATE_W_IN / 12) * gridSize * 0.02) return { kind: 'gate', i: g.i }
  }
  return null
}
