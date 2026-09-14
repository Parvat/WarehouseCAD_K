import { useRef, useCallback, useEffect } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { pxToFtIn } from '../../utils/canvas'

function DimLine({ x1, y1, x2, y2, text, horiz, offset = 28 }) {
  if (horiz) {
    const ty = y1 - offset, mx = (x1 + x2) / 2, tw = text.length * 5.5 + 10
    return (
      <g pointerEvents="none">
        <line x1={x1} y1={y1-3} x2={x1} y2={ty+3} stroke="#4a9eff" strokeWidth={0.6} strokeDasharray="3 2" opacity={0.5} />
        <line x1={x2} y1={y1-3} x2={x2} y2={ty+3} stroke="#4a9eff" strokeWidth={0.6} strokeDasharray="3 2" opacity={0.5} />
        <line x1={x1} y1={ty} x2={x2} y2={ty} stroke="#4a9eff" strokeWidth={1} />
        <polygon points={`${x1},${ty} ${x1+7},${ty-2.5} ${x1+7},${ty+2.5}`} fill="#4a9eff" />
        <polygon points={`${x2},${ty} ${x2-7},${ty-2.5} ${x2-7},${ty+2.5}`} fill="#4a9eff" />
        <rect x={mx-tw/2} y={ty-8} width={tw} height={13} fill="#0c0e14" rx={2} />
        <text x={mx} y={ty+3} textAnchor="middle" fontSize={9} fontFamily="JetBrains Mono,monospace" fill="#4a9eff">{text}</text>
      </g>
    )
  } else {
    const tx = x1 - offset, my = (y1 + y2) / 2, tw = text.length * 5.5 + 10
    return (
      <g pointerEvents="none">
        <line x1={x1-3} y1={y1} x2={tx+3} y2={y1} stroke="#4a9eff" strokeWidth={0.6} strokeDasharray="3 2" opacity={0.5} />
        <line x1={x1-3} y1={y2} x2={tx+3} y2={y2} stroke="#4a9eff" strokeWidth={0.6} strokeDasharray="3 2" opacity={0.5} />
        <line x1={tx} y1={y1} x2={tx} y2={y2} stroke="#4a9eff" strokeWidth={1} />
        <polygon points={`${tx},${y1} ${tx-2.5},${y1+7} ${tx+2.5},${y1+7}`} fill="#4a9eff" />
        <polygon points={`${tx},${y2} ${tx-2.5},${y2-7} ${tx+2.5},${y2-7}`} fill="#4a9eff" />
        <rect x={tx-tw-2} y={my-7} width={tw} height={13} fill="#0c0e14" rx={2} />
        <text x={tx-5} y={my+4} textAnchor="end" fontSize={9} fontFamily="JetBrains Mono,monospace" fill="#4a9eff">{text}</text>
      </g>
    )
  }
}

function ColumnGrid({ x, y, w, h, gridSize, colFt = 20 }) {
  const colPx = colFt * gridSize
  const marks = []
  for (let cx = colPx; cx < w; cx += colPx)
    for (let cy = colPx; cy < h; cy += colPx) marks.push([cx, cy])
  return (
    <g opacity={0.18} pointerEvents="none">
      {marks.map(([cx, cy], i) => (
        <g key={i}>
          <line x1={x+cx-5} y1={y+cy} x2={x+cx+5} y2={y+cy} stroke="#4a9eff" strokeWidth={1} />
          <line x1={x+cx} y1={y+cy-5} x2={x+cx} y2={y+cy+5} stroke="#4a9eff" strokeWidth={1} />
          <circle cx={x+cx} cy={y+cy} r={3} fill="none" stroke="#4a9eff" strokeWidth={1} />
        </g>
      ))}
    </g>
  )
}

// Convert screen coords to world coords — reads fresh store state
function screenToWorld(clientX, clientY) {
  const el = document.getElementById('canvas-svg')
  if (!el) return { x: clientX, y: clientY }
  const r = el.getBoundingClientRect()
  const s = useCanvasStore.getState()
  return {
    x: (clientX - r.left - s.panX) / s.zoom,
    y: (clientY - r.top  - s.panY) / s.zoom,
  }
}

