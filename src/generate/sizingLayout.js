// sizingLayout.js
// ─────────────────────────────────────────────────────────────────────────────
// The sizing-sheet layout — the shape a warehouse is actually drawn in, rather
// than the uniform block the Phase-1 stub produced:
//
//   ┌──────────────────────────────────────────────┐
//   │ ░ │  ────────────  │  ────────────           │  single row, on the wall
//   │ ░ │                                          │  12.5' aisle
//   │ ░ │  ════════════  │  ════════════           │  double row, 6" flue
//   │ ░ │       ▲        ▲        ▲                │
//   │ ░ │   staging   cross-aisle                  │
//   │ ░ │  ────────────  │  ────────────           │  single row, on the wall
//   └──────────────────────────────────────────────┘
//
// Pure geometry: feet in, placements out. No React, no store — the same
// contract stubGenerateLayout has, so it drops straight into
// generateAndPlace(brief, thisFunction).
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_RULES } from '../rules/defaults'

const GS      = 40   // px per foot — v16b convention (store.gridSize)
const FLUE_IN = 6    // back-to-back flue gap for double rows
const UP_IN   = 3    // upright width

/* A naive fill on a 1,000ft building can ask for tens of thousands of bay
   rects. These bound the shape count so the canvas stays interactive; the
   cross-aisle also roughly halves bays-per-object, which is why it helps
   rendering as well as truck movement. */
const MAX_ROWS      = 40
const MAX_BAYS_SEG  = 40

/** Bays that fit in a clear run, given the shared-upright layout
 *  `upright | beam | upright | beam | upright`. */
export function baysInRun(runFt, beamIn = 96, upIn = UP_IN) {
  const runIn = runFt * 12
  return Math.max(0, Math.floor((runIn - upIn) / (beamIn + upIn)))
}

/** Row bands down the building's depth (Y).
 *  Single rows sit hard against the top and bottom walls — a double row on a
 *  wall would bury its back face — and the requested rack type fills between.
 */
export function rowBands(widthFt, { rackType, depthIn, aisleFt, flueIn = FLUE_IN }) {
  const singleFt = depthIn / 12
  const midFt    = rackType === 'rack_double_row' ? (2 * depthIn + flueIn) / 12 : singleFt
  const bands    = []

  if (widthFt < singleFt) return bands
  bands.push({ type: 'rack_row', yFt: 0, depthFt: singleFt })

  const bottomY = widthFt - singleFt
  let y = singleFt + aisleFt
  while (y + midFt + aisleFt <= bottomY && bands.length < MAX_ROWS - 1) {
    bands.push({ type: rackType, yFt: y, depthFt: midFt })
    y += midFt + aisleFt
  }
  /* The closing single row only earns its place if a full aisle still
     separates it from whatever came before. */
  if (bottomY >= y) bands.push({ type: 'rack_row', yFt: bottomY, depthFt: singleFt })
  return bands
}

/** Rack runs across the building's length (X): the staging strip is skipped
 *  entirely and one cross-aisle splits what remains into two segments. */
export function rowSegments(lengthFt, { speedBayFt, crossAisleFt, endClearFt, beamIn, upIn = UP_IN }) {
  const x0     = speedBayFt
  const x1     = lengthFt - endClearFt
  const usable = x1 - x0
  if (usable <= 0) return { segments: [], bays: 0, crossAisle: null }

  const halfFt = (usable - crossAisleFt) / 2
  /* Too narrow to be worth splitting — one run beats two stubs. */
  if (halfFt < beamIn / 12) {
    const bays = Math.min(MAX_BAYS_SEG, baysInRun(usable, beamIn, upIn))
    return { segments: bays > 0 ? [x0] : [], bays, crossAisle: null }
  }

  const bays = Math.min(MAX_BAYS_SEG, baysInRun(halfFt, beamIn, upIn))
  if (bays <= 0) return { segments: [], bays: 0, crossAisle: null }
  return {
    segments:   [x0, x0 + halfFt + crossAisleFt],
    bays,
    crossAisle: { xFt: x0 + halfFt, widthFt: crossAisleFt },
  }
}

