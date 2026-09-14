import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { snapToGrid } from '../../utils/canvas'
import { bayAtPoint } from '../../render/rackOps'
import { FP_RENDER_TYPES } from './KonvaScene'
import { OWNER, isTransformerPart, forwardToSvg, forwardWheel, isForwarded } from './konvaInputRouter'

/* ── Konva rack interaction — select, bay-select, drag ───────────────────────
   Hit-testing is Konva's (stage.getIntersection reads the hit graph), but the
   listeners sit on #canvas-container in the CAPTURE phase rather than on the
   Konva stage itself. That is deliberate while both renderers are live:

     • The Konva wrapper stays pointer-events:none, so Konva never receives a
       DOM event of its own and cannot double-handle one the SVG also sees.
     • A capture listener on the container runs before React dispatches its
       own handlers at the root, so when a rack IS hit we stopPropagation and
       the SVG renderer never learns the event happened — no double select,
       no double drag.
     • When nothing is hit we do nothing at all, and the event continues to
       the SVG exactly as before. Panning, marquee and every other canvas
       behaviour are untouched.

   Nothing here changes the store's shape. It calls the same selectObject /
   selectGroup / updateObject / moveObjects the SVG calls, with the same
   semantics — the selection rules below are mirrored from CanvasArea's
   mousedown branch rule for rule, so a rack behaves identically whichever
   renderer happens to be painting it. */

/* Screen px of travel before a press counts as a drag rather than a click —
   otherwise a shaky click would move the rack a pixel and burn an undo. */
const DRAG_THRESHOLD = 3

/* Every node the drag preview may need to offset is named `<kind>:<id>`, so one
   pass over the layers can collect an object's body, its floor plan, its
   selection handles and its dimension labels together. */
const PREFIXES = ['rack:', 'fp:', 'sel:', 'dim:']
const RACK_PREFIX = 'rack:'
const FP_PREFIX   = 'fp:'
export const rackNodeName = id => RACK_PREFIX + id
export const fpNodeName   = id => FP_PREFIX + id

/** The Konva node that IS the object on screen, whichever painter drew it.
 *
 *  Racks and fallback objects are named "rack:<id>", floor plans "fp:<id>".
 *  Anything that resolves a node from an id has to know BOTH, or it silently
 *  fails for exactly one kind of object — which is how the Transformer ended up
 *  attaching to nothing whenever the building was selected. */
export function findObjectNode(stage, id) {
  if (!stage || !id) return null
  const want = new Set([RACK_PREFIX + id, FP_PREFIX + id])
  return stage.findOne(n => n.name && want.has(n.name())) || null
}

const nameId = n => {
  const nm = n.name() || ''
  for (const p of PREFIXES) if (nm.startsWith(p)) return nm.slice(p.length)
  return null
}

