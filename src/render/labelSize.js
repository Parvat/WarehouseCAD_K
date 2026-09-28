// render/labelSize.js — labels are DRAWING-size, like CAD text: a fixed size
// in feet/inches that scales with the racks when you zoom, never resized per
// zoom. The "Label size" setting picks the text height of an aisle label
// (the reference label); every other label, arrow, pill, X mark, warning,
// upright flag and rack travel arrow keeps its proportion to it.
//
// The label designs were written as screen sizes over the view zoom
// (`fontSize = 10 / zoom` ...). Feeding them `labelScale(...)` in place of the
// view zoom turns every one of those numbers into a fixed world size: the
// reference font comes out exactly the chosen height, and nothing depends on
// the view any more. Pure.

/** Text height of the reference (aisle) label, inches. */
export const LABEL_SIZES = { small: 12, medium: 24, large: 36, xlarge: 48 }
export const LABEL_SIZE_NAMES = { small: 'Small', medium: 'Medium', large: 'Large', xlarge: 'Extra large' }
export const DEFAULT_LABEL_SIZE = 'medium'
/** The reference label's design font, in the old screen px. */
export const REF_FONT_PX = 10
/** The smallest text any printed label has, relative to the reference (a
 *  column clearance label: 9 px against the aisle label's 10). */
export const SMALLEST_TEXT_RATIO = 0.9
/** A custom label size, inches: sane bounds. */
export const MIN_LABEL_IN = 3, MAX_LABEL_IN = 240

/** Inches of reference text for a Label size key, or a number of inches. */
export function labelInches(size = DEFAULT_LABEL_SIZE) {
  if (typeof size === 'number' && size > 0) return size
  return LABEL_SIZES[size] ?? LABEL_SIZES[DEFAULT_LABEL_SIZE]
}

/** The "zoom" to size labels by: 1 / labelScale is world px per design px, so
 *  REF_FONT_PX / labelScale = the chosen text height. `size` is a Label size
 *  key or a number of inches. */
export function labelScale(size = DEFAULT_LABEL_SIZE, gridSize = 40) {
  return REF_FONT_PX / ((labelInches(size) / 12) * gridSize)
}

/** The PDF's automatic label size: the reference text height (inches, whole)
 *  at which the SMALLEST printed label is at least `minMm` tall on paper,
 *  given the sheet's scale (paper mm per world px). */
export function autoPdfLabelInches(mmPerWorldPx, gridSize = 40, minMm = 2.5) {
  const refPx = minMm / SMALLEST_TEXT_RATIO / mmPerWorldPx
  return Math.ceil((refPx / gridSize) * 12)
}

/** An aisle label's scale: the aisle's own label size (labelSizeIn, inches)
 *  when it has one, else the global size. The canvas, the aisle-label pick
 *  and the PDF all use this. */
export function aisleLabelScale(aisle, globalSize = DEFAULT_LABEL_SIZE, gridSize = 40) {
  return labelScale(aisle && aisle.labelSizeIn > 0 ? aisle.labelSizeIn : globalSize, gridSize)
}
