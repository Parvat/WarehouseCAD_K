// columnCheck.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure column-grid + forklift interference logic. No React, no store, no
// rendering — it takes placed racks + column footprints + a forklift profile
// and returns conflicts plus red-mark geometry for a renderer to draw.
//
// This is the "brain" of the grid check. The recalc-on-activate wiring and the
// red markings on the canvas are wired in the live app (see the Claude Code
// brief); this module is what they call.
// ─────────────────────────────────────────────────────────────────────────────

import { bayAtPoint, uprightXs } from '../render/rackOps'
import { positionsPerBeam, blockedPositionIndices, positionFootprintIn } from '../utils/capacity'

const GS = 40 // px per foot (v16b convention)

/* travelFt: the truck's physical drive-through minimum (not pick) — the
 * true-block floor in checkColumns's 3-level accessibility test (BUG 39)
 * and the absorb-into-aisle floor in the placement walk
 * (GENERATOR_SPEC_V10.md). Default 8ft, capped at the truck's own aisleFt
 * for narrow-aisle trucks — a truck can never need MORE room to drive
 * through than it needs to work in, so VNA's 6ft aisle (narrower than the
 * 8ft default) caps its own travelFt at 6, not 8. Computed from aisleFt
 * rather than hand-copied so the two can't drift out of the min() relation
 * if aisleFt is ever retuned. */
const TRAVEL_FT_DEFAULT = 8
const travelFtFor = (aisleFt) => Math.min(TRAVEL_FT_DEFAULT, aisleFt)

// The selectable forklift input. Aisle widths are typical; tune per real MHE.
export const MHE_PROFILES = {
  reach:          { key: 'reach',          label: 'Reach truck',   aisleFt: 10.5, minAisleFt: 10.0, retrievalFt: 6, travelFt: travelFtFor(10.5) },
  vna:            { key: 'vna',            label: 'VNA / turret',  aisleFt: 6.0,  minAisleFt: 5.5,  retrievalFt: 4, travelFt: travelFtFor(6.0) },
  counterbalance: { key: 'counterbalance', label: 'Counterbalance', aisleFt: 12.5, minAisleFt: 12.0, retrievalFt: 7, travelFt: travelFtFor(12.5) },
}

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/* A rack's TRUE world footprint. canvas2 rotates every object IN PLACE
 * around its own centre (shapes.jsx's spin()) — a rack's stored x/y/width/
 * height are always the PRE-rotation box (beams along local X, depth along
 * local Y, exactly as traceGenerate.js's beamRackObject builds it, angle or
 * not). For a 90°/270° rack (GENERATOR_SPEC_V10's vertical orientation —
 * the first thing that actually produces one), the real box is centred at
 * that same point with width and height swapped. Every reader of a rack's
 * geometry below needs THIS, not the stored fields raw, or a vertical
 * layout's columns/aisles get tested against the wrong rectangle entirely. */
export function rackFootprint(r) {
  const rot = ((r.rotation || 0) % 180 + 180) % 180
  if (rot === 90) {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    return { x: cx - r.height / 2, y: cy - r.width / 2, w: r.height, h: r.width, rotated: true }
  }
  return { x: r.x, y: r.y, w: r.width, h: r.height, rotated: false }
}

/* Group racks into runs (segments) by shared-run overlap — a travel aisle
 * only exists BETWEEN two racks that actually face each other along the
 * same run; a rack in a different run (across a cross-aisle) shares no
 * aisle with it even if it happens to sit at the same Y. "Same run" means
 * sharing the cross-axis range: X-overlap for horizontal racks (stacked
 * down Y), Y-overlap for vertical ones (stacked across X, GENERATOR_SPEC_
 * V10's orientation) — mismatched orientation never shares a run. Union-
 * find over pairwise overlap rather than exact position equality, so a
 * hand-resized bay (still overlapping its neighbors' span) still groups
 * correctly, not just an untouched generated layout sharing one exact x. */
