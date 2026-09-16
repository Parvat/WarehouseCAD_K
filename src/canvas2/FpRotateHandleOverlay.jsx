import { Line, Circle, Text } from 'react-konva'
import { computeFpRotateHandle } from './fpRotate'

/* ── Floor-plan rotate handle — pure paint, no Konva input ───────────────────
   FpRotateHandle ported (same stalk/circle/glyph geometry and colours). No
   spin() here, unlike a rack's rotate handle: a building's rotation is
   baked directly into fpVerts (FloorPlanShape paints no separate rotation
   transform — fpRotate.js's own header), so computeFpRotateHandle already
   reads the LIVE (possibly mid-rotate) verts every render — an ordinary
   React re-render is what keeps this "live bounds, not stale" (the fp
   rotate drag writes a real store update every frame, exactly like BUG 13's
   wall drag, so this component simply re-renders from fresh data each
   frame with no imperative sync needed at all).

   BUG 24: computeFpRotateHandle no longer anchors to an AABB (the earlier
   version's own "live bounds, not stale" wasn't the whole story — an AABB
   IS live, but it isn't RIGID, so the handle still visibly wobbled as the
   building turned). It now anchors to the polygon's own first edge, with
   an outward NORMAL direction rather than a fixed "straight up" — the
   stalk's near-wall point (lx,ly) and near-circle point are no longer
   both directly above rx,ry, so both ends are computed from the normal
   explicitly instead of assuming a vertical line.

   No onMouseDown either: which press lands on the handle is decided once,
   geometrically, in useCanvasInteraction's onStageMouseDown via
   fpRotate.js's fpRotateHandleHitTest, the same function this uses to know
   WHERE to draw it (CANVAS2.md rule 4). */
export function FpRotateHandleOverlay({ obj, gridSize, zoom }) {
  const h = computeFpRotateHandle(obj, gridSize, zoom)
  if (!h) return null
  const { rx, ry, lx, ly, nx, ny, r } = h

  return (
    <>
      <Line points={[lx, ly, rx - nx * r, ry - ny * r]}
        stroke="#f0b429" strokeWidth={1.2} opacity={0.7}
        strokeScaleEnabled={false} listening={false} />
      <Circle x={rx} y={ry} radius={r}
        fill="#16181d" stroke="#f0b429" strokeWidth={1.8}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false} />
      <Text x={rx - r} y={ry - r} width={r * 2} height={r * 2}
        text="↻" align="center" verticalAlign="middle"
        fontSize={10 / zoom} fontFamily="sans-serif" fill="#f0b429"
        listening={false} />
    </>
  )
}
