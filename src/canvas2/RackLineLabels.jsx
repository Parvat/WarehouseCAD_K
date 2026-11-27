// RackLineLabels.jsx — the rack line numbers on the plan (utils/rackLines.js: R1, R2 …; the BOM's rows, the same
// computation): ONE label per rack line — a line cut by cross-aisles too (one number), at its outer start only (fixes-x 2;
// was: one per piece) — at its start end only — the left end of a line running across, the top end of
// one running up and down. A back-to-back pair running across gets one label per line, each beside its own line (R16 by
// the top line, R17 by the bottom one); one running up and down keeps one label for both, "R2–R3", at its top. Drawn like the aisle width labels: a
// size in feet (the Label size — render/labelSize.js), drawings' words style (Plus Jakarta Sans, #767C74). A label never
// overlaps another or a dimension label (the aisle and cross-aisle width labels): it shifts along the line's end, else
// it is left out — never grouped into a range (labels-final). Like every label they are drawing-size and show only while
// 11 px or more on screen (CLAUDE.md Rule 8 — canvas2/minText.js). Pure paint (never listens); hidden with the
// Racking layer, and by the View card's Row numbers (on by default; shown anyway while the Tally drawer or its Pop out is open —
// studio/viewPrefs.js). Each label's Konva name is `rack-line-label`.

import { useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackNumbersNow as rackLinesNow } from '../utils/rackLines'   // (rack-followup 5) every rack's number, the beam lines first
import { layerShown } from '../utils/layers'
import { useViewPrefs } from '../studio/viewPrefs'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { aisleLabelBoxes } from '../render/labelOps'
import { useLiveObjects } from './live'
import { MIN_TEXT_PX } from './minText'
import { useTextSizes, textLz } from '../utils/textSizes'
import { checkedNos } from '../studio/tally'
import { lineNamer, lineSections, chipText } from '../utils/lineNames'
import { useLabelObjects, useLabelsHeld } from './settled'
import { useDragPreview } from './dragPreview'   // (drag-perf-bar)
import { RACK_NUMBER } from '../render/rackFamily'   // (rack-design) the rack numbers' colour

const WORDS = RACK_NUMBER, TICK = '#2E7D5B', FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
import { ROW_LABEL_PX, rowLabelFs, rowLabelPlaces, otherLabelPlaces, placeRowLabels, rowReach, beamOffWalls } from './rowLabelPlace'   // (lane-fixes 8) the placement, pure: the canvas and the PDF
export { ROW_LABEL_PX, rowLabelFs, rowLabelPlaces, otherLabelPlaces, placeRowLabels, rowReach, beamOffWalls }
void MIN_TEXT_PX
/** The labels as the canvas draws them now, for a layout that must keep clear of them (the column chain, the door chain):
 *  [] when they are not shown. */
export function useRowPlaces(on) {
  const objects = useLabelObjects()   // (drag-perf-bar) held during a drag, placed once on the drop (settled.js)
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const rowsShown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize), sizes = useTextSizes(s => s.sizes)
  const fs = rowLabelFs(textLz('row', gs, null, sizes))
  return useMemo(() => {
    if (!on || !rowsShown || !layerShown(layers, 'racking')) return []
    const lines = rackLinesNow(objects, gs)
    return lines.length ? placeRowLabels(lines, fs, aisleLabelBoxes(objects, gs, labelSize), lineNamer(objects, T, gs), objects, gs) : []
  }, [on, rowsShown, layers, objects, gs, fs, labelSize, T, sizes])
}

/** (rack-round2 4) Its children moved by the drag's offset, live — the moving rack's own number goes with it. */
function DragOffset({ children }) {
  const dx = useDragPreview(st => st.dx), dy = useDragPreview(st => st.dy)
  return <Group x={dx || 0} y={dy || 0} listening={false}>{children}</Group>
}

