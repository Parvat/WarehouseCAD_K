// overlayOps.js
// ─────────────────────────────────────────────────────────────────────────────
// Geometry for the canvas OVERLAY plane — selection handles, the rotate handle,
// dimension labels and column-check conflict marks — derived as plain data.
//
// Same bargain as render/rackOps.js: the maths lives here, pure and testable,
// and a renderer only paints the result. The SVG overlay computes its geometry
// inline inside JSX, which is why it can only ever be checked by looking at it.
//
// ── Sizing convention ────────────────────────────────────────────────────────
// Everything decorative is a SCREEN size divided by zoom, exactly as the SVG
// does it, so the numbers here are directly comparable with CanvasUI.jsx and
// the two cannot drift apart by a stray factor. Both renderers draw inside a
// scale(zoom) transform, so a `/ zoom` world size lands on the same pixels.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getObjectBounds, getHandlePositions, HANDLES, pxToFtIn,
  getFpWallSegments, ANNOT_LINE_TYPES, ANNOT_RECT_TYPES,
} from '../utils/canvas'

/* The overlay palette, lifted verbatim from CanvasUI so the ported handles are
   the same blue and the same ink. Canvas drawing colours stay literal by
   design — CLAUDE.md keeps them out of the theme system. */
export const OVERLAY = {
  edge:    '#4a9eff',   // selection box + handle outline
  handle:  '#0e1420',   // handle fill
  accent:  '#f0b429',   // rotate handle + active wall dimension
  rotateBg:'#16181d',
  dimBg:   '#0a0d16',
  conflict:'#C0392B',
}

export const FP_TYPES = new Set(
  ['fp_rect', 'fp_l', 'fp_t', 'fp_u', 'fp_cross', 'fp_l_mirror'])

