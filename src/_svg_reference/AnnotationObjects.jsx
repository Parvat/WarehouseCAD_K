import { memo } from 'react'
import { pxToFtIn } from '../../utils/canvas'

export const AnnotationObject = memo(function AnnotationObject({ obj, dx = 0, dy = 0, zoom = 1, gridSize = 40 }) {
  const x   = (obj.x  || 0) + dx
  const y   = (obj.y  || 0) + dy
  const w   = obj.width  || gridSize * 12
  const h   = obj.height || gridSize * 4
  const col = obj.stroke || '#f0b429'

  // World-space units — SVG transform scales these naturally with zoom,
  // exactly like every other shape on the canvas.
  const sw  = obj.strokeWidth || Math.max(3, gridSize * 0.07)
  const fs  = obj.fontSize    || Math.max(gridSize * 1.2, h * 0.45)
  const aw  = Math.max(gridSize * 0.8, sw * 5)  // arrowhead scales with stroke, minimum 0.8 grid units
  const r3  = gridSize * 0.05

  // Transparent hitbox — rgba(0,0,0,0) captures pointer events unlike fill="none"
  const HitBox = () => (
    <rect x={x} y={y} width={w} height={h} fill="rgba(0,0,0,0)" stroke="none" />
  )

  switch (obj.type) {

    // ── Plain text label ─────────────────────────────────────────────────────
    case 'annot_label':
      return (
        <g>
          <HitBox />
          <text x={x + w/2} y={y + h/2 + fs*0.38} textAnchor="middle"
            fontSize={fs} fontFamily={obj.fontFamily || 'Montserrat, sans-serif'}
            fontWeight={obj.bold ? 'bold' : 'normal'}
            fontStyle={obj.italic ? 'italic' : 'normal'}
            fill={col} opacity={obj.opacity ?? 1}
          >{obj.text || 'Label'}</text>
        </g>
      )

    // ── Boxed label ──────────────────────────────────────────────────────────
    case 'annot_label_box':
      return (
        <g opacity={obj.opacity ?? 1}>
          <rect x={x} y={y} width={w} height={h} rx={r3}
            fill={obj.fill || 'rgba(14,20,30,0.80)'} stroke={col} strokeWidth={sw} />
          <clipPath id={`lbclip-${obj.id || 'p'}`}>
            <rect x={x+sw} y={y+sw} width={w-sw*2} height={h-sw*2} />
          </clipPath>
          <text x={x + w/2} y={y + h/2 + fs*0.38} textAnchor="middle"
            fontSize={fs} fontFamily="Montserrat, sans-serif"
            fontWeight={obj.bold ? 'bold' : 'normal'}
            fontStyle={obj.italic ? 'italic' : 'normal'}
            fill={col} clipPath={`url(#lbclip-${obj.id || 'p'})`}
          >{obj.text || 'Label'}</text>
        </g>
      )

    // ── Circle/oval label ────────────────────────────────────────────────────
    case 'annot_label_circle':
      return (
        <g opacity={obj.opacity ?? 1}>
          <HitBox />
          <ellipse cx={x + w/2} cy={y + h/2} rx={w/2} ry={h/2}
            fill={obj.fill || 'rgba(14,20,30,0.80)'} stroke={col} strokeWidth={sw} />
          <clipPath id={`lcclip-${obj.id || 'p'}`}>
            <ellipse cx={x + w/2} cy={y + h/2} rx={w/2 - sw} ry={h/2 - sw} />
          </clipPath>
          <text x={x + w/2} y={y + h/2 + fs*0.38} textAnchor="middle"
            fontSize={fs} fontFamily="Montserrat, sans-serif" fill={col}
            clipPath={`url(#lcclip-${obj.id || 'p'})`}
          >{obj.text || 'Label'}</text>
        </g>
      )

    // ── Auto-number badge ────────────────────────────────────────────────────
    case 'annot_auto_number': {
      const r = Math.min(w, h) / 2
      return (
        <g opacity={obj.opacity ?? 1}>
          <HitBox />
          <circle cx={x + w/2} cy={y + h/2} r={r} fill={col} stroke="none" />
          <text x={x + w/2} y={y + h/2 + fs*0.4} textAnchor="middle"
            fontSize={fs * 1.1} fontFamily="Montserrat, sans-serif" fontWeight="bold"
            fill={obj.fill || '#0e1420'}
          >{obj.number ?? 1}</text>
        </g>
      )
    }

    // ── Linear dimension ─────────────────────────────────────────────────────
    case 'annot_dimension': {
      const sx2 = (obj.x1||0) + dx, sy2 = (obj.y1||0) + dy
      const ex  = (obj.x2||0) + dx, ey  = (obj.y2||0) + dy
      const edx = ex - sx2, edy = ey - sy2
      const len = Math.hypot(edx, edy) || 1
      const nx = -edy / len, ny = edx / len
      const off  = gridSize * 2
      const d1x = sx2 + nx*off, d1y = sy2 + ny*off
      const d2x = ex  + nx*off, d2y = ey  + ny*off
      const dmx = (sx2+ex)/2 + nx*(off + gridSize*0.05)
      const dmy = (sy2+ey)/2 + ny*(off + gridSize*0.05)
      const label = obj.customLabel || pxToFtIn(len, gridSize)
      const lfs = fs * 0.9
      const tw = label.length * lfs * 0.62 + gridSize * 0.2
      const th = lfs * 1.6
      return (
        <g opacity={obj.opacity ?? 1}>
          {/* Extension lines — solid, same style as dim line */}
          <line x1={sx2} y1={sy2} x2={d1x} y2={d1y} stroke={col} strokeWidth={sw}/>
          <line x1={ex}  y1={ey}  x2={d2x} y2={d2y} stroke={col} strokeWidth={sw}/>
          <line x1={d1x} y1={d1y} x2={d2x} y2={d2y} stroke={col} strokeWidth={sw}/>
          <polygon points={`${d1x},${d1y} ${d1x+edx/len*aw+ny*aw*0.4},${d1y+edy/len*aw-nx*aw*0.4} ${d1x+edx/len*aw-ny*aw*0.4},${d1y+edy/len*aw+nx*aw*0.4}`} fill={col}/>
          <polygon points={`${d2x},${d2y} ${d2x-edx/len*aw+ny*aw*0.4},${d2y-edy/len*aw-nx*aw*0.4} ${d2x-edx/len*aw-ny*aw*0.4},${d2y-edy/len*aw+nx*aw*0.4}`} fill={col}/>
          <rect x={dmx-tw/2} y={dmy-th/2} width={tw} height={th}
            fill="var(--surface, #13151a)" rx={r3} opacity={0.92}/>
          <text x={dmx} y={dmy+lfs*0.38} textAnchor="middle"
            fontSize={lfs} fontFamily="JetBrains Mono, monospace" fill={col}>{label}</text>
        </g>
      )
    }

    // ── North arrow ──────────────────────────────────────────────────────────
    case 'annot_north_arrow': {
      const cx = x + w/2, cy = y + h/2
      const r  = Math.min(w, h) / 2 - sw
      const rot = obj.rotation || 0
      const toRad = (d) => (d - 90) * Math.PI / 180
      const tipX = cx + r * Math.cos(toRad(rot)), tipY = cy + r * Math.sin(toRad(rot))
      const bL   = { x: cx + r*0.35*Math.cos(toRad(rot+90)),  y: cy + r*0.35*Math.sin(toRad(rot+90)) }
      const bR   = { x: cx + r*0.35*Math.cos(toRad(rot-90)),  y: cy + r*0.35*Math.sin(toRad(rot-90)) }
      const tail = { x: cx + r*Math.cos(toRad(rot+180)), y: cy + r*Math.sin(toRad(rot+180)) }
      const nLX  = cx + (r + fs*0.75)*Math.cos(toRad(rot))
      const nLY  = cy + (r + fs*0.75)*Math.sin(toRad(rot)) + fs*0.38
      return (
        <g opacity={obj.opacity ?? 1}>
          <HitBox />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={sw} opacity={0.25}/>
          <path d={`M ${tipX} ${tipY} L ${bL.x} ${bL.y} L ${tail.x} ${tail.y} Z`} fill={col} stroke="none"/>
          <path d={`M ${tipX} ${tipY} L ${bR.x} ${bR.y} L ${tail.x} ${tail.y} Z`} fill="none" stroke={col} strokeWidth={sw}/>
          <text x={nLX} y={nLY} textAnchor="middle"
            fontSize={fs} fontFamily="Montserrat, sans-serif" fontWeight="bold" fill={col}>N</text>
        </g>
      )
    }

    // ── Scale bar ────────────────────────────────────────────────────────────
    case 'annot_scale_bar': {
      const segments = obj.segments || 4
      const segW = w / segments
      const barH = h
      const labelY = y + barH + fs * 1.1
      return (
        <g opacity={obj.opacity ?? 1}>
          <rect x={x} y={y} width={w} height={barH + fs*2} fill="rgba(0,0,0,0)" stroke="none"/>
          {Array.from({ length: segments }, (_, i) => (
            <rect key={i} x={x + i*segW} y={y} width={segW} height={barH}
              fill={i % 2 === 0 ? col : 'none'} stroke={col} strokeWidth={sw}/>
          ))}
          <text x={x} y={labelY} textAnchor="middle"
            fontSize={fs * 0.8} fontFamily="JetBrains Mono, monospace" fill={col}>0</text>
          {Array.from({ length: segments }, (_, i) => (
            <text key={i} x={x+(i+1)*segW} y={labelY} textAnchor="middle"
              fontSize={fs * 0.8} fontFamily="JetBrains Mono, monospace" fill={col}>
              {((i+1)*(w/gridSize)/segments).toFixed(0)}'
            </text>
          ))}
        </g>
      )
    }

    // ── Solid / dotted / dashed / dashdot lines ──────────────────────────────
    case 'annot_solid_line': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      return <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
        stroke={col} strokeWidth={sw} strokeLinecap="round" opacity={obj.opacity??1}/>
    }
    case 'annot_dotted_line': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      return <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
        stroke={col} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${sw*2} ${sw*3}`} opacity={obj.opacity??1}/>
    }
    case 'annot_dashed_line': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      return <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
        stroke={col} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${sw*8} ${sw*3}`} opacity={obj.opacity??1}/>
    }
    case 'annot_dashdot_line': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      return <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
        stroke={col} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${sw*8} ${sw*2} ${sw*2} ${sw*2}`} opacity={obj.opacity??1}/>
    }

    // ── Arrow line ───────────────────────────────────────────────────────────
    case 'annot_draw_line':
    case 'annot_arrow_line': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      const edx=lx2-lx1, edy=ly2-ly1, len2=Math.hypot(edx,edy)||1
      return (
        <g opacity={obj.opacity??1}>
          <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={col} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={obj.type==='annot_draw_line' ? `${sw*6} ${sw*3}` : 'none'}/>
          <polygon
            points={`${lx2},${ly2} ${lx2-edx/len2*aw-edy/len2*aw*0.4},${ly2-edy/len2*aw+edx/len2*aw*0.4} ${lx2-edx/len2*aw+edy/len2*aw*0.4},${ly2-edy/len2*aw-edx/len2*aw*0.4}`}
            fill={col} stroke="none"/>
        </g>
      )
    }

    // ── Double-headed arrow ──────────────────────────────────────────────────
    case 'annot_double_arrow': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      const edx=lx2-lx1, edy=ly2-ly1, len2=Math.hypot(edx,edy)||1
      return (
        <g opacity={obj.opacity??1}>
          <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={col} strokeWidth={sw} strokeLinecap="round"/>
          <polygon points={`${lx2},${ly2} ${lx2-edx/len2*aw-edy/len2*aw*0.4},${ly2-edy/len2*aw+edx/len2*aw*0.4} ${lx2-edx/len2*aw+edy/len2*aw*0.4},${ly2-edy/len2*aw-edx/len2*aw*0.4}`} fill={col} stroke="none"/>
          <polygon points={`${lx1},${ly1} ${lx1+edx/len2*aw-edy/len2*aw*0.4},${ly1+edy/len2*aw+edx/len2*aw*0.4} ${lx1+edx/len2*aw+edy/len2*aw*0.4},${ly1+edy/len2*aw-edx/len2*aw*0.4}`} fill={col} stroke="none"/>
        </g>
      )
    }

    // ── Curved arrow ─────────────────────────────────────────────────────────
    case 'annot_curve_arrow': {
      const lx1=(obj.x1||0)+dx, ly1=(obj.y1||0)+dy, lx2=(obj.x2||0)+dx, ly2=(obj.y2||0)+dy
      const mx2=(lx1+lx2)/2, my2=(ly1+ly2)/2
      const bend=obj.bend??0.35
      const edx2=lx2-lx1, edy2=ly2-ly1
      const cpx=mx2-edy2*bend, cpy=my2+edx2*bend
      const tdx=lx2-cpx, tdy=ly2-cpy, tl=Math.hypot(tdx,tdy)||1
      return (
        <g opacity={obj.opacity??1}>
          <path d={`M ${lx1} ${ly1} Q ${cpx} ${cpy} ${lx2} ${ly2}`}
            stroke={col} strokeWidth={sw} fill="none" strokeLinecap="round"/>
          <polygon
            points={`${lx2},${ly2} ${lx2-tdx/tl*aw-tdy/tl*aw*0.4},${ly2-tdy/tl*aw+tdx/tl*aw*0.4} ${lx2-tdx/tl*aw+tdy/tl*aw*0.4},${ly2-tdy/tl*aw-tdx/tl*aw*0.4}`}
            fill={col} stroke="none"/>
        </g>
      )
    }

    // ── Callout bubble ───────────────────────────────────────────────────────
    case 'annot_callout': {
      const tailX = (obj.tailX != null ? obj.tailX+dx : x + w*0.25)
      const tailY = (obj.tailY != null ? obj.tailY+dy : y + h + gridSize*0.5)
      return (
        <g opacity={obj.opacity??1}>
          <HitBox />
          <rect x={x} y={y} width={w} height={h} rx={r3*2}
            fill={obj.fill||'rgba(14,20,30,0.88)'} stroke={col} strokeWidth={sw}/>
          <path d={`M ${x+w*0.15} ${y+h} L ${tailX} ${tailY} L ${x+w*0.35} ${y+h} Z`}
            fill={obj.fill||'rgba(14,20,30,0.88)'} stroke={col} strokeWidth={sw} strokeLinejoin="round"/>
          <clipPath id={`callclip-${obj.id||'p'}`}>
            <rect x={x+sw} y={y+sw} width={w-sw*2} height={h-sw*2}/>
          </clipPath>
          <text x={x+w/2} y={y+h/2+fs*0.38} textAnchor="middle"
            fontSize={fs} fontFamily="Montserrat, sans-serif"
            fill={col} clipPath={`url(#callclip-${obj.id||'p'})`}>{obj.text||'Note'}</text>
        </g>
      )
    }

    // ── Revision cloud ────────────────────────────────────────────────────────
    case 'annot_cloud': {
      const bumpR  = w / Math.max(3, Math.round(w / (gridSize*0.7))) / 2
      const bumps  = Math.max(3, Math.round(w / (bumpR * 2)))
      const hBumpR = h / Math.max(2, Math.round(h / (gridSize*0.7))) / 2
      const hBumps = Math.max(2, Math.round(h / (hBumpR * 2)))
      const pts = []
      for (let i=0;i<bumps;i++)     pts.push(`A ${bumpR} ${bumpR} 0 0 1 ${x+bumpR+(i+1)*bumpR*2} ${y}`)
      for (let i=0;i<hBumps;i++)    pts.push(`A ${hBumpR} ${hBumpR} 0 0 1 ${x+w} ${y+hBumpR+(i+1)*hBumpR*2}`)
      for (let i=bumps-1;i>=0;i--)  pts.push(`A ${bumpR} ${bumpR} 0 0 1 ${x+bumpR+i*bumpR*2} ${y+h}`)
      for (let i=hBumps-1;i>=0;i--) pts.push(`A ${hBumpR} ${hBumpR} 0 0 1 ${x} ${y+hBumpR+i*hBumpR*2}`)
      return (
        <g opacity={obj.opacity??1}>
          <HitBox />
          <path d={`M ${x+bumpR} ${y} ${pts.join(' ')} Z`}
            fill={obj.fill||'rgba(240,180,41,0.06)'} stroke={col} strokeWidth={sw}/>
        </g>
      )
    }

    default: return null
  }
})