export function groupBySegment(racks) {
  const n = racks.length
  const feet = racks.map(rackFootprint)
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj }
  const sameRun = (a, b) => {
    if (a.rotated !== b.rotated) return false
    return a.rotated
      ? a.y < b.y + b.h && a.y + a.h > b.y   // vertical: share the same Y range
      : a.x < b.x + b.w && a.x + a.w > b.x   // horizontal: share the same X range
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sameRun(feet[i], feet[j])) union(i, j)
    }
  }
  const groups = new Map()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(racks[i])
  }
  return [...groups.values()]
}

/* Expand a v16b column_grid object into individual column footprints (px).
 * A grid LINE is a column's centreline, not a corner — standard structural
 * drafting convention, and the only reading under which "a column sits AT
 * the flue line" is a physical statement at all. cg.x/cg.y and the
 * cumulative spacingX/spacingY walk mark those centrelines, so each square
 * is centred on its own line here rather than cornered on it. This is the
 * one place that math happens — ColumnGridShape draws these same rects, so
 * fixing it here also fixes what's actually drawn on screen. */
export function expandColumnGrid(cg, gridSize = GS) {
  if (!cg || !cg.spacingX || !cg.spacingY) return []
  const w = cg.columnW || gridSize   // 12" default
  const h = cg.columnH || gridSize
  const xs = [cg.x]; let ax = cg.x; for (const s of cg.spacingX) { ax += s; xs.push(ax) }
  const ys = [cg.y]; let ay = cg.y; for (const s of cg.spacingY) { ay += s; ys.push(ay) }
  const cols = []
  for (const cx of xs) for (const cy of ys) cols.push({ x: cx - w / 2, y: cy - h / 2, w, h })
  return cols
}

// ── Pick zones ───────────────────────────────────────────────────────────────
/* A column standing in the AISLE can cost a pallet position even though it
 * never touches the rack: the forklift needs a clear rectangle straight out
 * from the pick face — as wide as that position's own footprint (the same
 * `positionFootprintIn` slot capacity and the in-rack check use) and as deep
 * as the truck's pick aisle (profile.aisleFt). Any overlap with a column
 * means the position can't be picked from that side.
 *
 * Pick sides: a double row's face is picked only from its own outer side.
 * A single row is picked from every side whose zone is genuinely open aisle
 * — no other rack inside it and, when a floor plan is given, wholly inside
 * the building (a single against a wall has one pick side). A position is
 * lost only when EVERY pick side it has is blocked.
 *
 * Built in the rack's own LOCAL (pre-rotation) frame — beams along local X,
 * depth along local Y, face 0 on the obj.y side — then carried to world by
 * rotating about the rack's centre, the same in-place spin canvas2 draws
 * with. Exact for any multiple of 90°; other angles are skipped rather than
 * approximated, since a wrong red X is worse than none. */

const PICK_TYPES = new Set(['rack_row', 'rack_double_row'])

export function localRectToWorld(obj, rect) {
  const rot = (((obj.rotation || 0) % 360) + 360) % 360
  if (rot === 0) return { ...rect }
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const t = rot * Math.PI / 180, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t))
  const pts = [[rect.x, rect.y], [rect.x + rect.w, rect.y + rect.h]].map(([x, y]) => [
    cx + (x - cx) * c - (y - cy) * s,
    cy + (x - cx) * s + (y - cy) * c,
  ])
  const x0 = Math.min(pts[0][0], pts[1][0]), y0 = Math.min(pts[0][1], pts[1][1])
  return { x: x0, y: y0, w: Math.abs(pts[1][0] - pts[0][0]), h: Math.abs(pts[1][1] - pts[0][1]) }
}

/** World rect of one position's pick zone. side: 'near' (local obj.y side,
 *  face 0's) or 'far' (face 1's). null if the position doesn't exist. */
