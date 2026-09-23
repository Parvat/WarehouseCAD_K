// traceGenerate.js
// ─────────────────────────────────────────────────────────────────────────────
// Trace CAD — generate a starting rack layout inside a building.
//
//   generateLayout(brief) → placements[]   (world-FEET, engine-agnostic)
//        → placementToObject(p)            (v16b object shape)
//        → addObject(...)                  (the ONE factory)
//   capacity is READ back via getLayoutCapacity — never computed here.
//
// Phase 1: generateLayout = stubGenerateLayout (a sensible fill).
// Phase 2: swap in the real rack-engine — placementToObject never changes.
//
// brief.orientation: 'horizontal' | 'vertical' picks one, unchanged since
// GENERATOR_SPEC_V10. 'auto' (BUG 47) runs BOTH through pickOrientation and
// places whichever scores more pallet capacity — the manual pick still
// costs exactly one generateLayout call either way.
// ─────────────────────────────────────────────────────────────────────────────

import { nanoid } from 'nanoid'
import { useCanvasStore } from '../store/useCanvasStore'
import { getLayoutCapacity } from '../utils/capacity'
import { sizingSheetLayout, generateFixtures } from './sizingLayout'
import { DEFAULT_RULES } from '../rules/defaults'
import { rackFootprint, groupBySegment } from './columnCheck'

const GS      = 40   // px per foot — v16b convention (store.gridSize)
const FLUE_IN = 9    // back-to-back flue gap for double rows

// Storage/racking identity colour (matches warehouseObjects category "storage")
const RACK_COLOR = '#22c55e'
const LABELS = {
  rack_row:           'Rack Row',
  rack_double_row:    'Double Row',
  rack_drive_in:      'Drive-In Rack',
  rack_drive_through: 'Drive-Through Rack',
  rack_pushback:      'Push-Back Rack',
  rack_pallet_flow:   'Pallet-Flow Rack',
}

const BEAM_TYPES = new Set(['rack_row', 'rack_double_row'])

// Common fields every placed object carries (so it renders + selects like a
// hand-placed one from the library).
function baseFields(type) {
  return {
    fill:        RACK_COLOR + '22',
    stroke:      RACK_COLOR,
    strokeWidth: 1.5,
    label:       LABELS[type] || 'Rack',
  }
}

// ── Beam racks: width DERIVED from beams, exactly as RackRowPanelCore.addBay ──
function beamRackObject(p) {
  const upIn    = p.uprightWidthIn ?? 3
  const beamIn  = p.beamIn  ?? 96
  const depthIn = p.depthIn ?? 42
  const flueIn  = p.flueIn  ?? FLUE_IN
  const beams   = Array.from({ length: Math.max(1, p.bays | 0) }, () => beamIn)

  const totalIn  = upIn * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
  const width    = (totalIn / 12) * GS
  const isDouble = p.type === 'rack_double_row'
  const heightIn = isDouble ? (2 * depthIn + flueIn) : depthIn

  return {
    ...baseFields(p.type),
    type:         p.type,
    x:            p.xFt * GS,
    y:            p.yFt * GS,
    width,
    height:       (heightIn / 12) * GS,
    beams,                          // bays live here — capacity.js reads this
    activeBayIdx: null,
    uprightWidth: upIn,
    /* depthIn/flueSpaceIn: a double row's own front/flue/back split, in
       inches, not re-derivable from height alone (2*depthIn+flueIn has two
       unknowns). columnCheck.js needs this to tell a column seated in the
       flue (free) apart from one landing in a pick face (costs a position) —
       COLUMN_GENERATOR_SPEC_V6.md Step 2. */
    depthIn,
    flueSpaceIn:  isDouble ? flueIn : 0,
    /* flueBaseIn — the UN-widened base flue this placement's own band
       started from (sizingSheetLayout's own `flueIn`, passed through
       separately from the possibly-column-widened `p.flueIn` above), so a
       live drag (useCanvasInteraction.js's beginDrag, canvas2's live-flue
       feature) knows what to shrink back to once no column is left in the
       gap — falls back to the widened flueIn itself only for a caller
       that predates this field entirely (a direct placementToObject call
       with no flueBaseIn of its own), not for anything sizingSheetLayout
       itself ever produces now. */
    flueBaseIn:   isDouble ? (p.flueBaseIn ?? flueIn) : 0,
    palletWIn:    p.palletWIn ?? 40,
    palletDIn:    p.palletDIn ?? 48,
    levels:       p.levels ?? 1,
    rotation:     p.angle ?? 0,
  }
}