/** Frame/beam/flue/depth the layout is built from, resolved from the rules
 *  profile with the brief able to override any of them.
 *
 *  Which frame depth? The shallowest one that actually holds the pallet —
 *  picking the first in the list would spec a 36" frame under a 40" pallet,
 *  and picking the deepest would throw away floor space on every row. */
export function layoutSpec(brief = {}, rules = DEFAULT_RULES) {
  const sel     = rules.selective || {}
  const pallet  = rules.pallet || {}
  const beams   = sel.beamLengthsIn?.length ? sel.beamLengthsIn : [96]
  const depths  = sel.frameDepthsIn?.length ? sel.frameDepthsIn : [42]
  const frames  = sel.frameWidthsIn?.length ? sel.frameWidthsIn : [3]
  const palletW = pallet.wIn ?? 48
  const palletD = pallet.dIn ?? 40

  const fitDepth = [...depths].sort((a, b) => a - b).find(d => d >= palletD) ?? depths[0]

  return {
    beamIn:     brief.beamIn     ?? beams[0],
    depthIn:    brief.depthIn    ?? fitDepth,
    upIn:       brief.uprightIn  ?? frames[0],
    flueIn:     brief.flueIn     ?? sel.flueIn ?? FLUE_IN,
    palletWIn:  brief.palletWIn  ?? palletW,
    palletDIn:  brief.palletDIn  ?? palletD,
    /* Wall clearance is authored in inches on the rules table; the layout
       works in feet. */
    endClearFt: brief.endClearFt ?? ((sel.wallClearanceIn ?? 36) / 12),
  }
}

/** The generator. Same shape/return as stubGenerateLayout, plus the resolved
 *  rules profile — change the profile and the whole layout re-drives. */
export function sizingSheetLayout(brief, rules = DEFAULT_RULES) {
  const spec = layoutSpec(brief, rules)
  const {
    lengthFt, widthFt,
    rackType     = 'rack_double_row',
    levels       = 4,
    aisleFt      = rules.mhe?.[brief.mhe || rules.mheDefault || 'reach']?.aisleFt ?? 12.5,
    speedBayFt   = 60,
    crossAisleFt = aisleFt,
  } = brief
  const { beamIn, depthIn, upIn, flueIn, palletWIn, endClearFt } = spec

  const bands = rowBands(widthFt, { rackType, depthIn, aisleFt, flueIn })
  const { segments, bays } = rowSegments(lengthFt, { speedBayFt, crossAisleFt, endClearFt, beamIn, upIn })
  if (!bands.length || !segments.length || bays <= 0) return []

  const placements = []
  for (const band of bands) {
    for (const xFt of segments) {
      placements.push({
        type: band.type, xFt, yFt: band.yFt,
        bays, beamIn, depthIn, levels, palletWIn,
        palletDIn: spec.palletDIn, uprightWidthIn: upIn, angle: 0,
      })
    }
  }
  return placements
}

/* ── Fixtures — everything that is not a rack ────────────────────────────────
   Built as plain v16b object literals in WORLD px, offset into the building,
   so generateAndPlace can hand each one to the store's addObject factory
   unchanged. */

const STRUCT = '#6366f1'

