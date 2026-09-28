// render/labelSize.js — labels are DRAWING-size, like CAD text: a fixed size
// in feet/inches that scales with the racks when you zoom, never resized per
// zoom. The "Label size" setting picks the text height of an aisle label
// (the reference label); every other label, arrow, pill, X mark, warning and
// upright flag keeps its proportion to it.
//
// The label designs were written as screen sizes over the view zoom
// (`fontSize = 10 / zoom` ...). Feeding them `labelScale(...)` in place of the
// view zoom turns every one of those numbers into a fixed world size: the
// reference font comes out exactly the chosen height, and nothing depends on
// the view any more. Pure.

/** Text height of the reference (aisle) label, inches. */
export const LABEL_SIZES = { small: 12, medium: 24, large: 36 }
export const DEFAULT_LABEL_SIZE = 'medium'
/** The reference label's design font, in the old screen px. */
export const REF_FONT_PX = 10

/** The "zoom" to size labels by, for a Label size: 1 / labelScale is world px
 *  per design px, so REF_FONT_PX / labelScale = the chosen text height. */
export function labelScale(size = DEFAULT_LABEL_SIZE, gridSize = 40) {
  const inches = LABEL_SIZES[size] ?? LABEL_SIZES[DEFAULT_LABEL_SIZE]
  return REF_FONT_PX / ((inches / 12) * gridSize)
}
