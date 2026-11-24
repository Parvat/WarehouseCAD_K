import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
import { Scene } from './Scene'
import { useDevicePixelRatio } from './pixelRatio'
import { installMinText } from './minText'
import { Overlays } from './Overlays'
import { ResizeHandlesOverlay } from './ResizeHandlesOverlay'
import { GroupRotateOverlay } from './GroupRotateOverlay'
import { FpRotateHandleOverlay } from './FpRotateHandleOverlay'
import { HoverHighlight } from './HoverHighlight'
import { Rulers } from './Rulers'
import { MeasureOverlay } from './MeasureTool'
import { PlacementGhost } from './CopyChange'
import { RowGroupPreview } from './RowGroupPreview'
import { SplitPreview } from './SplitPreview'
import { IssueHighlight } from './IssueHighlight'
import { RowGroupBar } from './RowGroupBar'
import { PORTED_RACK_TYPES } from '../render/rackOps'
import { useCanvasStore } from '../store/useCanvasStore'
import { useCanvasInteraction } from './useCanvasInteraction'
import { clampZoom, screenToWorld } from './viewport'
import { isFloorPlan } from './selection'
import { useColumnCheck } from '../generate/useColumnCheck'
import { FillOverlay } from './FillTool'
import { SectionDraft, SectionPointHandles } from './SectionShape'
import { SectionBar, SectionRename } from './SectionBar'
import { FpDimEdit } from './FpDimEdit'
import { ColumnChainEdit } from './ColumnChainEdit'
import { DragBayBox, ChainHint } from './DragBay'
import { SECTION_RECT_TOOL, SECTION_PEN_TOOL, startRect, moveRect, commitRect, penClick, penMove, penDblClick, useSectionTool } from './sectionTool'
import { FillOptionsBar } from './FillBar'
import { SplitBar } from './SplitBar'
import { DoorBar, DoorPreview, DoorGapLive, RowPreview, useDoorGapKeys } from './DoorBar'
import { DrawPreview, TextEditor, useDrawKeys, ShapePointHandles, TextBoxDraft } from './DrawBar'
import { useDrawTool, shapeOfTool, twoPoint, snapPoint, commitShape, startText, commitText, closesAt, editText, addPolylinePoint, RECT_CLICK_IN, noteLead } from '../utils/drawTool'
import { isPointShape, sideAt, pointAt } from '../render/drawnShapes'
import { pickAt } from './hitTest'
import { rowWallAt, rowCountOn, hoverRow, dropRow, fillRow } from '../utils/doorRowTool'
import { DOOR_TOOL, hoverDoor, placeDoor, clearDoorHover, useDoorTool } from '../utils/doorTool'
import { SelectionBar, FloorMenu, openFloorMenu } from '../studio/SelectionBar'
import { PlaceColumnGrid } from '../studio/PlaceColumnGrid'
import { ColumnLineLabels } from './ColumnLineLabels'
import { ZoneEditPreview, SelectedZoneSizes } from './ZoneEdit'
import { ZoneCheckPreview } from './ZoneCheck'
import { hasResizeHandles, objHasResizeHandles } from './handleGeometry'
import { FILL_TOOL, startFill, moveFill, commitFill, useFillTool, hoverFill } from '../utils/fillTool'
import { HOME_TOOL } from '../utils/homeTool'
import { useMeasureMode, endTool } from '../utils/toolSwitch'
import { ROW_GROUP_TOOL, startGroupBox, moveGroupBox, commitGroupPress, useRowGroup, groupRowsNow } from '../utils/rowGroupTool'
import { hitTest } from './hitTest'
import { isPickable, isLockedIn } from '../utils/layers'
import { SPLIT_TOOL, useSplit, hoverSplit, splitAt } from '../utils/splitTool'
import { rebuildAisles } from '../utils/aisleRebuild'
import { nanoid } from 'nanoid'
import { TOOLS } from '../constants'
import { useViewPrefs, fitRef } from '../studio/viewPrefs'
import { RackLineLabels } from './RackLineLabels'
import { publishView, useView } from './live'
import { TallyFill, TallyHighlight } from './TallyHighlight'
import { SectionLegend } from './SectionLegend'
import { ColumnGridAnnot } from './ColumnGridAnnot'
import { DoorAnnot } from './DoorAnnot'
import { DoorGapEdit } from './DoorGapEdit'
import { CrossAislePick } from './CrossAislePick'
import { CrossAisleBandPreview, CrossAisleBar, liveBand } from './CrossAisleBand'
import { CROSS_AISLE_TOOL, useCrossAisleTool, commitCut } from '../utils/crossAisleCut'
import { commitTunnel } from '../utils/tunnel'
import { TunnelMarks } from './TunnelMarks'
import { StackHint } from './StackHint'   // (stacking)
import { SmartGuideLines } from './SmartGuideLines'   // (gen-lock)

// the canvas text, measured for the tests (CLAUDE.md Rule 8 — the CAD text model: canvas2/minText.js)
installMinText()

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
const Grid = memo(function Grid({ gridSize, major, minor }) {
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
})

/* Whether double-click also fits-to-content, defaulting OFF: double-click is a gesture people reach for while
   editing, and a big view jump firing by accident there is disorienting. The Fit button (the bottom-right island) is
   always there. Presentation state (src/studio/viewPrefs.js, localStorage), toggled from the layout menu. */

/* Studio ground (STUDIO.md §2): #F4F3EF with a 1px #D9D6CC dot every 20px — the grid. It moves with the pan, so the
   dots stay put under the plan; the Grid switch shows or hides it. Its own component: the pan re-renders only this (and
   the rulers). It reads the view the Stage is drawn with now (live.js), so it moves in the same frame as the plan. */
