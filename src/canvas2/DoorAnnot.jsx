// DoorAnnot.jsx — the doors on the plan (doors-edit; STUDIO.md, Doors; mockups doors5.png, chain.png — render/doorAnnot.js
// lays it out, the PDF draws the same): each door a thin bar on its wall at true width, its number in a round badge at its
// clear space's top-right corner, and ONE dimension chain per wall just above the bars — corner, gap, door width … far
// corner — each value on its own segment (a value too wide for it lifted straight up on a leader). Nothing outside the
// wall. The values are the aisle width labels' size, laid out at the size drawn (floorUnit — Rule 8). A click on a value
// types it (DoorGapEdit.jsx); the chain follows a door while it is dragged (live objects). The dashed clear-space boxes are
// the Scene's (shapes.jsx DoorClearShape).

import { useMemo } from 'react'
import { Group, Rect, Line, Text, Circle } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects, useView } from './live'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { isDoor } from '../utils/doorTool'
import { shownIn } from '../utils/layers'
import { doorDrawing, DOOR_FS, BADGE_K } from '../render/doorAnnot'
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

/* one label (a badge, a width, a gap): its shapes in one group, laid out at the size it is drawn. `grown`: laid out past
   its drawing size (the 11 px floor) — then it never covers another object, or hides (minText; Rule 8); its own door is not
   "another"; a gap is kept (`keep` — it never hides while its wall's other labels show) */
function DoorLabel({ l, grown }) {
  return (
    <Group name={'door-' + l.kind + ':' + l.key} listening={false}
      minLabel={{ fs: l.fs, at: l.at, box: { w: l.box.w, h: l.box.h }, grown, own: l.id ? [l.id] : undefined, keep: !!l.keep }}>
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
  // (the aisle labels' Label size, laid out at the size drawn: the floor in it — Rule 8)
  const zoom = useView().zoom
  const base = labelScale(useLabelPrefs(s => s.labelSize), gs), lz = 1 / floorUnit(base, zoom, DOOR_FS)
  const minFs = MIN_TEXT_PX / (zoom || 1)
  const shown = useMemo(() => shownIn(layers), [layers])
  // (a door on a hidden layer: neither drawn nor labelled)
  const D = useMemo(() => {
    const visible = objects.filter(o => !isDoor(o) || shown(o))
    return visible.some(isDoor) ? doorDrawing(visible, gs, lz, { minFs }) : null
  }, [objects, shown, gs, lz, minFs])
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
      {D.labels.map(l => <DoorLabel key={l.key} l={l} grown={l.fs > (l.kind === 'badge' ? BADGE_K : 1) * DOOR_FS / base + 1e-6} />)}
    </Group>
  )
}
