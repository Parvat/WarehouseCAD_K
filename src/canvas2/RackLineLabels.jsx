// RackLineLabels.jsx — the rack line numbers on the plan (utils/rackLines.js: R1, R2 …; the BOM's rows, the same
// computation): ONE label per rack line piece (fixes-x: a line cut by cross-aisles keeps one number — each piece is
// labelled with it), at the piece's start end only — the left end of a line running across, the top end of
// one running up and down. A back-to-back pair running across gets one label per line, each beside its own line (R16 by
// the top line, R17 by the bottom one); one running up and down keeps one label for both, "R2–R3", at its top. Drawn like the aisle width labels: a
// size in feet (the Label size — render/labelSize.js), drawings' words style (Plus Jakarta Sans, #767C74). A label never
// overlaps another or a dimension label (the aisle and cross-aisle width labels): it shifts along the line's end, else
// it is left out. Like the aisle labels they are drawing-size and always drawn, at any zoom (ui-polish-4 — was: hidden
// under 8 px on screen). Pure paint (never listens); hidden with the
// Racking layer, and by the View card's Row numbers (on by default; shown anyway while the Tally drawer or its Pop out is open —
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
import { useLiveObjects } from './live'
import { checkedNos } from '../studio/tally'

const WORDS = '#767C74', TICK = '#2E7D5B', FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
/** The label's size in drawing units: the aisle labels' 10 at the Label size. */
export const ROW_LABEL_PX = 10
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The labels to draw (world px): [{ key, text, x, y, w, h, align }] — one per line or pair, at its start, off each other
 *  and off `avoid` (boxes); `fs`: the font size (world px). */
export function rowLabelPlaces(lines, fs, avoid = []) {
  const groups = new Map()
  // a pair up and down: its two lines one label; across: each line its own (beside its own band)
  for (const l of lines) { const k = l.ids.join(',') + (l.vert ? '' : ':' + l.ws); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l) }
  const h = fs * 1.25, gap = fs * 0.5, placed = [], out = []
  for (const [k0, ls] of groups) for (const [pi, pc] of (ls[0].pieces || [{ r0: ls[0].r0 }]).entries()) {
    const k = pi ? k0 + '#' + pi : k0
    const nos = ls.map(l => l.no).sort((a, b) => a - b), l0 = { ...ls[0], r0: pc.r0 }
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
    out.push({ key: k, text, nos, ...at, align: l0.vert ? 'center' : 'right' })
  }
  return out
}

export function RackLineLabels() {
  // where the racks are drawn now — a drag moves them before the store (live.js)
  const objects = useLiveObjects()
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const shown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  const lz = labelScale(labelSize, gs), fs = ROW_LABEL_PX / lz
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  const avoid = useMemo(() => (shown && lines.length ? aisleLabelBoxes(objects, gs, labelSize) : []), [shown, lines.length, objects, gs, labelSize])
  const places = useMemo(() => rowLabelPlaces(lines, fs, avoid), [lines, fs, avoid])
  // the Tally's tallied lines (studio/tally.js): a small green tick just before the label (every line it names checked)
  const checked = useMemo(() => checkedNos(objects, lines, T), [objects, lines, T])
  if (!shown || !lines.length || !layerShown(layers, 'racking')) return null
  return (
    <Group name="rack-line-labels" listening={false}>
      {places.map(p => <Text key={p.key} name="rack-line-label" text={p.text} x={p.x} y={p.y} width={p.w} height={p.h} align={p.align} verticalAlign="middle"
        fontSize={fs} fontFamily={FONT} fill={WORDS} listening={false} perfectDrawEnabled={false} />)}
      {places.filter(p => p.nos.length && p.nos.every(n => checked.has(n))).map(p => {
        const tw = p.text.length * fs * 0.62, start = p.align === 'right' ? p.x + p.w - tw : p.x + p.w / 2 - tw / 2
        return <Text key={'t' + p.key} name="rack-line-tick" text="✓" x={start - fs * 1.05} y={p.y} width={fs} height={p.h} align="center" verticalAlign="middle"
          fontSize={fs} fontStyle="700" fontFamily={FONT} fill={TICK} listening={false} perfectDrawEnabled={false} />
      })}
    </Group>
  )
}
