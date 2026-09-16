import { Group, Rect, Line, Circle, Text } from 'react-konva'
import { computeGroupOutline } from './groupRotate'

/* ── Group rotate chrome — pure paint, no Konva input ────────────────────────
   CanvasUI.jsx's GroupOutline ported, same colours/dash/sizes — but NOT its
   raw `/zoom` numbers verbatim for stroke widths and dash: that trick is
   what raw SVG needs to counteract ITS OWN coordinate space scaling with
   zoom, and Konva already has the equivalent, `strokeScaleEnabled={false}`
   (ResizeHandlesOverlay/SelectionOutline's own convention — see their
   comments). Applying BOTH (as this file's first cut did — BUG 20) double
   counteracts: strokeScaleEnabled=false already makes Konva treat the
   given number as the FINAL screen-pixel width regardless of the Stage's
   zoom scale, so feeding it an already-divided `5/zoom` made the stroke
   shrink at high zoom instead of staying constant. Stroke widths and the
   dash pattern below are therefore plain literals — SVG's own numbers,
   just not re-divided; everything that is an actual GEOMETRIC SIZE (the
   corner radius, the stalk/pad offsets baked into computeGroupOutline)
   still needs the manual /zoom, since Konva has no strokeScaleEnabled
   equivalent for a Rect's own width/height/cornerRadius.

   No spin() here: unlike a single object's handles, this box is a plain
   axis-aligned world-space rect around the selection's combined bounds —
   computeGroupOutline itself folds each member's own rotation into that
   box (see groupRotate.js), rather than this component rotating a Group.
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
        stroke="#c084fc" strokeWidth={5} opacity={0.2}
        cornerRadius={4 / zoom} strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false}
      />
      <Rect
        x={minX - pad} y={minY - pad}
        width={maxX - minX + pad * 2} height={maxY - minY + pad * 2}
        stroke="#c084fc" strokeWidth={2.5} dash={[8, 4]}
        cornerRadius={3 / zoom} strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false}
      />
      <Line points={[hx, ly, hx, hy + r]}
        stroke="#c084fc" strokeWidth={2}
        strokeScaleEnabled={false} listening={false} />
      <Circle x={hx} y={hy} radius={r}
        fill="#1e1230" stroke="#c084fc" strokeWidth={2}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false} />
      <Text x={hx - r} y={hy - r} width={r * 2} height={r * 2}
        text="↻" align="center" verticalAlign="middle"
        fontSize={13 / zoom} fontFamily="sans-serif" fill="#c084fc" fontStyle="bold"
        listening={false} />
    </Group>
  )
}
