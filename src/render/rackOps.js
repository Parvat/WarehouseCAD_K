// rackOps.js
// ─────────────────────────────────────────────────────────────────────────────
// Rack drawing as DATA, not as markup.
//
// A rack's geometry is derived once, here, into a flat list of draw-ops in
// WORLD pixels. Konva paints that list; the PDF export will read the same list
// and emit SVG from it. One description, two renderers — so a rack can never
// look like one thing on screen and another on paper, which is exactly what
// happens when each renderer re-derives the geometry itself.
//
// Pure: no React, no store, no DOM. Given the same object it returns the same
// ops, which also makes the geometry testable without a canvas.
//
// ── Op shapes ────────────────────────────────────────────────────────────────
//   { op:'rect', x, y, w, h, fill?, stroke?, strokeWidth? }
//   { op:'path', d, stroke?, strokeWidth?, fill? }        d = SVG path data
//
// `strokeWidth` is in SCREEN pixels and does not scale with zoom — Konva gets
// strokeScaleEnabled={false}, SVG gets vector-effect="non-scaling-stroke". A
// hairline divider has to stay a hairline at 400% or it becomes a slab.
// ─────────────────────────────────────────────────────────────────────────────

/* The locked rack symbology. Literal by design: CLAUDE.md keeps canvas object
   colours out of the theme system, since a token here would repaint the
   drawing when the UI theme changes. */
export const RACK_PALETTE = {
  fill:      '#DCE8DC',
  border:    '#3E6B54',   // rack body outline — pine is reserved for the building wall
  divider:   '#9CBBAA',   // bay / lane boundaries
  upright:   '#8FAE9C',   // upright frames, filled at real width — a shade under the divider so a 3" frame reads as steel, not a gap
  flue:      '#E0A63C',   // double row only
  roller:    '#C7A15A',   // pallet-flow roller track
  structure: '#2E4A3A',   // arrows, drive-in back wall
  conflict:  '#C0392B',
}

export const RACK_LINE = { edge: 1.5, hair: 1.2, rail: 1 }   // screen px

/** Upright boundary positions across a beam rack.
 *  Layout is `upright | beam | upright | beam | upright`, so there are
 *  beams.length + 1 uprights and beams.length - 1 interior boundaries. */
export function uprightXs(obj, gridSize) {
  const upW   = ((obj.uprightWidth || 3) / 12) * gridSize
  const beams = Array.isArray(obj.beams) && obj.beams.length ? obj.beams : [96]
  const xs = [obj.x]
  let cursor = obj.x + upW
  for (const beamIn of beams) {
    cursor += (beamIn / 12) * gridSize
    xs.push(cursor)
    cursor += upW
  }
  return { xs, upW, beams }
}

/** SELECTIVE (`rack_row`) — bay cells and nothing else.
 *
 *  Every bay divider is ONE path with a move/line pair per boundary, not a rect
 *  per bay: a 125-bay rack is then 2 nodes instead of ~250, which is the
 *  difference that makes a full layout draw at frame rate. */
export function rackRowOps(obj, gridSize) {
  const { xs, upW } = uprightXs(obj, gridSize)
  const { x, y, width: w, height: h } = obj

  const ops = [{
    op: 'rect', x, y, w, h,
    fill: RACK_PALETTE.fill,
    stroke: RACK_PALETTE.border,
    strokeWidth: RACK_LINE.edge,
  }]

  const uprights = uprightsOp(xs, upW, [{ y, h }])
  if (uprights) ops.push(uprights)
  return ops
}

/** Every upright frame of a beam rack, drawn to scale: a filled rect at the
 *  frame's real width (`uprightWidth`, 3" default) across each band — one
 *  op, one node, however many bays. `lefts` are the uprights' left edges
 *  (uprightXs' `xs`: both end frames and every interior one). Never drawn
 *  across a double row's flue: the two bands are separate frames.
 *
 *  The op stays zoom-free; the painter applies `minPx` (a SCREEN-px floor,
 *  the old hairline width) through `uprightDrawRects`, so a 3" frame still
 *  shows as a line at building-overview zoom instead of vanishing — the same
 *  idea as the column markers' floor — and at working zoom is exactly 3". */
function uprightsOp(lefts, upW, bands) {
  if (!lefts.length || !bands.length) return null
  const rects = []
  for (const x of lefts) for (const b of bands) rects.push({ x, y: b.y, w: upW, h: b.h })
  return { op: 'uprights', rects, fill: RACK_PALETTE.upright, minPx: RACK_LINE.hair }
}

