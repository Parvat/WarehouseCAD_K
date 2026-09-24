// canvas2/liveFlue.js
// ─────────────────────────────────────────────────────────────────────────────
// Live auto-flue — a rack_double_row dragged over a column widens its flue in
// real time to seat it, and shrinks back the moment nothing is in the gap.
//
// Pure geometry, no React/Konva/store — mirrors smartGuides.js's own reason
// for existing as a standalone module: the interaction hook's mousemove
// (which decides whether/how to widen) and any future caller (a test, an
// overlay) share ONE computation instead of two that could drift.
//
// The rule itself — flueIn = max(the row's own configured flue, the
// column's size) — is sizingLayout.js's flueInForColumn, reused as a
// FORMULA rather than a function call: that function's owner,
// seatColumnInFlue, is written against the generator's 1D band-walk (a
// `minStart`/aisle-boundary parameter a free-form 2D drag has no equivalent
// of), so it isn't callable as-is here.
// ─────────────────────────────────────────────────────────────────────────────

import { expandColumnGrid } from '../generate/columnCheck'

/** The drag-start base for a rack_double_row: `{ flueSpaceIn, height,
 *  width, rotation }` with flueSpaceIn = the GENUINE base flue (flueBaseIn
 *  first — never the live, possibly-widened flueSpaceIn when a base is
 *  recorded) and height rebuilt from the fixed row depth plus that base,
 *  since the stored height only pairs with the live flue. See
 *  useCanvasInteraction.js's beginDrag for the two bugs this exists to
 *  prevent. */
export function resolveFlueBase(grabbed, gridSize) {
  const liveFlueHPx = ((grabbed.flueSpaceIn || 9) / 12) * gridSize
  const rowHPx = Math.max(0, (grabbed.height - liveFlueHPx) / 2)
  const baseFlueIn = grabbed.flueBaseIn ?? grabbed.flueSpaceIn ?? 9
  const baseHeight = rowHPx * 2 + (baseFlueIn / 12) * gridSize
  return { flueSpaceIn: baseFlueIn, height: baseHeight, width: grabbed.width, rotation: grabbed.rotation || 0 }
}

/** Fields a finished live-flue drag commits on top of `liveObj` (the object
 *  as the last drag frame left it): flueBaseIn locked to the drag's OWN
 *  resolved base, never to liveObj.flueSpaceIn, which the drag may have
 *  left widened. */
export function flueCommitFields(liveObj, flueBase) {
  return { ...liveObj, flueBaseIn: flueBase.flueSpaceIn }
}

/** `flueBase` — the object's geometry BEFORE this drag touched it:
 *  `{ flueSpaceIn, height, width, rotation }`. Re-grounding every call from
 *  this same frozen reference (rather than the object's own possibly
 *  already-widened current state) is what keeps the row depth constant for
 *  the whole gesture and makes "enters its flue zone" a fixed target instead
 *  of a moving one.
 *
 *  `centerX`/`centerY` — the object's LIVE centre this frame (world px,
 *  already including the drag delta).
 *
 *  `columnGrids` — every `column_grid` object in the scene.
 *
 *  Returns `{ targetFlueIn, targetHeight, x, y }` — the flue width (max of
 *  the base and whichever overlapping column is largest, or the base alone
 *  if none overlap) and the resulting top-left position for a box centred
 *  at (centerX, centerY) at that height, symmetric growth around the centre
 *  so both rows visibly spread apart evenly rather than one jumping while
 *  the other stays put. */
export function computeLiveFlue(flueBase, centerX, centerY, columnGrids, gridSize) {
  const baseFlueHPx = (flueBase.flueSpaceIn / 12) * gridSize
  const rowHPx = Math.max(0, (flueBase.height - baseFlueHPx) / 2)
  const halfW = flueBase.width / 2
  const halfFlue = baseFlueHPx / 2

  /* "Enters its flue zone" is checked against the BASE gap, not whatever the
   * gap currently is — the row depth (rowHPx) never changes during the
   * drag, only the width of the space between the rows does, so the base
   * gap is the one fixed, unambiguous "flue zone." World column centres are
   * inverse-rotated around the object's own centre into its local
   * (pre-rotation) frame, so a manually-rotated rack tests correctly too,
   * not just the 0/90/180/270° angles the generator itself ever produces. */
  const rad = -(flueBase.rotation || 0) * Math.PI / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)

  let bestColSizeIn = 0
  for (const cg of columnGrids) {
    const colSizeIn = cg.colSizeIn || 12
    for (const c of expandColumnGrid(cg, gridSize)) {
      const wdx = (c.x + c.w / 2) - centerX, wdy = (c.y + c.h / 2) - centerY
      const lx = wdx * cos - wdy * sin
      const ly = wdx * sin + wdy * cos
      const overlapsX = (lx + c.w / 2) > -halfW && (lx - c.w / 2) < halfW
      const overlapsY = (ly + c.h / 2) > -halfFlue && (ly - c.h / 2) < halfFlue
      if (overlapsX && overlapsY && colSizeIn > bestColSizeIn) bestColSizeIn = colSizeIn
    }
  }

  const targetFlueIn = bestColSizeIn > 0 ? Math.max(flueBase.flueSpaceIn, bestColSizeIn) : flueBase.flueSpaceIn
  const targetFlueHPx = (targetFlueIn / 12) * gridSize
  const targetHeight = rowHPx * 2 + targetFlueHPx

  return {
    targetFlueIn,
    targetHeight,
    x: centerX - flueBase.width / 2,
    y: centerY - targetHeight / 2,
  }
}
