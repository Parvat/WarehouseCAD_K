import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useColumnCheck } from '../../generate/useColumnCheck'

/* ── Column-check red markings ───────────────────────────────────────────────
   A read-only layer. It draws `redMarks` straight from checkColumns and never
   touches the rack objects — a conflict is a fact about the layout, not a
   property of the rack, so nothing here is persisted onto one.

   It portals into #canvas-container rather than being rendered by CanvasArea,
   which is off-limits. That container is `relative` and the real canvas svg is
   `absolute inset-0` inside it, so an svg placed there shares the canvas's
   coordinate space exactly; applying the same
   `translate(panX,panY) scale(zoom)` the canvas uses on its own groups puts
   these rects on the same pixels as the racks they mark, at every zoom.

   pointer-events:none throughout — the marks must never eat a click meant for
   the rack underneath. */

/* Conflict red, from the locked symbology palette in
   trace-object-design-spec.md — the same value the rack renderer reserves, so
   a flagged slot reads as part of the drawing rather than a UI alert. */
const RED = '#C0392B'

export function ColumnCheckOverlay() {
  const zoom = useCanvasStore(s => s.zoom)
  const panX = useCanvasStore(s => s.panX)
  const panY = useCanvasStore(s => s.panY)
  const { result, showMarks } = useColumnCheck()

  /* The container is not committed on first render, so the portal target is
     read in an effect (same rule the floating panels follow). */
  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.getElementById('canvas-container')) }, [])

  if (!host || !showMarks) return null

  const marks = result.redMarks || []
  if (!marks.length) return null

  /* Everything decorative is sized in SCREEN px and divided by zoom to survive
     the group's scale(). A hairline would otherwise become a slab zoomed in,
     and the hatch would shrink to mud zoomed out — a column/rack overlap is
     often only a foot square, which at 46% zoom is ~18px, far finer than a
     world-space hatch can resolve. */
  const hair  = 1.5 / zoom
  const tile  = 9 / zoom   // hatch repeat, constant on screen
  const band  = 3.6 / zoom

  return createPortal(
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', zIndex: 6 }}
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse anchors the hatch to world space so it slides with
            the layout rather than crawling across it; the zoom-scaled tile
            keeps its density constant on screen. "Solid-ish": a red wash
            carries the mark at any size, the bands give it the hazard read. */}
        <pattern id="cc-hatch" width={tile} height={tile}
          patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          {/* Heavy enough to win over the structural column's own indigo, which
              shows through underneath and otherwise turns the mark purple. */}
          <rect width={tile} height={tile} fill={RED} fillOpacity="0.45" />
          <line x1="0" y1="0" x2="0" y2={tile} stroke={RED} strokeWidth={band} strokeOpacity="0.9" />
        </pattern>
      </defs>

      <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
        {marks.map((m, i) => m.kind === 'aisle-blocked' ? (
          /* A blocked aisle is a bar across the full travel gap — the column
             is not the problem, the pass either side of it is. */
          <g key={i}>
            <rect x={m.x} y={m.y} width={m.w} height={m.h}
              fill={RED} fillOpacity="0.30" />
            <rect x={m.x} y={m.y} width={m.w} height={m.h}
              fill="none" stroke={RED} strokeWidth={hair * 1.4} />
          </g>
        ) : (
          /* A column inside a rack hatches the slot it consumes. */
          <g key={i}>
            <rect x={m.x} y={m.y} width={m.w} height={m.h} fill="url(#cc-hatch)" />
            <rect x={m.x} y={m.y} width={m.w} height={m.h}
              fill="none" stroke={RED} strokeWidth={hair} />
          </g>
        ))}
      </g>
    </svg>,
    host
  )
}