/** The rects an `uprights` op actually paints at stage scale `scale`:
 *  real width, or `minPx` screen px if that's wider, centred on the frame. */
export function uprightDrawRects(op, scale = 1) {
  const minW = op.minPx / (scale || 1)
  return op.rects.map(r => {
    const w = Math.max(r.w, minW)
    return { x: r.x + r.w / 2 - w / 2, y: r.y, w, h: r.h }
  })
}

/** Bay dividers for one or more horizontal bands, as a SINGLE path.
 *  `bands` is a list of { y, h } — a double row passes two, so a 125-bay rack
 *  is still one node instead of 250. */
function dividerPath(interior, upW, bands) {
  if (!interior.length || !bands.length) return null
  let d = ''
  for (const ux of interior) {
    const dx = ux + upW / 2
    for (const b of bands) d += `M${dx} ${b.y}L${dx} ${b.y + b.h}`
  }
  return { op: 'path', d, stroke: RACK_PALETTE.divider, strokeWidth: RACK_LINE.hair }
}

/** DOUBLE ROW (`rack_double_row`) — two bands back to back with the flue
 *  gap between them.
 *
 *  BUG 59 — no marker in the flue gap at all: the two row rects are drawn
 *  with the real `flueH` gap left empty (background shows through) and
 *  nothing is drawn on top of it — no line, no fill. This deliberately
 *  diverges from the SVG reference (which draws a thin centred hairline);
 *  the gap itself, at its own real width, is what reads as a flue now. */
export function rackDoubleRowOps(obj, gridSize) {
  const { xs, upW } = uprightXs(obj, gridSize)
  const { x, y, width: w, height: h } = obj

  const flueH = ((obj.flueSpaceIn || 9) / 12) * gridSize
  /* Guard a flue taller than the object itself — a malformed rack should draw
     as one band rather than two inverted ones. */
  const rowH = Math.max(0, (h - flueH) / 2)
  if (rowH <= 0) return rackBoxOps(obj)

  const band = (by) => ({
    op: 'rect', x, y: by, w, h: rowH,
    fill: RACK_PALETTE.fill,
    stroke: RACK_PALETTE.border,
    strokeWidth: RACK_LINE.edge,
  })

  const topY = y
  const botY = y + rowH + flueH
  const ops = [
    band(topY),
    band(botY),
  ]

  const uprights = uprightsOp(xs, upW, [{ y: topY, h: rowH }, { y: botY, h: rowH }])
  if (uprights) ops.push(uprights)
  return ops
}

/** A rack's bare box, with no internal structure.
 *
 *  This is a fallback for geometry that cannot be subdivided sensibly — a flue
 *  taller than the rack, say — NOT a zoom behaviour. There is deliberately no
 *  level-of-detail collapse here: consolidating each rack to two nodes made
 *  full detail cheap enough to draw at every zoom, and dropping the threshold
 *  means these ops no longer depend on zoom at all. */
export function rackBoxOps(obj) {
  return [{
    op: 'rect', x: obj.x, y: obj.y, w: obj.width, h: obj.height,
    fill: RACK_PALETTE.fill,
    stroke: RACK_PALETTE.border,
    strokeWidth: RACK_LINE.edge,
  }]
}

/* ── Lane racks ──────────────────────────────────────────────────────────────
   Drive-in, drive-through, push-back and pallet-flow are the same box with the
   same lane dividers and differ only in their cues. Sharing the chassis is what
   makes the cue the tell-apart rather than four subtly different boxes.

   Lane width is DERIVED from the object's own width, never rebuilt from pallet
   dimensions: the object was dimensioned at creation and its width is what
   selection, snapping and the column check all measure, so the drawing has to
   subdivide that same box or the symbol drifts out of its own outline. */
export function laneGeom(obj, gridSize) {
  const lanes = Math.max(1, obj.lanes || 2)
  const upW   = ((obj.uprightWidth || 4) / 12) * gridSize
  const laneW = Math.max(0, (obj.width - (lanes + 1) * upW) / lanes)
  const postXs = Array.from({ length: lanes + 1 }, (_, i) => obj.x + i * (laneW + upW))
  const laneCx = Array.from({ length: lanes }, (_, i) => postXs[i] + upW + laneW / 2)
  return { lanes, upW, laneW, postXs, laneCx }
}