export function pickZoneRect(obj, gridSize, bayIndex, positionIndex, side, aislePx) {
  const { xs, upW, beams } = uprightXs(obj, gridSize)
  if (!(bayIndex >= 0 && bayIndex < beams.length)) return null
  const fp = positionFootprintIn(beams[bayIndex], obj.palletWIn || 40, positionIndex)
  if (!fp) return null
  const toPx = (inches) => (inches / 12) * gridSize
  const x = xs[bayIndex] + upW + toPx(fp.startIn)
  const w = toPx(fp.endIn - fp.startIn)
  const local = side === 'near'
    ? { x, y: obj.y - aislePx, w, h: aislePx }
    : { x, y: obj.y + obj.height, w, h: aislePx }
  return localRectToWorld(obj, local)
}

function pointInPolygon(px, py, verts) {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i], b = verts[j]
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/* Does a wall segment pass through the rect's open interior? Liang–Barsky
 * clip against the rect shrunk by a hair, so a wall lying exactly ON the
 * zone's edge (a row set flush to it) doesn't count as crossing it. */
function segmentCrossesRect(a, b, r) {
  const e = 1e-6
  const xmin = r.x + e, xmax = r.x + r.w - e, ymin = r.y + e, ymax = r.y + r.h - e
  if (xmax <= xmin || ymax <= ymin) return false
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, a.x - xmin], [dx, xmax - a.x], [-dy, a.y - ymin], [dy, ymax - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return t0 <= t1
}

function insideAnyFloor(rect, floors) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
  return floors.some(verts => {
    if (!verts || verts.length < 3) return false
    if (!pointInPolygon(cx, cy, verts)) return false
    for (let i = 0; i < verts.length; i++) {
      if (segmentCrossesRect(verts[i], verts[(i + 1) % verts.length], rect)) return false
    }
    return true
  })
}

/** Positions lost to aisle columns. `alreadyBlocked` is a Set of
 *  `rackId:bay:face:pos` keys the in-rack check already charged — those are
 *  never counted twice. `floors`: world-space polygons ([{x,y}, ...]) of the
 *  building; empty means no walls are known. */
export function pickZoneBlocks({ racks = [], columns = [], profile = MHE_PROFILES.reach, gridSize = GS, floors = [], alreadyBlocked = new Set() }) {
  const aislePx = profile.aisleFt * gridSize
  const out = []
  if (!columns.length || !(aislePx > 0)) return out
  const rackFeet = racks.map(r => ({ id: r.id, f: rackFootprint(r) }))

  for (const r of racks) {
    if (!PICK_TYPES.has(r.type)) continue
    if (((r.rotation || 0) % 90) !== 0) continue
    const isDouble = r.type === 'rack_double_row'
    const levels = r.levels || 1
    const { beams } = uprightXs(r, gridSize)
    const palletWIn = r.palletWIn || 40

    // is this zone an aisle a single can be picked from?
    const isOpenAisle = (zone) =>
      !rackFeet.some(o => o.id !== r.id && overlaps(zone, o.f)) &&
      (!floors.length || insideAnyFloor(zone, floors))

    beams.forEach((beamIn, bayIndex) => {
      const n = positionsPerBeam(beamIn, palletWIn)
      const faceSides = isDouble ? [[0, ['near']], [1, ['far']]] : [[0, ['near', 'far']]]
      for (const [face, sides] of faceSides) {
        const lost = []
        const cols = new Set()
        for (let p = 0; p < n; p++) {
          if (alreadyBlocked.has(`${r.id}:${bayIndex}:${face}:${p}`)) continue
          let pickSides = 0, blockedSides = 0
          const hitting = []
          for (const side of sides) {
            const zone = pickZoneRect(r, gridSize, bayIndex, p, side, aislePx)
            if (!zone) continue
            if (!isDouble && !isOpenAisle(zone)) continue
            pickSides++
            const hits = columns.reduce((a, c, ci) => (overlaps(c, zone) ? [...a, ci] : a), [])
            if (hits.length) { blockedSides++; hitting.push(...hits) }
          }
          if (pickSides > 0 && blockedSides === pickSides) {
            lost.push(p)
            hitting.forEach(ci => cols.add(ci))
          }
        }
        if (lost.length) {
          out.push({
            rackId: r.id, bayIndex, faces: [face], positionIndices: lost,
            columnIndices: [...cols], positionsLost: lost.length * levels, kind: 'pick-zone',
          })
        }
      }
    })
  }
  return out
}

