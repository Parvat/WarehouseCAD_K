import { useRef, useState, useCallback, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useCanvasStore } from '../../store/useCanvasStore'
import { TOOLS } from '../../constants'
import { snapToGrid, objectContains, getObjectBounds, applyResize,
         getFpWallSegments, getFpVertices, applyFpWallDrag, applyFpWallLength, pxToFtIn,
         ANNOT_LINE_TYPES } from '../../utils/canvas'
import { Rulers } from './Rulers'
import { StatusBar } from './StatusBar'
import { CanvasObjects, DrawingPreview } from './CanvasObjects'
import { CanvasOverlays } from './CanvasOverlays'
import { ANNOT, ANNOT_SET } from '../LeftPanel/AnnotationPanel'
import { loadArrowPrefs } from '../../utils/arrowGeometry'
import { createStrokeAccumulator, loadPenPrefs, clampPenWidth, PEN_TYPES } from '../../utils/freehand'

/* Text has no stroke to fall back on the way a shape does, so it needs its
   own always-visible default rather than sharing the shape tool's
   deliberately-transparent one. */
const TEXT_INK_DEFAULT = '#0B101D'

/* Minimum travel between recorded samples, in SCREEN px. Below this a
   pointermove is hand tremor rather than intent. */
const MIN_SAMPLE_PX = 3.5

// Annotation tools that use two-point drag (line-like)
const ANNOT_LINE_TOOLS = new Set([
  ANNOT.DIMENSION, ANNOT.ARROW_LINE, ANNOT.DOUBLE_ARROW,
  ANNOT.CURVE_ARROW, ANNOT.DRAW_LINE,
  ANNOT.SOLID_LINE, ANNOT.DOTTED_LINE, ANNOT.DASHED_LINE, ANNOT.DASHDOT_LINE,
])
// Annotation tools that use bbox drag (rect-like)
const ANNOT_RECT_TOOLS = new Set([
  ANNOT.LABEL, ANNOT.LABEL_BOX, ANNOT.LABEL_CIRCLE, ANNOT.AUTO_NUMBER,
  ANNOT.CALLOUT, ANNOT.CLOUD, ANNOT.NORTH_ARROW, ANNOT.SCALE_BAR,
])

const DRAW_TOOLS = new Set([
  TOOLS.LINE, TOOLS.ARC, TOOLS.CIRCLE, TOOLS.SQUARE,
  TOOLS.TRIANGLE, TOOLS.DIAMOND, TOOLS.STAR, TOOLS.CROSS, TOOLS.ARROW,
  TOOLS.L_SHAPE, TOOLS.T_SHAPE, TOOLS.U_SHAPE,
])

const CURSOR = {
  [TOOLS.SELECT]:'default', [TOOLS.MULTI_SELECT]:'crosshair',
  [TOOLS.LINE]:'crosshair', [TOOLS.ARC]:'crosshair', [TOOLS.CIRCLE]:'crosshair',
  [TOOLS.SQUARE]:'crosshair', [TOOLS.TEXT]:'text', [TOOLS.PAN]:'grab',
}

/* Grid level-of-detail — never paint gridlines closer together than this on screen */
const MIN_GRID_PX  = 8
const GRID_LADDER  = [1, 2, 4, 10, 20, 50, 100, 200, 500]

/* Tile sizes for the four .canvas-grid gradient layers: major, major(90deg),
   minor, minor(90deg). Minor (1 ft) drops out once it goes sub-visible; major
   (5 ft) steps up the ladder so some grid always remains. */
function gridLayerSizes(gridSize, zoom) {
  const minorPx  = gridSize * zoom
  const majorBase = gridSize * 5 * zoom
  const mul = GRID_LADDER.find(m => majorBase * m >= MIN_GRID_PX) ?? GRID_LADDER[GRID_LADDER.length - 1]
  const majorPx = majorBase * mul
  const minor = minorPx >= MIN_GRID_PX ? `${minorPx}px ${minorPx}px` : '0 0'
  return [`${majorPx}px ${majorPx}px`, `${majorPx}px ${majorPx}px`, minor, minor].join(', ')
}

