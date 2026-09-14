import { useState, memo, useRef, useCallback, useSyncExternalStore } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import {
  getObjectBounds, pxToFtIn, ANNOT_LINE_TYPES, ANNOT_RECT_TYPES,
  getFpVertices, getFpWallSegments, getWallDragAxis, initFpVerts, objectInView,
  /* Path helpers the DrawingPreview switch below calls. Omitting these threw
     "arcPath is not defined" the moment a drag started and white-screened the
     app — a runtime-only failure, since esbuild never resolves identifiers. */
  arcPath, trianglePath, diamondPath, starPath, crossPath,
  lShapePath, tShapePath, uShapePath,
} from '../../utils/canvas'
import { capGeometry, unitVec, HEAD_LEN_WORLD } from '../../utils/arrowGeometry'
import { linePath, strokeOutlinePath } from '../../utils/freehand'
import { ShapeGeometry } from './ShapeGeometry'
import {
  DimLabel, FpOverlay, FpSegmentDimLabels, FpWallHitAreas,
  FpRotateHandle, ResizeHandles, GroupOutline, ObjectLabel, RackLabels,
} from './CanvasUI'
import { AnnotationObject } from './AnnotationObjects'
import { CanvasOverlays } from './CanvasOverlays'
import { subscribeExportMode, isExporting } from './exportMode'

const FP_TYPES = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])

/* Stable identities for props that would otherwise be rebuilt every render.
   CanvasObject is memo()d, and a fresh [] or () => {} defeats that for every
   object on the sheet — which is most of what made pan re-render the world. */
const NOOP  = () => {}
const EMPTY = []

