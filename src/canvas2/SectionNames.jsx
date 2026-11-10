// SectionNames.jsx — the sections' names on the plan (STUDIO.md §7a Sections): large text like a zone's name (Plus Jakarta
// Sans 600, the zone's size rule) in the section's colour (#767C74 with none), placed in the section's biggest open floor
// area — no rack, no zone and no label under it (the aisle and cross-aisle width labels, the R labels, the columns and their
// clearance numbers, other sections' names) — shrunk to fit down to 1 ft; with no room inside, just outside an edge on open floor; never over a rack
// (utils/sectionAreas.js nameBox). Shown for every section while the View card's Section names is on, else only for the
// one hovered or selected (sectionNameShown.js); hidden while its name is typed. Each box is published as drawn
// (sectionNameShown.js boxes): the click and the rename box read the same place. Pure paint (never listens); hidden with
// the Sections layer.

import { useEffect, useMemo } from 'react'
import { Group, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useViewPrefs } from '../studio/viewPrefs'
import { useHoverTarget } from './hoverTarget'
import { useSectionHover, useSectionRename } from './sectionTool'
import { nameShownBy, useShownNames } from './sectionNameShown'
import { isSection, nameBox, nameColor, LABEL } from '../utils/sectionAreas'
import { layerShown } from '../utils/layers'
import { useLiveObjects } from './live'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { aisleLabelBoxes } from '../render/labelOps'
import { rackLinesNow } from '../utils/rackLines'
import { rowLabelPlaces, ROW_LABEL_PX } from './RackLineLabels'
import { columnRectsOf } from './hitTest'

export function SectionNames() {
  // where the sections are drawn now — a drag moves them before the store (live.js)
  const objects = useLiveObjects()
  const { layers, selectedIds, gs } = useCanvasStore(useShallow(s => ({ layers: s.layers, selectedIds: s.selectedIds, gs: s.gridSize || 40 })))
  const on = useViewPrefs(s => s.sectionNames), rowsOn = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  const hoverIds = useHoverTarget(s => s.target?.ids || null)
  const listHover = useSectionHover(s => s.id), renaming = useSectionRename(s => s.id)
  const visible = layerShown(layers, 'sections')
  const shown = visible ? objects.filter(o => isSection(o) && nameShownBy({ on, selectedIds, hoverIds, listHover }, o.id)) : []
  const want = shown.map(s => s.id).concat(renaming && !shown.some(s => s.id === renaming) ? [renaming] : [])
  const key = want.join(',')
  // the plan's labels a name keeps off: the width labels and (when drawn) the R labels, then each name placed in turn
  const boxes = useMemo(() => {
    if (!key) return {}
    const avoid = [...aisleLabelBoxes(objects, gs, labelSize)]
    // the columns and the clearance numbers drawn beside them (9.5 at the Label size — render/labelOps.js): each column grown
    // by three of their heights
    const cg = (3 * 9.5) / labelScale(labelSize, gs)
    for (const c of columnRectsOf(objects, gs)) avoid.push({ x: c.x - cg, y: c.y - cg, w: c.w + 2 * cg, h: c.h + 2 * cg })
    if (rowsOn && layerShown(layers, 'racking')) {
      const fsR = ROW_LABEL_PX / labelScale(labelSize, gs)
      for (const p of rowLabelPlaces(rackLinesNow(objects, gs), fsR, avoid)) avoid.push({ x: p.x, y: p.y, w: p.w, h: p.h })
    }
    const out = {}
    for (const id of key.split(',')) {
      const s = objects.find(o => o.id === id)
      const b = s ? nameBox(s, objects, { gridSize: gs, avoid }) : null
      if (b) { out[id] = b; avoid.push(b) }
    }
    return out
  }, [key, objects, gs, labelSize, rowsOn, layers])
  // what is drawn is what a click can reach (canvas2/hitTest.js), and where
  const drawn = shown.filter(s => s.id !== renaming && boxes[s.id])
  const ids = drawn.map(s => s.id).join(',')
  useEffect(() => { useShownNames.setState({ ids: ids ? ids.split(',') : [], boxes }) }, [ids, boxes])
  useEffect(() => () => useShownNames.setState({ ids: [], boxes: {} }), [])
  if (!drawn.length) return null
  return (
    <Group name="section-names" listening={false}>
      {drawn.map(s => {
        const b = boxes[s.id]
        return (
          <Group key={s.id} name={'section-tab:' + s.id} listening={false}>
            <Text name="section-label" x={b.x} y={b.y} width={b.w} height={b.h} align="center" verticalAlign="middle" text={s.label || 'Section'}
              fontSize={b.fs} fontStyle={LABEL.weight} fontFamily={LABEL.font} fill={nameColor(s)} listening={false} perfectDrawEnabled={false} />
          </Group>
        )
      })}
    </Group>
  )
}