export function CanvasArea() {
  const {
    activeTool, zoom, panX, panY, setPan, setViewport,
    showGrid, showRulers, snapToGrid: snapEnabled, snapUnit, gridSize,
    setCursor, addObject, moveObjects, commitObjectUpdate,
    selectObject, selectGroup, selectMultiple, clearSelection,
    toggleBayInSelection, setBaySelection, clearBaySelection, clearAllBaySelections,
    objects, selectedIds, layers, groups,
    fillColor, strokeColor, noFill, opacity, activeLayerId, textSettings,
    activeWall, setActiveWall, updateObject, rotateGroup,
    printMode,
  } = useCanvasStore()

  const svgRef       = useRef(null)
  const containerRef = useRef(null)
  const spaceDownRef = useRef(false)    // space key held → temp pan mode
  const dragRef      = useRef(null)
  const lastMouseClient = useRef({ x: 0, y: 0 })  // tracks latest mouse screen coords

  const [preview,     setPreview]     = useState(null)
  const [moveDelta,   setMoveDelta]   = useState(null)
  const [snapDelta,   setSnapDelta]   = useState(null)   // moveDelta adjusted by smart-guide snap
  const [smartGuides, setSmartGuides] = useState([])
  const [selBox,      setSelBox]      = useState(null)
  const [resizing,    setResizing]    = useState(null)
  const [annotInput,  setAnnotInput]  = useState(null)
  /* Text lifecycle: null = idle/selected, an object = editing. Selection stays
     the store's business; only the EDITING phase lives here. */
  const [textEdit, setTextEdit] = useState(null)
  const [rotatingAngle, setRotatingAngle] = useState(null) // { angle, sx, sy } while rotating
  const resizingRef   = useRef(null)
  const previewRafRef = useRef(null)
  const panRafRef     = useRef(null)
  const cursorRafRef  = useRef(null)

  // ── World coords from screen ──────────────────────────────────────────────
  const toWorld = useCallback((cx, cy) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const r = svgRef.current.getBoundingClientRect()
    return { x: (cx - r.left - panX) / zoom, y: (cy - r.top - panY) / zoom }
  }, [panX, panY, zoom])

  // ── Bay hit-test — uses correct world pos already computed by toWorld ─────
  const RACK_BAY_TYPES = new Set(['rack_row','rack_double_row','rack_cantilever','rack_pushback','rack_pallet_flow','rack_drive_through'])
  const hitTestBay = (obj, worldX, worldY) => {
    if (!RACK_BAY_TYPES.has(obj.type)) return null
    // Cantilever uses towers[] not beams[]
    if (obj.type === 'rack_cantilever') {
      if (!obj.towers) return null
      const rot = ((obj.rotation || 0) % 360 + 360) % 360
      const cx  = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
      const rad = -(rot * Math.PI) / 180
      const dx  = worldX - cx, dy = worldY - cy
      const localX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
      const tCount = obj.towers.length
      const spacePx = tCount > 1 ? obj.width / (tCount - 1) : obj.width
      const armThickPx = ((obj.armThicknessIn || 3) / 12) * gridSize
      for (let i = 0; i < tCount; i++) {
        const cx2 = obj.x + i * spacePx
        if (localX >= cx2 - armThickPx/2 && localX <= cx2 + armThickPx/2) return i
      }
      return null
    }
    if (!obj.beams) return null

    const rot      = ((obj.rotation || 0) % 360 + 360) % 360
    const cx       = obj.x + obj.width  / 2
    const cy       = obj.y + obj.height / 2
    const upW      = ((obj.uprightWidth || 3) / 12) * gridSize
    const nBays    = obj.beams.length

    // Transform world click into object-local space by un-rotating around object center
    const rad  = -(rot * Math.PI) / 180
    const dx   = worldX - cx
    const dy   = worldY - cy
    const localX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
    const localY = cy + dx * Math.sin(rad) + dy * Math.cos(rad)

    // Now test against unrotated object (bays always run left→right in local space)
    let cursor = obj.x + upW
    for (let i = 0; i < nBays; i++) {
      const beamPx = (obj.beams[i] / 12) * gridSize
      if (localX >= cursor && localX <= cursor + beamPx) return i
      cursor += beamPx + upW
    }
    return null  // clicked an upright
  }

  const doSnap = useCallback((v) =>
    snapEnabled ? snapToGrid(v, gridSize, snapUnit) : v
  , [snapEnabled, gridSize, snapUnit])

  // ── Hit test ──────────────────────────────────────────────────────────────
  const hitTest = useCallback((wx, wy) => {
    const layerMap = new Map(layers.map(l => [l.id, l]))
    const FP_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
    // Priority order matches visual z-order:
    // 1. annotations/text (top)
    // 2. regular shapes (middle)
    // 3. fp shapes (bottom — large background objects, checked last)
    const COL_GRID = new Set(['column_grid'])
    const priority = o => o.type?.startsWith('annot_') || o.type === 'text' ? 2 : FP_SET.has(o.type) ? 0 : COL_GRID.has(o.type) ? 0.5 : 1
    const sorted  = [...objects].sort((a, b) => priority(b) - priority(a))
    const liveZoom = useCanvasStore.getState().zoom
    const curSel   = useCanvasStore.getState().selectedIds
    // First pass: find any non-FP, non-grid hit
    for (let i = 0; i < sorted.length; i++) {
      const obj = sorted[i]
      const l   = layerMap.get(obj.layerId)
      if (!l || !l.visible || l.locked) continue
      if (obj.locked) continue
      if (COL_GRID.has(obj.type)) continue  // skip grid in first pass
      if (FP_SET.has(obj.type)) continue    // skip FP in first pass
      if (objectContains(obj, wx, wy, liveZoom)) return obj.id
    }
    // Second pass: column_grid — only hit if cursor is ON an actual column square
    for (let i = 0; i < sorted.length; i++) {
      const obj = sorted[i]
      const l   = layerMap.get(obj.layerId)
      if (!l || !l.visible || l.locked) continue
      if (obj.locked) continue
      if (!COL_GRID.has(obj.type)) continue
      // Build column positions and test each square
      const spacingX = obj.spacingX || [obj.width  || 40*40]
      const spacingY = obj.spacingY || [obj.height || 40*40]
      const colW = obj.columnW || (12/12)*40
      const colH = obj.columnH || (12/12)*40
      const colXs = [obj.x]; spacingX.forEach(s => colXs.push(colXs[colXs.length-1]+s))
      const colYs = [obj.y]; spacingY.forEach(s => colYs.push(colYs[colYs.length-1]+s))
      const pad = 4 / liveZoom  // small hit padding around each column
      const hit = colYs.some(cy => colXs.some(cx =>
        wx >= cx - pad && wx <= cx + colW + pad &&
        wy >= cy - pad && wy <= cy + colH + pad
      ))
      if (hit) return obj.id
    }
    // Third pass: FP objects
    for (let i = 0; i < sorted.length; i++) {
      const obj = sorted[i]
      const l   = layerMap.get(obj.layerId)
      if (!l || !l.visible || l.locked) continue
      if (obj.locked) continue
      if (!FP_SET.has(obj.type)) continue
      if (objectContains(obj, wx, wy, liveZoom)) return obj.id
    }
    return null
  }, [objects, layers])

  // ── Dimension endpoint snap ──────────────────────────────────────────────
  // Snaps a point to nearest object edge, wall face, or column face
  // Returns { x, y, snapped: bool }
  const snapToDimPoint = useCallback((wx, wy) => {
    const THRESH = 20 / zoom  // 20px screen snap radius
    let best = null, bestDist = THRESH

    const check = (tx, ty) => {
      const d = Math.hypot(wx - tx, wy - ty)
      if (d < bestDist) { bestDist = d; best = { x: tx, y: ty } }
    }

    objects.forEach(obj => {
      if (obj.type?.startsWith('fp_')) {
        // Snap to FP inner wall faces
        const b = getObjectBounds(obj)
        const wt = (obj.wallThicknessFt || 0.25) * gridSize
        const inner = { x: b.x+wt, y: b.y+wt, r: b.x+b.width-wt, b: b.y+b.height-wt }
        ;[inner.x, inner.r].forEach(ex => [inner.y, inner.b].forEach(ey => check(ex, ey)))
        ;[inner.x, inner.r].forEach(ex => check(ex, wy))
        ;[inner.y, inner.b].forEach(ey => check(wx, ey))
      } else if (obj.type === 'column_grid') {
        // Snap to column faces
        const spX = obj.spacingX || [obj.width || 40*gridSize]
        const spY = obj.spacingY || [obj.height || 40*gridSize]
        const colW = obj.columnW || (12/12)*gridSize
        const colH = obj.columnH || (12/12)*gridSize
        const colXs = [obj.x]; spX.forEach(s => colXs.push(colXs[colXs.length-1]+s))
        const colYs = [obj.y]; spY.forEach(s => colYs.push(colYs[colYs.length-1]+s))
        colXs.forEach(cx => { check(cx, wy); check(cx+colW, wy) })
        colYs.forEach(cy => { check(wx, cy); check(wx, cy+colH) })
        colXs.forEach(cx => colYs.forEach(cy => {
          check(cx, cy); check(cx+colW, cy)
          check(cx, cy+colH); check(cx+colW, cy+colH)
        }))
      } else if (!obj.type?.startsWith('annot_') && obj.type !== 'aisle') {
        // Snap to object bbox edges
        const b = getObjectBounds(obj)
        ;[b.x, b.x+b.width].forEach(ex => check(ex, wy))
        ;[b.y, b.y+b.height].forEach(ey => check(wx, ey))
        // Corners
        ;[b.x, b.x+b.width].forEach(ex => [b.y, b.y+b.height].forEach(ey => check(ex, ey)))
      }
    })

    return best ? { x: best.x, y: best.y, snapped: true } : { x: wx, y: wy, snapped: false }
  }, [objects, zoom, gridSize])

  // ── Resize handle down (from CanvasObjects) ────────────────────────────
  const onHandleMouseDown = useCallback((e, objId, handle) => {
    e.preventDefault(); e.stopPropagation()
    const pos = toWorld(e.clientX, e.clientY)
    const obj = objects.find(o => o.id === objId)
    if (!obj) return
    const r = { objId, handle, origObj: { ...obj }, startX: pos.x, startY: pos.y }
    resizingRef.current = r
    setResizing(r)
  }, [objects, toWorld])
  // ── Group rotate handle mousedown ─────────────────────────────────────────
  const onGroupRotateStart = useCallback((e, groupId, groupCx, groupCy) => {
    e.preventDefault()
    // Snapshot base positions of all group members at drag-start to eliminate drift
    const grp = useCanvasStore.getState().groups.find(g => g.id === groupId)
    const basePositions = {}
    if (grp) {
      useCanvasStore.getState().objects
        .filter(o => grp.ids.includes(o.id))
        .forEach(o => { basePositions[o.id] = JSON.parse(JSON.stringify(o)) })
    }
    dragRef.current = { type:'groupRotate', groupId, cx: groupCx, cy: groupCy, lastAngle: null, basePositions }
  }, [])
  const onMouseDown = useCallback((e) => {
    if (resizingRef.current) return
    // Middle mouse button (button=1) → pan regardless of active tool
    if (e.button === 1) {
      e.preventDefault()
      const s = useCanvasStore.getState()
      dragRef.current = { type:'pan', sx:e.clientX, sy:e.clientY, spx:s.panX, spy:s.panY }
      return
    }
    if (e.button !== 0) return
    e.preventDefault()
    const pos = toWorld(e.clientX, e.clientY)
    const sx  = doSnap(pos.x), sy = doSnap(pos.y)
    // Always read activeTool live from store — prevents stale closure when tool
    // selection and mousedown happen in the same React render batch
    const activeTool = useCanvasStore.getState().activeTool

    if (activeTool === TOOLS.PAN || spaceDownRef.current) {
      // Shift held → always start rubber-band selbox (never move), works anywhere including inside fp
      if (e.shiftKey && !spaceDownRef.current) {
        dragRef.current = { type:'selbox', startX:pos.x, startY:pos.y }
        setSelBox({ x0:pos.x, y0:pos.y, x1:pos.x, y1:pos.y })
        return
      }
      const hitId = hitTest(pos.x, pos.y)
      // Hit a non-fp object → select it and start move
      const FP_TYPES_SET_PAN = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
      const hitObj = hitId ? objects.find(o => o.id === hitId) : null
      if (hitId && !spaceDownRef.current && hitObj && !FP_TYPES_SET_PAN.has(hitObj.type)) {
        // Clear bay/tower on previously selected racks when switching object
        if (!selectedIds.includes(hitId)) {
          selectedIds.forEach(id => {
            const prev = objects.find(o => o.id === id)
            if (!prev) return
            if (prev.activeBayIdx != null) useCanvasStore.getState().updateObject(id, { activeBayIdx: null })
            if (prev.activeTowerIdx != null) useCanvasStore.getState().updateObject(id, { activeTowerIdx: null })
          })
        }
        const grp = (groups || []).find(g => g.ids.includes(hitId))
        if (grp) selectGroup(grp.ids)
        else {
          const bayIdx = hitTestBay(hitObj, pos.x, pos.y)
          if (bayIdx !== null && e.altKey) {
            // Alt+click bay → add/remove from multi-bay selection
            toggleBayInSelection(hitId, bayIdx)
            if (!selectedIds.includes(hitId)) selectObject(hitId, true)
            dragRef.current = { type:'move', startX:pos.x, startY:pos.y, moved:false }
            return
          }
          if (!selectedIds.includes(hitId)) selectObject(hitId, false)
          if (bayIdx !== null) {
            const isCant = hitObj.type === 'rack_cantilever'
            const curIdx = isCant ? hitObj.activeTowerIdx : hitObj.activeBayIdx
            const newIdx = curIdx === bayIdx ? null : bayIdx
            useCanvasStore.getState().updateObject(hitId, isCant ? { activeTowerIdx: newIdx } : { activeBayIdx: newIdx })
          } else {
            if (hitObj?.activeBayIdx != null)
              useCanvasStore.getState().updateObject(hitId, { activeBayIdx: null })
          }
        }
        dragRef.current = { type:'move', startX:pos.x, startY:pos.y, moved:false }
        return
      }
      // Hit an fp object → select it and start move
      if (hitId && !spaceDownRef.current && hitObj && FP_TYPES_SET_PAN.has(hitObj.type)) {
        if (!selectedIds.includes(hitId)) selectObject(hitId, false)
        dragRef.current = { type:'move', startX:pos.x, startY:pos.y, moved:false }
        return
      }
      // Empty canvas → pan
      const s2 = useCanvasStore.getState()
      dragRef.current = { type:'pan', sx:e.clientX, sy:e.clientY, spx:s2.panX, spy:s2.panY }
      return
    }

    if (activeTool === TOOLS.SELECT || activeTool === TOOLS.MULTI_SELECT) {
      // Shift held → always rubber-band, never move (even if clicking on an object)
      if (e.shiftKey) {
        dragRef.current = { type:'selbox', startX:pos.x, startY:pos.y }
        setSelBox({ x0:pos.x, y0:pos.y, x1:pos.x, y1:pos.y })
        return
      }
      const hitId = hitTest(pos.x, pos.y)
      if (hitId) {
        // Clear activeBayIdx / activeTowerIdx on previously selected racks when switching object
        if (!selectedIds.includes(hitId)) {
          selectedIds.forEach(id => {
            const prev = objects.find(o => o.id === id)
            if (!prev) return
            if (prev.activeBayIdx != null) useCanvasStore.getState().updateObject(id, { activeBayIdx: null })
            if (prev.activeTowerIdx != null) useCanvasStore.getState().updateObject(id, { activeTowerIdx: null })
          })
        }
        const grp = (groups || []).find(g => g.ids.includes(hitId))
        if (grp) selectGroup(grp.ids)
        else {
          const hitObj = objects.find(o => o.id === hitId)
          const bayIdx = hitObj ? hitTestBay(hitObj, pos.x, pos.y) : null

          if (bayIdx !== null && e.altKey) {
            // Alt+click bay → multi-bay selection
            toggleBayInSelection(hitId, bayIdx)
            if (!selectedIds.includes(hitId)) selectObject(hitId, true)
          } else if (bayIdx !== null) {
            // Single bay click
            if (!selectedIds.includes(hitId)) selectObject(hitId, false)
            const isCant = hitObj.type === 'rack_cantilever'
            const curIdx = isCant ? hitObj.activeTowerIdx : hitObj.activeBayIdx
            const newIdx = curIdx === bayIdx ? null : bayIdx
            useCanvasStore.getState().updateObject(hitId, isCant ? { activeTowerIdx: newIdx } : { activeBayIdx: newIdx })
          } else {
            // Clicked upright — row selection, clear bay
            if (!selectedIds.includes(hitId)) selectObject(hitId, false)
            if (hitObj?.activeBayIdx != null)
              useCanvasStore.getState().updateObject(hitId, { activeBayIdx: null })
          }
        }
        dragRef.current = { type:'move', startX:pos.x, startY:pos.y, moved:false }
      } else {
        // Clear bay/tower selection on all racks when clicking empty canvas
        clearAllBaySelections()
        clearSelection()
        dragRef.current = { type:'selbox', startX:pos.x, startY:pos.y }
        setSelBox({ x0:pos.x, y0:pos.y, x1:pos.x, y1:pos.y })
      }
      return
    }

    // Draw tools — clicking an existing NON-FP object moves it.
    // FP objects are intentionally skipped so shapes can be drawn on top of a floor plan.
    if (DRAW_TOOLS.has(activeTool) || activeTool === TOOLS.TEXT) {
      const FP_TYPES_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
      const hitId = hitTest(pos.x, pos.y)
      const hitObj = hitId ? objects.find(o => o.id === hitId) : null
      if (hitObj && !FP_TYPES_SET.has(hitObj.type)) {
        if (!selectedIds.includes(hitId)) selectObject(hitId, false)
        dragRef.current = { type:'move', startX:pos.x, startY:pos.y, moved:false }
        return
      }
    }

    if (activeTool === TOOLS.TEXT) {
      /* Straight into edit mode at the click point — no modal, no confirm
         button. The object is only created if something is typed. */
      setTextEdit({
        wx: sx, wy: sy, objId: null, initial: '', selectAll: false,
        style: {
          fontFamily: textSettings.fontFamily || 'Montserrat',
          fontSize:   textSettings.fontSize   || 14,
          bold: textSettings.bold, italic: textSettings.italic,
          underline: textSettings.underline, align: textSettings.align,
          /* fillColor is the SHAPE tool's default and is deliberately
             'transparent' — a rectangle with no fill is still visible by its
             stroke, but transparent text has nothing else to show. Guard the
             one value that would make a label impossible to see; any real
             colour the user has picked still carries through untouched. */
          fill: (fillColor && fillColor !== 'transparent' && fillColor !== 'none')
            ? fillColor : TEXT_INK_DEFAULT,
          ...(() => { try { return JSON.parse(localStorage.getItem('trace.text.v1') || '{}') }
                      catch { return {} } })(),
        },
      })
      return
    }

    // ── Annotation tools — same pipeline as draw tools ────────────────────────
    if (ANNOT_SET.has(activeTool)) {
      if (activeTool === ANNOT.MEASURE_WALLS) {
        const { objects: objs, selectedIds: sels, gridSize: gs } = useCanvasStore.getState()
        const fps = objs.filter(o => sels.includes(o.id) && o.type?.startsWith('fp_'))
        fps.forEach(fp => {
          getFpWallSegments(fp, gs).forEach(seg => {
            addObject({
              type: 'annot_dimension',
              x1: seg.a.x, y1: seg.a.y, x2: seg.b.x, y2: seg.b.y,
              stroke: '#4a9eff', strokeWidth: 1.5, opacity: 1, layerId: activeLayerId,
            })
          })
        })
        return
      }
      // All other annotation tools — use standard draw drag
      // For dimension tool: snap p1 to nearby object edge
      let p1x = sx, p1y = sy
      if (activeTool === ANNOT.DIMENSION) {
        const snp = snapToDimPoint(sx, sy)
        p1x = snp.x; p1y = snp.y
      }
      dragRef.current = { type:'draw', tool:activeTool, p1:{x:p1x,y:p1y} }
      setPreview({ tool:activeTool, p1:{x:p1x,y:p1y}, p2:{x:p1x,y:p1y}, fillColor, strokeColor })
      return
    }

    /* Freehand captures the RAW world point, not the snapped one. Snap governs
       where things are placed; snapping every sample of a traced path would
       quantise the stroke into a staircase. Works identically with snap off. */
    if (activeTool === TOOLS.FREEHAND) {
      /* The draft carries the FULL pen style from the first sample, so the
         live stroke matches the committed one instead of flashing a default
         preview colour and then swapping on mouseup. */
      const pp   = loadPenPrefs()
      const cfg  = PEN_TYPES[pp.pen] || PEN_TYPES.pencil
      const style = {
        pen: pp.pen,
        stroke: pp.color || strokeColor,
        strokeWidth: clampPenWidth(pp.pen, pp.width),
        opacity: cfg.alpha,
        cap: pp.cap, join: pp.join,
        simplify: pp.simplify,
      }
      const acc = createStrokeAccumulator()
      acc.add({ x:pos.x, y:pos.y })
      dragRef.current = { type:'freehand', acc, style }
      setPreview({ tool:TOOLS.FREEHAND, points: acc.points(), style })
      return
    }

    if (DRAW_TOOLS.has(activeTool)) {
      dragRef.current = { type:'draw', tool:activeTool, p1:{x:sx,y:sy} }
      setPreview({ tool:activeTool, p1:{x:sx,y:sy}, p2:{x:sx,y:sy}, fillColor, strokeColor })
    }
  }, [toWorld, doSnap, hitTest, selectedIds, groups,
      selectObject, selectGroup, selectMultiple, clearSelection,
      addObject, fillColor, strokeColor, activeLayerId, textSettings, snapToDimPoint])

  // ── Mouse move ────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e) => {
    lastMouseClient.current = { x: e.clientX, y: e.clientY }
    const pos = toWorld(e.clientX, e.clientY)
    const sx  = doSnap(pos.x), sy = doSnap(pos.y)
    // Coalesce to one store write per frame — cursorX/Y only feed the StatusBar
    // readout and the crosshair, neither of which can update faster than a render.
    const cursorFtX = Math.round(pos.x / gridSize * 12) / 12
    const cursorFtY = Math.round(pos.y / gridSize * 12) / 12
    if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current)
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null
      setCursor(cursorFtX, cursorFtY)
    })

    // Read from ref — always current even inside stable window listener
    const activeResizing = resizingRef.current
    if (activeResizing) {
      const { objId, handle, origObj, startX, startY } = activeResizing
      const dx = sx - startX, dy = sy - startY

      /* Text: side handles set the wrap width, corners scale the font.
         updateObject during the drag keeps it off the history; mouseup
         commits once, so a resize is a single undo entry. */
      if (typeof handle === 'string' && handle.startsWith('text_')) {
        const which = handle.slice(5)
        const o = origObj
        const baseW = o.width || getObjectBounds(o).width
        if (which === 'e' || which === 'w') {
          const next = which === 'e' ? baseW + dx : baseW - dx
          useCanvasStore.getState().updateObject(objId, { width: Math.max(24, next) })
        } else {
          /* Proportional scale about the OPPOSITE corner: the ratio of the
             pointer's distance from that anchor to the corner's original
             distance. Scaling by a single axis against the box width blows up
             once the box is narrow — a 24px-wide frame turned a 90px drag into
             a 4x shrink. A diagonal ratio stays stable at any size. */
          const b = getObjectBounds(o)
          const L = b.x, R = b.x + b.width, T = b.y, B2 = b.y + b.height
          const anchor = { nw:{x:R,y:B2}, ne:{x:L,y:B2}, sw:{x:R,y:T}, se:{x:L,y:T} }[which]
          const corner = { nw:{x:L,y:T},  ne:{x:R,y:T},  sw:{x:L,y:B2}, se:{x:R,y:B2} }[which]
          const d0 = Math.hypot(corner.x - anchor.x, corner.y - anchor.y) || 1
          const d1 = Math.hypot(pos.x   - anchor.x, pos.y   - anchor.y)
          const scale = Math.max(0.1, d1 / d0)
          const size = Math.max(4, Math.min(400, (o.fontSize || 14) * scale))
          useCanvasStore.getState().updateObject(objId, { fontSize: Math.round(size * 10) / 10 })
        }
        return
      }

      if (handle === 'arcCtrl') {
        const obj = origObj
        const mx  = (obj.x1 + obj.x2) / 2, my  = (obj.y1 + obj.y2) / 2
        const ddx = obj.x2 - obj.x1,       ddy = obj.y2 - obj.y1
        const len = Math.sqrt(ddx*ddx + ddy*ddy) || 1
        const nx  = -ddy / len, ny = ddx / len
        const proj = ((pos.x-mx)*nx + (pos.y-my)*ny) / len
        useCanvasStore.getState().updateObject(objId, { bend: Math.max(-0.9, Math.min(0.9, proj)) })
      } else if (handle === 'rotate') {
        const b   = getObjectBounds(origObj)
        const rcx = b.x + b.width  / 2
        const rcy = b.y + b.height / 2
        const angle = Math.atan2(pos.y - rcy, pos.x - rcx) * 180 / Math.PI + 90
        const snap  = e.shiftKey ? 45 : 5
        const snapped = ((Math.round(angle / snap) * snap) % 360 + 360) % 360
        useCanvasStore.getState().updateObject(objId, { rotation: snapped })
        setRotatingAngle({ angle: snapped, sx: e.clientX, sy: e.clientY })

      // ── Wall segment drag ──────────────────────────────────────────────────
      } else if (handle.startsWith('wall_')) {
        const wallIdx = parseInt(handle.slice(5))
        const liveObj = useCanvasStore.getState().objects.find(o => o.id === objId) || origObj

        // Snap wall inner face to nearby object edges
        const FP_SET_W = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
        const nonFpObjs = useCanvasStore.getState().objects.filter(o => o.id !== objId && !FP_SET_W.has(o.type))
        const WALL_SEG_THRESH = 20 / zoom
        const fpVerts = liveObj.fpVerts || getFpVertices(liveObj)
        const n = fpVerts.length
        const wallA = fpVerts[wallIdx % n], wallB = fpVerts[(wallIdx + 1) % n]
        const isHoriz = Math.abs(wallB.x - wallA.x) >= Math.abs(wallB.y - wallA.y)
        const hw = liveObj.wallThicknessFt ? liveObj.wallThicknessFt * gridSize : (liveObj.strokeWidth || 10)

        let snappedPos = { ...pos }
        let bestDiff = WALL_SEG_THRESH
        nonFpObjs.forEach(o => {
          const ob = getObjectBounds(o)
          if (!ob) return
          if (isHoriz) {
            const target = pos.y < ob.y + ob.height / 2 ? ob.y - hw : ob.y + ob.height + hw
            const diff = Math.abs(pos.y - target)
            if (diff < bestDiff) { bestDiff = diff; snappedPos = { ...pos, y: target } }
          } else {
            const target = pos.x < ob.x + ob.width / 2 ? ob.x - hw : ob.x + ob.width + hw
            const diff = Math.abs(pos.x - target)
            if (diff < bestDiff) { bestDiff = diff; snappedPos = { ...pos, x: target } }
          }
        })

        const updates = applyFpWallDrag(liveObj, wallIdx, snappedPos)
        if (Object.keys(updates).length > 0) {
          useCanvasStore.getState().updateObject(objId, updates)
        }

      } else {
        // Counter-rotate dx/dy into object local space for rotated rect objects
        let rdx = dx, rdy = dy
        const rot = origObj.rotation || 0
        const isRect = 'x' in origObj && !('x1' in origObj) && origObj.type !== 'circle'
        if (rot !== 0 && isRect) {
          const rad = -rot * Math.PI / 180
          rdx = dx * Math.cos(rad) - dy * Math.sin(rad)
          rdy = dx * Math.sin(rad) + dy * Math.cos(rad)
        }

        // Beam/lane racks use raw dx — their applyResize handles snapping internally
        const SNAP_FREE = new Set(['rack_row','rack_double_row','rack_pallet_flow','rack_cantilever'])
        const snapFn = SNAP_FREE.has(origObj.type) ? (v => v) : doSnap
        const updates = applyResize(origObj, handle, rdx, rdy, snapFn, e.shiftKey)

        // Anchor-point correction for rotated rect objects
        // When width/height changes on a rotated object, the rotation pivot shifts causing jumps.
        // Fix: keep the opposite handle's world position fixed.
        const newW = updates.width, newH = updates.height
        if (rot !== 0 && isRect && newW !== undefined && newH !== undefined) {
          const ow = origObj.width, oh = origObj.height
          // Always use origObj position for old center — never updates.x/y
          // updates.x is already the shifted position for left-handle drags,
          // using it here would double-apply the shift causing bounce
          const ocx = origObj.x + ow/2
          const ocy = origObj.y + oh/2

          // Anchor local offset (fraction of half-size) opposite to dragged handle
          const ax = handle.includes('l') ? 1 : handle.includes('r') ? -1 : 0
          const ay = handle.includes('t') ? 1 : handle.includes('b') ? -1 : 0

          // Anchor world position = old center + rotate(anchor_local)
          const frad = rot * Math.PI / 180
          const cos = Math.cos(frad), sin = Math.sin(frad)
          const alx = ax * ow/2, aly = ay * oh/2
          const awx = ocx + alx*cos - aly*sin
          const awy = ocy + alx*sin + aly*cos

          // New center = anchor world - rotate(new anchor local)
          const nalx = ax * newW/2, naly = ay * newH/2
          const ncx = awx - (nalx*cos - naly*sin)
          const ncy = awy - (nalx*sin + naly*cos)

          updates.x = ncx - newW/2
          updates.y = ncy - newH/2
        }

        useCanvasStore.getState().updateObject(objId, updates)
      }
      return
    }

    const drag = dragRef.current
    if (!drag) return

    if (drag.type === 'pan') {
      // Coalesce to one store write per frame — pan is derived from the mousedown
      // snapshot (drag.spx/spy), so dropping intermediate events cannot drift.
      const nx = drag.spx + (e.clientX-drag.sx), ny = drag.spy + (e.clientY-drag.sy)
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current)
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = null
        setPan(nx, ny)
      })
      return
    }
    if (drag.type === 'move') {
      const dx = pos.x-drag.startX, dy = pos.y-drag.startY
      if (Math.abs(dx)>2 || Math.abs(dy)>2) {
        drag.moved = true
        const rawDelta = { dx, dy }

        // ── Smart guides ─────────────────────────────────────────────────────
        const THRESH      = 6  / zoom
        const SNAP_DIST   = 8  / zoom
        const WALL_THRESH = 30 / zoom
        const WALL_SNAP   = 32 / zoom
        const FP_SET_SNAP  = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
        const COL_GRID_SET = new Set(['column_grid'])

        // Get bounding boxes of selected objects shifted by rawDelta
        const selObjs   = objects.filter(o => selectedIds.includes(o.id))
        const others    = objects.filter(o => !selectedIds.includes(o.id) && !FP_SET_SNAP.has(o.type) && !COL_GRID_SET.has(o.type))
        const fpWalls   = objects.filter(o => !selectedIds.includes(o.id) && FP_SET_SNAP.has(o.type))
        const colGrids  = objects.filter(o => !selectedIds.includes(o.id) && COL_GRID_SET.has(o.type))

        // Compute a merged bounding box for all selected objects (shifted)
        const selBounds = selObjs.map(o => {
          const b = getObjectBounds(o)
          return { x: b.x+dx, y: b.y+dy, r: b.x+b.width+dx, b: b.y+b.height+dy,
                   cx: b.x+b.width/2+dx, cy: b.y+b.height/2+dy }
        })

        const guides = []
        let snapX = null, snapY = null

        selBounds.forEach(sb => {
          // ── Snap to FP inner wall edges (purple guides) ───────────────────
          fpWalls.forEach(fp => {
            const b = getObjectBounds(fp)
            if (!b || !b.width || !b.height) return
            const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : (fp.strokeWidth || 10)
            const innerLeft   = b.x + wt
            const innerTop    = b.y + wt
            const innerRight  = b.x + b.width  - wt
            const innerBottom = b.y + b.height - wt
            // Only correct directional pairs — obj left→left wall, obj right→right wall
            ;[[sb.x, innerLeft], [sb.r, innerRight]].forEach(([ma, oa]) => {
              const diff = ma - oa
              if (Math.abs(diff) < WALL_THRESH) {
                if (snapX === null || Math.abs(diff) < Math.abs(snapX.diff))
                  snapX = { val: oa, diff, isWall: true }
                guides.push({ axis:'x', val: oa, from: innerTop - 40, to: innerBottom + 40, isWall: true })
              }
            })
            ;[[sb.y, innerTop], [sb.b, innerBottom]].forEach(([ma, oa]) => {
              const diff = ma - oa
              if (Math.abs(diff) < WALL_THRESH) {
                if (snapY === null || Math.abs(diff) < Math.abs(snapY.diff))
                  snapY = { val: oa, diff, isWall: true }
                guides.push({ axis:'y', val: oa, from: innerLeft - 40, to: innerRight + 40, isWall: true })
              }
            })
          })

          // ── Snap to column faces (purple guides) ──────────────────────────
          colGrids.forEach(cg => {
            const spacingX = cg.spacingX || [cg.width  || 40*gridSize]
            const spacingY = cg.spacingY || [cg.height || 40*gridSize]
            const colW = cg.columnW || (12/12)*gridSize
            const colH = cg.columnH || (12/12)*gridSize
            const colXs = [cg.x]; spacingX.forEach(s => colXs.push(colXs[colXs.length-1]+s))
            const colYs = [cg.y]; spacingY.forEach(s => colYs.push(colYs[colYs.length-1]+s))
            const gridBottom = colYs[colYs.length-1] + colH
            const gridRight  = colXs[colXs.length-1] + colW
            colXs.forEach(cx => {
              ;[[sb.x, cx],[sb.r, cx],[sb.x, cx+colW],[sb.r, cx+colW]].forEach(([ma, oa]) => {
                const diff = ma - oa
                if (Math.abs(diff) < WALL_THRESH) {
                  if (snapX === null || Math.abs(diff) < Math.abs(snapX.diff))
                    snapX = { val: oa, diff, isWall: true }
                  guides.push({ axis:'x', val: oa, from: cg.y - 20, to: gridBottom + 20, isWall: true })
                }
              })
            })
            colYs.forEach(cy => {
              ;[[sb.y, cy],[sb.b, cy],[sb.y, cy+colH],[sb.b, cy+colH]].forEach(([ma, oa]) => {
                const diff = ma - oa
                if (Math.abs(diff) < WALL_THRESH) {
                  if (snapY === null || Math.abs(diff) < Math.abs(snapY.diff))
                    snapY = { val: oa, diff, isWall: true }
                  guides.push({ axis:'y', val: oa, from: cg.x - 20, to: gridRight + 20, isWall: true })
                }
              })
            })
          })

          others.forEach(o => {
            const b = getObjectBounds(o)
            const ob = { x: b.x, y: b.y, r: b.x+b.width, b: b.y+b.height,
                         cx: b.x+b.width/2, cy: b.y+b.height/2 }

            // X-axis checks (vertical guide lines)
            const xPairs = [
              [sb.x, ob.x], [sb.x, ob.r], [sb.x, ob.cx],
              [sb.r, ob.x], [sb.r, ob.r], [sb.r, ob.cx],
              [sb.cx, ob.x],[sb.cx, ob.r],[sb.cx, ob.cx],
            ]
            xPairs.forEach(([ma, oa]) => {
              if (Math.abs(ma - oa) < THRESH) {
                if (snapX === null || Math.abs(ma-oa) < Math.abs(snapX.diff))
                  snapX = { val: oa, diff: ma - oa }
                guides.push({ axis:'x', val: oa,
                  from: Math.min(sb.y, sb.b, ob.y, ob.b) - 20,
                  to:   Math.max(sb.y, sb.b, ob.y, ob.b) + 20 })
              }
            })

            // Y-axis checks (horizontal guide lines)
            const yPairs = [
              [sb.y, ob.y], [sb.y, ob.b], [sb.y, ob.cy],
              [sb.b, ob.y], [sb.b, ob.b], [sb.b, ob.cy],
              [sb.cy,ob.y], [sb.cy,ob.b], [sb.cy,ob.cy],
            ]
            yPairs.forEach(([ma, oa]) => {
              if (Math.abs(ma - oa) < THRESH) {
                if (snapY === null || Math.abs(ma-oa) < Math.abs(snapY.diff))
                  snapY = { val: oa, diff: ma - oa }
                guides.push({ axis:'y', val: oa,
                  from: Math.min(sb.x, sb.r, ob.x, ob.r) - 20,
                  to:   Math.max(sb.x, sb.r, ob.x, ob.r) + 20 })
              }
            })
          })
        })

        // Deduplicate guides
        const uniq = []
        guides.forEach(g => {
          if (!uniq.find(u => u.axis===g.axis && Math.abs(u.val-g.val)<0.5))
            uniq.push(g)
          else {
            const ex = uniq.find(u => u.axis===g.axis && Math.abs(u.val-g.val)<0.5)
            if (ex) { ex.from=Math.min(ex.from,g.from); ex.to=Math.max(ex.to,g.to) }
          }
        })

        // Build snapped delta — larger threshold for wall snaps
        const snappedDx = snapX && Math.abs(snapX.diff) < (snapX.isWall ? WALL_SNAP : SNAP_DIST) ? dx - snapX.diff : dx
        const snappedDy = snapY && Math.abs(snapY.diff) < (snapY.isWall ? WALL_SNAP : SNAP_DIST) ? dy - snapY.diff : dy

        setMoveDelta(rawDelta)
        setSnapDelta({ dx: snappedDx, dy: snappedDy })
        setSmartGuides(uniq)
      }
      return
    }
    if (drag.type === 'selbox') {
      setSelBox(b => b ? { ...b, x1:pos.x, y1:pos.y } : b); return
    }
    if (drag.type === 'groupRotate') {
      const angle = Math.atan2(pos.y - drag.cy, pos.x - drag.cx) * 180 / Math.PI + 90
      const snap  = e.shiftKey ? 45 : 5
      const snapped = Math.round(angle / snap) * snap
      if (drag.startAngle === undefined) { drag.startAngle = snapped; drag.lastAngle = snapped; return }
      if (snapped !== drag.lastAngle) {
        const totalDelta = snapped - drag.startAngle
        useCanvasStore.getState().rotateGroup(drag.groupId, totalDelta, drag.basePositions)
        drag.lastAngle = snapped
      }
      setRotatingAngle({ angle: ((snapped % 360) + 360) % 360, sx: e.clientX, sy: e.clientY })
      return
    }
    /* Freehand: append the raw world point and repaint at most once a frame,
       the same rAF coalescing the pan fix uses. The array lives on the drag
       ref, so a long stroke costs one React update per frame, not per sample. */
    if (drag.type === 'freehand') {
      /* The gate is a constant SCREEN distance — tremor is a physical, screen
         space effect — so it converts to world units by dividing by zoom.
         A fixed world threshold would over-filter when zoomed out and let
         jitter straight through when zoomed in. */
      const live = { x: pos.x, y: pos.y }
      drag.acc.add(live, MIN_SAMPLE_PX / zoom)
      drag.live = live
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null
        setPreview(p => p ? { ...p, points: drag.acc.points(drag.live) } : p)
      })
      return
    }
    if (drag.type === 'draw') {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current)
      // Shift held on line-type tools → constrain to nearest 45° (H, V, diagonal)
      let cx = sx, cy = sy
      if (e.shiftKey && preview) {
        const isLineTool = preview.tool === TOOLS.LINE || preview.tool === TOOLS.ARC || ANNOT_LINE_TOOLS.has(preview.tool)
        if (isLineTool) {
          const ddx = sx - drag.p1.x, ddy = sy - drag.p1.y
          if (preview.tool === ANNOT.DIMENSION) {
            // Dimension: Shift = strict H or V only
            if (Math.abs(ddx) >= Math.abs(ddy)) { cx = sx; cy = drag.p1.y }
            else { cx = drag.p1.x; cy = sy }
          } else {
            // Other line tools: 45° snap
            const angle = Math.atan2(ddy, ddx)
            const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
            const len = Math.hypot(ddx, ddy)
            cx = drag.p1.x + Math.cos(snapped) * len
            cy = drag.p1.y + Math.sin(snapped) * len
          }
        }
      }
      // For dimension tool: snap p2 to nearby object edge
      if (preview?.tool === ANNOT.DIMENSION) {
        const snp = snapToDimPoint(cx, cy)
        if (snp.snapped) { cx = snp.x; cy = snp.y }
      }
      const p2 = { x: cx, y: cy }
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null
        setPreview(p => p ? { ...p, p2 } : p)
      })
    }
  }, [toWorld, doSnap, setCursor, gridSize, setPan, objects, selectedIds, zoom, snapToDimPoint, preview])  // no resizing dep — reads resizingRef instead

  // ── Mouse up ──────────────────────────────────────────────────────────────
  const onMouseUp = useCallback(() => {
    const activeResizing = resizingRef.current
    if (activeResizing) {
      const obj = objects.find(o => o.id === activeResizing.objId)
      if (obj) commitObjectUpdate(activeResizing.objId, obj)
      resizingRef.current = null
      setResizing(null)
      setRotatingAngle(null); return
    }

    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return

    if (drag.type === 'move' && drag.moved && (snapDelta || moveDelta)) {
      const delta = snapDelta || moveDelta
      moveObjects(selectedIds, delta.dx, delta.dy)
      // Re-evaluate parentId for moved non-fp objects based on new position
      const FP_TYPES_MOVE = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
      const store = useCanvasStore.getState()
      const allObjs = store.objects   // post-move positions (immer mutates synchronously)
      selectedIds.forEach(id => {
        const obj = allObjs.find(o => o.id === id)
        if (!obj || FP_TYPES_MOVE.has(obj.type)) return
        // Compute center from post-move object coords
        let cx, cy
        if (obj.type === 'circle')       { cx = obj.cx;               cy = obj.cy }
        else if ('x1' in obj)            { cx = (obj.x1+obj.x2)/2;    cy = (obj.y1+obj.y2)/2 }
        else                             { cx = (obj.x||0)+((obj.width||0)/2); cy = (obj.y||0)+((obj.height||0)/2) }
        const fp = [...allObjs].reverse().find(o => FP_TYPES_MOVE.has(o.type) && objectContains(o, cx, cy))
        store.attachToParent(id, fp ? fp.id : undefined)
      })
      setMoveDelta(null); setSnapDelta(null); setSmartGuides([]); return
    }
    if (drag.type === 'move') { setMoveDelta(null); setSnapDelta(null); setSmartGuides([]); return }

    if (drag.type === 'groupRotate') { setRotatingAngle(null); return }

    if (drag.type === 'selbox') {
      setSelBox(null)
      if (selBox) {
        const minX=Math.min(selBox.x0,selBox.x1), maxX=Math.max(selBox.x0,selBox.x1)
        const minY=Math.min(selBox.y0,selBox.y1), maxY=Math.max(selBox.y0,selBox.y1)
        const FP_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
        const BAY_ROW_TYPES = new Set(['rack_row','rack_double_row','rack_cantilever','rack_pushback','rack_pallet_flow','rack_drive_through'])
        if (maxX-minX > 4 || maxY-minY > 4) {
          selectMultiple(objects.filter(obj => {
            if (FP_SET.has(obj.type)) return false
            const b = getObjectBounds(obj)
            return b.x<maxX && b.x+b.width>minX && b.y<maxY && b.y+b.height>minY
          }).map(o => o.id))

          // Also select bays whose beam area intersects the rubber-band box
          const bayEntries = []
          objects.forEach(obj => {
            if (!BAY_ROW_TYPES.has(obj.type) || !obj.beams) return
            const b = getObjectBounds(obj)
            if (b.y > maxY || b.y + b.height < minY) return  // row not in Y range
            const upW = ((obj.uprightWidth || 3) / 12) * gridSize
            let cursor = obj.x + upW
            obj.beams.forEach((beamIn, i) => {
              const beamPx = (beamIn / 12) * gridSize
              const bayX0 = cursor, bayX1 = cursor + beamPx
              if (bayX0 < maxX && bayX1 > minX)
                bayEntries.push({ objId: obj.id, bayIdx: i })
              cursor = bayX1 + upW
            })
          })
          if (bayEntries.length > 0) {
            setBaySelection(bayEntries)
            // Also ensure the rack rows are in selectedIds so Properties panel shows
            const rackIds = [...new Set(bayEntries.map(e => e.objId))]
            rackIds.forEach(id => { if (!selectedIds.includes(id)) selectObject(id, true) })
          } else clearBaySelection()
        }
      }
      return
    }

    /* One completed stroke = ONE addObject = one undo entry. The raw stream is
       simplified before it is committed, so the object carries a handful of
       points instead of the hundreds pointermove produced. */
    if (drag.type === 'freehand') {
      /* Identical to the final draft frame: the accumulator already froze the
         body and smoothed the tip, so there is nothing left to re-derive. */
      if (drag.acc && drag.live) drag.acc.add(drag.live, 0, true)
      const pts = drag.acc ? drag.acc.points() : []
      dragRef.current = null
      setPreview(null)
      if (pts.length > 1) {
        const st = drag.style || {}
        addObject({
          type:'freehand',
          points: pts,
          pen: st.pen, stroke: st.stroke, strokeWidth: st.strokeWidth,
          opacity: st.opacity,
          strokeLinecap: st.cap, strokeLinejoin: st.join,
          fill:'none', noFill:true, layerId:activeLayerId,
        })
      }
      return
    }

    if (drag.type === 'draw' && preview) {
      const { tool, p1, p2 } = preview
      const dx = p2.x-p1.x, dy = p2.y-p1.y
      const isClick = Math.hypot(dx, dy) < 5

      // Click-to-place: drop a default 4ft×3ft shape centered on click point
      // Drag-to-size: use the dragged bounding box as usual
      const DEFAULT_W = 4 * gridSize
      const DEFAULT_H = 3 * gridSize
      const minX = isClick ? p1.x - DEFAULT_W / 2 : Math.min(p1.x, p2.x)
      const minY = isClick ? p1.y - DEFAULT_H / 2 : Math.min(p1.y, p2.y)
      const w    = isClick ? DEFAULT_W : Math.abs(dx)
      const h    = isClick ? DEFAULT_H : Math.abs(dy)

      const hexOp = Math.round((opacity/100)*255).toString(16).padStart(2,'0')
      const fill   = noFill ? 'none' : (isClick ? '#ffffff' : fillColor + hexOp)
      const stroke = strokeColor
      const FP_TYPES_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
      const parentFp = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, p1.x, p1.y))
      const base   = {
        fill, stroke, strokeWidth:1.5, layerId:activeLayerId, noFill,
        ...(parentFp ? { parentId: parentFp.id } : {}),
      }

      // ── Standard drawing tools ────────────────────────────────────────────
      switch (tool) {
        case TOOLS.LINE:
          if (!isClick) addObject({ ...base, type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y })
          break
        case TOOLS.ARC:
          if (!isClick) addObject({ ...base, type:'arc', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, bend:0.35 })
          break
        case TOOLS.CIRCLE:   addObject({ ...base, type:'circle',   cx:minX+w/2, cy:minY+h/2, rx:Math.max(w/2,1), ry:Math.max(h/2,1) }); break
        case TOOLS.SQUARE:   addObject({ ...base, type:'rect',     x:minX, y:minY, width:w, height:h }); break
        case TOOLS.TRIANGLE: addObject({ ...base, type:'triangle', x:minX, y:minY, width:w, height:h }); break
        case TOOLS.DIAMOND:  addObject({ ...base, type:'diamond',  x:minX, y:minY, width:w, height:h }); break
        case TOOLS.STAR:     addObject({ ...base, type:'star',     x:minX, y:minY, width:w, height:h }); break
        case TOOLS.CROSS:    addObject({ ...base, type:'cross',    x:minX, y:minY, width:w, height:h }); break
        /* Arrow is a two-point directional vector: a `line` carrying an end
           cap, so it inherits the line geometry class outright — endpoint
           anchor handles, hit testing and endpoint resize all already work.
           The bbox `arrow` block-shape type is left renderable for existing
           .wcad files; nothing creates a new one. */
        case TOOLS.ARROW:
          if (!isClick) {
            const ap = loadArrowPrefs()
            addObject({ ...base, type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
              startCap: ap.startCap, endCap: ap.filled ? 'arrow' : 'open-arrow',
              headLen: ap.headLen })
          }
          break
        case TOOLS.L_SHAPE:  addObject({ ...base, type:'l_shape',  x:minX, y:minY, width:w, height:h }); break
        case TOOLS.T_SHAPE:  addObject({ ...base, type:'t_shape',  x:minX, y:minY, width:w, height:h }); break
        case TOOLS.U_SHAPE:  addObject({ ...base, type:'u_shape',  x:minX, y:minY, width:w, height:h }); break

        // ── Annotation line types (x1/y1/x2/y2 geometry) ─────────────────
        default:
          if (ANNOT_LINE_TOOLS.has(tool)) {
            const ex = isClick ? p1.x + gridSize * 6 : p2.x
            const ey = isClick ? p1.y : p2.y
            addObject({
              type: tool, x1: p1.x, y1: p1.y, x2: ex, y2: ey,
              stroke: strokeColor || '#f0b429', strokeWidth: 1.8,
              opacity: 1, layerId: activeLayerId, bend: 0.35,
              ...(parentFp ? { parentId: parentFp.id } : {}),
            })
          } else if (ANNOT_RECT_TOOLS.has(tool)) {
            // Rect-type annotations (x/y/width/height geometry)
            const autoNum = useCanvasStore.getState().objects.filter(o => o.type === 'annot_auto_number').length + 1
            const isSymbol = [ANNOT.NORTH_ARROW, ANNOT.SCALE_BAR, ANNOT.AUTO_NUMBER].includes(tool)
            const defW = isClick ? (isSymbol ? gridSize * 8 : gridSize * 10) : Math.max(gridSize * 2, w)
            const defH = isClick
              ? (tool === ANNOT.SCALE_BAR ? gridSize * 1.5
                : isSymbol ? gridSize * 5
                : gridSize * 2.5)
              : Math.max(gridSize, h)
            const ox = isClick ? p1.x - defW/2 : minX
            const oy = isClick ? p1.y - defH/2 : minY
            const annotBase = {
              type: tool, x: ox, y: oy, width: defW, height: defH,
              stroke: strokeColor || '#f0b429', fill: 'rgba(14,20,30,0.82)',
              strokeWidth: 1.5, fontSize: Math.round(gridSize * 0.9), opacity: 1,
              layerId: activeLayerId,
              number: tool === ANNOT.AUTO_NUMBER ? autoNum : undefined,
              segments: tool === ANNOT.SCALE_BAR ? 4 : undefined,
              ...(parentFp ? { parentId: parentFp.id } : {}),
            }
            const needsText = [ANNOT.LABEL, ANNOT.LABEL_BOX, ANNOT.LABEL_CIRCLE, ANNOT.CALLOUT].includes(tool)
            if (needsText) {
              const mc = lastMouseClient.current
              setAnnotInput({
                x: mc.x, y: mc.y, defaultText: '',
                onConfirm: (text) => addObject({ ...annotBase, text: text || 'Label' })
              })
            } else {
              addObject({ ...annotBase, text: 'Label' })
            }
          }
          break
      }
      setPreview(null)
      useCanvasStore.getState().setActiveTool(TOOLS.SELECT)
    }
  }, [preview, selBox, moveDelta, resizing, selectedIds, objects, opacity, noFill,
      fillColor, strokeColor, activeLayerId, addObject, moveObjects, selectMultiple, commitObjectUpdate, gridSize, snapDelta])

  // ── Stable window binding via refs — registered once, never dropped ─────
  // Storing handlers in refs means we never need to re-register the listeners
  // even when the callbacks change (e.g. when resizing state updates)
  const onMouseMoveRef = useRef(null)
  const onMouseUpRef   = useRef(null)
  useEffect(() => { onMouseMoveRef.current = onMouseMove }, [onMouseMove])
  useEffect(() => { onMouseUpRef.current   = onMouseUp   }, [onMouseUp])
  useEffect(() => {
    const handleMove = (e) => onMouseMoveRef.current(e)
    const handleUp   = ()  => onMouseUpRef.current()
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup',   handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup',   handleUp)
    }
  }, [])  // empty deps — registered once for component lifetime


  // ── Scroll zoom — no Ctrl required, zooms toward cursor ──────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const fn = (e) => {
      e.preventDefault()
      const s      = useCanvasStore.getState()
      // Trackpad pinch sends e.ctrlKey=true with small deltas; regular scroll has large deltas
      // Both zoom. Use e.deltaY for direction.
      const factor = e.deltaY > 0 ? 0.90 : 1.11
      const rect   = el.getBoundingClientRect()
      const mx     = e.clientX - rect.left
      const my     = e.clientY - rect.top
      const nz     = Math.max(0.01, Math.min(20, s.zoom * factor))
      const npx    = mx - (mx - s.panX) * (nz / s.zoom)
      const npy    = my - (my - s.panY) * (nz / s.zoom)
      s.setViewport(nz, npx, npy)
    }
    el.addEventListener('wheel', fn, { passive: false })
    return () => el.removeEventListener('wheel', fn)
  }, [])

  // ── Space key → temporary pan mode (like Figma / AutoCAD) ─────────────
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        spaceDownRef.current = true
      }
    }
    const up = (e) => {
      if (e.code === 'Space') spaceDownRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // ── Fit all to screen ────────────────────────────────────────────────────
  // Ctrl+Shift+H or double-click canvas background → zoom to fit all objects
  const fitAll = useCallback(() => {
    const objs = useCanvasStore.getState().objects
    if (!objs.length) return
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
    objs.forEach(o => {
      const b = o.fpVerts
        ? { x:Math.min(...o.fpVerts.map(v=>v.x)), y:Math.min(...o.fpVerts.map(v=>v.y)),
            r:Math.max(...o.fpVerts.map(v=>v.x)), b:Math.max(...o.fpVerts.map(v=>v.y)) }
        : { x:o.x??0, y:o.y??0, r:(o.x??0)+(o.width??0), b:(o.y??0)+(o.height??0) }
      minX=Math.min(minX,b.x); minY=Math.min(minY,b.y)
      maxX=Math.max(maxX,b.r); maxY=Math.max(maxY,b.b)
    })
    const el = containerRef.current; if (!el) return
    const {width:cw, height:ch} = el.getBoundingClientRect()
    const pad = 80
    const nz  = Math.max(0.01, Math.min(4, Math.min((cw-pad*2)/(maxX-minX), (ch-pad*2)/(maxY-minY))))
    useCanvasStore.getState().setViewport(nz, cw/2-(minX+(maxX-minX)/2)*nz, ch/2-(minY+(maxY-minY)/2)*nz)
  }, [])

  useEffect(() => {
    const fn = (e) => {
      if ((e.ctrlKey||e.metaKey) && e.key==='0') { e.preventDefault(); fitAll() }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [fitAll])

  const cursor = resizing
    ? ({tl:'nw-resize',tc:'n-resize',tr:'ne-resize',ml:'w-resize',mr:'e-resize',
        bl:'sw-resize',bc:'s-resize',br:'se-resize',rotate:'alias'}[resizing.handle] || 'crosshair')
    : moveDelta ? 'move' : CURSOR[activeTool] || 'default'

  /* Container pixel size, for viewport culling in CanvasObjects. Read live off
     the ref rather than held in state: this component already re-renders on
     every pan and zoom, which is exactly when the cull rect matters, so the
     value is current whenever it is used. On the very first render the ref is
     still null and these are 0 — CanvasObjects treats that as "cull nothing"
     rather than culling everything and flashing a blank canvas. */
  const containerW = containerRef.current?.clientWidth  || 0
  const containerH = containerRef.current?.clientHeight || 0

  return (
    <div id="canvas-container" ref={containerRef}
      className="flex-1 relative overflow-hidden" style={{ cursor, background:"var(--canvas-bg)" }}>

      {showGrid && (
        <div className="absolute inset-0 canvas-grid pointer-events-none" style={{
          backgroundSize: gridLayerSizes(gridSize, zoom),
          backgroundPosition: `${panX}px ${panY}px`,
        }} />
      )}

      {showRulers && <Rulers zoom={zoom} panX={panX} panY={panY} gridSize={gridSize} />}

      <svg id="canvas-svg" ref={svgRef} className="absolute inset-0 w-full h-full"
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={e => {
          const pos = toWorld(e.clientX, e.clientY)
          const hitId = hitTest(pos.x, pos.y)
          if (!hitId) return
          const obj = objects.find(o => o.id === hitId)
          if (!obj) return
          const canEdit = obj.type === 'text' || (obj.type?.startsWith('annot_') && 'text' in obj)
          if (!canEdit) return
          e.stopPropagation()
          if (obj.type === 'text') {
            /* Entering an edit session always selects the object being
               edited — this is also what makes the text-properties flyout
               (gated on selectedText) appear during a double-click edit. */
            selectObject(obj.id)
            setTextEdit({
              wx: obj.x, wy: obj.y, objId: obj.id, initial: obj.text || '', selectAll: false,
              style: {
                fontFamily: obj.fontFamily, fontSize: obj.fontSize, bold: obj.bold,
                italic: obj.italic, underline: obj.underline, strike: obj.strike,
                /* same guard, for a label already saved with the bad value */
                align: obj.align,
                fill: (obj.fill && obj.fill !== 'transparent' && obj.fill !== 'none')
                  ? obj.fill : TEXT_INK_DEFAULT,
                lineHeight: obj.lineHeight, letterSpacing: obj.letterSpacing,
                /* a label previously narrowed via its side handles keeps
                   wrapping while it is edited, instead of springing open to
                   one line and snapping back on commit */
                width: obj.width || undefined,
              },
            })
            return
          }
          const b = getObjectBounds(obj)
          const screenX = e.clientX
          const screenY = e.clientY
          setAnnotInput({
            x: screenX, y: screenY,
            defaultText: obj.text || '',
            onConfirm: (text) => {
              if (text !== null) useCanvasStore.getState().commitObjectUpdate(hitId, { text: text || obj.text })
            }
          })
        }}
        style={{ userSelect:'none' }} overflow="visible">

        <defs>
          <clipPath id="canvasClip">
            <rect x="0" y="0" width="100%" height="100%" />
          </clipPath>
        </defs>

        {/* Pass 1 — shapes only, clipped */}
        <g clipPath="url(#canvasClip)">
          <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
            <CanvasObjects moveDelta={snapDelta || moveDelta} zoom={zoom} containerW={containerW} containerH={containerH} onHandleMouseDown={onHandleMouseDown} onGroupRotateStart={onGroupRotateStart} handlesOnly={false} printMode={printMode} editingId={textEdit?.objId || null}/>
            {selBox && (() => {
              const x=Math.min(selBox.x0,selBox.x1), y=Math.min(selBox.y0,selBox.y1)
              const w=Math.abs(selBox.x1-selBox.x0), h=Math.abs(selBox.y1-selBox.y0)
              return <rect data-ui-overlay="true" x={x} y={y} width={w} height={h}
                fill="rgba(74,158,255,0.07)" stroke="#4a9eff"
                strokeWidth={1/zoom} strokeDasharray={`${5/zoom} ${3/zoom}`}
                pointerEvents="none" />
            })()}
            {smartGuides.map((g, i) => {
              const color = g.isWall ? '#a78bfa' : '#22c55e'
              const sw    = g.isWall ? 1.5/zoom  : 1/zoom
              return g.axis === 'x'
                ? <line data-ui-overlay="true" key={i} x1={g.val} y1={g.from} x2={g.val} y2={g.to}
                    stroke={color} strokeWidth={sw} strokeDasharray={`${6/zoom} ${3/zoom}`} opacity={0.9} pointerEvents="none"/>
                : <line data-ui-overlay="true" key={i} x1={g.from} y1={g.val} x2={g.to} y2={g.val}
                    stroke={color} strokeWidth={sw} strokeDasharray={`${6/zoom} ${3/zoom}`} opacity={0.9} pointerEvents="none"/>
            })}
          </g>
        </g>
        {/* Pass 2 — handles only, unclipped — selection boxes never cut off */}
        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          <CanvasObjects moveDelta={snapDelta || moveDelta} zoom={zoom} containerW={containerW} containerH={containerH} onHandleMouseDown={onHandleMouseDown} onGroupRotateStart={onGroupRotateStart} handlesOnly={true} editingId={textEdit?.objId || null}/>
        </g>
        {/* Overlays — rendered last so always on top */}
        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          <CanvasOverlays zoom={zoom} moveDelta={snapDelta || moveDelta} />
        </g>

        {preview && (
          <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
            <DrawingPreview preview={preview} gridSize={gridSize} />
          </g>
        )}

        <CrosshairLines panX={panX} panY={panY} zoom={zoom} />
      </svg>

      <ToolHint tool={activeTool} />
      <StatusBar />

      {/* ── Rotation angle label ── */}
      {rotatingAngle && (
        <div style={{
          position: 'fixed', left: rotatingAngle.sx + 16, top: rotatingAngle.sy - 10,
          pointerEvents: 'none', zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--accent)',
          borderRadius: 4, padding: '2px 7px',
          fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--accent)', whiteSpace: 'nowrap',
        }}>
          {rotatingAngle.angle}°
        </div>
      )}

      {/* ── Inline text editing, directly over the object ── */}
      {textEdit && (
        <InlineTextEditor
          session={textEdit} zoom={zoom} panX={panX} panY={panY} svgRef={svgRef}
          onCommit={(text) => {
            const t = (text ?? '').replace(/s+$/, '')
            const s = textEdit.style || {}
            if (textEdit.objId) {
              /* An existing label emptied out is removed rather than left as an
                 invisible object. The store deletes through the selection, so
                 select it first — one undo entry either way. */
              if (!t.trim()) {
                const st = useCanvasStore.getState()
                st.selectObject(textEdit.objId)
                st.deleteSelected()
              } else {
                commitObjectUpdate(textEdit.objId, { text: t })
              }
            } else if (t.trim()) {
              /* Explicit id so the new label can be selected the instant it
                 exists — addObject spreads ...obj after its own generated
                 id, so a caller-supplied one wins. Selecting it is what
                 makes the text-properties flyout appear right after you
                 finish typing, instead of only on a later re-select. */
              const newId = nanoid()
              addObject({
                id: newId,
                type:'text', x:textEdit.wx, y:textEdit.wy, text:t,
                fill: s.fill, stroke:'none',
                fontSize: s.fontSize, fontFamily: s.fontFamily,
                bold: s.bold, italic: s.italic, underline: s.underline,
                strike: s.strike, align: s.align,
                lineHeight: s.lineHeight ?? 1.25, letterSpacing: s.letterSpacing ?? 0,
                layerId: activeLayerId,
              })
              selectObject(newId)
            }
            setTextEdit(null)
          }}
          onCancel={() => setTextEdit(null)}
        />
      )}

      {/* ── Inline annotation text input (non-text annotations only) ── */}
      {annotInput && (
        <AnnotInputOverlay
          x={annotInput.x} y={annotInput.y}
          defaultText={annotInput.defaultText}
          onConfirm={(text) => { annotInput.onConfirm(text); setAnnotInput(null) }}
          onCancel={() => setAnnotInput(null)}
        />
      )}

      {/* ── Floating wall input — separate component to preserve input focus ── */}
      {activeWall && <WallInputOverlay
        activeWall={activeWall}
        objects={objects}
        gridSize={gridSize}
        zoom={zoom} panX={panX} panY={panY}
        onClose={() => setActiveWall(null)}
      />}
    </div>
  )
}