/** Box + lane dividers, and optionally the closed back.
 *  Two ops for any lane count, same consolidation rule as rack_row. */
function laneChassisOps(obj, gridSize, { backWall = false } = {}) {
  const { upW, postXs } = laneGeom(obj, gridSize)
  const { x, y, width: w, height: h } = obj

  const ops = [{
    op: 'rect', x, y, w, h,
    fill: RACK_PALETTE.fill,
    stroke: RACK_PALETTE.border,
    strokeWidth: RACK_LINE.edge,
  }]

  const dividers = dividerPath(postXs.slice(1, -1), upW, [{ y, h }])
  if (dividers) ops.push(dividers)

  /* The closed back — one heavier rule across the FAR end, the single cue
     separating drive-in from drive-through. A line, not a filled bar: the bar
     read as a wall of the building itself. */
  if (backWall) {
    ops.push({
      op: 'path', d: `M${x} ${y}L${x + w} ${y}`,
      stroke: RACK_PALETTE.structure, strokeWidth: RACK_LINE.edge * 2.2,
    })
  }
  return ops
}

/* Travel arrows are a LEGEND mark, not a dimension: one size everywhere on the
   sheet regardless of how deep the rack is. That makes them screen-sized, and
   since rackDrawOps deliberately takes no zoom, the op carries the screen
   measurements and the painter divides by the live stage scale. All of a
   rack's arrows ride in ONE op, so a twelve-lane rack is one node. */
export const RACK_ARROW = { len: 13, head: 7, gap: 3, strokeWidth: 1.2 }

function arrowsOp(items) {
  if (!items.length) return null
  return { op: 'arrows', items, color: RACK_PALETTE.structure, ...RACK_ARROW }
}

/** DRIVE-IN · LIFO — lanes, a CLOSED back wall, and entry arrows at the one
 *  open end. Trucks drive in and reverse out of the same face, which is exactly
 *  what the single row of arrows says. */
export function rackDriveInOps(obj, gridSize) {
  const { laneCx } = laneGeom(obj, gridSize)
  const ops = laneChassisOps(obj, gridSize, { backWall: true })
  const a = arrowsOp(laneCx.map(cx => ({ cx, edgeY: obj.y + obj.height, side: 'below' })))
  if (a) ops.push(a)
  return ops
}

/** DRIVE-THROUGH · FIFO — the same lanes as drive-in with NO back wall, and
 *  arrows at both ends running the same way. Load one face, pick the other; the
 *  open far end is the whole difference. */
export function rackDriveThroughOps(obj, gridSize) {
  const { laneCx } = laneGeom(obj, gridSize)
  const ops = laneChassisOps(obj, gridSize)
  const a = arrowsOp([
    ...laneCx.map(cx => ({ cx, edgeY: obj.y + obj.height, side: 'below' })),
    ...laneCx.map(cx => ({ cx, edgeY: obj.y, side: 'above' })),
  ])
  if (a) ops.push(a)
  return ops
}

/** PUSH-BACK · LIFO — lanes carrying a stack of nested carts. Each cart sits
 *  slightly narrower than the one in front of it, which is what a nested cart
 *  set actually looks like from above and reads as the incline running back
 *  into the lane. Arrows at the single open face.
 *
 *  Every cart in every lane is ONE path: a six-lane rack four deep is 24 carts,
 *  which as separate rects would undo the consolidation that makes a full sheet
 *  draw at frame rate. */
export function rackPushbackOps(obj, gridSize) {
  const { laneW, laneCx } = laneGeom(obj, gridSize)
  const ops = laneChassisOps(obj, gridSize)

  const deep  = Math.max(1, Math.min(obj.palletDeep || 4, 8))
  const pad   = laneW * 0.12
  const slot  = (obj.height - pad * 2) / deep
  const cartH = slot * 0.68

  let d = ''
  for (const cx of laneCx) {
    for (let i = 0; i < deep; i++) {
      /* i = 0 is the BACK of the lane, so the deepest cart is the narrowest —
         the nest tapers away from the open face. */
      const inset = pad + (deep - 1 - i) * (laneW * 0.05)
      const w = Math.max(laneW * 0.25, laneW - inset * 2)
      const y = obj.y + pad + i * slot + (slot - cartH) / 2
      d += `M${cx - w / 2} ${y}h${w}v${cartH}h${-w}Z`
    }
  }
  if (d) {
    ops.push({ op: 'path', d, fill: undefined,
      stroke: RACK_PALETTE.border, strokeWidth: RACK_LINE.hair })
  }

  const a = arrowsOp(laneCx.map(cx => ({ cx, edgeY: obj.y + obj.height, side: 'below' })))
  if (a) ops.push(a)
  return ops
}