export function RackLineLabels() {
  // where the racks are drawn now — a drag moves them before the store (live.js); (drag-perf-bar) held during a drag that
  // does not carry everything, placed once on the drop (settled.js)
  const objects = useLabelObjects()
  const { gs, layers, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const shown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  // (Rule 8, labels-final) placed and drawn at their natural drawing size; under 11 px on screen they hide (minText)
  const sizes = useTextSizes(s => s.sizes)
  const lz = textLz('row', gs, null, sizes), fs = ROW_LABEL_PX / lz, fsL = fs, k0 = 1
  const lines = useMemo(() => rackLinesNow(objects, gs), [objects, gs])
  const avoid = useMemo(() => (shown && lines.length ? aisleLabelBoxes(objects, gs, labelSize) : []), [shown, lines.length, objects, gs, labelSize, sizes])
  const namer = useMemo(() => lineNamer(objects, T, gs), [objects, T, gs])
  const places = useMemo(() => placeRowLabels(lines, fsL, avoid, namer, objects, gs), [lines, fsL, avoid, namer, objects, gs])
  // Per section (row-numbering fixes): each chip filled with its section's colour, the text white or dark to read on it
  const secOf = useMemo(() => lineSections(objects, T, gs), [objects, T, gs])
  // the Tally's tallied lines (studio/tally.js): a small green tick just before the label (every line it names checked)
  const checked = useMemo(() => checkedNos(objects, lines, T), [objects, lines, T])
  const held = useLabelsHeld(), movingIds = useDragPreview(s => s.ids)
  if (!shown || !lines.length || !layerShown(layers, 'racking')) return null
  /* (rack-round2 4) nothing left behind: while the labels are held for a drag, the number of a rack that moves is not
     drawn (not at its old place) — it is placed again on the drop. (Riding the drag redrew this whole layer every frame:
     on a big layout the drag went from 16 to 25 ms a frame — measured, docs/reports/rack-round2.md.) */
  const moveOf = (p) => {
    if (!held || !movingIds) return 'still'
    const ids = p.key.split(':')[0].split(','), n = ids.filter(id => movingIds.has(id)).length
    return n === 0 ? 'still' : n === ids.length ? 'moving' : 'hidden'
  }
  const draw = (list) => list.map(p => {
        const col = secOf ? secOf.get(p.nos[0])?.color : null
        const my = p.y + p.h / 2, w0 = p.w / k0, h0 = p.h / k0
        // a plain label: at its right end (a line across) or its middle
        if (!col) return <Text key={p.key} name="rack-line-label" text={p.text} x={p.align === 'right' ? p.x + p.w - w0 : p.x + p.w / 2 - w0 / 2} y={my - h0 / 2} width={w0} height={h0} align={p.align} verticalAlign="middle"
          fontSize={fs} fontFamily={FONT} fill={WORDS} listening={false} perfectDrawEnabled={false} />
        const twL = p.text.length * fsL * 0.62 + fsL * 0.5, cxL = (p.align === 'right' ? p.x + p.w - twL : p.x + p.w / 2 - twL / 2) + twL / 2, tw = twL / k0
        return (
          // (Rule 8) a chip is a label: under 11 px its chip and text hide together (canvas2/minText.js)
          <Group key={p.key} listening={false} minLabel={{ fs, at: { x: cxL, y: my }, box: { w: tw, h: h0 } }}>
            <Rect name="rack-line-chip" x={cxL - tw / 2} y={my - h0 / 2} width={tw} height={h0} fill={col} cornerRadius={fs * 0.25} listening={false} perfectDrawEnabled={false} />
            <Text name="rack-line-label" text={p.text} x={cxL - tw / 2} y={my - h0 / 2} width={tw} height={h0} align="center" verticalAlign="middle"
              fontSize={fs} fontFamily={FONT} fontStyle="600" fill={chipText(col)} listening={false} perfectDrawEnabled={false} />
          </Group>
        )
      })
  const still = places.filter(p => moveOf(p) === 'still'), moving = places.filter(p => moveOf(p) === 'moving')
  return (
    <Group name="rack-line-labels" listening={false}>
      {draw(still)}
      {void moving}
      {still.filter(p => p.nos.length && p.nos.every(n => checked.has(n))).map(p => {
        const tw = p.text.length * fsL * 0.62, start = p.align === 'right' ? p.x + p.w - tw : p.x + p.w / 2 - tw / 2
        const c = start - fsL * 1.05 + fsL / 2, my = p.y + p.h / 2
        return <Text key={'t' + p.key} name="rack-line-tick" text="✓" x={c - fs / 2} y={my - p.h / k0 / 2} width={fs} height={p.h / k0} align="center" verticalAlign="middle"
          fontSize={fs} fontStyle="700" fontFamily={FONT} fill={TICK} listening={false} perfectDrawEnabled={false} />
      })}
    </Group>
  )
}
