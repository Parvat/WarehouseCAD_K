// DoorAnnot.jsx — the doors on the plan (doors-edit; STUDIO.md, Doors; mockups doors5.png, chain.png — render/doorAnnot.js
// lays it out, the PDF draws the same): each door a thin bar on its wall at true width, its number in a round badge at its
// clear space's top-right corner, and — only while a door on that wall is selected, placed or dragged (labels-final) —
// ONE dimension chain per wall just above the bars: corner, gap, door width … far corner, each value on its own segment
// (a single value too wide for it lifted straight up on a leader, only when the rest fits). Nothing outside the wall.
// Every label at its drawing size, shown only when it fits its space at 11 px or more (CLAUDE.md Rule 8). A click on a
// value types it, only where it is drawn (DoorGapEdit.jsx); the chain follows a door while it is dragged (live objects).
// The dashed clear-space boxes are the Scene's (shapes.jsx DoorClearShape).

import { useMemo } from 'react'
import { Group, Rect, Line, Text, Circle } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects } from './live'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { isDoor } from '../utils/doorTool'
import { shownIn } from '../utils/layers'
import Konva from 'konva'
import { doorDrawing } from '../render/doorAnnot'
import { useDragPreview } from './dragPreview'
import { useDoorTool, liveGap } from '../utils/doorTool'
import { doorWall, wallKey } from '../utils/doorWall'
import { floorUnit, MIN_TEXT_PX } from './minText'
export { floorUnit }

/** The chain's widths and gaps laid out now: [{ key (its wall), w, stop ({ kind: 'gap' | 'door', … }), door (the door it
 *  moves), box, fs, node (its Konva group's name) }] — a click on one types it, only where it is drawn. */
let VALUES = []
/** Is the label group named `name` drawn now (its text not hidden by the label rule — canvas2/minText.js)? */
const drawnNow = (name) => {
  const st = Konva.stages && Konva.stages[0]
  const g = st && st.findOne(n => n.name() === name)
  return !!g && g.find('Text').some(t => (t._mtPx || 0) > 0)
}
/** The width or gap value under world point `p` (its box, plus 3 screen px), or null — only where the value itself is
 *  drawn (labels-final: 11 px or more, in its space; elsewhere a press on the door or its box drags the door). */
export function doorGapAt(p, zoom = 1) {
  const z = zoom || 1, pad = 3 / z
  for (const g of VALUES) if (g.fs * z >= MIN_TEXT_PX - 1e-6 && p.x >= g.box.x - pad && p.x <= g.box.x + g.box.w + pad && p.y >= g.box.y - pad && p.y <= g.box.y + g.box.h + pad && drawnNow(g.node)) return g
  return null
}
/** A value's box now (the edit box opens over it): the gap before door `after`, or door `id`'s width. */
export const doorGapSpot = (key, e) => VALUES.find(g => g.key === key && (e.kind === 'door'
  ? g.stop.kind === 'door' && g.stop.id === e.id
  : g.stop.kind === 'gap' && g.stop.gap.after === e.after && (e.after != null || g.stop.gap.before === e.before))) || null

/* one label (a badge, a width, a gap): its shapes in one group, at its drawing size. It shows only when it fits its own
   space at 11 px or more — off every other object (`cover`; its own door is not "another") — labels-final, Rule 8 */
function DoorLabel({ l }) {
  return (
    <Group name={'door-' + l.kind + ':' + l.key} listening={false}
      minLabel={{ fs: l.fs, at: l.at, box: { w: l.box.w, h: l.box.h }, cover: true, own: l.id ? [l.id] : undefined }}>
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
  // (the aisle labels' Label size, at its drawing size — labels-final, Rule 8)
  const lz = 1 / floorUnit(labelScale(useLabelPrefs(s => s.labelSize), gs))
  const shown = useMemo(() => shownIn(layers), [layers])
  // the chain shows only on a wall with a door selected, being dragged, or being placed (the door tool's hovered wall)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const dragIds = useDragPreview(s => s.ids)
  const hover = useDoorTool(s => s.hover)
  const active = useMemo(() => {
    const set = new Set(), add = (d) => { const w = isDoor(d) ? doorWall(d, objects, gs) : null; if (w) set.add(wallKey(w)) }
    for (const id of selectedIds || []) add(objects.find(o => o.id === id))
    if (dragIds) for (const id of dragIds) add(objects.find(o => o.id === id))
    const L = hover ? liveGap(objects, gs) : null
    if (L && L.w) set.add(wallKey(L.w))
    return set
  }, [objects, gs, selectedIds, dragIds, hover])
  // (a door on a hidden layer: neither drawn nor labelled)
  const D = useMemo(() => {
    const visible = objects.filter(o => !isDoor(o) || shown(o))
    return visible.some(isDoor) ? doorDrawing(visible, gs, lz, { chains: active }) : null
  }, [objects, shown, gs, lz, active])
  VALUES = D ? D.labels.filter(l => l.stop).map(l => ({ key: l.wallKey, w: l.w, stop: l.stop, box: l.box, fs: l.fs, node: 'door-' + l.kind + ':' + l.key, door: l.stop.kind === 'door' ? l.stop.id : (l.stop.gap.after || l.stop.gap.before) })) : []
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
