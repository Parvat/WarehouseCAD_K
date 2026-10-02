import { Group, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackFootprint } from '../generate/columnCheck'
import { rackDrawOps, PORTED_RACK_TYPES } from '../render/rackOps'
import { RackShape, ZoneShape } from './shapes'
import { usePlacement } from '../utils/placement'
import { useCopyPrompt, pendingPlan } from '../utils/copyPrompt'
import { copyPreviewRects, previewKey } from '../utils/copyChange'

/* ── "Copy this change" on the canvas ─────────────────────────────────────────
   Three pieces, all pure paint or plain DOM (picking stays geometric):
     - PlacementGhost: a row (or a zone) being added follows the mouse, faded; its
       outline turns red where it cannot go, orange in a cross-aisle (placed,
       with a warning — utils/placement.js);
     - CopyPreview: while the bar's Copy button is hovered, faint outlines
       where the copies would land (and the rows a delete would take);
     The note itself is DOM, in CopyNote.jsx. */

const PREVIEW = '#2F7BD8'
const BLOCKED = '#C0392B'
const WARNED = '#E67E22'

const outline = (f, color, key, dash = [6, 4], fill = 'transparent') => (
  <Rect key={key} x={f.x} y={f.y} width={f.w} height={f.h} stroke={color} strokeWidth={1.5} dash={dash} fill={fill}
    strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
)

export function PlacementGhost({ gridSize }) {
  const a = usePlacement(s => s.active)
  if (!a) return null
  const color = a.blocked ? BLOCKED : a.crossAisle ? WARNED : PREVIEW
  return (
    <Group x={a.dx} y={a.dy} listening={false}>
      <Group opacity={0.45} listening={false}>
        {a.items.map(o => (PORTED_RACK_TYPES.has(o.type)
          ? <RackShape key={o.id} obj={o} ops={rackDrawOps(o, { gridSize })} gridSize={gridSize} listening={false} activeBaySelection={null} />
          : typeof o.type === 'string' && o.type.startsWith('zone_')
            ? <ZoneShape key={o.id} obj={o} gridSize={gridSize} listening={false} />
            : null))}
      </Group>
      {a.items.filter(o => typeof o.type === 'string' && o.type.startsWith('rack_')).map(o => outline(rackFootprint(o), color, 'g' + o.id, a.blocked ? [] : [6, 4]))}
    </Group>
  )
}

export function CopyPreview() {
  const pending = useCopyPrompt(s => s.pending)
  const hover = useCopyPrompt(s => s.hover)
  const objects = useCanvasStore(s => s.objects)
  const plan = pending && hover ? pendingPlan() : null
  if (!plan) return null
  // keyed by position too (previewKey): every added copy shares one placeholder id
  const out = copyPreviewRects(objects, plan).map((r, i) => outline(r, r.gone ? BLOCKED : PREVIEW, previewKey(r, i), [6, 4], r.gone ? 'rgba(192,57,43,0.06)' : 'rgba(47,123,216,0.08)'))
  return <Group listening={false}>{out}</Group>
}

