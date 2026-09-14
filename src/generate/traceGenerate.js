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
// ─────────────────────────────────────────────────────────────────────────────

import { useCanvasStore } from '../store/useCanvasStore'
import { getLayoutCapacity } from '../utils/capacity'
import { sizingSheetLayout, generateFixtures } from './sizingLayout'
import { DEFAULT_RULES } from '../rules/defaults'

const GS      = 40   // px per foot — v16b convention (store.gridSize)
const FLUE_IN = 6    // back-to-back flue gap for double rows

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
  const beams   = Array.from({ length: Math.max(1, p.bays | 0) }, () => beamIn)

  const totalIn  = upIn * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
  const width    = (totalIn / 12) * GS
  const isDouble = p.type === 'rack_double_row'
  const heightIn = isDouble ? (2 * depthIn + FLUE_IN) : depthIn

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
    palletWIn:    p.palletWIn ?? 48,
    palletDIn:    p.palletDIn ?? 40,
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
  return BEAM_TYPES.has(p.type) ? beamRackObject(p) : laneRackObject(p)
}

// ── Public entry the UI calls. Draws the building, fills it, returns capacity. ──
export function generateAndPlace(brief, generateLayout = sizingSheetLayout, rules = DEFAULT_RULES) {
  const queue = buildQueue(brief, generateLayout, rules)
  const store = useCanvasStore.getState()
  queue.forEach(o => store.addObject(o))
  return getLayoutCapacity(useCanvasStore.getState().objects, rules).total
}

/* Draws the building, then returns every object to place inside it, already
   offset into the building's world position. Shared by the sync and batched
   entries so the two can never drift apart. */
function buildQueue(brief, generateLayout, rules = DEFAULT_RULES) {
  const store = useCanvasStore.getState()

  // 1) Draw the building outline via the store's own floor-plan placer.
  //    It centres the box at world origin and fits the view.
  store.placeFpObject({ type: 'fp_rect', widthFt: brief.lengthFt, heightFt: brief.widthFt })

  // 2) The building we just placed is the selected object — read its origin.
  const after = useCanvasStore.getState()
  const fp = after.objects.find(o => o.id === after.selectedIds[0])
  const ox = fp ? fp.x : 0
  const oy = fp ? fp.y : 0

  // 3) Racks through the ONE factory, then the fixtures the brief implies.
  const racks = generateLayout(brief, rules).map(p => {
    const o = placementToObject(p)
    o.x += ox
    o.y += oy
    return o
  })
  return parentGenerated([...racks, ...generateFixtures(brief, ox, oy)], fp?.id)
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

   Returns the same derived capacity the sync entry does. */
export async function generateAndPlaceBatched(
  brief,
  { generateLayout = sizingSheetLayout, batch = 10, onProgress, rules = DEFAULT_RULES } = {},
) {
  const queue = buildQueue(brief, generateLayout, rules)
  onProgress?.(0)
  await nextFrame()

  for (let i = 0; i < queue.length; i += batch) {
    const store = useCanvasStore.getState()
    for (const o of queue.slice(i, i + batch)) store.addObject(o)
    onProgress?.(Math.min(1, (i + batch) / queue.length))
    await nextFrame()
  }

  onProgress?.(1)
  return getLayoutCapacity(useCanvasStore.getState().objects, rules).total
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
      bays, beamIn, depthIn, levels, palletWIn: 48, angle: 0,
    })
  }
  return placements
}
