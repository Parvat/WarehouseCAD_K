// SectionNames.jsx — a section's label on the plan (STUDIO.md §7a Sections): one dark tag at the middle of its top edge,
// just inside it, in the zone size tag's style and place (ZoneEdit.jsx ZoneSizeLabel: the dark label pill, JetBrains Mono 11 px), reading
// "Name · W x L" — "Section 1 · 26 ft 11 in x 37 ft 1 in" — or, for a custom shape, "Name · area" ("Section 2 · 1,240
// sq ft"). No name inside the section and no dimension labels along its edges. Shown while the section is hovered or
// selected, or for every section while the View card's Section names is on (sectionNameShown.js); hidden while its name
// is typed. Each tag's box is published as drawn (sectionNameShown.js boxes, world px): a press on it is the section's
// (canvas2/hitTest.js), and the rename box opens on it. Pure paint (never listens); hidden with the Sections layer.

import { useEffect, useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useViewPrefs } from '../studio/viewPrefs'
import { useHoverTarget } from './hoverTarget'
import { useSectionHover, useSectionRename } from './sectionTool'
import { nameShownBy, useShownNames } from './sectionNameShown'
import { isSection, polygonOf, areaOf } from '../utils/sectionAreas'
import { layerShown } from '../utils/layers'
import { useLiveObjects, useView } from './live'

/* the zone size tag's look (ZoneEdit.jsx ZoneSizeLabel → DimensionLabels.jsx LabelPill) */
const TAG = { px: 11, bg: '#0a0d16', fg: '#D8B4FE', opacity: 0.85, padX: 4, radius: 2, font: 'JetBrains Mono, monospace' }

/** A length in words: 26 ft 11 in (whole inches; 0 in left out). */
export const ftInWords = (px, gs) => { const t = Math.round((px / gs) * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f} ft ${i} in` : `${f} ft` }
/** A section's tag text: "Name · W x L", a custom shape "Name · area". */
export function sectionTagText(s, gs) {
  const name = s.label || 'Section'
  if (s.shape === 'poly') return `${name} · ${Math.round(areaOf(s) / (gs * gs)).toLocaleString('en-US')} sq ft`
  return `${name} · ${ftInWords(s.width, gs)} x ${ftInWords(s.height, gs)}`
}
/** The tag's box (world px) at `zoom`: at the middle of the section's top edge, just inside it as the zone size tag sits
 *  (its centre 1.4 × 11 px in — clear of the selected section's top handle, which takes a press first) */
export function sectionTagBox(s, gs, zoom) {
  const p = polygonOf(s), xs = p.map(q => q[0]), ys = p.map(q => q[1])
  const fs = TAG.px / zoom, text = sectionTagText(s, gs)
  const w = text.length * fs * 0.62 + (TAG.padX / zoom) * 2, h = fs * 1.5
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = Math.min(...ys) + (TAG.px * 1.4) / zoom
  return { x: cx - w / 2, y: cy - h / 2, w, h, fs, text }
}

export function SectionNames() {
  // where the sections are drawn now — a drag moves them before the store (live.js)
  const objects = useLiveObjects()
  const zoom = useView().zoom
  const { layers, selectedIds, gs } = useCanvasStore(useShallow(s => ({ layers: s.layers, selectedIds: s.selectedIds, gs: s.gridSize || 40 })))
  const on = useViewPrefs(s => s.sectionNames)
  const hoverIds = useHoverTarget(s => s.target?.ids || null)
  const listHover = useSectionHover(s => s.id), renaming = useSectionRename(s => s.id)
  const visible = layerShown(layers, 'sections')
  const shown = visible ? objects.filter(o => isSection(o) && nameShownBy({ on, selectedIds, hoverIds, listHover }, o.id)) : []
  const want = shown.map(s => s.id).concat(renaming && !shown.some(s => s.id === renaming) ? [renaming] : [])
  const key = want.join(',')
  const boxes = useMemo(() => {
    const out = {}
    if (!key) return out
    for (const id of key.split(',')) { const s = objects.find(o => o.id === id); if (s) out[id] = sectionTagBox(s, gs, zoom) }
    return out
  }, [key, objects, gs, zoom])
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
            <Rect name="section-tag" x={b.x} y={b.y} width={b.w} height={b.h} fill={TAG.bg} opacity={TAG.opacity} cornerRadius={TAG.radius / zoom}
              perfectDrawEnabled={false} listening={false} />
            <Text name="section-label" x={b.x} y={b.y} width={b.w} height={b.h} align="center" verticalAlign="middle" text={b.text}
              fontSize={b.fs} fontFamily={TAG.font} fill={TAG.fg} listening={false} perfectDrawEnabled={false} />
          </Group>
        )
      })}
    </Group>
  )
}