function DotGround() {
  const { panX, panY } = useView()
  return <div aria-hidden="true" data-ground style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: 'radial-gradient(#D9D6CC 1px, transparent 1.2px)', backgroundSize: '20px 20px',
    backgroundPosition: `${Math.round(panX) % 20}px ${Math.round(panY) % 20}px` }} />
}

/* Adopt view changes made OUTSIDE the canvas — the zoom buttons, fit, a
   freshly generated layout. Guarded against the values this canvas just
   wrote, or the two would fight each other every frame. Its own component so
   the per-frame pan writes re-render only this (and the rulers), never the
   canvas tree. */
function ViewAdopter({ view, apply }) {
  const zoom = useCanvasStore(s => s.zoom)
  const panX = useCanvasStore(s => s.panX)          // live-ok: adopts the store's view (the one reader that must)
  const panY = useCanvasStore(s => s.panY)          // live-ok: adopts the store's view
  useEffect(() => {
    const v = view.current
    if (zoom === v.zoom && panX === v.panX && panY === v.panY) return
    view.current = { zoom: clampZoom(zoom), panX, panY }
    apply()
  }, [zoom, panX, panY])
  return null
}

/* The rulers follow the pan, so they read it themselves — the view the Stage is drawn with now (live.js). */
function StoreRulers({ gridSize, size }) {
  const view = useView()
  return <Rulers view={view} gridSize={gridSize} size={size} />
}

