import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Stage, Layer, Shape, Rect } from 'react-konva'

/* Only the LEFT button may drag an object. Konva allows the middle button by
   default, which turned every middle-drag-to-pan that happened to start over a
   rack into a move of that rack. */
Konva.dragButtons = [0]
import { Scene } from './Scene'
import { idFromNode, nodeName, outlineBounds, hitPadMargins, SelectionOutline } from './shapes'
import { hitTest, hitTestBay } from './hitTest'
import { snapToGrid, objectContains } from '../utils/canvas'
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

/* ── TEMPORARY click-diagnostic geometry ─────────────────────────────────────
   Pure functions, module-level: they take a stage/point and read the store
   directly, so they need no component state and cannot go stale between
   renders. Used only by the null-intersection branch of the click log below. */

/** A LOCAL rect (world units, in the object's own pre-transform space) mapped
 *  through the node's live absolute transform, corner by corner — correct
 *  even when the object is rotated, unlike taking the rect's own x/y/w/h and
 *  assuming axis alignment survives the transform. The result is in the same
 *  screen-pixel space as the click point: getAbsoluteTransform() composes
 *  every ancestor up to and including the Stage's own pan/zoom, so a local
 *  point maps straight to container-relative pixels. */
function screenBoundsOf(node, localRect) {
  const t = node.getAbsoluteTransform()
  const corners = [
    { x: localRect.x, y: localRect.y },
    { x: localRect.x + localRect.width, y: localRect.y },
    { x: localRect.x, y: localRect.y + localRect.height },
    { x: localRect.x + localRect.width, y: localRect.y + localRect.height },
  ].map(p => t.point(p))
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

/** Distance from a point to the NEAREST point on a rect's boundary or
 *  interior — 0 when the point is already inside. */
function distToRect(p, r) {
  const cx = Math.max(r.x, Math.min(p.x, r.x + r.width))
  const cy = Math.max(r.y, Math.min(p.y, r.y + r.height))
  return Math.hypot(p.x - cx, p.y - cy)
}

/** For a null-intersection click: the nearest RACK object, with its drawn
 *  bounds and its hit-rect bounds both already converted to the click's own
 *  screen-pixel space, so the caller compares like with like instead of
 *  inferring anything from world coordinates or distance alone.
 *
 *  Reuses hitPadMargins — the exact function HitPad's own hitFunc calls — so
 *  this can never report a hit-rect that disagrees with what Konva actually
 *  tested the click against. */
/* A screen rect wider or taller than this is not a rendering fact about any
   real viewport — it is a symptom of corrupt object data (NaN propagating
   through Math.min/max as -Infinity/Infinity, or a genuinely huge width/height
   on the object itself) reaching the SAME transform math that everything else
   here uses. Separate from the picking fix above: reported once, alongside
   the raw fields, so it is diagnosable instead of just looking like wrong
   arithmetic if it recurs. */
const SANE_SCREEN_PX = 20000
const isSaneRect = (r) => r &&
  Number.isFinite(r.x) && Number.isFinite(r.y) &&
  Number.isFinite(r.width) && Number.isFinite(r.height) &&
  Math.abs(r.width) < SANE_SCREEN_PX && Math.abs(r.height) < SANE_SCREEN_PX

function nearestRackScreenBounds(stage, screenPoint) {
  const st = useCanvasStore.getState()
  const gridSize = st.gridSize
  const scale = stage.scaleX() || 1
  let best = null

  for (const o of st.objects) {
    if (!/^rack/.test(o.type)) continue
    const node = stage.findOne(n => n.name && n.name() === nodeName(o.id))
    if (!node) continue
    const b = outlineBounds(o, gridSize)
    if (!b) continue

    const drawnB = screenBoundsOf(node, b)
    if (!isSaneRect(drawnB)) {
      /* TEMPORARY: report the corrupt instance directly rather than let its
         wrong numbers silently win/lose the "nearest" comparison below. */
      dlog('CORRUPT BOUNDS on ' + o.type + ' ' + o.id.slice(0, 8), [
        'raw object: x=' + o.x + ' y=' + o.y + ' width=' + o.width + ' height=' + o.height +
          ' rotation=' + o.rotation,
        'local bounds (outlineBounds): ' + JSON.stringify(b),
        'screen bounds computed:       ' + JSON.stringify(drawnB),
      ])
      continue
    }

    const dist = distToRect(screenPoint, drawnB)
    if (best && dist >= best.dist) continue

    const { mx, my } = hitPadMargins(b, scale)
    const hitLocal = { x: b.x - mx, y: b.y - my, width: b.width + mx * 2, height: b.height + my * 2 }
    const hitB = screenBoundsOf(node, hitLocal)
    best = { obj: o, drawnB, hitB, dist }
  }
  return best
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
  /* Selection AND bay pick, from a world point and a hit id already decided by
     hitTest/hitTestBay — geometry, not Konva's scene graph. No Konva event is
     needed here any more: hitId came from our own picking, so there is
     nothing left to read off `e`. */
  const selectFromHit = (hitId, shiftKey, world) => {
    const st = useCanvasStore.getState()
    const { ids, replaced } = nextSelection({
      selectedIds: st.selectedIds, groups: st.groups, id: hitId, shiftKey,
    })
    if (replaced) {
      if (ids.length === 0) st.clearSelection()
      else if (ids.length === 1) st.selectObject(ids[0], false)
      else { st.clearSelection(); st.selectMultiple(ids) }
    }

    /* Bay pick, toggling like the SVG — ported hitTestBay, not the render
       layer's own bayAtPoint: it answers for the full RACK_BAY_TYPES set
       (lanes and towers too, not just row/double-row) and un-rotates the
       click first, so a turned rack still resolves the right bay. */
    const live = st.objects.find(o => o.id === hitId)
    if (!live) return
    const bay = hitTestBay(live, world.x, world.y, st.gridSize)
    if (bay != null) {
      st.updateObject(hitId, { activeBayIdx: live.activeBayIdx === bay ? null : bay })
    }
  }

  /* ── dragging, from the SAME hitTest pick that selection uses ─────────────
     Konva's own draggable/dragstart machinery is GONE. It was a second,
     independent hit-test — Konva's own scene-graph pick, running separately
     from our geometry-based hitTest — and the two disagreeing is exactly what
     silently broke dragging for some racks: a press that OUR hitTest resolved
     (and selected) was not always a press Konva's OWN internal drag-arming
     agreed was over a draggable node, so nothing happened when the pointer
     moved. One pick now decides both. onStageMouseDown finds hitId via
     hitTest; the SAME call arms the drag below. There is no second,
     independent "does Konva also think something is here" left to disagree
     with the first — which is also why bay selection is reliable again: it
     is resolved from the exact same hitId, in the exact same handler, not
     racing a separate native drag-arm/click dispatch for the same node. */
  const beginDrag = (hitId, world, evt) => {
    const stage = stageRef.current
    if (!stage) return
    const st = useCanvasStore.getState()
    const grabbed = st.objects.find(o => o.id === hitId)
    if (!grabbed) return

    /* The cascade set — the selection plus a floor plan's children — found
       AFTER selectFromHit has settled, so it reflects what actually got
       selected (a fresh click replaces the selection; a click on an
       already-selected member keeps the whole multi-selection). Each node's
       REST position is captured rather than assumed to be (0,0): rack nodes
       sit at their own centre so rotation pivots there. */
    const ids = [...st.selectedIds]
    const want = movedIdsFor(st.objects, ids)
    const nodes = []
    for (const layer of stage.getLayers()) {
      for (const n of layer.getChildren()) {
        const nm = n.name() || ''
        const id = (nm.startsWith('obj:') || nm.startsWith('sel:')) ? nm.slice(4) : null
        if (id && want.has(id)) nodes.push({ node: n, rest: n.position() })
      }
    }
    if (!nodes.length) return

    objDrag.current = {
      ids, nodes,
      startWorld: world,
      sx: evt.clientX, sy: evt.clientY,   // SCREEN coords, for the drag threshold below
      origin: { x: grabbed.x, y: grabbed.y },   // the grabbed object, which snap follows
      moved: false,
      delta: null,
    }
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

  /* ── TEMPORARY click diagnostics ──────────────────────────────────────────
     What the report needs to distinguish: for a dead rack, does
     getIntersection return nothing, return a DIFFERENT node (wrong target),
     or return the right node while no handler ever runs?

     A native, CAPTURE-phase listener on the container sees every mousedown
     before Konva's own bubble-phase dispatch runs — so it can compute
     getIntersection independently of whatever cancelBubble/early-returns
     happen inside our own handlers, and its answer can never be skewed by
     them. Each object's bind() and the Stage's own handler then stamp
     "a handler fired here" onto the SAME record; a setTimeout(0) flushes it
     to the panel once (macrotask) after that click's synchronous dispatch —
     handlers, drag, everything — has finished, so one panel entry holds the
     full story: pointer, what Konva's hit graph found, what object that
     resolves to, and which handler (if any) actually ran. */
  const clickTrace = useRef(null)
  const clickSeq = useRef(0)

  const noteHandlerFired = (label) => {
    if (clickTrace.current) clickTrace.current.fired.push(label)
  }

  useEffect(() => {
    if (!debugOn()) return
    const container = document.getElementById('canvas2-container')
    if (!container) return

    /* Walks up from whatever shape was hit to the Group carrying the object
       id — a click can land on a rack's box rect or its dividers path, which
       carry no name of their own. */
    const resolveObjId = (node) => {
      let n = node
      while (n) {
        const id = idFromNode(n)
        if (id !== null) return id
        n = n.getParent && n.getParent()
      }
      return null
    }

    const onCaptureDown = (e) => {
      const stage = stageRef.current
      if (!stage) return
      const box = container.getBoundingClientRect()
      const point = { x: e.clientX - box.left, y: e.clientY - box.top }
      const hit = stage.getIntersection(point)

      const rec = {
        seq: ++clickSeq.current,
        point,
        button: e.button,
        hitClass: hit ? hit.getClassName() : null,
        hitName: hit ? (hit.name() || '(unnamed)') : null,
        hitListening: hit ? hit.isListening() : null,
        objId: hit ? resolveObjId(hit) : null,
        fired: [],
      }
      clickTrace.current = rec

      setTimeout(() => {
        const st = useCanvasStore.getState()
        const obj = rec.objId ? st.objects.find(o => o.id === rec.objId) : null
        const lines = [
          'pointer ' + Math.round(rec.point.x) + ',' + Math.round(rec.point.y) +
            '  button ' + rec.button,
          hit
            ? 'getIntersection -> ' + rec.hitClass + '  name=' + rec.hitName +
              '  listening=' + rec.hitListening
            : 'getIntersection -> null  (nothing hittable at this point)',
          rec.objId
            ? 'resolves to object: ' + (obj ? obj.type : '(id not in store)') + '  ' + rec.objId.slice(0, 8)
            : 'resolves to object: none',
          rec.fired.length
            ? 'handler fired: ' + rec.fired.join(', ')
            : 'handler fired: NONE  <-- nothing ran for this click',
        ]

        /* getIntersection returned nothing — find the rack nearest the click
           and put its DRAWN bounds and its HIT-rect bounds in the SAME screen
           coordinates as the click point, so it is directly visible whether
           the click landed inside either box rather than inferred from
           distance alone. This is the only way to tell "genuinely empty
           space" apart from "the hit rect does not cover what is drawn". */
        if (!hit) {
          const found = nearestRackScreenBounds(stage, rec.point)
          if (found) {
            const { obj: near, drawnB, hitB, dist } = found
            const fmt = r => Math.round(r.x) + ',' + Math.round(r.y) + '  to  ' +
              Math.round(r.x + r.width) + ',' + Math.round(r.y + r.height)
            lines.push(
              '',
              'nearest rack: ' + near.type + '  ' + near.id.slice(0, 8) +
                '  (' + Math.round(dist) + 'px away, screen coords)',
              '  click point       ' + Math.round(rec.point.x) + ',' + Math.round(rec.point.y),
              '  drawn bounds      ' + fmt(drawnB),
              '  hit-rect bounds   ' + fmt(hitB),
              '  inside drawn?  ' + inRect(rec.point, drawnB),
              '  inside hit?    ' + inRect(rec.point, hitB),
            )
          } else {
            lines.push('', 'nearest rack: none found (no rack objects in the scene)')
          }
        }

        dlog('click #' + rec.seq, lines)
        if (clickTrace.current === rec) clickTrace.current = null
      }, 0)
    }

    container.addEventListener('mousedown', onCaptureDown, true)
    return () => container.removeEventListener('mousedown', onCaptureDown, true)
  }, [])

  /* No per-node event props at all any more — no onMouseDown, no onTap, no
     draggable, no e.cancelBubble. Every object node is plain paint. Konva's
     own scene graph is not asked to decide anything: not what got clicked
     (onStageMouseDown's hitTest does that) and not when a drag starts
     (beginDrag, from that same hitId, does that too). Two independent pickers
     agreeing by coincidence on most presses — and silently disagreeing on
     some racks, breaking their drag, and on bay clicks, racing the same
     node's selection against its own native drag-arm — is the whole class of
     bug this removes. */

  /* ── the Stage's own gestures — AND now the only place a press is decided ──
     Every mousedown in the canvas reaches here (nothing upstream calls
     cancelBubble any more), and what happens next is decided by our OWN
     hitTest(world point), not by Konva's e.target/getIntersection. This is
     the ported SVG picking: type-agnostic, and correct regardless of which
     shape inside a rack's Group Konva's own hit graph happened to resolve to. */
  const onStageMouseDown = (e) => {
    const stage = stageRef.current
    if (!stage) return
    const evt = e.evt
    noteHandlerFired('stage (target=' + (e.target && e.target.getClassName ? e.target.getClassName() : '?') + ')')

    /* Middle button and held space pan over ANYTHING — the unambiguous escape
       hatches, checked before any hit test so they can never be shadowed by
       whatever happens to be under the pointer. */
    const forcePan = evt.button === 1 || spaceDown.current
    if (evt.button !== 0 && evt.button !== 1) return

    const p = stage.getPointerPosition()
    if (!p) return
    const world = screenToWorld(view.current, p)

    if (!forcePan) {
      const st = useCanvasStore.getState()
      const hitId = hitTest(st.objects, st.layers, world.x, world.y, view.current.zoom, st.gridSize)

      if (hitId) {
        if (evt.button !== 0) return
        /* forcePan (space/middle) already sent us past this whole block, so
           reaching here means neither is held — a plain left-press on an
           object always selects it and arms its drag. */
        selectFromHit(hitId, !!evt.shiftKey, world)
        beginDrag(hitId, world, evt)
        return
      }

      if (evt.shiftKey) {
        marqueeRef.current = { from: world, sx: evt.clientX, sy: evt.clientY, moved: false }
        return
      }
    }

    pan.current = { sx: evt.clientX, sy: evt.clientY, panX: view.current.panX, panY: view.current.panY }
    setCursor('grabbing')
  }

  /* Pan, marquee AND object drag all take their moves on WINDOW: a
     Stage-bound gesture dies the moment the pointer leaves the canvas — over
     the right panel, or past the window edge — leaving it stuck mid-drag.
     Window capture ends every one of these where the mouse actually ends,
     and it is the ONLY place that moves a dragged object now that Konva's
     own drag capture is gone. */
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

      const d = objDrag.current
      if (d) {
        const stage = stageRef.current
        if (!stage) return
        const box = stage.container().getBoundingClientRect()
        const world = screenToWorld(view.current, { x: evt.clientX - box.left, y: evt.clientY - box.top })
        if (!d.moved && !movedEnough({ x: d.sx, y: d.sy }, { x: evt.clientX, y: evt.clientY })) return
        d.moved = true

        let dx = world.x - d.startWorld.x
        let dy = world.y - d.startWorld.y

        const st = useCanvasStore.getState()
        if (st.snapToGrid) {
          /* Snap the resulting POSITION, not the delta — snapping the delta
             would preserve whatever sub-grid offset the object started with.
             Only the GRABBED object snaps; the rest of the selection moves by
             that same delta, so the set keeps its internal spacing instead of
             each piece collapsing onto its own nearest gridline. */
          dx = snapToGrid(d.origin.x + dx, st.gridSize, st.snapUnit) - d.origin.x
          dy = snapToGrid(d.origin.y + dy, st.gridSize, st.snapUnit) - d.origin.y
        }
        d.delta = { dx, dy }

        /* Preview by offsetting the nodes themselves: no store write and no
           React render per frame. */
        for (const n of d.nodes) n.node.position({ x: n.rest.x + dx, y: n.rest.y + dy })
        stage.batchDraw()
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

      const d = objDrag.current
      objDrag.current = null
      if (d) {
        // hand every node back to where it actually rests
        for (const n of d.nodes) n.node.position(n.rest)
        if (d.moved && d.delta && (d.delta.dx || d.delta.dy)) {
          /* ONE call for the whole selection, so the drag is ONE history
             entry. moveObjects pushes history itself and cascades a floor
             plan to its children, which is why the preview moved that same
             cascade set. */
          useCanvasStore.getState().moveObjects(d.ids, d.delta.dx, d.delta.dy)
          reparentMoved(d.ids)
        } else {
          stageRef.current?.batchDraw()
        }
        setCursor(spaceDown.current ? 'grab' : 'default')
        return
      }

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
            <Scene listening />
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
