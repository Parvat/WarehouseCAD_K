import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { hitTest, hitTestBay } from './hitTest'
import { handleHitTest, cursorForHandle } from './handleGeometry'
import { syncHandleOverlayNode } from './ResizeHandlesOverlay'
import { snapToGrid, objectContains, applyResize, getObjectBounds } from '../utils/canvas'
import { PORTED_RACK_TYPES } from '../render/rackOps'
import {
  nextSelection, normalizeRect, objectsInMarquee, movedEnough,
  movedIdsFor, objectCentre, isFloorPlan,
} from './selection'
import { useCanvasStore } from '../store/useCanvasStore'
import { zoomAtPoint, wheelFactor, screenToWorld, fitView, worldBounds } from './viewport'
import { dlog, debugOn } from './debugLog'

/* Beam/lane racks whose applyResize branch handles its own snapping
   internally (bay/tower/lane counts, not raw pixels) — ported verbatim from
   CanvasArea.jsx's own SNAP_FREE set. Note the asymmetry is real, not an
   oversight: rack_drive_in/through/pushback DO get grid-snapped dx/dy before
   applyResize sees it, rack_pallet_flow does not. */
const SNAP_FREE = new Set(['rack_row', 'rack_double_row', 'rack_pallet_flow', 'rack_cantilever'])

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
  const resizeDrag = useRef(null)

  /* ── selection, from our own geometry pick ────────────────────────────── */
  /* Selection AND bay pick, from a world point and a hit id already decided by
     hitTest/hitTestBay — geometry, not Konva's scene graph (CANVAS2.md rule
     4). No Konva event is needed here any more: hitId came from our own
     picking, so there is nothing left to read off `e`. */
  const selectFromHit = (hitId, shiftKey, world) => {
    const st = useCanvasStore.getState()
    const prevSelectedIds = st.selectedIds

    const { ids, replaced } = nextSelection({
      selectedIds: st.selectedIds, groups: st.groups, id: hitId, shiftKey,
    })
    if (replaced) {
      if (ids.length === 0) st.clearSelection()
      else if (ids.length === 1) st.selectObject(ids[0], false)
      else { st.clearSelection(); st.selectMultiple(ids) }
    }

    /* Clear a stale bay/tower pick on whatever was selected before, the same
       moment CanvasArea does: switching to a DIFFERENT object (not extending
       or re-clicking the current selection) leaves no reason for an old
       rack's bay highlight to keep showing. */
    if (!prevSelectedIds.includes(hitId)) {
      for (const id of prevSelectedIds) {
        const prev = st.objects.find(o => o.id === id)
        if (!prev) continue
        if (prev.activeBayIdx != null) st.updateObject(id, { activeBayIdx: null })
        if (prev.activeTowerIdx != null) st.updateObject(id, { activeTowerIdx: null })
      }
    }

    /* Bay/tower pick, toggling like the SVG — ported hitTestBay, not the
       render layer's own bayAtPoint: it answers for the full RACK_BAY_TYPES
       set (lanes and towers too, not just row/double-row) and un-rotates the
       click first, so a turned rack still resolves the right bay. Cantilever
       tracks its pick as activeTowerIdx, everything else as activeBayIdx —
       matching CanvasArea's own split. A press that lands on the rack but
       not on any bay (an upright/post) clears whichever field was active, so
       clicking off a bay reliably falls back to a plain whole-rack selection
       instead of leaving a stale highlight behind. */
    const live = st.objects.find(o => o.id === hitId)
    if (!live) return
    const isCant = live.type === 'rack_cantilever'
    const curIdx = isCant ? live.activeTowerIdx : live.activeBayIdx
    const bay = hitTestBay(live, world.x, world.y, st.gridSize)
    if (bay != null) {
      const newIdx = curIdx === bay ? null : bay
      st.updateObject(hitId, isCant ? { activeTowerIdx: newIdx } : { activeBayIdx: newIdx })
    } else if (curIdx != null) {
      st.updateObject(hitId, isCant ? { activeTowerIdx: null } : { activeBayIdx: null })
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

  /* ── resize/rotate, from the SAME hitTest family as everything else ───────
     handleHitTest (handleGeometry.js) is checked in onStageMouseDown BEFORE
     the object hitTest — a handle sits on or near the selected rack's own
     body, and must win over "re-select/drag this rack" the same way CanvasUI's
     real DOM handles physically sit above the object and catch the click
     first. Snapshotting origObj here (not reading it live during the drag)
     is CanvasArea's own pattern: applyResize's math is delta-from-drag-START,
     not delta-from-previous-frame, so the snapshot has to stay fixed for the
     whole gesture. */
  const beginHandleDrag = (obj, handle, world) => {
    resizeDrag.current = { objId: obj.id, handle, origObj: { ...obj }, startWorld: world }
  }

  /* The handles overlay's own Group, by the same 'handles:'+id name
     ResizeHandlesOverlay paints it with — the resize/rotate mousemove branch
     below uses this to nudge it live (syncHandleOverlayNode), same idea as
     collectDragNodes above but for a single, already-known node rather than
     a whole drag set. */
  const findHandlesGroup = (stage, objId) => {
    const name = 'handles:' + objId
    for (const layer of stage.getLayers()) {
      for (const n of layer.getChildren()) {
        if (n.name() === name) return n
      }
    }
    return null
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

      /* A resize/rotate handle, if the current single selection is a rack
         type render/rackOps.js draws (matches ResizeHandlesOverlay's own
         gate exactly, so a handle can never be painted somewhere this can't
         find it). Checked BEFORE the object hitTest below: a handle sits on
         or near the rack's own body, and must win the press the same way
         CanvasUI's real DOM handles physically sit above the object. */
      if (evt.button === 0 && st.selectedIds.length === 1) {
        const selected = st.objects.find(o => o.id === st.selectedIds[0])
        if (selected && PORTED_RACK_TYPES.has(selected.type)) {
          const handle = handleHitTest(selected, world.x, world.y, view.current.zoom)
          if (handle) {
            beginHandleDrag(selected, handle, world)
            return
          }
        }
      }

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

  /* Hover-only cursor feedback: which resize/rotate cursor to show BEFORE a
     press, from the same handleHitTest/cursorForHandle pair the actual
     press (onStageMouseDown) and paint (ResizeHandlesOverlay) already use —
     so the cursor a handle shows and the handle a click lands on can never
     disagree. Only runs while nothing else owns the cursor: any active
     gesture (pan/drag/marquee/resize) keeps setting it from its own
     mousemove/mouseup, and held space always means grab. */
  const onStageMouseMove = () => {
    if (pan.current || objDrag.current || marqueeRef.current || resizeDrag.current) return
    if (spaceDown.current) return
    const stage = stageRef.current
    if (!stage) return
    const p = stage.getPointerPosition()
    if (!p) return
    const world = screenToWorld(view.current, p)
    const st = useCanvasStore.getState()

    let next = 'default'
    if (st.selectedIds.length === 1) {
      const selected = st.objects.find(o => o.id === st.selectedIds[0])
      if (selected && PORTED_RACK_TYPES.has(selected.type)) {
        const handle = handleHitTest(selected, world.x, world.y, view.current.zoom)
        if (handle) next = cursorForHandle(handle, selected.rotation)
      }
    }
    setCursor(next)
  }

  /* Without this, a resize-cursor set by a hover right at the canvas edge
     sticks after the pointer leaves — onStageMouseMove never fires again to
     clear it since the mouse is no longer over the Stage. Only relevant when
     idle: an active gesture is already on window-level move/up and keeps
     going (and setting its own cursor) even off-canvas. */
  const onStageMouseLeave = () => {
    if (pan.current || objDrag.current || marqueeRef.current || resizeDrag.current) return
    setCursor(spaceDown.current ? 'grab' : 'default')
  }

  /* Pan, marquee AND object drag all take their moves on WINDOW: a
     Stage-bound gesture dies the moment the pointer leaves the canvas — over
     the right panel, or past the window edge — leaving it stuck mid-drag.
     Window capture ends every one of these where the mouse actually ends,
     and it is the ONLY place that moves a dragged object now that Konva's
     own drag capture is gone. */
  useEffect(() => {
    const move = (evt) => {
      const rd = resizeDrag.current
      if (rd) {
        const stage = stageRef.current
        if (!stage) return
        const box = stage.container().getBoundingClientRect()
        const pos = screenToWorld(view.current, { x: evt.clientX - box.left, y: evt.clientY - box.top })
        const st = useCanvasStore.getState()
        const { objId, handle, origObj, startWorld } = rd

        if (handle === 'rotate') {
          /* Same flow as CanvasArea.jsx: angle from the UNSNAPPED pointer
             around the object's own (unrotated) bounds centre, 5deg steps
             normally, 45deg holding shift. */
          const b = getObjectBounds(origObj)
          const rcx = b.x + b.width / 2
          const rcy = b.y + b.height / 2
          const angle = Math.atan2(pos.y - rcy, pos.x - rcx) * 180 / Math.PI + 90
          const snapDeg = evt.shiftKey ? 45 : 5
          const snapped = ((Math.round(angle / snapDeg) * snapDeg) % 360 + 360) % 360
          st.updateObject(objId, { rotation: snapped })

          /* Same-frame handle tracking: don't wait for React to re-render
             ResizeHandlesOverlay with the new rotation. */
          const grp = findHandlesGroup(stage, objId)
          if (grp) {
            syncHandleOverlayNode(grp, { ...origObj, rotation: snapped }, view.current.zoom, st.gridSize)
            stage.batchDraw()
          }
          return
        }

        /* Resize. sx/sy mirror CanvasArea's doSnap(pos) — the CURRENT point
           snapped to the grid when snap is on — while startWorld stays the
           RAW point captured at mousedown, exactly like CanvasArea's own
           startX/startY. dx/dy is that mix, not two consistently-snapped
           points; ported as-is rather than "cleaned up". */
        const sx = st.snapToGrid ? snapToGrid(pos.x, st.gridSize, st.snapUnit) : pos.x
        const sy = st.snapToGrid ? snapToGrid(pos.y, st.gridSize, st.snapUnit) : pos.y
        let dx = sx - startWorld.x
        let dy = sy - startWorld.y

        /* Counter-rotate the drag delta into the object's own local space —
           applyResize always operates unrotated. Only rect-shaped objects
           (not lines/circles) need this; every rack type qualifies. */
        const rot = origObj.rotation || 0
        const isRect = 'x' in origObj && !('x1' in origObj) && origObj.type !== 'circle'
        if (rot !== 0 && isRect) {
          const rad = -rot * Math.PI / 180
          const rdx = dx * Math.cos(rad) - dy * Math.sin(rad)
          const rdy = dx * Math.sin(rad) + dy * Math.cos(rad)
          dx = rdx; dy = rdy
        }

        const snapFn = SNAP_FREE.has(origObj.type)
          ? (v => v)
          : (v => (st.snapToGrid ? snapToGrid(v, st.gridSize, st.snapUnit) : v))
        const updates = applyResize(origObj, handle, dx, dy, snapFn, !!evt.shiftKey)

        /* Anchor-point correction for a rotated rect: growing/shrinking
           shifts the rotation pivot (the object's own centre) unless the
           handle OPPOSITE the one being dragged is kept fixed in WORLD
           space. Ported verbatim from CanvasArea.jsx — this is what
           prevents the resize "bounce" on a turned rack. Always reads
           origObj.x/y for the OLD centre, never updates.x/y (which is
           already the shifted position for a left-handle drag; using it
           here would double-apply the shift). */
        const newW = updates.width, newH = updates.height
        if (rot !== 0 && isRect && newW !== undefined && newH !== undefined) {
          const ow = origObj.width, oh = origObj.height
          const ocx = origObj.x + ow / 2
          const ocy = origObj.y + oh / 2

          const ax = handle.includes('l') ? 1 : handle.includes('r') ? -1 : 0
          const ay = handle.includes('t') ? 1 : handle.includes('b') ? -1 : 0

          const frad = rot * Math.PI / 180
          const cos = Math.cos(frad), sin = Math.sin(frad)
          const alx = ax * ow / 2, aly = ay * oh / 2
          const awx = ocx + alx * cos - aly * sin
          const awy = ocy + alx * sin + aly * cos

          const nalx = ax * newW / 2, naly = ay * newH / 2
          const ncx = awx - (nalx * cos - naly * sin)
          const ncy = awy - (nalx * sin + naly * cos)

          updates.x = ncx - newW / 2
          updates.y = ncy - newH / 2
        }

        /* Live preview, no history — mirrors CanvasArea exactly: a real
           store write every frame (not a Konva-node shortcut the way plain
           object drag uses) because a resize can rewrite beams/lanes/towers,
           which only a real re-render can redraw. mouseup below commits the
           ONE history entry for the whole gesture. */
        st.updateObject(objId, updates)

        /* Same-frame handle tracking (see the rotate branch above): the
           squares must move with the object THIS frame, not whenever React
           gets around to re-rendering ResizeHandlesOverlay from the store
           write just above. */
        const grp = findHandlesGroup(stage, objId)
        if (grp) {
          syncHandleOverlayNode(grp, { ...origObj, ...updates }, view.current.zoom, st.gridSize)
          stage.batchDraw()
        }
        return
      }

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

      const rd = resizeDrag.current
      resizeDrag.current = null
      if (rd) {
        /* ONE history entry for the whole gesture — commitObjectUpdate pushes
           history; updateObject (used for every frame of the live preview
           above) does not. The object is already fully live-updated in the
           store from the last mousemove, so this is CanvasArea's own
           "commit with the object's own current state" no-op-Object.assign
           pattern: its only real job is the single pushHistory call. */
        const st = useCanvasStore.getState()
        const obj = st.objects.find(o => o.id === rd.objId)
        if (obj) st.commitObjectUpdate(rd.objId, obj)
        setCursor(spaceDown.current ? 'grab' : 'default')
        return
      }

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

  return { onStageMouseDown, onStageMouseMove, onStageMouseLeave, onWheel, onDblClick, fitToContent, cursor, marquee }
}
