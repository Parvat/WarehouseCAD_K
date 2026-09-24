import { useCallback, useMemo } from 'react'
import { Group, Rect, Path, Shape, Circle, Line, Text } from 'react-konva'
import { getObjectBounds, insetPolygon } from '../utils/canvas'
import { expandColumnGrid } from '../generate/columnCheck'
import { uprightXs, cantileverGeom } from '../render/rackOps'
import { positionFootprintIn } from '../utils/capacity'
import { aisleRect } from './hitTest'

/** Min/max extent of a vertex list, in the same absolute world coords the
 *  verts are already drawn in. Shared by FloorPlanShape's own selfRect and
 *  outlineBounds's floor-plan branch below, so a building's selection outline
 *  cannot drift from what it actually draws. */
function vertsBounds(verts) {
  if (!verts || verts.length < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

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
/* The short-axis pad. Small enough that it cannot bridge a realistic gap
   between stacked rows (measured: failure starts under ~4 screen px total gap
   with the old symmetric 8px pad; a 2px pad here needs a gap under ~4px on
   its OWN to reach a neighbor's centre, which no real aisle or structural
   clearance produces — while still rounding off the exact edge for a click a
   pixel or two outside the rack's true footprint). */
const HIT_PAD_SHORT_PX = 2

/** Centre-origin transform props, shared by every painter so rotation behaves
 *  identically no matter which one drew the object. */
export function spin(obj, gridSize = 40) {
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
 *  constant screen distance without threading zoom in as a prop.
 *
 *  The pad is NOT symmetric, and that asymmetry is load-bearing. A rack is
 *  wide and short — at the whole-building zoom a rack_row is ~10 screen px
 *  tall — so a uniform pad on all four sides reaches through a tight VERTICAL
 *  gap between stacked rows far enough to cover a neighbor's own centre.
 *  Konva resolves the overlap by z-order (topmost/last-drawn wins), so
 *  whichever rack happens to be drawn later silently steals every click meant
 *  for the row above or below it — reproduced at a 2 screen-px gap between
 *  two racks, where the later one's pad ate the earlier one's centre and every
 *  click on the "dead" rack actually selected its neighbor instead. This is
 *  the real mechanism behind "specific racks are consistently unclickable,
 *  neighbors are fine": it depends on how tightly THAT rack happens to be
 *  stacked against its neighbors, which varies rack to rack.
 *
 *  Padding generously along the rack's own LENGTH (the horizontal axis, in
 *  local — pre-rotation — coordinates) stays safe: two racks rarely sit that
 *  close end to end, and when they do it reads as one continuous run anyway.
 *  Padding is kept minimal on the SHORT axis, where rows actually stack close
 *  together, so it can no longer bridge a realistic gap. */
/** The pad margins HitPad actually uses, in WORLD units, given the object's
 *  own drawn bounds and the live stage scale.
 *
 *  Exported and called from BOTH the real hitFunc below and the click
 *  diagnostics, so the two can never drift apart. A diagnostic that
 *  re-derives this math independently is a diagnostic that can lie about
 *  what Konva is actually testing against the moment either one changes. */
export function hitPadMargins(b, scale, padLong = HIT_PAD_PX, padShort = HIT_PAD_SHORT_PX) {
  const s = scale || 1
  /* "Long" and "short" are the object's own axes, not screen axes — a rack
     drawn taller than it is wide (unusual, but the fallback box case can be
     square or portrait) pads its actual short side regardless of orientation. */
  const wide = b.width >= b.height
  return {
    mx: (wide ? padLong : padShort) / s,
    my: (wide ? padShort : padLong) / s,
  }
}

function HitPad({ obj, gridSize, listening }) {
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
        const { mx, my } = hitPadMargins(b, shape.getStage()?.scaleX())
        ctx.beginPath()
        ctx.rect(b.x - mx, b.y - my, b.width + mx * 2, b.height + my * 2)
        ctx.closePath()
        ctx.fillStrokeShape(shape)
      }}
    />
  )
}

/** Rect(s) for ONE bay/tower index, in the same local world coords Ops
 *  already draws in — the Group's own spin() transform rotates them along
 *  with everything else, so this never re-derives rotation itself.
 *
 *  Geometry comes from rackOps.js's OWN uprightXs/cantileverGeom — the exact
 *  functions rackRowOps/rackDoubleRowOps/rackCantileverOps use to draw the
 *  bays/towers in the first place — rather than re-deriving bay positions a
 *  second time. hitTestBay (canvas2/hitTest.js) is a THIRD place this same
 *  geometry could drift from; it stays un-rotated-click-tested against the
 *  object's raw x/y/width/height, which is exactly the local space these
 *  rects are already in, so a hit and its highlight can never disagree.
 *
 *  Shared by activeBayRects (the single blue "currently active" outline)
 *  and multiBaySelectionRects (the amber cross-row marquee selection,
 *  BUG 25) below, so a bay's highlight geometry is computed in exactly one
 *  place regardless of which selection put it there. */