const BAY_RACK  = new Set(['rack_row', 'rack_double_row', 'rack_cantilever'])
const LANE_RACK = new Set(
  ['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])
const NO_ROTATE = new Set(['annot_scale_bar', 'annot_dimension', 'aisle'])

/** Which of the eight box handles a type actually offers.
 *
 *  These suppressions are not cosmetic — a beam rack's width is a function of
 *  its bay list, so dragging its left or right edge is the only resize that
 *  means anything, and the corner handles would silently do nothing. Kept as a
 *  standalone function because it is the part most likely to gain a rule, and
 *  the part a test can pin down exactly. */
export function visibleHandles(obj) {
  if (!obj || obj.type === 'aisle') return []
  if (BAY_RACK.has(obj.type)) return ['ml', 'mr']
  if (LANE_RACK.has(obj.type)) return HANDLES.filter(h => h !== 'tc')
  return [...HANDLES]
}

/** True when a type is drawn from endpoints rather than a bounding box — a
 *  bbox resize model breaks down for line geometry, so those get endpoint
 *  squares instead of the eight-handle frame. */
export function usesEndpointHandles(obj) {
  return !!obj && (obj.type === 'line' || obj.type === 'arc' || ANNOT_LINE_TYPES.has(obj.type))
}

export function showsRotateHandle(obj) {
  if (!obj) return false
  if (usesEndpointHandles(obj)) return false
  if (NO_ROTATE.has(obj.type)) return false
  if ('x1' in obj) return false          // any line-shaped object
  return true
}

/** Full handle layout for one selected object, in world coordinates.
 *
 *  `kind` tells the painter which family it got: 'endpoints' for line geometry,
 *  'box' for everything else, 'none' when the type offers no handles at all.
 *  Text is reported as 'text' and left to the SVG, which draws an editing frame
 *  rather than handles. */
export function handleLayout(obj, zoom, { isFp = false } = {}) {
  if (!obj || !zoom) return null
  if (obj.type === 'text') return { kind: 'text' }

  const b  = getObjectBounds(obj)
  const hs = 6 / zoom
  const sw = 1 / zoom

  /* A floor plan carries only the rotate handle: its size comes from the wall
     segments, which have their own drag areas. */
  if (isFp || FP_TYPES.has(obj.type)) {
    return {
      kind: 'fp',
      rotate: rotateLayout(b, zoom, { dist: 56, lineWidth: 1.2, opacity: 0.7 }),
    }
  }

  if (usesEndpointHandles(obj)) {
    const isArc = obj.type === 'arc'
    return {
      kind: 'endpoints',
      hs, sw,
      /* annot_dimension shows the same two squares but never an arc control —
         its curve is a leader, not a bend. */
      points: [
        { key: 'ml', x: obj.x1, y: obj.y1 },
        { key: 'mr', x: obj.x2, y: obj.y2 },
      ],
      arcCtrl: isArc ? arcControlPoint(obj) : null,
      rotate: null,
    }
  }

  const keys = visibleHandles(obj)
  const pos  = getHandlePositions(b)
  return {
    kind: 'box',
    hs, sw,
    /* The dotted frame is padded 6 WORLD px, matching getHandlePositions'
       default, so frame and handles stay on the same line at every zoom. */
    box: obj.type === 'aisle' ? null : {
      x: b.x - 6, y: b.y - 6, w: b.width + 12, h: b.height + 12,
      stroke: OVERLAY.edge,
      strokeWidth: 1.2 / zoom,
      dash: [5 / zoom, 3 / zoom],
      cornerRadius: 2 / zoom,
      opacity: ANNOT_RECT_TYPES.has(obj.type) ? 0.5 : 1,
    },
    handles: keys.map(h => pos[h] && { key: h, x: pos[h].x, y: pos[h].y }).filter(Boolean),
    rotate: showsRotateHandle(obj)
      ? rotateLayout(b, zoom, { dist: 70, lineWidth: 1.5, opacity: 0.8 })
      : null,
  }
}

function rotateLayout(b, zoom, { dist, lineWidth, opacity }) {
  const cx = b.x + b.width / 2
  return {
    x: cx,
    y: b.y - dist / zoom,
    r: 8 / zoom,
    lineFromY: b.y - 6 / zoom,
    lineWidth: lineWidth / zoom,
    strokeWidth: 1.8 / zoom,
    fontSize: 10 / zoom,
    opacity,
  }
}

/** The bend control for an arc — the midpoint pushed along the segment normal
 *  by the stored bend factor. */
export function arcControlPoint(obj) {
  const mx = (obj.x1 + obj.x2) / 2, my = (obj.y1 + obj.y2) / 2
  const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return {
    x: mx + (-dy / len) * len * (obj.bend ?? 0.35),
    y: my + ( dx / len) * len * (obj.bend ?? 0.35),
  }
}

/* ── Dimension labels ────────────────────────────────────────────────────── */

/** Wall-segment dimensions for a floor plan: a dimension line offset outward
 *  from each wall, end caps, arrowheads and a label pill.
 *
 *  The outward direction comes from the polygon winding rather than from any
 *  assumption about vertex order, so an L or a U reads its dimensions outward
 *  on every segment instead of folding some of them inside the building. */
export function wallDims(obj, { zoom = 1, gridSize = 40, activeWallIdx = null } = {}) {
  if (!obj || !FP_TYPES.has(obj.type)) return []
  const walls = getFpWallSegments(obj, gridSize)
  if (!walls.length) return []

  let signed = 0
  for (let i = 0; i < walls.length; i++) {
    const j = (i + 1) % walls.length
    signed += walls[i].a.x * walls[j].a.y - walls[j].a.x * walls[i].a.y
  }
  const ws  = signed >= 0 ? 1 : -1
  const fs  = 11 / zoom
  const off = 22 / zoom
  const arrow = 6 / zoom
  const wing  = 3 / zoom

  return walls.map((seg, i) => {
    const { a, b } = seg
    const ex = b.x - a.x, ey = b.y - a.y
    const el = Math.hypot(ex, ey) || 1
    const nx = ws * ey / el, ny = ws * -ex / el
    const d1 = { x: a.x + nx * off, y: a.y + ny * off }
    const d2 = { x: b.x + nx * off, y: b.y + ny * off }
    const mid = { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off }
    const label = pxToFtIn(seg.lenPx, gridSize)
    return {
      index: i,
      active: activeWallIdx === i,
      color: activeWallIdx === i ? OVERLAY.accent : OVERLAY.edge,
      d1, d2, mid, label,
      cap1: { x: a.x + nx * 4 / zoom, y: a.y + ny * 4 / zoom },
      cap2: { x: b.x + nx * 4 / zoom, y: b.y + ny * 4 / zoom },
      /* Arrowheads point back along the dimension line at each end. */
      head1: [d1,
        { x: d1.x + ex / el * arrow + ny * wing, y: d1.y + ey / el * arrow - nx * wing },
        { x: d1.x + ex / el * arrow - ny * wing, y: d1.y + ey / el * arrow + nx * wing }],
      head2: [d2,
        { x: d2.x - ex / el * arrow + ny * wing, y: d2.y - ey / el * arrow - nx * wing },
        { x: d2.x - ex / el * arrow - ny * wing, y: d2.y - ey / el * arrow + nx * wing }],
      pill: {
        w: label.length * fs * 0.62 + 8 / zoom,
        h: fs * 1.5,
        fontSize: fs,
        radius: 2 / zoom,
      },
      lineWidth: 1 / zoom,
    }
  })
}

/** Aisle width dimensions: which way the aisle runs, how wide the gap is, and
 *  where to put the label — one, two or three along its length depending on how
 *  long it is, matching CanvasOverlays. */
export function aisleDim(aisle, objects, { zoom = 1, gridSize = 40 } = {}) {
  const row1 = objects.find(o => o.id === aisle.row1Id)
  const row2 = objects.find(o => o.id === aisle.row2Id)
  if (!row1 || !row2) return null

  const b1 = getObjectBounds(row1), b2 = getObjectBounds(row2)
  const r1 = { x: b1.x, y: b1.y, r: b1.x + b1.width, b: b1.y + b1.height }
  const r2 = { x: b2.x, y: b2.y, r: b2.x + b2.width, b: b2.y + b2.height }

  const yGap = Math.max(r2.x - r1.r, r1.x - r2.r)
  const xGap = Math.max(r2.y - r1.b, r1.y - r2.b)
  const horiz = xGap >= yGap

  let width, start, end, mid
  if (horiz) {
    const top = r1.b < r2.y ? r1 : r2, bot = r1.b < r2.y ? r2 : r1
    width = bot.y - top.b
    start = Math.max(top.x, bot.x)
    end   = Math.min(top.r, bot.r)
    mid   = top.b + width / 2
  } else {
    const left = r1.r < r2.x ? r1 : r2, right = r1.r < r2.x ? r2 : r1
    width = right.x - left.r
    start = Math.max(left.y, right.y)
    end   = Math.min(left.b, right.b)
    mid   = left.r + width / 2
  }
  if (width <= 0 || end <= start) return null

  const len = end - start
  const positions = len < 20 * gridSize ? [start + len * 0.5]
    : len < 60 * gridSize ? [start + len * 0.25, start + len * 0.75]
    : [start + len * 0.15, start + len * 0.5, start + len * 0.85]

  const fs   = 13 / zoom
  const text = `${aisle.label ? aisle.label + ' · ' : ''}${pxToFtIn(width, gridSize)}`
  return {
    horiz, width, mid, positions, text,
    pill: { w: text.length * fs * 0.62 + 12 / zoom, h: fs * 2, fontSize: fs, radius: 3 / zoom },
    arrow: 6 / zoom,
    pad: 3 / zoom,
    lineWidth: 1.5 / zoom,
  }
}

/* ── Column-check conflict marks ─────────────────────────────────────────── */

/** Sizing for the red marks. The hatch repeat is a screen size so a one-foot
 *  overlap still reads as hazard at 10% zoom, where a world-space hatch would
 *  collapse into mud. */
export function conflictMarkStyle(zoom) {
  return {
    hair: 1.5 / zoom,
    tile: 9 / zoom,
    band: 3.6 / zoom,
    color: OVERLAY.conflict,
  }
}

/** Split marks into the two things they mean: a blocked aisle is a bar across
 *  the travel gap, a column in a rack hatches the slot it eats. */
export function splitMarks(marks = []) {
  const blocked = [], hatched = []
  for (const m of marks) (m.kind === 'aisle-blocked' ? blocked : hatched).push(m)
  return { blocked, hatched }
}
