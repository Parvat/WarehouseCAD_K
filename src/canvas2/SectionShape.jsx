import { memo } from 'react'
import { Group, Line, Text, Rect, Circle } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { nodeName } from './shapes'
import { polygonOf, isSection, sectionStyle, boundaryOf, wallInOf, edgeRuns } from '../utils/sectionAreas'
import { useSectionTool, useSectionHover, SECTION_PEN_TOOL } from './sectionTool'
import { drawnBox } from '../utils/sectionEdit'
import { useLiveObjects, useView } from './live'

/* A section on the plan (STUDIO.md §7a Sections), drawn under the racks: a dashed #B9C7BE 1px outline (dash 6 4) and a
   very light #F4F8F5 fill — or its colour (utils/sectionAreas.js sectionStyle: the outline, a tint, a deeper label);
   selected (or hovered in the card's Sections list) the outline solid 1.5 (#2E7D5B with #7BD3A4 at 10 % when plain).
   A boundary is drawn on its edges, cut where a door stands in them: a Fence a thin dark line (a wire partition), a
   Wall a solid band of its thickness. Its name is not on the floor: a tab on its outline, drawn above the racks
   (SectionNames.jsx). */
function SectionShapeView({ obj, selected = false, listening = false, bind, doors = null, gridSize = 40 }) {
  const hovered = useSectionHover(s => s.id === obj.id)
  if (!(obj.width > 0) || !(obj.height > 0)) return null
  const pts = polygonOf(obj).flat(), on = selected || hovered, st = sectionStyle(obj, on), b = boundaryOf(obj)
  const runs = b === 'none' ? [] : edgeRuns(obj, doors || [])
  return (
    <Group name={nodeName(obj.id)} listening={listening} {...(bind ? bind(obj) : null)}>
      <Line points={pts} closed fill={st.fill || undefined} stroke={b === 'none' || on ? st.stroke : undefined} strokeWidth={st.width}
        dash={st.dash || undefined} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={listening} />
      {b === 'fence' && runs.map((r, i) => <Line key={'f' + i} name="section-fence" points={[...r.a, ...r.b]} stroke="#4A514D" strokeWidth={1.25} strokeScaleEnabled={false} listening={false} />)}
      {b === 'wall' && runs.map((r, i) => <Line key={'w' + i} name="section-wall" points={[...r.a, ...r.b]} stroke="#1F2321" strokeWidth={(wallInOf(obj) / 12) * gridSize} lineCap="butt" listening={false} />)}
    </Group>
  )
}
export const SectionShape = memo(SectionShapeView)

/** The drawing in progress: the rectangle's box, or the pen's points and the line to the pointer. */
export function SectionDraft() {
  const drag = useSectionTool(s => s.drag), pen = useSectionTool(s => s.pen), at = useSectionTool(s => s.at)
  const guide = useSectionTool(s => s.guide), len = useSectionTool(s => s.len), gs = useCanvasStore(s => s.gridSize) || 40
  const tool = useCanvasStore(s => s.activeTool), zoom = useCanvasStore(s => s.zoom) || 1
  const objects = useCanvasStore(s => s.objects)
  const sides = useSectionTool(s => s.sides), hot = useSectionTool(s => s.hot)
  const snapGuides = useSectionTool(s => s.snapGuides) || []
  // the wall close: both sides offered, the one under the pointer lit — the next click picks it
  if (sides) return (
    <Group name="section-draft" listening={false}>
      {sides.map((sd, i) => sd.ok && <Line key={i} name={i === hot ? 'section-side-hot' : 'section-side'} points={sd.pts.flat()} closed
        fill={i === hot ? 'rgba(123, 211, 164, 0.18)' : undefined} stroke="#2E7D5B" strokeWidth={i === hot ? 1.5 : 1} dash={i === hot ? undefined : [6, 4]} strokeScaleEnabled={false} listening={false} />)}
    </Group>
  )
  if (drag) {
    // the box as the release will make it: kept inside the building and off the neighbours (utils/sectionEdit.js)
    const b = drawnBox(objects, drag.from, drag.to, gs) || { x: drag.from.x, y: drag.from.y, w: 0, h: 0 }
    return (
      <Group name="section-draft" listening={false}>
        <Rect x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(123, 211, 164, 0.10)" stroke="#2E7D5B" strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />
        {/* the snap's guides (sections-3): dashed, through the matched edge */}
        {snapGuides.map((g, i) => <Line key={i} name="section-snap-guide" points={g.axis === 'x' ? [g.val, g.from, g.val, g.to] : [g.from, g.val, g.to, g.val]} stroke="#22c55e" strokeWidth={1} dash={[6, 3]} opacity={0.9} strokeScaleEnabled={false} listening={false} />)}
      </Group>
    )
  }
  if (tool !== SECTION_PEN_TOOL || !pen.length) return null
  const pts = [...pen, ...(at ? [[at.x, at.y]] : [])].flat()
  return (
    <Group name="section-draft" listening={false}>
      {/* the snapped angle's guide (horizontal, vertical or 45°), dashed */}
      {guide && <Line name="section-guide" points={[...guide.a, ...guide.b]} stroke="#1B4FD8" strokeWidth={1} dash={[4, 4]} opacity={0.7} strokeScaleEnabled={false} listening={false} />}
      <Line points={pts} stroke="#2E7D5B" strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />
      {/* the live length of the segment being drawn, beside the pointer */}
      {at && len > 0 && <Text name="section-length" x={at.x + 10 / zoom} y={at.y + 10 / zoom} text={ftInLen(len, gs)} fontSize={11 / zoom} fontStyle="600" fontFamily="'Plus Jakarta Sans', sans-serif" fill="#1B4FD8" listening={false} />}
      {pen.map(([x, y], i) => <Circle key={i} x={x} y={y} radius={(i === 0 && pen.length >= 3 ? 5 : 3.5) / zoom} fill="#FFFFFF" stroke="#2E7D5B" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />)}
    </Group>
  )
}

const ftInLen = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′-${i}″` : `${f}′` }

/** A selected custom shape's point handles (white squares, 8 screen px). */
export const POINT_HANDLE_PX = 8
export function SectionPointHandles({ obj: picked }) {
  const zoom = useView().zoom || 1
  const live = useLiveObjects(), obj = live.find(o => o.id === picked?.id) || picked     // where it is drawn now (live.js)
  if (!isSection(obj) || obj.shape !== 'poly') return null
  const s = POINT_HANDLE_PX / zoom
  return (
    <Group name="section-points" listening={false}>
      {polygonOf(obj).map(([x, y], i) => <Rect key={i} name="section-point" x={x - s / 2} y={y - s / 2} width={s} height={s} fill="#FFFFFF" stroke="#2E7D5B" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />)}
    </Group>
  )
}
