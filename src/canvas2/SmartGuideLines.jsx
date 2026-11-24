import { Line } from 'react-konva'
import { create } from 'zustand'

/* ── (gen-lock) The snap guides of a drag, on a layer of their own ───────────────────────────────────────────────────
   They were the canvas's own React state, drawn by Overlays: a guide that came or went (every few frames of a drag past
   other racks) re-rendered the whole canvas — Canvas2, both Overlays parts and every overlay in them — and redrew the
   chrome layer with every row number in it. Here they are a small store, drawn by this one component on its own layer
   (Canvas2.jsx), so a change of guides redraws only them. Drawn exactly as before (CanvasArea's colours: wall and
   column snaps purple, object-to-object green; dashed; the stroke a fixed screen width). */
export const useSmartGuides = create(() => ({ guides: [] }))

const same = (a, b) => a === b || ((a?.length || 0) === 0 && (b?.length || 0) === 0) || (a?.length === b?.length && JSON.stringify(a) === JSON.stringify(b))
/** The drag's guides now; nothing happens when they are the ones already drawn. */
export function setSmartGuides(g) {
  if (!same(useSmartGuides.getState().guides, g)) useSmartGuides.setState({ guides: g || [] })
}

export function SmartGuideLines() {
  const guides = useSmartGuides(s => s.guides)
  return guides.map((g, i) => {
    const color = g.isWall ? '#a78bfa' : '#22c55e'
    const sw = g.isWall ? 1.5 : 1
    const points = g.axis === 'x' ? [g.val, g.from, g.val, g.to] : [g.from, g.val, g.to, g.val]
    return (
      <Line key={i} points={points} name={g.section ? 'section-snap-guide' : undefined}
        stroke={color} strokeWidth={sw} dash={[6, 3]} opacity={0.9}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false} />
    )
  })
}