// ── Columns on upright frames ────────────────────────────────────────────────
/* A column can't be installed through an upright frame, so any column whose
 * footprint overlaps one is flagged — never moved; the dealer resolves it.
 * Frames are the rack's own `uprightXs` (both ends and every interior one,
 * `uprightWidth` wide), one per band: a double row has two frame lines, one
 * per face, and none across the flue. Local frame -> world exactly as the
 * pick zones do; racks at other than 0/90/180/270° are skipped. */

/** Upright frames of one rack in its LOCAL frame: { upright, face, x, y, w, h }. */
export function uprightFramesLocal(r, gridSize = GS) {
  if (!PICK_TYPES.has(r.type)) return []
  const { xs, upW } = uprightXs(r, gridSize)
  let bands = [{ y: r.y, h: r.height }]
  if (r.type === 'rack_double_row') {
    const flueH = ((r.flueSpaceIn || 9) / 12) * gridSize
    const rowH = Math.max(0, (r.height - flueH) / 2)
    if (rowH > 0) bands = [{ y: r.y, h: rowH }, { y: r.y + rowH + flueH, h: rowH }]
  }
  const out = []
  xs.forEach((x, upright) => bands.forEach((b, face) => out.push({ upright, face, x, y: b.y, w: upW, h: b.h })))
  return out
}

/** Every column overlapping an upright frame, one entry per (rack, column,
 *  upright): which faces it hits and the bay(s) that frame sits between. */
export function columnsOnUprights({ racks = [], columns = [], gridSize = GS }) {
  const hits = []
  for (const r of racks) {
    if (!PICK_TYPES.has(r.type) || ((r.rotation || 0) % 90) !== 0) continue
    const nBays = uprightXs(r, gridSize).beams.length
    const frames = uprightFramesLocal(r, gridSize).map(f => ({ ...f, world: localRectToWorld(r, f) }))
    columns.forEach((col, columnIndex) => {
      const byUpright = new Map()
      for (const f of frames) {
        if (!overlaps(col, f.world)) continue
        if (!byUpright.has(f.upright)) byUpright.set(f.upright, [])
        byUpright.get(f.upright).push(f.face)
      }
      for (const [upright, faces] of byUpright) {
        hits.push({
          rackId: r.id, columnIndex, upright, faces,
          bays: [upright - 1, upright].filter(b => b >= 0 && b < nBays),
        })
      }
    })
  }
  return hits
}

/** Columns standing in a travel aisle — one entry per (aisle, column), with
 *  the clear space on BOTH sides. Split out of checkColumns (which calls it)
 *  so the canvas can re-run just this cheap part every frame of a drag,
 *  without the pick-zone and in-rack work.
 *
 *  Aisles are gaps WITHIN one run of facing rows, measured along whichever
 *  axis those rows are actually STACKED on — Y for horizontal (rows run
 *  along X), X for vertical (GENERATOR_SPEC_V10; rows run along Y). Group
 *  racks into runs FIRST (by shared cross-axis range), then look for
 *  along-axis gaps inside each run on its own. Sorting every rack globally
 *  by one fixed axis and pairing consecutive entries silently found nothing
 *  the moment a building had a cross-aisle (BUG 33).
 *
 *  `pinched` — neither side reaches travelFt, so a forklift can't pass on
 *  either side (the same condition as accessibility level 1). The drawing
 *  shades that aisle red; levels and capacity are untouched. */
