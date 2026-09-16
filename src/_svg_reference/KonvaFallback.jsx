import { Group, Rect, Circle, Line, Text, Path } from 'react-konva'
import { getObjectBounds } from '../../utils/canvas'
import { expandColumnGrid } from '../../generate/columnCheck'

/* Structural blue, the one colour reserved for the building grid. */
const COLUMN_BLUE = '#3B6FB5'

/* ── Generic painter for types Konva does not draw natively yet ──────────────
   Hiding the SVG makes Konva the only visible canvas, and 38 object types —
   the column grid, dock doors, text, lines, and every mhe / safety / util /
   annotation symbol — have no Konva symbol of their own yet. Without this they
   would simply disappear the moment the flag went on, taking the column grid
   the conflict check depends on with them.

   So this draws each of them from the one thing every object does have: its
   bounds, fill and stroke. Position, size, colour, selection and transform all
   behave correctly; only the bespoke glyph inside is missing, and it is
   replaced by a label rather than left blank so nothing is silently anonymous.

   This is a MIGRATION SURFACE, not a destination. Every type ported to a real
   symbol drops out of here automatically, because KonvaStage only routes what
   nothing else claimed. */

const LINE_TYPES = new Set(['line', 'arc', 'annot_dimension', 'annot_arrow_line',
  'annot_double_arrow', 'annot_curve_arrow', 'annot_draw_line', 'annot_solid_line',
  'annot_dotted_line', 'annot_dashed_line', 'annot_dashdot_line', 'arrow'])

export function KonvaFallbackObject({ obj, name, listening = false, gridSize = 40 }) {
  const stroke  = obj.stroke || '#6B7280'
  const fill    = obj.noFill ? undefined : obj.fill
  const opacity = obj.opacity ?? 1

  /* A column grid is NOT a box. Painting its bounds filled put a large tinted
     rectangle over the whole building — which reads as a stray selection
     region, and hid the racks it is supposed to be checked against. It has a
     real symbol: the individual columns, from the same expandColumnGrid the
     conflict check measures, so the marks land on the squares they refer to.
     All columns ride in ONE path, as the rack symbols do. */
  if (obj.type === 'column_grid') {
    if (obj.showGrid === false) return null
    const cols = expandColumnGrid(obj, gridSize)
    if (!cols.length) return null
    let d = ''
    for (const c of cols) d += `M${c.x} ${c.y}h${c.w}v${c.h}h${-c.w}Z`
    return (
      <Group name={name} listening={listening} opacity={opacity}>
        <Path data={d} fill={obj.fill || COLUMN_BLUE} stroke={obj.stroke || COLUMN_BLUE}
          strokeWidth={1} strokeScaleEnabled={false}
          perfectDrawEnabled={false} listening={listening} />
      </Group>
    )
  }
  const common  = {
    stroke, strokeWidth: obj.strokeWidth || 1.5,
    strokeScaleEnabled: false, perfectDrawEnabled: false,
    shadowForStrokeEnabled: false, listening,
  }

  if (obj.type === 'text') {
    return (
      <Group name={name} listening={listening} opacity={opacity}>
        <Text x={obj.x} y={obj.y} text={obj.text || ''}
          fontSize={obj.fontSize || 14} fontFamily={obj.fontFamily || 'sans-serif'}
          fill={obj.fill || stroke} listening={listening} />
      </Group>
    )
  }

  if (obj.type === 'freehand' && Array.isArray(obj.points)) {
    return (
      <Group name={name} listening={listening} opacity={opacity}>
        <Line points={obj.points.flatMap(p => [p.x, p.y])} {...common} />
      </Group>
    )
  }

  if (LINE_TYPES.has(obj.type) && obj.x1 !== undefined) {
    return (
      <Group name={name} listening={listening} opacity={opacity}>
        <Line points={[obj.x1, obj.y1, obj.x2, obj.y2]} {...common}
          hitStrokeWidth={12} />
      </Group>
    )
  }

  if (obj.type === 'circle') {
    return (
      <Group name={name} listening={listening} opacity={opacity}>
        <Circle x={obj.cx} y={obj.cy} radius={obj.r || 10} fill={fill} {...common} />
      </Group>
    )
  }

  const b = getObjectBounds(obj)
  if (!(b.width > 0) || !(b.height > 0)) return null
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2

  /* Centre-origin, exactly as KonvaOps does it, so rotation turns the object
     on the spot and the Transformer gets a correct handle box. */
  return (
    <Group name={name} listening={listening} opacity={opacity}
      x={cx} y={cy} offsetX={cx} offsetY={cy} rotation={obj.rotation || 0}>
      <Rect x={b.x} y={b.y} width={b.width} height={b.height}
        fill={fill} cornerRadius={0} {...common} />
      {/* Name the object rather than leave an anonymous box — an unported
          symbol should still say what it is on the sheet. */}
      {b.width > 24 && b.height > 12 && (
        <Text x={b.x} y={cy - 5} width={b.width} align="center"
          text={labelFor(obj.type)} fontSize={Math.min(11, b.height * 0.5)}
          fontFamily="sans-serif" fill={stroke} opacity={0.75}
          listening={false} />
      )}
    </Group>
  )
}

function labelFor(type) {
  return String(type || '')
    .replace(/^(mhe|util|safety|struct|annot|fp|rack)_/, '')
    .replace(/_/g, ' ')
}
