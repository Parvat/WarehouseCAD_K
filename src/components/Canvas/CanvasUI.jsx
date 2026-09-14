import { useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import {
  getObjectBounds, getHandlePositions, HANDLES, pxToFtIn,
  getFpWallSegments, ANNOT_LINE_TYPES, ANNOT_RECT_TYPES, getEffectiveDelta, getWallDragAxis,
} from '../../utils/canvas'

const FP_TYPES = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])

export function DimLabel({ x, y, text, anchor = 'middle', color = '#f0b429' }) {
  const w = text.length * 5.5 + 8
  const ax = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return (
    <g pointerEvents="none">
      <rect x={ax} y={y - 9} width={w} height={13} fill="#0a0c10" rx={2} opacity={0.92} />
      <text x={x} y={y + 1} textAnchor={anchor} fontSize={9} fontFamily="JetBrains Mono,monospace" fill={color}>{text}</text>
    </g>
  )
}


// ─── Column grid + floor label ───────────────────────────────────────────────
export function FpOverlay({ obj, dx = 0, dy = 0 }) {
  const { gridSize } = useCanvasStore.getState()
  if (!FP_TYPES.has(obj.type)) return null
  const b  = getObjectBounds(obj)
  const bx = b.x + dx, by = b.y + dy
  const w  = b.width, h = b.height
  const cx = bx + w / 2, cy = by + h / 2
  const colPx = 20 * gridSize
  const marks = []
  for (let mx = colPx; mx < w; mx += colPx)
    for (let my = colPx; my < h; my += colPx)
      marks.push([bx + mx, by + my])
  const label    = obj.label || ''
  const fontSize = obj.labelFontSize ?? Math.round(Math.min(w, h) * 0.10)
  return (
    <g pointerEvents="none">
      {marks.map(([mx, my], i) => (
        <g key={i} opacity={0.22}>
          <line x1={mx-4} y1={my} x2={mx+4} y2={my} stroke="#4a9eff" strokeWidth={0.8} />
          <line x1={mx} y1={my-4} x2={mx} y2={my+4} stroke="#4a9eff" strokeWidth={0.8} />
          <circle cx={mx} cy={my} r={2.5} fill="none" stroke="#4a9eff" strokeWidth={0.7} />
        </g>
      ))}
      {label && (
        <text x={cx} y={cy + fontSize * 0.38} textAnchor="middle" fontSize={fontSize}
          fontFamily="Syne, sans-serif" fontWeight={800}
          letterSpacing={Math.max(2, fontSize * 0.12)}
          fill="#4a7aaa" opacity={0.6} pointerEvents="none">{label}</text>
      )}
    </g>
  )
}

// ─── Per-segment dimension labels (always on when selected) ─────────────────
// Shows a tick-mark dimension line for every wall segment outside the shape
export function FpSegmentDimLabels({ obj, dx = 0, dy = 0, zoom = 1, activeWallIdx = null }) {
  const { gridSize } = useCanvasStore.getState()
  const walls = getFpWallSegments(obj, gridSize)
  // Signed area → winding → outward normal direction
  let signedArea = 0
  for (let i = 0; i < walls.length; i++) {
    const j = (i + 1) % walls.length
    signedArea += walls[i].a.x * walls[j].a.y - walls[j].a.x * walls[i].a.y
  }
  const ws  = signedArea >= 0 ? 1 : -1
  const fs  = 11 / zoom
  const off = 22 / zoom   // distance from wall to dim line
  const lw  = 1  / zoom
  const bg  = '#0a0d16'

  return (
    <g pointerEvents="none">
      {walls.map((seg, i) => {
        const ax = seg.a.x + dx, ay = seg.a.y + dy
        const bx = seg.b.x + dx, by = seg.b.y + dy
        const mx = (ax + bx) / 2, my = (ay + by) / 2
        const isActive = activeWallIdx === i
        const clr = isActive ? '#f0b429' : '#4a9eff'
        // Outward normal
        const edx = bx - ax, edy = by - ay
        const elen = Math.hypot(edx, edy) || 1
        const nx = ws *  edy / elen
        const ny = ws * -edx / elen
        // Dim line — parallel to wall, offset outward
        const d1x = ax + nx*off, d1y = ay + ny*off
        const d2x = bx + nx*off, d2y = by + ny*off
        const dmx = mx + nx*off, dmy = my + ny*off
        // Label — fpVerts are outer face coordinates, seg.lenPx = outer dimension
        const sw    = 0
        const label = pxToFtIn(seg.lenPx + sw, gridSize)
        const tw = label.length * fs * 0.62 + 8/zoom
        const th = fs * 1.5
        return (
          <g key={i}>
            {/* Dim line */}
            <line x1={d1x} y1={d1y} x2={d2x} y2={d2y} stroke={clr} strokeWidth={lw} opacity={0.8}/>
            {/* End caps */}
            <line x1={ax + nx*4/zoom} y1={ay + ny*4/zoom} x2={d1x} y2={d1y} stroke={clr} strokeWidth={lw} opacity={0.5}/>
            <line x1={bx + nx*4/zoom} y1={by + ny*4/zoom} x2={d2x} y2={d2y} stroke={clr} strokeWidth={lw} opacity={0.5}/>
            {/* Arrowheads */}
            <polygon points={`${d1x},${d1y} ${d1x+edx/elen*6/zoom+ny*3/zoom},${d1y+edy/elen*6/zoom-nx*3/zoom} ${d1x+edx/elen*6/zoom-ny*3/zoom},${d1y+edy/elen*6/zoom+nx*3/zoom}`} fill={clr} opacity={0.8}/>
            <polygon points={`${d2x},${d2y} ${d2x-edx/elen*6/zoom+ny*3/zoom},${d2y-edy/elen*6/zoom-nx*3/zoom} ${d2x-edx/elen*6/zoom-ny*3/zoom},${d2y-edy/elen*6/zoom+nx*3/zoom}`} fill={clr} opacity={0.8}/>
            {/* Label pill */}
            <rect x={dmx-tw/2} y={dmy-th/2} width={tw} height={th} fill={bg} rx={2/zoom} opacity={0.92}/>
            <text x={dmx} y={dmy+fs*0.38} textAnchor="middle" fontSize={fs}
              fontFamily="JetBrains Mono,monospace" fill={clr}>{label}</text>
          </g>
        )
      })}
    </g>
  )
}