/** Structural column grid, centred in the building on the requested spacing. */
export function columnGridObject(brief, ox, oy) {
  const { lengthFt, widthFt, gridXFt = 50, gridYFt = 54, colSizeIn = 12 } = brief
  if (!(gridXFt > 0) || !(gridYFt > 0)) return null

  const nx = Math.max(1, Math.floor(lengthFt / gridXFt))
  const ny = Math.max(1, Math.floor(widthFt  / gridYFt))
  const colPx = (colSizeIn / 12) * GS

  const spacingX = Array.from({ length: nx }, () => gridXFt * GS)
  const spacingY = Array.from({ length: ny }, () => gridYFt * GS)
  /* Centre the grid so columns are not buried in the walls. */
  const offX = (lengthFt - nx * gridXFt) / 2 * GS
  const offY = (widthFt  - ny * gridYFt) / 2 * GS

  return {
    type: 'column_grid', label: 'Column Grid',
    x: ox + offX, y: oy + offY,
    width:  nx * gridXFt * GS + colPx,
    height: ny * gridYFt * GS + colPx,
    spacingX, spacingY,
    colSizeIn, columnW: colPx, columnH: colPx,
    showGrid: true, wallAttached: false,
    fill: STRUCT + '22', stroke: STRUCT, strokeWidth: 1.5,
  }
}

/** Dock doors spread evenly along the dock (staging) wall. */
export function dockDoorObjects(brief, ox, oy) {
  const { widthFt, dockDoors = 0, doorWidthFt = 9, doorDepthFt = 8 } = brief
  const n = Math.max(0, Math.floor(dockDoors))
  if (!n) return []

  const out = []
  for (let i = 0; i < n; i++) {
    /* Evenly spaced centres, so the first and last sit inboard of the corners
       rather than half-off the end of the wall. */
    const cyFt = (i + 0.5) * (widthFt / n)
    out.push({
      type: 'struct_loading_dock', label: `Dock Door ${i + 1}`,
      /* Straddles the wall line, the way a real door does. */
      x: ox - (doorDepthFt / 2) * GS,
      y: oy + (cyFt - doorWidthFt / 2) * GS,
      width:  doorDepthFt * GS,
      height: doorWidthFt * GS,
      doorWidth: doorWidthFt,
      fill: '#f59e0b22', stroke: '#f59e0b', strokeWidth: 1.5,
    })
  }
  return out
}

/** The staging strip's dashed boundary and its label. */
export function stagingObjects(brief, ox, oy) {
  const { widthFt, speedBayFt = 60 } = brief
  if (!(speedBayFt > 0)) return []

  const xPx = ox + speedBayFt * GS
  /* Sized in FEET, not px. A whole building is viewed at 2–10% zoom, so
     anything specified in raw px — a 2px rule, a 30px glyph — renders
     sub-pixel and simply is not there. Five feet of cap height reads at every
     zoom the building itself is legible at. */
  const labelFt = Math.max(3, Math.min(widthFt * 0.05, 8))
  const labelFs = labelFt * GS
  const ruleFt  = 0.25

  return [
    {
      /* No `label` — the canvas paints an object's label onto the drawing, and
         a rule captioned "Staging boundary" next to a STAGING sign is noise. */
      type: 'line',
      x1: xPx, y1: oy, x2: xPx, y2: oy + widthFt * GS,
      x: xPx, y: oy, width: 0, height: widthFt * GS,
      stroke: '#9A968C', strokeWidth: ruleFt * GS,
      strokeDasharray: `${2 * GS} ${1.2 * GS}`,
      noFill: true,
    },
    {
      type: 'text', text: 'STAGING',
      x: ox + (speedBayFt / 2) * GS,
      y: oy + (widthFt / 2) * GS,
      width: widthFt * GS * 0.6, height: labelFs * 1.4,
      fontSize: labelFs, fontFamily: 'JetBrains Mono',
      fill: '#6B675F', align: 'center',
      /* Reads up the strip, as on the sizing sheet. */
      rotation: -90,
      letterSpacing: labelFs * 0.18,
    },
  ]
}

/** Every non-rack object the brief implies, in placement order. */
export function generateFixtures(brief, ox, oy) {
  const grid = columnGridObject(brief, ox, oy)
  return [
    ...stagingObjects(brief, ox, oy),
    ...dockDoorObjects(brief, ox, oy),
    ...(grid ? [grid] : []),
  ]
}
