// drawStyles.js — the last style used for each kind of drawing object (d1-polish): a new line, arrow, elbow arrow, block
// arrow, polyline, rectangle, circle or text starts with the style its kind was last given on the selection bar or the
// card (there is no Draw bar or Text bar — styling happens after drawing, the finished shape selected). Saved with the
// project (utils/saveLoad.js `drawStyles`), as the text sizes are.

import { create } from 'zustand'
import { TEXT_FONT_DEFAULT } from '../theme/tokens'

const INK = '#1F2321'
const LINE = { stroke: INK, strokeWidth: 2, dashed: false, corners: 'square' }
const FILL = { fill: null, noFill: true, fillStyle: 'tint' }
/** Each kind's style before any is used. A block arrow's `size`: its body width in inches (a plain size number). */
export const DEFAULT_STYLES = {
  line: { ...LINE, ends: 'none' },
  arrow: { ...LINE, ends: 'end' },
  elbow: { ...LINE, ends: 'end' },
  polyline: { ...LINE, ends: 'none', ...FILL, cornerFt: 1 },
  rect: { ...LINE, ...FILL, cornerFt: 1 },
  circle: { stroke: INK, strokeWidth: 2, dashed: false, ...FILL },
  block: { fill: '#E07B22', size: 48 },
  text: { textIn: 18, bold: false, italic: false, fill: INK, align: 'left', boxed: false, boxStroke: null, boxFill: null, fontFamily: TEXT_FONT_DEFAULT },
}
const KEYS = Object.fromEntries(Object.entries(DEFAULT_STYLES).map(([k, v]) => [k, Object.keys(v)]))

export const useDrawStyles = create(() => ({ styles: {} }))

/** The kind of a drawing object ('line' … 'text'), or null: a line with an arrowhead is an arrow. */
export function kindOfObj(o) {
  if (!o) return null
  if (o.type === 'text') return 'text'
  if (o.type === 'line') return o.ends && o.ends !== 'none' ? 'arrow' : 'line'
  if (o.type === 'elbow') return 'elbow'
  if (o.type === 'block_arrow') return 'block'
  if (o.type === 'polyline' || o.type === 'polygon') return 'polyline'
  if (o.type === 'rect') return 'rect'
  if (o.type === 'circle') return 'circle'
  return null
}
/** The style a new object of `kind` starts with: its last used, else the default. */
export const styleFor = (kind) => ({ ...(DEFAULT_STYLES[kind] || {}), ...(useDrawStyles.getState().styles[kind] || {}) })

/** Remember `o`'s style as its kind's last used (called when the selection bar or the card styles it). */
export function rememberStyle(o) {
  const kind = kindOfObj(o)
  if (!kind) return
  const keys = KEYS[kind], next = {}
  for (const k of keys) if (o[k] !== undefined) next[k] = o[k]
  if (kind === 'block' && !(o.size > 0) && o.bodyW > 0) next.size = Math.round((o.bodyW / 40) * 12 * 100) / 100
  const cur = useDrawStyles.getState().styles
  useDrawStyles.setState({ styles: { ...cur, [kind]: { ...(cur[kind] || {}), ...next } } })
}
/** Remember the style of the objects `ids` of `store` (after a change). */
export function rememberStylesOf(store, ids) {
  const objs = store.getState().objects
  for (const id of ids || []) { const o = objs.find(q => q.id === id); if (o) rememberStyle(o) }
}

/** For the project file: the styles used (only those set). */
export const getDrawStyles = () => useDrawStyles.getState().styles
/** From the project file (null: none — the defaults). */
export function loadDrawStyles(s) { useDrawStyles.setState({ styles: s && typeof s === 'object' ? s : {} }) }
