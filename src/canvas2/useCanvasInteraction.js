import { useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { hitTest, hitTestBay } from './hitTest'
import { snapToGrid, objectContains } from '../utils/canvas'
import {
  nextSelection, normalizeRect, objectsInMarquee, movedEnough,
  movedIdsFor, objectCentre, isFloorPlan,
} from './selection'
import { useCanvasStore } from '../store/useCanvasStore'
import { zoomAtPoint, wheelFactor, screenToWorld, fitView, worldBounds } from './viewport'

/* Only the LEFT button may drag an object. Konva allows the middle button by
   default, which turned every middle-drag-to-pan that happened to start over a
   rack into a move of that rack. */
Konva.dragButtons = [0]

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
export function useCanvasInteraction({ stageRef, view, setView, size, objects, noteHandlerFired }) {
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

  /* Double-click fits the whole drawing — the whole-building view is where this
     canvas has to be judged, so it should be one gesture away. */
  const onDblClick = () => {
    const v = fitView(worldBounds(objects), size)
    if (v) setView(v)
  }

  return { onStageMouseDown, onWheel, onDblClick, cursor, marquee }
}
