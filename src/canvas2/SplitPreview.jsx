import { Group, Line, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { geom } from '../utils/rowGroup'
import { useSplit } from '../utils/splitTool'
import { GROUP, SKIPPED } from './RowGroupPreview'
import { rackFootprint } from '../generate/columnCheck'

/* The Split tool on the canvas (utils/splitTool.js) — pure paint, never listening: the cut line across the
   hovered rack at its nearest interior upright, and the piece on the cursor's side (the one a click picks
   up) tinted. With the row in a Row group, the same for every group row the click will cut, a rack that
   moves without a cut tinted whole, and a row it will skip outlined in amber. */
const tint = (f, key) => (
  <Rect key={key} x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(47,123,216,0.10)" stroke={GROUP} strokeWidth={1}
    dash={[6, 4]} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
)
const cutLine = (points, key) => <Line key={key} points={points} stroke={GROUP} strokeWidth={2.5} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
/** The piece of `rack` on `side` of the cut centred at `at`. */
const pieceRect = (rack, side, at) => {
  const g = geom(rack), [a, b] = side === 'first' ? [g.r0, at] : [at, g.r1]
  return g.vert ? { x: g.s0, y: a, w: g.s1 - g.s0, h: b - a } : { x: a, y: g.s0, w: b - a, h: g.s1 - g.s0 }
}
export function SplitPreview() {
  const hover = useSplit(s => s.hover)
  const objects = useCanvasStore(s => s.objects)
  const byId = hover ? new Map(objects.map(o => [o.id, o])) : null
  const rack = hover ? byId.get(hover.rackId) : null
  if (!hover || !rack) return null
  const grp = hover.group
  return (
    <Group listening={false}>
      {tint(pieceRect(rack, hover.side, hover.at), 'src')}
      {cutLine(hover.line, 'srcline')}
      {grp && grp.cuts.map(t => byId.has(t.rackId) && [tint(pieceRect(byId.get(t.rackId), t.side, t.at), 'p' + t.rackId), cutLine(t.line, 'l' + t.rackId)])}
      {grp && grp.moves.map(id => byId.has(id) && tint(rackFootprint(byId.get(id)), 'm' + id))}
      {grp && grp.skipped.map(id => { const f = rackFootprint(byId.get(id)); return <Rect key={'s' + id} x={f.x} y={f.y} width={f.w} height={f.h} stroke={SKIPPED} strokeWidth={2} dash={[3, 3]} fill="rgba(230,126,34,0.10)" strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} /> })}
    </Group>
  )
}