export function Canvas2() {
  const [host, setHost] = useState(null)
  const stageRef = useRef(null)
  const size = useContainerSize(host)
  useDevicePixelRatio(stageRef, size.w > 0 && size.h > 0)   // (rack-design) drawn at the screen's density, kept in step

  const gridSize = useCanvasStore(s => s.gridSize)
  const objects  = useCanvasStore(s => s.objects)
  const showGrid = useCanvasStore(s => s.showGrid)
  const showRulers = useCanvasStore(s => s.showRulers)
  const uiTheme  = useCanvasStore(s => s.uiTheme)
  const showAisles = useCanvasStore(s => s.showAisles ?? true)
  const activeWall = useCanvasStore(s => s.activeWall)
  const activeBaySelection = useCanvasStore(s => s.activeBaySelection)

  /* Column clearance labels and blocked-face marks (Overlays) read straight
     off the same derived check the RightPanel's Column Check panel already
     shows — one source of truth for "how much clearance does this column
     have" and "which pick face is blocked," not a second geometry pass. */
  const { result: columnCheckResult, columns: columnCheckColumns, showMarks: columnCheckShowMarks } = useColumnCheck()

  /* The live view. Seeded from the store so toggling the canvas keeps your
     place, then owned here for the duration of a gesture. */
  const view = useRef({
    zoom: clampZoom(useCanvasStore.getState().zoom),
    panX: useCanvasStore.getState().panX,           // live-ok: the seed, before the first draw
    panY: useCanvasStore.getState().panY,           // live-ok: the seed
  })

  /* What to outline. Selection is store state, so this re-renders when it
     changes — but never during a drag, which moves the nodes directly. */
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const selectedObjects = useMemo(
    () => objects.filter(o => selectedIds.includes(o.id)),
    [objects, selectedIds])

  /* Resize handles (and the single-object rotate stalk) stay a single-object
     control surface — resize is inherently per-object (bay counts, wall
     verts), and only for the rack types render/rackOps.js actually draws
     (the same set RackShape paints from). Rotate alone lifts the gate: 2+
     selected objects get the group outline + rotate handle instead
     (GroupRotateOverlay below), ported from CanvasUI.jsx's GroupOutline —
     see groupRotate.js.

     That group chrome is suppressed while a cross-row bay marquee is
     active (`activeBaySelection` non-empty, BUG 30) — a bay marquee adds
     every matched row to `selectedIds` too (so the Properties/multi-bay
     panel shows them), which would otherwise ALSO satisfy this ">= 2"
     gate and paint a purple group-rotate outline + handle around racks
     the user is picking BAYS out of, not preparing to rotate as a unit.
     Bay-select mode shows only the amber bay highlights (RackShape's own
     multiBaySelectionRects); the single-object resize/rotate handle above
     is untouched — a bay marquee landing on just one row still leaves
     `selectedObjects.length === 1`, so it never reaches this gate at
     all. */
  // a locked object (on its own) is selected but has no handles: it cannot be resized or rotated (STUDIO.md §7a Locks)
  const layersNow = useCanvasStore(s => s.layers)
  const unlockedSel = selectedObjects.every(o => !isLockedIn(layersNow, o))   // on its own or by its layer's padlock
  const handleTarget = unlockedSel && selectedObjects.length === 1 && objHasResizeHandles(selectedObjects[0], PORTED_RACK_TYPES)
    ? selectedObjects[0] : null

  /* A floor plan gets its OWN, rotate-only handle (FpRotateHandle — no
     8-square resize grid: an fp resizes through its wall-vertex drag,
     BUG 13, not this). Single-object only, same as handleTarget above —
     rotating a building as part of a multi-selection isn't this feature
     (group rotate, BUG 19, already covers "2+ objects turn together";
     this is specifically the container-rotation cascade to an fp's OWN
     children by parentId). */
  const fpRotateTarget = unlockedSel && selectedObjects.length === 1 && isFloorPlan(selectedObjects[0])
    ? selectedObjects[0] : null

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
    // the DOM overlays read the transform from here, in this same call (live.js) — not the store's, a frame later
    publishView(v)
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
      if (st.panX !== v.panX || st.panY !== v.panY) st.setPan(v.panX, v.panY)   // live-ok: the writer
    })
  }
  useEffect(() => () => { if (syncRaf.current) cancelAnimationFrame(syncRaf.current) }, [])

  const setView = (v) => { view.current = v; apply(); syncStore() }

  /* Adopt view changes made OUTSIDE the canvas — the zoom buttons, fit, a
     freshly generated layout. Guarded against the values this canvas just
     wrote, or the two would fight each other every frame. */
  /* Zoom is read here because the overlays size their labels by it. The pan
     is NOT: a pan writes panX/panY to the store every frame, and reading them
     here re-rendered the whole canvas tree per frame. ViewAdopter and
     StoreRulers (below) are the only readers. */
  const zoom = useCanvasStore(s => s.zoom)

  useEffect(() => { apply() }, [size.w, size.h])

  const dblClickFitEnabled = useViewPrefs(s => s.dblClickFit)

  const { onStageMouseDown, onStageMouseMove, onStageMouseLeave, onWheel, onDblClick, fitToContent, cursor, marquee, smartGuides, isForcePan, groupRowPress, groupCursorAt } =
    useCanvasInteraction({ stageRef, view, setView, size, objects, dblClickFitEnabled })
  /* the bottom-right island's Fit calls this (src/studio/StudioFrame.jsx) */
  /* (while the Tally drawer is open, into the room above it — studio/tally.js) */
  useEffect(() => {
    const fit = (inset) => fitToContent(inset)
    fitRef.current = fit; return () => { if (fitRef.current === fit) fitRef.current = null }
  })

  /* ── Measure tool — a modal click-two-points-get-distance aid, entirely
     local state (never written to the store — it's a ruler, not a document
     object). While active it takes over the Stage's own mouse handlers
     completely rather than threading a branch through useCanvasInteraction's
     much larger select/drag/marquee/resize/rotate press logic — the same
     "modal tool suspends the normal gesture set" trade-off Pan already makes
     everywhere else in this app. Points are converted to WORLD coordinates
     immediately, off `view.current` (the live ref, not the store's
     rAF-synced copy) — the same source onStageMouseDown itself reads for
     every other hit-test, so a measurement taken mid-gesture is never a
     frame stale. */
  /* the measure mode lives in utils/toolSwitch.js (useMeasureMode): choosing any tool or a library item ends it,
     and turning it on ends the tool that was running (endTool) */
  const measuring = useMeasureMode(s => s.on)
  const setMeasuring = (on) => useMeasureMode.setState({ on: !!on })
  const [measurePts, setMeasurePts] = useState([])
  const [measureHover, setMeasureHover] = useState(null)
  useEffect(() => { if (!measuring) { setMeasurePts([]); setMeasureHover(null) } }, [measuring])

  /* the measure mode is turned on and off by the tool pill's Measure (it ends the running tool first) */

  useEffect(() => {
    if (!measuring) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (measurePts.length || measureHover) { setMeasurePts([]); setMeasureHover(null) }
      else setMeasuring(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [measuring, measurePts.length, measureHover])

  const measureMouseDown = (e) => {
    const p = e.target.getStage()?.getPointerPosition()
    if (!p) return
    const world = screenToWorld(view.current, p)
    setMeasurePts((pts) => (pts.length >= 2 ? [world] : [...pts, world]))
    setMeasureHover(null)
  }
  const measureMouseMove = (e) => {
    if (measurePts.length !== 1) return
    const p = e.target.getStage()?.getPointerPosition()
    if (!p) return
    setMeasureHover(screenToWorld(view.current, p))
  }

  /* "Fill racking" (utils/fillTool.js) — another modal tool: a press starts a
     box, the drag grows it (the plan and its estimate follow), the release
     fills it as one undo step and the tool ends (back to Pan). Moves and the release are taken on window, so
     the box survives the pointer leaving the canvas. */
  const activeTool = useCanvasStore(s => s.activeTool)
  const filling = !measuring && activeTool === FILL_TOOL
  // the pointer over the plan with no box: where a fill would start (the bar's Aisle: a section's own there)
  const fillHoverMove = (e) => { const p = e.target.getStage()?.getPointerPosition(); if (p && !useFillTool.getState().drag) hoverFill(screenToWorld(view.current, p)) }
  const fillMouseDown = (e) => {
    const stage = e.target.getStage()
    const p = stage?.getPointerPosition()
    if (!p || (e.evt && e.evt.button !== 0)) return
    startFill(screenToWorld(view.current, p))
    const rect = stage.container().getBoundingClientRect()
    const move = (ev) => {
      const st = useCanvasStore.getState()
      moveFill(screenToWorld(view.current, { x: ev.clientX - rect.left, y: ev.clientY - rect.top }), st.objects, st.gridSize, st.elevations)
    }
    // one fill, then the tool ends: back to Pan (STUDIO.md §7a Modes) — unless Esc dropped the box before the release
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      const live = !!useFillTool.getState().drag
      commitFill(useCanvasStore)
      if (live) useCanvasStore.getState().setActiveTool(HOME_TOOL)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  /* "Row group" (utils/rowGroupTool.js) — the same way: a press starts a box, the release adds the rows it
     touches; a press and release without a drag toggles the row under it. The tool stays on for the next click or
     box until Esc or the bar's ✕. It takes the press before anything else, so a box may start on a wall or a rack. */
  const grouping = !measuring && activeTool === ROW_GROUP_TOOL
  const groupKeys = useRowGroup(s => s.keys)
  const groupRacks = useMemo(() => (grouping ? groupRowsNow(objects).flatMap(r => r.ids).map(id => objects.find(o => o.id === id)).filter(o => o && hasResizeHandles(o.type, PORTED_RACK_TYPES)) : []),
    [grouping, groupKeys, objects])   // eslint-disable-line react-hooks/exhaustive-deps
  /* a hit the tools may change: a locked object (picked by hitTest so a click selects it) is none */
  const unlockedHit = (st, id) => (id && isPickable(st.layers, st.objects.find(o => o.id === id)) ? id : null)
  const groupMouseDown = (e) => {
    const stage = e.target.getStage()
    const p = stage?.getPointerPosition()
    if (!p || (e.evt && e.evt.button !== 0)) return
    const st = useCanvasStore.getState(), world = screenToWorld(view.current, p)
    // a group row's handle edits it, its body moves the whole group (a click there toggles it) — STUDIO.md §7a Modes
    if (groupRowPress(e)) return
    const shiftKey = !!e.evt?.shiftKey
    // a locked rack is clicked, never changed: the Row group does not take it (STUDIO.md §7a Locks)
    const hitId = unlockedHit(st, hitTest(st.objects, st.layers, world.x, world.y, view.current.zoom, st.gridSize))
    const hit = hitId ? st.objects.find(o => o.id === hitId) : null
    startGroupBox(world, hit && (hit.type === 'rack_row' || hit.type === 'rack_double_row') ? hitId : null)
    const rect = stage.container().getBoundingClientRect(), sx = e.evt.clientX, sy = e.evt.clientY
    let moved = false
    const move = (ev) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true
      moveGroupBox(screenToWorld(view.current, { x: ev.clientX - rect.left, y: ev.clientY - rect.top }))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); commitGroupPress(useCanvasStore, moved, shiftKey) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /* "Split" (utils/splitTool.js): hovering a rack shows the cut at its nearest interior upright; a click cuts
     it there and the piece on the cursor's side follows the mouse until a click places it (Esc: in place). */
  const splitting = !measuring && activeTool === SPLIT_TOOL
  useEffect(() => { if (!splitting) useSplit.setState({ hover: null }) }, [splitting])
  const splitTarget = (e) => {
    const p = e.target.getStage()?.getPointerPosition()
    if (!p) return null
    const st = useCanvasStore.getState(), world = screenToWorld(view.current, p)
    // a locked rack is not split (STUDIO.md §7a Locks)
    return { st, world, hitId: unlockedHit(st, hitTest(st.objects, st.layers, world.x, world.y, view.current.zoom, st.gridSize)) }
  }
  const splitMouseMove = (e) => { const t = splitTarget(e); if (t) hoverSplit(t.st.objects, t.world, t.hitId, t.st.gridSize || 40) }
  const splitMouseDown = (e) => {
    if (e.evt && e.evt.button !== 0) return
    const t = splitTarget(e)
    if (t && t.hitId) splitAt(useCanvasStore, t.world, t.hitId, { newId: nanoid, rebuildAisles })
  }

  /* the Cross aisle tool (utils/crossAisleCut.js, xaisle-tool): a press starts the band, the drag lays it across the rows
     (the preview: CrossAisleBand.jsx), the release cuts every row it crosses — one undo step — the new cross-aisle picked,
     and the tool ends (back to the home tool), as Fill's does. Moves and the release are taken on window. */
  const xaisling = !measuring && activeTool === CROSS_AISLE_TOOL
  useEffect(() => { if (!xaisling) useCrossAisleTool.setState({ drag: null, at: null }) }, [xaisling])
  const xaisleHoverMove = (e) => { const p = e.target.getStage()?.getPointerPosition(); if (p && !useCrossAisleTool.getState().drag) useCrossAisleTool.setState({ at: screenToWorld(view.current, p) }) }
  const xaisleMouseDown = (e) => {
    const stage = e.target.getStage()
    const p = stage?.getPointerPosition()
    if (!p || (e.evt && e.evt.button !== 0)) return
    const from = screenToWorld(view.current, p)
    useCrossAisleTool.setState({ drag: { from, to: from } })
    const rect = stage.container().getBoundingClientRect()
    const move = (ev) => { if (useCrossAisleTool.getState().drag) useCrossAisleTool.setState(s => ({ drag: { ...s.drag, to: screenToWorld(view.current, { x: ev.clientX - rect.left, y: ev.clientY - rect.top }) } })) }
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      const drag = useCrossAisleTool.getState().drag
      useCrossAisleTool.setState({ drag: null })
      if (!drag) return                                                     // Esc dropped it
      const band = liveBand(useCanvasStore.getState(), drag)
      // Cross aisle cuts the rows; Tunnel keeps them and takes the bottom levels out of the bays under it (utils/tunnel.js)
      const T = useCrossAisleTool.getState()
      const done = band && (T.mode === 'tunnel' ? commitTunnel(useCanvasStore, band, T.levels, T.tunnelWidthFt) : commitCut(useCanvasStore, band))
      if (done) useCanvasStore.getState().setActiveTool(HOME_TOOL)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /* Add door (utils/doorTool.js): hovering a wall shows the door against its inner face; a click places it; the tool
     stays on until Esc or its bar's ✕ */
  const dooring = !measuring && activeTool === DOOR_TOOL
  useEffect(() => { if (!dooring) clearDoorHover() }, [dooring])
  useDoorGapKeys(dooring)   // a gap typed + Enter drops the next door exactly there (doors-edit round)
  // (door-row round) the bar's Row toggle and Count, and a drag along a wall with Row on
  const rowOn = useDoorTool(s => s.row), rowCount = useDoorTool(s => s.rowCount > 0), rowDragOn = useDoorTool(s => !!s.rowDrag)
  const doorWorld = (e) => { const p = e.target.getStage()?.getPointerPosition(); return p ? screenToWorld(view.current, p) : null }
  /* Row on (door-row round, design/doorbar.png; utils/doorRowTool.js): with a Count the whole row follows the pointer; a
     press along a wall starts a drag — the release decides: under 6 screen px, a click (a Count: the row dropped; Count
     empty: one door, as with Row off), else the span filled from the drag's start. Each row ONE undo step. */
  const doorMouseMove = (e) => {
    const w = doorWorld(e), st = useCanvasStore.getState(), t = useDoorTool.getState()
    if (!w) return
    if (t.row && t.rowDrag) { const d = t.rowDrag, p = d.w.axis === 'x' ? w.x : w.y; useDoorTool.setState({ rowDrag: { ...d, p1: Math.max(d.w.lo, Math.min(d.w.hi, p)) } }); return }
    if (rowCountOn()) hoverRow(st.objects, w, st.gridSize || 40, view.current.zoom)
    else hoverDoor(st.objects, w, st.gridSize || 40, view.current.zoom)
  }
  const doorMouseDown = (e) => {
    if (e.evt && e.evt.button !== 0) return
    const w = doorWorld(e), st = useCanvasStore.getState()
    if (!w) return
    if (useDoorTool.getState().row) {
      const h = rowWallAt(st.objects, w, st.gridSize || 40, 16 / view.current.zoom, useDoorTool.getState().onlySection)
      if (h) useDoorTool.setState({ rowDrag: { w: h.w, p0: h.along, p1: h.along, ref: h.d, pw: w } })
      return
    }
    placeDoor(useCanvasStore, w, nanoid, view.current.zoom); hoverDoor(useCanvasStore.getState().objects, w, useCanvasStore.getState().gridSize || 40, view.current.zoom)
  }
  useEffect(() => {
    if (!dooring) return
    const up = () => {
      const d = useDoorTool.getState().rowDrag
      if (!d) return
      useDoorTool.setState({ rowDrag: null })
      if (Math.abs(d.p1 - d.p0) * view.current.zoom >= 6) { fillRow(useCanvasStore, d, nanoid); return }
      if (rowCountOn()) dropRow(useCanvasStore, nanoid)
      else placeDoor(useCanvasStore, d.pw, nanoid, view.current.zoom)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [dooring])

  /* the Section tool (sectionTool.js; STUDIO.md §7a Sections): Rectangle — a press starts the box, the release makes the
     section (one undo step) and the tool ends; Custom shape — each click a point, a double-click or a click on the first
     point closes it. Moves and the rectangle's release are taken on window, as Fill's are. */
  const sectRect = !measuring && activeTool === SECTION_RECT_TOOL, sectPen = !measuring && activeTool === SECTION_PEN_TOOL
  const sectioning = sectRect || sectPen
  const sectWorld = (e) => { const p = e.target.getStage()?.getPointerPosition(); return p ? screenToWorld(view.current, p) : null }
  const sectionMouseDown = (e) => {
    if (e.evt && e.evt.button !== 0) return
    const w = sectWorld(e)
    if (!w) return
    if (sectPen) { penClick(useCanvasStore, w, view.current.zoom, !!e.evt?.shiftKey); return }
    // its corners snap (utils/sectionSnap.js); Alt held: no snap
    const snapOf = (alt) => { const st = useCanvasStore.getState(); return { objects: st.objects, zoom: view.current.zoom, gridSize: st.gridSize || 40, alt } }
    startRect(w, snapOf(!!e.evt?.altKey))
    const rect = e.target.getStage().container().getBoundingClientRect()
    const move = (ev) => moveRect(screenToWorld(view.current, { x: ev.clientX - rect.left, y: ev.clientY - rect.top }), snapOf(!!ev.altKey))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); if (useSectionTool.getState().drag) commitRect(useCanvasStore, view.current.zoom) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const sectionMouseMove = (e) => { if (sectPen) { const w = sectWorld(e); if (w) penMove(w, useCanvasStore, view.current.zoom, !!e.evt?.shiftKey) } }

  /* the drawing tools (D1 — utils/drawTool.js, DrawBar.jsx; design/drawbar.png): Line and Rectangle a drag or two clicks,
     Circle the centre then the radius, Polyline and Polygon a click per point (a double-click or Enter finishes). Each
     point snaps (Shift: 0 / 45 / 90°; Alt: none); each shape is one undo step; one shape, then Select (d1-fixes — a tool
     picked with a double-click stays on until Esc). A polyline / polygon snaps to its first point near it (the closing
     marker) and a click there closes it. The Text tool: a click places a text (TextEditor), a click elsewhere finishes it
     (then Select; kept on — the next text starts there). */
  const drawShape = !measuring ? shapeOfTool(activeTool) : null, drawing = !!drawShape
  const texting = !measuring && activeTool === TOOLS.TEXT
  useDrawKeys(drawing, texting)
  useEffect(() => { if (!texting && useDrawTool.getState().text) commitText(useCanvasStore, nanoid) }, [texting])
  const drawAt = (screen, evt) => {
    const st = useCanvasStore.getState(), s = useDrawTool.getState(), w = screenToWorld(view.current, screen)
    const last = s.pts[s.pts.length - 1] || null
    // near the first point of a polyline / polygon: on it (it closes there)
    if (!evt?.altKey && closesAt(drawShape, s.pts, w, view.current.zoom)) return { p: { ...s.pts[0] }, guides: [], closing: true, snap: 'close' }
    return snapPoint(w, { st, zoom: view.current.zoom, last, shift: !!evt?.shiftKey, alt: !!evt?.altKey, shape: drawShape })
  }
  const drawMouseMove = (e) => {
    const p = e.target.getStage()?.getPointerPosition()
    if (!p || useDrawTool.getState().press) return
    const r = drawAt(p, e.evt)
    useDrawTool.setState({ at: r.p, guides: r.guides, closing: !!r.closing, snap: r.snap || null })
    noteLead(drawShape, view.current.zoom)   // (d2-arrows) an elbow's first leg: the way the pointer leaves its start
  }
  const drawMouseDown = (e) => {
    if (e.evt && e.evt.button !== 0) return
    const stage = e.target.getStage(), p = stage?.getPointerPosition()
    if (!p) return
    const s = useDrawTool.getState(), r = drawAt(p, e.evt), z = view.current.zoom
    if (twoPoint(drawShape)) {
      if (s.pts.length) { commitShape(useCanvasStore, drawShape, [s.pts[0], r.p], z, nanoid); useDrawTool.setState({ at: r.p }); return }
      // the first point: a drag from it draws the shape (its release ends it); a click waits for the second click
      useDrawTool.setState({ pts: [r.p], at: r.p, guides: r.guides, press: { sx: p.x, sy: p.y }, typed: null })
      const rect = stage.container().getBoundingClientRect()
      const move = (ev) => { const q = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }, rr = drawAt(q, ev); useDrawTool.setState({ at: rr.p, guides: rr.guides, snap: rr.snap || null }); noteLead(drawShape, view.current.zoom) }
      const up = (ev) => {
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
        const t = useDrawTool.getState()
        if (!t.press) return
        let dragged = Math.hypot(ev.clientX - rect.left - t.press.sx, ev.clientY - rect.top - t.press.sy) >= 6
        // (d1-final) a rectangle dragged under 6″ either way is a click: the second click ends it
        if (dragged && drawShape === 'rect' && t.pts.length && t.at) { const lim = (RECT_CLICK_IN / 12) * (useCanvasStore.getState().gridSize || 40); if (Math.abs(t.at.x - t.pts[0].x) < lim && Math.abs(t.at.y - t.pts[0].y) < lim) dragged = false }
        if (dragged && t.pts.length && t.at) commitShape(useCanvasStore, drawShape, [t.pts[0], t.at], view.current.zoom, nanoid)
        else useDrawTool.setState({ press: null })
      }
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
      return
    }
    // a polyline / polygon: a click on its first point closes it and finishes it
    if (r.closing) { commitShape(useCanvasStore, drawShape, s.pts, z, nanoid, true); return }
    // a point — a second press on the same spot (a double-click's) adds none
    const last = s.pts[s.pts.length - 1]
    if (last && Math.hypot(r.p.x - last.x, r.p.y - last.y) <= 3 / z) { useDrawTool.setState({ added: false }); return }
    useDrawTool.setState({ pts: [...s.pts, r.p], at: r.p, added: true, typed: null })
  }
  const drawDblClick = () => {
    const s = useDrawTool.getState()
    if (twoPoint(drawShape) || s.added) { useDrawTool.setState({ added: false }); return }
    if (s.pts.length) commitShape(useCanvasStore, drawShape, s.pts, view.current.zoom, nanoid)
  }
  const textMouseDown = (e) => {
    if (e.evt && e.evt.button !== 0) return
    const p = e.target.getStage()?.getPointerPosition()
    if (!p) return
    e.evt?.preventDefault?.()                       // the press does not take the focus back from the text being typed
    if (useDrawTool.getState().text) {
      const was = useDrawTool.getState().text, made = commitText(useCanvasStore, nanoid)
      // one text, then Select with it selected (d1-fixes) — unless the tool is kept on (a double-click): the next starts here;
      // a text edited again (d1-final): finished, then Select
      if ((made && !useDrawTool.getState().keep) || was.id) { useCanvasStore.getState().setActiveTool(TOOLS.SELECT); if (made) useCanvasStore.getState().selectObject(made.id, false); return }
    }
    /* (d1-final) a drag sets the text's wrap width (the box dragged, its left edge where the press was); a click — none */
    const stage = e.target.getStage(), rect = stage.container().getBoundingClientRect(), w0 = screenToWorld(view.current, p)
    const move = (ev) => { const q = screenToWorld(view.current, { x: ev.clientX - rect.left, y: ev.clientY - rect.top }); useDrawTool.setState({ textPress: { x0: w0.x, y0: w0.y, x1: q.x, y1: q.y } }) }
    const up = (ev) => {
      window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move)
      useDrawTool.setState({ textPress: null })
      const q = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }, gs = useCanvasStore.getState().gridSize || 40
      if (Math.hypot(q.x - p.x, q.y - p.y) >= 6) { const w1 = screenToWorld(view.current, q); startText({ x: Math.min(w0.x, w1.x), y: Math.min(w0.y, w1.y) }, gs, Math.abs(w1.x - w0.x)) }
      else startText(w0, gs)
    }
    window.addEventListener('mouseup', up)
  }
  /* (d1-final) a double-click with Select or Pan: on a text — its words edited again; on a side of the selected polyline —
     a point added there (one undo); else the canvas's own (fit) */
  const shapeDblClick = (e) => {
    const stage = e?.target?.getStage?.(), p = stage?.getPointerPosition()
    // a double-click is two presses in one spot: a click, then a drag soon after, is not one (it moves what it grabbed)
    const [pa, pb] = presses.current.slice(-2)
    if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) > 4 || (p && Math.hypot(p.x - pb.x, p.y - pb.y) > 4)) return
    if (p) {
      const st = useCanvasStore.getState(), w = screenToWorld(view.current, p), z = view.current.zoom
      const sel = st.selectedIds.length === 1 ? st.objects.find(o => o.id === st.selectedIds[0]) : null
      if (sel && sel.type === 'polyline' && isPointShape(sel) && !sel.locked) {
        // on one of its points already (a quick click after a double-click reads as another): nothing added
        if (pointAt(sel, w.x, w.y, 7 / z) >= 0) return
        const si = sideAt(sel, w.x, w.y, Math.max(2, (sel.strokeWidth || 2) / 2 + 3) / z)
        if (si >= 0) { addPolylinePoint(useCanvasStore, sel.id, si, w); return }
      }
      const hit = pickAt(st.objects, st.layers, w.x, w.y, z, st.gridSize || 40)
      const o = hit.id && st.objects.find(q => q.id === hit.id)
      if (o && o.type === 'text' && !o.locked) { editText(useCanvasStore, o.id); return }
    }
    onDblClick(e)
  }

  const modeMouseDown = drawing ? drawMouseDown : texting ? textMouseDown : measuring ? measureMouseDown : sectioning ? sectionMouseDown : filling ? fillMouseDown : xaisling ? xaisleMouseDown : grouping ? groupMouseDown : splitting ? splitMouseDown : dooring ? doorMouseDown : onStageMouseDown
  // Space+drag or a middle drag pans in any tool (STUDIO.md §7a)
  const presses = useRef([])      // (d1-final) where the last presses landed (screen) — a double-click is two in one spot
  const stageMouseDown = (e) => { const pp = e?.target?.getStage?.()?.getPointerPosition(); if (pp) presses.current = [...presses.current.slice(-1), pp]; return isForcePan(e && e.evt) ? onStageMouseDown(e) : modeMouseDown(e) }
  // the Row group's cursor: resize over a group row's handle, move over its body, crosshair over the floor (STUDIO.md §7a)
  const [groupCursor, setGroupCursor] = useState('crosshair')
  const groupMouseMove = (e) => { const c = groupCursorAt(e); if (c !== groupCursor) setGroupCursor(c) }
  const stageMouseMove = drawing ? drawMouseMove : texting ? undefined : measuring ? measureMouseMove : sectioning ? sectionMouseMove : splitting ? splitMouseMove : dooring ? doorMouseMove : grouping ? groupMouseMove : filling ? fillHoverMove : xaisling ? xaisleHoverMove : onStageMouseMove
  const stageMouseLeave = drawing ? () => { if (!useDrawTool.getState().press) useDrawTool.setState({ at: null, guides: [] }) } : texting ? undefined : measuring ? () => setMeasureHover(null) : splitting ? () => useSplit.setState({ hover: null }) : dooring ? () => { if (!useDoorTool.getState().rowDrag) clearDoorHover() } : filling || grouping || xaisling ? undefined : onStageMouseLeave
  const effectiveCursor = grouping ? groupCursor : texting ? 'text' : drawing || measuring || filling || splitting || dooring || sectioning || xaisling ? 'crosshair' : cursor

  return (
    <div
      id="canvas2-container"
      ref={setHost}
      className="flex-1 relative overflow-hidden min-h-0"
      style={{ background: '#F4F3EF', cursor: effectiveCursor }}
      onContextMenu={(e) => openFloorMenu(e, e.currentTarget)}
    >
      {showGrid && <DotGround />}
      <StackHint />
      {size.w > 0 && size.h > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          /* Only the press starts here. Moves and the release are taken on
             window for the life of the gesture, so a drag survives the pointer
             leaving the canvas instead of dying at the edge. While the measure
             tool is active these three are swapped for its own minimal
             click/hover handlers instead (see stageMouseDown/Move/Leave
             above) — a modal tool, same as every other single-purpose canvas
             mode in this app. */
          onMouseDown={stageMouseDown}
          onMouseMove={stageMouseMove}
          onMouseLeave={stageMouseLeave}
          onWheel={onWheel}
          onDblClick={drawing ? drawDblClick : texting ? undefined : sectPen ? () => penDblClick(useCanvasStore) : shapeDblClick}
        >
          {/* background — the grid alone; it never intercepts anything */}
          <Layer listening={false}>
            {/* the grid is the ground's dot grid (DotGround) — nothing is drawn here */}
          </Layer>
          {/* objects — the real scene. Not listening: picking is geometry
              (hitTest.js, CANVAS2.md rule 4), never Konva's hit graph, and a
              listening layer redraws that unused hit canvas on every frame —
              pan, zoom and drag included. */}
          <Layer listening={false}>
            <Scene listening part="body" />
            {/* the Tally's lit rack lines, tinted over the racks (multiply) */}
            <TallyFill />
          </Layer>
          {/* the labels and marks — aisle and cross-aisle labels, column clearances, X marks, upright flags,
              oversized bays — between the scene and its columns: a column is always drawn above them */}
          <Layer listening={false}>
            <Overlays part="marks" selectedObjects={selectedObjects} gridSize={gridSize} marquee={marquee}
              objects={objects} showAisles={showAisles} activeWall={activeWall}
              smartGuides={smartGuides} showMarks={columnCheckShowMarks}
              aisleBlocks={columnCheckResult.aisleBlocks} columns={columnCheckColumns}
              rackConflicts={columnCheckResult.rackConflicts}
              pickBlocks={columnCheckResult.pickBlocks}
              uprightHits={columnCheckResult.uprightHits} />
          </Layer>
          {/* the columns, above every label and mark (Scene.jsx `part`) */}
          <Layer listening={false}>
            <Scene listening part="columns" />
          </Layer>
          {/* overlay — selection outline(s), marquee, resize/rotate handles.
              Never listens: all of it is pure paint (CANVAS2.md rule 4) —
              which handle a press hits is decided once, geometrically, in
              onStageMouseDown (handleGeometry.js's handleHitTest), the SAME
              path selection and object drag already use. Nothing here is a
              second, independent input surface. */}
          <Layer listening={false}>
            <Overlays part="chrome" selectedObjects={selectedObjects} gridSize={gridSize} marquee={marquee}
              objects={objects} showAisles={showAisles} activeWall={activeWall}
              smartGuides={smartGuides} showMarks={columnCheckShowMarks}
              aisleBlocks={columnCheckResult.aisleBlocks} columns={columnCheckColumns}
              rackConflicts={columnCheckResult.rackConflicts}
              pickBlocks={columnCheckResult.pickBlocks}
              uprightHits={columnCheckResult.uprightHits} />
            {/* the Row group: every group row has its handles (no edit row — STUDIO.md §7a Modes) */}
            {grouping && groupRacks.map(o => <ResizeHandlesOverlay key={o.id} obj={o} zoom={zoom} gridSize={gridSize} />)}
            {handleTarget && !(grouping && groupRacks.some(o => o.id === handleTarget.id)) && (
              <ResizeHandlesOverlay obj={handleTarget} zoom={zoom} gridSize={gridSize} />
            )}
            {fpRotateTarget && (
              <FpRotateHandleOverlay obj={fpRotateTarget} gridSize={gridSize} zoom={zoom} />
            )}
            {/* what a click would select (STUDIO.md §7a — hoverTarget.js) */}
            <HoverHighlight />
            {unlockedSel && selectedObjects.length >= 2 && !(activeBaySelection && activeBaySelection.length > 0) && (
              <GroupRotateOverlay objects={selectedObjects} zoom={zoom} allObjects={objects} />
            )}
            {measuring && (
              <MeasureOverlay points={measurePts} hover={measureHover} zoom={zoom} gridSize={gridSize} />
            )}
          </Layer>
          {/* (gen-lock) the overlay's text — row numbers, the sections' legend, a grid's annotation, the doors' tags — on a
              layer of their own, in the same drawing order: a drag lifts a selection's outline and handles out of the layer
              above (dragLift.js), and redrawing that once no longer redraws every row number with it */}
          <Layer listening={false}>
            {/* the rack line numbers R1, R2 … at each row end (RackLineLabels.jsx — the BOM's rows) */}
            <RackLineLabels />
            {/* the sections' legend: a key outside the building, its bottom-left (SectionLegend.jsx — legend round: no name
                tags on the floor) */}
            <SectionLegend />
            {/* a selected column grid's gridlines, bubbles and dimension chains (ColumnGridAnnot.jsx — col-grid round) */}
            <ColumnGridAnnot />
            {/* the doors' tags and a selected door's gap chain (doors-edit round) */}
            <DoorAnnot />
          </Layer>
          {/* the rest of the overlay, above them as before */}
          <Layer listening={false}>
            {/* the Row group: its rows outlined, a pending apply previewed (RowGroupPreview.jsx); a row being placed */}
            <RowGroupPreview />
            {/* the Split tool's cut line (SplitPreview.jsx) */}
            {splitting && <SplitPreview />}
            {/* the Cross aisle tool's band (CrossAisleBand.jsx) */}
            {xaisling && <CrossAisleBandPreview />}
            {/* Add door's preview on the hovered wall (DoorBar.jsx) */}
            {/* the shape being drawn (DrawBar.jsx) */}
            {drawing && <DrawPreview />}
            {texting && <TextBoxDraft />}
            {dooring && !rowOn && <DoorPreview />}
            {dooring && !rowOn && <DoorGapLive />}
            {dooring && rowOn && <RowPreview />}
            {dooring && rowOn && !rowCount && !rowDragOn && <DoorPreview />}
            {/* Check layout: the clicked problem, until the next click (utils/layoutCheck.js) */}
            <IssueHighlight />
            {/* a picked cross-aisle, and where a drag takes it (utils/crossAisleTool.js) */}
            <CrossAislePick />
            {/* tunnels: hatched, labelled, the picked one outlined (utils/tunnel.js) */}
            <TunnelMarks />
            <TallyHighlight />
            <PlacementGhost gridSize={gridSize} />
            {/* a zone's edge dragged: the bays its release removes, red, and its size (ZoneEdit.jsx) */}
            <ZoneEditPreview gridSize={gridSize} />
            {/* a zone dragged or resized: red with the reason when it blocks an aisle, cuts off faces or closes a zone in (ZoneCheck.jsx) */}
            <ZoneCheckPreview />
            {/* a selected zone's size (ZoneEdit.jsx) */}
            <SelectedZoneSizes gridSize={gridSize} />
            <FillOverlay />
            {/* the Section tool's box or pen, and a selected custom-shape section's points (SectionShape.jsx) */}
            <SectionDraft />
            {unlockedSel && selectedObjects.length === 1 && <SectionPointHandles obj={selectedObjects[0]} />}
            {unlockedSel && selectedObjects.length === 1 && <ShapePointHandles obj={selectedObjects[0]} />}
          </Layer>
          {/* (gen-lock) a drag's snap guides, on their own layer: a guide coming or going redraws only them */}
          <Layer listening={false}>
            <SmartGuideLines />
          </Layer>
        </Stage>
      )}
      <ViewAdopter view={view} apply={apply} />
      {/* the Studio bars (STUDIO.md §1, §6): the selection bar over the selection, the mode bars at the top (Row
          group, Split, Fill racking), the notices above the tool pill, the floor's right-click menu */}
      <SelectionBar />
      {/* the Columns tool's Place column grid dialog (col-grid round) */}
      <PlaceColumnGrid />
      {/* a column's line being dragged: the distances to its neighbouring lines (columnLines.js) */}
      <ColumnLineLabels />
      <RowGroupBar />
      <SplitBar />
      <CrossAisleBar />
      {filling && <FillOptionsBar />}
      {dooring && <DoorBar />}
      {/* (d1-polish) no Draw bar, no Text bar: nothing shows while a draw tool is on */}
      <TextEditor />
      {sectioning && <SectionBar />}
      <SectionRename />
      {/* a building's wall dimension typed (FpDimEdit.jsx) */}
      <FpDimEdit />
      {/* a column grid's chain value typed (ColumnChainEdit.jsx) */}
      <ColumnChainEdit />
      {/* a gap of a door's wall typed (DoorGapEdit.jsx) */}
      <DoorGapEdit />
      {/* a gridline drag's bay, typed (DragBay.jsx); the chain's hover hint */}
      <DragBayBox />
      <ChainHint />
      <FloorMenu />
      {showRulers && <StoreRulers gridSize={gridSize} size={size} />}
    </div>
  )
}
