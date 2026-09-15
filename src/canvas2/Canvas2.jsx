import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
import { Maximize, ToggleLeft, ToggleRight } from 'lucide-react'
import { Scene } from './Scene'
import { Overlays } from './Overlays'
import { ResizeTransformer } from './ResizeTransformer'
import { useCanvasStore } from '../store/useCanvasStore'
import { debugOn } from './debugLog'
import { DebugPanel } from './DebugPanel'
import { useClickCensus, useNativeClickTrace } from './clickDiagnostics'
import { useCanvasInteraction } from './useCanvasInteraction'
import { clampZoom } from './viewport'

/* ── STEP 1 · the canvas surface ─────────────────────────────────────────────
   A Konva Stage that owns its own pointer events. No router, no forwarding, no
   second renderer underneath: when this is mounted it is the only canvas on
   screen, so there is nothing to arbitrate with. Konva's own Stage handlers are
   the entire input path.

   ── Why the view is held in a ref and pushed at the Stage imperatively ──
   pan/zoom are VIEW state, not document state. Driving the Stage from React
   props would re-render the whole tree on every mousemove — which is precisely
   what made the old canvas crawl. Instead the gesture writes a ref, applies it
   straight to the Stage, and the store is updated on a rAF so the zoom readout
   and the rest of the app stay in step without being in the hot path.

   World coordinates remain the only truth. The Stage transform is a lens.

   ── This file's one job (CANVAS2.md rule 8) ──
   Mount the Stage/Layers and own the view (pan/zoom application + store sync).
   It does NOT decide what a gesture means — that is useCanvasInteraction's job
   — and it does NOT paint the selection/marquee overlay itself — that is
   Overlays.jsx. This mirrors the SVG engine's own split: CanvasArea (input) /
   CanvasOverlays (decoration) / the Stage-owning shell in between. */

const GRID_MIN_PX = 8
const GRID_LADDER = [1, 2, 4, 10, 20, 50, 100, 200, 500]

function useContainerSize(el) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
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

/** The grid, as ONE shape whose sceneFunc reads the live Stage transform.
 *  Built as a single node on purpose — a grid of React elements would be
 *  hundreds of nodes reconciled on every pan. */
function Grid({ gridSize, major, minor }) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const stage = shape.getStage()
        if (!stage) return
        const s = stage.scaleX() || 1
        const x0 = -stage.x() / s, y0 = -stage.y() / s
        const x1 = (stage.width() - stage.x()) / s
        const y1 = (stage.height() - stage.y()) / s
        const c = ctx._context

        const rule = (step, color) => {
          if (step * s < GRID_MIN_PX) return          // too dense to read
          c.beginPath()
          for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { c.moveTo(x, y0); c.lineTo(x, y1) }
          for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { c.moveTo(x0, y); c.lineTo(x1, y) }
          c.strokeStyle = color
          c.lineWidth = 1 / s                          // one screen pixel at any zoom
          c.stroke()
        }

        /* Major spacing climbs a ladder so it never collapses into a smear when
           zoomed out to a whole building. */
        const base = gridSize * 5
        const mul = GRID_LADDER.find(m => base * m * s >= GRID_MIN_PX) ?? GRID_LADDER.at(-1)
        rule(gridSize, minor)
        rule(base * mul, major)
      }}
    />
  )
}

/* Whether double-click also fits-to-content, defaulting OFF: double-click is
   a gesture people reach for while editing (renaming, drilling into a bay),
   and a big view jump firing by accident there is disorienting. The Fit
   button (below) is always available regardless of this setting. Presentation
   state, not canvas document state — localStorage, like the left panel's own
   prefs, never the canvas store. */
const DBLCLICK_FIT_KEY = 'trace.canvas2.dblClickFit'

function useDblClickFitSetting() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(DBLCLICK_FIT_KEY) === '1' } catch { return false }
  })
  const toggle = () => setEnabled(prev => {
    const next = !prev
    try { localStorage.setItem(DBLCLICK_FIT_KEY, next ? '1' : '0') } catch { /* ignore */ }
    return next
  })
  return [enabled, toggle]
}

