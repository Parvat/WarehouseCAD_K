import { useCanvasStore } from '../../store/useCanvasStore'
import {
  arcPath, lShapePath, lMirrorPath, tShapePath, uShapePath,
  trianglePath, diamondPath, starPath, crossPath, arrowPath,
  getObjectBounds, getHandlePositions, HANDLES, pxToFtIn,
  getFpWallSegments, getFpVertices, getWallDragAxis, initFpVerts,
  ANNOT_LINE_TYPES, ANNOT_RECT_TYPES, insetPolygon,
} from '../../utils/canvas'
import { capGeometry, endDirections, HEAD_LEN_WORLD } from '../../utils/arrowGeometry'
import { strokeOutlinePath, linePath } from '../../utils/freehand'
import { AnnotationObject } from './AnnotationObjects'
import { isExporting } from './exportMode'
import { layoutText } from '../../utils/textLayout'

const FP_TYPES = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])

// ── PalletGrid ───────────────────────────────────────────────────────────────
// ── PalletGrid ───────────────────────────────────────────────────────────────
/* ── Rack symbology palette ──────────────────────────────────────────────────
   Locked by trace-object-design-spec.md: one palette for every rack type, so
   the tell-apart cue is the GEOMETRY (flue line, back wall, carts, rollers)
   rather than a colour the viewer has to learn. Literal hex by design —
   CLAUDE.md keeps canvas object drawing colours out of the theme system, since
   a token here would repaint the drawing when the UI theme changes. */
const RK = {
  fill:      '#DCE8DC',
  /* Rack BODIES outline in a soft green, not pine. Pine is reserved for the
     building wall — when every rack was also pine the drawing read as a page
     of heavy black boxes and the wall stopped being the strongest line on it. */
  border:    '#3E6B54',
  divider:   '#9CBBAA',
  /* The darkest ink a rack is allowed: arrows, the drive-in back wall, and the
     cantilever spine. Still clearly lighter than the building wall. */
  structure: '#2E4A3A',
  flue:      '#E0A63C',
  roller:    '#C7A15A',
  column:    '#3B6FB5',
  conflict:  '#C0392B',
  pine:      '#14392B',   // building wall only
}

/* Rack line weights are SCREEN-constant (÷ zoom), so a divider stays a
   hairline at 40% and does not become a slab at 400%. The spec calls for
   1–1.5px at normal zoom. */
const rackLines = (zoom) => ({ edge: 1.5 / zoom, hair: 1.2 / zoom })

/* ── Lane-rack chassis ───────────────────────────────────────────────────────
   Drive-in, drive-through, push-back and pallet-flow are the same box with the
   same lane dividers; they differ only in their cues. Sharing the chassis is
   what makes those cues the tell-apart rather than four subtly different boxes.

   Lane width is DERIVED from the object's own width, not rebuilt from pallet
   dimensions — the object was dimensioned at creation and its width is what
   selection, snapping and the column check all measure, so the drawing has to
   subdivide that same box or the symbol drifts out of its own outline. */
function laneGeom(obj, bx, bw, gridSize) {
  const lanes = Math.max(1, obj.lanes || 2)
  const upW   = ((obj.uprightWidth || 4) / 12) * gridSize
  const laneW = Math.max(0, (bw - (lanes + 1) * upW) / lanes)
  const postXs = Array.from({ length: lanes + 1 }, (_, i) => bx + i * (laneW + upW))
  const laneCx = Array.from({ length: lanes }, (_, i) => postXs[i] + upW + laneW / 2)
  return { lanes, upW, laneW, postXs, laneCx }
}

function LaneChassis({ bx, by, bw, bh, postXs, upW, zoom, backWall = false }) {
  const { edge, hair } = rackLines(zoom)
  return (
    <>
      <rect x={bx} y={by} width={bw} height={bh} fill={RK.fill} stroke={RK.border} strokeWidth={edge} rx={0}/>
      {postXs.slice(1, -1).map((ux, i) => (
        <line key={'ld'+i} x1={ux+upW/2} y1={by} x2={ux+upW/2} y2={by+bh}
          stroke={RK.divider} strokeWidth={hair}/>
      ))}
      {/* The closed back — one heavier line across the FAR end, the single cue
          separating drive-in from drive-through. A line, not a filled bar:
          the bar was reading as a wall of the building itself. */}
      {backWall && (
        <line x1={bx} y1={by} x2={bx+bw} y2={by}
          stroke={RK.structure} strokeWidth={edge * 2.2}/>
      )}
    </>
  )
}

/* Travel arrow: a shaft with a FILLED triangle head, one size everywhere.
   Sized in screen px so every arrow on the sheet is identical regardless of
   how deep its rack happens to be — an arrow is a legend mark, not a
   dimension. dir -1 points up (into the near face), +1 points down. */
const ARROW_LEN  = 13
const ARROW_HEAD = 7
const ARROW_GAP  = 3    // clear air between the rack edge and the arrow

/* Travel arrow. Takes the rack EDGE it addresses and which side of it to live
   on, rather than a raw y — the previous signature took the shaft's start and
   derived the tip from it, which put the head a full arrow-length back INSIDE
   the box and floated the far-end arrow well clear of the rack. Anchoring to
   the edge makes both impossible: the arrow is always wholly outside, always
   the same distance off the face it belongs to.

   Every arrow points the same way (up = the direction of travel), so a
   near-face arrow reads as going in and a far-face one as coming out. */
function LaneArrow({ cx, edgeY, side = 'below', zoom }) {
  const len  = ARROW_LEN  / zoom
  const head = ARROW_HEAD / zoom
  const gap  = ARROW_GAP  / zoom
  /* Pointing up, so the tip is the topmost point and the shaft runs down from
     it. 'below' hangs off the near face; 'above' sits clear of the far face. */
  const tipY  = side === 'below' ? edgeY + gap : edgeY - gap - len
  const tailY = tipY + len
  const baseY = tipY + head
  return (
    <g pointerEvents="none">
      <line x1={cx} y1={tailY} x2={cx} y2={baseY} stroke={RK.structure} strokeWidth={1.2/zoom}/>
      <path d={`M${cx - head*0.48} ${baseY} L${cx} ${tipY} L${cx + head*0.48} ${baseY} Z`}
        fill={RK.structure} stroke="none"/>
    </g>
  )
}

/* Currently unreferenced. The locked spec draws selective and double rows as
   "bay cells only", so the per-pallet grid that used to sit inside each bay is
   no longer painted — at bay scale its cells read as extra dividers and muddy
   the one cue those two types have. Kept rather than deleted because it is the
   obvious building block if a pallet-level view is ever wanted. */
function PalletGrid({ bayX, bayY, bayW, bayH, stroke, zoom, palletWIn = 48, palletDIn = 40 }) {
  const PALLET_W = (palletWIn/12)*40
  const PALLET_D = (palletDIn/12)*40
  const across = Math.max(1, Math.floor(bayW / PALLET_W))
  const deep   = Math.max(1, Math.floor(bayH / PALLET_D))
  const cellW  = bayW / across, cellD = bayH / deep
  const gap    = 1 / zoom
  if (cellW * zoom < 6 || cellD * zoom < 6) return null
  return (
    <g pointerEvents="none">
      {Array.from({length: deep}, (_, row) =>
        Array.from({length: across}, (_, col) => {
          const x=bayX+col*cellW+gap, y=bayY+row*cellD+gap, w=cellW-gap*2, h=cellD-gap*2
          return (<g key={`${row}-${col}`}>
            <rect x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={0.8/zoom} opacity={0.4} rx={1/zoom}/>
            <line x1={x+w*0.2} y1={y+h*0.2} x2={x+w*0.8} y2={y+h*0.8} stroke={stroke} strokeWidth={0.5/zoom} opacity={0.3}/>
            <line x1={x+w*0.8} y1={y+h*0.2} x2={x+w*0.2} y2={y+h*0.8} stroke={stroke} strokeWidth={0.5/zoom} opacity={0.3}/>
          </g>)
        })
      )}
    </g>
  )
}

