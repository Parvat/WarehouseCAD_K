// ColumnGridAnnot.jsx — a column grid's gridlines, bubbles (A, B, C … across; 1, 2, 3 … down) and dimension chains on the
// plan, while that grid is selected (a column picked in it too) — render/columnAnnot.js lays them out; the PDF always
// draws them. Pure paint, drawn from the live layout so it follows a drag.

import { useMemo } from 'react'
import { Group, Line, Circle, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { columnAnnot, ANNOT } from '../render/columnAnnot'
import { labelScale } from '../render/labelSize'
import { useLabelPrefs } from './labelPrefs'
import { useLiveObjects } from './live'
import { layerShown } from '../utils/layers'
import { gridBuilding } from '../utils/columnGrid'
import { buildingOutline } from '../utils/floorGeom'
import { rackLinesNow } from '../utils/rackLines'
import { rowLabelPlaces, ROW_LABEL_PX } from './RackLineLabels'
import { aisleLabelBoxes } from '../render/labelOps'
import { lineNamer } from '../utils/lineNames'
import { useViewPrefs } from '../studio/viewPrefs'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/** How far the row numbers (RackLineLabels — the same places) reach past grid `g`'s building's top and left walls. */
function rowClear(g, objects, places) {
  const fp = gridBuilding(objects, g)
  if (!fp || !places.length) return null
  const p = buildingOutline(fp), x0 = Math.min(...p.map(q => q.x)), x1 = Math.max(...p.map(q => q.x)), y0 = Math.min(...p.map(q => q.y)), y1 = Math.max(...p.map(q => q.y))
  let top = 0, left = 0
  for (const q of places) {
    if (q.x < x0 && q.y + q.h > y0 && q.y < y1) left = Math.max(left, x0 - q.x)
    if (q.y < y0 && q.x + q.w > x0 && q.x < x1) top = Math.max(top, y0 - q.y)
  }
  return { top, left }
}

/* (col-bubbles round) The bubbles as last drawn — { gridId, axis, i, x, y, r } (world px) — so a press or a hover on one
   finds the gridline it names (canvas2/useCanvasInteraction.js: a bubble dragged moves its line, as the line itself). */
let SPOTS = []
/** The bubble under world point `p` (its circle, plus 3 screen px), or null. */
export function bubbleAt(p, zoom = 1) {
  const pad = 3 / (zoom || 1)
  for (const b of SPOTS) if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + pad) return b
  return null
}

export function ColumnGridAnnot() {
  const objects = useLiveObjects()
  const { selectedIds, gs, layers, T } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, gs: s.gridSize || 40, layers: s.layers, T: s.elevations })))
  const labelSize = useLabelPrefs(s => s.labelSize)
  const rowsShown = useViewPrefs(s => s.rowLabels || s.bomFull)
  const lz = labelScale(labelSize, gs)
  const grids = layerShown(layers, 'columns') ? objects.filter(o => o.type === 'column_grid' && o.showGrid !== false && selectedIds.includes(o.id)) : []
  // the row numbers where they are drawn (only worked out while a grid is selected)
  const places = useMemo(() => {
    if (!grids.length || !rowsShown || !layerShown(layers, 'racking')) return []
    const lines = rackLinesNow(objects, gs)
    return lines.length ? rowLabelPlaces(lines, ROW_LABEL_PX / lz, aisleLabelBoxes(objects, gs, labelSize), lineNamer(objects, T, gs)) : []
  }, [grids.length, rowsShown, layers, objects, gs, lz, labelSize, T])
  if (!grids.length) { SPOTS = []; return null }
  const spots = []
  SPOTS = spots   // (filled as the grids below draw)
  return (
    <Group name="column-annot" listening={false}>
      {grids.map(g => {
        const a = columnAnnot(g, objects, gs, lz, rowClear(g, objects, places))
        if (a) for (const b of a.bubbles) spots.push({ gridId: g.id, axis: b.axis, i: b.i, x: b.x, y: b.y, r: b.r })
        if (!a) return null
        return (
          <Group key={g.id} name={'column-annot:' + g.id} listening={false}>
            {a.lines.map((l, i) => <Line key={'l' + i} name="column-gridline" points={[l.x1, l.y1, l.x2, l.y2]} stroke={ANNOT.line} strokeWidth={1} dash={[4, 4]} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
            {a.chain.map((c, i) => (
              <Group key={'c' + i} listening={false}>
                {[...c.segs, ...c.ticks].map((l, k) => <Line key={k} points={l} stroke={ANNOT.ink} strokeWidth={1} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
                <Text name="column-chain-text label-pill" text={c.text} x={c.tx} y={c.ty} width={c.tw + a.fs * 0.4} align="center" wrap="none" offsetX={(c.tw + a.fs * 0.4) / 2} offsetY={a.fs / 2}
                  fontSize={a.fs} fontStyle="600" fontFamily={FONT} fill={ANNOT.ink} listening={false} />
              </Group>
            ))}
            {a.bubbles.map((b, i) => (
              <Group key={'b' + i} name="column-bubble label-pill" listening={false}>
                <Circle x={b.x} y={b.y} radius={b.r} fill={ANNOT.bubbleFill} stroke={ANNOT.bubble} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                <Text name="column-bubble-text" text={b.text} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} align="center" verticalAlign="middle" fontSize={b.fs} fontStyle="600" fontFamily={FONT} fill={ANNOT.bubble} listening={false} />
              </Group>
            ))}
          </Group>
        )
      })}
    </Group>
  )
}
