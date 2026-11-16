// DoorAnnot.jsx — the doors' tags and the chain on the plan (doors-edit round; STUDIO.md, Doors; render/doorAnnot.js): every
// door's tag inside, on the door (D1 …, M1 …, per wall: top, right, bottom, left; tags that would overlap collapse into
// one range tag); while a door is selected, the chain along its wall OUTSIDE the building — corner, gap, door width, gap …
// far corner — a click on any value types it (DoorGapEdit.jsx). Laid out at the zoom with the 11 px floor in it (CLAUDE.md
// Rule 8): a value that does not fit moves outside with a leader; the chain, or a wall's tags, hide only when they no
// longer fit the wall. The PDF always has both (export/pdfExport.js).

import { useMemo } from 'react'
import { Group } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects, useView } from './live'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { LabelOps } from './LabelOps'
import { isDoor } from '../utils/doorTool'
import { shownIn } from '../utils/layers'
import { doorWall, wallKey } from '../utils/doorWall'
import { doorTags, doorChain } from '../render/doorAnnot'
import { floorUnit } from './minText'
import { useRowPlaces, rowReach } from './RackLineLabels'
export { floorUnit }

/** The chain values drawn now: [{ key (its wall), w, stop ({ kind: 'gap' | 'door', … }), door (the door it moves), box }]. */
let VALUES = []
/** The chain value under world point `p` (its box, plus 3 screen px), or null. */
export function doorGapAt(p, zoom = 1) {
  const pad = 3 / (zoom || 1)
  for (const g of VALUES) if (p.x >= g.box.x - pad && p.x <= g.box.x + g.box.w + pad && p.y >= g.box.y - pad && p.y <= g.box.y + g.box.h + pad) return g
  return null
}
/** A chain value's box now (the edit box opens over it): the gap before door `after` (null: the gap to the far corner,
 *  after door `before`), or door `id`'s width. */
export const doorGapSpot = (key, e) => VALUES.find(g => g.key === key && (e.kind === 'door'
  ? g.stop.kind === 'door' && g.stop.id === e.id
  : g.stop.kind === 'gap' && g.stop.gap.after === e.after && (e.after != null || g.stop.gap.before === e.before))) || null

export function DoorAnnot() {
  const objects = useLiveObjects()
  const { zoom } = useView()
  const { selectedIds, gs, layers } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, gs: s.gridSize || 40, layers: s.layers })))
  const labelSize = useLabelPrefs(s => s.labelSize)
  const u = floorUnit(labelScale(labelSize, gs), zoom)
  const shown = useMemo(() => shownIn(layers), [layers])
  const doors = useMemo(() => objects.filter(o => isDoor(o) && shown(o)), [objects, shown])
  // (a door on a hidden layer: neither drawn nor tagged — its neighbours' tags have its room)
  const tags = useMemo(() => (doors.length ? doorTags(objects.filter(o => !isDoor(o) || shown(o)), gs, u) : []), [doors, objects, gs, u, shown])
  // the walls of the selected doors: their chains — outside the wall, past the row numbers that reach out there
  const anySel = doors.some(d => selectedIds.includes(d.id))
  const places = useRowPlaces(anySel)
  const chains = useMemo(() => {
    const walls = new Map()
    for (const d of doors) if (selectedIds.includes(d.id)) { const w = doorWall(d, objects, gs); if (w) walls.set(wallKey(w), w) }
    return [...walls.entries()].map(([key, w]) => {
      const fp = w.kind === 'fp' ? objects.find(o => o.id === w.id) : null, r = fp ? rowReach(fp, places) : null
      const side = w.axis === 'x' ? (w.inward > 0 ? 'top' : 'bottom') : (w.inward > 0 ? 'left' : 'right')
      return { key, w, ...doorChain(objects, w, gs, u, { clear: r ? r[side] : 0 }) }
    }).filter(c => !c.hidden)
  }, [doors, selectedIds, objects, gs, u, places])
  VALUES = chains.flatMap(c => c.items.map(it => ({ key: c.key, w: c.w, stop: it.stop, box: it.box, door: it.stop.kind === 'door' ? it.stop.id : (it.stop.gap.after || it.stop.gap.before) })))
  if (!doors.length) return null
  return (
    <Group name="door-annot" listening={false}>
      {chains.map(c => <LabelOps key={'c' + c.key} ops={c.ops} name={'door-chain:' + c.key} fit={false} />)}
      {tags.map(t => <LabelOps key={t.ids.join(',')} ops={t.ops} name={'door-tag:' + t.ids.join(',')} fit={false} />)}
    </Group>
  )
}
