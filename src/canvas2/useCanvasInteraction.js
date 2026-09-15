import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { hitTest, hitTestBay } from './hitTest'
import { snapToGrid, objectContains } from '../utils/canvas'
import {
  nextSelection, normalizeRect, objectsInMarquee, movedEnough,
  movedIdsFor, objectCentre, isFloorPlan,
} from './selection'
import { useCanvasStore } from '../store/useCanvasStore'
import { zoomAtPoint, wheelFactor, screenToWorld, fitView, worldBounds } from './viewport'
import { dlog, debugOn } from './debugLog'

/* Only the LEFT button may drag an object. Konva allows the middle button by
   default, which turned every middle-drag-to-pan that happened to start over a
   rack into a move of that rack. */
Konva.dragButtons = [0]

/* A blank project's starting zoom, once there is nothing yet to fit to. Not
   the store's own raw default (zoom 1) — that is tuned for the SVG canvas's
   close-up drawing scale and shows barely ~35ft across on this grid
   (40px = 1ft). This is well short of the whole-building 7% dealers work at
   (CANVAS2.md rule 7) on purpose: an empty sheet needs room to START drawing
   in, not a view already zoomed for a building that does not exist yet. */
const EMPTY_CANVAS_ZOOM = 0.15

/* ── Input/interaction orchestration ─────────────────────────────────────────
   Everything that decides what a press/move/release DOES: pan, marquee,
   object drag, and the one geometry-based pick (hitTest) that drives both
   selection and drag arming (CANVAS2_BUGLOG BUG 4 — Konva's own
   draggable/dragstart ran a second, independent hit-test that could disagree
   with this one, so it is gone; object nodes carry no event props at all and
   are pure paint).

   This hook owns no Stage/Layer JSX — that is Canvas2.jsx's job (mounting).
   It is handed the live view (a ref, pushed to the Stage imperatively per
   CANVAS2.md rule 6) and a setter for it, and returns the handlers Canvas2.jsx
   wires onto the Stage plus the cursor/marquee state those gestures drive. */