export function FloorPlan({ zoom }) {
  const { floorPlan, gridSize } = useCanvasStore()
  const { enabled, x, y, widthFt, heightFt, label, rotation = 0, wallThicknessFt = 0.5 } = floorPlan
  const dragRef = useRef(null)

  // Stable mouse handlers — attached once via useEffect, never stacked
  const handleMouseMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const w  = screenToWorld(e.clientX, e.clientY)
    const s  = useCanvasStore.getState()
    const GS = s.gridSize

    if (d.mode === 'move') {
      const newX = Math.round((d.ox + w.x - d.sx) / GS) * GS
      const newY = Math.round((d.oy + w.y - d.sy) / GS) * GS
      const moveDx = newX - s.floorPlan.x
      const moveDy = newY - s.floorPlan.y
      if (Math.abs(moveDx) > 0.01 || Math.abs(moveDy) > 0.01) {
        s.setFloorPlan({ x: newX, y: newY })
        s.moveAllObjects(moveDx, moveDy)
      }

    } else if (d.mode === 'resize') {
      const { corner, sx, sy, ox, oy, ow, oh } = d
      const dx = w.x - sx, dy = w.y - sy
      let nx = ox, ny = oy, nw = ow, nh = oh

      if (corner.includes('e')) {
        nw = Math.max(GS, Math.round((ow + dx) / GS) * GS)
      }
      if (corner.includes('w')) {
        const nw2 = Math.max(GS, Math.round((ow - dx) / GS) * GS)
        nx = ox + (ow - nw2)
        // When pulling W edge, floor plan origin shifts → move all objects by same delta
        const shiftX = nx - s.floorPlan.x
        if (Math.abs(shiftX) > 0.01) s.moveAllObjects(shiftX, 0)
        nw = nw2
      }
      if (corner.includes('s')) {
        nh = Math.max(GS, Math.round((oh + dy) / GS) * GS)
      }
      if (corner.includes('n')) {
        const nh2 = Math.max(GS, Math.round((oh - dy) / GS) * GS)
        ny = oy + (oh - nh2)
        const shiftY = ny - s.floorPlan.y
        if (Math.abs(shiftY) > 0.01) s.moveAllObjects(0, shiftY)
        nh = nh2
      }
      s.setFloorPlan({ x: nx, y: ny, widthFt: nw / GS, heightFt: nh / GS })

    } else if (d.mode === 'rotate') {
      const angle = Math.atan2(w.y - d.cy, w.x - d.cx) * 180 / Math.PI + 90
      s.setFloorPlan({ rotation: Math.round(angle / 15) * 15 })
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    const s = useCanvasStore.getState()
    if (dragRef.current?.mode === 'move') {
      s.moveAllObjects(0, 0) // push history on drop
    }
    dragRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup',   handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup',   handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const startDrag = useCallback((e, mode, extra) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const w  = screenToWorld(e.clientX, e.clientY)
    const s  = useCanvasStore.getState()
    const fp = s.floorPlan
    const GS = s.gridSize
    const W  = fp.widthFt * GS, H = fp.heightFt * GS
    if (mode === 'move') {
      dragRef.current = { mode, sx: w.x, sy: w.y, ox: fp.x, oy: fp.y }
    } else if (mode === 'resize') {
      dragRef.current = { mode, corner: extra, sx: w.x, sy: w.y, ox: fp.x, oy: fp.y, ow: W, oh: H }
    } else if (mode === 'rotate') {
      dragRef.current = { mode, cx: fp.x + W/2, cy: fp.y + H/2 }
    }
  }, [])

  if (!enabled) return null

  const W   = widthFt * gridSize
  const H   = heightFt * gridSize
  const cx  = x + W / 2
  const cy  = y + H / 2
  const HS  = 9 / zoom
  const wallPx = Math.max(2, wallThicknessFt * gridSize * 0.35)

  const handles = [
    { id:'nw', hx:x,     hy:y,     cur:'nw-resize' },
    { id:'ne', hx:x+W,   hy:y,     cur:'ne-resize' },
    { id:'se', hx:x+W,   hy:y+H,   cur:'se-resize' },
    { id:'sw', hx:x,     hy:y+H,   cur:'sw-resize' },
    { id:'n',  hx:x+W/2, hy:y,     cur:'n-resize'  },
    { id:'s',  hx:x+W/2, hy:y+H,   cur:'s-resize'  },
    { id:'e',  hx:x+W,   hy:y+H/2, cur:'e-resize'  },
    { id:'w',  hx:x,     hy:y+H/2, cur:'w-resize'  },
  ]

  return (
    <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
      {/* Floor body — ENTIRE area is drag handle */}
      <rect x={x} y={y} width={W} height={H}
        fill="rgba(14,20,30,0.88)" rx={2}
        style={{ cursor: 'move' }}
        onMouseDown={e => startDrag(e, 'move')}
      />
      {/* Walls outline — no pointer events so body click goes through */}
      <rect x={x} y={y} width={W} height={H}
        fill="none" stroke="#2e3545" strokeWidth={wallPx} rx={2}
        pointerEvents="none"
      />
      {/* Column grid */}
      <ColumnGrid x={x} y={y} w={W} h={H} gridSize={gridSize} />
      {/* Dimension lines */}
      <DimLine x1={x} y1={y} x2={x+W} y2={y}  text={pxToFtIn(W, gridSize)} horiz={true}  offset={32} />
      <DimLine x1={x} y1={y} x2={x}   y2={y+H} text={pxToFtIn(H, gridSize)} horiz={false} offset={40} />
      {/* Floor label */}
      <text x={cx} y={y+H-12} textAnchor="middle"
        fontSize={Math.min(20, Math.max(9, W/18))} fontFamily="Syne,sans-serif"
        fill="#1e2535" fontWeight={800} letterSpacing={2} pointerEvents="none">
        {label}
      </text>
      {/* Corner ticks */}
      {[[x,y],[x+W,y],[x,y+H],[x+W,y+H]].map(([px,py],i) => (
        <g key={i} pointerEvents="none">
          <line x1={px-5/zoom} y1={py} x2={px+5/zoom} y2={py} stroke="#4a9eff" strokeWidth={1.2/zoom} opacity={0.4} />
          <line x1={px} y1={py-5/zoom} x2={px} y2={py+5/zoom} stroke="#4a9eff" strokeWidth={1.2/zoom} opacity={0.4} />
        </g>
      ))}
      {/* Resize handles — rendered on top, intercept before body drag */}
      {handles.map(h => (
        <rect key={h.id}
          x={h.hx - HS/2} y={h.hy - HS/2} width={HS} height={HS}
          fill="#0e1420" stroke="#4a9eff" strokeWidth={1.5/zoom} rx={1}
          style={{ cursor: h.cur }}
          onMouseDown={e => startDrag(e, 'resize', h.id)}
        />
      ))}
      {/* Rotate handle — above top edge */}
      <line x1={cx} y1={y} x2={cx} y2={y-30/zoom}
        stroke="#f0b429" strokeWidth={1.2/zoom} opacity={0.7} pointerEvents="none" />
      <circle cx={cx} cy={y-30/zoom} r={7/zoom}
        fill="#0e1420" stroke="#f0b429" strokeWidth={1.5/zoom}
        style={{ cursor: 'alias' }}
        onMouseDown={e => startDrag(e, 'rotate')}
      />
      <text x={cx} y={y - 30/zoom + 3/zoom} textAnchor="middle"
        fontSize={8/zoom} fontFamily="sans-serif" fill="#f0b429" pointerEvents="none">↻</text>
    </g>
  )
}

