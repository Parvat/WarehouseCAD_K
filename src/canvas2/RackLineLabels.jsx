// RackLineLabels.jsx — the rack line numbers on the plan (utils/rackLines.js: R1, R2 …; the BOM's rows, the same
// computation): ONE label per rack line, at its start end only — the left end of a line running across, the top end of
// one running up and down; a back-to-back pair's two lines one label, "R2–R3". Drawn like the aisle width labels: a
// size in feet (the Label size — render/labelSize.js), drawings' words style (Plus Jakarta Sans, #767C74). A label never
// overlaps another or a dimension label (the aisle and cross-aisle width labels): it shifts along the line's end, else
// it is left out; all are hidden when they would draw under 8 px on screen. Pure paint (never listens); hidden with the
// Racking layer, and by the View card's Row numbers (on by default; shown anyway while the BOM's full view is open —
// studio/viewPrefs.js). Each label's Konva name is `rack-line-label`.

import { useMemo } from 'react'
import { Group, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackLinesNow } from '../utils/rackLines'
import { layerShown } from '../utils/layers'
import { useViewPrefs } from '../studio/viewPrefs'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { aisleLabelBoxes } from '../render/labelOps'

const WORDS = '#767C74', FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
/** The label's size in drawing units: the aisle labels' 10 at the Label size; the smallest it may draw on screen. */
export const ROW_LABEL_PX = 10, ROW_LABEL_MIN_SCREEN_PX = 8
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The labels to draw (world px): [{ key, text, x, y, w, h, align }] — one per line or pair, at its start, off each other
 *  and off `avoid` (boxes); `fs`: the font size (world px). */
export function rowLabelPlaces(lines, fs, avoid = []) {
  const groups = new Map()
  for (const l of lines) { const k = l.ids.join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l) }
  const h = fs * 1.25, gap = fs * 0.5, placed = [], out = []
  for (const [k, ls] of groups) {
    const nos = ls.map(l => l.no).sort((a, b) => a - b), l0 = ls[0]
    const text = nos.length > 1 ? `R${nos[0]}–R${nos[nos.length - 1]}` : `R${nos[0]}`
    const w = text.length * fs * 0.62 + fs * 0.3
    const s0 = Math.min(...ls.map(l => l.s0)), s1 = Math.max(...ls.map(l => l.s1)), c = (s0 + s1) / 2, half = (s1 - s0) / 2
    // along the line's end: the middle, then stepping either way while the label still sits beside the end
    const steps = [0]
    for (let d = h; d <= half + h / 2; d += h) steps.push(d, -d)
    let at = null
    for (const d of steps) {
      const b = l0.vert ? { x: c + d - w / 2, y: l0.r0 - gap - h, w, h } : { x: l0.r0 - gap - w, y: c + d - h / 2, w, h }
      if (!placed.some(p => meets(p, b)) && !avoid.some(p => meets(p, b))) { at = b; break }
    }
    if (!at) continue                                                  // no room: left out
    placed.push(at)
    out.push({ key: k, text, ...at, align: l0.vert ? 'center' : 'right' })
  }
  return out
}

export function RackLineLabels() {
  const { objects, gs, zoom, layers } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40, zoom: s.zoom || 1, layers: s.layers })))
  const shown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  const lz = labelScale(labelSize, gs), fs = ROW_LABEL_PX / lz
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  const avoid = useMemo(() => (shown && lines.length ? aisleLabelBoxes(objects, gs, labelSize) : []), [shown, lines.length, objects, gs, labelSize])
  const places = useMemo(() => rowLabelPlaces(lines, fs, avoid), [lines, fs, avoid])
  if (!shown || !lines.length || !layerShown(layers, 'racking') || fs * zoom < ROW_LABEL_MIN_SCREEN_PX) return null
  return (
    <Group name="rack-line-labels" listening={false}>
      {places.map(p => <Text key={p.key} name="rack-line-label" text={p.text} x={p.x} y={p.y} width={p.w} height={p.h} align={p.align} verticalAlign="middle"
        fontSize={fs} fontFamily={FONT} fill={WORDS} listening={false} perfectDrawEnabled={false} />)}
    </Group>
  )
}
