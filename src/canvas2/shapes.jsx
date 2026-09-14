import { useCallback, useMemo } from 'react'
import { Group, Rect, Path, Shape, Circle, Line, Text } from 'react-konva'
import { getObjectBounds, insetPolygon } from '../utils/canvas'
import { expandColumnGrid } from '../generate/columnCheck'

/* ── STEP 2 · the painters ───────────────────────────────────────────────────
   Every object on the sheet is drawn by one of four painters. They read the
   store's objects and the frozen draw-op data and produce Konva nodes; they
   decide nothing about geometry, which lives in render/rackOps.js and is shared
   with the PDF path.

   Three rules carried over from the old attempt, learned the hard way:

     • ONE naming scheme. Every object's node is named `obj:<id>`, whatever
       painted it. The old canvas named racks and floor plans differently, and
       anything resolving a node from an id silently failed for exactly one
       kind of object.
     • Rotation pivots on the object's CENTRE. Ops are absolute world
       coordinates, so a group left at the origin swings across the sheet
       instead of turning on the spot. Position at the centre, pull the same
       amount back with offset: identity transform, correct pivot.
     • A sceneFunc Shape must state its own bounds. Konva reports a 1px
       self-rect otherwise, and everything that measures the node — a handle
       box, a fit, a hit test — gets a dot.

   Strokes are SCREEN px with strokeScaleEnabled off, so a hairline stays a
   hairline at 400% and does not vanish at 7%. */

export const nodeName = id => 'obj:' + id
export const idFromNode = n => {
  const nm = (n && n.name && n.name()) || ''
  return nm.startsWith('obj:') ? nm.slice(4) : null
}

const STRUCT_BLUE = '#3B6FB5'   // the building grid, and nothing else

/** Centre-origin transform props, shared by every painter so rotation behaves
 *  identically no matter which one drew the object. */
function spin(obj) {
  const b = getObjectBounds(obj)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  return { x: cx, y: cy, offsetX: cx, offsetY: cy, rotation: obj.rotation || 0 }
}

/* ── Draw-op painter ─────────────────────────────────────────────────────── */

/** Paints a renderer-neutral op list from render/rackOps.js.
 *  Knows nothing about racks: add a type there and this paints it. */
export function Ops({ ops, opacity = 1, listening = false }) {
  if (!ops || !ops.length) return null
  return (
    <>
      {ops.map((o, i) => {
        if (o.op === 'rect') {
          return (
            <Rect key={i} x={o.x} y={o.y} width={o.w} height={o.h}
              fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
              opacity={(o.opacity ?? 1) * opacity}
              strokeScaleEnabled={false} perfectDrawEnabled={false}
              shadowForStrokeEnabled={false} listening={listening} />
          )
        }
        if (o.op === 'path') {
          return (
            <Path key={i} data={o.d}
              fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
              dash={o.dash} opacity={(o.opacity ?? 1) * opacity}
              strokeScaleEnabled={false} perfectDrawEnabled={false}
              shadowForStrokeEnabled={false} listening={listening} />
          )
        }
        /* Travel arrows are a legend mark: ONE size on the whole sheet whatever
           the rack's depth. The op carries screen measurements, divided here by
           the live stage scale — the only place the zoom is known, which is what
           lets the op list itself stay zoom-free and cacheable. */
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
                  const tipY = it.side === 'below' ? it.edgeY + gap : it.edgeY - gap - len
                  const baseY = tipY + head
                  c.beginPath(); c.moveTo(it.cx, tipY + len); c.lineTo(it.cx, baseY); c.stroke()
                  c.beginPath()
                  c.moveTo(it.cx - head * 0.48, baseY)
                  c.lineTo(it.cx, tipY)
                  c.lineTo(it.cx + head * 0.48, baseY)
                  c.closePath(); c.fill()
                }
              }} />
          )
        }
        return null
      })}
    </>
  )
}

/** A rack, from its draw-ops. */
export function RackShape({ obj, ops, listening = false }) {
  return (
    <Group name={nodeName(obj.id)} listening={listening}
      opacity={obj.opacity ?? 1} {...spin(obj)}>
      <Ops ops={ops} listening={listening} />
    </Group>
  )
}

/* ── Floor plan ──────────────────────────────────────────────────────────── */

/** The building: interior fill, then an exact wall-thickness ring.
 *
 *  The ring is the outer polygon plus the inward-offset inner one, filled
 *  evenodd — so the wall measures exactly `wallThicknessFt` rather than a
 *  centred stroke straddling the boundary. insetPolygon is the shared helper
 *  the SVG uses, so the two cannot drift. */
