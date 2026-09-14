import { useMemo } from 'react'
import { Group, Rect, Line, Text, Shape } from 'react-konva'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useColumnCheck } from '../../generate/useColumnCheck'
import {
  wallDims, aisleDim, conflictMarkStyle, splitMarks,
  OVERLAY, FP_TYPES,
} from '../../render/overlayOps'

/* ── The overlay plane in Konva ──────────────────────────────────────────────
   Dimension labels and the column-check conflict marks, drawn on the Stage's
   own overlay layer. Selection handles are NOT here: Konva's Transformer owns
   the frame, the resize anchors and the rotate grip, because it is the only
   one of the two that can actually be grabbed.

   Everything this file draws is decoration — `listening={false}` throughout —
   so none of it can intercept a press meant for an object or for the
   Transformer sitting in the same layer.

   Geometry comes from render/overlayOps.js, which sizes everything as a screen
   px divided by zoom exactly as CanvasUI does, so the two renderers land on the
   same pixels rather than merely looking similar. */

const GLYPH = 'JetBrains Mono,monospace'

/** A label pill: dark plate plus centred monospace text. Konva has no text
 *  anchor, so the plate is positioned from its centre and the text is given the
 *  plate's width to centre inside. */
function Pill({ cx, cy, w, h, radius, fontSize, text, color, bg, opacity = 0.92 }) {
  return (
    <Group listening={false}>
      <Rect x={cx - w / 2} y={cy - h / 2} width={w} height={h}
        fill={bg} cornerRadius={radius} opacity={opacity} />
      <Text x={cx - w / 2} y={cy - fontSize * 0.55} width={w} align="center"
        text={text} fontSize={fontSize} fontFamily={GLYPH} fill={color} />
    </Group>
  )
}

/* The painted selection frame, resize handles and rotate icon that used to
   live here are GONE, and must not come back. Konva's Transformer draws the
   real ones — see KonvaTransformer — and it is the only one of the two that
   can be grabbed. A second painted set is listening={false}: visible, inert,
   and at a different rotate offset from the Transformer's rotater, so aiming
   at the icon you could see missed the handle that works, fell through to the
   object underneath, and turned every rotate attempt into a drag.

   This overlay now draws only what the Transformer does NOT: dimension
   labels and the column-check conflict marks. */

/** Wall dimensions on a selected floor plan. */
function WallDims({ obj, zoom, gridSize, activeWallIdx, name }) {
  const segs = useMemo(
    () => wallDims(obj, { zoom, gridSize, activeWallIdx }),
    [obj, zoom, gridSize, activeWallIdx])

  return (
    <Group name={name} listening={false}>
      {segs.map(s => (
        <Group key={s.index} listening={false}>
          <Line points={[s.d1.x, s.d1.y, s.d2.x, s.d2.y]}
            stroke={s.color} strokeWidth={s.lineWidth} opacity={0.8} />
          <Line points={[s.cap1.x, s.cap1.y, s.d1.x, s.d1.y]}
            stroke={s.color} strokeWidth={s.lineWidth} opacity={0.5} />
          <Line points={[s.cap2.x, s.cap2.y, s.d2.x, s.d2.y]}
            stroke={s.color} strokeWidth={s.lineWidth} opacity={0.5} />
          <Line closed points={s.head1.flatMap(p => [p.x, p.y])} fill={s.color} opacity={0.8} />
          <Line closed points={s.head2.flatMap(p => [p.x, p.y])} fill={s.color} opacity={0.8} />
          <Pill cx={s.mid.x} cy={s.mid.y} w={s.pill.w} h={s.pill.h}
            radius={s.pill.radius} fontSize={s.pill.fontSize}
            text={s.label} color={s.color} bg={OVERLAY.dimBg} />
        </Group>
      ))}
    </Group>
  )
}

/** Aisle width dimensions — a double-headed arrow across the gap plus the
 *  measurement, repeated along long aisles so it stays readable when panned. */
function AisleDims({ aisle, objects, zoom, gridSize }) {
  const D = useMemo(() => aisleDim(aisle, objects, { zoom, gridSize }),
    [aisle, objects, zoom, gridSize])
  if (!D) return null
  const clr = OVERLAY.accent
  const a = D.arrow

  return (
    <Group listening={false}>
      {D.positions.map((pos, i) => {
        const lx = D.horiz ? pos : D.mid
        const ly = D.horiz ? D.mid : pos
        const s = D.horiz ? D.mid - D.width / 2 + D.pad : D.mid - D.width / 2 + D.pad
        const e = D.horiz ? D.mid + D.width / 2 - D.pad : D.mid + D.width / 2 - D.pad
        return (
          <Group key={i} listening={false}>
            {D.horiz ? (
              <>
                <Line points={[lx, s, lx, e]} stroke={clr} strokeWidth={D.lineWidth} />
                <Line closed points={[lx, s, lx - a / 2, s + a, lx + a / 2, s + a]} fill={clr} />
                <Line closed points={[lx, e, lx - a / 2, e - a, lx + a / 2, e - a]} fill={clr} />
              </>
            ) : (
              <>
                <Line points={[s, ly, e, ly]} stroke={clr} strokeWidth={D.lineWidth} />
                <Line closed points={[s, ly, s + a, ly - a / 2, s + a, ly + a / 2]} fill={clr} />
                <Line closed points={[e, ly, e - a, ly - a / 2, e - a, ly + a / 2]} fill={clr} />
              </>
            )}
            <Pill cx={lx} cy={ly} w={D.pill.w} h={D.pill.h}
              radius={D.pill.radius} fontSize={D.pill.fontSize}
              text={D.text} color="#e2e8f0" bg="#1e2433" opacity={1} />
          </Group>
        )
      })}
    </Group>
  )
}

