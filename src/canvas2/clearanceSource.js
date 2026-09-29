// clearanceSource.js — which column-clearance blocks (and the red "no clear
// aisle" warnings among them) to draw during a drag, and where. Pure.
//
// The aisle check reads only racks and columns. A drag that carries ALL of
// them — a building dragged with everything in it, or a selection that
// happens to hold every rack and the column grid — changes nothing the check
// measures, so its result is held and simply moved with the drag: no
// recompute, so the warnings cannot change from frame to frame. (Re-running
// the check on the shifted layout used to flip warnings on and off: the
// columns and rack faces land on slightly different floats every frame.)
// Any other drag re-runs the check's cheap aisle part on the previewed
// layout, because it really can change what the check sees.

import { aisleColumnBlocks } from '../generate/columnCheck'
import { layoutColumns } from '../generate/usableCapacity'
import { previewObjects } from './dragPreview'

const isRack = (o) => o && typeof o.type === 'string' && o.type.startsWith('rack_')
/** Everything the aisle check reads. */
const feedsCheck = (o) => isRack(o) || (o && o.type === 'column_grid')

/** Does a drag of `ids` carry every rack and every column grid? */
export function dragCarriesCheck(objects, ids) {
  return !!ids && objects.some(feedsCheck) && objects.every(o => !feedsCheck(o) || ids.has(o.id))
}

/** { blocks, cols, x, y }: the blocks and columns to draw, and the offset to
 *  draw them at. `aisleBlocks` / `columns` = the check's last full result. */
export function clearanceSource({ aisleBlocks, columns, objects, preview, gridSize = 40, profile, pickBothSides = false }) {
  const held = { blocks: aisleBlocks || [], cols: columns || [], x: 0, y: 0 }
  const { ids, dx = 0, dy = 0 } = preview || {}
  if (!ids || (!dx && !dy)) return held
  // the drag carries everything the check reads: the same result, moved
  if (dragCarriesCheck(objects || [], ids)) return { ...held, x: dx, y: dy }
  const objs = previewObjects(objects || [], preview)
  const cols = layoutColumns(objs, gridSize)
  const blocks = aisleColumnBlocks({ racks: objs.filter(isRack), columns: cols, profile, gridSize, pickBothSides }).aisleBlocks
  return { blocks, cols, x: 0, y: 0 }
}
