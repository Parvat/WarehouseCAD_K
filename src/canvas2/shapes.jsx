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

/* How far outside its own outline an object can still be grabbed, in SCREEN px.
   Measured against the real problem: at the whole-building zoom a selective
   rack is about 9px deep sitting in a 28px aisle, so it is a smaller target
   than the gap around it and you miss more often than you hit. 8px roughly
   doubles the target without closing the aisle — two neighbours pad 8px each
   into 28px and still leave clear space to start a pan between them. Larger
   would make the gap unpannable at low zoom; smaller leaves the rack fiddly. */
const HIT_PAD_PX = 8

/** Centre-origin transform props, shared by every painter so rotation behaves
 *  identically no matter which one drew the object. */
function spin(obj, gridSize = 40) {
  const b = outlineBounds(obj, gridSize) || getObjectBounds(obj)
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

/** An invisible, screen-padded hit area over an object's bounds.
 *
 *  The draw-ops already produce real Konva nodes with real hit areas, so this
 *  is not about being hittable at all — it is about being hittable COMFORTABLY.
 *  A selective rack is 42in deep, which at the whole-building zoom is about ten
 *  screen pixels: a target you have to aim at. This pads the body by a few
 *  SCREEN px so the whole rack, plus a margin, is grabbable at any zoom.
 *
 *  It draws nothing — an empty sceneFunc — and exists only in the hit graph.
 *  The pad is read from the live stage scale inside the hit pass, so it stays a
 *  constant screen distance without threading zoom in as a prop. */
function HitPad({ obj, gridSize, listening, pad = HIT_PAD_PX }) {
  if (!listening) return null
  const b = outlineBounds(obj, gridSize)
  if (!b) return null
  return (
    <Shape
      listening
      perfectDrawEnabled={false}
      fill="#000"
      sceneFunc={() => {}}
      hitFunc={(ctx, shape) => {
        const s = shape.getStage()?.scaleX() || 1
        const m = pad / s
        ctx.beginPath()
        ctx.rect(b.x - m, b.y - m, b.width + m * 2, b.height + m * 2)
        ctx.closePath()
        ctx.fillStrokeShape(shape)
      }}
    />
  )
}

/** A rack, from its draw-ops. */
export function RackShape({ obj, ops, gridSize, listening = false, bind }) {
  return (
    <Group name={nodeName(obj.id)} listening={listening}
      opacity={obj.opacity ?? 1} {...spin(obj, gridSize)} {...(bind ? bind(obj) : null)}>
      <HitPad obj={obj} gridSize={gridSize} listening={listening} />
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
export function FloorPlanShape({ obj, gridSize, listening = false, bind }) {
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
    <Group name={nodeName(obj.id)} listening={listening} opacity={obj.opacity ?? 1}
      {...(bind ? bind(obj) : null)}>
      <Shape
        ref={attach}
        listening={listening}
        perfectDrawEnabled={false}
        /* A sceneFunc that paints with raw canvas colours cannot be hit-tested:
           Konva's hit canvas works by drawing each shape in a unique colour key
           and reading the pixel back, and literal fills overwrite that. So the
           hit area is stated separately.

           It is the WALL BAND, not the footprint. Making the interior grabbable
           would swallow every pan started inside the building — and on this
           canvas an empty-space drag IS the pan. The band widens to ~24 screen
           px because a real wall is often 3in, about one pixel at the zoom this
           is used at, and nobody can hit one pixel. The stage scale is read
           inside the hit pass, so no zoom has to be threaded in as a prop and
           nothing re-renders when it changes. */
        stroke={wall}
        hitFunc={(ctx, shape) => {
          const s = shape.getStage()?.scaleX() || 1
          shape.strokeWidth(Math.max(wt, 24 / s))
          ctx.beginPath()
          verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
          ctx.closePath()
          ctx.strokeShape(shape)
        }}
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
export function ColumnGridShape({ obj, gridSize, listening = false, bind }) {
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
    <Group name={nodeName(obj.id)} listening={listening} opacity={obj.opacity ?? 1}
      {...(bind ? bind(obj) : null)}>
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
export function FallbackShape({ obj, listening = false, bind }) {
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
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity} {...(bind ? bind(obj) : null)}>
        <Text x={obj.x} y={obj.y} text={obj.text || ''}
          fontSize={obj.fontSize || 14} fontFamily={obj.fontFamily || 'sans-serif'}
          fill={obj.fill || stroke} listening={listening} />
      </Group>
    )
  }

  if (obj.type === 'freehand' && Array.isArray(obj.points)) {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity} {...(bind ? bind(obj) : null)}>
        <Line points={obj.points.flatMap(p => [p.x, p.y])} {...common} />
      </Group>
    )
  }

  if (LINE_TYPES.has(obj.type) && Number.isFinite(obj.x1)) {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity} {...(bind ? bind(obj) : null)}>
        <Line points={[obj.x1, obj.y1, obj.x2, obj.y2]} {...common} hitStrokeWidth={12} />
      </Group>
    )
  }

  if (obj.type === 'circle') {
    return (
      <Group name={nodeName(obj.id)} listening={listening} opacity={opacity} {...(bind ? bind(obj) : null)}>
        <Circle x={obj.cx} y={obj.cy} radius={obj.r || 10} fill={fill} {...common} />
      </Group>
    )
  }

  const b = getObjectBounds(obj)
  if (!(b.width > 0) || !(b.height > 0)) return null

  return (
    <Group name={nodeName(obj.id)} listening={listening} opacity={opacity} {...spin(obj)}
      {...(bind ? bind(obj) : null)}>
      <Rect x={b.x} y={b.y} width={b.width} height={b.height} fill={fill} {...common} />
      {b.width > 24 && b.height > 12 && (
        <Text x={b.x} y={b.y + b.height / 2 - 5} width={b.width} align="center"
          text={labelFor(obj.type)} fontSize={Math.min(11, b.height * 0.5)}
          fontFamily="sans-serif" fill={stroke} opacity={0.75} listening={false} />
      )}
    </Group>
  )
}