// ── Lane racks: geometry variant-driven, engine hands width/height ──
function laneRackObject(p) {
  return {
    ...baseFields(p.type),
    type:         p.type,
    x:            p.xFt * GS,
    y:            p.yFt * GS,
    width:        (p.widthFt  ?? 8)  * GS,
    height:       (p.heightFt ?? 20) * GS,
    lanes:        p.lanes ?? 2,
    palletDeep:   p.palletDeep ?? 5,
    palletWIn:    p.palletWIn ?? 40,
    palletDIn:    p.palletDIn ?? 48,
    uprightWidth: p.uprightWidthIn ?? 4,
    rotation:     p.angle ?? 0,
  }
}

export function placementToObject(p) {
  const o = BEAM_TYPES.has(p.type) ? beamRackObject(p) : laneRackObject(p)
  /* Pre-assigned, not left for addObject's own nanoid(): aisleObjectsForRacks
     needs a real id to point row1Id/row2Id at BEFORE these racks are pushed
     into the store (addObject respects an id that's already set). */
  o.id = nanoid()
  return o
}

/** One `aisle` object (the same type/shape RightPanel's own "measure aisle"
 *  button creates via createAisle) per gap between two adjacent rows in the
 *  same run — so a generated layout's aisle widths render with the SAME
 *  live, geometry-derived label every hand-placed aisle already gets
 *  (DimensionLabels.jsx's AisleLabel), instead of a second, separate
 *  display path.
 *
 *  Rotation-aware (BUG 45) via the SAME `rackFootprint`/`groupBySegment`
 *  columnCheck.js already built for BUG 41's vertical orientation — a
 *  naive "group by raw stored x, sort+pair by raw stored y" (the pre-BUG-45
 *  approach) is only correct for horizontal racks, where x IS a run's own
 *  position and y IS a band's own position with no rotation involved. For a
 *  90°-rotated vertical rack, stored x/y/width/height are still the
 *  PRE-rotation local box (traceGenerate never changes how it builds one,
 *  only how it's placed and spun) — raw x is actually per-BAND there, not
 *  per-run, so grouping by it paired the two SEGMENT-halves of the SAME row
 *  (a real but irrelevant cross-aisle gap, reported as if it were the
 *  pick aisle) instead of adjacent bands, and even a correct pairing would
 *  still have measured the wrong rectangle, since raw width/height ignore
 *  the 90° swap. `rackFootprint` converts to the true rotated world box
 *  first; `groupBySegment` finds real same-run neighbors by cross-axis
 *  OVERLAP in that true box, which holds for either orientation without
 *  needing to know which one produced these racks. */
export function aisleObjectsForRacks(racks) {
  const beams = racks.filter(r => BEAM_TYPES.has(r.type))
  const aisles = []
  for (const run of groupBySegment(beams)) {
    if (run.length < 2) continue
    const stacked = rackFootprint(run[0]).rotated   // true: bands run along X. false: along Y.
    const sorted = [...run].sort((a, b) => {
      const fa = rackFootprint(a), fb = rackFootprint(b)
      return stacked ? fa.x - fb.x : fa.y - fb.y
    })
    for (let i = 0; i < sorted.length - 1; i++) {
      aisles.push({ type: 'aisle', row1Id: sorted[i].id, row2Id: sorted[i + 1].id, label: '' })
    }
  }
  return aisles
}