// ─── Wall hit areas with hover highlight ─────────────────────────────────────
export function FpWallHitAreas({ obj, dx = 0, dy = 0, zoom = 1, activeWallIdx, hoveredWallIdx, onWallMouseDown, onWallHover, selected }) {
  if (!FP_TYPES.has(obj.type)) return null
  const { gridSize } = useCanvasStore.getState()
  const walls = getFpWallSegments(obj, gridSize)
  const hitW = Math.max(18, 24 / zoom)
  const hlW  = Math.max(3, 4 / zoom)

  return (
    <g data-ui-overlay="true">
      {walls.map((seg, i) => {
        const ax = seg.a.x + dx, ay = seg.a.y + dy
        const bx = seg.b.x + dx, by = seg.b.y + dy
        const isActive  = activeWallIdx  === i
        const isHovered = hoveredWallIdx === i
        const cursor = (() => {
          if (!selected) return 'move'   // not selected → show move cursor on walls too
          const ov = getWallDragAxis(obj.type, i)
          if (ov === 'y') return 'ns-resize'
          if (ov === 'x') return 'ew-resize'
          return Math.abs(bx-ax) > Math.abs(by-ay) ? 'ns-resize' : 'ew-resize'
        })()
        return (
          <g key={i}>
            {(isActive || isHovered) && (
              <line x1={ax} y1={ay} x2={bx} y2={by}
                stroke={isActive ? '#f0b429' : '#60a5fa'}
                strokeWidth={isActive ? hlW * 1.5 : hlW}
                strokeLinecap="round"
                opacity={isActive ? 0.95 : 0.7}
                pointerEvents="none"/>
            )}
            <line x1={ax} y1={ay} x2={bx} y2={by}
              stroke="transparent" strokeWidth={hitW}
              strokeLinecap="round"
              style={{ cursor }}
              onMouseEnter={() => onWallHover && onWallHover(i)}
              onMouseLeave={() => onWallHover && onWallHover(null)}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => {
                // Only intercept for wall-drag when the fp is already selected.
                // If not selected, let the event propagate so the main onMouseDown
                // can select the fp and start a move drag.
                if (!selected) return
                e.stopPropagation()
                e.preventDefault()
                onWallMouseDown(e, i)
              }}
            />
          </g>
        )
      })}
    </g>
  )
}



// ─── Shape geometry ──────────────────────────────────────────────────────────
/* ── text selection frame ──────────────────────────────────────────────────
   A single continuous rectangle round the measured text, with square CAD
   nodes at the four corners and the two side centres. Side handles set the
   wrap width; corners scale the font. All sizes divide by zoom so the nodes
   stay a constant screen size — a world-unit handle would balloon on zoom-in.

   Colours follow the app's existing selection treatment rather than a new
   accent, so selection reads the same on every object type.               */
function TextFrame({ obj, bounds, zoom, onHandleMouseDown }) {
  const hs = 4 / zoom                    // half-size => 8px square on screen
  const sw = 1 / zoom
  const { x, y, width: w, height: h } = bounds
  const nodes = [
    ['nw', x,       y      , 'nwse-resize'],
    ['ne', x + w,   y      , 'nesw-resize'],
    ['sw', x,       y + h  , 'nesw-resize'],
    ['se', x + w,   y + h  , 'nwse-resize'],
    ['w',  x,       y + h/2, 'ew-resize'  ],
    ['e',  x + w,   y + h/2, 'ew-resize'  ],
  ]
  return (
    <>
      <rect x={x} y={y} width={w} height={h}
        fill="none" stroke="#4a9eff" strokeWidth={sw} pointerEvents="none"/>
      {nodes.map(([id, cx, cy, cursor]) => (
        <rect key={id} x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2}
          fill="#ffffff" stroke="#4a9eff" strokeWidth={sw * 1.6} rx={sw}
          style={{ cursor }}
          /* stopPropagation keeps the drag off the canvas pan and the text
             editor — the handle owns this gesture */
          onMouseDown={e => { e.stopPropagation(); onHandleMouseDown(e, 'text_' + id) }}/>
      ))}
    </>
  )
}