export function bayRectForIndex(obj, gridSize, i) {
  if (i == null) return []
  if (obj.type === 'rack_row' || obj.type === 'rack_double_row') {
    const { xs, upW, beams } = uprightXs(obj, gridSize)
    if (i < 0 || i >= beams.length) return []
    const bx = xs[i] + upW
    const bw = (beams[i] / 12) * gridSize

    if (obj.type === 'rack_row') {
      return [{ x: bx, y: obj.y, width: bw, height: obj.height }]
    }
    // Double row: the SAME bay column on both bands, flue skipped between.
    const flueH = ((obj.flueSpaceIn || 9) / 12) * gridSize
    const rowH = Math.max(0, (obj.height - flueH) / 2)
    if (rowH <= 0) return [{ x: bx, y: obj.y, width: bw, height: obj.height }]
    return [
      { x: bx, y: obj.y, width: bw, height: rowH },
      { x: bx, y: obj.y + rowH + flueH, width: bw, height: rowH },
    ]
  }

  if (obj.type === 'rack_cantilever') {
    const { doubleSided, towers, armT, spineH, spineY, cxs } = cantileverGeom(obj, gridSize)
    if (i < 0 || i >= cxs.length) return []
    const armPx = ((towers[i] || 36) / 12) * gridSize
    return [{
      x: cxs[i] - armT / 2,
      y: doubleSided ? spineY - armPx : spineY,
      width: armT,
      height: doubleSided ? armPx * 2 + spineH : armPx + spineH,
    }]
  }

  return []
}

/** ONE pallet position's own rect within a bay/face — a sub-rect of
 *  `bayRectForIndex`'s own face rect, narrowed to that position's footprint
 *  from utils/capacity.js's `positionFootprintIn` (the SAME footprint
 *  columnCheck.js's `blockedPositionIndices` tests against) rather than the
 *  whole bay. Used for a blocked-position mark — a column blocks one pick
 *  SPOT, not the entire bay it happens to sit in. `faceIndex` selects which
 *  of `bayRectForIndex`'s returned rects (0/1 for a double row, always 0
 *  for a single) to slice from. */
export function positionRectForIndex(obj, gridSize, bayIndex, positionIndex, faceIndex = 0) {
  const faceRect = bayRectForIndex(obj, gridSize, bayIndex)[faceIndex]
  if (!faceRect) return null
  const palletFaceIn = obj.palletWIn || 40
  const beamIn = (faceRect.width / gridSize) * 12
  const fp = positionFootprintIn(beamIn, palletFaceIn, positionIndex)
  if (!fp) return null
  const toPx = (inches) => (inches / 12) * gridSize
  return { x: faceRect.x + toPx(fp.startIn), y: faceRect.y, width: toPx(fp.endIn - fp.startIn), height: faceRect.height }
}

/** BUG 66 — a small structural marker (a 12"-default column square, a
 *  pallet-position X) is a fixed WORLD size, so at building-overview zoom
 *  (a few percent, the auto-fit `placeFpObject` itself sets) it shrinks to
 *  a handful of screen px — arithmetically correct, visually gone. The
 *  established fix for "this needs to read at any zoom" is already all
 *  over this file (ResizeHandlesOverlay's own `hs = 6/zoom`, ported
 *  verbatim from CanvasUI): world-space size computed as `screenPx /
 *  zoom`. This grows a rect to that floor — CENTRED on its own true
 *  centre, never from a corner, so a marker that grows to stay visible
 *  never drifts off the position it's actually marking. Below the
 *  threshold it's a no-op: a marker already bigger than the floor draws
 *  at its real size, exactly as before. */