function CrosshairLines({ panX, panY, zoom }) {
  const { cursorX, cursorY, gridSize } = useCanvasStore()
  const sx = cursorX * gridSize * zoom + panX
  const sy = cursorY * gridSize * zoom + panY
  return (
    <g pointerEvents="none" opacity={0.12}>
      <line x1={sx} y1="0" x2={sx} y2="100%" stroke="#f0b429" strokeWidth="1" />
      <line x1="0" y1={sy} x2="100%" y2={sy} stroke="#f0b429" strokeWidth="1" />
    </g>
  )
}

const HINTS = {
  [TOOLS.SELECT]:       'Click to select · Shift+click multi-select · Drag to move · Handles to resize · ↻ to rotate',
  [TOOLS.MULTI_SELECT]: 'Drag a box to select multiple objects',
  [TOOLS.LINE]:         'Click & drag to draw a line · tool stays active after drawing',
  [TOOLS.ARC]:          'Click & drag to draw an arc · drag ◆ handle to adjust bend',
  [TOOLS.CIRCLE]:       'Click to place · or drag to set size',
  [TOOLS.SQUARE]:       'Click to place · or drag to set size',
  [TOOLS.TEXT]:         'Click to place text · drag to move existing text',
  [TOOLS.PAN]:          'Click object to select · Shift+click to multi-select · Drag to pan · Shift+drag to rubber-band select',
}