export function ResizeHandles({ obj, zoom, gridSize = 40, isFp = false, isLineType = false, onHandleMouseDown }) {
  const bounds = getObjectBounds(obj)
  if (obj.type === 'text') return (
    <TextFrame obj={obj} bounds={bounds} zoom={zoom} onHandleMouseDown={onHandleMouseDown}/>
  )
  const pos    = getHandlePositions(bounds)
  const hs     = 6 / zoom
  const sw     = 1 / zoom
  const isArc  = obj.type === 'arc'
  const isAnnotLine = ANNOT_LINE_TYPES.has(obj.type)
  const isAnnotRect = ANNOT_RECT_TYPES.has(obj.type)
  // Annotations that should never show a rotate handle
  const noRotate = isAnnotLine || obj.type === 'annot_scale_bar' || obj.type === 'annot_dimension' || obj.type === 'aisle'
  // All line-types (including dimension) use endpoint circles — bbox model breaks for line geometry
  const useEndpointHandles = obj.type === 'line' || isArc || isAnnotLine
  const isText = obj.type === 'text'

  const arcCtrl = isArc ? (() => {
    const mx  = (obj.x1 + obj.x2) / 2, my = (obj.y1 + obj.y2) / 2
    const ddx = obj.x2 - obj.x1, ddy = obj.y2 - obj.y1
    const len = Math.sqrt(ddx * ddx + ddy * ddy) || 1
    const nx  = -ddy / len, ny = ddx / len
    return { x: mx + nx * len * (obj.bend ?? 0.35), y: my + ny * len * (obj.bend ?? 0.35) }
  })() : null

  const cursorMap = (() => {
    const dirs = ['n','ne','e','se','s','sw','w','nw']
    const steps = Math.round((obj.rotation || 0) / 45) % 8
    const s = (i) => dirs[(i + steps + 8) % 8] + '-resize'
    return { tl:s(7), tc:s(0), tr:s(1), ml:s(6), mr:s(2), bl:s(5), bc:s(4), br:s(3) }
  })()

  if (isFp) return null

  return (
    <g data-ui-overlay="true">
      {/* ── Line-type handles ── */}
      {useEndpointHandles ? (
        <>
          {obj.type === 'annot_dimension' ? (
            <>
              {/* Extension lines + dim line diamonds (visual) + source squares (interactive) */}
              {(() => {
                const sx2 = obj.x1, sy2 = obj.y1, ex = obj.x2, ey = obj.y2
                const edx = ex-sx2, edy = ey-sy2
                const len = Math.hypot(edx,edy)||1
                const nx = -edy/len, ny = edx/len
                const off = gridSize*2
                const d1x = sx2+nx*off, d1y = sy2+ny*off
                const d2x = ex+nx*off,  d2y = ey+ny*off
                return (
                  <g>
                    {/* Square handles at source points */}
                    <rect x={obj.x1-hs} y={obj.y1-hs} width={hs*2} height={hs*2} rx={1/zoom}
                      fill="#0e1420" stroke="#4a9eff" strokeWidth={sw*1.2} style={{cursor:'crosshair'}}
                      onMouseDown={e=>{e.stopPropagation();onHandleMouseDown(e,'ml')}}/>
                    <rect x={obj.x2-hs} y={obj.y2-hs} width={hs*2} height={hs*2} rx={1/zoom}
                      fill="#0e1420" stroke="#4a9eff" strokeWidth={sw*1.2} style={{cursor:'crosshair'}}
                      onMouseDown={e=>{e.stopPropagation();onHandleMouseDown(e,'mr')}}/>
                  </g>
                )
              })()}
            </>
          ) : (
            <>
              {/* All other line types — squares at endpoints */}
              <rect x={obj.x1-hs} y={obj.y1-hs} width={hs*2} height={hs*2} rx={1/zoom}
                fill="#0e1420" stroke="#4a9eff" strokeWidth={sw*1.2}
                style={{cursor:'crosshair'}}
                onMouseDown={e=>{e.stopPropagation();onHandleMouseDown(e,'ml')}}/>
              <rect x={obj.x2-hs} y={obj.y2-hs} width={hs*2} height={hs*2} rx={1/zoom}
                fill="#0e1420" stroke="#4a9eff" strokeWidth={sw*1.2}
                style={{cursor:'crosshair'}}
                onMouseDown={e=>{e.stopPropagation();onHandleMouseDown(e,'mr')}}/>
              {/* Arc bend control — diamond */}
              {isArc && arcCtrl && (
                <polygon
                  points={`${arcCtrl.x},${arcCtrl.y-hs*0.8} ${arcCtrl.x+hs*0.8},${arcCtrl.y} ${arcCtrl.x},${arcCtrl.y+hs*0.8} ${arcCtrl.x-hs*0.8},${arcCtrl.y}`}
                  fill="#f0b429" stroke="#0e1420" strokeWidth={sw}
                  style={{cursor:'ns-resize'}}
                  onMouseDown={e=>{e.stopPropagation();onHandleMouseDown(e,'arcCtrl')}}/>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* ── Rect-type: dotted bounding box — visual only, no pointer events ── */}
          {obj.type !== 'aisle' && <rect
            x={bounds.x - 6} y={bounds.y - 6}
            width={bounds.width + 12} height={bounds.height + 12}
            fill="none"
            stroke="#4a9eff"
            strokeWidth={1.2 / zoom}
            strokeDasharray={`${5 / zoom} ${3 / zoom}`}
            rx={2 / zoom} pointerEvents="none"
            opacity={isAnnotRect ? 0.5 : 1}
          />}
          {/* Corner/edge handles — interactive */}
          {HANDLES.map(h => {
            const hp = pos[h]
            if (!hp) return null
            // Rack rows: disable left/right handles — width is controlled by bay panel only
            if (obj.type === 'aisle') return null
            const BAY_RACK = new Set(['rack_row','rack_double_row','rack_cantilever'])
            if (BAY_RACK.has(obj.type) && h !== 'ml' && h !== 'mr') return null
            // Cantilever: also suppress tc/bc (depth is set by arm length, not drag)
            if (obj.type === 'rack_cantilever' && (h === 'tc' || h === 'bc')) return null
            if (['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(obj.type) && h === 'tc') return null
            return (
              <rect key={h}
                x={hp.x - hs / 2} y={hp.y - hs / 2} width={hs} height={hs}
                fill="#0e1420" stroke="#4a9eff" strokeWidth={sw}
                style={{ cursor: cursorMap[h] || 'crosshair' }}
                onMouseDown={e => { e.stopPropagation(); onHandleMouseDown(e, h) }}
              />
            )
          })}
        </>
      )}
      {/* ── Rotate handle — suppressed for line-types and specific annot types ── */}
      {!isLineType && !noRotate && (() => {
        const rx    = bounds.x + bounds.width / 2
        const ry    = bounds.y - 70 / zoom
        const lineY = bounds.y - 6 / zoom
        return (
          <g>
            <line x1={rx} y1={lineY} x2={rx} y2={ry + 7 / zoom}
              stroke="#f0b429" strokeWidth={1.5 / zoom} opacity={0.8} pointerEvents="none" />
            <circle cx={rx} cy={ry} r={8 / zoom}
              fill="#16181d" stroke="#f0b429" strokeWidth={1.8 / zoom}
              style={{ cursor: 'alias' }}
              onMouseDown={e => { e.stopPropagation(); onHandleMouseDown(e, 'rotate') }}
            />
            <text x={rx} y={ry + 3.5 / zoom} textAnchor="middle"
              fontSize={10 / zoom} fontFamily="sans-serif" fill="#f0b429"
              pointerEvents="none">↻</text>
          </g>
        )
      })()}
    </g>
  )
}

export function GroupOutline({ objs, zoom, groupId, onRotateGroup, moveDelta }) {
  if (!objs.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const dx = moveDelta?.dx || 0
  const dy = moveDelta?.dy || 0
  objs.forEach(obj => {
    const b = getObjectBounds(obj)
    minX = Math.min(minX, b.x + dx); minY = Math.min(minY, b.y + dy)
    maxX = Math.max(maxX, b.x + b.width + dx); maxY = Math.max(maxY, b.y + b.height + dy)
  })
  const pad = 10
  const gcx = (minX + maxX) / 2
  const gcy = (minY + maxY) / 2
  const hx  = gcx
  const hy  = minY - pad - 44 / zoom
  const ly  = minY - pad - 8  / zoom
  const r   = 10 / zoom
  return (
    <g data-ui-overlay="true">
      <rect x={minX-pad-3/zoom} y={minY-pad-3/zoom}
        width={maxX-minX+pad*2+6/zoom} height={maxY-minY+pad*2+6/zoom}
        fill="none" stroke="#c084fc" strokeWidth={5/zoom} opacity={0.2}
        rx={4/zoom} pointerEvents="none" />
      <rect x={minX-pad} y={minY-pad} width={maxX-minX+pad*2} height={maxY-minY+pad*2}
        fill="none" stroke="#c084fc" strokeWidth={2.5/zoom}
        strokeDasharray={`${8/zoom} ${4/zoom}`}
        rx={3/zoom} pointerEvents="none" />
      <line x1={hx} y1={ly} x2={hx} y2={hy + r}
        stroke="#c084fc" strokeWidth={2/zoom} pointerEvents="none" />
      <circle cx={hx} cy={hy} r={r * 2.5}
        fill="transparent" stroke="none" style={{ cursor: 'alias' }}
        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onRotateGroup && onRotateGroup(e, groupId, gcx, gcy) }}
      />
      <circle cx={hx} cy={hy} r={r}
        fill="#1e1230" stroke="#c084fc" strokeWidth={2/zoom}
        pointerEvents="none" />
      <text x={hx} y={hy + 4.5/zoom} textAnchor="middle"
        fontSize={13/zoom} fontFamily="sans-serif" fill="#c084fc" fontWeight="bold"
        pointerEvents="none">↻</text>
    </g>
  )
}


export function ObjectLabel({ obj, dx = 0, dy = 0, revealed = false }) {
  if (!obj.label) return null
  if (FP_TYPES.has(obj.type)) return null
  if (['rack_drive_in','rack_drive_through','rack_pushback'].includes(obj.type)) return null
  /* A rack's name sits right on top of the bay grid that IS its symbol, and on
     a generated layout it repeats on every row. Racks reveal it on hover or
     selection instead; everything else still labels itself, since a lone
     forklift or door has no geometry competing for the same pixels. */
  if (obj.type?.startsWith('rack_') && !revealed) return null
  const b  = getObjectBounds(obj)
  const sz = Math.min(11, Math.max(7, Math.min(b.width, b.height) / 6))
  return (
    <text x={b.x + dx + b.width/2} y={b.y + dy + b.height/2 + sz*0.4}
      textAnchor="middle" fontSize={sz} fontFamily="JetBrains Mono,monospace"
      fill={obj.stroke || '#22c55e'} opacity={0.85} pointerEvents="none"
    >{obj.label}</text>
  )
}

// ─── Rotate handle for fp shapes ─────────────────────────────────────────────
export function FpRotateHandle({ obj, zoom, onHandleMouseDown }) {
  const b   = getObjectBounds(obj)
  const rx  = b.x + b.width / 2
  const ry  = b.y - 56 / zoom
  const ly  = b.y - 6 / zoom
  const r   = 8 / zoom
  const sw  = 1.8 / zoom
  return (
    <g data-ui-overlay="true">
      <line x1={rx} y1={ly} x2={rx} y2={ry + r}
        stroke="#f0b429" strokeWidth={1.2 / zoom} opacity={0.7} pointerEvents="none" />
      <circle cx={rx} cy={ry} r={r}
        fill="#16181d" stroke="#f0b429" strokeWidth={sw}
        style={{ cursor: 'alias' }}
        onMouseDown={e => { e.stopPropagation(); onHandleMouseDown(e, 'rotate') }}
      />
      <text x={rx} y={ry + 3.5 / zoom} textAnchor="middle"
        fontSize={10 / zoom} fontFamily="sans-serif" fill="#f0b429"
        pointerEvents="none">↻</text>
    </g>
  )
}

export function RackLabels({ obj, dx = 0, dy = 0, zoom, gridSize, selected, printMode = false }) {
  const RACK_LABEL_TYPES = new Set(['rack_row','rack_double_row','rack_cantilever','rack_pushback','rack_pallet_flow','rack_drive_in','rack_drive_through'])
  if (!RACK_LABEL_TYPES.has(obj.type)) return null
  if (!selected && !printMode) return null  // show when selected or printing

  const bx = obj.x + dx, by = obj.y + dy, bw = obj.width, bh = obj.height
  const fs  = 11 / zoom  // fixed 11px screen size at any zoom
  const pad = 4 / zoom
  const bg  = '#0a0d16'
  const clr = '#4a9eff'

  const fmtIn = (px) => pxToFtIn(px, gridSize)

  const labels = []

  if (obj.type === 'rack_row') {
    const beams    = obj.beams || [96]
    const upIn     = obj.uprightWidth || 3
    const upW      = (upIn / 12) * gridSize
    // Per-bay beam labels
    let cursor = bx + upW
    beams.forEach((beamIn, i) => {
      const beamPx = (beamIn / 12) * gridSize
      const cx = cursor + beamPx / 2
      const minWidth = fs * 3.5 + pad * 2
      if (beamPx > minWidth) {
        const txt = `${beamIn}"`
        const tw  = txt.length * fs * 0.62 + pad * 2
        labels.push(
          <g key={'b'+i} pointerEvents="none">
            <rect x={cx-tw/2} y={by+bh/2-fs*0.75} width={tw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
            <text x={cx} y={by+bh/2+fs*0.38} textAnchor="middle" fontSize={fs}
              fontFamily="JetBrains Mono,monospace" fill={clr}>{txt}</text>
          </g>
        )
      }
      cursor += beamPx + upW
    })
    // Total length below
    const totalPx = bw
    const totTxt  = fmtIn(totalPx)
    const totTw   = totTxt.length * fs * 0.62 + pad * 2
    const totY    = by + bh + 14/zoom
    labels.push(
      <g key="total" pointerEvents="none">
        <line x1={bx} y1={by+bh+4/zoom} x2={bx+bw} y2={by+bh+4/zoom} stroke={clr} strokeWidth={0.5/zoom} opacity={0.5}/>
        <rect x={bx+bw/2-totTw/2} y={totY-fs*0.75} width={totTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+bw/2} y={totY+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{totTxt}</text>
      </g>
    )
    // Depth on right side
    const depTxt = fmtIn(bh)
    const depTw  = depTxt.length * fs * 0.62 + pad * 2
    labels.push(
      <g key="depth" pointerEvents="none">
        <rect x={bx+bw+6/zoom} y={by+bh/2-fs*0.75} width={depTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+bw+6/zoom+depTw/2} y={by+bh/2+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{depTxt}</text>
      </g>
    )
  }

  if (obj.type === 'rack_double_row') {
    const beams   = obj.beams || [96]
    const upIn    = obj.uprightWidth || 3
    const upW     = (upIn / 12) * gridSize
    const flueH   = ((obj.flueSpaceIn || 6) / 12) * gridSize
    const rowH    = (bh - flueH) / 2
    // Per-bay labels — both rows
    let cursor = bx + upW
    beams.forEach((beamIn, i) => {
      const beamPx = (beamIn / 12) * gridSize
      const cx     = cursor + beamPx / 2
      const minW   = fs * 3.5 + pad * 2
      if (beamPx > minW) {
        const txt = `${beamIn}"`
        const tw  = txt.length * fs * 0.62 + pad * 2
        // Front row label
        labels.push(
          <g key={'b'+i} pointerEvents="none">
            <rect x={cx-tw/2} y={by+rowH/2-fs*0.75} width={tw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
            <text x={cx} y={by+rowH/2+fs*0.38} textAnchor="middle" fontSize={fs}
              fontFamily="JetBrains Mono,monospace" fill={clr}>{txt}</text>
          </g>
        )
        // Back row label
        const backY = by + rowH + flueH + rowH/2
        labels.push(
          <g key={'bb'+i} pointerEvents="none">
            <rect x={cx-tw/2} y={backY-fs*0.75} width={tw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
            <text x={cx} y={backY+fs*0.38} textAnchor="middle" fontSize={fs}
              fontFamily="JetBrains Mono,monospace" fill={clr}>{txt}</text>
          </g>
        )
      }
      cursor += beamPx + upW
    })
    // Total length below
    const totTxt = fmtIn(bw)
    const totTw  = totTxt.length * fs * 0.62 + pad * 2
    const totY   = by + bh + 14/zoom
    labels.push(
      <g key="total" pointerEvents="none">
        <line x1={bx} y1={by+bh+4/zoom} x2={bx+bw} y2={by+bh+4/zoom} stroke={clr} strokeWidth={0.5/zoom} opacity={0.5}/>
        <rect x={bx+bw/2-totTw/2} y={totY-fs*0.75} width={totTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+bw/2} y={totY+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{totTxt}</text>
      </g>
    )
    // Front depth — LEFT side
    const frontTxt = fmtIn(rowH)
    const frontTw  = frontTxt.length * fs * 0.62 + pad * 2
    labels.push(
      <g key="front" pointerEvents="none">
        <rect x={bx-frontTw-6/zoom} y={by+rowH/2-fs*0.75} width={frontTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx-6/zoom-frontTw/2} y={by+rowH/2+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{frontTxt}</text>
      </g>
    )
    // Back depth — RIGHT side
    const backTxt = fmtIn(rowH)
    const backTw  = backTxt.length * fs * 0.62 + pad * 2
    const backRowMidY = by + rowH + flueH + rowH/2
    labels.push(
      <g key="back" pointerEvents="none">
        <rect x={bx+bw+6/zoom} y={backRowMidY-fs*0.75} width={backTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+bw+6/zoom+backTw/2} y={backRowMidY+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{backTxt}</text>
      </g>
    )
    // Flue label in gap
    const flueTxt = `${obj.flueSpaceIn||6}" flue`
    const flueTw  = flueTxt.length * fs * 0.62 + pad * 2
    const flueY   = by + rowH + flueH/2
    if (flueH > fs * 2) {
      labels.push(
        <g key="flue" pointerEvents="none">
          <rect x={bx+bw/2-flueTw/2} y={flueY-fs*0.75} width={flueTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
          <text x={bx+bw/2} y={flueY+fs*0.38} textAnchor="middle" fontSize={fs}
            fontFamily="JetBrains Mono,monospace" fill="#888">{flueTxt}</text>
        </g>
      )
    }
  }

  if (obj.type === 'rack_cantilever') {
    const towers  = obj.towers || [36]
    const armIn   = towers[0] || 36
    const armTxt  = `${armIn}" arm`
    const armTw   = armTxt.length * fs * 0.62 + pad * 2
    // Arm label on right side
    labels.push(
      <g key="arm" pointerEvents="none">
        <rect x={bx+bw+6/zoom} y={by+bh/2-fs*0.75} width={armTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+bw+6/zoom+armTw/2} y={by+bh/2+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{armTxt}</text>
      </g>
    )
    // Tower spacing label (once, near first gap)
    const spTxt = '48" spacing'
    const spTw  = spTxt.length * fs * 0.62 + pad * 2
    const tSpPx = (48/12) * gridSize
    if (tSpPx > spTw && bw > tSpPx) {
      labels.push(
        <g key="spacing" pointerEvents="none">
          <rect x={bx+tSpPx/2-spTw/2} y={by-14/zoom-fs*0.75} width={spTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
          <text x={bx+tSpPx/2} y={by-14/zoom+fs*0.38} textAnchor="middle" fontSize={fs}
            fontFamily="JetBrains Mono,monospace" fill={clr}>{spTxt}</text>
        </g>
      )
    }
    // Total length below
    const totTxt = fmtIn(bw)
    const totTw  = totTxt.length * fs * 0.62 + pad * 2
    const totY   = by + bh + 14/zoom
    labels.push(
      <g key="total" pointerEvents="none">
        <line x1={bx} y1={by+bh+4/zoom} x2={bx+bw} y2={by+bh+4/zoom} stroke={clr} strokeWidth={0.5/zoom} opacity={0.5}/>
        <rect x={bx+bw/2-totTw/2} y={totY-fs*0.75} width={totTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+bw/2} y={totY+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{totTxt}</text>
      </g>
    )
  }

  // ── Lane-based racks: drive-in, drive-through, pushback ──────────────────
  if (['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(obj.type)) {
    const lanes      = obj.lanes      || 2
    const palletDeep = obj.palletDeep || 5
    const upIn       = obj.uprightWidth || 4
    const upW        = (upIn/12)*gridSize
    const ledgePx    = (2/12)*gridSize
    const clearPx    = (1/12)*gridSize
    const palletWPx  = ((obj.palletWIn||40)/12)*gridSize
    const laneWPx    = ledgePx*2 + clearPx*2 + palletWPx
    const derivedW   = (lanes+1)*upW + lanes*laneWPx

    // Width label below
    const wTxt = fmtIn(derivedW)
    const wTw  = wTxt.length * fs * 0.62 + pad * 2
    const wY   = by + bh + 14/zoom
    labels.push(
      <g key="width" pointerEvents="none">
        <line x1={bx} y1={by+bh+4/zoom} x2={bx+derivedW} y2={by+bh+4/zoom} stroke={clr} strokeWidth={0.5/zoom} opacity={0.5}/>
        <rect x={bx+derivedW/2-wTw/2} y={wY-fs*0.75} width={wTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+derivedW/2} y={wY+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{wTxt}</text>
      </g>
    )
    // Depth label right
    const dTxt = fmtIn(bh)
    const dTw  = dTxt.length * fs * 0.62 + pad * 2
    labels.push(
      <g key="depth" pointerEvents="none">
        <rect x={bx+derivedW+6/zoom} y={by+bh/2-fs*0.75} width={dTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+derivedW+6/zoom+dTw/2} y={by+bh/2+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{dTxt}</text>
      </g>
    )
    // Lane × deep + pallet count at top
    const cap  = lanes * palletDeep
    const lTxt = `${lanes}L × ${palletDeep}D · ${cap} PAL`
    const lTw  = lTxt.length * fs * 0.62 + pad * 2
    labels.push(
      <g key="lanes" pointerEvents="none">
        <rect x={bx+derivedW/2-lTw/2} y={by-14/zoom-fs*0.75} width={lTw} height={fs*1.5} fill={bg} opacity={0.85} rx={2/zoom}/>
        <text x={bx+derivedW/2} y={by-14/zoom+fs*0.38} textAnchor="middle" fontSize={fs}
          fontFamily="JetBrains Mono,monospace" fill={clr}>{lTxt}</text>
      </g>
    )
  }

  return <g pointerEvents="none">{labels}</g>
}

// ── Aisle Label ───────────────────────────────────────────────────────────────
// Always visible. Computes gap between two rack rows live.
export function AisleLabel({ aisle, objects, zoom, gridSize, moveDelta, selectedIds }) {
  const row1 = objects.find(o => o.id === aisle.row1Id)
  const row2 = objects.find(o => o.id === aisle.row2Id)
  if (!row1 || !row2) return null

  const isSelected1 = selectedIds.includes(aisle.row1Id)
  const isSelected2 = selectedIds.includes(aisle.row2Id)

  // Apply moveDelta to rows being dragged
  const dx1 = (moveDelta && isSelected1) ? moveDelta.dx : 0
  const dy1 = (moveDelta && isSelected1) ? moveDelta.dy : 0
  const dx2 = (moveDelta && isSelected2) ? moveDelta.dx : 0
  const dy2 = (moveDelta && isSelected2) ? moveDelta.dy : 0

  const b1 = getObjectBounds(row1)
  const b2 = getObjectBounds(row2)
  const r1 = { x: b1.x+dx1, y: b1.y+dy1, r: b1.x+b1.width+dx1,  b: b1.y+b1.height+dy1 }
  const r2 = { x: b2.x+dx2, y: b2.y+dy2, r: b2.x+b2.width+dx2,  b: b2.y+b2.height+dy2 }

  // Determine aisle axis — which direction is the gap?
  // Horizontal aisle: rows are above/below each other (Y gap)
  // Vertical aisle: rows are left/right (X gap)
  const yGap = Math.max(r2.x - r1.r, r1.x - r2.r)
  const xGap = Math.max(r2.y - r1.b, r1.y - r2.b)
  const isHoriz = xGap >= yGap  // gap is in Y direction = horizontal aisle

  let aisleWidth, aisleStartPx, aisleEndPx, labelX, labelY

  if (isHoriz) {
    // Aisle runs horizontally — gap between row bottom and next row top
    const topRow    = r1.b < r2.y ? r1 : r2
    const bottomRow = r1.b < r2.y ? r2 : r1
    aisleWidth   = bottomRow.y - topRow.b
    labelY       = topRow.b + aisleWidth / 2
    aisleStartPx = Math.max(topRow.x, bottomRow.x)
    aisleEndPx   = Math.min(topRow.r, bottomRow.r)
  } else {
    // Aisle runs vertically — gap between row right and next row left
    const leftRow  = r1.r < r2.x ? r1 : r2
    const rightRow = r1.r < r2.x ? r2 : r1
    aisleWidth   = rightRow.x - leftRow.r
    labelX       = leftRow.r + aisleWidth / 2
    aisleStartPx = Math.max(leftRow.y, rightRow.y)
    aisleEndPx   = Math.min(leftRow.b, rightRow.b)
  }

  if (aisleWidth <= 0) return null

  const aisleLength = aisleEndPx - aisleStartPx
  if (aisleLength <= 0) return null

  const widthTxt  = pxToFtIn(aisleWidth, gridSize)
  const userLabel = aisle.label ? `${aisle.label} · ` : ''
  const fullTxt   = `${userLabel}${widthTxt}`
  const fs        = Math.max(8, 11 / zoom)
  const pad       = 5 / zoom
  const tw        = fullTxt.length * fs * 0.62 + pad * 2
  const th        = fs * 1.6
  const bg        = '#f0b42922'
  const clr       = '#f0b429'
  const border    = '#f0b42966'

  // Determine label count based on aisle length
  let labelPositions = []
  if (aisleLength < 20 * gridSize) {
    // Short — 1 label center
    labelPositions = [aisleStartPx + aisleLength / 2]
  } else if (aisleLength < 60 * gridSize) {
    // Medium — 2 labels at 25% and 75%
    labelPositions = [
      aisleStartPx + aisleLength * 0.25,
      aisleStartPx + aisleLength * 0.75,
    ]
  } else {
    // Long — 3 labels at start, center, end
    labelPositions = [
      aisleStartPx + aisleLength * 0.15,
      aisleStartPx + aisleLength * 0.5,
      aisleStartPx + aisleLength * 0.85,
    ]
  }

  // Arrow size
  const aw = 5 / zoom  // arrowhead size

  return (
    <g pointerEvents="none">
      {/* Dimension arrows spanning full aisle width */}
      {labelPositions.map((pos, i) => {
        const lx = isHoriz ? pos    : labelX
        const ly = isHoriz ? labelY : pos

        if (isHoriz) {
          // Horizontal aisle — vertical arrows showing gap height
          const topRow    = r1.b < r2.y ? r1 : r2
          const bottomRow = r1.b < r2.y ? r2 : r1
          const arrowX    = lx
          const y1 = topRow.b, y2 = bottomRow.y
          return (
            <g key={i}>
              {/* Vertical arrow line */}
              <line x1={arrowX} y1={y1} x2={arrowX} y2={y2}
                stroke={clr} strokeWidth={0.8/zoom} opacity={0.6}/>
              {/* Top arrowhead */}
              <polygon points={`${arrowX},${y1} ${arrowX-aw/2},${y1+aw} ${arrowX+aw/2},${y1+aw}`}
                fill={clr} opacity={0.8}/>
              {/* Bottom arrowhead */}
              <polygon points={`${arrowX},${y2} ${arrowX-aw/2},${y2-aw} ${arrowX+aw/2},${y2-aw}`}
                fill={clr} opacity={0.8}/>
              {/* Label pill */}
              <rect x={lx-tw/2} y={ly-th/2} width={tw} height={th}
                fill={bg} stroke={border} strokeWidth={0.8/zoom} rx={3/zoom} opacity={0.95}/>
              <text x={lx} y={ly+fs*0.38} textAnchor="middle" fontSize={fs}
                fontFamily="JetBrains Mono,monospace" fill={clr}>{fullTxt}</text>
            </g>
          )
        } else {
          // Vertical aisle — horizontal arrows showing gap width
          const leftRow  = r1.r < r2.x ? r1 : r2
          const rightRow = r1.r < r2.x ? r2 : r1
          const arrowY   = ly
          const x1 = leftRow.r, x2 = rightRow.x
          return (
            <g key={i}>
              {/* Horizontal arrow line */}
              <line x1={x1} y1={arrowY} x2={x2} y2={arrowY}
                stroke={clr} strokeWidth={0.8/zoom} opacity={0.6}/>
              {/* Left arrowhead */}
              <polygon points={`${x1},${arrowY} ${x1+aw},${arrowY-aw/2} ${x1+aw},${arrowY+aw/2}`}
                fill={clr} opacity={0.8}/>
              {/* Right arrowhead */}
              <polygon points={`${x2},${arrowY} ${x2-aw},${arrowY-aw/2} ${x2-aw},${arrowY+aw/2}`}
                fill={clr} opacity={0.8}/>
              {/* Label pill */}
              <rect x={lx-tw/2} y={ly-th/2} width={tw} height={th}
                fill={bg} stroke={border} strokeWidth={0.8/zoom} rx={3/zoom} opacity={0.95}/>
              <text x={lx} y={ly+fs*0.38} textAnchor="middle" fontSize={fs}
                fontFamily="JetBrains Mono,monospace" fill={clr}>{fullTxt}</text>
            </g>
          )
        }
      })}
    </g>
  )
}