export function growToMinScreenSize(rect, zoom, minPx) {
  const minSize = minPx / zoom
  const width  = Math.max(rect.width, minSize)
  const height = Math.max(rect.height, minSize)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

/** The active bay/tower's outline rect(s) — obj.activeBayIdx/activeTowerIdx,
 *  the single per-bay click pick (hitTestBay). Limited to the three types
 *  the SVG canvas itself visually highlights (rack_row, rack_double_row,
 *  rack_cantilever) — hitTestBay answers for a broader RACK_BAY_TYPES set
 *  (lanes too), but CanvasArea/ShapeGeometry only ever paints a highlight
 *  for these three, so matching that is "mirror the SVG" rather than
 *  inventing a new visual for types that have none there. */
function activeBayRects(obj, gridSize) {
  const i = obj.type === 'rack_cantilever' ? obj.activeTowerIdx : obj.activeBayIdx
  return bayRectForIndex(obj, gridSize, i)
}

/** Every bay/tower this object has entries for in the store's
 *  activeBaySelection — the cross-row MARQUEE selection (BUG 29), not the
 *  single per-bay click above. Same three types/geometry, kept as its own
 *  function rather than folded into activeBayRects: CanvasUI paints this
 *  amber and the single-active pick blue, two visually and semantically
 *  distinct things (a marquee selection vs. "the one bay you clicked
 *  into") that ShapeGeometry.jsx itself never merges into one code path
 *  either. */
function multiBaySelectionRects(obj, gridSize, activeBaySelection) {
  if (!activeBaySelection || !activeBaySelection.length) return []
  const out = []
  activeBaySelection.forEach(e => {
    if (e.objId !== obj.id) return
    out.push(...bayRectForIndex(obj, gridSize, e.bayIdx))
  })
  return out
}

/** A rack, from its draw-ops. */
export function RackShape({ obj, ops, gridSize, listening = false, bind, activeBaySelection }) {
  const msRects = multiBaySelectionRects(obj, gridSize, activeBaySelection)
  return (
    <Group name={nodeName(obj.id)} listening={listening}
      opacity={obj.opacity ?? 1} {...spin(obj, gridSize)} {...(bind ? bind(obj) : null)}>
      <HitPad obj={obj} gridSize={gridSize} listening={listening} />
      <Ops ops={ops} listening={listening} />
      {activeBayRects(obj, gridSize).map((r, i) => (
        <Rect key={i} {...r} stroke="#4a9eff" strokeWidth={2}
          dash={[4, 3]} strokeScaleEnabled={false} perfectDrawEnabled={false}
          shadowForStrokeEnabled={false} listening={false} />
      ))}
      {/* Cross-row marquee bay selection — amber tint + dashed outline,
          CanvasUI.jsx's own two-part paint for isMultiSel (a filled tint
          rect UNDER a stroked outline rect), kept visually distinct from
          the blue single-active outline above. */}
      {msRects.map((r, i) => <Rect key={'ms' + i} {...r} fill="rgba(240,180,41,0.27)" listening={false} />)}
      {msRects.map((r, i) => (
        <Rect key={'mso' + i} {...r} stroke="#f0b429" strokeWidth={2}
          dash={[4, 2]} strokeScaleEnabled={false} perfectDrawEnabled={false}
          shadowForStrokeEnabled={false} listening={false} />
      ))}
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
  const selfRect = useMemo(() => vertsBounds(verts), [verts])

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

/* BUG 66 — 6 screen-px floor, matching ResizeHandlesOverlay's own
 * `hs = 6/zoom` handle half-size exactly (a 12px handle square) — the
 * established "reads at any zoom" size in this codebase, not a new one
 * invented for columns. */
const MIN_COLUMN_MARKER_PX = 6

/** The building's structural columns — the actual squares, not a box.
 *
 *  Drawn from the same expandColumnGrid the conflict check measures, so a red
 *  mark always lands on the column it refers to. All columns ride in ONE path:
 *  a 50ft grid over a 1,080ft building is hundreds of squares.
 *
 *  BUG 66 — each square is grown to `growToMinScreenSize` before being
 *  baked into the path, so a building-overview zoom (a few percent) still
 *  shows every column as a visible dot instead of a few sub-pixel-ish
 *  screen px lost under the wall line. Needs `zoom` threaded in from
 *  Scene.jsx/Canvas2.jsx — this shape carries no zoom on its own
 *  otherwise, unlike the screen-constant-stroke trick below it, which
 *  needs no zoom input at all. */
export function ColumnGridShape({ obj, gridSize, zoom = 1, listening = false, bind }) {
  const d = useMemo(() => {
    if (obj.showGrid === false) return null
    const cols = expandColumnGrid(obj, gridSize)
    if (!cols.length) return null
    let out = ''
    for (const c of cols) {
      const g = growToMinScreenSize({ x: c.x, y: c.y, width: c.w, height: c.h }, zoom, MIN_COLUMN_MARKER_PX)
      out += `M${g.x} ${g.y}h${g.width}v${g.height}h${-g.width}Z`
    }
    return out
  }, [obj, gridSize, zoom])

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

/* ── Aisle ────────────────────────────────────────────────────────────────── */

/** An aisle — a placeable rack-row gap indicator, carrying NO x/y/width/height
 *  of its own; its geometry is entirely derived, live, from the two rows it
 *  references (row1Id/row2Id), via the shared aisleRect (hitTest.js — same
 *  function the pick and DimensionLabels' AisleLabel both use).
 *
 *  Ported from ShapeGeometry.jsx's 'aisle' case, ONE difference on purpose:
 *  the SVG bakes its own selected-state fill/stroke into this same rect
 *  (`fill={selected?'#f0b42915':'transparent'}`), because that is the only
 *  paint it has. canvas2 already has a dedicated selection layer
 *  (Overlays.jsx's SelectionOutline/AisleLabel highlight) that every other
 *  object type's selection state goes through — so this shape stays fully
 *  transparent always, matching the SVG's own UNSELECTED look exactly (which
 *  is `transparent` too), and lets Overlays own "selected" the same way it
 *  already owns it for a rack or a floor plan, rather than teaching one more
 *  shape to read selection state that the render/rackOps.js op list and
 *  every other painter here deliberately don't. */
export function AisleShape({ obj, objects, listening = false, bind }) {
  const rect = aisleRect(obj, objects)
  if (!rect) return null
  return (
    <Group name={nodeName(obj.id)} listening={listening} {...(bind ? bind(obj) : null)}>
      {/* Paints nothing (matches the SVG's own unselected "transparent" rect)
          but still registers a Konva hit region, the same sceneFunc-empty /
          hitFunc-real split HitPad above uses — consistent with every other
          selectable shape here, even though the selection DECISION itself
          comes from hitTest.js's own aisleRect check, not from Konva's hit
          graph (CANVAS2.md rule 4). */}
      <Shape
        listening={listening}
        perfectDrawEnabled={false}
        fill="#000"
        sceneFunc={() => {}}
        hitFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.rect(rect.x, rect.y, rect.width, rect.height)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
      />
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
export function outlineBounds(obj, gridSize = 40, objects = []) {
  if (!obj) return null

  /* An aisle has no x/y/width/height of its own — see AisleShape above — so
     it needs `objects` (to look up its two rows) rather than anything
     getObjectBounds could ever measure from the object alone. Every other
     branch below never reaches this for an aisle (none of their type checks
     match), so passing objects=[] (every OTHER caller's default) is a
     harmless no-op for them, not a silent aisle bug. */
  if (obj.type === 'aisle') {
    return aisleRect(obj, objects)
  }

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

  /* Floor plans draw from fpVerts directly, not from obj.x/y/width/height —
     those stored fields can disagree with the actual polygon (they did: a
     constant offset put the outline off the building's real drawn edges).
     Measuring the same verts FloorPlanShape draws keeps the two in lockstep. */
  if (obj.fpVerts) {
    const vb = vertsBounds(obj.fpVerts)
    if (vb) return vb
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
   outset frame would read as a second object rather than as its outline.

   `objects` is only ever read for an aisle (outlineBounds's own aisleRect
   branch) — every other type ignores it, so callers that never select an
   aisle can omit it exactly as before. */
export function SelectionOutline({ obj, gridSize = 40, objects = [] }) {
  /* A floor plan traces its OWN fpVerts directly — always the true,
     exact polygon, tight at any orientation — rather than an
     outlineBounds Rect wrapped in spin(). A building's rotation is baked
     straight into fpVerts (FloorPlanShape paints no separate rotation
     transform at all — see fpRotate.js's own header), so a Rect+spin()
     box here would be exactly BUG 20's mistake again: an axis-aligned
     bounding box of already-rotated content, ballooning past 45° instead
     of hugging the walls. Tracing fpVerts sidesteps the whole class of
     bug — there is no bounding box to keep in sync, just the same points
     FloorPlanShape itself draws from, this render and every one after. */
  if (obj.fpVerts && obj.fpVerts.length >= 3) {
    const pts = obj.fpVerts.flatMap(v => [v.x, v.y])
    return (
      <Line name={'sel:' + obj.id}
        points={pts} closed
        stroke="#4a9eff" strokeWidth={2}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
        shadowForStrokeEnabled={false} listening={false}
      />
    )
  }
  const b = outlineBounds(obj, gridSize, objects)
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
