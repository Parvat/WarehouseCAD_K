import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { dlog, dcensus, debugOn } from './debugLog'
import { idFromNode, nodeName, outlineBounds, hitPadMargins } from './shapes'

/* ── TEMPORARY diagnostics — DELETE once the interaction bugs are closed ────
   Everything in this file exists to make picking/hit-graph problems visible
   on screen instead of theorized about (CANVAS2_BUGLOG BUG 3). It reads the
   store and the live Konva tree but never writes either, and Canvas2.jsx
   treats it as fully optional: pull the two hook calls out of Canvas2.jsx and
   this file can be deleted with nothing else to touch (CANVAS2.md rule 7 /
   file map). */

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

/** For a null-intersection click: the nearest RACK object, with its drawn
 *  bounds and its hit-rect bounds both already converted to the click's own
 *  screen-pixel space, so the caller compares like with like instead of
 *  inferring anything from world coordinates or distance alone.
 *
 *  Reuses hitPadMargins — the exact function HitPad's own hitFunc calls — so
 *  this can never report a hit-rect that disagrees with what Konva actually
 *  tested the click against. */
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

/** How many objects exist vs how many the hit graph can actually find. A gap
 *  here is the selection bug made visible. */
export function useClickCensus({ stageRef, objects, selectedIds, zoom }) {
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
}

/** What the report needs to distinguish: for a dead rack, does
 *  getIntersection return nothing, return a DIFFERENT node (wrong target),
 *  or return the right node while no handler ever runs?
 *
 *  A native, CAPTURE-phase listener on the container sees every mousedown
 *  before Konva's own bubble-phase dispatch runs — so it can compute
 *  getIntersection independently of whatever cancelBubble/early-returns
 *  happen inside our own handlers, and its answer can never be skewed by
 *  them. Each object's bind() and the Stage's own handler then stamp
 *  "a handler fired here" onto the SAME record; a setTimeout(0) flushes it
 *  to the panel once (macrotask) after that click's synchronous dispatch —
 *  handlers, drag, everything — has finished, so one panel entry holds the
 *  full story: pointer, what Konva's hit graph found, what object that
 *  resolves to, and which handler (if any) actually ran.
 *
 *  Returns noteHandlerFired(label) for the caller's own handlers to stamp
 *  themselves onto the in-flight record. */
export function useNativeClickTrace({ stageRef }) {
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

  return noteHandlerFired
}
