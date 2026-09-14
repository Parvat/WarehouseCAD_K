import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Shape, Rect } from 'react-konva'

/* Only the LEFT button may drag an object. Konva allows the middle button by
   default, which turned every middle-drag-to-pan that happened to start over a
   rack into a move of that rack. */
Konva.dragButtons = [0]
import { Scene } from './Scene'
import { idFromNode, SelectionOutline } from './shapes'
import { bayAtPoint } from '../render/rackOps'
import { snapToGrid, objectContains, getObjectBounds } from '../utils/canvas'
import {
  nextSelection, normalizeRect, objectsInMarquee, movedEnough,
  movedIdsFor, objectCentre, isFloorPlan,
} from './selection'
import { useCanvasStore } from '../store/useCanvasStore'
import { dlog, dcensus, debugOn } from './debugLog'
import { DebugPanel } from './DebugPanel'
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

  /* TEMPORARY census: how many objects exist vs how many the hit graph can
     actually find. A gap here is the selection bug made visible. */
  useEffect(() => {
    if (!debugOn()) return
    const id = setTimeout(() => {
      const stage = stageRef.current
      if (!stage) return
      const st = useCanvasStore.getState()
      const named = new Set()
      for (const layer of stage.getLayers())
        for (const n of layer.getChildren()) {
          const nm = n.name() || ''
          if (nm.startsWith('obj:')) named.add(nm.slice(4))
        }
      const byType = {}
      let hittable = 0
      for (const o of st.objects) {
        const drawn = named.has(o.id)
        if (drawn) hittable++
        byType[o.type] = byType[o.type] || { n: 0, drawn: 0 }
        byType[o.type].n++
        if (drawn) byType[o.type].drawn++
      }
      const parented = st.objects.filter(o => o.parentId).length
      dcensus([
        `objects ${st.objects.length}   drawn/hittable ${hittable}` +
          (hittable === st.objects.length ? '   ok' : '   <-- MISMATCH'),
        `zoom ${(st.zoom * 100).toFixed(1)}%   selected ${st.selectedIds.length}   with parentId ${parented}`,
        ...Object.entries(byType).map(([t, v]) =>
          `  ${t.padEnd(20)} ${v.drawn}/${v.n}` + (v.drawn === v.n ? '' : '  <-- NO')),
      ])
    }, 120)
    return () => clearTimeout(id)
  }, [objects, selectedIds, zoom])

  /* ── Input, by Konva's own model ─────────────────────────────────────────
     Selection and dragging are NOT hand-rolled. Each object node carries
     Konva's own onMouseDown and draggable, so KONVA decides what was hit —
     from the hit canvas it already maintains — instead of us re-deriving it
     from coordinates. The Stage handles only what belongs to the Stage: pan
     when the press lands on the Stage itself (Konva reports e.target === stage
     for empty space), marquee on shift, and wheel zoom.

     This deletes a custom hit test, a manual walk up the parent chain, a
     gesture latch, and window-level mousemove/mouseup for object drags. Konva
     already does all of it, and does it from what is actually drawn rather
     than from arithmetic that can disagree with the drawing. */
  const spaceDown = useRef(false)
  useEffect(() => {
    const down = e => { if (e.code === 'Space') { spaceDown.current = true; setCursor('grab') } }
    const up   = e => { if (e.code === 'Space') { spaceDown.current = false; setCursor('default') } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const pan = useRef(null)
  const objDrag = useRef(null)
  const marqueeRef = useRef(null)
  const [marquee, setMarquee] = useState(null)

  /* ── selection, from Konva's own hit ──────────────────────────────────── */
  const selectFromEvent = (e, obj) => {
    const st = useCanvasStore.getState()
    const { ids, replaced } = nextSelection({
      selectedIds: st.selectedIds, groups: st.groups, id: obj.id,
      shiftKey: !!e.evt.shiftKey,
    })
    if (replaced) {
      if (ids.length === 0) st.clearSelection()
      else if (ids.length === 1) st.selectObject(ids[0], false)
      else { st.clearSelection(); st.selectMultiple(ids) }
    }

    /* Bay pick, toggling like the SVG. The pointer comes straight off the
       stage, so there is no coordinate maths of ours that can be wrong. */
    const stage = stageRef.current
    const p = stage && stage.getPointerPosition()
    if (!p) return
    const world = screenToWorld(view.current, p)
    const live = useCanvasStore.getState().objects.find(o => o.id === obj.id)
    if (!live) return
    const bay = bayAtPoint(live, world.x, st.gridSize)
    if (bay != null) {
      useCanvasStore.getState().updateObject(obj.id,
        { activeBayIdx: live.activeBayIdx === bay ? null : bay })
    }
  }

  /* ── dragging, by Konva's draggable ───────────────────────────────────── */

  /* Snap the OBJECT's own origin, not the node's centre: the node sits at the
     object's centre so rotation pivots there, so snapping the node position
     raw would land the object half a width off the line. */
  const dragBoundFor = (obj) => (pos) => {
    const st = useCanvasStore.getState()
    if (!st.snapToGrid) return pos
    const v = view.current
    const b = getObjectBounds(obj)
    const halfW = (b.width || 0) / 2, halfH = (b.height || 0) / 2
    const originX = (pos.x - v.panX) / v.zoom - halfW
    const originY = (pos.y - v.panY) / v.zoom - halfH
    const sx = snapToGrid(originX, st.gridSize, st.snapUnit)
    const sy = snapToGrid(originY, st.gridSize, st.snapUnit)
    return { x: (sx + halfW) * v.zoom + v.panX, y: (sy + halfH) * v.zoom + v.panY }
  }

  const onObjDragStart = (e, obj) => {
    /* Space means pan, so an object must not run away with the gesture just
       because the press happened to land on it. */
    if (spaceDown.current) { e.target.stopDrag(); return }
    const stage = stageRef.current
    const st0 = useCanvasStore.getState()
    /* Dragging something unselected selects it first, so what moves is always
       what is selected. */
    if (!st0.selectedIds.includes(obj.id)) st0.selectObject(obj.id, false)

    const st = useCanvasStore.getState()
    const ids = [...st.selectedIds]
    const want = movedIdsFor(st.objects, ids)
    const node = e.target
    const followers = []
    if (stage) {
      for (const layer of stage.getLayers()) {
        for (const n of layer.getChildren()) {
          const nm = n.name() || ''
          const id = (nm.startsWith('obj:') || nm.startsWith('sel:')) ? nm.slice(4) : null
          if (!id || n === node || !want.has(id)) continue
          followers.push({ node: n, rest: n.position() })
        }
      }
    }
    objDrag.current = { ids, node, rest: node.position(), followers }
    setCursor('grabbing')
  }

  /* Konva moves the grabbed node; the rest of the selection — and a floor
     plan's children — follow by the same delta. */
  const onObjDragMove = () => {
    const d = objDrag.current
    if (!d) return
    const dx = d.node.x() - d.rest.x
    const dy = d.node.y() - d.rest.y
    for (const f of d.followers) f.node.position({ x: f.rest.x + dx, y: f.rest.y + dy })
  }

  const onObjDragEnd = () => {
    const d = objDrag.current
    objDrag.current = null
    setCursor(spaceDown.current ? 'grab' : 'default')
    if (!d) return

    /* Node coordinates live in the LAYER, which is unscaled — the Stage
       carries the zoom. So this delta is already in world units; dividing by
       zoom again inflated every drag by 1/zoom (a 90px drag at 10% became
       8,862 world px instead of 900). */
    const dx = d.node.x() - d.rest.x
    const dy = d.node.y() - d.rest.y

    /* Hand every node back; the store is the truth and React redraws from it. */
    d.node.position(d.rest)
    for (const f of d.followers) f.node.position(f.rest)

    if (!dx && !dy) { stageRef.current?.batchDraw(); return }
    useCanvasStore.getState().moveObjects(d.ids, dx, dy)
    reparentMoved(d.ids)
  }

  /* Re-decide which building each moved object belongs to, from where it now
     sits — the same rule CanvasArea applies after its own moves. Without it a
     rack dragged OUT keeps claiming the building as parent and the next
     building drag hauls it back. attachToParent does not push history, so this
     stays ONE undo per drag. */
  const reparentMoved = (ids) => {
    const store = useCanvasStore.getState()
    const all = store.objects          // post-move: immer applied it already
    const changed = []
    for (const id of ids) {
      const obj = all.find(o => o.id === id)
      if (!obj || isFloorPlan(obj)) continue
      const c = objectCentre(obj)
      if (!c) continue
      const fp = [...all].reverse().find(o => isFloorPlan(o) && objectContains(o, c.x, c.y))
      if ((obj.parentId || undefined) !== (fp ? fp.id : undefined)) {
        store.attachToParent(id, fp ? fp.id : undefined)
        changed.push(id)
      }
    }
    return changed
  }

  /* The props every object node gets. Konva owns the hit and the drag. */
  const bind = useCallback((obj) => ({
    draggable: true,
    onMouseDown: (e) => {
      /* Middle button and held space pan over ANYTHING — they are the
         unambiguous escape hatches. Let those bubble to the Stage untouched
         instead of selecting what happens to be underneath. */
      if (e.evt.button === 1 || spaceDown.current) return
      e.cancelBubble = true
      selectFromEvent(e, obj)
    },
    onTap: (e) => { e.cancelBubble = true; selectFromEvent(e, obj) },
    dragBoundFunc: dragBoundFor(obj),
    onDragStart: (e) => onObjDragStart(e, obj),
    onDragMove: onObjDragMove,
    onDragEnd: onObjDragEnd,
  }), [])

  /* ── the Stage's own gestures ─────────────────────────────────────────── */
  const onStageMouseDown = (e) => {
    const stage = stageRef.current
    if (!stage) return
    const evt = e.evt
    /* Konva says so itself: the press landed on the Stage, i.e. empty space.
       Anything on an object was already handled by that object's handler. */
    const onEmpty = e.target === stage
    const forcePan = evt.button === 1 || spaceDown.current

    if (!onEmpty && !forcePan) return
    if (evt.button !== 0 && evt.button !== 1) return

    if (onEmpty && evt.shiftKey && evt.button === 0 && !forcePan) {
      const p = stage.getPointerPosition()
      marqueeRef.current = {
        from: screenToWorld(view.current, p),
        sx: evt.clientX, sy: evt.clientY, moved: false,
      }
      return
    }
    pan.current = { sx: evt.clientX, sy: evt.clientY, panX: view.current.panX, panY: view.current.panY }
    setCursor('grabbing')
  }

  /* Pan and marquee still take their moves on WINDOW: a Stage-bound pan dies
     the moment the pointer leaves the canvas. Object drags do not need this —
     Konva already captures them. */
  useEffect(() => {
    const move = (evt) => {
      if (pan.current) {
        const d = pan.current
        setView({
          zoom: view.current.zoom,
          panX: d.panX + (evt.clientX - d.sx),
          panY: d.panY + (evt.clientY - d.sy),
        })
        return
      }
      const m = marqueeRef.current
      if (!m) return
      if (!m.moved && !movedEnough({ x: m.sx, y: m.sy }, { x: evt.clientX, y: evt.clientY })) return
      m.moved = true
      const stage = stageRef.current
      if (!stage) return
      const box = stage.container().getBoundingClientRect()
      m.to = screenToWorld(view.current, { x: evt.clientX - box.left, y: evt.clientY - box.top })
      setMarquee(normalizeRect(m.from, m.to))
    }
    const up = () => {
      pan.current = null
      const m = marqueeRef.current
      marqueeRef.current = null
      if (m && m.moved && m.to) {
        const st = useCanvasStore.getState()
        const ids = objectsInMarquee(st.objects, normalizeRect(m.from, m.to))
        if (ids.length) st.selectMultiple(ids)
      }
      setMarquee(null)
      setCursor(spaceDown.current ? 'grab' : 'default')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

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
      {debugOn() && <DebugPanel />}
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
            <Scene listening bind={bind} />
          </Layer>
          {/* overlay — the marquee, and later the handles. Never listens: it is
              decoration, and must not intercept a press meant for an object. */}
          <Layer listening={false}>
            {selectedObjects.map(o => <SelectionOutline key={o.id} obj={o} gridSize={gridSize} />)}
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
