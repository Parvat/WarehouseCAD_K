// canvas2/Rulers.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Edge rulers — ported from the SVG engine's Rulers.jsx (src/_svg_reference).
// Same visual design (a 20px top/left band, a 1-2-5 tick ladder, inch ticks
// once they're far enough apart to read) and the same formatter
// (utils/canvas.js's pxToFtIn), but the tick MATH is rebuilt on canvas2's own
// transform instead of the original's screen-space modular-arithmetic trick:
// every tick position here is `worldToScreen(view, {x: ft*gridSize, y: 0})`,
// the same function everything else in canvas2 uses to place a world point on
// screen (viewport.js's `screen = world*zoom + pan`). That also sidesteps the
// original's fixed SPAN_PX=3000 assumption (a hardcoded "widest viewport the
// tick band must cover") — ticks are generated for whatever world range the
// CURRENT container width/height actually shows, so an ultra-wide monitor or
// an extreme zoom-out on a large building never runs short.
//
// Plain HTML/SVG, not Konva — this is chrome that sits OVER the Stage, at
// fixed screen positions, the same way the SVG engine's version sat over its
// own canvas: rendered as siblings inside canvas2-container, not inside the
// Stage itself.
// ─────────────────────────────────────────────────────────────────────────────

import { worldToScreen, screenToWorld } from './viewport'
import { pxToFtIn } from '../utils/canvas'

const RULER_PX     = 20   // band thickness — matches the original's w-5/h-5
const MIN_LABEL_PX  = 56  // labelled ticks need room for the text
const MIN_TICK_PX   = 6   // bare inch ticks
const LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]

/* 1-2-5 ladder: smallest tick interval (in feet) whose on-screen spacing
   clears minPx at the current zoom. */
function chooseStepFt(gridSize, zoom, minPx) {
  for (const n of LADDER) if (gridSize * n * zoom >= minPx) return n
  return LADDER[LADDER.length - 1]
}

/* Every whole-stepFt tick whose world position falls within [0, spanPx] of
   screen space, plus one step of padding either side so a partially-visible
   label at the very edge still draws. `worldAt(px)` reads the world
   coordinate (in feet, along whichever axis the caller means) under a given
   screen offset — screenToWorld does the real work; this just walks the
   ladder-quantized range between the two ends. */
function footTicksFt(view, gridSize, spanPx, worldFtAt) {
  const stepFt = chooseStepFt(gridSize, view.zoom, MIN_LABEL_PX)
  const loFt = worldFtAt(0)
  const hiFt = worldFtAt(spanPx)
  const from = Math.floor(Math.min(loFt, hiFt) / stepFt) * stepFt - stepFt
  const to   = Math.ceil(Math.max(loFt, hiFt) / stepFt) * stepFt + stepFt
  const ticks = []
  for (let ft = from; ft <= to; ft += stepFt) ticks.push(ft)
  return { stepFt, ticks }
}

function HRuler({ view, gridSize, widthPx }) {
  const bandW = Math.max(0, widthPx - RULER_PX)
  const worldFtAt = (px) => screenToWorld(view, { x: px + RULER_PX, y: 0 }).x / gridSize
  const { stepFt, ticks } = footTicksFt(view, gridSize, bandW, worldFtAt)
  const showInches = stepFt === 1 && (gridSize / 12) * view.zoom >= MIN_TICK_PX

  const screenXFor = (ft) => worldToScreen(view, { x: ft * gridSize, y: 0 }).x - RULER_PX

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: RULER_PX, right: 0, height: RULER_PX,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        overflow: 'hidden', zIndex: 10, pointerEvents: 'none',
      }}
    >
      <svg width={bandW} height={RULER_PX} style={{ position: 'absolute' }}>
        {ticks.map((ft) => {
          const x = screenXFor(ft)
          return (
            <g key={ft}>
              <line x1={x} y1={8} x2={x} y2={RULER_PX} stroke="var(--border)" strokeWidth="1" />
              <text x={x + 2} y={9} fontSize="7" fill="var(--text3)" fontFamily="JetBrains Mono,monospace">
                {pxToFtIn(ft * gridSize, gridSize)}
              </text>
            </g>
          )
        })}
        {showInches && ticks.map((ft) =>
          Array.from({ length: 11 }, (_, i) => i + 1).map((inch) => {
            const x = screenXFor(ft + inch / 12)
            return <line key={`${ft}.${inch}`} x1={x} y1={14} x2={x} y2={RULER_PX} stroke="var(--border)" strokeWidth="1" opacity={0.6} />
          })
        )}
      </svg>
    </div>
  )
}

function VRuler({ view, gridSize, heightPx }) {
  const bandH = Math.max(0, heightPx - RULER_PX)
  const worldFtAt = (px) => screenToWorld(view, { x: 0, y: px + RULER_PX }).y / gridSize
  const { stepFt, ticks } = footTicksFt(view, gridSize, bandH, worldFtAt)
  const showInches = stepFt === 1 && (gridSize / 12) * view.zoom >= MIN_TICK_PX

  const screenYFor = (ft) => worldToScreen(view, { x: 0, y: ft * gridSize }).y - RULER_PX

  return (
    <div
      style={{
        position: 'absolute', top: RULER_PX, left: 0, bottom: 0, width: RULER_PX,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        overflow: 'hidden', zIndex: 10, pointerEvents: 'none',
      }}
    >
      <svg width={RULER_PX} height={bandH} style={{ position: 'absolute' }}>
        {ticks.map((ft) => {
          const y = screenYFor(ft)
          return (
            <g key={ft}>
              <line x1={8} y1={y} x2={RULER_PX} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={10} y={y + 2} fontSize="7" fill="var(--text3)" fontFamily="JetBrains Mono,monospace"
                textAnchor="middle" transform={`rotate(-90,10,${y + 2})`}>
                {pxToFtIn(ft * gridSize, gridSize)}
              </text>
            </g>
          )
        })}
        {showInches && ticks.map((ft) =>
          Array.from({ length: 11 }, (_, i) => i + 1).map((inch) => {
            const y = screenYFor(ft + inch / 12)
            return <line key={`${ft}.${inch}`} x1={14} y1={y} x2={RULER_PX} y2={y} stroke="var(--border)" strokeWidth="1" opacity={0.6} />
          })
        )}
      </svg>
    </div>
  )
}

/** `view` is `{ zoom, panX, panY }` — the same shape viewport.js's own
 *  functions take, read straight from the store the way every other piece of
 *  canvas2 chrome (labels, overlays) already does: on the same rAF the Stage
 *  itself is repositioned on, not the ref that's live mid-gesture (comment at
 *  Canvas2.jsx's own `syncStore` explains why that's the established
 *  pattern — "the store is updated on a rAF so the zoom readout ... stay in
 *  step without being in the hot path"). `size` is the container's own
 *  `{ w, h }` (useContainerSize) — nothing renders until it's known. */
export function Rulers({ view, gridSize, size }) {
  if (!size || !(size.w > 0) || !(size.h > 0)) return null
  return (
    <>
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: RULER_PX, height: RULER_PX,
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)', zIndex: 20, pointerEvents: 'none',
        }}
      />
      <HRuler view={view} gridSize={gridSize} widthPx={size.w} />
      <VRuler view={view} gridSize={gridSize} heightPx={size.h} />
    </>
  )
}
