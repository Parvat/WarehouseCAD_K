import { Group, Rect, Line } from 'react-konva'
import { SELECT_BLUE } from '../theme/tokens'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHoverTarget } from './hoverTarget'
import { outlineBounds, spin } from './shapes'
import { bayRectForIndex } from '../render/bayGeom'

/* Hover highlights exactly what a click would select (STUDIO.md §7a; hoverTarget.js decides what): a thin dashed
   outline round the building, the row (its section), the bay (one half, or both in a pair's flue), the one column or
   the object under the pointer. Pure paint, never listening. */
const line = { stroke: SELECT_BLUE, strokeWidth: 1, dash: [4, 3], opacity: 0.85, strokeScaleEnabled: false, perfectDrawEnabled: false, listening: false }

export function HoverHighlight() {
  const target = useHoverTarget(s => s.target)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  if (!target || target.key === 'none' || target.kind === 'keep') return null
  const byId = new Map(objects.map(o => [o.id, o]))
  const parts = []
  if (target.kind === 'column' && target.column) {
    const c = target.column
    parts.push(<Rect key="c" x={c.x} y={c.y} width={c.w} height={c.h} {...line} />)
  } else if (target.kind === 'bays') {
    for (const e of target.bays || []) {
      const o = byId.get(e.objId)
      if (!o) continue
      const rs = bayRectForIndex(o, gridSize, e.bayIdx)
      const pick = e.side === 0 || e.side === 1 ? [rs[e.side] || rs[0]] : rs
      parts.push(<Group key={'b' + e.objId + e.bayIdx} {...spin(o, gridSize)}>{pick.filter(Boolean).map((r, i) => <Rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} {...line} />)}</Group>)
    }
  } else {
    for (const id of target.ids || []) {
      const o = byId.get(id)
      if (!o) continue
      if (Array.isArray(o.fpVerts) && o.fpVerts.length >= 3) { parts.push(<Line key={id} points={o.fpVerts.flatMap(v => [v.x, v.y])} closed {...line} />); continue }
      const b = outlineBounds(o, gridSize, objects)
      if (!b) continue
      parts.push(<Group key={id} {...spin(o, gridSize)}><Rect x={b.x} y={b.y} width={b.width} height={b.height} {...line} /></Group>)
    }
  }
  return <Group name="hover-highlight" listening={false}>{parts}</Group>
}