export function FloorPlanPanel() {
  const { floorPlan, setFloorPlan, toggleFloorPlan } = useCanvasStore()
  const { enabled, widthFt, heightFt, label, wallThicknessFt = 0.5, rotation = 0 } = floorPlan
  return (
    <div className="p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#e8eaf0] font-medium">Background Overlay</span>
        <button onClick={toggleFloorPlan}
          className={`relative w-9 h-5 rounded-full transition-all shrink-0 ${enabled ? 'bg-[#f0b429]' : 'bg-[#2a2d36]'}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
      {!enabled && (
        <p className="text-[9px] font-mono text-[#555a6a] leading-relaxed">
          Use the <span className="text-[#4a9eff]">Floor Plan Rooms</span> tools in the left panel to draw room shapes. Enable this overlay to add a background grid &amp; dimension lines.
        </p>
      )}
      {enabled && (<>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#555a6a] font-mono w-12 shrink-0">Name</span>
          <input type="text" value={label} onChange={e => setFloorPlan({ label: e.target.value })}
            className="flex-1 bg-[#252830] border border-[#2a2d36] rounded text-[11px] text-[#e8eaf0] font-mono px-2 py-0.5 focus:outline-none focus:border-[#f0b429]/50" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#555a6a] font-mono w-12 shrink-0">Width</span>
          <input type="number" min={10} max={2000} value={widthFt} onChange={e => setFloorPlan({ widthFt: Number(e.target.value) })}
            className="flex-1 bg-[#252830] border border-[#2a2d36] rounded text-[11px] text-[#e8eaf0] font-mono px-2 py-0.5 focus:outline-none focus:border-[#f0b429]/50" />
          <span className="text-[10px] text-[#555a6a] font-mono">ft</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#555a6a] font-mono w-12 shrink-0">Depth</span>
          <input type="number" min={10} max={2000} value={heightFt} onChange={e => setFloorPlan({ heightFt: Number(e.target.value) })}
            className="flex-1 bg-[#252830] border border-[#2a2d36] rounded text-[11px] text-[#e8eaf0] font-mono px-2 py-0.5 focus:outline-none focus:border-[#f0b429]/50" />
          <span className="text-[10px] text-[#555a6a] font-mono">ft</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#555a6a] font-mono">Wall Thickness</span>
            <span className="text-[10px] text-[#e8eaf0] font-mono">{(wallThicknessFt*12).toFixed(0)}"</span>
          </div>
          <input type="range" min={0.25} max={2} step={0.25} value={wallThicknessFt}
            onChange={e => setFloorPlan({ wallThicknessFt: Number(e.target.value) })}
            className="accent-[#4a9eff] h-1 w-full" />
          <div className="flex gap-1">
            {[0.25,0.5,0.75,1].map(v => (
              <button key={v} onClick={() => setFloorPlan({ wallThicknessFt: v })}
                className={`flex-1 text-[8px] font-mono py-0.5 rounded border transition-colors ${wallThicknessFt===v?'border-[#4a9eff] text-[#4a9eff] bg-[#4a9eff]/10':'border-[#2a2d36] text-[#555a6a] hover:text-[#8b90a0]'}`}>
                {v*12}"
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#555a6a] font-mono w-12 shrink-0">Rotation</span>
          <input type="range" min={-180} max={180} step={15} value={rotation}
            onChange={e => setFloorPlan({ rotation: Number(e.target.value) })}
            className="flex-1 accent-[#f0b429] h-1" />
          <span className="text-[10px] text-[#e8eaf0] font-mono w-8 text-right">{rotation}°</span>
        </div>
        <div className="flex gap-1">
          {[0,90,180,-90].map(r => (
            <button key={r} onClick={() => setFloorPlan({ rotation: r })}
              className={`flex-1 text-[8px] font-mono py-0.5 rounded border transition-colors ${rotation===r?'border-[#f0b429] text-[#f0b429] bg-[#f0b429]/10':'border-[#2a2d36] text-[#555a6a] hover:text-[#8b90a0]'}`}>
              {r}°
            </button>
          ))}
        </div>
        <div className="pt-1 border-t border-[#2a2d36]">
          <span className="text-[9px] text-[#555a6a] font-mono block mb-1">Presets</span>
          <div className="grid grid-cols-2 gap-1">
            {[['50×40',50,40],['80×60',80,60],['150×80',150,80],['250×120',250,120]].map(([lbl,w,h]) => (
              <button key={lbl} onClick={() => setFloorPlan({ widthFt:w, heightFt:h })}
                className="text-[9px] font-mono px-2 py-1 rounded border border-[#2a2d36] text-[#8b90a0] hover:border-[#f0b429]/40 hover:text-[#e8eaf0] transition-all">
                {lbl} ft
              </button>
            ))}
          </div>
        </div>
        <div className="text-[9px] font-mono text-[#555a6a] border-t border-[#2a2d36] pt-1">
          Area: <span className="text-[#e8eaf0]">{(widthFt*heightFt).toLocaleString()} sq ft</span>
        </div>
        <p className="text-[9px] font-mono text-[#4a9eff] opacity-60">
          Drag floor to move · Edge handles to resize · ↻ to rotate
        </p>
      </>)}
    </div>
  )
}
