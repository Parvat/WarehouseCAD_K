import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Shape, Rect } from 'react-konva'
import { Scene } from './Scene'
import { idFromNode } from './shapes'
import { bayAtPoint } from '../render/rackOps'
import {
  GESTURE, gestureFor, nextSelection, normalizeRect, objectsInMarquee, movedEnough,
} from './selection'
import { useCanvasStore } from '../store/useCanvasStore'
import {
  clampZoom, zoomAtPoint, wheelFactor, screenToWorld, fitView, worldBounds,
} from './viewport'

/* ── STEP 1 · the canvas surface ─────────────────────────────────────────────
   A Konva Stage that owns its own pointer events. No router, no forwarding, no
   second renderer underneath: when this is mounted it is the only canvas on
   screen, so there is nothing to arbitrate with. Konva's own Stage handlers are
   the entire input path.

   Step 1 is pan and zoom only. Objects, selection, drag and the Transformer
   arrive in later steps, against this surface.

   ── Why the view is held in a ref and pushed at the Stage imperatively ──
   pan/zoom are VIEW state, not document state. Driving the Stage from React
   props would re-render the whole tree on every mousemove — which is precisely
   what made the old canvas crawl. Instead the gesture writes a ref, applies it
   straight to the Stage, and the store is updated on a rAF so the zoom readout
   and the rest of the app stay in step without being in the hot path.

   World coordinates remain the only truth. The Stage transform is a lens. */

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
 *  Step 1 needs some reference to see the view move against; the real scene
 *  lands in step 2. Built as a single node on purpose — a grid of React
 *  elements would be hundreds of nodes reconciled on every pan. */
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
  const [cursor, setCursor] = useState('default')

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

  /* ── Pointer input, Konva-native ──────────────────────────────────────────
     Ownership is decided ONCE at mousedown by selection.gestureFor, from what
     is under the pointer, and latched until release. That latch is the point:
     a pan that began on empty space can cross a rack without becoming a
     selection, and a press on an object can never turn into a marquee.

     Moves and the release are taken on WINDOW, not the Stage. A pan bound to
     Stage events dies the moment the pointer leaves the canvas — over the right
     panel, or past the window edge — leaving the view stuck mid-drag. Window
     capture means the gesture ends where the mouse actually ends. */
  const spaceDown = useRef(false)
  useEffect(() => {
    const down = e => {
      if (e.code !== 'Space') return
      spaceDown.current = true
      if (!drag.current) setCursor('grab')
    }
    const up = e => {
      if (e.code !== 'Space') return
      spaceDown.current = false
      if (!drag.current) setCursor('default')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const drag = useRef(null)
  const [marquee, setMarquee] = useState(null)   // world rect, while dragging one

  /* The object under a screen point, or null. Walks up from whatever shape was
     hit to the node that carries the id — a press can land on a rack's box, its
     dividers path, or a column square. */
  const hitIdAt = (stage, p) => {
    let n = stage.getIntersection(p)
    while (n && idFromNode(n) === null) n = n.getParent()
    return n ? idFromNode(n) : null
  }

  const onMouseDown = (e) => {
    const stage = stageRef.current
    if (!stage) return
    const evt = e.evt
    const p = stage.getPointerPosition()
    if (!p) return

    const hitId = hitIdAt(stage, p)
    const g = gestureFor({
      button: evt.button, shiftKey: evt.shiftKey,
      spaceDown: spaceDown.current, hitId,
    })
    if (!g) return
    evt.preventDefault()

    if (g === GESTURE.SELECT) {
      applySelection(hitId, evt.shiftKey, screenToWorld(view.current, p))
      /* Selection is the whole gesture for now — moving a selected object is
         step 4. Latched anyway so a stray move cannot start a marquee. */
      drag.current = { kind: GESTURE.SELECT }
      return
    }

    if (g === GESTURE.MARQUEE) {
      const w = screenToWorld(view.current, p)
      drag.current = { kind: GESTURE.MARQUEE, from: w, sx: evt.clientX, sy: evt.clientY, moved: false }
      return
    }

    drag.current = {
      kind: GESTURE.PAN,
      sx: evt.clientX, sy: evt.clientY,
      panX: view.current.panX, panY: view.current.panY,
    }
    setCursor('grabbing')
  }

  /* Window-level move/up for the life of a gesture. */
  useEffect(() => {
    const move = (evt) => {
      const d = drag.current
      if (!d) return
      if (d.kind === GESTURE.PAN) {
        setView({
          zoom: view.current.zoom,
          panX: d.panX + (evt.clientX - d.sx),
          panY: d.panY + (evt.clientY - d.sy),
        })
        return
      }
      if (d.kind === GESTURE.MARQUEE) {
        if (!d.moved && !movedEnough({ x: d.sx, y: d.sy }, { x: evt.clientX, y: evt.clientY })) return
        d.moved = true
        const stage = stageRef.current
        if (!stage) return
        const box = stage.container().getBoundingClientRect()
        const to = screenToWorld(view.current, { x: evt.clientX - box.left, y: evt.clientY - box.top })
        d.to = to
        setMarquee(normalizeRect(d.from, to))
      }
    }

    const up = () => {
      const d = drag.current
      drag.current = null
      if (!d) return
      if (d.kind === GESTURE.MARQUEE) {
        if (d.moved && d.to) {
          const rect = normalizeRect(d.from, d.to)
          const st = useCanvasStore.getState()
          const ids = objectsInMarquee(st.objects, rect)
          /* Shift-marquee adds to what is already selected rather than
             replacing it, so a selection can be built up in passes. */
          if (ids.length) st.selectMultiple(ids)
        }
        setMarquee(null)
      }
      setCursor(spaceDown.current ? 'grab' : 'default')
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  /* Selection, performed through the store's own actions. Reads only. */
  const applySelection = (id, shiftKey, world) => {
    const st = useCanvasStore.getState()
    const { ids, replaced } = nextSelection({
      selectedIds: st.selectedIds, groups: st.groups, id, shiftKey,
    })

    if (replaced) {
      if (ids.length === 0) st.clearSelection()
      else if (ids.length === 1) st.selectObject(ids[0], false)
      else { st.clearSelection(); st.selectMultiple(ids) }
    }

    /* Bay pick, for the beam racks that have bays. Toggles like the SVG:
       pressing the active bay clears it. updateObject, not commitObjectUpdate —
       picking a bay is a selection and does not belong on the undo stack. */
    const obj = st.objects.find(o => o.id === id)
    if (!obj) return
    const bay = bayAtPoint(obj, world.x, st.gridSize)
    if (bay != null) {
      st.updateObject(id, { activeBayIdx: obj.activeBayIdx === bay ? null : bay })
    }
  }

  const onWheel = (e) => {
    e.evt.preventDefault()
    const st = stageRef.current
    if (!st) return
    const p = st.getPointerPosition()
    if (!p) return
    setView(zoomAtPoint(view.current, p, wheelFactor(e.evt.deltaY, e.evt.deltaMode)))
  }

  /* Double-click fits the whole drawing — the whole-building view is where this
     canvas has to be judged, so it should be one gesture away. */
  const onDblClick = () => {
    const v = fitView(worldBounds(objects), size)
    if (v) setView(v)
  }

  return (
    <div
      id="canvas2-container"
      ref={setHost}
      className="flex-1 relative overflow-hidden"
      style={{ background: colors.bg, cursor }}
    >
      {size.w > 0 && size.h > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          /* Only the press starts here. Moves and the release are taken on
             window for the life of the gesture, so a drag survives the pointer
             leaving the canvas instead of dying at the edge. */
          onMouseDown={onMouseDown}
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
            {marquee && (
              <Rect
                x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
                fill="rgba(74,158,255,0.10)" stroke="#4a9eff" strokeWidth={1}
                dash={[4, 3]} strokeScaleEnabled={false} listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
