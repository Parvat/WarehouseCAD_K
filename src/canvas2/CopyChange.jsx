import { Group, Rect, Line } from 'react-konva'
import { rackFootprint } from '../generate/columnCheck'
import { rackDrawOps, PORTED_RACK_TYPES } from '../render/rackOps'
import { RackShape, ZoneShape } from './shapes'
import { usePlacement, placementDistances } from '../utils/placement'
import { LabelPill } from './DimensionLabels'
import { useCanvasStore } from '../store/useCanvasStore'
import { pxToFtIn } from '../utils/canvas'

/* ── A row (or a zone) being placed, on the canvas ─────────────────────────────
   PlacementGhost: it follows the mouse, faded; its outline turns red where it cannot go, orange in a
   cross-aisle (placed, with a warning — utils/placement.js). A measuring placement (the Split tool's
   piece) also draws live distances (placementDistances): a dimension line from each face to the nearest
   rack or wall ahead, and the gap to the rack it was cut from in amber — at SCREEN size (divided by the
   view zoom), like the measure tool, so they read the same at any zoom. Pure paint; the bar is DOM
   (RowGroupBar.jsx). The Row group's own preview is RowGroupPreview.jsx. */

const PREVIEW = '#2F7BD8'
const BLOCKED = '#C0392B'
const WARNED = '#E67E22'

const GAP = '#D97706'
const TICK_PX = 5, FONT_PX = 11, NEAR_PX = 70

/** One live distance: a line from the face to what it reaches, a tick at each end, a pill with the length —
 *  at the middle of the line, but never more than NEAR_PX (on screen) from the face, so a long one stays in view. */
function Distance({ d, zoom, gridSize }) {
  const c = d.kind === 'from' ? GAP : PREVIEW, t = TICK_PX / zoom
  const P = (u, v) => (d.axis === 'x' ? [u, v] : [v, u])
  const len = Math.abs(d.b - d.a), m = d.a + Math.sign(d.b - d.a) * Math.min(len / 2, NEAR_PX / zoom)
  return (
    <Group listening={false}>
      {d.b !== d.a && <Line points={[...P(d.a, d.at), ...P(d.b, d.at)]} stroke={c} strokeWidth={1} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />}
      {[d.a, d.b].map((u, i) => <Line key={i} points={[...P(u, d.at - t), ...P(u, d.at + t)]} stroke={c} strokeWidth={1} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />)}
      <LabelPill cx={d.axis === 'x' ? m : d.at} cy={d.axis === 'x' ? d.at : m} text={pxToFtIn(len, gridSize)} fontSize={FONT_PX / zoom} zoom={zoom} color={d.kind === 'from' ? '#FBBF24' : '#4a9eff'} />
    </Group>
  )
}

const outline = (f, color, key, dash = [6, 4], fill = 'transparent') => (
  <Rect key={key} x={f.x} y={f.y} width={f.w} height={f.h} stroke={color} strokeWidth={1.5} dash={dash} fill={fill}
    strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
)

export function PlacementGhost({ gridSize }) {
  const a = usePlacement(s => s.active)
  const objects = useCanvasStore(s => s.objects)
  const zoom = useCanvasStore(s => s.zoom) || 1
  if (!a) return null
  const distances = placementDistances(a, objects, gridSize)
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
    {/* measured where the rack is now (placementDistances already moved it), so outside the moved group */}
    {distances.map((d, i) => <Distance key={d.axis + i} d={d} zoom={zoom} gridSize={gridSize} />)}
    </Group>
  )
}