function ToolHint({ tool }) {
  const hint = HINTS[tool]
  if (!hint) return null
  return (
    <div className="absolute bottom-9 left-1/2 -translate-x-1/2 pointer-events-none z-10 max-w-[calc(100%-2rem)]">
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:99, padding:"5px 16px", fontSize:"var(--fs-xs)", fontFamily:"var(--font-mono)", color:"var(--text2)", backdropFilter:"blur(8px)", textAlign:"center" }}>
        {hint}
      </div>
    </div>
  )
}

// ─── Floating wall input — own component so useState survives object updates ──
function WallInputOverlay({ activeWall, objects, gridSize, zoom, panX, panY, onClose }) {
  const obj = objects.find(o => o.id === activeWall.objId)
  const walls = obj ? getFpWallSegments(obj, gridSize) : []
  const seg = walls[activeWall.wallIdx]
  const [val, setVal] = useState(seg ? seg.lenFt.toFixed(1) : '')
  const [bothWalls, setBothWalls] = useState(false)

  useEffect(() => {
    if (seg) setVal(seg.lenFt.toFixed(1))
  }, [activeWall.objId, activeWall.wallIdx]) // eslint-disable-line

  if (!obj || !seg) return null

  // Find the opposite wall (same axis, opposite side of shape)
  const isHoriz = Math.abs(seg.b.x - seg.a.x) >= Math.abs(seg.b.y - seg.a.y)
  const oppositeIdx = walls.findIndex((w, i) => {
    if (i === activeWall.wallIdx) return false
    const wIsHoriz = Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y)
    return wIsHoriz === isHoriz
  })
  // For simple shapes pick the one closest in length (most likely the true opposite)
  const oppositeWallIdx = (() => {
    const candidates = walls.reduce((acc, w, i) => {
      if (i === activeWall.wallIdx) return acc
      const wIsHoriz = Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y)
      if (wIsHoriz === isHoriz) acc.push(i)
      return acc
    }, [])
    if (!candidates.length) return -1
    // pick the one whose midpoint is farthest from this wall's midpoint
    const mx = (seg.a.x + seg.b.x) / 2, my = (seg.a.y + seg.b.y) / 2
    return candidates.sort((a, b) => {
      const wa = walls[a], wb = walls[b]
      const da = Math.hypot((wa.a.x+wa.b.x)/2 - mx, (wa.a.y+wa.b.y)/2 - my)
      const db = Math.hypot((wb.a.x+wb.b.x)/2 - mx, (wb.a.y+wb.b.y)/2 - my)
      return db - da
    })[0]
  })()
  const hasOpposite = oppositeWallIdx >= 0

  const midX = (seg.a.x + seg.b.x) / 2
  const midY = (seg.a.y + seg.b.y) / 2
  const sx = midX * zoom + panX
  const sy = midY * zoom + panY
  const cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2
  const ddx = midX - cx, ddy = midY - cy
  const len = Math.hypot(ddx, ddy) || 1
  const OFFSET_PX = 90
  const ox = (ddx / len) * OFFSET_PX, oy = (ddy / len) * OFFSET_PX

  const commit = (raw) => {
    const v = parseFloat(raw)
    if (isNaN(v) || v <= 0) return
    const store = useCanvasStore.getState()
    const latest = store.objects.find(o => o.id === activeWall.objId) || obj
    const updates = applyFpWallLength(latest, activeWall.wallIdx, v, gridSize)
    if (Object.keys(updates).length > 0) store.updateObject(activeWall.objId, updates)
    // Also update opposite wall if "both" mode
    if (bothWalls && hasOpposite) {
      const latest2 = useCanvasStore.getState().objects.find(o => o.id === activeWall.objId) || obj
      const upd2 = applyFpWallLength(latest2, oppositeWallIdx, v, gridSize)
      if (Object.keys(upd2).length > 0) store.updateObject(activeWall.objId, upd2)
    }
  }

  return (
    <>
      {/* Invisible backdrop — click anywhere outside the popup to close */}
      <div
        style={{ position:'absolute', inset:0, zIndex:199, pointerEvents:'all' }}
        onMouseDown={() => { commit(val); onClose() }}
      />
      <div
        style={{ position:'absolute', left: sx + ox, top: sy + oy,
          transform:'translate(-50%,-50%)', pointerEvents:'all', zIndex:200,
          background:'var(--surface)', border:'1px solid var(--accent)',
          borderRadius:8, padding:'5px 8px', boxShadow:'var(--shadow)',
          display:'flex', alignItems:'center', gap:5 }}
        onMouseDown={e => e.stopPropagation()}
      >
      <span style={{ fontSize:'var(--fs-xs)', color:'var(--text3)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap' }}>{seg.label}</span>
      <input
        type="number" min={1} max={999} step={0.5}
        value={val} autoFocus
        style={{ width:52, background:'var(--surface2)', border:'1px solid var(--border)',
          borderRadius:5, fontSize:'var(--fs-sm)', color:'var(--accent)',
          fontFamily:'var(--font-mono)', padding:'2px 5px', outline:'none', textAlign:'center' }}
        onFocus={e => e.target.style.borderColor='var(--accent)'}
        onBlur={e => e.target.style.borderColor='var(--border)'}
        onChange={e => { setVal(e.target.value); commit(e.target.value) }}
        onKeyDown={e => { if (e.key==='Enter') { commit(val); onClose() } if (e.key==='Escape') onClose() }}
      />
      <span style={{ fontSize:'var(--fs-xs)', color:'var(--text3)', fontFamily:'var(--font-mono)' }}>ft</span>
      <button onClick={onClose}
        style={{ color:'var(--text3)', background:'none', border:'none', cursor:'pointer', fontSize:12, lineHeight:1, padding:0 }}>✕</button>
    </div>
    </>
  )
}

