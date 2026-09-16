import { Group, Rect, Line, Circle, Text } from 'react-konva'
import { computeGroupOutline } from './groupRotate'

/* ── Group rotate chrome — pure paint, no Konva input ────────────────────────
   CanvasUI.jsx's GroupOutline ported verbatim (same colours/dash/sizes). No
   spin() here: unlike a single object's handles, this box is a plain
   axis-aligned world-space rect around the selection's combined bounds, not
   attached to any one object's own rotation — exactly what the SVG draws.
   No onMouseDown either: which press lands on the handle is decided once,
   geometrically, in useCanvasInteraction's onStageMouseDown via
   groupRotate.js's groupRotateHandleHitTest, the same function this uses to
   know WHERE to draw it (CANVAS2.md rule 4). */
export function GroupRotateOverlay({ objects, zoom }) {
  const g = computeGroupOutline(objects, zoom)
  if (!g) return null
  const { minX, minY, maxX, maxY, pad, hx, hy, ly, r } = g

  return (
    <Group name="grouprotate" listening={false}>
      <Rect
        x={minX - pad - 3 / zoom} y={minY - pad - 3 / zoom}
        width={maxX - minX + pad * 2 + 6 / zoom} height={maxY - minY + pad * 2 + 6 / zoom}
        stroke="#c084fc" strokeWidth={5 / zoom} opacity={0.2}
        cornerRadius={4 / zoom} strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false}
      />
      <Rect
        x={minX - pad} y={minY - pad}
        width={maxX - minX + pad * 2} height={maxY - minY + pad * 2}
        stroke="#c084fc" strokeWidth={2.5 / zoom} dash={[8 / zoom, 4 / zoom]}
        cornerRadius={3 / zoom} strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false}
      />
      <Line points={[hx, ly, hx, hy + r]}
        stroke="#c084fc" strokeWidth={2 / zoom}
        strokeScaleEnabled={false} listening={false} />
      <Circle x={hx} y={hy} radius={r}
        fill="#1e1230" stroke="#c084fc" strokeWidth={2 / zoom}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false} />
      <Text x={hx - r} y={hy - r} width={r * 2} height={r * 2}
        text="↻" align="center" verticalAlign="middle"
        fontSize={13 / zoom} fontFamily="sans-serif" fill="#c084fc" fontStyle="bold"
        listening={false} />
    </Group>
  )
}
