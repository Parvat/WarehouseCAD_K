import { Group, Rect, Line, Circle } from 'react-konva'
import { getObjectBounds, getHandlePositions } from '../utils/canvas'
import { spin } from './shapes'
import { enabledHandlesFor, rotateEnabledFor, rotateHandlePos, handlePad } from './handleGeometry'

/* ── Resize + rotate handles — pure paint, no Konva input of any kind ────────
   No onMouseDown, no draggable, no per-node listener: Konva is pure paint
   here exactly like every other object node (CANVAS2.md rule 4). Which
   handle a press lands on is decided once, geometrically, in
   useCanvasInteraction's onStageMouseDown via handleGeometry.js's
   handleHitTest — the SAME function this file calls to know WHERE to draw
   them, so a handle can never be painted somewhere a click can't reach or
   vice versa.

   Geometry ported from CanvasUI.jsx's ResizeHandles: getHandlePositions for
   the 8 corner/edge squares, the same 70px/8px rotate-handle constants, the
   same per-type suppression (handleGeometry.js). CanvasUI draws these inside
   a `<g transform="rotate(...)">` ancestor that turns the whole group for
   free; this Group uses the identical trick every other painter here does —
   spin(obj, gridSize), the SAME centre-origin transform RackShape rotates
   with — so the numbers below are the object's own UNROTATED bounds and the
   Group does the turning, never a second rotation computed by hand.

   Sized the same way SelectionOutline is: strokeScaleEnabled={false} with a
   small literal strokeWidth for constant-screen-width lines (Konva's own
   mechanism), and world-space width/height/radius computed as
   screenPx / zoom for constant-screen-SIZE shapes (there is no Konva
   equivalent of strokeScaleEnabled for a Rect's own width/height — CanvasUI
   divides by zoom for the exact same reason, and this is the same trick,
   not a different one). */
export function ResizeHandlesOverlay({ obj, zoom, gridSize = 40 }) {
  const enabled = enabledHandlesFor(obj.type)
  const canRotate = rotateEnabledFor(obj.type)
  if (!enabled.length && !canRotate) return null

  const bounds = getObjectBounds(obj)
  /* Same pad handleHitTest uses (handleGeometry.js) — see its own comment
     for why this can't be getHandlePositions' unscaled default: the painted
     square and the world-space hit box it must exactly match both need a
     screen-constant pad, not a fixed few world units that vanish at 7%. */
  const positions = getHandlePositions(bounds, handlePad(zoom))
  const hs = 6 / zoom

  return (
    <Group listening={false} {...spin(obj, gridSize)}>
      {enabled.map(h => {
        const hp = positions[h]
        if (!hp) return null
        return (
          <Rect key={h}
            x={hp.x - hs} y={hp.y - hs} width={hs * 2} height={hs * 2}
            fill="#0e1420" stroke="#4a9eff" strokeWidth={1}
            strokeScaleEnabled={false} perfectDrawEnabled={false}
            shadowForStrokeEnabled={false} listening={false}
          />
        )
      })}
      {canRotate && (() => {
        const { x: rx, y: ry } = rotateHandlePos(bounds, zoom)
        const lineY = bounds.y - 6 / zoom
        const r = 8 / zoom
        return (
          <>
            <Line points={[rx, lineY, rx, ry + 7 / zoom]}
              stroke="#f0b429" strokeWidth={1.5} opacity={0.8}
              strokeScaleEnabled={false} listening={false} />
            <Circle x={rx} y={ry} radius={r}
              fill="#16181d" stroke="#f0b429" strokeWidth={1.8}
              strokeScaleEnabled={false} perfectDrawEnabled={false}
              shadowForStrokeEnabled={false} listening={false} />
          </>
        )
      })()}
    </Group>
  )
}