/** PALLET FLOW · FIFO — lanes with a roller hint: two dashed lines running the
 *  full depth of each lane, the track a pallet rolls along. Load high side,
 *  pick low side, so the arrows sit at one face only.
 *
 *  Both rails of every lane ride in ONE dashed path. The dash is a SCREEN
 *  measure like the stroke widths — strokeScaleEnabled is off, so the pattern
 *  keeps its pitch at any zoom instead of turning into a solid line. */
export function rackPalletFlowOps(obj, gridSize) {
  const { laneW, laneCx } = laneGeom(obj, gridSize)
  const ops = laneChassisOps(obj, gridSize)

  const inset = laneW * 0.22
  const pad   = obj.height * 0.04
  const y0 = obj.y + pad, y1 = obj.y + obj.height - pad

  let d = ''
  for (const cx of laneCx) {
    d += `M${cx - inset} ${y0}L${cx - inset} ${y1}`
    d += `M${cx + inset} ${y0}L${cx + inset} ${y1}`
  }
  if (d) {
    ops.push({ op: 'path', d,
      stroke: RACK_PALETTE.roller, strokeWidth: RACK_LINE.rail,
      dash: [3.5, 3.5], opacity: 0.95 })
  }

  const a = arrowsOp(laneCx.map(cx => ({ cx, edgeY: obj.y + obj.height, side: 'below' })))
  if (a) ops.push(a)
  return ops
}

/** Tower centres and the spine band for a cantilever.
 *  Towers are spread evenly across the object's own width rather than at a
 *  nominal 48" pitch, for the same reason lanes are: the box is what everything
 *  else measures, so the symbol has to fill it exactly. */
export function cantileverGeom(obj, gridSize) {
  const doubleSided = obj.doubleSided ?? true
  const towers  = Array.isArray(obj.towers) && obj.towers.length
    ? obj.towers : [36, 36, 36, 36, 36]
  const towerW  = ((obj.towerWidthIn   || 10) / 12) * gridSize
  const spineH  = ((obj.spineDepthIn   ||  4) / 12) * gridSize
  const armT    = ((obj.armThicknessIn ||  3) / 12) * gridSize

  /* Single-sided hangs its arms off a spine at the TOP (the wall side);
     double-sided centres the spine and throws arms both ways. */
  const spineY = doubleSided ? obj.y + (obj.height - spineH) / 2 : obj.y
  const step   = towers.length > 1 ? obj.width / (towers.length - 1) : obj.width
  const cxs    = towers.map((_, i) => obj.x + i * step)
  return { doubleSided, towers, towerW, spineH, armT, spineY, cxs }
}

/** CANTILEVER — a spine carrying towers, with arms reaching off one or both
 *  faces and an X-brace across the spine.
 *
 *  Four ops however many towers there are: the spine band, the brace, one path
 *  for every arm and one for every tower post. */
export function rackCantileverOps(obj, gridSize) {
  const { doubleSided, towers, towerW, spineH, armT, spineY, cxs } =
    cantileverGeom(obj, gridSize)
  if (!cxs.length) return rackBoxOps(obj)

  const ops = [
    /* A transparent body, matching the SVG: the arms and spine are slender, and
       without it a press inside the rack's own outline would fall straight
       through to the canvas instead of selecting it. */
    { op: 'rect', x: obj.x, y: obj.y, w: obj.width, h: obj.height, fill: 'transparent' },
    /* The spine is the darkest ink a rack may use — still lighter than the
       building wall, which owns pine. */
    { op: 'rect', x: obj.x, y: spineY, w: obj.width, h: spineH,
      fill: RACK_PALETTE.structure, opacity: 0.55 },
    { op: 'path',
      d: `M${cxs[0]} ${spineY}L${cxs[cxs.length - 1]} ${spineY + spineH}`
       + `M${cxs[0]} ${spineY + spineH}L${cxs[cxs.length - 1]} ${spineY}`,
      stroke: RACK_PALETTE.structure, strokeWidth: RACK_LINE.rail, opacity: 0.5 },
  ]

  let armsD = '', postsD = ''
  cxs.forEach((cx, i) => {
    const armPx = ((towers[i] || 36) / 12) * gridSize
    const ax = cx - armT / 2
    // front arm — above the spine when double-sided, below it when single
    const frontY = doubleSided ? spineY - armPx : spineY + spineH
    armsD += `M${ax} ${frontY}h${armT}v${armPx}h${-armT}Z`
    if (doubleSided) {
      armsD += `M${ax} ${spineY + spineH}h${armT}v${armPx}h${-armT}Z`
    }
    postsD += `M${cx - towerW / 2} ${spineY}h${towerW}v${spineH}h${-towerW}Z`
  })

  if (armsD) {
    ops.push({ op: 'path', d: armsD, fill: RACK_PALETTE.fill,
      stroke: RACK_PALETTE.structure, strokeWidth: RACK_LINE.hair })
  }
  if (postsD) {
    ops.push({ op: 'path', d: postsD, fill: RACK_PALETTE.structure, opacity: 0.9 })
  }
  return ops
}

