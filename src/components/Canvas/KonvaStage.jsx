import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Stage, Layer } from 'react-konva'
import { KonvaGrid, KonvaFloorPlan, KonvaOps, FP_RENDER_TYPES } from './KonvaScene'
import { rackDrawOps, PORTED_RACK_TYPES } from '../../render/rackOps'
import { useKonvaRackInteraction, rackNodeName, fpNodeName } from './useKonvaRackInteraction'
import { KonvaOverlay } from './KonvaOverlay'
import { KonvaFallbackObject } from './KonvaFallback'
import { KonvaTransformer } from './KonvaTransformer'
import { getObjectBounds } from '../../utils/canvas'
import { useCanvasStore } from '../../store/useCanvasStore'
import { subscribeKonvaFlag, isKonvaEnabled } from './konvaFlag'

/* ── STEP 1 of the Konva migration ───────────────────────────────────────────
   Stage + layers mounted, container-sized, with pan/zoom on the Stage.
   Nothing else — no real objects yet, just a test shape to prove the transform.

   It PORTALS into #canvas-container rather than being rendered by CanvasArea,
   so the existing renderer is untouched and the flag is a genuine on/off: with
   it off, not a single line of this file runs.

   Pan/zoom is driven by the store's panX/panY/zoom, the same values the SVG
   reads, so both renderers stay locked together while parity is built. The
   point of the migration is visible here already: panning changes three Stage
   properties and Konva re-composites, where the SVG path re-renders React
   components for every object on the sheet.

   pointer-events:none while the flag is a preview — step 4 turns hit-testing on
   deliberately. Until then the Stage must not be able to swallow a click meant
   for the live canvas underneath. */

const LAYER_PROPS = { listening: false }

/* Konva wants explicit pixel dimensions; the container is flex-sized. */
function useContainerSize(el) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return size
}

/* Theme colours reach Konva as literals: canvas has no CSS variables, so the
   grid inks are read off the themed root element and refreshed whenever the
   theme changes. */
function useGridColors(uiTheme) {
  return useMemo(() => {
    try {
      const cs = getComputedStyle(document.querySelector('[data-theme]'))
      return {
        major: cs.getPropertyValue('--grid-major').trim() || 'rgba(107,114,128,0.34)',
        minor: cs.getPropertyValue('--grid-minor').trim() || 'rgba(107,114,128,0.14)',
      }
    } catch {
      return { major: 'rgba(107,114,128,0.34)', minor: 'rgba(107,114,128,0.14)' }
    }
  }, [uiTheme])
}

