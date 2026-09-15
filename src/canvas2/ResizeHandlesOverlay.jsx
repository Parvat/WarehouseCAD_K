import { Group, Rect, Line, Circle, Text } from 'react-konva'
import { spin } from './shapes'
import { computeHandleLayout } from './handleGeometry'

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
  const layout = computeHandleLayout(obj, zoom)
  const { enabled, positions, hs, canRotate, rotateHandle } = layout
  if (!enabled.length && !canRotate) return null

  return (
    <Group name={'handles:' + obj.id} listening={false} {...spin(obj, gridSize)}>
      {enabled.map(h => {
        const hp = positions[h]
        if (!hp) return null
        return (
          <Rect key={h} name={'handlebox:' + h}
            x={hp.x - hs} y={hp.y - hs} width={hs * 2} height={hs * 2}
            fill="#0e1420" stroke="#4a9eff" strokeWidth={1}
            strokeScaleEnabled={false} perfectDrawEnabled={false}
            shadowForStrokeEnabled={false} listening={false}
          />
        )
      })}
      {canRotate && (() => {
        const { rx, ry, lineY, r } = rotateHandle
        return (
          <>
            <Line name="handleline" points={[rx, lineY, rx, ry + 7 / zoom]}
              stroke="#f0b429" strokeWidth={1.5} opacity={0.8}
              strokeScaleEnabled={false} listening={false} />
            <Circle name="handlecircle" x={rx} y={ry} radius={r}
              fill="#16181d" stroke="#f0b429" strokeWidth={1.8}
              strokeScaleEnabled={false} perfectDrawEnabled={false}
              shadowForStrokeEnabled={false} listening={false} />
            {/* The glyph CanvasUI.jsx paints on its own rotate handle — same
                character, same colour, sized the same screen-constant way as
                everything else here. A width/height box the same size as the
                circle plus Konva's own align/verticalAlign centres it
                properly, rather than guessing an offset by eye. */}
            <Text name="handleglyph" x={rx - r} y={ry - r} width={r * 2} height={r * 2}
              text="↻" align="center" verticalAlign="middle"
              fontSize={10 / zoom} fontFamily="sans-serif" fill="#f0b429"
              listening={false} />
          </>
        )
      })()}
    </Group>
  )
}

/** The imperative twin of the render above — same computeHandleLayout, same
 *  spin(), applied straight to an already-mounted Konva Group instead of
 *  returned as JSX. Called from useCanvasInteraction's resize/rotate
 *  mousemove (the same frame that writes the live preview to the store), so
 *  the handles track the live gesture instead of waiting for React's own
 *  re-render to reach this component — the resize/rotate counterpart to BUG
 *  6's collectDragNodes trick for plain object drag's sel:/obj: nodes. Only
 *  positions/points move: hs and r depend on zoom alone, which cannot change
 *  mid-gesture, so widths/radii never need touching here. */
export function syncHandleOverlayNode(group, obj, zoom, gridSize = 40) {
  const t = spin(obj, gridSize)
  group.position({ x: t.x, y: t.y })
  group.offset({ x: t.offsetX, y: t.offsetY })
  group.rotation(t.rotation)

  const { positions, hs, rotateHandle } = computeHandleLayout(obj, zoom)
  for (const child of group.getChildren()) {
    const nm = child.name() || ''
    if (nm.startsWith('handlebox:')) {
      const hp = positions[nm.slice('handlebox:'.length)]
      if (hp) child.position({ x: hp.x - hs, y: hp.y - hs })
    } else if (rotateHandle) {
      const { rx, ry, lineY, r } = rotateHandle
      if (nm === 'handleline') child.points([rx, lineY, rx, ry + 7 / zoom])
      else if (nm === 'handlecircle') child.position({ x: rx, y: ry })
      else if (nm === 'handleglyph') child.position({ x: rx - r, y: ry - r })
    }
  }
}
