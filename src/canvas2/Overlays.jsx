import { Rect } from 'react-konva'
import { SelectionOutline } from './shapes'

/* ── Overlays: decoration only, never listens ────────────────────────────────
   The selection outline(s) and the marquee rect. Rendered in their own Layer,
   above the scene, with listening={false} on that Layer — an overlay must
   never intercept a press meant for an object underneath it (that was the
   ghost/decoy bug class, CANVAS2.md rule 5). This is the canvas2 analogue of
   the SVG engine's CanvasOverlays.jsx. */
export function Overlays({ selectedObjects, gridSize, marquee }) {
  return (
    <>
      {selectedObjects.map(o => <SelectionOutline key={o.id} obj={o} gridSize={gridSize} />)}
      {marquee && (
        <Rect
          x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
          fill="rgba(74,158,255,0.10)" stroke="#4a9eff" strokeWidth={1}
          dash={[4, 3]} strokeScaleEnabled={false} listening={false}
        />
      )}
    </>
  )
}
