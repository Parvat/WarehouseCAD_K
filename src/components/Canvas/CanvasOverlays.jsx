// CanvasOverlays.jsx
// Sibling to CanvasObjects — renders all overlay annotations:
//   - Aisle labels (always visible)
//   - Future: zone labels, north arrow, scale bar overlays
//
// Rendered inside the same SVG transform group as CanvasObjects in CanvasArea.
// Uses getEffectiveDelta so overlays track correctly during FP drag.

import { useCanvasStore } from '../../store/useCanvasStore'
import { getObjectBounds, pxToFtIn, getEffectiveDelta } from '../../utils/canvas'

// ── Aisle Label ───────────────────────────────────────────────────────────────
function AisleLabel({ aisle, objects, selectedIds, moveDelta, zoom, gridSize }) {
  const row1 = objects.find(o => o.id === aisle.row1Id)
  const row2 = objects.find(o => o.id === aisle.row2Id)
  if (!row1 || !row2) return null

  // Use getEffectiveDelta so aisle tracks correctly when FP or rows are dragged
  const d1 = getEffectiveDelta(row1, objects, selectedIds, moveDelta)
  const d2 = getEffectiveDelta(row2, objects, selectedIds, moveDelta)

  const b1 = getObjectBounds(row1)
  const b2 = getObjectBounds(row2)
  const r1 = { x: b1.x+d1.dx, y: b1.y+d1.dy, r: b1.x+b1.width+d1.dx,  b: b1.y+b1.height+d1.dy }
  const r2 = { x: b2.x+d2.dx, y: b2.y+d2.dy, r: b2.x+b2.width+d2.dx,  b: b2.y+b2.height+d2.dy }

  // Determine aisle orientation — which axis has the gap
  const yGap = Math.max(r2.x - r1.r,  r1.x - r2.r)
  const xGap = Math.max(r2.y - r1.b,  r1.y - r2.b)
  const isHoriz = xGap >= yGap  // gap is in Y → aisle runs horizontally

  let aisleWidth, aisleStart, aisleEnd
  let topRow, bottomRow, leftRow, rightRow

  if (isHoriz) {
    topRow    = r1.b < r2.y ? r1 : r2
    bottomRow = r1.b < r2.y ? r2 : r1
    aisleWidth = bottomRow.y - topRow.b
    aisleStart = Math.max(topRow.x, bottomRow.x)
    aisleEnd   = Math.min(topRow.r, bottomRow.r)
  } else {
    leftRow   = r1.r < r2.x ? r1 : r2
    rightRow  = r1.r < r2.x ? r2 : r1
    aisleWidth = rightRow.x - leftRow.r
    aisleStart = Math.max(leftRow.y, rightRow.y)
    aisleEnd   = Math.min(leftRow.b, rightRow.b)
  }

  if (aisleWidth <= 0 || aisleEnd <= aisleStart) return null

  const aisleLen = aisleEnd - aisleStart

  // Label text
  const widthTxt  = pxToFtIn(aisleWidth, gridSize)
  const userLabel = aisle.label ? `${aisle.label} · ` : ''
  const fullTxt   = `${userLabel}${widthTxt}`

  // Fixed screen-pixel sizes (divide by zoom since we're inside scale(zoom) transform)
const fs  = 13 / zoom
const pad = 6  / zoom
const tw  = fullTxt.length * fs * 0.62 + pad * 2
const th  = fs * 2
const aw  = 6  / zoom
const sw  = 1.5 / zoom
const bg  = '#1e2433'
const clr = '#f0b429'
const bdr = '#fbbf24'
const textClr = '#e2e8f0'

  // Label count based on aisle length
  let positions = []
  if (aisleLen < 20 * gridSize) {
    positions = [aisleStart + aisleLen * 0.5]
  } else if (aisleLen < 60 * gridSize) {
    positions = [aisleStart + aisleLen * 0.25, aisleStart + aisleLen * 0.75]
  } else {
    positions = [aisleStart + aisleLen * 0.15, aisleStart + aisleLen * 0.5, aisleStart + aisleLen * 0.85]
  }

  const labelMid = isHoriz ? topRow.b + aisleWidth / 2 : leftRow.r + aisleWidth / 2

  return (
    <g pointerEvents="none">
      {positions.map((pos, i) => {
        const lx = isHoriz ? pos      : labelMid
        const ly = isHoriz ? labelMid : pos

        return (
          <g key={i}>
            {isHoriz ? (
              <>
                {/* Vertical arrow spanning gap with padding */}
                {(() => {
                  const pad2 = 3/zoom
                  const y1 = topRow.b + pad2, y2 = bottomRow.y - pad2
                  return <>
                    <line x1={lx} y1={y1} x2={lx} y2={y2} stroke={clr} strokeWidth={sw}/>
                    <polygon points={`${lx},${y1} ${lx-aw/2},${y1+aw} ${lx+aw/2},${y1+aw}`} fill={clr}/>
                    <polygon points={`${lx},${y2} ${lx-aw/2},${y2-aw} ${lx+aw/2},${y2-aw}`} fill={clr}/>
                  </>
                })()}
              </>
            ) : (
              <>
                {/* Horizontal arrow spanning gap with padding */}
                {(() => {
                  const pad2 = 3/zoom
                  const x1 = leftRow.r + pad2, x2 = rightRow.x - pad2
                  return <>
                    <line x1={x1} y1={ly} x2={x2} y2={ly} stroke={clr} strokeWidth={sw}/>
                    <polygon points={`${x1},${ly} ${x1+aw},${ly-aw/2} ${x1+aw},${ly+aw/2}`} fill={clr}/>
                    <polygon points={`${x2},${ly} ${x2-aw},${ly-aw/2} ${x2-aw},${ly+aw/2}`} fill={clr}/>
                  </>
                })()}
              </>
            )}
            {/* Label pill */}
      <rect x={lx-tw/2} y={ly-th/2} width={tw} height={th}
        fill={bg} stroke={bdr} strokeWidth={1/zoom} rx={3/zoom}/>
            <text x={lx} y={ly+fs*0.38} textAnchor="middle" fontSize={fs}
              fontFamily="JetBrains Mono,monospace" fontWeight="700" fill={textClr}>{fullTxt}</text>
          </g>
        )
      })}
    </g>
  )
}

// ── CanvasOverlays ────────────────────────────────────────────────────────────
// Render inside the same SVG transform as CanvasObjects in CanvasArea:
//   <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
//     <CanvasObjects .../>
//     <CanvasOverlays zoom={zoom} moveDelta={snapDelta || moveDelta}/>
//   </g>
export function CanvasOverlays({ zoom, moveDelta }) {
  const objects     = useCanvasStore(s => s.objects)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const gridSize    = useCanvasStore(s => s.gridSize)
  const showAisles  = useCanvasStore(s => s.showAisles ?? true)

  const aisles = objects.filter(o => o.type === 'aisle')
  if (aisles.length === 0 || !showAisles) return null

  return (
    <>
      {aisles.map(aisle => (
        <AisleLabel
          key={aisle.id}
          aisle={aisle}
          objects={objects}
          selectedIds={selectedIds}
          moveDelta={moveDelta}
          zoom={zoom}
          gridSize={gridSize}
        />
      ))}
    </>
  )
}