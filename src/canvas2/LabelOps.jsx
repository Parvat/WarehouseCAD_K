import { Group, Line, Rect, Text } from 'react-konva'

/* Paints a label op list (render/labelOps.js) with Konva. Everything is in
   world units and scales with the stage like any drawn object — no stroke is
   screen-constant here. Decoration only: nothing listens. The PDF export
   writes the same ops as SVG (export/pdfExport.js). */
export function LabelOps({ ops, name }) {
  if (!ops || !ops.length) return null
  return (
    <Group name={name} listening={false}>
      {ops.map((o, i) => {
        if (o.op === 'line') {
          return <Line key={i} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} dash={o.dash} opacity={o.opacity ?? 1}
            perfectDrawEnabled={false} listening={false} />
        }
        if (o.op === 'poly') {
          return <Line key={i} closed points={o.points} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity ?? 1}
            perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />
        }
        if (o.op === 'rect') {
          return <Rect key={i} name={o.name} x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth}
            dash={o.dash} cornerRadius={o.cornerRadius} opacity={o.opacity ?? 1}
            perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />
        }
        if (o.op === 'text') {
          return <Text key={i} x={o.x} y={o.y} width={o.w} height={o.h} text={o.text} align="center" verticalAlign="middle"
            fontSize={o.fontSize} fontFamily={o.fontFamily} fill={o.fill} listening={false} />
        }
        return null
      })}
    </Group>
  )
}
