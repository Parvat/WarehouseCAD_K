// SectionLegend.jsx — the sections' legend on the plan (utils/sectionLegend.js; STUDIO.md §7a Sections, legend round): a
// key just outside each building at its bottom-left, a line per section — its colour swatch and its name. Shown with the
// View card's Section names (and the Sections layer); there are no name tags on the floor. A section hovered (on the plan,
// its legend line, or its row in the card's Sections list) or selected: its line bold (its outline in its colour —
// SectionShape.jsx). A click on a line selects the section; a second click on its line renames it in place
// (useCanvasInteraction.js; the rename box sits over the line — the boxes published to sectionNameShown.js).

import { useEffect, useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { sectionLegend } from '../utils/sectionLegend'
import { layerShown } from '../utils/layers'
import { useViewPrefs } from '../studio/viewPrefs'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { useLiveObjects } from './live'
import { useHoverTarget } from './hoverTarget'
import { useSectionHover } from './sectionTool'
import { useShownNames } from './sectionNameShown'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif", INK = '#1F2321', PLAIN = '#9AA29C'

/** Is the legend on the plan now (the View card's Section names, the Sections layer shown)? */
export const legendShown = (st, on) => !!on && layerShown(st.layers, 'sections')

export function SectionLegend() {
  const objects = useLiveObjects()
  const { layers, selectedIds, gs } = useCanvasStore(useShallow(s => ({ layers: s.layers, selectedIds: s.selectedIds, gs: s.gridSize || 40 })))
  const on = useViewPrefs(s => s.sectionNames), labelSize = useLabelPrefs(s => s.labelSize)
  const hoverIds = useHoverTarget(s => s.target?.ids || null), listHover = useSectionHover(s => s.id)
  const lz = labelScale(labelSize, gs)
  const shown = legendShown({ layers }, on)
  const legends = useMemo(() => (shown ? sectionLegend(objects, gs, lz) : []), [shown, objects, gs, lz])
  // where each line is (the rename box goes over it — SectionBar.jsx SectionRename); no name tag is a click target
  useEffect(() => {
    const boxes = {}
    for (const L of legends) for (const q of L.items) boxes[q.id] = { x: q.tx, y: q.y, w: q.w - (q.tx - q.x), h: q.h, fs: L.m.fs }
    useShownNames.setState({ ids: [], boxes })
  }, [legends])
  useEffect(() => () => useShownNames.setState({ ids: [], boxes: {} }), [])
  if (!legends.length) return null
  const hot = (id) => selectedIds.includes(id) || (hoverIds || []).includes(id) || listHover === id
  return (
    <Group name="section-legend" listening={false}>
      {legends.map(L => (
        <Group key={L.fpId || 'none'} name={'section-legend:' + L.fpId} listening={false}>
          <Rect name="section-legend-box" x={L.x} y={L.y} width={L.w} height={L.h} fill="#FFFFFF" opacity={0.92} stroke="#D5D9D6" strokeWidth={1} strokeScaleEnabled={false}
            cornerRadius={L.m.fs * 0.3} listening={false} perfectDrawEnabled={false} />
          {L.items.map(q => (
            <Group key={q.id} name={'section-legend-line:' + q.id} listening={false}>
              <Rect name="section-legend-swatch" x={q.sx} y={q.sy} width={L.m.sw} height={L.m.sw} fill={q.color || PLAIN} cornerRadius={L.m.sw * 0.2} listening={false} perfectDrawEnabled={false} />
              <Text name="section-legend-text" text={q.name} x={q.tx} y={q.y} height={q.h} verticalAlign="middle" fontSize={L.m.fs} fontFamily={FONT}
                fontStyle={hot(q.id) ? '700' : '400'} fill={INK} wrap="none" listening={false} perfectDrawEnabled={false} />
            </Group>
          ))}
        </Group>
      ))}
    </Group>
  )
}
