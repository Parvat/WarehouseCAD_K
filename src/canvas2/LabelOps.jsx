import { Group, Line, Rect, Text } from 'react-konva'

/* Paints a label op list (render/labelOps.js) with Konva. Everything is in
   world units and scales with the stage like any drawn object — no stroke is
   screen-constant here. Decoration only: nothing listens. The PDF export
   writes the same ops as SVG (export/pdfExport.js).

   The canvas text floor (CLAUDE.md Rule 8, canvas2/minText.js): each pill (a rect and the text in its box) and each
   lone text is a LABEL — under 11 px on screen it grows to 11 px about its centre, pill and text together; the lines
   (a dimension line, its ticks, an arrow) stay drawing-size. A label with a dimension line has that line's length as its
   room along it: a pill that would grow longer than the gap it measures hides instead. */
export function LabelOps({ ops, name }) {
  if (!ops || !ops.length) return null
  // the room: the longest line of the op list, along its own direction
  let fit = null
  for (const o of ops) {
    if (o.op !== 'line' || !o.points || o.points.length < 4) continue
    const dx = Math.abs(o.points[2] - o.points[0]), dy = Math.abs(o.points[3] - o.points[1]), len = Math.hypot(dx, dy)
    if (!fit || len > fit.len) fit = { len, alongX: dx >= dy }
  }
  const out = []
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]
    if (o.op === 'line') {
      out.push(<Line key={i} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} dash={o.dash} opacity={o.opacity ?? 1}
        perfectDrawEnabled={false} listening={false} />)
      continue
    }
    if (o.op === 'poly') {
      out.push(<Line key={i} closed points={o.points} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity ?? 1}
        perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />)
      continue
    }
    const t = o.op === 'rect' ? ops[i + 1] : null
    const pill = o.op === 'rect' && t && t.op === 'text' && t.x === o.x && t.y === o.y
    if (o.op === 'rect' && !pill) {
      out.push(<Rect key={i} name={o.name} x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
        dash={o.dash} cornerRadius={o.cornerRadius} opacity={o.opacity ?? 1} perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />)
      continue
    }
    const txt = pill ? t : o
    if (txt.op !== 'text') continue
    const minLabel = {
      fs: txt.fontSize, at: { x: txt.x + txt.w / 2, y: txt.y + txt.h / 2 }, box: { w: (pill ? o : txt).w, h: (pill ? o : txt).h },
      fit: fit ? (fit.alongX ? { w: fit.len } : { h: fit.len }) : undefined,
    }
    out.push(
      <Group key={i} minLabel={minLabel} listening={false}>
        {pill && (
          // a pill (pillOps: its rect, then its text in the same box) is named, so the selection bar keeps off it
          <Rect name="label-pill" x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
            dash={o.dash} cornerRadius={o.cornerRadius} opacity={o.opacity ?? 1}
            perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />
        )}
        <Text x={txt.x} y={txt.y} width={txt.w} height={txt.h} text={txt.text} align="center" verticalAlign="middle"
          fontSize={txt.fontSize} fontFamily={txt.fontFamily} fontStyle={txt.fontStyle} fill={txt.fill} listening={false} />
      </Group>,
    )
    if (pill) i++
  }
  return <Group name={name} listening={false}>{out}</Group>
}
