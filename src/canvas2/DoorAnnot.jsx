// DoorAnnot.jsx — the doors' tags and the gap chain on the plan (doors-edit round; STUDIO.md, Doors; render/doorAnnot.js):
// every door's number in its tag (D1 …, M1 …, clockwise from the top-left corner); while a door is selected, the gaps
// along its wall — from the low corner to the first door, then between the doors — inside the building, a click on a
// value types it (DoorGapEdit.jsx). Drawn through LabelOps, so the 11 px floor holds (CLAUDE.md Rule 8). The PDF always
// has both (export/pdfExport.js).

import { useMemo } from 'react'
import { Group } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects } from './live'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { LabelOps } from './LabelOps'
import { isDoor } from '../utils/doorTool'
import { shownIn } from '../utils/layers'
import { doorNumbers, doorWall, wallKey } from '../utils/doorWall'
import { doorTagOps, gapChain } from '../render/doorAnnot'

/** The gap values drawn now: [{ key (its wall), w, gap, box }] — a click on one types it. */
let GAPS = []
/** The gap value under world point `p` (its box, plus 3 screen px), or null. */
export function doorGapAt(p, zoom = 1) {
  const pad = 3 / (zoom || 1)
  for (const g of GAPS) if (p.x >= g.box.x - pad && p.x <= g.box.x + g.box.w + pad && p.y >= g.box.y - pad && p.y <= g.box.y + g.box.h + pad) return g
  return null
}
/** A gap value's box now (the edit box opens over it). */
export const doorGapSpot = (key, after) => GAPS.find(g => g.key === key && g.gap.after === after) || null

export function DoorAnnot() {
  const objects = useLiveObjects()
  const { selectedIds, gs, layers } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, gs: s.gridSize || 40, layers: s.layers })))
  const labelSize = useLabelPrefs(s => s.labelSize)
  const lz = labelScale(labelSize, gs)
  const shown = useMemo(() => shownIn(layers), [layers])
  const doors = useMemo(() => objects.filter(o => isDoor(o) && shown(o)), [objects, shown])
  const nums = useMemo(() => (doors.length ? doorNumbers(objects, gs) : new Map()), [doors.length, objects, gs])
  // the walls of the selected doors: their gap chains
  const chains = useMemo(() => {
    const walls = new Map()
    for (const d of doors) if (selectedIds.includes(d.id)) { const w = doorWall(d, objects, gs); if (w) walls.set(wallKey(w), w) }
    return [...walls.entries()].flatMap(([key, w]) => gapChain(objects, w, gs, lz).map(c => ({ ...c, key, w })))
  }, [doors, selectedIds, objects, gs, lz])
  GAPS = chains.map(c => ({ key: c.key, w: c.w, gap: c.gap, box: c.box }))
  if (!doors.length) return null
  return (
    <Group name="door-annot" listening={false}>
      {chains.map((c, i) => <LabelOps key={'g' + i} ops={c.ops} name={'door-gap:' + c.key + ':' + i} />)}
      {doors.map(d => <LabelOps key={d.id} ops={doorTagOps(d, nums.get(d.id), lz)} name={'door-tag:' + d.id} />)}
    </Group>
  )
}