export function FloorPlanShape({ obj, gridSize, listening = false }) {
  const verts = obj.fpVerts

  /* Real outline bounds. Without this Konva reports a 1px self-rect for a
     sceneFunc shape and every measurement of the building collapses to a dot. */
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

  const attach = useCallback((node) => {
    if (node && selfRect) node.getSelfRect = () => selfRect
  }, [selfRect])

  if (!verts || verts.length < 3) return null

  const wt = obj.wallThicknessFt ? obj.wallThicknessFt * gridSize : (obj.strokeWidth || 10)
  const wall = obj.stroke || '#4a5568'
  const floor = obj.noFill ? null : (obj.fill ?? 'rgba(14,20,30,0.88)')
  const inner = insetPolygon(verts, wt)

  return (
    <Group name={nodeName(obj.id)} listening={listening} opacity={obj.opacity ?? 1}>
      <Shape
        ref={attach}
        listening={listening}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          const c = ctx._context
          const trace = (pts) => {
            pts.forEach((v, i) => (i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)))
            c.closePath()
          }
          if (floor) { c.beginPath(); trace(inner); c.fillStyle = floor; c.fill() }
          c.beginPath()
          trace(verts)
          trace([...inner].reverse())
          c.fillStyle = wall
          c.fill('evenodd')
        }}
      />
    </Group>
  )
}

/* ── Column grid ─────────────────────────────────────────────────────────── */

/** The building's structural columns — the actual squares, not a box.
 *
 *  Drawn from the same expandColumnGrid the conflict check measures, so a red
 *  mark always lands on the column it refers to. All columns ride in ONE path:
 *  a 50ft grid over a 1,080ft building is hundreds of squares. */
export function ColumnGridShape({ obj, gridSize, listening = false }) {
  const d = useMemo(() => {
    if (obj.showGrid === false) return null
    const cols = expandColumnGrid(obj, gridSize)
    if (!cols.length) return null
    let out = ''
    for (const c of cols) out += `M${c.x} ${c.y}h${c.w}v${c.h}h${-c.w}Z`
    return out
  }, [obj, gridSize])

  if (!d) return null
  return (
    <Group name={nodeName(obj.id)} listening={listening} opacity={obj.opacity ?? 1}>
      <Path data={d}
        fill={obj.fill || STRUCT_BLUE} stroke={obj.stroke || STRUCT_BLUE}
        strokeWidth={1} strokeScaleEnabled={false}
        perfectDrawEnabled={false} listening={listening} />
    </Group>
  )
}

/* ── Fallback ────────────────────────────────────────────────────────────── */

const LINE_TYPES = new Set(['line', 'arc', 'arrow', 'annot_dimension',
  'annot_arrow_line', 'annot_double_arrow', 'annot_curve_arrow', 'annot_draw_line',
  'annot_solid_line', 'annot_dotted_line', 'annot_dashed_line', 'annot_dashdot_line'])

const labelFor = t => String(t || '')
  .replace(/^(mhe|util|safety|struct|annot|fp|rack)_/, '').replace(/_/g, ' ')

/** Everything with no symbol of its own yet — dock doors, the mhe / safety /
 *  util families, annotations, plain shapes.
 *
 *  Drawn from what every object does have: bounds, fill, stroke. Position,
 *  size, colour and rotation are all correct; only the bespoke glyph is
 *  missing, and a type label stands in so nothing is anonymous.
 *
 *  A MIGRATION SURFACE, not a destination — each type given a real symbol drops
 *  out of here automatically, because Scene only routes what nothing claimed. */
export function FallbackShape({ obj, listening = false }) {
  const stroke = obj.stroke || '#6B7280'
  const fill = obj.noFill ? undefined : obj.fill
  const opacity = obj.opacity ?? 1
  const common = {
    stroke, strokeWidth: obj.strokeWidth || 1.5,
    strokeScaleEnabled: false, perfectDrawEnabled: false,
    shadowForStrokeEnabled: false, listening,
  }

  if (obj.type === 'text') {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity}>
        <Text x={obj.x} y={obj.y} text={obj.text || ''}
          fontSize={obj.fontSize || 14} fontFamily={obj.fontFamily || 'sans-serif'}
          fill={obj.fill || stroke} listening={listening} />
      </Group>
    )
  }

  if (obj.type === 'freehand' && Array.isArray(obj.points)) {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity}>
        <Line points={obj.points.flatMap(p => [p.x, p.y])} {...common} />
      </Group>
    )
  }

  if (LINE_TYPES.has(obj.type) && Number.isFinite(obj.x1)) {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity}>
        <Line points={[obj.x1, obj.y1, obj.x2, obj.y2]} {...common} hitStrokeWidth={12} />
      </Group>
    )
  }

  if (obj.type === 'circle') {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity}>
        <Circle x={obj.cx} y={obj.cy} radius={obj.r || 10} fill={fill} {...common} />
      </Group>
    )
  }

  const b = getObjectBounds(obj)
  if (!(b.width > 0) || !(b.height > 0)) return null

  return (
    <Group name={nodeName(obj.id)} listening={listening} opacity={opacity} {...spin(obj)}>
      <Rect x={b.x} y={b.y} width={b.width} height={b.height} fill={fill} {...common} />
      {b.width > 24 && b.height > 12 && (
        <Text x={b.x} y={b.y + b.height / 2 - 5} width={b.width} align="center"
          text={labelFor(obj.type)} fontSize={Math.min(11, b.height * 0.5)}
          fontFamily="sans-serif" fill={stroke} opacity={0.75} listening={false} />
      )}
    </Group>
  )
}