// ─── Inline annotation text input overlay ────────────────────────────────────
/* ═══════════════════════════════════════════════════════════════════════════
   INLINE TEXT EDITOR — a transparent textarea sitting exactly over the text
   it edits, so what you type is what the canvas will render. No modal, no
   confirm button.

   The overlay is positioned from the world→screen transform and mirrors every
   font property, with size multiplied by zoom. `left`/`top` are derived the
   same way toWorld inverts, so the caret sits on the glyphs at any zoom or pan.

   It commits on blur, Escape or an outside click, and a session that ends
   empty removes the object rather than leaving an invisible one behind.
   ═══════════════════════════════════════════════════════════════════════════ */
function InlineTextEditor({ session, zoom, panX, panY, svgRef, onCommit, onCancel }) {
  const ref = useRef(null)
  const [val, setVal] = useState(session.initial || '')

  /* Grow to fit: reset then follow scroll size, so no scrollbar ever shows and
     nothing is clipped. Height already worked this way; width did not — a
     textarea's default width is a fixed browser intrinsic (~150px here) that
     never tracks content on its own the way height can via scrollHeight. Past
     that width the typed characters were still there in the value, just cut
     off by overflow:hidden, which reads exactly like typing had stopped
     working. A width-constrained object (set by dragging a side handle)
     wraps instead of growing, so editing does not spring it open and then
     snap back on commit. */
  const wrapWidth = session.style?.width
  const autoSize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    if (!wrapWidth) {
      el.style.width = '0px'
      el.style.width = Math.max(24, el.scrollWidth + 2) + 'px'
    }
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    /* caret at the end — the whole string stays editable, and nothing is
       staged for replacement by the next keystroke */
    if (session.selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    autoSize()
  }, [])                                     // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(autoSize, [val])

  const rect = svgRef.current?.getBoundingClientRect()
  if (!rect) return null
  const s   = session.style || {}
  const fs  = (s.fontSize || 14) * zoom
  const left = rect.left + session.wx * zoom + panX
  /* SVG text sits on its baseline; a textarea grows from its top, so lift it
     by roughly the ascender to keep the glyphs on the same line. */
  const top  = rect.top  + session.wy * zoom + panY - fs * 0.95

  const commit = () => onCommit(val)
  const align  = s.align === 'center' ? 'center' : s.align === 'right' ? 'right' : 'left'

  return (
    <>
      {/* outside-click catcher — commits rather than discarding */}
      <div style={{ position:'fixed', inset:0, zIndex:1999 }}
        onMouseDown={e => { e.stopPropagation(); commit() }}/>
      <textarea
        ref={ref} rows={1} value={val} data-inline-text
        onChange={e => {
          const next = e.target.value
          setVal(next)
          /* Live-sync into the store so the selection frame (which reads
             getObjectBounds off the store's copy) grows as you type instead
             of staying pinned to the pre-edit size until commit. No history
             push — same updateObject-during-drag pattern used elsewhere in
             this file; only the final commit() below pushes one undo entry.
             Only for an EXISTING object: a fresh session has nothing in the
             store yet until the first commit creates it. */
          if (session.objId) useCanvasStore.getState().updateObject(session.objId, { text: next })
        }}
        onMouseDown={e => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation()                       /* keep canvas shortcuts out */
          if (e.key === 'Escape') { e.preventDefault(); commit() }
          /* Enter adds a line; Ctrl/Cmd+Enter commits, as in most CAD editors */
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
        }}
        style={{
          position:'fixed', left, top, zIndex:2000,
          /* transparent, chromeless — the canvas text shows through as you type */
          background:'transparent', border:'none', outline:'none', resize:'none',
          padding:0, margin:0, overflow:'hidden',
          whiteSpace: wrapWidth ? 'pre-wrap' : 'pre',
          wordBreak: wrapWidth ? 'break-word' : 'normal',
          minWidth: 24, width: wrapWidth ? wrapWidth * zoom : 'auto', minHeight: fs,
          caretColor: s.fill || 'var(--text)',
          color: s.fill || 'var(--text)',
          fontFamily: s.fontFamily || 'Montserrat',
          fontSize: fs,
          fontWeight: s.bold ? 700 : 400,
          fontStyle:  s.italic ? 'italic' : 'normal',
          textDecoration: [s.underline && 'underline', s.strike && 'line-through']
            .filter(Boolean).join(' ') || 'none',
          lineHeight: s.lineHeight ?? 1.25,
          letterSpacing: (s.letterSpacing ?? 0) * zoom,
          textAlign: align,
          transformOrigin: 'left top',
        }}/>
    </>
  )
}