export function aisleColumnBlocks({ racks = [], columns = [], profile = MHE_PROFILES.reach, gridSize = GS, pickBothSides = false }) {
  const travelPx = (profile.travelFt ?? 8) * gridSize
  const aislePx  = profile.aisleFt * gridSize
  const aisleBlocks = []
  const redMarks = []
  const segments = groupBySegment(racks)
  for (const run of segments) {
    if (!run.length) continue
    const stacked = rackFootprint(run[0]).rotated   // true: stacked along X (vertical rows). false: along Y.
    const feet = run.map(r => ({ r, f: rackFootprint(r) }))
    feet.sort((a, b) => stacked ? a.f.x - b.f.x : a.f.y - b.f.y)

    for (let i = 0; i < feet.length - 1; i++) {
      const top = feet[i], bot = feet[i + 1]
      const gapStart = stacked ? (top.f.x + top.f.w) : (top.f.y + top.f.h)
      const gapLen   = stacked ? (bot.f.x - gapStart) : (bot.f.y - gapStart)
      if (gapLen <= 0) continue
      const crossStart = Math.max(stacked ? top.f.y : top.f.x, stacked ? bot.f.y : bot.f.x)
      const crossEnd   = Math.min(
        stacked ? top.f.y + top.f.h : top.f.x + top.f.w,
        stacked ? bot.f.y + bot.f.h : bot.f.x + bot.f.w,
      )
      if (crossEnd <= crossStart) continue

      const aisleBox = stacked
        ? { x: gapStart, y: crossStart, w: gapLen, h: crossEnd - crossStart }
        : { x: crossStart, y: gapStart, w: crossEnd - crossStart, h: gapLen }
      columns.forEach((col, ci) => {
        if (!overlaps(col, aisleBox)) return
        // Widest clear pass on either side of the column within the aisle,
        // measured along the same axis the aisle's own gap runs.
        const colNear = stacked ? col.x : col.y
        const colFar  = stacked ? (col.x + col.w) : (col.y + col.h)
        const nearClear = colNear - gapStart
        const farClear  = (gapStart + gapLen) - colFar
        const clearPx   = Math.max(nearClear, farClear)
        const clearSide = nearClear >= farClear ? 'top' : 'bot'   // which row the column is clear TOWARD
        const level    = clearPx < travelPx ? 1 : (clearPx < aislePx ? 2 : 3)
        const blocked  = level === 1 || (level === 2 && pickBothSides)
        aisleBlocks.push({
          betweenRows: [top.r.id, bot.r.id], columnIndex: ci,
          aisleFt: +(gapLen / gridSize).toFixed(1),
          clearFt: +(clearPx / gridSize).toFixed(1),
          clearSide, level, blocked,
          /* Both sides, for the drawing: the clear space from the column to
             the rack on each side (near = the `top` row's side), the axis
             the aisle's gap runs along, and the aisle box itself (px). */
          nearClearFt: +(nearClear / gridSize).toFixed(1),
          farClearFt: +(farClear / gridSize).toFixed(1),
          nearShort: nearClear < travelPx, farShort: farClear < travelPx,
          pinched: clearPx < travelPx,
          axis: stacked ? 'x' : 'y',
          gapStart, gapEnd: gapStart + gapLen, crossStart, crossEnd,
        })
        if (blocked) redMarks.push(stacked
          ? { x: gapStart, y: col.y, w: gapLen, h: col.h, kind: 'aisle-blocked' }
          : { x: col.x, y: gapStart, w: col.w, h: gapLen, kind: 'aisle-blocked' })
      })
    }
  }
  return { aisleBlocks, redMarks }
}