export function KonvaStage() {
  const enabled = useSyncExternalStore(subscribeKonvaFlag, isKonvaEnabled, () => false)

  /* The container is not committed on first mount, so the portal target is read
     in an effect — the same rule the other floating canvas layers follow. */
  const stageRef = useRef(null)
  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.getElementById('canvas-container')) }, [enabled])

  /* ── ONE visible renderer ──────────────────────────────────────────────────
     With the flag on, Konva is the canvas and the SVG is hidden outright. That
     single change is what removes three separate symptoms at once: the "ghost"
     second copy of every object, resize handles being swallowed (a capture
     listener cannot be stopped by the SVG's stopPropagation), and the
     floor-plan preview lag from two renderers previewing on different clocks.

     It is `opacity: 0`, NOT `display: none`, and that is not a detail.
     CanvasArea attaches onMouseDown / onMouseMove / onMouseUp to the <svg>
     element itself, so display:none takes it out of hit-testing and kills the
     app's entire input surface — pan, marquee, every drawing tool and
     double-click-to-edit all stop responding. Measured: with display:none a
     click-to-select returns 0 selected; with opacity:0 it returns 1. Opacity
     removes the pixels and keeps the event surface, which is exactly the split
     we want until the input layer itself moves to Konva.

     Inline style on purpose, not a stylesheet rule: exportToPDF clones
     #canvas-svg and calls removeAttribute('style') on the clone, so an inline
     hide is dropped from the export, while a CSS rule would be carried into it
     and produce a blank PDF. Export measures the CONTAINER, never the svg.

     Restored on cleanup, so toggling the flag off puts the SVG straight back. */
  useEffect(() => {
    const svg = document.getElementById('canvas-svg')
    if (!svg) return
    if (!enabled) { svg.style.opacity = ''; return }
    const prev = svg.style.opacity
    svg.style.opacity = '0'
    return () => { svg.style.opacity = prev }
  }, [enabled, host])

  const size     = useContainerSize(host)
  const zoom     = useCanvasStore(s => s.zoom)
  const panX     = useCanvasStore(s => s.panX)
  const panY     = useCanvasStore(s => s.panY)
  const gridSize = useCanvasStore(s => s.gridSize)
  const objects  = useCanvasStore(s => s.objects)
  const showGrid = useCanvasStore(s => s.showGrid)
  const uiTheme  = useCanvasStore(s => s.uiTheme)
  const colors   = useGridColors(uiTheme)
  const floorPlans = useMemo(
    () => objects.filter(o => FP_RENDER_TYPES.has(o.type) && o.fpVerts), [objects])
  /* Only the types rackOps can already draw. Anything else stays with the SVG
     renderer, so a half-ported symbol never appears.

     Full detail at every zoom — no level-of-detail collapse. Consolidating a
     rack to two nodes made that cheap, and it leaves this memo independent of
     zoom entirely: panning and zooming now rebuild nothing here. */
  const rackOps = useMemo(() => objects
    .filter(o => PORTED_RACK_TYPES.has(o.type))
    .map(o => {
      const b = getObjectBounds(o)
      return { id: o.id, opacity: o.opacity ?? 1,
               cx: b.x + b.width / 2, cy: b.y + b.height / 2,
               rotation: o.rotation || 0,
               ops: rackDrawOps(o, { gridSize }) }
    })
    .filter(r => r.ops), [objects, gridSize])
  /* Everything no native symbol claimed. With the SVG hidden this is the only
     thing keeping those objects on the sheet, so it is deliberately a catch-all
     rather than a list: a type added to the library tomorrow still appears. */
  const others = useMemo(() => objects.filter(o =>
    !PORTED_RACK_TYPES.has(o.type) && !(FP_RENDER_TYPES.has(o.type) && o.fpVerts)),
    [objects])


  /* Racks own their clicks once the Konva layer is on. The hook hit-tests via
     the Konva stage but listens on the container, so the SVG keeps everything
     it is not asked to give up — see useKonvaRackInteraction. */
  useKonvaRackInteraction(stageRef, enabled && !!host)

  if (!enabled || !host || size.w === 0 || size.h === 0) return null

  return createPortal(
    <div
      data-konva-root
      /* THE pointer surface. Every press lands here first and the router
         decides who owns it — Konva for objects and the Transformer, the SVG
         for canvas gestures, by re-dispatch. See konvaInputRouter. */
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', zIndex: 4 }}
    >
      <Stage
        ref={stageRef}
        width={size.w} height={size.h}
        /* Pan and zoom live here and nowhere else. */
        x={panX} y={panY} scaleX={zoom} scaleY={zoom}
        listening
      >
        {/* 1 · background — grid (rulers still SVG-side for now) */}
        <Layer {...LAYER_PROPS}>
          {showGrid && <KonvaGrid gridSize={gridSize} majorColor={colors.major} minorColor={colors.minor} />}
        </Layer>
        {/* 2 · objects — building, racks, columns (steps 2–3) */}
        <Layer listening>
          {floorPlans.map(o => <KonvaFloorPlan key={o.id} obj={o} gridSize={gridSize} zoom={zoom} name={fpNodeName(o.id)} listening />)}
          {others.map(o => (
            <KonvaFallbackObject key={o.id} obj={o} name={rackNodeName(o.id)} gridSize={gridSize} listening />
          ))}
          {rackOps.map(r => <KonvaOps key={r.id} name={rackNodeName(r.id)} ops={r.ops} opacity={r.opacity}
            cx={r.cx} cy={r.cy} rotation={r.rotation} listening />)}
        </Layer>
        {/* 3 · overlay — handles, dimension labels, conflict marks, and the
            Transformer, which needs its layer listening to be grabbable.
            Drawing only: input still runs through the SVG's own handles, which
            the interaction hook deliberately yields to. */}
        <Layer listening>
          <KonvaOverlay zoom={zoom} />
          <KonvaTransformer stageRef={stageRef} />
        </Layer>
      </Stage>
    </div>,
    host
  )
}
