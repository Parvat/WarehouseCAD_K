import { Group, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackFootprint } from '../generate/columnCheck'
import { rowsOf, previewRects } from '../utils/rowGroup'
import { useRowGroup } from '../utils/rowGroupTool'

/* The Row group on the canvas (utils/rowGroupTool.js) — pure paint, never listening:
     - the Row group tool's box while it is dragged;
     - every rack of the group's rows outlined (until Esc or ✕);
     - while an apply is pending (the bar asks): where each target would end up (dashed), the bays an
       apply would DROP (red, filled, solid edge — dropped, never squeezed) and the rows it SKIPS (amber,
       outlined over the row where it is) — so dropped bays and skipped rows read apart at a glance. */

export const GROUP = '#2F7BD8'
export const DROPPED = '#C0392B'
export const SKIPPED = '#E67E22'

const rect = (f, key, stroke, { dash = [], fill = 'transparent', width = 1.5 } = {}) => (
  <Rect key={key} x={f.x} y={f.y} width={f.w} height={f.h} stroke={stroke} strokeWidth={width} dash={dash} fill={fill}
    strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
)

export function RowGroupPreview() {
  const keys = useRowGroup(s => s.keys)
  const pending = useRowGroup(s => s.pending)
  const drag = useRowGroup(s => s.drag)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  if (!keys.length && !pending && !drag) return null
  const rows = rowsOf(objects, gridSize), byId = new Map(objects.map(o => [o.id, o]))
  const outlined = []
  for (const k of keys) { const r = rows.get(k) || [...rows.values()].find(x => k.startsWith('h|') && x.roots && k.slice(2).split(',').some(id => x.roots.includes(id))); for (const id of r ? r.ids : []) if (byId.has(id)) outlined.push(rect(rackFootprint(byId.get(id)), 'g' + id, GROUP, { width: 2 })) }
  const paint = pending ? previewRects(objects, pending.plan, gridSize).map(p => (p.kind === 'target' ? rect(p.f, p.key, GROUP, { dash: [6, 4], fill: 'rgba(47,123,216,0.08)' })
    : p.kind === 'dropped' ? rect(p.f, p.key, DROPPED, { fill: 'rgba(192,57,43,0.28)', width: 1.5 })
      : rect(p.f, p.key, SKIPPED, { dash: [3, 3], fill: 'rgba(230,126,34,0.10)', width: 2 }))) : []
  // the Row group tool's box while it is dragged
  const box = drag && rect({ x: Math.min(drag.from.x, drag.to.x), y: Math.min(drag.from.y, drag.to.y), w: Math.abs(drag.to.x - drag.from.x), h: Math.abs(drag.to.y - drag.from.y) }, 'box', GROUP, { dash: [6, 4], fill: 'rgba(47,123,216,0.06)' })
  return <Group listening={false}>{outlined}{paint}{box}</Group>
}