/** MEZZANINE — a deck, not a rack: a floor plate with a structural grid and a
 *  stair run at one corner.
 *
 *  The grid divisions are derived from the deck's own size at roughly one bay
 *  per 6ft, so a large mezzanine gains divisions instead of stretching four of
 *  them across the whole span. Faint by design — it is the surface underfoot,
 *  and it must not compete with the racks standing on it. */
export function rackMezzanineOps(obj, gridSize) {
  const { x, y, width: w, height: h } = obj
  const ops = [{
    op: 'rect', x, y, w, h,
    fill: RACK_PALETTE.fill,
    stroke: RACK_PALETTE.border,
    strokeWidth: RACK_LINE.edge,
  }]

  const span = gridSize * 6
  const gx = Math.max(3, Math.round(w / span))
  const gy = Math.max(2, Math.round(h / span))

  let grid = ''
  for (let i = 1; i < gx; i++) { const gxp = x + (w * i) / gx; grid += `M${gxp} ${y}L${gxp} ${y + h}` }
  for (let i = 1; i < gy; i++) { const gyp = y + (h * i) / gy; grid += `M${x} ${gyp}L${x + w} ${gyp}` }
  if (grid) {
    ops.push({ op: 'path', d: grid,
      stroke: RACK_PALETTE.border, strokeWidth: RACK_LINE.rail, opacity: 0.3 })
  }

  /* Stair run — four treads stepping down and away from the deck corner. The
     one cue that says "you can get up here", which is the whole difference
     between a mezzanine and a plain platform. */
  const treadW = w * 0.12
  let stairs = ''
  for (let i = 0; i < 4; i++) {
    const sx = x + w * 0.82 - i * 6
    const sy = y + h * 0.78 + i * 5
    stairs += `M${sx} ${sy}h${treadW}v4h${-treadW}Z`
  }
  ops.push({ op: 'path', d: stairs, fill: RACK_PALETTE.border, opacity: 0.55 })
  return ops
}

/** SHELVING — hand-load racking: two heavy end frames with a shelf line
 *  between them. No bays and no travel, because nothing drives into it; the
 *  end frames carrying a single shelf are what separate it on sight from a
 *  selective rack of the same footprint. */
export function rackShelvingOps(obj, gridSize) {
  const { x, y, width: w, height: h } = obj
  return [
    { op: 'rect', x, y, w, h,
      fill: RACK_PALETTE.fill,
      stroke: RACK_PALETTE.border,
      strokeWidth: RACK_LINE.edge },
    // end frames — both uprights in one path
    { op: 'path', d: `M${x} ${y}L${x} ${y + h}M${x + w} ${y}L${x + w} ${y + h}`,
      stroke: RACK_PALETTE.border, strokeWidth: RACK_LINE.edge * 1.5 },
    // the shelf itself
    { op: 'path', d: `M${x} ${y + h / 2}L${x + w} ${y + h / 2}`,
      stroke: RACK_PALETTE.divider, strokeWidth: RACK_LINE.hair },
  ]
}

const BUILDERS = {
  rack_row: rackRowOps,
  rack_double_row: rackDoubleRowOps,
  rack_drive_in: rackDriveInOps,
  rack_drive_through: rackDriveThroughOps,
  rack_pushback: rackPushbackOps,
  rack_pallet_flow: rackPalletFlowOps,
  rack_cantilever: rackCantileverOps,
  rack_mezzanine: rackMezzanineOps,
  rack_shelving: rackShelvingOps,
}

