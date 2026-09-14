import { useMemo, useCallback } from 'react'
import { Shape, Rect, Path, Group } from 'react-konva'
import { insetPolygon } from '../../utils/canvas'

/* ── STEP 2 · grid + building, drawn in Konva ────────────────────────────────
   Both read the same store values the SVG reads, and both draw in WORLD
   coordinates inside the Stage transform — so pan/zoom stays a property of the
   Stage and nothing here recomputes when the view moves.

   Each is ONE Konva node with a custom sceneFunc rather than a tree of Lines.
   A grid built from React elements would be ~500 nodes reconciled on every pan;
   as a single Shape it is one node whose sceneFunc re-runs on redraw, which is
   the whole reason canvas beats SVG here. */

/* Mirrors CanvasArea's grid ladder exactly — same thresholds, so the Konva grid
   steps at the same zooms as the CSS one and the two can be compared honestly. */
const MIN_GRID_PX = 8
const GRID_LADDER = [1, 2, 4, 10, 20, 50, 100, 200, 500]

/** Visible world rectangle, read off the live Stage transform. */
function worldRect(stage) {
  const s = stage.scaleX() || 1
  return {
    x0: -stage.x() / s,
    y0: -stage.y() / s,
    x1: (stage.width()  - stage.x()) / s,
    y1: (stage.height() - stage.y()) / s,
    s,
  }
}

export function KonvaGrid({ gridSize, majorColor, minorColor }) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const stage = shape.getStage()
        if (!stage) return
        const { x0, y0, x1, y1, s } = worldRect(stage)
        const c = ctx._context

        /* Major spacing climbs the ladder so it never collapses into a smear
           when zoomed out — the same rule the CSS grid uses. */
        const majorBase = gridSize * 5
        const mul = GRID_LADDER.find(m => majorBase * m * s >= MIN_GRID_PX)
          ?? GRID_LADDER[GRID_LADDER.length - 1]

        const lines = (stepWorld, color) => {
          if (stepWorld * s < MIN_GRID_PX) return          // too dense to read
          c.beginPath()
          for (let x = Math.floor(x0 / stepWorld) * stepWorld; x <= x1; x += stepWorld) {
            c.moveTo(x, y0); c.lineTo(x, y1)
          }
          for (let y = Math.floor(y0 / stepWorld) * stepWorld; y <= y1; y += stepWorld) {
            c.moveTo(x0, y); c.lineTo(x1, y)
          }
          c.strokeStyle = color
          /* ÷ scale keeps the rule one screen pixel at any zoom. */
          c.lineWidth = 1 / s
          c.stroke()
        }

        lines(gridSize, minorColor)
        lines(majorBase * mul, majorColor)
      }}
    />
  )
}

