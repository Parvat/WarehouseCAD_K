import { Group, Rect } from 'react-konva'
import { rackFootprint } from '../generate/columnCheck'
import { rackDrawOps, PORTED_RACK_TYPES } from '../render/rackOps'
import { RackShape, ZoneShape } from './shapes'
import { usePlacement, placementTags } from '../utils/placement'
import { RackLabels, AisleLabelItem } from './DimensionLabels'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLabelPrefs } from './labelPrefs'
import { labelScale, aisleLabelScale } from '../render/labelSize'
import { layerShown } from '../utils/layers'

/* ── A row (or a zone) being placed, on the canvas ─────────────────────────────
   PlacementGhost: it follows the mouse, faded; its outline turns red where it cannot go, orange in a
   cross-aisle (placed, with a warning — utils/placement.js). A tagged placement (the Split tool's piece)
   also draws what a selected rack shows in a normal drag: its size / depth / beam tags (RackLabels) and
   live aisle labels to the facing rows (placementTags), the same components Overlays.jsx uses; no
   handles. Pure paint; the bar is DOM
   (RowGroupBar.jsx). The Row group's own preview is RowGroupPreview.jsx. */

const PREVIEW = '#2F7BD8'
const BLOCKED = '#C0392B'
const WARNED = '#E67E22'

const outline = (f, color, key, dash = [6, 4], fill = 'transparent') => (
  <Rect key={key} x={f.x} y={f.y} width={f.w} height={f.h} stroke={color} strokeWidth={1.5} dash={dash} fill={fill}
    strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
)

export function PlacementGhost({ gridSize }) {
  const a = usePlacement(s => s.active)
  const objects = useCanvasStore(s => s.objects)
  const showAisles = useCanvasStore(s => s.showAisles ?? true)
  const layers = useCanvasStore(s => s.layers)
  const labelSize = useLabelPrefs(s => s.labelSize)
  if (!a) return null
  const tags = placementTags(a, objects, gridSize)
  const lz = labelScale(labelSize, gridSize)
  const aislesOn = showAisles && layerShown(layers, 'aisles')
  const color = a.blocked ? BLOCKED : a.crossAisle ? WARNED : PREVIEW
  return (
    <Group listening={false}>
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
    {/* drawn where the racks are now (placementTags already moved them), so outside the moved group */}
    {aislesOn && tags.aisles.map(t => <AisleLabelItem key={t.aisle.id} aisle={t.aisle} row1={t.row1} row2={t.row2} lz={aisleLabelScale(t.aisle, labelSize, gridSize)} gridSize={gridSize} />)}
    {tags.racks.map(o => <RackLabels key={'rl:' + o.id} obj={o} zoom={lz} gridSize={gridSize} />)}
    </Group>
  )
}