/** Auto orientation (BUG 47): runs `generateLayout` once per orientation,
 *  compares total pallet capacity, and returns whichever produced more —
 *  ties keep horizontal, the long-standing default and the simpler layout
 *  when it's a toss-up. Pure: doesn't touch the store or place anything,
 *  so both candidate layouts can be scored without the loser ever being
 *  drawn. `getLayoutCapacity` needs real v16b objects (beams/levels/
 *  palletWIn), not raw placements, so each candidate is run through
 *  `placementToObject` the same way `buildQueue` itself does before being
 *  scored — capacity is read back the SAME way the UI's own result number
 *  is, never a separate/parallel count. Both raw totals are returned
 *  alongside the winner so the caller can report the comparison, not just
 *  the pick. */
export function pickOrientation(brief, generateLayout, rules = DEFAULT_RULES) {
  const runFor = (orientation) => {
    const placements = generateLayout({ ...brief, orientation }, rules)
    const total = getLayoutCapacity(placements.map(placementToObject), rules).total
    return { orientation, placements, total }
  }
  const horizontal = runFor('horizontal')
  const vertical    = runFor('vertical')
  const winner = vertical.total > horizontal.total ? vertical : horizontal
  return {
    orientation:     winner.orientation,
    placements:      winner.placements,
    horizontalTotal: horizontal.total,
    verticalTotal:   vertical.total,
  }
}

// ── Public entry the UI calls. Draws the building, fills it, returns capacity. ──
export function generateAndPlace(brief, generateLayout = sizingSheetLayout, rules = DEFAULT_RULES) {
  const { queue, orientation, horizontalTotal, verticalTotal } = buildQueue(brief, generateLayout, rules)
  const store = useCanvasStore.getState()
  queue.forEach(o => store.addObject(o))
  const total = getLayoutCapacity(useCanvasStore.getState().objects, rules).total
  return { total, orientation, horizontalTotal, verticalTotal }
}

/* Draws the building, then returns every object to place inside it, already
   offset into the building's world position. Shared by the sync and batched
   entries so the two can never drift apart.
 *
 *  `brief.orientation === 'auto'` routes through `pickOrientation` instead
 *  of calling `generateLayout` directly — the manual Horizontal/Vertical
 *  toggle still calls it exactly once, unchanged, so a manual pick costs
 *  no extra work and can't be second-guessed by the auto comparison. Also
 *  returns which orientation was actually used (echoed for a manual pick,
 *  the winner for auto) and, in auto mode, both candidates' totals — the
 *  UI needs these to report the comparison, not just place the winner. */
function buildQueue(brief, generateLayout, rules = DEFAULT_RULES) {
  const store = useCanvasStore.getState()

  /* BUG 65 — remove whatever the LAST Generate click placed before placing
     this one, so a second click replaces the layout instead of stacking an
     exact duplicate on top of it (placeFpObject's own origin is
     deterministic from lengthFt/widthFt alone — an unchanged building size
     regenerates at the identical world position every time). Only ever
     touches a building this SAME generator placed (tracked by id, set at
     the end of this function) — a hand-drawn floor plan is never at risk. */
  store.clearGeneratedLayout()

  // 1) Draw the building outline via the store's own floor-plan placer.
  //    It centres the box at world origin and fits the view.
  store.placeFpObject({ type: 'fp_rect', widthFt: brief.lengthFt, heightFt: brief.widthFt })

  // 2) The building we just placed is the selected object — read its origin.
  const after = useCanvasStore.getState()
  const fp = after.objects.find(o => o.id === after.selectedIds[0])
  const ox = fp ? fp.x : 0
  const oy = fp ? fp.y : 0
  if (fp) after.markGenerated(fp.id)

  // 3) Racks through the ONE factory, then the fixtures the brief implies.
  const auto = brief.orientation === 'auto'
  const pick = auto ? pickOrientation(brief, generateLayout, rules) : null
  const rawPlacements = auto ? pick.placements : generateLayout(brief, rules)
  const racks = rawPlacements.map(p => {
    const o = placementToObject(p)
    o.x += ox
    o.y += oy
    return o
  })
  const queue = parentGenerated(
    [...racks, ...aisleObjectsForRacks(racks), ...generateFixtures(brief, ox, oy)],
    fp?.id,
  )
  return {
    queue,
    orientation:     auto ? pick.orientation : (brief.orientation ?? 'horizontal'),
    horizontalTotal: pick?.horizontalTotal ?? null,
    verticalTotal:   pick?.verticalTotal ?? null,
  }
}

