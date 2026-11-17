// DoorAnnot.jsx — the doors on the plan (doors-edit; STUDIO.md, Doors; mockups doors5.png, chain.png — render/doorAnnot.js
// lays it out, the PDF draws the same): each door a thin bar on its wall at true width, its number in a round badge at its
// clear space's top-right corner, and ONE dimension chain per wall with doors, just above the bars: corner, gap, door
// width … far corner, each value on its own segment (one too wide for it lifted straight up on a short leader). Nothing
// outside the wall. CLAUDE.md Rule 8 — the CAD text model: every label at its real text height (utils/textSizes.js —
// the chain 1 ft, the badges 1 ft), laid out once in drawing units, scaling with the drawing like geometry. A click on a
// value types it (DoorGapEdit.jsx); the chain follows a door while it is dragged (live objects). The dashed clear-space
// boxes are the Scene's (shapes.jsx DoorClearShape).

import { useMemo } from 'react'
import { Group, Rect, Line, Text, Circle } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects } from './live'
import { isDoor } from '../utils/doorTool'
import { shownIn } from '../utils/layers'
import { doorDrawing } from '../render/doorAnnot'
import { useTextSizes, textLz } from '../utils/textSizes'
import { floorUnit } from './minText'
export { floorUnit }

/** The chain's widths and gaps laid out now: [{ key (its wall), w, stop ({ kind: 'gap' | 'door', … }), door (the door it
 *  moves), box, fs }] — a click on one types it. */
let VALUES = []
/** The width or gap value under world point `p` (its box, plus 3 screen px), or null — elsewhere a press on the door or
 *  its box drags the door. */
export function doorGapAt(p, zoom = 1) {
  const pad = 3 / (zoom || 1)
  for (const g of VALUES) if (p.x >= g.box.x - pad && p.x <= g.box.x + g.box.w + pad && p.y >= g.box.y - pad && p.y <= g.box.y + g.box.h + pad) return g
  return null
}
/** A value's box now (the edit box opens over it): the gap before door `after`, or door `id`'s width. */
export const doorGapSpot = (key, e) => VALUES.find(g => g.key === key && (e.kind === 'door'
  ? g.stop.kind === 'door' && g.stop.id === e.id
  : g.stop.kind === 'gap' && g.stop.gap.after === e.after && (e.after != null || g.stop.gap.before === e.before))) || null

/* one label (a badge, a width, a gap): its shapes in one group, at its real size */
function DoorLabel({ l }) {
  return (
    <Group name={'door-' + l.kind + ':' + l.key} listening={false} minLabel={{ fs: l.fs, at: l.at, box: { w: l.box.w, h: l.box.h } }}>
      {l.ops.map((o, i) => {
        if (o.op === 'circle') return <Circle key={i} name="door-badge-ring" x={o.x} y={o.y} radius={o.r} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} perfectDrawEnabled={false} listening={false} />
        if (o.op === 'line') return <Line key={i} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} perfectDrawEnabled={false} listening={false} />
        return <Text key={i} x={o.x} y={o.y} width={o.w} height={o.h} text={o.text} align="center" verticalAlign="middle" wrap="none"
          fontSize={o.fontSize} fontFamily={o.fontFamily} fontStyle={o.fontStyle} fill={o.fill} listening={false} perfectDrawEnabled={false} />
      })}
    </Group>
  )
}

export function DoorAnnot() {
  const objects = useLiveObjects()
  const { gs, layers } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers })))
  // the chain values and the badges at their real text heights (utils/textSizes.js)
  const sizes = useTextSizes(s => s.sizes)
  const lz = textLz('doorValue', gs, null, sizes), badgeU = 1 / textLz('doorBadge', gs, null, sizes)
  const shown = useMemo(() => shownIn(layers), [layers])
  // (a door on a hidden layer: neither drawn nor labelled)
  const D = useMemo(() => {
    const visible = objects.filter(o => !isDoor(o) || shown(o))
    return visible.some(isDoor) ? doorDrawing(visible, gs, lz, { badgeU }) : null
  }, [objects, shown, gs, lz, badgeU])
  VALUES = D ? D.labels.filter(l => l.stop).map(l => ({ key: l.wallKey, w: l.w, stop: l.stop, box: l.box, fs: l.fs, door: l.stop.kind === 'door' ? l.stop.id : (l.stop.gap.after || l.stop.gap.before) })) : []
  if (!D) return null
  return (
    <Group name="door-annot" listening={false}>
      {D.bars.map(b => <Rect key={b.id} name={'door-bar:' + b.id} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} stroke={b.stroke} strokeWidth={1}
        strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />)}
      {/* the chain along each wall (chain.png): its line, broken round its values, and its ticks — drawing size */}
      {D.chains.map(c => (
        <Group key={'c:' + c.wallKey} name={'door-chain:' + c.wallKey} listening={false}>
          {c.ops.map((o, i) => <Line key={i} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} perfectDrawEnabled={false} listening={false} />)}
        </Group>
      ))}
      {D.labels.map(l => <DoorLabel key={l.key} l={l} />)}
    </Group>
  )
}