export function useCanvasInteraction({
  stageRef, view, setView, size, objects, noteHandlerFired, dblClickFitEnabled = false,
}) {
  const [cursor, setCursor] = useState('default')
  const [marquee, setMarquee] = useState(null)

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

  /* ── selection, from our own geometry pick ────────────────────────────── */
  /* Selection AND bay pick, from a world point and a hit id already decided by
     hitTest/hitTestBay — geometry, not Konva's scene graph (CANVAS2.md rule
     4). No Konva event is needed here any more: hitId came from our own
     picking, so there is nothing left to read off `e`. */
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
  /* Shared by beginDrag and the first real move below. Selecting an object
     that wasn't already selected happens in the SAME mousedown as this call,
     so React hasn't committed its new <SelectionOutline> yet — the sel: node
     for a freshly-grabbed object simply doesn't exist in the Konva tree at
     mousedown time. Collecting again once the drag actually starts (i.e. on
     the first mousemove past the threshold, which always lands after React
     has flushed) picks that node up instead of leaving it stranded at rest. */
  const collectDragNodes = (stage, ids) => {
    const st = useCanvasStore.getState()
    const want = movedIdsFor(st.objects, ids)
    const nodes = []
    for (const layer of stage.getLayers()) {
      for (const n of layer.getChildren()) {
        const nm = n.name() || ''
        const id = (nm.startsWith('obj:') || nm.startsWith('sel:')) ? nm.slice(4) : null
        if (id && want.has(id)) nodes.push({ node: n, rest: n.position() })
      }
    }
    return nodes
  }

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
    const nodes = collectDragNodes(stage, ids)
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
    noteHandlerFired?.('stage (target=' + (e.target && e.target.getClassName ? e.target.getClassName() : '?') + ')')

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
        if (!d.moved) {
          // re-collect now that React has had a chance to mount a freshly-selected node's outline
          const fresh = collectDragNodes(stage, d.ids)
          if (fresh.length) d.nodes = fresh
        }
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

  /* Fits the whole drawing into view — the whole-building view is where this
     canvas has to be judged, so it should be one gesture away. Shared by the
     visible Fit button, double-click, and the auto-fit-on-load effect below,
     so all three ways of asking "show me everything" agree. Returns the view
     it applied (or null if there was nothing to fit yet), so a caller can
     tell whether it actually happened.

     Reads the store and the Stage's OWN current container size directly,
     rather than trusting the `objects`/`size` closed over from this render:
     a caller reached through a timer (the auto-fit debounce below) would
     otherwise fit against whatever was current when that timer was
     SCHEDULED, not when it actually FIRES — stale by exactly the length of
     the delay. */
  const fitToContent = () => {
    const st = useCanvasStore.getState()
    const container = stageRef.current?.container()
    const liveSize = container ? { w: container.clientWidth, h: container.clientHeight } : size
    const v = fitView(worldBounds(st.objects, st.gridSize), liveSize)
    if (v) setView(v)
    return v
  }

  /* Double-click is otherwise unclaimed on this canvas, but a big view jump
     from a gesture people also reach for while editing (renaming, drilling
     into a bay) is disorienting if it fires by accident — Canvas2.jsx now
     owns a persisted opt-in for it, off by default; the Fit button is the
     always-available control regardless of this setting. */
  const onDblClick = () => { if (dblClickFitEnabled) fitToContent() }

  /* Auto-fit on load, AND every time a NEW floor plan is placed.

     The view seeded into the ref (Canvas2.jsx, from whatever zoom/pan the
     store's autosave restored) can be an arbitrary leftover — including an
     extreme zoom-out from a past session — with nothing to do with what is
     actually on the sheet now. Fitting once on load replaces that leftover
     with the same "whole building" view Fit/double-click produce.

     But it can't stop there: the store's OWN placeFpObject (called by
     generate — CANVAS2.md rule 1, frozen brain, not ours to fix) sets its
     own zoom/pan whenever a floor plan is placed, computed from
     document.getElementById('canvas-container') — the SVG canvas's id. Under
     the flag, that element does not exist, so it silently falls back to a
     hardcoded 900x600 guess instead of this canvas's real size, and hands
     back whatever zoom fits the building into THAT — wrong for canvas2's
     actual container, and stale forever after a one-shot latch (a
     regenerate on an already-open project re-triggers the same wrong
     calculation, and nothing was left to correct it a second time).

     Tracking which floor-plan ids have already been fit for, rather than a
     single boolean, re-fits exactly when a NEW building shows up — generate,
     regenerate, or a hand-drawn floor plan — and leaves every ordinary edit
     (move, resize, add a rack by hand, toggle a bay) alone: none of those
     place a new floor plan, so none of them fight the user's own pan/zoom.

     Confirmed root cause of a wrong fit sticking after a generate: traceGenerate's
     own buildQueue places the floor plan, THEN does `await nextFrame()` BEFORE
     adding a single rack (so the "Generating..." progress UI can paint at 0%) —
     racks then arrive in their own batches, each separated by another
     `await nextFrame()`. That yield is a GUARANTEED moment where React commits
     a scene containing the floor plan ALONE. Firing the fit immediately (the
     previous version of this effect, via useLayoutEffect with no wait) could
     latch onto exactly that moment — fitting tightly to the empty building,
     then never revisiting it as the real racks landed a frame later, since no
     NEW floor-plan id appears once they do. That is what made the zoom
     non-deterministic run to run: whichever frame this effect happened to
     see first decided the fit, permanently, for the rest of the session.

     Fixed by waiting for `objects.length` to stop changing for a couple of
     animation frames before trusting it — re-checked on every rAF tick, and
     restarted (via the effect's own cleanup) every time `objects` changes
     again, so a still-arriving batch can never be mistaken for the final
     scene. A plain reload (objects restored all at once, no batching) still
     settles in ~2 frames — imperceptible, and the RIGHT scene every time. */
  const didAnyFit = useRef(false)
  const fittedFpIds = useRef(new Set())
  useLayoutEffect(() => {
    if (!(size.w > 0 && size.h > 0)) return
    const fpIds = objects.filter(isFloorPlan).map(o => o.id)
    const hasNewFp = fpIds.some(id => !fittedFpIds.current.has(id))
    if (didAnyFit.current && !hasNewFp) return

    let raf = 0
    let lastCount = -1
    let stableTicks = 0
    const check = () => {
      const n = useCanvasStore.getState().objects.length
      if (n === lastCount) stableTicks++
      else { stableTicks = 0; lastCount = n }
      if (stableTicks < 2) { raf = requestAnimationFrame(check); return }

      const liveFpIds = useCanvasStore.getState().objects.filter(isFloorPlan).map(o => o.id)
      const v = fitToContent()
      if (debugOn()) {
        dlog('auto-fit', [
          v ? `zoom ${(v.zoom * 100).toFixed(1)}%  pan ${Math.round(v.panX)},${Math.round(v.panY)}`
            : 'nothing to fit yet (empty scene)',
          `objects ${n}  floor plans ${liveFpIds.length}  container ${Math.round(size.w)}x${Math.round(size.h)}`,
        ])
      }
      if (v) {
        didAnyFit.current = true
        for (const id of liveFpIds) fittedFpIds.current.add(id)
        return
      }
      /* Nothing to fit to yet — a brand new, still-blank project. Leaving
         the raw store default (zoom 1, tuned for the SVG canvas's close-up
         drawing scale) shows barely ~35ft across on a warehouse-scale
         sheet, which is "loaded zoomed in" before anything has even been
         drawn. A sane starting scale, centred on the origin, gives room to
         draw before there is any content to fit to — applied once; the
         branch above takes over the moment a real floor plan exists. */
      if (!didAnyFit.current) {
        didAnyFit.current = true
        setView({ zoom: EMPTY_CANVAS_ZOOM, panX: size.w / 2, panY: size.h / 2 })
      }
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [size.w, size.h, objects])

  return { onStageMouseDown, onWheel, onDblClick, fitToContent, cursor, marquee }
}