/* Adopt every generated object into the building it was drawn inside.
 *
 *  This is not cosmetic bookkeeping. The store's moveObjects cascades a move
 *  from a floor plan to `parentId` children, and CanvasObjectCore offsets those
 *  same children during the live drag — so an object with no parentId is not
 *  part of the building as far as either is concerned. Without this the
 *  building slides out from under its own racks the moment you drag it, which
 *  is exactly what happened: generation was the one path that placed objects
 *  without the parent stamp that the object library, the drawing tools and the
 *  post-move re-parent in CanvasArea all apply.
 *
 *  No containment test is needed here the way CanvasArea needs one: buildQueue
 *  offsets every object from the building's own origin, so membership is true
 *  by construction rather than by geometry.
 *
 *  The column grid is adopted too, unlike FloatingToolbar and
 *  WarehouseObjectPicker, which both skip it when placing one by hand. That
 *  exclusion does not survive contact with the rest of the app: CanvasArea
 *  re-parents every non-fp object after a move, and a column grid is
 *  selectable, so it adopts the building the first time anyone nudges it.
 *  Leaving generation as the one path that yields an unparented grid would
 *  make an object's parentage depend on whether it had ever been dragged.
 *  The columns are the building's own structure, and checkColumns measures
 *  racks against them — a building that moved without its columns would
 *  silently invalidate every check it feeds.
 */
export function parentGenerated(objects, fpId) {
  if (!fpId) return objects
  return objects.map(o => ({ ...o, parentId: fpId }))
}

const nextFrame = () =>
  new Promise(resolve => requestAnimationFrame(() => resolve()))

/* Batched placement. Every addObject re-renders the canvas AND pushes a
   history snapshot (which JSON-stringifies the whole scene), so dropping a
   full layout in one synchronous loop locks the main thread for as long as it
   takes — the click just feels dead. Yielding to a frame between batches lets
   the spinner paint and keeps the window responsive while the layout fills in.

   Returns the same shape the sync entry does. */
export async function generateAndPlaceBatched(
  brief,
  { generateLayout = sizingSheetLayout, batch = 10, onProgress, rules = DEFAULT_RULES } = {},
) {
  const { queue, orientation, horizontalTotal, verticalTotal } = buildQueue(brief, generateLayout, rules)
  onProgress?.(0)
  await nextFrame()

  for (let i = 0; i < queue.length; i += batch) {
    const store = useCanvasStore.getState()
    for (const o of queue.slice(i, i + batch)) store.addObject(o)
    onProgress?.(Math.min(1, (i + batch) / queue.length))
    await nextFrame()
  }

  onProgress?.(1)
  const total = getLayoutCapacity(useCanvasStore.getState().objects, rules).total
  return { total, orientation, horizontalTotal, verticalTotal }
}

// ═══ PHASE-1 STUB ════════════════════════════════════════════════════════════
// Sensible fill only — a "starting layout," never a "maximum." Does not search
// orientation/aisle/cross-aisle; that's the Phase-2 rack-engine.
export function stubGenerateLayout(brief) {
  const {
    lengthFt, widthFt,
    rackType    = 'rack_double_row',
    beamIn      = 96,
    depthIn     = 42,
    levels      = 4,
    aisleFt     = 11,
    wallClearFt = 4,
  } = brief

  const isDouble   = rackType === 'rack_double_row'
  const rowDepthFt = (isDouble ? (2 * depthIn + FLUE_IN) : depthIn) / 12
  const pitchFt    = rowDepthFt + aisleFt

  const upIn        = 3
  const usableLenIn = (lengthFt - 2 * wallClearFt) * 12
  const bays        = Math.max(1, Math.floor((usableLenIn - upIn) / (beamIn + upIn)))

  const placements = []
  for (let yFt = wallClearFt; yFt + rowDepthFt <= widthFt - wallClearFt; yFt += pitchFt) {
    placements.push({
      type: rackType, xFt: wallClearFt, yFt,
      bays, beamIn, depthIn, levels, palletWIn: 40, angle: 0,
    })
  }
  return placements
}
