// LabelObstacles.jsx — the objects a grown label may never cover (CLAUDE.md Rule 8, labels-cover round): the racks, the
// doors, the columns and the zones as drawn now (live), handed to the text floor (canvas2/minText.js setLabelObstacles).
// Draws nothing.

import { useMemo } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLiveObjects } from './live'
import { worldBoundsOf, columnRectsOf } from './hitTest'
import { isDoor } from '../utils/doorTool'
import { setLabelObstacles } from './minText'

const COVERED = (o) => typeof o?.type === 'string' && (o.type.startsWith('rack_') || o.type.startsWith('zone_') || isDoor(o))

/** [{ id, x, y, w, h }] world px: the racks, doors and zones (their turned boxes) and every column of a shown grid. */
export function labelObstacles(objects, gridSize = 40) {
  const out = []
  for (const o of objects || []) {
    if (!COVERED(o) || o.visible === false) continue
    const b = worldBoundsOf(o, objects)
    if (b && b.width > 0 && b.height > 0) out.push({ id: o.id, x: b.x, y: b.y, w: b.width, h: b.height })
  }
  for (const c of columnRectsOf(objects, gridSize)) out.push({ id: null, x: c.x, y: c.y, w: c.w, h: c.h })
  return out
}

export function LabelObstacles() {
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  // set during render: the labels drawn in this commit read it (Konva draws after React commits)
  useMemo(() => setLabelObstacles(labelObstacles(objects, gs)), [objects, gs])
  return null
}