const CanvasObject = memo(function CanvasObject({ obj, editing = false, selected, moveDelta, groupSelected, zoom, gridSize, activeWallIdx, activeBaySelection = [], onClick, onHandleMouseDown, onWallMouseDown, objects = [], printMode = false }) {
  const [hoveredWallIdx, setHoveredWallIdx] = useState(null)
  /* Hover is presentation-only and lives on the object, not the store — it
     changes nothing but whether this one rack shows its name. */
  const [hovered, setHovered] = useState(false)
  /* The parent now hands down a stable (e, objId, handle) callback; the handle
     children expect (e, handle). Both deps are stable, so this adapter is too. */
  const handleDown = useCallback((e, handle) => onHandleMouseDown(e, obj.id, handle),
    [onHandleMouseDown, obj.id])
  const dx = moveDelta ? moveDelta.dx : 0
  const dy = moveDelta ? moveDelta.dy : 0
  const shiftedObj = {
    ...obj,
    ...(obj.type === 'circle'
      ? { cx: obj.cx+dx, cy: obj.cy+dy }
      : 'x1' in obj
        ? { x1: obj.x1+dx, y1: obj.y1+dy, x2: obj.x2+dx, y2: obj.y2+dy }
        : { x: (obj.x||0)+dx, y: (obj.y||0)+dy,
            ...(obj.tailX !== undefined ? { tailX: obj.tailX+dx, tailY: obj.tailY+dy } : {}) }),
    ...(obj.fpVerts && (dx||dy) ? { fpVerts: obj.fpVerts.map(v=>({x:v.x+dx,y:v.y+dy})) } : {}),
  }
  const rot = obj.rotation || 0
  const b   = getObjectBounds(shiftedObj)
  const rcx = b.x + b.width/2, rcy = b.y + b.height/2
  const rotTransform = rot !== 0 ? `rotate(${rot}, ${rcx}, ${rcy})` : undefined
  const isFp   = FP_TYPES.has(obj.type)
  const isAnnot = obj.type?.startsWith('annot_')
  // Line-type objects (line, arc, and all ANNOT_LINE_TYPES) identified by x1 presence
  const isLineType = 'x1' in obj

  return (
    <g transform={rotTransform}
      style={{ cursor: 'move' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={e => {
        e.stopPropagation()
        useCanvasStore.getState().setActiveWall(null)
        onClick(obj.id, e.shiftKey)
      }}>
      {/* ── Selection glow for annotation line types — drawn ON the actual path ── */}
      {selected && !groupSelected && isAnnot && isLineType && obj.type !== 'annot_dimension' && (() => {
        const x1 = shiftedObj.x1, y1 = shiftedObj.y1
        const x2 = shiftedObj.x2, y2 = shiftedObj.y2
        const glowW = 8 / zoom
        const isCurve = obj.type === 'annot_curve_arrow'
        if (isCurve) {
          const mx = (x1+x2)/2, my = (y1+y2)/2
          const bend = obj.bend ?? 0.35
          const ddx = x2-x1, ddy = y2-y1
          const cpx = mx - ddy*bend, cpy = my + ddx*bend
          return (
            <path d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
              stroke="#4a9eff" strokeWidth={glowW} fill="none"
              strokeLinecap="round" opacity={0.25} pointerEvents="none"/>
          )
        }
        return (
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#4a9eff" strokeWidth={glowW} strokeLinecap="round"
            opacity={0.25} pointerEvents="none"/>
        )
      })()}
      {/* ── Fat transparent hit area — zoom-aware so it stays ~20 screen px wide ── */}
      {isLineType && (() => {
        // 20 screen px ÷ zoom = world px needed to render as 20 screen px
        const hitW = 20 / zoom
        const x1 = shiftedObj.x1, y1 = shiftedObj.y1
        const x2 = shiftedObj.x2, y2 = shiftedObj.y2
        const isCurve = obj.type === 'annot_curve_arrow'
        if (isCurve) {
          const mx = (x1+x2)/2, my = (y1+y2)/2
          const bend = obj.bend ?? 0.35
          const ddx = x2-x1, ddy = y2-y1
          const cpx = mx - ddy*bend, cpy = my + ddx*bend
          return (
            <path d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
              stroke="transparent" strokeWidth={hitW} fill="none" strokeLinecap="round"/>
          )
        }
        return (
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="transparent" strokeWidth={hitW} strokeLinecap="round"/>
        )
      })()}
      {/* hidden, not unmounted — the selection frame and handles still need
          its geometry while you type */}
      <g style={{ visibility: editing ? 'hidden' : 'visible' }}>
        <ShapeGeometry obj={obj} dx={dx} dy={dy} zoom={zoom} gridSize={gridSize} activeBaySelection={activeBaySelection} selected={selected} objects={objects} printMode={printMode} />
      </g>
      <FpOverlay   obj={obj} dx={dx} dy={dy} />
      <ObjectLabel obj={obj} dx={dx} dy={dy} revealed={selected || groupSelected || hovered} />
      <RackLabels  obj={shiftedObj} dx={0} dy={0} zoom={zoom} gridSize={gridSize} selected={selected} />
      {isFp && (
        <g className={selected ? '' : 'dim-labels-hidden'}>
          <FpSegmentDimLabels obj={shiftedObj} dx={0} dy={0} zoom={zoom}
            activeWallIdx={selected ? activeWallIdx : null} />
        </g>
      )}
      {isFp && (
        <FpWallHitAreas
          obj={shiftedObj} dx={0} dy={0} zoom={zoom}
          selected={selected}
          activeWallIdx={activeWallIdx}
          hoveredWallIdx={hoveredWallIdx}
          onWallHover={setHoveredWallIdx}
          onWallMouseDown={(e, wallIdx) => {
            e.stopPropagation()
            useCanvasStore.getState().setActiveWall({ objId: obj.id, wallIdx })
            useCanvasStore.getState().selectObject(obj.id)
            handleDown(e, `wall_${wallIdx}`)
          }}
        />
      )}
      {selected && !groupSelected && isFp && (
        <FpRotateHandle obj={shiftedObj} zoom={zoom} onHandleMouseDown={handleDown} />
      )}
      {selected && !groupSelected && !isFp && (
        <ResizeHandles obj={shiftedObj} zoom={zoom} gridSize={gridSize} isFp={false}
          isLineType={isLineType}
          onHandleMouseDown={handleDown} />
      )}
    </g>
  )
})

export function DrawingPreview({ preview, gridSize }) {
  if (!preview) return null
  /* Must come before p1/p2 are read: a freehand preview carries a point
     array and has no endpoints, so destructuring them would throw. The live
     stream is drawn unsimplified so the line tracks the pointer exactly;
     simplification happens once, at commit. */
  if (preview.tool === 'freehand') {
    const pts = preview.points || []
    if (pts.length < 2) return null
    /* Same render path as the committed stroke — colour, width, cap, join and
       alpha all come from the style captured at pointerdown. */
    const st = preview.style || {}
    /* Already frozen + smoothed by the accumulator. Re-running RDP here would
       recompute the whole stream each frame, which is what made previously
       drawn parts shift. */
    const shown = pts
    return st.pen === 'technical'
      ? <path d={linePath(shown)} fill="none" stroke={st.stroke} strokeWidth={st.strokeWidth}
          strokeLinecap={st.cap} strokeLinejoin={st.join} opacity={st.opacity}/>
      : <path d={strokeOutlinePath(shown, { pen: st.pen, width: st.strokeWidth, cap: st.cap })}
          fill={st.stroke} stroke="none" opacity={st.opacity}/>
  }
  const { tool, p1, p2 } = preview
  const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y)
  const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y)
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const ps = { fill:'none', stroke:'#f0b429', strokeWidth:1.5, strokeDasharray:'6 3', opacity:0.9 }
  const fmtIn = (px) => {
    const ti = (px / gridSize) * 12, ft = Math.floor(Math.abs(ti) / 12), inch = Math.round(Math.abs(ti) % 12)
    if (inch === 12) return `${ft+1}' 0"` ; return inch > 0 ? `${ft}' ${inch}"` : `${ft}'`
  }
  let geom = null
  const useWH = !['line','arc','arrow'].includes(tool)
  switch (tool) {
    case 'line':     geom = <line {...ps} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeLinecap="round" />; break
    case 'arc':      geom = <path {...ps} d={arcPath(p1.x,p1.y,p2.x,p2.y,preview.bend ?? 0.35)} strokeLinecap="round" />; break
    /* Arrow previews as the two-point vector it now commits, head included,
       so what you drag is what you get. */
    case 'arrow': {
      const u = unitVec(p1.x, p1.y, p2.x, p2.y)
      const head = capGeometry('arrow', p2.x, p2.y, u.ux, u.uy, 1.5, HEAD_LEN_WORLD)
      geom = (<>
        <line {...ps} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeLinecap="round" />
        {head && <path d={head.d} fill={ps.stroke} stroke="none" opacity={ps.opacity} />}
      </>)
      break
    }
    case 'square':   geom = <rect {...ps} x={x} y={y} width={Math.max(w,1)} height={Math.max(h,1)} rx={1} />; break
    case 'circle':   geom = <ellipse {...ps} cx={x+w/2} cy={y+h/2} rx={Math.max(w/2,1)} ry={Math.max(h/2,1)} />; break
    case 'triangle': geom = <path {...ps} d={trianglePath(x,y,Math.max(w,1),Math.max(h,1))} />; break
    case 'diamond':  geom = <path {...ps} d={diamondPath(x,y,Math.max(w,1),Math.max(h,1))} />; break
    case 'star':     geom = <path {...ps} d={starPath(x,y,Math.max(w,1),Math.max(h,1))} />; break
    case 'cross':    geom = <path {...ps} d={crossPath(x,y,Math.max(w,1),Math.max(h,1))} />; break
    case 'l_shape':  geom = <path {...ps} d={lShapePath(x,y,Math.max(w,1),Math.max(h,1))} />; break
    case 't_shape':  geom = <path {...ps} d={tShapePath(x,y,Math.max(w,1),Math.max(h,1),0.3,0.3,0.325,0.675)} />; break
    case 'u_shape':  geom = <path {...ps} d={uShapePath(x,y,Math.max(w,1),Math.max(h,1))} />; break
    default: {
      // Annotation tools — render live preview via AnnotationObject
      if (ANNOT_LINE_TYPES.has(tool)) {
        const previewObj = { type:tool, x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
          stroke:'#f0b429', strokeWidth:1.8, opacity:0.7, bend:0.35 }
        const isDim = tool === 'annot_dimension'
        return (
          <>
            <AnnotationObject obj={previewObj} gridSize={gridSize} />
            {isDim && (
              <>
                <circle cx={p1.x} cy={p1.y} r={6} fill="none" stroke="#4a9eff" strokeWidth={1.5} opacity={0.9}/>
                <circle cx={p2.x} cy={p2.y} r={6} fill="none" stroke="#4a9eff" strokeWidth={1.5} opacity={0.9}/>
              </>
            )}
          </>
        )
      }
      if (ANNOT_RECT_TYPES.has(tool)) {
        const previewObj = { type:tool,
          x:Math.min(p1.x,p2.x), y:Math.min(p1.y,p2.y),
          width:Math.max(gridSize, Math.abs(p2.x-p1.x)), height:Math.max(gridSize*0.5, Math.abs(p2.y-p1.y)),
          stroke:'#f0b429', fill:'rgba(14,20,30,0.6)', strokeWidth:1.5,
          fontSize:gridSize*0.45, opacity:0.7, text:'Label', number:1, segments:4 }
        return <AnnotationObject obj={previewObj} gridSize={gridSize} />
      }
      return null
    }
  }
  return (
    <g pointerEvents="none">
      {geom}
      {useWH && w > 20 && h > 20 && (
        <><DimLabel x={x+w/2} y={y+h-8} text={fmtIn(w)} /><DimLabel x={x+w-4} y={y+h/2} text={fmtIn(h)} anchor="end" /></>
      )}
      {useWH && (w <= 20 || h <= 20) && (w > 4 || h > 4) && (
        <DimLabel x={x+w/2} y={y+h+14} text={`${fmtIn(w)} × ${fmtIn(h)}`} />
      )}
      {!useWH && dist > 8 && (
        <DimLabel x={(p1.x+p2.x)/2} y={(p1.y+p2.y)/2-12} text={fmtIn(dist)} />
      )}
    </g>
  )
}