// ── The check ────────────────────────────────────────────────────────────────
// racks:   [{ id, x, y, width, height, type, beams, levels, palletWIn,
//             depthIn, flueSpaceIn }]  (px, depthIn/flueSpaceIn in inches)
// columns: [{ x, y, w, h }]  (px)  — use expandColumnGrid() to build these
// profile: one of MHE_PROFILES
// floors: world polygons ([{x,y},...]) of the building, for pick-zone walls.
// pickBothSides: false (default) — a column with clear space on only ONE
//   side is accessible (GENERATOR_SPEC_V10.md's 3-level rule below); true —
//   the customer wants both faces pickable, so level 2 also gets flagged.
export function checkColumns({ racks = [], columns = [], profile = MHE_PROFILES.reach, gridSize = GS, pickBothSides = false, floors = [] }) {
  /* Accessibility is 3 levels, not binary (GENERATOR_SPEC_V10.md, replacing
     the earlier "clear < minAisleFt = blocked" test — that flagged an 8ft-
     clear aisle on a reach truck (needs 10ft to PICK) as blocked, when the
     truck can still drive it and pick from the far side just fine):
       1. BLOCKED    — clear < travelFt: can't even drive through. Real fail.
       2. ONE-SIDE   — travelFt <= clear < aisleFt: drivable, and pickable
          from the side away from the column, not the column's own side.
          Accessible by default (buys more rows) — only a problem if the
          customer specifically wants both faces pickable (pickBothSides).
       3. FULL PICK  — clear >= aisleFt: ideal, both sides pickable.
     Only level 1 is ever a true block; level 2 is "flagged" (the field the
     UI/summary act on) only when pickBothSides is on. */
  const rackConflicts = []
  const flueSeated = []
  const aisleBlocks = []
  const redMarks = []
  let positionsLostIfAbsorb = 0
  let sectionsLostIfRemove = 0

  /* 1) Column inside a rack's overall bbox is NOT automatically a conflict — a
     double row's bbox spans front face + flue + back face, and a column
     SEATED ON THE FLUE LINE is free even if its own footprint spills past the
     flue's edges into a face (COLUMN_GENERATOR_SPEC_V6.md Step 2 correction:
     a real column is typically wider than a 6" flue, so "fits entirely
     inside the flue" never fires for any realistically-sized column — the
     test that matters is where the column is CENTRED, not whether its whole
     footprint clears the flue's edges). A centre inside the flue band seats
     it there for free; a centre inside a face means the column is genuinely
     in that pick face, not just brushing it. */
  columns.forEach((col, ci) => {
    for (const r of racks) {
      const rb = rackFootprint(r)
      if (!overlaps(col, rb)) continue

      const beams     = r.beams || [96]
      const levels    = r.levels || 1
      const palletWIn = r.palletWIn || 40   // the loading FACE, across the beam — see utils/capacity.js
      const isDouble  = r.type === 'rack_double_row'
      /* The rack's own DEPTH axis — Y for horizontal (unrotated), X for a
         90°-rotated (vertical) rack, since rotation swaps which stored
         dimension ends up running which way in the world. The flue/face
         split always happens along THIS axis, never hardcoded to Y. */
      const depthAxisIsY = !rb.rotated
      const colCenterAlongDepth = depthAxisIsY ? (col.y + col.h / 2) : (col.x + col.w / 2)
      const rbDepthStart = depthAxisIsY ? rb.y : rb.x

      let facesHit
      let isNearFace = null   // world-space: is the blocked face the one adjacent to rbDepthStart?
      if (r.depthIn == null) {
        // No stored front/flue/back split (a rack predating this field) —
        // fall back to the old, conservative "any overlap costs every face"
        // reading rather than guessing where an unknown flue might be.
        facesHit = isDouble ? 2 : 1
      } else if (!isDouble) {
        // No flue exists on a single-depth row — any overlap is a face hit.
        facesHit = 1
      } else {
        const depthPx    = (r.depthIn / 12) * gridSize
        const fluePx     = (r.flueSpaceIn ?? 9) / 12 * gridSize
        /* Half the flue's own depth as slack on each side — the column grid
           and the row grid are independent inputs (a gridYFt pitch has no
           reason to land exactly on a row's own flue centre), so a column a
           few inches off still reads as "on the flue line" the way a person
           looking at the drawing would call it, rather than only the exact
           centre pixel. */
        const tolerancePx = fluePx / 2
        const flueStart  = rbDepthStart + depthPx - tolerancePx
        const flueEnd    = rbDepthStart + depthPx + fluePx + tolerancePx
        const seatedInFlue = colCenterAlongDepth >= flueStart && colCenterAlongDepth < flueEnd
        facesHit = seatedInFlue ? 0 : 1   // centred in front OR back face — never both at once
        if (!seatedInFlue) isNearFace = colCenterAlongDepth < flueStart
      }

      const box = {
        x: Math.max(col.x, rb.x),
        y: Math.max(col.y, rb.y),
        w: Math.min(col.x + col.w, rb.x + rb.w) - Math.max(col.x, rb.x),
        h: Math.min(col.y + col.h, rb.y + rb.h) - Math.max(col.y, rb.y),
      }

      if (facesHit === 0) {
        // Entirely inside the flue gap between the two faces — free.
        flueSeated.push({ rackId: r.id, columnIndex: ci, overlap: box })
        continue
      }

      /* BUG 61 — a renderer marking "which pick position is blocked" needs
         the BAY's own geometry, not the column's — `overlap` above is sized
         to the COLUMN (often much smaller than a bay, sometimes just the
         sliver where it clips the rack edge). `bayAtPoint` answers in the
         rack's own LOCAL frame (pre-rotation: beams along local X, depth
         along local Y — the same convention `rackFootprint` documents), so
         the column's WORLD run-axis position is converted to that frame
         first. This conversion is exact for both 0° and 90° racks with no
         separate rotated-vs-not branch: `rackFootprint`'s 90° case rotates
         IN PLACE around the object's own centre, which (worked through the
         corner mapping by hand) leaves the run axis's own coordinate
         unreversed — only the DEPTH axis flips direction under rotation,
         which is exactly why `isNearFace` (a WORLD-space "which side of the
         flue" read) needs its own local-index flip below, but the run-axis
         conversion does not. */
      const runAxisIsY  = rb.rotated
      const runStart    = depthAxisIsY ? rb.x : rb.y
      const colRunPos   = runAxisIsY ? (col.y + col.h / 2) : (col.x + col.w / 2)
      const colRunHalf  = (runAxisIsY ? col.h : col.w) / 2
      const localRunX   = r.x + (colRunPos - runStart)
      const bayIndex    = bayAtPoint(r, localRunX, gridSize)
      /* Local face index, in the SAME order `bayRectForIndex` (canvas2/
         shapes.jsx) returns for a rack_double_row: [0]=local-near (drawn
         first, ly close to r.y), [1]=local-far. Rotation reverses which
         WORLD side that local-near face actually sits on (see the corner-
         mapping note above), so `isNearFace` (world) needs the flip only
         when `rb.rotated`. A single row has exactly one face — index 0 —
         and the legacy no-depthIn fallback marks both, matching the
         existing conservative "any overlap costs every face" cost read. */
      const faces = !isDouble ? [0]
        : isNearFace == null ? [0, 1]
        : [rb.rotated ? (isNearFace ? 1 : 0) : (isNearFace ? 0 : 1)]

      /* BUG 62 — exactly which pallet position(s) the column's own footprint
         touches on THIS bay's own beam, not a coarse ceil(columnWidth /
         palletWidth) estimate: `uprightXs` gives the beam's own LOCAL start
         (the near upright's far edge — the same geometry `bayRectForIndex`
         draws from), the column's local run-axis extent (centre ± half its
         own run-axis width) is converted to inches relative to that start,
         and `blockedPositionIndices` (utils/capacity.js — the SAME
         GMA-standard slot math `positionsPerBeam` counts with) resolves
         which slot(s), if any, it actually reaches. A column sitting in the
         unusable slack past the last full position (a beam length is
         rarely an exact multiple of the slot width) costs nothing — there
         was never a sellable position there — where the old ceil-estimate
         always charged at least one. */
      let positionIndices = []
      let positionsPerThisBay = 0
      if (bayIndex != null) {
        const { xs, upW } = uprightXs(r, gridSize)
        const beamStartPx = xs[bayIndex] + upW
        const beamLenIn   = beams[bayIndex] ?? beams[0] ?? 96
        const loIn = ((localRunX - colRunHalf - beamStartPx) / gridSize) * 12
        const hiIn = ((localRunX + colRunHalf - beamStartPx) / gridSize) * 12
        positionIndices     = blockedPositionIndices(beamLenIn, palletWIn, loIn, hiIn)
        positionsPerThisBay = positionsPerBeam(beamLenIn, palletWIn)
      }

      // Absorb: only the pallet position(s) the column actually reaches, the
      // faces it hits, all levels. Remove: drop the whole bay it lands in.
      const positionsLost = positionIndices.length * levels * facesHit
      const sectionsLost  = positionsPerThisBay * levels * facesHit

      positionsLostIfAbsorb += positionsLost
      sectionsLostIfRemove  += sectionsLost

      rackConflicts.push({ rackId: r.id, columnIndex: ci, overlap: box, positionsLost, sectionsLost, bayIndex, faces, positionIndices })
      redMarks.push({ ...box, kind: 'rack-column' })
    }
  })

  /* 1b) Column in a position's pick zone (see pickZoneBlocks). Positions the
     in-rack pass above already charged are passed in so they count once. */
  const alreadyBlocked = new Set()
  for (const c of rackConflicts) {
    if (c.bayIndex == null) continue
    for (const f of c.faces || [0]) for (const p of c.positionIndices || []) alreadyBlocked.add(`${c.rackId}:${c.bayIndex}:${f}:${p}`)
  }
  const pickBlocks = pickZoneBlocks({ racks, columns, profile, gridSize, floors, alreadyBlocked })
  const uprightHits = columnsOnUprights({ racks, columns, gridSize })
  const positionsLostToPickZone = pickBlocks.reduce((s, b) => s + b.positionsLost, 0)
  positionsLostIfAbsorb += positionsLostToPickZone

  /* 2) Column in a travel aisle → blocked if the clear side is under the min.
     Aisles are gaps WITHIN one run of facing rows, measured along whichever
     axis those rows are actually STACKED on — Y for horizontal (rows run
     along X), X for vertical (GENERATOR_SPEC_V10; rows run along Y). Group
     racks into runs FIRST (by shared cross-axis range), then look for
     along-axis gaps inside each run on its own. Sorting every rack
     globally by one fixed axis and pairing consecutive entries (the old
     approach, and still wrong if it assumed Y unconditionally) silently
     found nothing the moment a building had a cross-aisle: every band puts
     two racks (one per segment) at the same stacking-axis position, so a
     global sort never puts two same-run rows next to each other — the
     "next" entry after one run's row is always the OTHER run's row from
     the same band (zero cross-axis overlap, skipped) or the next band's
     row from the other run (also zero overlap, skipped). aisleBlocks came
     back empty for every standard generate as a result (BUG 33). */
  const aisle = aisleColumnBlocks({ racks, columns, profile, gridSize, pickBothSides })
  aisleBlocks.push(...aisle.aisleBlocks)
  redMarks.push(...aisle.redMarks)

  return {
    rackConflicts,   // bay-columns only — accessible, kept, flagged red
    flueSeated,      // flue-columns — free, blue, not a conflict at all
    pickBlocks,      // positions lost to a column in the aisle, every pick side blocked
    uprightHits,     // columns overlapping an upright frame — can't be installed; flagged, never moved
    aisleBlocks,     // Step 3 territory, unchanged
    redMarks,
    summary: {
      profile: profile.label,
      rackConflicts: rackConflicts.length,
      flueSeated: flueSeated.length,
      blockedAisles: aisleBlocks.filter(a => a.blocked).length,
      positionsLostIfAbsorb,   // customer keeps the rack, loses these positions (in-rack + pick zone)
      positionsLostToPickZone, // the pick-zone share of the above
      columnsOnUprights: new Set(uprightHits.map(h => h.columnIndex)).size,
      sectionsLostIfRemove,    // vs deleting whole bays — always worse
    },
  }
}
