// ColumnGridAnnot.jsx — a column grid's gridlines, bubbles (A, B, C … across; 1, 2, 3 … down) and dimension chains on the
// plan, while that grid is selected (a column picked in it too) — render/columnAnnot.js lays them out; the PDF always
// draws them. Pure paint, drawn from the live layout so it follows a drag.

import { Group, Line, Circle, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { columnAnnot, ANNOT } from '../render/columnAnnot'
import { labelScale } from '../render/labelSize'
import { useLabelPrefs } from './labelPrefs'
import { useLiveObjects } from './live'
import { layerShown } from '../utils/layers'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function ColumnGridAnnot() {
  const objects = useLiveObjects()
  const { selectedIds, gs, layers } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, gs: s.gridSize || 40, layers: s.layers })))
  const lz = labelScale(useLabelPrefs(s => s.labelSize), gs)
  if (!layerShown(layers, 'columns')) return null
  const grids = objects.filter(o => o.type === 'column_grid' && o.showGrid !== false && selectedIds.includes(o.id))
  if (!grids.length) return null
  return (
    <Group name="column-annot" listening={false}>
      {grids.map(g => {
        const a = columnAnnot(g, objects, gs, lz)
        if (!a) return null
        return (
          <Group key={g.id} name={'column-annot:' + g.id} listening={false}>
            {a.lines.map((l, i) => <Line key={'l' + i} name="column-gridline" points={[l.x1, l.y1, l.x2, l.y2]} stroke={ANNOT.line} strokeWidth={0.75} dash={[6, 4]} strokeScaleEnabled={false} listening={false} perfectDrawEnabled={false} />)}
            {a.chain.map((c, i) => (
              <Group key={'c' + i} listening={false}>
                <Line points={[c.x1, c.y1, c.x2, c.y2]} stroke={ANNOT.ink} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                {c.ticks.map(([x, y], k) => <Line key={k} points={c.vert ? [x - c.tick, y, x + c.tick, y] : [x, y - c.tick, x, y + c.tick]} stroke={ANNOT.ink} strokeWidth={1} strokeScaleEnabled={false} listening={false} />)}
                <Text name="column-chain-text label-pill" text={c.text} x={c.tx} y={c.ty} width={a.fs * 8} align="center" offsetX={a.fs * 4} offsetY={a.fs / 2} rotation={c.vert ? -90 : 0}
                  fontSize={a.fs} fontFamily={FONT} fill={ANNOT.ink} listening={false} />
              </Group>
            ))}
            {a.bubbles.map((b, i) => (
              <Group key={'b' + i} name="column-bubble label-pill" listening={false}>
                <Circle x={b.x} y={b.y} radius={b.r} fill={ANNOT.bubbleFill} stroke={ANNOT.ink} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                <Text name="column-bubble-text" text={b.text} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} align="center" verticalAlign="middle" fontSize={b.r * 1.05} fontStyle="700" fontFamily={FONT} fill={ANNOT.ink} listening={false} />
              </Group>
            ))}
          </Group>
        )
      })}
    </Group>
  )
}