export function CanvasObjects({ moveDelta, zoom, containerW = 0, containerH = 0, onHandleMouseDown, onGroupRotateStart, printMode = false, editingId = null }) {
  const objects    = useCanvasStore(s => s.objects)
  const selectedIds= useCanvasStore(s => s.selectedIds)
  const selectObject= useCanvasStore(s => s.selectObject)
  const layers     = useCanvasStore(s => s.layers)
  const groups     = useCanvasStore(s => s.groups)
  const activeWall = useCanvasStore(s => s.activeWall)
  const gridSize   = useCanvasStore(s => s.gridSize)
  const activeBaySelection = useCanvasStore(s => s.activeBaySelection) || EMPTY
  /* onHandleMouseDown is useCallback([objects, toWorld]) in CanvasArea, and
     toWorld depends on pan/zoom — so it gets a new identity on every pan and
     every zoom, which broke memo for all ~1,700 objects. Holding the latest
     one in a ref gives the children a stable prop AND the current closure, so
     nothing goes stale at mousedown. */
  const handleRef = useRef(onHandleMouseDown)
  handleRef.current = onHandleMouseDown
  const stableHandleMouseDown = useCallback((e, objId, handle) => {
    handleRef.current(e, objId, handle)
  }, [])

  const panX       = useCanvasStore(s => s.panX)
  const panY       = useCanvasStore(s => s.panY)
  const visibleIds = new Set(layers.filter(l => l.visible).map(l => l.id))
  const groupMap = {}
  ;(groups || []).forEach(g => g.ids.forEach(id => { groupMap[id] = g.id }))
  const selSet = new Set(selectedIds)
  const activeGroupIds = new Set((groups || []).filter(g => g.ids.some(id => selSet.has(id))).map(g => g.id))
  const groupOutlines  = (groups || []).filter(g => activeGroupIds.has(g.id)).map(g => ({ id:g.id, objs:objects.filter(o => g.ids.includes(o.id)) }))
  const sortedObjects  = [...objects].sort((a,b) => (FP_TYPES.has(a.type)?0:1) - (FP_TYPES.has(b.type)?0:1))

  // IDs of FP objects currently being dragged — children inherit moveDelta from them
  const movingFpIds = moveDelta
    ? new Set(selectedIds.filter(id => { const o = objects.find(x => x.id === id); return o && FP_TYPES.has(o.type) }))
    : new Set()

  /* ── Viewport culling ────────────────────────────────────────────────────
     SVG has no scene graph: an off-screen <rect> is still a live DOM node the
     browser lays out and hit-tests every frame. The visible world rectangle,
     padded so objects just off-screen stay mounted and nothing pops in on a
     fast pan.

     Disabled when printing (a PDF renders off-screen at its own extents) and
     before the container has been measured on the first render — both mean
     "draw everything", never "draw nothing". */
  /* A PDF is built by cloning this SVG, so an export has to see every object,
     not just the ones on screen. */
  const exporting = useSyncExternalStore(subscribeExportMode, isExporting, () => false)
  const canCull = !printMode && !exporting && containerW > 0 && containerH > 0 && zoom > 0
  const PAD  = 300 / zoom          // world px
  const view = {
    x0: (0 - panX) / zoom - PAD,
    y0: (0 - panY) / zoom - PAD,
    x1: (containerW - panX) / zoom + PAD,
    y1: (containerH - panY) / zoom + PAD,
  }
  const visible = !canCull ? sortedObjects : sortedObjects.filter(o =>
    /* The building frames everything else and is a handful of cheap shapes;
       selection and the live text editor carry handles and overlays; and a
       child of a dragging FP moves with pre-drag bounds, so culling on those
       would pop it out mid-drag. */
    FP_TYPES.has(o.type) ||
    selSet.has(o.id) ||
    editingId === o.id ||
    (o.parentId && movingFpIds.has(o.parentId)) ||
    objectInView(o, view)
  )

  return (
    <>
      {visible.map(obj => {
        if (!visibleIds.has(obj.layerId)) return null
        const gid = groupMap[obj.id], groupSel = gid ? activeGroupIds.has(gid) : false
        const isActiveWallObj = activeWall?.objId === obj.id
        const isSelected  = selSet.has(obj.id)
        // Children of a moving FP inherit moveDelta so they follow live during drag
        const parentMoves = !isSelected && obj.parentId && movingFpIds.has(obj.parentId)
        const effectiveDelta = (isSelected || parentMoves) ? moveDelta : null
        return (
          <CanvasObject key={obj.id} obj={obj}
            /* While a label is being edited the live textarea sits over it.
               Painting the static node too would show the old string through
               the new one — the overlap bug. */
            editing={editingId === obj.id}
            selected={isSelected} groupSelected={groupSel}
            moveDelta={effectiveDelta} zoom={zoom} gridSize={gridSize} onClick={selectObject}
            activeWallIdx={isActiveWallObj ? activeWall.wallIdx : null}
            activeBaySelection={activeBaySelection}
            objects={objects}
            printMode={printMode}
            onHandleMouseDown={stableHandleMouseDown}
            onWallMouseDown={NOOP}
          />
        )
      })}
      {/* Group outlines rendered last so they appear on top of fp objects */}
      {groupOutlines.map(({ id, objs }) => (
        <GroupOutline key={id} objs={objs} zoom={zoom} groupId={id} onRotateGroup={onGroupRotateStart} moveDelta={moveDelta} />
      ))}
      {/* Aisle labels rendered by CanvasOverlays (separate module) */}
    </>
  )
}