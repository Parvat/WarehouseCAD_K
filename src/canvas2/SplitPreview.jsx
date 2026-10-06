import { Group, Line, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { geom } from '../utils/rowGroup'
import { useSplit } from '../utils/splitTool'
import { GROUP } from './RowGroupPreview'

/* The Split tool on the canvas (utils/splitTool.js) — pure paint, never listening: the cut line across the
   hovered rack at its nearest interior upright, and the piece on the cursor's side (the one a click picks
   up) tinted. */
export function SplitPreview() {
  const hover = useSplit(s => s.hover)
  const rack = useCanvasStore(s => (hover ? s.objects.find(o => o.id === hover.rackId) : null))
  if (!hover || !rack) return null
  const g = geom(rack)
  const [a, b] = hover.side === 'first' ? [g.r0, hover.at] : [hover.at, g.r1]
  const f = g.vert ? { x: g.s0, y: a, w: g.s1 - g.s0, h: b - a } : { x: a, y: g.s0, w: b - a, h: g.s1 - g.s0 }
  return (
    <Group listening={false}>
      <Rect x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(47,123,216,0.10)" stroke={GROUP} strokeWidth={1}
        dash={[6, 4]} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      <Line points={hover.line} stroke={GROUP} strokeWidth={2.5} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
    </Group>
  )
}