export function useKonvaRackInteraction(stageRef, enabled) {
  const drag = useRef(null)
  /* Latched on mousedown, held until mouseup: one gesture, one owner. */
  const owner = useRef(OWNER.NONE)

  useEffect(() => {
    if (!enabled) return
    const container = document.getElementById('canvas-container')
    if (!container) return

    const stagePoint = (e) => {
      const r = container.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const toWorld = (p, stage) => ({
      x: (p.x - stage.x()) / stage.scaleX(),
      y: (p.y - stage.y()) / stage.scaleY(),
    })

    /* Walk up from whatever shape was hit to the node that carries the object
       id — a click can land on a rack's box rect, its dividers path, or a
       floor plan's wall band. */
    const objectNodeAt = (stage, p) => {
      let n = stage.getIntersection(p)
      while (n && nameId(n) === null) n = n.getParent()
      return n && nameId(n) !== null ? n : null
    }

    /* Every node belonging to `ids`, across all layers, in ONE pass — body,
       floor plan, handles and dimension labels alike. A select-all on a full
       sheet would otherwise walk the child lists once per selected object. */
    const nodesFor = (stage, ids) => {
      const want = ids instanceof Set ? ids : new Set(ids)
      const out = []
      for (const layer of stage.getLayers()) {
        for (const n of layer.getChildren()) {
          const id = nameId(n)
          if (id !== null && want.has(id)) out.push(n)
        }
      }
      return out
    }

    /* The ids moveObjects will actually move: the selection, plus the children
       of any selected floor plan, which the store cascades. Previewing a
       different set from the one that commits is how a drag ends up landing
       somewhere other than where it looked. */
    const movedIdsFor = (objects, ids) => {
      const set = new Set(ids)
      const fps = new Set()
      for (const o of objects) {
        if (set.has(o.id) && FP_RENDER_TYPES.has(o.type)) fps.add(o.id)
      }
      if (fps.size) {
        for (const o of objects) if (o.parentId && fps.has(o.parentId)) set.add(o.id)
      }
      return set
    }

    const onDown = (e) => {
      if (isForwarded(e)) return            // our own re-dispatch coming back
      const stage = stageRef.current
      if (!stage) return
      if (e.button !== 0) { owner.current = OWNER.SVG; forwardToSvg(e); return }

      /* Shift is the rubber-band gesture in both Select and Pan, even over an
         object, and marquee is how a multi-selection gets built. It belongs to
         the canvas, so it goes straight across. */
      if (e.shiftKey) { owner.current = OWNER.SVG; forwardToSvg(e); return }

      const p = stagePoint(e)

      /* A Transformer anchor is Konva's own gesture. Touch nothing: no
         stopPropagation and no forward, so the event flows on into the Stage
         and the Transformer drives the resize or rotate itself. */
      if (isTransformerPart(stage.getIntersection(p))) {
        owner.current = OWNER.TRANSFORMER
        return
      }

      const group = objectNodeAt(stage, p)
      if (!group) {                          // empty space — a canvas gesture
        owner.current = OWNER.SVG
        forwardToSvg(e)
        return
      }

      const id = nameId(group)
      const st = useCanvasStore.getState()
      if (!st.objects.some(o => o.id === id)) { owner.current = OWNER.SVG; forwardToSvg(e); return }
      owner.current = OWNER.KONVA

      /* Yield every press that lands on the SVG's own interactive overlay —
         resize handles, the rotate handle, wall drags, the group outline. They
         all mark themselves `data-ui-overlay`, the flag saveLoad already uses
         to strip UI out of an export, and CanvasArea still owns that input: it
         holds the resize maths (applyResize, the rotated-object anchor
         correction, arc bend, wall segments), and a second copy here would be
         a second path to drift out of sync. Konva paints those handles; the
         SVG keeps driving them.

         The exception is an UNSELECTED floor plan. Its wall hit areas span the
         whole outline and carry the same flag, but they deliberately pass the
         press through until the plan is selected — that first press is a
         select-and-move, not a wall drag, and it is the gesture Konva needs in
         order to preview the building and its contents together. Once the plan
         IS selected the wall bands become resize handles and Konva yields them
         like any other. */
      e.stopPropagation()
      e.preventDefault()

      /* Selection, mirroring CanvasArea:
           • a grouped rack selects its whole group;
           • a rack that is ALREADY selected keeps the selection intact — this
             is what makes dragging a multi-selection possible at all, since
             re-selecting on every press would collapse it to one first;
           • only a rack from outside the selection replaces it. */
      const grp = (st.groups || []).find(g => g.ids.includes(id))
      if (grp) st.selectGroup(grp.ids)
      else if (!st.selectedIds.includes(id)) st.selectObject(id, false)

      /* Read back AFTER the selection settles: selectObject clears bay
         highlights when switching objects, and selectGroup rewrites the whole
         selection, so the pre-click snapshot is no longer what will move. */
      const now = useCanvasStore.getState()
      const obj = now.objects.find(o => o.id === id)
      if (!obj) return

      /* Bay pick toggles, matching the SVG: clicking the active bay clears it,
         and a grouped rack picks no bay at all (the group is the unit).
         updateObject, not commitObjectUpdate — picking a bay is a selection,
         and selections do not belong on the undo stack. */
      if (!grp) {
        const world = toWorld(p, stage)
        const bay = bayAtPoint(obj, world.x, now.gridSize)
        if (bay != null) {
          now.updateObject(id, { activeBayIdx: obj.activeBayIdx === bay ? null : bay })
        }
      }

      const ids = [...now.selectedIds]

      drag.current = {
        ids,                                  // what commits
        stage,
        /* Dragging a floor plan previews its children too — moveObjects
           cascades them on commit, so leaving them still would make the drag
           land somewhere other than where it looked. */
        /* Each node's REST position is captured, not assumed to be (0,0):
           rack groups now sit at their own centre so rotation pivots there, so
           snapping a preview back to the origin would fling them across the
           sheet. Overlay groups still rest at 0,0 and fall out of the same
           rule for free. */
        nodes: nodesFor(stage, movedIdsFor(now.objects, ids))
          .map(n => ({ node: n, rest: n.position() })),
        startWorld: toWorld(p, stage),
        origin: { x: obj.x, y: obj.y },       // the grabbed object, which snap follows
        moved: false,
        delta: null,
      }
    }

    const onMove = (e) => {
      if (isForwarded(e)) return
      const o = owner.current
      /* The Transformer is mid-gesture: leave the event alone entirely. */
      if (o === OWNER.TRANSFORMER) return
      /* A canvas gesture in progress, or a plain hover with nothing pressed —
         both belong to the SVG, which needs the moves for rubber-band, tool
         previews, hover highlighting and the cursor. */
      if (o === OWNER.SVG || o === OWNER.NONE) { forwardToSvg(e); return }

      const d = drag.current
      if (!d) return
      const stage = stageRef.current
      if (!stage) return
      e.stopPropagation()

      const world = toWorld(stagePoint(e), stage)
      let dx = world.x - d.startWorld.x
      let dy = world.y - d.startWorld.y

      if (!d.moved && Math.hypot(dx, dy) * stage.scaleX() < DRAG_THRESHOLD) return
      d.moved = true

      const st = useCanvasStore.getState()
      if (st.snapToGrid) {
        /* Snap the resulting POSITION, not the delta — snapping the delta
           would preserve whatever sub-grid offset the rack started with.
           Only the GRABBED rack snaps; everything else in the selection moves
           by that same delta, so the set keeps its internal spacing instead of
           each rack collapsing onto its own nearest gridline. */
        dx = snapToGrid(d.origin.x + dx, st.gridSize, st.snapUnit) - d.origin.x
        dy = snapToGrid(d.origin.y + dy, st.gridSize, st.snapUnit) - d.origin.y
      }
      d.delta = { dx, dy }

      /* Preview by offsetting the Konva Groups. No store write and no React
         render per frame — the ops are absolute world coordinates, so a group
         offset is all the movement there is. One batchDraw for the whole set,
         not one per rack. */
      for (const n of d.nodes) n.node.position({ x: n.rest.x + dx, y: n.rest.y + dy })
      d.stage?.batchDraw()
    }

    const onUp = (e) => {
      if (isForwarded(e)) return
      const o = owner.current
      owner.current = OWNER.NONE
      if (o === OWNER.TRANSFORMER) return
      if (o === OWNER.SVG) { forwardToSvg(e); return }

      const d = drag.current
      drag.current = null
      if (!d) return
      e.stopPropagation()

      // hand each group back to where it actually rests
      for (const n of d.nodes) n.node.position(n.rest)

      if (d.moved && d.delta && (d.delta.dx || d.delta.dy)) {
        /* ONE call for the whole selection, so the drag is ONE history entry.
           moveObjects pushes history itself, so calling it per rack would bury
           the pre-drag state under one undo step per selected object — and
           calling it per frame would bury it under a hundred. */
        useCanvasStore.getState().moveObjects(d.ids, d.delta.dx, d.delta.dy)
      } else {
        d.stage?.batchDraw()
      }
    }

    /* Double-click opens the text editor and wheel zooms; both are canvas
       gestures with no Konva equivalent yet, so they go straight across. */
    const onDbl = (e) => { if (!isForwarded(e)) forwardToSvg(e, 'dblclick') }
    const onWheel = (e) => { if (!isForwarded(e)) forwardWheel(e) }

    container.addEventListener('dblclick', onDbl, true)
    container.addEventListener('wheel', onWheel, true)
    container.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
    return () => {
      container.removeEventListener('dblclick', onDbl, true)
      container.removeEventListener('wheel', onWheel, true)
      container.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      drag.current = null          // never hold a node from a torn-down stage
    }
  }, [stageRef, enabled])
}