/** Draw-ops for a rack, or null if this type is not ported yet (the caller
 *  then leaves it to the existing renderer rather than drawing it wrong).
 *
 *  Takes no zoom and has no level-of-detail switch: the ops are identical at
 *  2% and 400%, so a rack's op list can be built once per object rather than
 *  rebuilt whenever the view changes. */
export function rackDrawOps(obj, { gridSize = 40 } = {}) {
  if (!obj || !BUILDERS[obj.type]) return null
  if (!(obj.width > 0) || !(obj.height > 0)) return null
  return BUILDERS[obj.type](obj, gridSize)
}

/** Types this module can currently draw — the Konva layer uses it to decide
 *  what it is allowed to take over from the SVG renderer. */
export const PORTED_RACK_TYPES = new Set(Object.keys(BUILDERS))

/** Types that actually have BAYS, which is a smaller set than the types this
 *  module can draw. Lane racks are divided into lanes, a cantilever into
 *  towers, and a mezzanine or shelving unit into neither — asking any of them
 *  which bay a click landed in is a category error, and before this set existed
 *  they would each have answered "bay 0" from a defaulted 96in beam. */
const BAY_TYPES = new Set(['rack_row', 'rack_double_row'])

/** Turn a dragged WIDTH back into a bay count.
 *
 *  A rack resize is semantic, not a scale: dragging the end of a rack adds or
 *  removes BAYS, it does not stretch the bays it already has. A Transformer
 *  hands back a scale factor, so this is the conversion that makes the gesture
 *  mean the right thing — invert the same width formula the generator uses,
 *
 *      width = uprightWidth x (bays + 1) + sum(beams)
 *
 *  and round to the nearest whole bay. Rounding, not truncating: dragging a
 *  hair past the midpoint of a bay should gain it, or the rack feels like it
 *  resists the pointer.
 *
 *  Returns null when the type has no bays, so the caller can fall back to a
 *  plain geometric resize for a deck or a shelving unit. */
export function bayCountForWidth(obj, widthPx, gridSize = 40) {
  if (!obj || !BAY_TYPES.has(obj.type)) return null
  if (!(widthPx > 0) || !(gridSize > 0)) return null
  const upIn   = obj.uprightWidth || 3
  const beams  = Array.isArray(obj.beams) && obj.beams.length ? obj.beams : [96]
  const beamIn = beams[0] || 96
  const widthIn = (widthPx / gridSize) * 12
  const bays = Math.round((widthIn - upIn) / (upIn + beamIn))
  return Math.max(1, bays)
}

/** The store patch for a rack resized to `widthPx`: a new bay list, and the
 *  exact width that bay list actually measures.
 *
 *  The width is recomputed from the bays rather than kept as the dragged value,
 *  so the object's width and its bay list can never disagree — everything
 *  downstream (capacity, the column check, snapping) reads width. */
export function resizeRackToWidth(obj, widthPx, gridSize = 40) {
  const bays = bayCountForWidth(obj, widthPx, gridSize)
  if (bays == null) return null
  const upIn   = obj.uprightWidth || 3
  const prev   = Array.isArray(obj.beams) && obj.beams.length ? obj.beams : [96]
  const beamIn = prev[0] || 96
  const nextBeams = Array.from({ length: bays }, (_, i) => prev[i] ?? beamIn)
  const totalIn = upIn * (bays + 1) + nextBeams.reduce((s, b) => s + b, 0)
  return { beams: nextBeams, width: (totalIn / 12) * gridSize }
}

/** Which bay does a world-x fall in? Returns a 0-based index, or null if the
 *  point is outside the rack.
 *
 *  Consolidating bays into one path removed the per-bay node that used to
 *  answer this by being clicked, so the hit test moves here — where the bay
 *  geometry is already derived, and where it can be tested without a canvas.
 *
 *  A click landing on an upright resolves to the bay it borders rather than
 *  returning null: the uprights are only a few inches wide, and a dead strip
 *  between every bay would feel broken long before it felt precise. */
export function bayAtPoint(obj, worldX, gridSize = 40) {
  if (!obj || !BAY_TYPES.has(obj.type)) return null
  if (!(obj.width > 0)) return null
  if (worldX < obj.x || worldX > obj.x + obj.width) return null

  const { xs, beams } = uprightXs(obj, gridSize)
  for (let i = 0; i < beams.length; i++) {
    if (worldX <= xs[i + 1]) return i
  }
  return beams.length - 1        // past the last beam = the trailing upright
}