export const FP_RENDER_TYPES = new Set(
  ['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

/** One floor plan: interior fill, then an exact wall-thickness ring.
 *
 *  Same construction as the SVG — outer polygon plus the inward-offset inner
 *  polygon, filled evenodd so the ring is exactly `wallThicknessFt` thick
 *  rather than a centred stroke that would straddle the boundary. insetPolygon
 *  is shared with the SVG path, so the two cannot drift. */
export function KonvaFloorPlan({ obj, gridSize, name, listening = false, zoom = 1 }) {
  const verts = obj.fpVerts

  /* A Shape drawn by a sceneFunc has no intrinsic size, so Konva reports a
     1px self-rect for it. Anything that measures the node then gets a dot:
     the Transformer would frame the whole building with a handle box a pixel
     across. Stating the real outline bounds fixes every such measurement at
     once. Computed before the early return so the hook order is stable. */
  const selfRect = useMemo(() => {
    if (!verts || verts.length < 3) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const v of verts) {
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }, [verts])

  const attachSelfRect = useCallback((node) => {
    if (node && selfRect) node.getSelfRect = () => selfRect
  }, [selfRect])

  if (!verts || verts.length < 3) return null

  const wt = obj.wallThicknessFt ? obj.wallThicknessFt * gridSize : (obj.strokeWidth || 10)
  const wallColor  = obj.stroke || '#4a5568'
  const floorColor = obj.noFill ? null : (obj.fill ?? 'rgba(14,20,30,0.88)')
  const inner = insetPolygon(verts, wt)

  return (
    <Shape
      ref={attachSelfRect}
      name={name}
      listening={listening}
      perfectDrawEnabled={false}
      opacity={obj.opacity ?? 1}
      /* A sceneFunc shape has no implicit hit area, so hit-testing needs one
         stated explicitly. It is the WALL BAND, not the footprint: the SVG
         only hits a floor plan on its wall, and making the interior grab-able
         would swallow every marquee drag started inside the building.

         The band is widened to the SVG's own 24/zoom reach. A real wall is
         often 3in — 10 world px, about ONE screen pixel at fit zoom — which is
         not a target anyone can hit. */
      stroke={wallColor} strokeWidth={Math.max(wt, 24 / zoom)}
      hitFunc={(ctx, shape) => {
        ctx.beginPath()
        verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
        ctx.closePath()
        ctx.strokeShape(shape)
      }}
      sceneFunc={(ctx, shape) => {
        const c = ctx._context
        const trace = (pts) => {
          pts.forEach((v, i) => (i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)))
          c.closePath()
        }

        // floor — interior only, so it never tints the wall
        if (floorColor) {
          c.beginPath(); trace(inner)
          c.fillStyle = floorColor
          c.fill()
        }

        // wall ring — outer minus inner
        c.beginPath()
        trace(verts)
        trace([...inner].reverse())
        c.fillStyle = wallColor
        c.fill('evenodd')
      }}
    />
  )
}

/* ── Draw-op painter ─────────────────────────────────────────────────────────
   Turns the renderer-neutral op list from render/rackOps.js into Konva nodes.
   It knows nothing about racks — add a type to rackOps and this paints it.

   strokeScaleEnabled={false} is what keeps a 1.5px edge 1.5px at any zoom,
   which is why the ops can carry plain screen-pixel widths instead of every
   caller dividing by zoom. */
export function KonvaOps({ ops, listening = false, opacity = 1, name,
                           cx = 0, cy = 0, rotation = 0 }) {
  if (!ops || !ops.length) return null
  /* The ops are absolute WORLD coordinates, so the group would otherwise sit at
     the origin and rotate about it — a rack would swing across the sheet
     instead of turning on the spot. Putting the node at the object's centre and
     pulling the same amount back off via offset leaves an identity transform,
     but moves the pivot to the centre. Rotation then spins the rack where it
     stands, and a Transformer gets a sane handle box for free. */
  return (
    <Group name={name} listening={listening} opacity={opacity}
      x={cx} y={cy} offsetX={cx} offsetY={cy} rotation={rotation}>
      {ops.map((o, i) => {
        if (o.op === 'rect') {
          return (
            <Rect key={i} x={o.x} y={o.y} width={o.w} height={o.h}
              fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
              opacity={o.opacity ?? 1}
              strokeScaleEnabled={false}
              perfectDrawEnabled={false} shadowForStrokeEnabled={false}
              listening={listening}/>
          )
        }
        if (o.op === 'path') {
          return (
            <Path key={i} data={o.d}
              fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
              dash={o.dash} opacity={o.opacity ?? 1}
              strokeScaleEnabled={false}
              perfectDrawEnabled={false} shadowForStrokeEnabled={false}
              listening={listening}/>
          )
        }
        /* Travel arrows are sized in SCREEN px — one size on the whole sheet,
           whatever the rack's depth. The op carries those screen measurements
           and they are divided by the live stage scale here, which is the only
           place the zoom is known; that is what lets rackDrawOps stay
           zoom-free and be memoised across pan and zoom. */
        if (o.op === 'arrows') {
          return (
            <Shape key={i} listening={false} perfectDrawEnabled={false}
              sceneFunc={(ctx, shape) => {
                const s = shape.getStage()?.scaleX() || 1
                const len = o.len / s, head = o.head / s, gap = o.gap / s
                const c = ctx._context
                c.strokeStyle = o.color; c.fillStyle = o.color
                c.lineWidth = o.strokeWidth / s
                for (const it of o.items) {
                  /* Every arrow points the same way (up = direction of travel),
                     so a near-face arrow reads as going in and a far-face one
                     as coming out. Anchored to the EDGE it addresses, so it is
                     always wholly outside the box. */
                  const tipY  = it.side === 'below' ? it.edgeY + gap : it.edgeY - gap - len
                  const baseY = tipY + head
                  c.beginPath(); c.moveTo(it.cx, tipY + len); c.lineTo(it.cx, baseY); c.stroke()
                  c.beginPath()
                  c.moveTo(it.cx - head * 0.48, baseY)
                  c.lineTo(it.cx, tipY)
                  c.lineTo(it.cx + head * 0.48, baseY)
                  c.closePath(); c.fill()
                }
              }}/>
          )
        }
        return null
      })}
    </Group>
  )
}
