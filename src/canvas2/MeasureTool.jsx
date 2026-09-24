// canvas2/MeasureTool.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The measure tool — click point A, click point B, read the real-world
// distance between them. There was no click-two-points distance tool in the
// SVG engine to port directly: its "Dimension" annotation (AnnotationPanel's
// ANNOT.DIMENSION) draws a permanent object saved to the scene, a heavier,
// different feature. This is new, minimal and ephemeral — nothing it draws is
// ever written to the store; it only reads the point(s) Canvas2's own click
// handler collected into local state.
//
// It reuses two pieces the SVG port already established rather than
// reinventing them: utils/canvas.js's pxToFtIn for the ft/in string
// (identical formatter to Rulers.jsx and every other canvas2 dimension label)
// and DimensionLabels.jsx's LabelPill for the constant-screen-size readout
// (fontSize/zoom, same trick every other label in this engine uses so text
// stays legible at any zoom instead of scaling with the drawing).
//
// Rendered inside the Stage in WORLD coordinates (unlike Rulers.jsx, which is
// screen-fixed chrome outside the Stage) — Konva's own pan/zoom transform on
// the Stage does the work of keeping the line and dots pinned to the two
// clicked world points, so there is no screen-space math here at all.
// ─────────────────────────────────────────────────────────────────────────────

import { Group, Line, Circle } from 'react-konva'
import { pxToFtIn } from '../utils/canvas'
import { LabelPill } from './DimensionLabels'

const CLR = '#f0b429'   // same amber family AisleLabel uses for other transient/derived readouts

/** `points`: 0-2 world points already clicked. `hover`: the live world point
 *  under the cursor while exactly one point is placed, for a moving preview
 *  line before the second click lands. */
export function MeasureOverlay({ points, hover, zoom, gridSize }) {
  if (!points?.length) return null
  const a = points[0]
  const b = points[1] ?? hover
  const r = 3.5 / zoom

  if (!b) {
    return (
      <Group name="measure-tool" listening={false}>
        <Circle x={a.x} y={a.y} radius={r} fill={CLR} listening={false} />
      </Group>
    )
  }

  const dist  = Math.hypot(b.x - a.x, b.y - a.y)
  const label = pxToFtIn(dist, gridSize)
  const fs    = 11 / zoom

  return (
    <Group name="measure-tool" listening={false}>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={CLR} strokeWidth={1.5 / zoom}
        dash={[6 / zoom, 4 / zoom]} listening={false} />
      <Circle x={a.x} y={a.y} radius={r} fill={CLR} listening={false} />
      <Circle x={b.x} y={b.y} radius={r} fill={CLR} listening={false} />
      <LabelPill cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} text={label} fontSize={fs} zoom={zoom}
        color="#78350f" bg="rgba(255,251,235,0.95)" padX={4 / zoom} heightScale={1.5}
        stroke={CLR} strokeWidth={0.75 / zoom} opacity={0.98} />
    </Group>
  )
}