/* ── two-point stroke: line and arc, with optional end caps ────────────────
   One component for both — they differ only in the path traced between the
   same two points. An arrow is a line with `endCap:'arrow'`, so double-ended
   and reversed arrows need no extra types.

   Everything is drawn in the object's LOCAL space, inside the group that
   carries its rotate() transform, so heads rotate with the body and stay
   oriented on a rotated object. */
function TwoPointStroke({ obj, X, Y, common, stroke, strokeWidth, opacity }) {
  const x1 = X(obj.x1), y1 = Y(obj.y1), x2 = X(obj.x2), y2 = Y(obj.y2)
  const isArc = obj.type === 'arc'
  const bend  = obj.bend ?? 0.35

  const body = isArc
    ? <path {...common} d={arcPath(x1, y1, x2, y2, bend)} />
    : <line {...common} x1={x1} y1={y1} x2={x2} y2={y2} />

  if (!obj.startCap && !obj.endCap) return body

  const dir  = endDirections({ ...obj, x1, y1, x2, y2 })
  const base = obj.headLen ?? HEAD_LEN_WORLD
  const caps = [
    capGeometry(obj.startCap, x1, y1, dir.start.ux, dir.start.uy, strokeWidth, base),
    capGeometry(obj.endCap,   x2, y2, dir.end.ux,   dir.end.uy,   strokeWidth, base),
  ]

  return (
    <g>
      {body}
      {caps.map((c, i) => {
        if (!c) return null
        const paint = c.filled
          ? { fill: stroke, stroke: 'none' }
          : { fill: 'none', stroke, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }
        return c.circle
          ? <circle key={i} cx={c.cx} cy={c.cy} r={c.r} opacity={opacity} {...paint} />
          : <path   key={i} d={c.d} opacity={opacity} {...paint} />
      })}
    </g>
  )
}

