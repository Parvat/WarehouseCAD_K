// DoorAnnot.jsx — the doors on the plan (doors-edit; STUDIO.md, Doors; mockup doors5.png — render/doorAnnot.js lays it out,
// the PDF draws the same): each door a thin bar on its wall at true width, its number in a round badge in its clear space's
// corner, its width on a short dimension line inside the box, the gaps as plain text between the boxes — nothing outside
// the wall. Every label is drawing-scale (CLAUDE.md Rule 8, the door exception): it shrinks with the drawing and hides
// once under 11 px on screen (canvas2/minText.js `hide`), never grows, never groups. A click on a width or a gap types it
// (DoorGapEdit.jsx). The dashed clear-space boxes are the Scene's (shapes.jsx DoorClearShape).

import { useMemo } from 'react'
import { Group, Rect, Line, Text, Circle } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects } from './live'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { isDoor } from '../utils/doorTool'
import { shownIn } from '../utils/layers'
import { doorDrawing } from '../render/doorAnnot'
import { floorUnit, MIN_TEXT_PX } from './minText'
export { floorUnit }

/** The widths and gaps drawn now: [{ key (its wall), w, stop ({ kind: 'gap' | 'door', … }), door (the door it moves), box,
 *  fs }] — a click on one (while drawn at 11 px or more) types it. */
let VALUES = []
/** The width or gap value under world point `p` (its box, plus 3 screen px), or null — only one drawn now (11 px or more). */
export function doorGapAt(p, zoom = 1) {
  const z = zoom || 1, pad = 3 / z
  for (const g of VALUES) if (g.fs * z >= MIN_TEXT_PX - 1e-6 && p.x >= g.box.x - pad && p.x <= g.box.x + g.box.w + pad && p.y >= g.box.y - pad && p.y <= g.box.y + g.box.h + pad) return g
  return null
}
/** A value's box now (the edit box opens over it): the gap before door `after`, or door `id`'s width. */
export const doorGapSpot = (key, e) => VALUES.find(g => g.key === key && (e.kind === 'door'
  ? g.stop.kind === 'door' && g.stop.id === e.id
  : g.stop.kind === 'gap' && g.stop.gap.after === e.after && (e.after != null || g.stop.gap.before === e.before))) || null

/* one label (a badge, a width, a gap): its shapes in one group that hides as a whole under 11 px (minText `hide`) */
function DoorLabel({ l }) {
  return (
    <Group name={'door-' + l.kind + ':' + l.key} listening={false} minLabel={{ fs: l.fs, at: l.at, box: { w: l.box.w, h: l.box.h }, hide: true }}>
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
  const lz = labelScale(useLabelPrefs(s => s.labelSize), gs)
  const shown = useMemo(() => shownIn(layers), [layers])
  // (a door on a hidden layer: neither drawn nor labelled)
  const D = useMemo(() => {
    const visible = objects.filter(o => !isDoor(o) || shown(o))
    return visible.some(isDoor) ? doorDrawing(visible, gs, lz) : null
  }, [objects, shown, gs, lz])
  VALUES = D ? D.labels.filter(l => l.stop).map(l => ({ key: l.wallKey, w: l.w, stop: l.stop, box: l.box, fs: l.fs, door: l.stop.kind === 'door' ? l.stop.id : (l.stop.gap.after || l.stop.gap.before) })) : []
  if (!D) return null
  return (
    <Group name="door-annot" listening={false}>
      {D.bars.map(b => <Rect key={b.id} name={'door-bar:' + b.id} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} stroke={b.stroke} strokeWidth={1}
        strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />)}
      {D.labels.map(l => <DoorLabel key={l.key} l={l} />)}
    </Group>
  )
}
