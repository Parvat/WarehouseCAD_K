import { memo } from 'react'
import { Group, Line, Text, Rect, Circle } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { nodeName } from './shapes'
import { polygonOf, LABEL, isSection } from '../utils/sectionAreas'
import { useSectionTool, useSectionHover, useSectionRename, boxOf, SECTION_PEN_TOOL } from './sectionTool'

/* A section on the plan (STUDIO.md §7a Sections), drawn under the racks: a dashed #B9C7BE 1px outline (dash 6 4) and a
   very light #F4F8F5 fill; selected (or hovered in the card's Sections list) a #2E7D5B 1.5px outline and #7BD3A4 at 10 %.
   Its name in small caps — Plus Jakarta Sans 11px 600, #767C74 — at the top-left inside, 12px in (screen px: the
   label keeps its size at every zoom; only it reads the zoom). */
function SectionShapeView({ obj, selected = false, listening = false, bind }) {
  const zoom = useCanvasStore(s => s.zoom) || 1
  const hovered = useSectionHover(s => s.id === obj.id)
  const renaming = useSectionRename(s => s.id === obj.id)
  if (!(obj.width > 0) || !(obj.height > 0)) return null
  const pts = polygonOf(obj).flat(), on = selected || hovered
  return (
    <Group name={nodeName(obj.id)} listening={listening} {...(bind ? bind(obj) : null)}>
      <Line points={pts} closed fill={on ? 'rgba(123, 211, 164, 0.10)' : '#F4F8F5'} stroke={on ? '#2E7D5B' : '#B9C7BE'} strokeWidth={on ? 1.5 : 1}
        dash={on ? undefined : [6, 4]} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={listening} />
      {!renaming && (
        <Text name="section-label" x={obj.x + LABEL.inset / zoom} y={obj.y + LABEL.inset / zoom} text={obj.label || 'Section'}
          fontSize={LABEL.px / zoom} fontStyle="600" fontVariant="small-caps" fontFamily={LABEL.font} fill={LABEL.color} listening={false} />
      )}
    </Group>
  )
}
export const SectionShape = memo(SectionShapeView)

/** The drawing in progress: the rectangle's box, or the pen's points and the line to the pointer. */
export function SectionDraft() {
  const drag = useSectionTool(s => s.drag), pen = useSectionTool(s => s.pen), at = useSectionTool(s => s.at)
  const tool = useCanvasStore(s => s.activeTool), zoom = useCanvasStore(s => s.zoom) || 1
  if (drag) {
    const b = boxOf(drag)
    return <Rect name="section-draft" x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(123, 211, 164, 0.10)" stroke="#2E7D5B" strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />
  }
  if (tool !== SECTION_PEN_TOOL || !pen.length) return null
  const pts = [...pen, ...(at ? [[at.x, at.y]] : [])].flat()
  return (
    <Group name="section-draft" listening={false}>
      <Line points={pts} stroke="#2E7D5B" strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />
      {pen.map(([x, y], i) => <Circle key={i} x={x} y={y} radius={(i === 0 && pen.length >= 3 ? 5 : 3.5) / zoom} fill="#FFFFFF" stroke="#2E7D5B" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />)}
    </Group>
  )
}

/** A selected custom shape's point handles (white squares, 8 screen px). */
export const POINT_HANDLE_PX = 8
export function SectionPointHandles({ obj }) {
  const zoom = useCanvasStore(s => s.zoom) || 1
  if (!isSection(obj) || obj.shape !== 'poly') return null
  const s = POINT_HANDLE_PX / zoom
  return (
    <Group name="section-points" listening={false}>
      {polygonOf(obj).map(([x, y], i) => <Rect key={i} name="section-point" x={x - s / 2} y={y - s / 2} width={s} height={s} fill="#FFFFFF" stroke="#2E7D5B" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />)}
    </Group>
  )
}
