// SectionNames.jsx — the sections' names on the plan (STUDIO.md §7a Sections): off the floor, as a small white tab on
// the section's outline, outside it where there is room (utils/sectionAreas.js labelBox), drawn above the racks so a rack
// never covers it. Shown for every section while the bottom-right island's Sections is on, else only for the one hovered
// or selected (sectionNameShown.js); hidden while its name is typed. Pure paint (never listens); hidden with the Sections layer.

import { useEffect } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useViewPrefs } from '../studio/viewPrefs'
import { useHoverTarget } from './hoverTarget'
import { useSectionHover, useSectionRename } from './sectionTool'
import { nameShownBy, useShownNames } from './sectionNameShown'
import { isSection, labelBox, LABEL } from '../utils/sectionAreas'
import { layerShown } from '../utils/layers'
import { useLiveObjects, useView } from './live'

export function SectionNames() {
  // where the sections are drawn now — a drag moves them before the store (live.js)
  const objects = useLiveObjects(), zoom = useView().zoom || 1
  const { layers, selectedIds } = useCanvasStore(useShallow(s => ({ layers: s.layers, selectedIds: s.selectedIds })))
  const on = useViewPrefs(s => s.sectionNames)
  const hoverIds = useHoverTarget(s => s.target?.ids || null)
  const listHover = useSectionHover(s => s.id), renaming = useSectionRename(s => s.id)
  const secs = layerShown(layers, 'sections') ? objects.filter(o => isSection(o) && o.id !== renaming && nameShownBy({ on, selectedIds, hoverIds, listHover }, o.id)) : []
  // what is drawn is what a click can reach (canvas2/hitTest.js)
  const key = secs.map(s => s.id).join(',')
  useEffect(() => { useShownNames.setState({ ids: key ? key.split(',') : [] }) }, [key])
  useEffect(() => () => useShownNames.setState({ ids: [] }), [])
  if (!secs.length) return null
  return (
    <Group name="section-names" listening={false}>
      {secs.map(s => {
        // the dark chip (sections-3): inside the section in its largest empty area, else on the outline outside it
        const b = labelBox(s, zoom, objects)
        return (
          <Group key={s.id} name={'section-tab:' + s.id} listening={false}>
            <Rect name="section-tab" x={b.x} y={b.y} width={b.w} height={b.h} fill={LABEL.bg} cornerRadius={4 / zoom} listening={false} perfectDrawEnabled={false} />
            <Text name="section-label" x={b.x} y={b.y} width={b.w} height={b.h} align="center" verticalAlign="middle" text={s.label || 'Section'} fontSize={LABEL.px / zoom}
              fontStyle="600" fontFamily={LABEL.font} fill={LABEL.color} listening={false} />
          </Group>
        )
      })}
    </Group>
  )
}
