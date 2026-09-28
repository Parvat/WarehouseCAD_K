// render/bayGeom.js — a rack's bay / pallet-position rects in its own local
// (unrotated) frame. Pure (no React / Konva), so the canvas, the label ops
// (render/labelOps.js) and the PDF export all read the same geometry.
// Moved here from canvas2/shapes.jsx, which re-exports both.
import { uprightXs, cantileverGeom } from './rackOps'
import { positionFootprintIn } from '../utils/capacity'

/** Rect(s) for ONE bay/tower index, in the same local world coords Ops
 *  already draws in — the Group's own spin() transform rotates them along
 *  with everything else, so this never re-derives rotation itself.
 *
 *  Geometry comes from rackOps.js's OWN uprightXs/cantileverGeom — the exact
 *  functions rackRowOps/rackDoubleRowOps/rackCantileverOps use to draw the
 *  bays/towers in the first place — rather than re-deriving bay positions a
 *  second time. hitTestBay (canvas2/hitTest.js) is a THIRD place this same
 *  geometry could drift from; it stays un-rotated-click-tested against the
 *  object's raw x/y/width/height, which is exactly the local space these
 *  rects are already in, so a hit and its highlight can never disagree.
 *
 *  Shared by activeBayRects (the single blue "currently active" outline)
 *  and multiBaySelectionRects (the amber cross-row marquee selection,
 *  BUG 25) below, so a bay's highlight geometry is computed in exactly one
 *  place regardless of which selection put it there. */
export function bayRectForIndex(obj, gridSize, i) {
  if (i == null) return []
  if (obj.type === 'rack_row' || obj.type === 'rack_double_row') {
    const { xs, upW, beams } = uprightXs(obj, gridSize)
    if (i < 0 || i >= beams.length) return []
    const bx = xs[i] + upW
    const bw = (beams[i] / 12) * gridSize

    if (obj.type === 'rack_row') {
      return [{ x: bx, y: obj.y, width: bw, height: obj.height }]
    }
    // Double row: the SAME bay column on both bands, flue skipped between.
    const flueH = ((obj.flueSpaceIn || 9) / 12) * gridSize
    const rowH = Math.max(0, (obj.height - flueH) / 2)
    if (rowH <= 0) return [{ x: bx, y: obj.y, width: bw, height: obj.height }]
    return [
      { x: bx, y: obj.y, width: bw, height: rowH },
      { x: bx, y: obj.y + rowH + flueH, width: bw, height: rowH },
    ]
  }

  if (obj.type === 'rack_cantilever') {
    const { doubleSided, towers, armT, spineH, spineY, cxs } = cantileverGeom(obj, gridSize)
    if (i < 0 || i >= cxs.length) return []
    const armPx = ((towers[i] || 36) / 12) * gridSize
    return [{
      x: cxs[i] - armT / 2,
      y: doubleSided ? spineY - armPx : spineY,
      width: armT,
      height: doubleSided ? armPx * 2 + spineH : armPx + spineH,
    }]
  }

  return []
}

/** ONE pallet position's own rect within a bay/face — a sub-rect of
 *  `bayRectForIndex`'s own face rect, narrowed to that position's footprint
 *  from utils/capacity.js's `positionFootprintIn` (the SAME footprint
 *  columnCheck.js's `blockedPositionIndices` tests against) rather than the
 *  whole bay. Used for a blocked-position mark — a column blocks one pick
 *  SPOT, not the entire bay it happens to sit in. `faceIndex` selects which
 *  of `bayRectForIndex`'s returned rects (0/1 for a double row, always 0
 *  for a single) to slice from. */
export function positionRectForIndex(obj, gridSize, bayIndex, positionIndex, faceIndex = 0) {
  const faceRect = bayRectForIndex(obj, gridSize, bayIndex)[faceIndex]
  if (!faceRect) return null
  const palletFaceIn = obj.palletWIn || 40
  const beamIn = (faceRect.width / gridSize) * 12
  const fp = positionFootprintIn(beamIn, palletFaceIn, positionIndex)
  if (!fp) return null
  const toPx = (inches) => (inches / 12) * gridSize
  return { x: faceRect.x + toPx(fp.startIn), y: faceRect.y, width: toPx(fp.endIn - fp.startIn), height: faceRect.height }
}