/** Column-check conflict marks.
 *
 *  Konva has no pattern fill, so the hatch is drawn by hand: clip to the mark,
 *  wash it red, then rule 45-degree bands across it. Same construction as the
 *  SVG pattern, and like it the band pitch is a screen size — a column/rack
 *  overlap is often a foot square, which at 10% zoom is a few pixels, far finer
 *  than a world-space hatch could resolve. */
function ConflictMarks({ marks, zoom }) {
  const st = conflictMarkStyle(zoom)
  const { blocked, hatched } = splitMarks(marks)

  return (
    <Group listening={false}>
      {hatched.map((m, i) => (
        <Group key={'h' + i} listening={false}>
          <Shape listening={false} perfectDrawEnabled={false}
            sceneFunc={(ctx) => {
              const c = ctx._context
              c.save()
              c.beginPath(); c.rect(m.x, m.y, m.w, m.h); c.clip()
              c.globalAlpha = 0.45; c.fillStyle = st.color
              c.fillRect(m.x, m.y, m.w, m.h)
              c.globalAlpha = 0.9
              c.strokeStyle = st.color; c.lineWidth = st.band
              c.beginPath()
              for (let d = -m.h; d < m.w + m.h; d += st.tile) {
                c.moveTo(m.x + d, m.y); c.lineTo(m.x + d + m.h, m.y + m.h)
              }
              c.stroke()
              c.restore()
            }} />
          <Rect x={m.x} y={m.y} width={m.w} height={m.h}
            stroke={st.color} strokeWidth={st.hair} />
        </Group>
      ))}
      {blocked.map((m, i) => (
        <Group key={'b' + i} listening={false}>
          <Rect x={m.x} y={m.y} width={m.w} height={m.h} fill={st.color} opacity={0.30} />
          <Rect x={m.x} y={m.y} width={m.w} height={m.h}
            stroke={st.color} strokeWidth={st.hair * 1.4} />
        </Group>
      ))}
    </Group>
  )
}

/** The whole overlay plane. Mounted inside the Stage's third layer by
 *  KonvaStage, so it inherits pan/zoom from the Stage transform like the rest
 *  of the scene. */
export function KonvaOverlay({ zoom }) {
  const objects     = useCanvasStore(s => s.objects)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const groups      = useCanvasStore(s => s.groups)
  const gridSize    = useCanvasStore(s => s.gridSize)
  const showAisles  = useCanvasStore(s => s.showAisles ?? true)
  const activeWall  = useCanvasStore(s => s.activeWall)
  const { result, showMarks } = useColumnCheck()

  /* An object inside a selected group shows the group's own outline instead of
     its individual handles — the same rule CanvasObjectCore applies. */
  const groupedIds = useMemo(() => {
    const sel = new Set(selectedIds)
    const out = new Set()
    for (const g of groups || []) {
      if (g.ids.some(id => sel.has(id))) g.ids.forEach(id => out.add(id))
    }
    return out
  }, [groups, selectedIds])

  const selected = useMemo(
    () => objects.filter(o => selectedIds.includes(o.id) && !groupedIds.has(o.id)),
    [objects, selectedIds, groupedIds])

  const aisles = useMemo(
    () => (showAisles ? objects.filter(o => o.type === 'aisle') : []),
    [objects, showAisles])

  const marks = showMarks ? (result?.redMarks || []) : []

  return (
    <>
      {marks.length > 0 && <ConflictMarks marks={marks} zoom={zoom} />}

      {aisles.map(a => (
        <AisleDims key={a.id} aisle={a} objects={objects} zoom={zoom} gridSize={gridSize} />
      ))}

      {selected.filter(o => FP_TYPES.has(o.type)).map(o => (
        <WallDims key={'d' + o.id} name={'dim:' + o.id} obj={o} zoom={zoom} gridSize={gridSize}
          activeWallIdx={activeWall?.objId === o.id ? activeWall.wallIdx : null} />
      ))}

    </>
  )
}