/** Bounds to outline — for EVERY selectable object, not just the ones
 *  getObjectBounds happens to measure.
 *
 *  Three real gaps it has to cover, each found by selecting every type in turn:
 *    • a column grid has no width/height at all; its extent is the columns,
 *      which only expandColumnGrid knows;
 *    • getObjectBounds reads rx/ry for a circle, so one created with a plain
 *      r measures NaN;
 *    • anything degenerate measures zero.
 *
 *  A selected object with no visible marker is worse than a slightly wrong
 *  marker: you cannot tell whether the click registered. So the last resort is
 *  a small square at the object's own position rather than nothing. */
export function outlineBounds(obj, gridSize = 40) {
  if (!obj) return null

  if (obj.type === 'column_grid') {
    const cols = expandColumnGrid(obj, gridSize)
    if (cols.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const c of cols) {
        if (c.x < minX) minX = c.x
        if (c.y < minY) minY = c.y
        if (c.x + c.w > maxX) maxX = c.x + c.w
        if (c.y + c.h > maxY) maxY = c.y + c.h
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
  }

  if (obj.type === 'circle') {
    const rx = Number.isFinite(obj.rx) ? obj.rx : obj.r
    const ry = Number.isFinite(obj.ry) ? obj.ry : obj.r
    if (Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(obj.cx)) {
      return { x: obj.cx - rx, y: obj.cy - ry, width: rx * 2, height: ry * 2 }
    }
  }

  const b = getObjectBounds(obj)
  if (b && Number.isFinite(b.x) && Number.isFinite(b.y) &&
      b.width > 0 && b.height > 0) return b

  /* Last resort: mark where it is, so selection is never invisible. */
  const x = Number.isFinite(obj.x) ? obj.x : (Number.isFinite(obj.cx) ? obj.cx : obj.x1)
  const y = Number.isFinite(obj.y) ? obj.y : (Number.isFinite(obj.cy) ? obj.cy : obj.y1)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const m = gridSize / 2
  return { x: x - m / 2, y: y - m / 2, width: m, height: m }
}

/* ── Selection outline ───────────────────────────────────────────────────────
   A minimal marker so selection is visible before the Transformer lands. Its
   node is named `sel:<id>` so a drag can offset it alongside the object it
   frames — otherwise the outline would stay behind while the object moved.

   strokeScaleEnabled={false} is what makes it visible at 7%: the stroke is a
   SCREEN width, unaffected by the stage scale, so a 2px outline is 2px whether
   the building fills the view or a single bay does. Dividing by zoom by hand
   would do the same thing, less reliably, and would need the zoom threaded in.

   Zero padding on purpose: at 7% a rack is ten pixels tall, and an inset or
   outset frame would read as a second object rather than as its outline. */
export function SelectionOutline({ obj, gridSize = 40 }) {
  const b = outlineBounds(obj, gridSize)
  if (!b) return null
  return (
    <Group name={'sel:' + obj.id} listening={false} {...spin(obj)}>
      <Rect
        x={b.x} y={b.y} width={b.width} height={b.height}
        stroke="#4a9eff" strokeWidth={2}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false}
      />
    </Group>
  )
}