function AnnotInputOverlay({ x, y, defaultText, onConfirm, onCancel }) {
  const [val, setVal] = useState(defaultText || '')
  const inputRef = useRef(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => onConfirm(val)

  // Keep popup within viewport
  const W = 200, H = 36
  const vw = window.innerWidth, vh = window.innerHeight
  const left = Math.min(Math.max(x - W/2, 8), vw - W - 8)
  const top  = Math.min(Math.max(y - H - 8, 8), vh - H - 8)

  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:1999 }}
        onMouseDown={e => { e.stopPropagation(); commit() }} />
      <div style={{
        position: 'fixed', left, top, zIndex: 2000,
        background: 'var(--surface, #13151a)',
        border: '1.5px solid var(--accent, #4a9eff)',
        borderRadius: 6,
        boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 4px',
        width: W,
      }}
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit() }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          placeholder="Label text…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text1, #e8eaf0)',
            fontSize: 12,
            fontFamily: 'Montserrat, sans-serif',
            padding: '3px 4px',
            outline: 'none',
            minWidth: 0,
          }}
        />
        <button onClick={commit}
          style={{ flexShrink:0, padding:'2px 8px', borderRadius:4, border:'none',
            background:'var(--accent,#4a9eff)', color:'#fff', cursor:'pointer',
            fontSize:11, fontWeight:600, lineHeight:'18px' }}>
          ✓
        </button>
      </div>
    </>
  )
}