export function ShapeGeometry({ obj, dx = 0, dy = 0, override = {}, zoom = 1, gridSize = 40, activeBaySelection = [], selected = false, objects = [], printMode = false }) {
  const fill        = obj.noFill ? 'none' : (override.fill   ?? obj.fill   ?? 'rgba(34,197,94,0.25)')
  const stroke      = override.stroke ?? obj.stroke ?? '#22c55e'
  const strokeWidth = override.strokeWidth ?? obj.strokeWidth ?? 1.5
  /* Falls back to the object like fill/stroke/strokeWidth above it. Without
     the obj half, a dash could only ever come from a caller-supplied override,
     so "this object is dashed" was not expressible as object data at all. */
  const dashArray   = override.strokeDasharray ?? obj.strokeDasharray ?? null
  const opacity     = override.opacity ?? obj.opacity ?? 1
  const smoothStyle = { style: { transition: 'fill 0.08s ease-out, stroke 0.08s ease-out, opacity 0.08s ease-out, d 0.06s ease-out' } }
  const pathCommon  = { fill, stroke, strokeWidth, opacity, ...smoothStyle, ...(dashArray ? { strokeDasharray: dashArray } : {}) }
  const lineCommon  = { fill: 'none', stroke, strokeWidth, opacity, strokeLinecap: 'round', ...smoothStyle, ...(dashArray ? { strokeDasharray: dashArray } : {}) }
  const X = (v) => (v ?? 0) + dx
  const Y = (v) => (v ?? 0) + dy

  // Annotation objects — rendered here so they get dx/dy/zoom/gridSize from CanvasObject
  if (obj.type?.startsWith('annot_')) {
    return <AnnotationObject obj={obj} dx={dx} dy={dy} zoom={zoom} gridSize={gridSize} />
  }

  /* ── Rack level of detail ──────────────────────────────────────────────────
     Racks are the expensive objects on the canvas: every case below draws a
     rect per bay, a rect per upright, and a PalletGrid inside each bay. A
     40-bay rack is ~100 nodes, and a generated layout is hundreds of racks.

     Below RACK_LOD_ZOOM a single bay is under two pixels wide, so all of that
     geometry resolves to a flat block of fill — visually identical to the one
     rect drawn here, for ~1% of the nodes. PalletGrid already bails at small
     cell sizes on the same reasoning; this carries it up to the bay itself.

     The trigger is the BAY's rendered width, not zoom alone. A flat 15% cutoff
     reads well until you check it: an 8ft bay at 15% is ~48 screen px and at
     10% still ~32 — plainly legible, so a zoom-only rule throws away detail the
     user can see. What actually stops being legible is a bay narrower than
     ~10px, which is the same reasoning PalletGrid already uses one level down.

     It lands where it is needed: a 40-bay rack in a 1,000ft layout crosses the
     threshold at ~3% (where that layout is viewed), while the 11-bay racks of a
     240ft building keep their detail all the way down to ~2%. The 15% ceiling
     is kept as a backstop so this can never fire at a working zoom.

     printMode is exempt: a PDF is rendered at export scale and then viewed at
     whatever size the reader likes, so it always gets full detail.

     ── NEUTRALISED for the Konva migration ──────────────────────────────────
     0 instead of 0.15, so `zoom < LOD_ZOOM` is never true and racks keep full
     detail at every zoom. The Konva renderer dropped its own collapse once
     consolidating a rack to two nodes made detail cheap; leaving this one
     armed would make the two renderers disagree below 15% while they are being
     compared side by side, which is the one thing a parity check cannot have.

     The block is left standing rather than deleted because the whole SVG
     renderer goes at Step 6 — this is a one-token change to undo if the
     comparison ever needs the old behaviour back. */
  const LOD_ZOOM = 0
  if (!printMode && !isExporting() && zoom < LOD_ZOOM &&
      obj.type?.startsWith('rack_') && obj.width > 0 && obj.height > 0) {
    return (
      <rect x={X(obj.x)} y={Y(obj.y)} width={obj.width} height={obj.height}
        fill={RK.fill} stroke={RK.border} strokeWidth={1.5/zoom} opacity={opacity} rx={0}/>
    )
  }

  // ── FP shapes: solid wall rendering ─────────────────────────────────────────
  // Single path with fill-rule="evenodd": outer polygon + reversed inner polygon
  // = exact wall thickness ring, zero stroke, pixel-perfect at any zoom
  const FP_RENDER_TYPES = new Set(['fp_rect','fp_l','fp_l_mirror','fp_t','fp_u','fp_cross'])
  if (FP_RENDER_TYPES.has(obj.type) && obj.fpVerts) {
    const wt         = obj.wallThicknessFt ? obj.wallThicknessFt * gridSize : (obj.strokeWidth || 10)
    const wallColor  = obj.stroke || '#4a5568'
    const floorColor = obj.noFill ? 'none' : (obj.fill ?? 'rgba(14,20,30,0.88)')
    const verts      = obj.fpVerts

    // Outer path (CW in screen coords)
    const outerD = verts.map((v,i) => `${i===0?'M':'L'} ${X(v.x)} ${Y(v.y)}`).join(' ') + ' Z'

    // Inner path — vertices offset inward by wt using edge-normal bisector method
    const innerVerts = insetPolygon(verts, wt)
    // Reverse inner path so evenodd cuts out the interior correctly
    const innerD = [...innerVerts].reverse().map((v,i) => `${i===0?'M':'L'} ${X(v.x)} ${Y(v.y)}`).join(' ') + ' Z'

    return (
      <g opacity={opacity}>
        {/* Floor fill — interior only */}
        <path d={innerD} fill={floorColor} stroke="none"/>
        {/* Wall ring — evenodd between outer and inner = exact wt thick wall */}
        <path d={outerD + ' ' + innerD} fill={wallColor} fillRule="evenodd" stroke="none"/>
      </g>
    )
  }

  switch (obj.type) {
    // ─ All fp shapes: render from fpVerts if available ─────────────────────
    case 'fp_l': case 'fp_l_mirror': case 'fp_t': case 'fp_u': case 'fp_cross': {
      if (obj.fpVerts) {
        const d = obj.fpVerts.map((v,i) => `${i===0?'M':'L'} ${X(v.x)} ${Y(v.y)}`).join(' ') + ' Z'
        return <path {...pathCommon} d={d} />
      }
      break  // fall through to legacy below
    }
    case 'fp_rect':
    case 'rect':
      if (obj.fpVerts) {
        const d = obj.fpVerts.map((v,i) => `${i===0?'M':'L'} ${X(v.x)} ${Y(v.y)}`).join(' ') + ' Z'
        return <path {...pathCommon} d={d} />
      }
      return <rect {...pathCommon} x={X(obj.x)} y={Y(obj.y)} width={obj.width} height={obj.height} rx={1} />
    case 'circle':
      return <ellipse {...pathCommon} cx={X(obj.cx)} cy={Y(obj.cy)} rx={obj.rx} ry={obj.ry} />
    case 'freehand': {
      /* Technical Vector is a constant-width stroked polyline; the pressure
         pens render perfect-freehand's outline as a FILLED path, which is
         what gives them their variable width. */
      const pts = (obj.points || []).map(p => ({ x: X(p.x), y: Y(p.y) }))
      if (pts.length < 2) return null
      return obj.pen === 'technical'
        ? <path d={linePath(pts)} fill="none" stroke={stroke} strokeWidth={strokeWidth}
            strokeLinecap={obj.strokeLinecap || 'round'} strokeLinejoin={obj.strokeLinejoin || 'round'}
            opacity={opacity}/>
        : <path d={strokeOutlinePath(pts, { pen: obj.pen, width: strokeWidth, cap: obj.strokeLinecap })}
            fill={stroke} stroke="none" opacity={opacity}/>
    }
    case 'line':
    case 'arc':
      return <TwoPointStroke obj={obj} X={X} Y={Y} common={lineCommon}
               stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    case 'l_shape': case 'fp_l':
      return <path {...pathCommon} d={lShapePath(X(obj.x), Y(obj.y), obj.width, obj.height, obj.fpStemW ?? 0.3, obj.fpStemH ?? 0.3)} />
    case 'fp_l_mirror':
      return <path {...pathCommon} d={lMirrorPath(X(obj.x), Y(obj.y), obj.width, obj.height, obj.fpStemW ?? 0.3, obj.fpStemH ?? 0.3)} />
    case 'fp_cross': {
      const cw_ = obj.fpCrossW ?? obj.fpCrossT ?? 0.35
      const ch_ = obj.fpCrossH ?? obj.fpCrossT ?? 0.35
      const dfLX = (1-cw_)/2, dfRX = 1-dfLX, dfTY = (1-ch_)/2, dfBY = 1-dfTY
      const lxt = obj.fpCrossLXT ?? obj.fpCrossLX ?? dfLX
      const rxt = obj.fpCrossRXT ?? obj.fpCrossRX ?? dfRX
      const lxb = obj.fpCrossLXB ?? obj.fpCrossLX ?? dfLX
      const rxb = obj.fpCrossRXB ?? obj.fpCrossRX ?? dfRX
      const tyr = obj.fpCrossTYR ?? obj.fpCrossTopY ?? dfTY
      const byr = obj.fpCrossBYR ?? obj.fpCrossBotY ?? dfBY
      const tyl = obj.fpCrossTYL ?? obj.fpCrossTopY ?? dfTY
      const byl = obj.fpCrossBYL ?? obj.fpCrossBotY ?? dfBY
      return <path {...pathCommon} d={crossPath(X(obj.x), Y(obj.y), obj.width, obj.height, lxt, rxt, tyr, byr, lxb, rxb, tyl, byl)} />
    }
    case 't_shape': case 'fp_t': {
      // New vertex-based rendering
      if (obj.fpVerts) {
        const d = obj.fpVerts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(v.x)} ${Y(v.y)}`).join(' ') + ' Z'
        return <path {...pathCommon} d={d} />
      }
      // Legacy ratio-based fallback
      const stemL = obj.fpTStemL ?? ((1-(obj.fpTStemW??0.35))/2)
      const stemR = obj.fpTStemR ?? (1-(1-(obj.fpTStemW??0.35))/2)
      const barHL = obj.fpTBarHL ?? obj.fpBarH ?? 0.3
      const barHR = obj.fpTBarHR ?? obj.fpBarH ?? 0.3
      return <path {...pathCommon} d={tShapePath(X(obj.x), Y(obj.y), obj.width, obj.height, barHL, stemL, stemR, barHR, obj.fpTStemH ?? 1.0)} />
    }
    case 'u_shape': case 'fp_u':
      return <path {...pathCommon} d={uShapePath(X(obj.x), Y(obj.y), obj.width, obj.height, obj.fpUWallT ?? 0.28, obj.fpUOpenH ?? 0.62, obj.fpUArmTop ?? 0)} />
    case 'triangle':
      return <path {...pathCommon} d={trianglePath(X(obj.x), Y(obj.y), obj.width, obj.height)} />
    case 'diamond':
      return <path {...pathCommon} d={diamondPath(X(obj.x), Y(obj.y), obj.width, obj.height)} />
    case 'star':
      return <path {...pathCommon} d={starPath(X(obj.x), Y(obj.y), obj.width, obj.height)} />
    case 'cross':
      return <path {...pathCommon} d={crossPath(X(obj.x), Y(obj.y), obj.width, obj.height)} />
    case 'arrow':
      return <path {...pathCommon} d={arrowPath(X(obj.x), Y(obj.y), obj.width, obj.height)} />
    case 'text': {
      /* Underline and strikethrough are independent, so text-decoration takes
         both — `underline line-through` is valid and renders both rules. */
      const deco = [obj.underline && 'underline', obj.strike && 'line-through']
        .filter(Boolean).join(' ') || 'none'
      /* Wrapped against the object's width — SVG will not do this itself, so
         the lines are measured and emitted as tspans. */
      const L      = layoutText(obj)
      const lines  = L.lines
      const fs_    = obj.fontSize || 60
      const lh     = L.lineH
      const anchor = obj.align === 'center' ? 'middle' : obj.align === 'right' ? 'end' : 'start'
      const body = (
        <text opacity={opacity}
          x={X(obj.x)} y={Y(obj.y)}
          /* obj.fill is truthy for 'transparent', so a plain || never caught
             it — a label saved with that value stayed invisible forever. */
          fill={(obj.fill && obj.fill !== 'transparent' && obj.fill !== 'none') ? obj.fill : '#0B101D'}
          fontSize={fs_} fontFamily={obj.fontFamily || 'Montserrat'}
          fontWeight={obj.bold ? 'bold' : 'normal'}
          fontStyle={obj.italic ? 'italic' : 'normal'}
          textDecoration={deco}
          letterSpacing={obj.letterSpacing ?? 0}
          textAnchor={anchor}
        >
          {lines.length > 1
            ? lines.map((ln, i) => (
                <tspan key={i} x={X(obj.x)} dy={i === 0 ? 0 : lh}>{ln}</tspan>
              ))
            : obj.text}
        </text>
      )
      if (!obj.bgFill || obj.bgFill === 'none') return body
      /* Background plate sized from the longest line — SVG gives no metrics
         without measuring, so this approximates at 0.58em per character,
         which is close for the loaded faces and never clips the text. */
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
      const w = longest * fs_ * 0.58 + fs_ * 0.5
      const h = lines.length * lh + fs_ * 0.35
      const bx = anchor === 'middle' ? X(obj.x) - w / 2 : anchor === 'end' ? X(obj.x) - w : X(obj.x) - fs_ * 0.25
      return (
        <g>
          <rect x={bx} y={Y(obj.y) - fs_} width={w} height={h} rx={fs_ * 0.15}
            fill={obj.bgFill} opacity={opacity}/>
          {body}
        </g>
      )
    }

    // ── Storage & Racking ─────────────────────────────────────────────────────
    case 'rack_row': {
      // Beam-array based rendering — uprights + bays with PalletGrid
      const bx = X(obj.x), by = Y(obj.y), bw = obj.width, bh = obj.height
      const upIn = obj.uprightWidth || 3
      const upW  = (upIn / 12) * gridSize
      const beams = obj.beams || [96]
      const activeBay = printMode ? null : (obj.activeBayIdx ?? null)
      const uprightXs = [bx]
      let cursor = bx + upW
      beams.forEach(beamIn => {
        cursor += (beamIn/12)*gridSize; uprightXs.push(cursor); cursor += upW
      })
      /* SELECTIVE — bay cells and nothing else. Interior uprights are hairline
         dividers; only the two ends get a solid pine cap, which is what stops
         a selective row reading as a drive-in's closed back wall. No centre
         line: the spec calls it out because a horizontal rule through the box
         is how a single row gets mistaken for a double. */
      const { edge, hair } = rackLines(zoom)
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by} width={bw} height={bh} fill={RK.fill} stroke={RK.border} strokeWidth={edge} rx={0}/>
          {/* Bay tints paint only when a bay is actually picked — an untinted
              bay is just the box showing through, which costs no node. */}
          {beams.map((beamIn, i) => {
            const isActive   = activeBay === i
            const isMultiSel = activeBaySelection.some(e => e.objId === obj.id && e.bayIdx === i)
            if (!isActive && !isMultiSel) return null
            const beamX  = uprightXs[i] + upW
            const beamPx = (beamIn/12)*gridSize
            return <rect key={'b'+i} x={beamX} y={by} width={beamPx} height={bh}
              fill={isMultiSel ? '#f0b42944' : RK.structure + '26'} stroke="none"/>
          })}
          {/* one divider per interior bay boundary → beams.length cells */}
          {uprightXs.slice(1, -1).map((ux, i) => (
            <line key={'d'+i} x1={ux + upW/2} y1={by} x2={ux + upW/2} y2={by+bh}
              stroke={RK.divider} strokeWidth={hair}/>
          ))}
          {activeBay !== null && (() => { const bx2=uprightXs[activeBay]+upW, bp=(beams[activeBay]/12)*gridSize; return <rect x={bx2} y={by} width={bp} height={bh} fill="none" stroke="var(--accent)" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/> })()}
          {activeBaySelection.filter(e=>e.objId===obj.id).map(({bayIdx}) => { const bx2=uprightXs[bayIdx]+upW, bp=(beams[bayIdx]/12)*gridSize; return <rect key={'ms'+bayIdx} x={bx2} y={by} width={bp} height={bh} fill="none" stroke="#f0b429" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/> })}
        </g>
      )
    }
    case 'rack_pallet_flow': {
      /* PALLET FLOW · FIFO — lanes with a roller hint: two dashed lines running
         the full depth of each lane, which is the track a pallet rolls along.
         Load high side, pick low side, so the arrows sit at one face only. */
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const { upW, laneW, postXs, laneCx } = laneGeom(obj, bx, bw, gridSize)
      const inset = laneW * 0.22
      const dash  = `${3.5/zoom} ${3.5/zoom}`
      const w     = 1 / zoom
      const pad   = bh * 0.04
      return (
        <g opacity={opacity}>
          <LaneChassis bx={bx} by={by} bw={bw} bh={bh} postXs={postXs} upW={upW} zoom={zoom}/>
          {laneCx.map((cx, i) => (
            <g key={'r'+i} pointerEvents="none">
              <line x1={cx-inset} y1={by+pad} x2={cx-inset} y2={by+bh-pad}
                stroke={RK.roller} strokeWidth={w} strokeDasharray={dash} opacity={0.95}/>
              <line x1={cx+inset} y1={by+pad} x2={cx+inset} y2={by+bh-pad}
                stroke={RK.roller} strokeWidth={w} strokeDasharray={dash} opacity={0.95}/>
            </g>
          ))}
          {laneCx.map((cx, i) => (
            <LaneArrow key={'a'+i} cx={cx} edgeY={by+bh} side="below" zoom={zoom}/>
          ))}
        </g>
      )
    }    case 'rack_drive_through': {
      /* DRIVE-THROUGH · FIFO — the same lanes as drive-in with NO back wall,
         and arrows at both ends running the same way. Load one face, pick the
         other; the open far end is the whole difference. */
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const { upW, postXs, laneCx } = laneGeom(obj, bx, bw, gridSize)
      return (
        <g opacity={opacity}>
          <LaneChassis bx={bx} by={by} bw={bw} bh={bh} postXs={postXs} upW={upW} zoom={zoom}/>
          {laneCx.map((cx, i) => (
            <g key={'a'+i}>
              <LaneArrow cx={cx} edgeY={by+bh} side="below" zoom={zoom}/>
              <LaneArrow cx={cx} edgeY={by} side="above" zoom={zoom}/>
            </g>
          ))}
        </g>
      )
    }    case 'rack_pushback': {
      /* PUSH-BACK · LIFO — lanes carrying a stack of nested carts. Each cart
         sits slightly narrower than the one in front of it, which is what a
         nested cart set actually looks like from above and reads as the
         incline running back into the lane. Arrows at the single open face. */
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const { upW, laneW, postXs, laneCx } = laneGeom(obj, bx, bw, gridSize)
      const deep = Math.max(1, Math.min(obj.palletDeep || 4, 8))
      const { hair } = rackLines(zoom)
      const pad  = laneW * 0.12
      const slot = (bh - pad * 2) / deep
      const cartH = slot * 0.68
      return (
        <g opacity={opacity}>
          <LaneChassis bx={bx} by={by} bw={bw} bh={bh} postXs={postXs} upW={upW} zoom={zoom}/>
          {laneCx.map((cx, i) => (
            <g key={'l'+i}>
              {Array.from({ length: deep }, (_, d) => {
                /* d = 0 is the back of the lane, so the deepest cart is the
                   narrowest — the nest tapers away from the open face. */
                const inset = pad + (deep - 1 - d) * (laneW * 0.05)
                const w = Math.max(laneW * 0.25, laneW - inset * 2)
                const y = by + pad + d * slot + (slot - cartH) / 2
                return <rect key={'c'+d} x={cx - w/2} y={y} width={w} height={cartH}
                  fill="none" stroke={RK.border} strokeWidth={hair} rx={0}/>
              })}
            </g>
          ))}
          {laneCx.map((cx, i) => (
            <LaneArrow key={'a'+i} cx={cx} edgeY={by+bh} side="below" zoom={zoom}/>
          ))}
        </g>
      )
    }    case 'rack_drive_in': {
      /* DRIVE-IN · LIFO — lanes, a CLOSED back wall, and entry arrows at the
         one open end. Trucks go in and reverse out of the same face, which is
         exactly what the single row of arrows says. */
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const { upW, postXs, laneCx } = laneGeom(obj, bx, bw, gridSize)
      return (
        <g opacity={opacity}>
          <LaneChassis bx={bx} by={by} bw={bw} bh={bh} postXs={postXs} upW={upW} zoom={zoom} backWall/>
          {laneCx.map((cx, i) => (
            <LaneArrow key={'a'+i} cx={cx} edgeY={by+bh} side="below" zoom={zoom}/>
          ))}
        </g>
      )
    }
    case 'rack_double_row': {
      const bx = X(obj.x), by = Y(obj.y), bw = obj.width, bh = obj.height
      const upW   = ((obj.uprightWidth||3)/12) * gridSize
      const flueH = ((obj.flueSpaceIn || 6) / 12) * gridSize
      const rowH  = (bh - flueH) / 2
      const beams = obj.beams || [96]
      const activeBay = printMode ? null : (obj.activeBayIdx ?? null)

      // Build upright X positions from beams array
      const uprightXs = [bx]
      let cursor = bx + upW
      beams.forEach(beamIn => {
        cursor += (beamIn / 12) * gridSize
        uprightXs.push(cursor)
        cursor += upW
      })

      /* DOUBLE ROW — two bands with the flue between them. The orange flue line
         is the ONLY place this colour appears in the whole symbol set, so it is
         the single cue separating a double row from two singles parked next to
         each other. Its weight tracks the real flue dimension, clamped so it
         stays visible when the gap is only 6". */
      const { edge: dEdge, hair: dHair } = rackLines(zoom)
      const flueW = Math.max(dHair * 1.4, Math.min(flueH, dHair * 4))
      return (
        <g opacity={opacity}>
          {/* Top row */}
          <rect x={bx} y={by} width={bw} height={rowH} fill={RK.fill} stroke={RK.border} strokeWidth={dEdge} rx={0}/>
          {/* Bottom row */}
          <rect x={bx} y={by+rowH+flueH} width={bw} height={rowH} fill={RK.fill} stroke={RK.border} strokeWidth={dEdge} rx={0}/>
          {/* The flue — one orange line, centred in the gap */}
          <line x1={bx} y1={by+rowH+flueH/2} x2={bx+bw} y2={by+rowH+flueH/2}
            stroke={RK.flue} strokeWidth={flueW}/>
          {/* Bay highlights — painted only when a bay is actually picked */}
          {beams.map((beamIn, i) => {
            const isActive = activeBay === i
            const isMultiSel = activeBaySelection.some(e => e.objId === obj.id && e.bayIdx === i)
            if (!isActive && !isMultiSel) return null
            const beamX = uprightXs[i] + upW
            const beamPx = (beamIn / 12) * gridSize
            const fillColor = isMultiSel ? '#f0b42944' : RK.structure + '26'
            return (
              <g key={'bay'+i}>
                <rect x={beamX} y={by} width={beamPx} height={rowH} fill={fillColor} stroke="none"/>
                <rect x={beamX} y={by+rowH+flueH} width={beamPx} height={rowH} fill={fillColor} stroke="none"/>
              </g>
            )
          })}
          {/* Bay dividers on each band */}
          {uprightXs.slice(1, -1).map((ux, i) => (
            <g key={'d'+i}>
              <line x1={ux+upW/2} y1={by} x2={ux+upW/2} y2={by+rowH} stroke={RK.divider} strokeWidth={dHair}/>
              <line x1={ux+upW/2} y1={by+rowH+flueH} x2={ux+upW/2} y2={by+bh} stroke={RK.divider} strokeWidth={dHair}/>
            </g>
          ))}
          {/* Active bay indicator */}
          {activeBay !== null && (() => {
            const beamX = uprightXs[activeBay] + upW
            const beamPx = (beams[activeBay] / 12) * gridSize
            return (
              <g>
                <rect x={beamX} y={by} width={beamPx} height={rowH} fill="none" stroke="var(--accent)" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/>
                <rect x={beamX} y={by+rowH+flueH} width={beamPx} height={rowH} fill="none" stroke="var(--accent)" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/>
              </g>
            )
          })()}
          {/* Multi-selected bay indicators */}
          {activeBaySelection.filter(e => e.objId === obj.id).map(({ bayIdx }) => {
            const beamX = uprightXs[bayIdx] + upW
            const beamPx = (beams[bayIdx] / 12) * gridSize
            return (
              <g key={'ms'+bayIdx}>
                <rect x={beamX} y={by} width={beamPx} height={rowH} fill="none" stroke="#f0b429" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/>
                <rect x={beamX} y={by+rowH+flueH} width={beamPx} height={rowH} fill="none" stroke="#f0b429" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/>
              </g>
            )
          })}
        </g>
      )
    }
    case 'rack_cantilever': {
      const bx = X(obj.x), by = Y(obj.y), bw = obj.width, bh = obj.height

      const doubleSided    = obj.doubleSided ?? true
      const towers         = obj.towers || [36, 36, 36, 36, 36]  // arm length per tower
      const towerWidthIn   = obj.towerWidthIn   || 10
      const spineDepthIn   = obj.spineDepthIn   || 4
      const armThicknessIn = obj.armThicknessIn || 3
      const TSPACE_IN      = 48  // 48" tower spacing center-to-center

      const towerWPx   = (towerWidthIn   / 12) * gridSize
      const spineHPx   = (spineDepthIn   / 12) * gridSize
      const armThickPx = (armThicknessIn / 12) * gridSize
      const tSpacePx   = (TSPACE_IN      / 12) * gridSize

      // Spine position:
      // Single-sided → spine at TOP (wall side), arms extend downward
      // Double-sided → spine centered, arms extend both up and down
      const spineY = doubleSided
        ? by + (bh - spineHPx) / 2
        : by  // flush at top for single-sided (wall side)

      // Tower positions — evenly spaced at 48" from first to last
      const towerCount   = towers.length
      const actualSpacePx = towerCount > 1 ? bw / (towerCount - 1) : bw
      const towerCXs     = Array.from({ length: towerCount }, (_, i) =>
        bx + i * actualSpacePx
      )

      const activeTower = obj.activeTowerIdx ?? null

      return (
        <g opacity={opacity}>
          {/* Transparent hit area */}
          <rect x={bx} y={by} width={bw} height={bh} fill="transparent" stroke="none"/>

          {/* Spine */}
          <rect x={bx} y={spineY} width={bw} height={spineHPx}
            fill={RK.structure} opacity={0.55} stroke="none"/>

          {/* X-brace */}
          <line x1={towerCXs[0]} y1={spineY}
                x2={towerCXs[towerCount-1]} y2={spineY + spineHPx}
                stroke={RK.structure} strokeWidth={1/zoom} opacity={0.5}/>
          <line x1={towerCXs[0]} y1={spineY + spineHPx}
                x2={towerCXs[towerCount-1]} y2={spineY}
                stroke={RK.structure} strokeWidth={1/zoom} opacity={0.5}/>

          {/* Arms + towers */}
          {towerCXs.map((cx, i) => {
            const armIn   = towers[i] || 36
            const armPx   = (armIn / 12) * gridSize
            const ax      = cx - armThickPx / 2
            const tx      = cx - towerWPx / 2
            const isActive = activeTower === i
            const isMulti  = activeBaySelection.some(e => e.objId === obj.id && e.bayIdx === i)
            const armFill  = isMulti ? '#f0b42944' : isActive ? RK.structure + '44' : RK.fill
            return (
              <g key={i}>
                {/* Front arm — above spine for double, below for single */}
                <rect x={ax} y={doubleSided ? spineY - armPx : spineY + spineHPx}
                  width={armThickPx} height={armPx}
                  fill={armFill} stroke={RK.structure} strokeWidth={strokeWidth} rx={0}/>
                {/* Back arm (double-sided only — below spine) */}
                {doubleSided && (
                  <rect x={ax} y={spineY + spineHPx} width={armThickPx} height={armPx}
                    fill={armFill} stroke={RK.structure} strokeWidth={strokeWidth} rx={0}/>
                )}
                {/* Tower post */}
                <rect x={tx} y={spineY} width={towerWPx} height={spineHPx}
                  fill={RK.structure} opacity={0.9} stroke="none"/>
                {/* Active tower indicator */}
                {isActive && (
                  <rect x={ax}
                    y={doubleSided ? spineY - armPx : spineY}
                    width={armThickPx}
                    height={doubleSided ? armPx * 2 + spineHPx : armPx + spineHPx}
                    fill="none" stroke="var(--accent)" strokeWidth={2/zoom}
                    strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/>
                )}
                {/* Multi-select indicator */}
                {isMulti && (
                  <rect x={ax}
                    y={doubleSided ? spineY - armPx : spineY}
                    width={armThickPx}
                    height={doubleSided ? armPx * 2 + spineHPx : armPx + spineHPx}
                    fill="none" stroke="#f0b429" strokeWidth={2/zoom}
                    strokeDasharray={`${4/zoom} ${2/zoom}`} rx={0} pointerEvents="none"/>
                )}
              </g>
            )
          })}

        </g>
      )
    }
    case 'rack_mezzanine': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const gx=Math.max(3,Math.round(bw/(40*6))), gy=Math.max(2,Math.round(bh/(40*6)))
      return (
        <g>
          <rect {...pathCommon} x={bx} y={by} width={bw} height={bh} rx={0}/>
          {Array.from({length:gx-1},(_,i)=><line key={i} x1={bx+bw*(i+1)/gx} y1={by} x2={bx+bw*(i+1)/gx} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*0.4} opacity={opacity*0.3}/>)}
          {Array.from({length:gy-1},(_,i)=><line key={i} x1={bx} y1={by+bh*(i+1)/gy} x2={bx+bw} y2={by+bh*(i+1)/gy} stroke={stroke} strokeWidth={strokeWidth*0.4} opacity={opacity*0.3}/>)}
          {[0,1,2,3].map(i=><rect key={i} x={bx+bw*0.82-i*6} y={by+bh*0.78+i*5} width={bw*0.12} height={4} fill={stroke} opacity={opacity*0.55}/>)}
        </g>
      )
    }
    case 'rack_shelving': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g>
          <rect {...pathCommon} x={bx} y={by} width={bw} height={bh} rx={0}/>
          <line x1={bx} y1={by} x2={bx} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*1.5} opacity={opacity}/>
          <line x1={bx+bw} y1={by} x2={bx+bw} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*1.5} opacity={opacity}/>
          <line x1={bx} y1={by+bh/2} x2={bx+bw} y2={by+bh/2} stroke={stroke} strokeWidth={strokeWidth*0.8} opacity={opacity}/>
        </g>
      )
    }

    case 'aisle': {
      const row1 = objects.find(o => o.id === obj.row1Id)
      const row2 = objects.find(o => o.id === obj.row2Id)
      if (!row1 || !row2) return null

      const X1 = (v) => v + dx, Y1 = (v) => v + dy
      const b1 = { x: X1(row1.x), y: Y1(row1.y), r: X1(row1.x+row1.width), b: Y1(row1.y+row1.height) }
      const b2 = { x: X1(row2.x), y: Y1(row2.y), r: X1(row2.x+row2.width), b: Y1(row2.y+row2.height) }

      const yGap = Math.max(b2.x - b1.r, b1.x - b2.r)
      const xGap = Math.max(b2.y - b1.b, b1.y - b2.b)
      const isHoriz = xGap >= yGap

      let ax, ay, aw, ah
      if (isHoriz) {
        const top = b1.b < b2.y ? b1 : b2
        const bot = b1.b < b2.y ? b2 : b1
        ax = Math.max(top.x, bot.x)
        ay = top.b
        aw = Math.min(top.r, bot.r) - ax
        ah = bot.y - top.b
      } else {
        const lft = b1.r < b2.x ? b1 : b2
        const rgt = b1.r < b2.x ? b2 : b1
        ax = lft.r
        ay = Math.max(lft.y, rgt.y)
        aw = rgt.x - lft.r
        ah = Math.min(lft.b, rgt.b) - ay
      }
      if (aw <= 0 || ah <= 0) return null
      return (
        <rect x={ax} y={ay} width={aw} height={ah}
          fill={selected ? '#f0b42915' : 'transparent'}
          stroke={selected ? '#f0b429' : 'transparent'}
          strokeWidth={selected ? 1.5/zoom : 0}
          strokeDasharray={selected ? `${4/zoom} ${2/zoom}` : 'none'}
          rx={2/zoom} style={{ cursor: 'pointer' }}/>
      )
    }

    // ── MHE ──────────────────────────────────────────────────────────────────
    case 'mhe_forklift': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by+bh*0.22} width={bw} height={bh*0.55} rx={bw*0.1} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <rect x={bx+bw*0.15} y={by+bh*0.27} width={bw*0.7} height={bh*0.3} rx={bw*0.06} fill={stroke} opacity={0.2}/>
          <rect x={bx+bw*0.1} y={by} width={bw*0.15} height={bh*0.24} rx={1} fill={stroke} opacity={0.8}/>
          <rect x={bx+bw*0.75} y={by} width={bw*0.15} height={bh*0.24} rx={1} fill={stroke} opacity={0.8}/>
          <ellipse cx={bx+bw*0.25} cy={by+bh*0.77} rx={bw*0.15} ry={bh*0.07} fill={stroke} opacity={0.5}/>
          <ellipse cx={bx+bw*0.75} cy={by+bh*0.77} rx={bw*0.15} ry={bh*0.07} fill={stroke} opacity={0.5}/>
        </g>
      )
    }
    case 'mhe_reach_truck': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by+bh*0.2} width={bw} height={bh*0.5} rx={bw*0.1} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <rect x={bx+bw*0.1} y={by} width={bw*0.12} height={bh*0.22} rx={1} fill={stroke} opacity={0.7}/>
          <rect x={bx+bw*0.78} y={by} width={bw*0.12} height={bh*0.22} rx={1} fill={stroke} opacity={0.7}/>
          <rect x={bx+bw*0.1} y={by} width={bw*0.8} height={bh*0.04} fill={stroke} opacity={0.5}/>
          <rect x={bx} y={by+bh*0.68} width={bw*0.3} height={bh*0.06} rx={1} fill={stroke} opacity={0.4}/>
          <rect x={bx+bw*0.7} y={by+bh*0.68} width={bw*0.3} height={bh*0.06} rx={1} fill={stroke} opacity={0.4}/>
        </g>
      )
    }
    case 'mhe_vna': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by+bh*0.2} width={bw} height={bh*0.5} rx={bw*0.1} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <rect x={bx+bw*0.1} y={by} width={bw*0.12} height={bh*0.22} rx={1} fill={stroke} opacity={0.7}/>
          <rect x={bx+bw*0.78} y={by} width={bw*0.12} height={bh*0.22} rx={1} fill={stroke} opacity={0.7}/>
        </g>
      )
    }
    case 'mhe_pallet_jack': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by+bh*0.35} width={bw} height={bh*0.45} rx={bw*0.1} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <rect x={bx+bw*0.1} y={by} width={bw*0.25} height={bh*0.37} rx={1} fill={stroke} opacity={0.7}/>
          <rect x={bx+bw*0.65} y={by} width={bw*0.25} height={bh*0.37} rx={1} fill={stroke} opacity={0.7}/>
          <circle cx={bx+bw*0.25} cy={by+bh*0.78} r={bw*0.15} fill="none" stroke={stroke} strokeWidth={strokeWidth}/>
          <circle cx={bx+bw*0.75} cy={by+bh*0.78} r={bw*0.15} fill="none" stroke={stroke} strokeWidth={strokeWidth}/>
        </g>
      )
    }
    case 'mhe_conveyor': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const rc=Math.max(3,Math.round(bw/(40*0.5))), rs=bw/rc
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by} width={bw} height={bh} rx={bh*0.2} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          {Array.from({length:rc-1},(_,i)=><line key={i} x1={bx+rs*(i+1)} y1={by+bh*0.15} x2={bx+rs*(i+1)} y2={by+bh*0.85} stroke={stroke} strokeWidth={strokeWidth*1.2} opacity={0.55}/>)}
          <path d={`M${bx+bw*0.25} ${by+bh*0.5} L${bx+bw*0.7} ${by+bh*0.5} M${bx+bw*0.6} ${by+bh*0.28} L${bx+bw*0.7} ${by+bh*0.5} L${bx+bw*0.6} ${by+bh*0.72}`} stroke={stroke} strokeWidth={strokeWidth*0.8} strokeLinecap="round" fill="none" opacity={0.7}/>
        </g>
      )
    }
    case 'mhe_agv': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by} width={bw} height={bh} rx={bw*0.15} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <path d={`M${bx+bw*0.5} ${by+bh*0.65} L${bx+bw*0.5} ${by+bh*0.35} M${bx+bw*0.32} ${by+bh*0.5} L${bx+bw*0.5} ${by+bh*0.35} L${bx+bw*0.68} ${by+bh*0.5}`} stroke={stroke} strokeWidth={strokeWidth*1.2} strokeLinecap="round" fill="none"/>
          {[[0.1,0.1],[0.9,0.1],[0.1,0.9],[0.9,0.9]].map(([rx,ry],i)=><circle key={i} cx={bx+bw*rx} cy={by+bh*ry} r={bw*0.1} fill={stroke} opacity={0.45}/>)}
        </g>
      )
    }
    case 'mhe_dock_leveler': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const ch2=Math.max(2,Math.round(bw/(40*2))), cw2=bw/ch2
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by+bh*0.2} width={bw} height={bh*0.7} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1}/>
          <rect x={bx} y={by} width={bw} height={bh*0.2} fill={stroke} opacity={0.4}/>
          {Array.from({length:ch2},(_,i)=><path key={i} d={`M${bx+cw2*i+cw2*0.15} ${by+bh*0.35} L${bx+cw2*i+cw2*0.5} ${by+bh*0.65} L${bx+cw2*i+cw2*0.85} ${by+bh*0.35}`} stroke={stroke} strokeWidth={strokeWidth*0.8} fill="none" opacity={0.5} strokeLinecap="round"/>)}
        </g>
      )
    }

    // ── Structural ────────────────────────────────────────────────────────────
    case 'column_grid': {
      const bx = X(obj.x), by = Y(obj.y)
      const spacingX    = obj.spacingX || [obj.width  || 40*40]
      const spacingY    = obj.spacingY || [obj.height || 40*40]
      const colW        = obj.columnW || (12/12)*gridSize
      const colH        = obj.columnH || (12/12)*gridSize
      const showGrid    = obj.showGrid    !== false
      const wallAttached= obj.wallAttached !== false

      // Compute column X positions
      const colXs = [bx]
      spacingX.forEach(s => colXs.push(colXs[colXs.length-1] + s))

      // Compute column Y positions
      const colYs = [by]
      spacingY.forEach(s => colYs.push(colYs[colYs.length-1] + s))

      return (
        <g opacity={opacity}>
          {/* Faint grid lines */}
          {showGrid && colXs.map((cx, i) => (
            <line key={'gv'+i} x1={cx+colW/2} y1={colYs[0]} x2={cx+colW/2} y2={colYs[colYs.length-1]+colH}
              stroke={stroke} strokeWidth={0.5/zoom} opacity={0.2}/>
          ))}
          {showGrid && colYs.map((cy, i) => (
            <line key={'gh'+i} x1={colXs[0]} y1={cy+colH/2} x2={colXs[colXs.length-1]+colW} y2={cy+colH/2}
              stroke={stroke} strokeWidth={0.5/zoom} opacity={0.2}/>
          ))}
          {/* Column squares at each intersection */}
          {colYs.map((cy, row) =>
            colXs.map((cx, col) => (
              <g key={`c${row}_${col}`}>
                {/* Column body */}
                <rect x={cx} y={cy} width={colW} height={colH}
                  fill={stroke} stroke="none" opacity={0.85}/>
                {/* I-beam web detail */}
                <rect x={cx+colW*0.3} y={cy} width={colW*0.4} height={colH}
                  fill={stroke} opacity={0.5}/>
                <rect x={cx} y={cy} width={colW} height={colH*0.15} fill={stroke} opacity={0.9}/>
                <rect x={cx} y={cy+colH*0.85} width={colW} height={colH*0.15} fill={stroke} opacity={0.9}/>
              </g>
            ))
          )}

        </g>
      )
    }
    case 'struct_column': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by} width={bw} height={bh} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <rect x={bx} y={by} width={bw} height={bh*0.2} fill={stroke} opacity={0.5}/>
          <rect x={bx} y={by+bh*0.8} width={bw} height={bh*0.2} fill={stroke} opacity={0.5}/>
          <rect x={bx+bw*0.35} y={by+bh*0.2} width={bw*0.3} height={bh*0.6} fill={stroke} opacity={0.3}/>
        </g>
      )
    }
    case 'struct_loading_dock': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by+bh*0.6} width={bw} height={bh*0.12} fill={stroke} opacity={0.5}/>
          <rect x={bx+bw*0.15} y={by} width={bw*0.7} height={bh*0.6} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1}/>
          <line x1={bx+bw*0.15} y1={by+bh*0.3} x2={bx+bw*0.85} y2={by+bh*0.3} stroke={stroke} strokeWidth={strokeWidth*0.6} opacity={0.45}/>
          <line x1={bx+bw*0.15} y1={by+bh*0.55} x2={bx+bw*0.85} y2={by+bh*0.55} stroke={stroke} strokeWidth={strokeWidth*0.6} opacity={0.45}/>
          <rect x={bx+bw*0.08} y={by+bh*0.6} width={bw*0.1} height={bh*0.15} rx={2} fill={stroke} opacity={0.55}/>
          <rect x={bx+bw*0.82} y={by+bh*0.6} width={bw*0.1} height={bh*0.15} rx={2} fill={stroke} opacity={0.55}/>
        </g>
      )
    }
    case 'struct_partition': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const hs=Math.max(8,bw*0.04), hc=Math.floor(bw/hs)
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by} width={bw} height={bh} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          {Array.from({length:hc},(_,i)=><line key={i} x1={bx+hs*i} y1={by} x2={bx+hs*i+bh} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*0.5} opacity={0.4}/>)}
        </g>
      )
    }
    case 'struct_egress': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const dw=bw*0.6
      return (
        <g opacity={opacity}>
          <line x1={bx} y1={by} x2={bx} y2={by+bh*0.5} stroke={stroke} strokeWidth={strokeWidth*1.5}/>
          <line x1={bx+bw} y1={by} x2={bx+bw} y2={by+bh*0.5} stroke={stroke} strokeWidth={strokeWidth*1.5}/>
          <rect x={bx} y={by} width={dw} height={bh*0.08} rx={1} fill={stroke} opacity={0.6}/>
          <path d={`M${bx} ${by+bh*0.08} Q${bx+dw*0.7} ${by+bh*0.08} ${bx+dw} ${by+bh*0.08+dw*0.7}`} stroke={stroke} strokeWidth={strokeWidth*0.7} fill="none" strokeDasharray={`${strokeWidth*4} ${strokeWidth*2}`} opacity={0.5}/>
          <line x1={bx} y1={by+bh*0.08} x2={bx+dw} y2={by+bh*0.08+dw*0.7} stroke={stroke} strokeWidth={strokeWidth*0.9}/>
        </g>
      )
    }
    case 'struct_window': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (
        <g opacity={opacity}>
          <rect x={bx} y={by} width={bw} height={bh} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
          <line x1={bx} y1={by} x2={bx+bw} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*0.5} opacity={0.35}/>
          <line x1={bx} y1={by+bh} x2={bx+bw} y2={by} stroke={stroke} strokeWidth={strokeWidth*0.5} opacity={0.35}/>
        </g>
      )
    }

    // ── Safety ────────────────────────────────────────────────────────────────
    case 'safety_bollard': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const cx2=bx+bw/2, cy2=by+bh/2, r=Math.min(bw,bh)/2
      return (<g opacity={opacity}><circle cx={cx2} cy={cy2} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/><circle cx={cx2} cy={cy2} r={r*0.4} fill={stroke} opacity={0.4}/></g>)
    }
    case 'safety_guardrail': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const pc=Math.max(2,Math.round(bw/(40*2))), ps=bw/(pc-1)
      return (<g opacity={opacity}><line x1={bx} y1={by+bh/2} x2={bx+bw} y2={by+bh/2} stroke={stroke} strokeWidth={strokeWidth*2}/>{Array.from({length:pc},(_,i)=><line key={i} x1={bx+ps*i} y1={by+bh*0.1} x2={bx+ps*i} y2={by+bh*0.9} stroke={stroke} strokeWidth={strokeWidth*1.5}/>)}</g>)
    }
    case 'safety_rack_guard': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (<g opacity={opacity}><path d={`M${bx+bw*0.1} ${by+bh} L${bx+bw*0.1} ${by+bh*0.15} Q${bx+bw*0.1} ${by} ${bx+bw*0.5} ${by} Q${bx+bw*0.9} ${by} ${bx+bw*0.9} ${by+bh*0.15} L${bx+bw*0.9} ${by+bh} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/></g>)
    }
    case 'safety_netting': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (<g opacity={opacity}><rect x={bx} y={by} width={bw} height={bh} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} strokeDasharray={`${strokeWidth*6} ${strokeWidth*2}`}/></g>)
    }
    case 'safety_sign': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (<g opacity={opacity}><rect x={bx} y={by+bh*0.1} width={bw} height={bh*0.6} rx={bw*0.08} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/><line x1={bx+bw*0.5} y1={by+bh*0.7} x2={bx+bw*0.5} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*1.2}/><line x1={bx+bw*0.2} y1={by+bh} x2={bx+bw*0.8} y2={by+bh} stroke={stroke} strokeWidth={strokeWidth*1.2}/></g>)
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    case 'util_charging': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const sl=Math.max(2,Math.round(bw/(40*2.5))), sw2=(bw*0.85)/sl
      return (<g opacity={opacity}><rect x={bx} y={by} width={bw} height={bh} rx={bw*0.04} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>{Array.from({length:sl},(_,i)=><rect key={i} x={bx+bw*0.08+sw2*i+sw2*0.05} y={by+bh*0.12} width={sw2*0.9} height={bh*0.5} rx={3} fill={stroke} opacity={0.25} stroke={stroke} strokeWidth={strokeWidth*0.6}/>)}</g>)
    }
    case 'util_hvac': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const cx2=bx+bw/2, cy2=by+bh/2, r=Math.min(bw,bh)*0.45
      return (<g opacity={opacity}><circle cx={cx2} cy={cy2} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/><circle cx={cx2} cy={cy2} r={r*0.2} fill={stroke} opacity={0.6}/>{[0,90,180,270].map(a=>{const rad=a*Math.PI/180,x1=cx2+r*0.2*Math.cos(rad),y1=cy2+r*0.2*Math.sin(rad),x2=cx2+r*0.85*Math.cos(rad+0.5),y2=cy2+r*0.85*Math.sin(rad+0.5); return <path key={a} d={`M${x1} ${y1} Q${cx2+r*0.6*Math.cos(rad+0.2)} ${cy2+r*0.6*Math.sin(rad+0.2)} ${x2} ${y2}`} stroke={stroke} strokeWidth={strokeWidth*1.5} fill={stroke+'33'} opacity={0.7}/>})}</g>)
    }
    case 'util_sprinkler': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const cx2=bx+bw/2, cy2=by+bh/2, r=Math.min(bw,bh)*0.2, or=Math.min(bw,bh)*0.45
      return (<g opacity={opacity}><circle cx={cx2} cy={cy2} r={r} fill={stroke} opacity={0.7}/>{[0,45,90,135,180,225,270,315].map(a=>{const rad=a*Math.PI/180; return <line key={a} x1={cx2+r*Math.cos(rad)} y1={cy2+r*Math.sin(rad)} x2={cx2+or*Math.cos(rad)} y2={cy2+or*Math.sin(rad)} stroke={stroke} strokeWidth={strokeWidth} opacity={0.55}/>})}</g>)
    }
    case 'util_lighting': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      const sc=Math.max(2,Math.round(bw/(40*0.8))), sw3=bw/sc
      return (<g opacity={opacity}><rect x={bx} y={by+bh*0.2} width={bw} height={bh*0.6} rx={bh*0.15} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>{Array.from({length:sc},(_,i)=><rect key={i} x={bx+sw3*i+sw3*0.08} y={by+bh*0.28} width={sw3*0.84} height={bh*0.44} rx={bh*0.1} fill={stroke} opacity={0.45}/>)}<line x1={bx+bw/2} y1={by} x2={bx+bw/2} y2={by+bh*0.2} stroke={stroke} strokeWidth={strokeWidth*1.5}/></g>)
    }
    case 'util_office_desk': {
      const bx=X(obj.x), by=Y(obj.y), bw=obj.width, bh=obj.height
      return (<g opacity={opacity}><rect x={bx} y={by} width={bw} height={bh*0.7} rx={bw*0.04} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/><rect x={bx+bw*0.3} y={by+bh*0.1} width={bw*0.4} height={bh*0.35} rx={2} fill={stroke} opacity={0.2} stroke={stroke} strokeWidth={strokeWidth*0.7}/><circle cx={bx+bw*0.5} cy={by+bh*0.87} r={Math.min(bw,bh)*0.18} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/></g>)
    }

    default:
      return null
  }
}