export function Canvas2() {
  const [host, setHost] = useState(null)
  const stageRef = useRef(null)
  const size = useContainerSize(host)

  const gridSize = useCanvasStore(s => s.gridSize)
  const objects  = useCanvasStore(s => s.objects)
  const showGrid = useCanvasStore(s => s.showGrid)
  const uiTheme  = useCanvasStore(s => s.uiTheme)

  /* The live view. Seeded from the store so toggling the canvas keeps your
     place, then owned here for the duration of a gesture. */
  const view = useRef({
    zoom: clampZoom(useCanvasStore.getState().zoom),
    panX: useCanvasStore.getState().panX,
    panY: useCanvasStore.getState().panY,
  })

  /* What to outline. Selection is store state, so this re-renders when it
     changes — but never during a drag, which moves the nodes directly. */
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const selectedObjects = useMemo(
    () => objects.filter(o => selectedIds.includes(o.id)),
    [objects, selectedIds])

  const colors = useMemo(() => {
    try {
      const cs = getComputedStyle(document.querySelector('[data-theme]'))
      return {
        major: cs.getPropertyValue('--grid-major').trim() || 'rgba(107,114,128,0.34)',
        minor: cs.getPropertyValue('--grid-minor').trim() || 'rgba(107,114,128,0.14)',
        bg:    cs.getPropertyValue('--canvas-bg').trim() || '#ECEAE1',
      }
    } catch {
      return { major: 'rgba(107,114,128,0.34)', minor: 'rgba(107,114,128,0.14)', bg: '#ECEAE1' }
    }
  }, [uiTheme])

  /* Push the ref at the Stage. The only place the transform is applied. */
  const apply = () => {
    const st = stageRef.current
    if (!st) return
    const v = view.current
    st.scale({ x: v.zoom, y: v.zoom })
    st.position({ x: v.panX, y: v.panY })
    st.batchDraw()
  }

  /* Store sync, coalesced to a frame: the readout and any other consumer stay
     current without a React render per pointer move. */
  const syncRaf = useRef(0)
  const syncStore = () => {
    if (syncRaf.current) return
    syncRaf.current = requestAnimationFrame(() => {
      syncRaf.current = 0
      const v = view.current
      const st = useCanvasStore.getState()
      if (st.zoom !== v.zoom) st.setZoom(v.zoom)
      if (st.panX !== v.panX || st.panY !== v.panY) st.setPan(v.panX, v.panY)
    })
  }
  useEffect(() => () => { if (syncRaf.current) cancelAnimationFrame(syncRaf.current) }, [])

  const setView = (v) => { view.current = v; apply(); syncStore() }

  /* Adopt view changes made OUTSIDE the canvas — the zoom buttons, fit, a
     freshly generated layout. Guarded against the values this canvas just
     wrote, or the two would fight each other every frame. */
  const zoom = useCanvasStore(s => s.zoom)
  const panX = useCanvasStore(s => s.panX)
  const panY = useCanvasStore(s => s.panY)
  useEffect(() => {
    const v = view.current
    if (zoom === v.zoom && panX === v.panX && panY === v.panY) return
    view.current = { zoom: clampZoom(zoom), panX, panY }
    apply()
  }, [zoom, panX, panY])

  useEffect(() => { apply() }, [size.w, size.h])

  /* TEMPORARY diagnostics — see clickDiagnostics.js. noteHandlerFired is
     threaded into the interaction hook so its stage handler can stamp itself
     onto the same click record the capture-phase listener started. */
  useClickCensus({ stageRef, objects, selectedIds, zoom })
  const noteHandlerFired = useNativeClickTrace({ stageRef })

  const [dblClickFitEnabled, toggleDblClickFit] = useDblClickFitSetting()

  const { onStageMouseDown, onWheel, onDblClick, fitToContent, cursor, marquee } =
    useCanvasInteraction({ stageRef, view, setView, size, objects, noteHandlerFired, dblClickFitEnabled })

  return (
    <div
      id="canvas2-container"
      ref={setHost}
      className="flex-1 relative overflow-hidden"
      style={{ background: colors.bg, cursor }}
    >
      {debugOn() && <DebugPanel />}
      {/* The primary fit-to-content control. Double-click can do the same
          thing, but only when the setting to its right is turned on — off by
          default, since double-click is also reached for while editing and a
          big view jump firing by accident there is disorienting. */}
      <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 50, display: 'flex', gap: 6 }}>
        <button
          onClick={toggleDblClickFit}
          title={(dblClickFitEnabled ? 'Disable' : 'Enable') + ' double-click to fit'}
          aria-label={(dblClickFitEnabled ? 'Disable' : 'Enable') + ' double-click to fit'}
          aria-pressed={dblClickFitEnabled}
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: dblClickFitEnabled ? 'var(--accent-solid, #0B101D)' : 'var(--surface, #fff)',
            color: dblClickFitEnabled ? 'var(--accent-fg, #fff)' : 'var(--text2, #3A4152)',
            border: '1px solid var(--border, #E6E9EF)', borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)', cursor: 'pointer',
          }}
        >
          {dblClickFitEnabled
            ? <ToggleRight size={16} strokeWidth={1.6} absoluteStrokeWidth />
            : <ToggleLeft size={16} strokeWidth={1.6} absoluteStrokeWidth />}
        </button>
        <button
          onClick={fitToContent}
          title="Fit to content"
          aria-label="Fit to content"
          style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface, #fff)', color: 'var(--text2, #3A4152)',
            border: '1px solid var(--border, #E6E9EF)', borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)', cursor: 'pointer',
          }}
        >
          <Maximize size={15} strokeWidth={1.6} absoluteStrokeWidth />
        </button>
      </div>
      {size.w > 0 && size.h > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          /* Only the press starts here. Moves and the release are taken on
             window for the life of the gesture, so a drag survives the pointer
             leaving the canvas instead of dying at the edge. */
          onMouseDown={onStageMouseDown}
          onWheel={onWheel}
          onDblClick={onDblClick}
        >
          {/* background — the grid alone; it never intercepts anything */}
          <Layer listening={false}>
            {showGrid && <Grid gridSize={gridSize} major={colors.major} minor={colors.minor} />}
          </Layer>
          {/* objects — the real scene, now hit-testable so it can be selected */}
          <Layer listening>
            <Scene listening />
          </Layer>
          {/* overlay — the marquee, and later the handles. Never listens: it is
              decoration, and must not intercept a press meant for an object. */}
          <Layer listening={false}>
            <Overlays selectedObjects={selectedObjects} gridSize={gridSize} marquee={marquee} />
          </Layer>
          {/* resize/rotate — Konva's own Transformer, topmost so its handles
              are never obscured. Listens for its own anchor presses only
              (Konva cancels their bubble internally); everything else falls
              through to onStageMouseDown/hitTest untouched. */}
          <Layer listening>
            <ResizeTransformer />
          </Layer>
        </Stage>
      )}
    </div>
  )
}
