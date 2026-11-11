// SectionNames.jsx — a section's label on the plan (STUDIO.md §7a Sections): one dark tag (the zone size tag's pill —
// ZoneEdit.jsx ZoneSizeLabel: dark, JetBrains Mono 11 px — its text white #F2F4F1) reading "Name · W × L" in the app's
// feet-inches ("Section 1 · 137′-5″ × 87′-3″"), a custom shape "Name · area" ("Section 2 · 2,625 sq ft"). Placed on open
// floor: inside the section along each edge in turn — bottom, right, top, left — the first spot where the whole tag has no
// rack, no R label, no aisle label, no zone and no other tag under it; with none inside, just outside an edge on open
// floor (the building's, and no other section). Never over a rack or a label (no room anywhere: not drawn). No name
// inside the section and no dimension labels along its edges. Shown while the section is hovered or selected, or for
// every section while the View card's Section names is on (sectionNameShown.js); hidden while its name is typed. Each
// tag's box is published as drawn (sectionNameShown.js boxes, world px): a press on it is the section's
// (canvas2/hitTest.js), and the rename box opens on it. Pure paint (never listens); hidden with the Sections layer.

import { useEffect, useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useViewPrefs } from '../studio/viewPrefs'
import { useHoverTarget } from './hoverTarget'
import { useSectionHover, useSectionRename } from './sectionTool'
import { nameShownBy, useShownNames } from './sectionNameShown'
import { isSection, polygonOf, areaOf, pointInPolygon } from '../utils/sectionAreas'
import { layerShown } from '../utils/layers'
import { useLiveObjects, useView } from './live'
import { ftIn } from '../utils/bom'
import { innerOutline } from '../utils/floorGeom'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { aisleLabelBoxes } from '../render/labelOps'
import { rackLinesNow } from '../utils/rackLines'
import { rowLabelPlaces, ROW_LABEL_PX } from './RackLineLabels'
import { worldBoundsOf } from './hitTest'

/* the zone size tag's pill (ZoneEdit.jsx ZoneSizeLabel → DimensionLabels.jsx LabelPill); the text white */
const TAG = { px: 11, bg: '#0a0d16', fg: '#F2F4F1', opacity: 0.85, padX: 4, radius: 2, font: 'JetBrains Mono, monospace' }
/* how far in from the edge the tag's near side sits (screen px): as the zone size tag sits under its top edge — clear of
   the selected section's edge handles, which take a press first */
const INSET_PX = TAG.px * 1.4 - (TAG.px * 1.5) / 2

/** A section's tag text: "Name · W × L" (the app's feet-inches: 137′-5″), a custom shape "Name · area". */
export function sectionTagText(s, gs) {
  const name = s.label || 'Section'
  if (s.shape === 'poly') return `${name} · ${Math.round(areaOf(s) / (gs * gs)).toLocaleString('en-US')} sq ft`
  return `${name} · ${ftIn((s.width / gs) * 12)} × ${ftIn((s.height / gs) * 12)}`
}
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** Spots along an edge from `lo` to `hi` for a length `len`: its middle first, then outward a half-length at a time; a
 *  tag longer than the edge: centred on its middle (inside, such a spot never fits; outside, it may). */
function along(lo, hi, len) {
  const room = hi - lo - len
  if (room < 0) return [lo + room / 2]
  const mid = lo + room / 2, out = [mid], step = Math.max(len / 2, 1e-6)
  for (let k = 1; mid - k * step >= lo - 1e-9 || mid + k * step <= lo + room + 1e-9; k++) {
    if (mid - k * step >= lo - 1e-9) out.push(mid - k * step)
    if (mid + k * step <= lo + room + 1e-9) out.push(mid + k * step)
  }
  return out
}
/** Where section `s`'s tag goes (world px) at `zoom` → { x, y, w, h, fs, text, place: 'inside' | 'outside' } or null.
 *  `blocks`: what it may not cover (racks, zones, R labels, aisle labels, tags placed) — world boxes. */
export function sectionTagBox(s, gs, zoom, { blocks = [], objects = [] } = {}) {
  const poly = polygonOf(s), xs = poly.map(q => q[0]), ys = poly.map(q => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const fs = TAG.px / zoom, text = sectionTagText(s, gs)
  const w = text.length * fs * 0.62 + (TAG.padX / zoom) * 2, h = fs * 1.5, m = INSET_PX / zoom
  const clear = (b) => !blocks.some(q => meets(b, q))
  const corners = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
  const tag = (x, y, place) => ({ x, y, w, h, fs, text, place })
  // inside, along each edge in turn: bottom, right, top, left
  const inside = (b) => corners(b).every(([px, py]) => pointInPolygon(poly, px, py))
  const tries = [
    ...along(x0 + m, x1 - m, w).map(x => ({ x, y: y1 - m - h })),
    ...along(y0 + m, y1 - m, h).map(y => ({ x: x1 - m - w, y })),
    ...along(x0 + m, x1 - m, w).map(x => ({ x, y: y0 + m })),
    ...along(y0 + m, y1 - m, h).map(y => ({ x: x0 + m, y })),
  ]
  for (const t of tries) { const b = tag(t.x, t.y, 'inside'); if (inside(b) && clear(b)) return b }
  // just outside an edge, on open floor: the building's, no other section under it
  const fp = (objects || []).find(o => o.id === s.parentId && /^fp_/.test(o.type || '')) || (objects || []).find(o => /^fp_/.test(o.type || ''))
  const floor = fp ? innerOutline(fp, gs).map(v => [v.x, v.y]) : null
  const others = (objects || []).filter(o => isSection(o) && o.id !== s.id).map(polygonOf)
  const onFloor = (b) => (!floor || corners(b).every(([px, py]) => pointInPolygon(floor, px, py))) && !others.some(g => corners(b).some(([px, py]) => pointInPolygon(g, px, py)))
  // (sliding along the edge as long as the tag still shares some of it — past a corner where the floor there is taken)
  const ox = along(x0 - w * 0.8, x1 + w * 0.8, w), oy = along(y0 - h * 0.8, y1 + h * 0.8, h)
  const outs = [
    ...ox.map(x => ({ x, y: y1 + m })),
    ...oy.map(y => ({ x: x1 + m, y })),
    ...ox.map(x => ({ x, y: y0 - m - h })),
    ...oy.map(y => ({ x: x0 - m - w, y })),
  ]
  for (const t of outs) { const b = tag(t.x, t.y, 'outside'); if (onFloor(b) && clear(b)) return b }
  return null
}

/** What a section tag may not cover (world boxes): the racks, the zones, the aisle and cross-aisle width labels (their
 *  arrows too), and the R labels when they are drawn (`rows`). */
export function tagBlocks(objects, gs, { labelSize, rows = false } = {}) {
  const blocks = []
  for (const o of objects) {
    if (typeof o?.type !== 'string') continue
    if (o.type.startsWith('rack_')) { const b = worldBoundsOf(o, objects); if (b) blocks.push({ x: b.x, y: b.y, w: b.width, h: b.height }) }
    else if (o.type.startsWith('zone_') && o.width > 0) blocks.push({ x: o.x, y: o.y, w: o.width, h: o.height })
  }
  blocks.push(...aisleLabelBoxes(objects, gs, labelSize, { whole: true }))
  if (rows) {
    const fsR = ROW_LABEL_PX / labelScale(labelSize, gs)
    for (const q of rowLabelPlaces(rackLinesNow(objects, gs), fsR, [])) blocks.push({ x: q.x, y: q.y, w: q.w, h: q.h })
  }
  return blocks
}

export function SectionNames() {
  // where the sections are drawn now — a drag moves them before the store (live.js)
  const objects = useLiveObjects()
  const zoom = useView().zoom
  const { layers, selectedIds, gs } = useCanvasStore(useShallow(s => ({ layers: s.layers, selectedIds: s.selectedIds, gs: s.gridSize || 40 })))
  const on = useViewPrefs(s => s.sectionNames), rowsOn = useViewPrefs(s => s.rowLabels || s.bomFull)
  const labelSize = useLabelPrefs(s => s.labelSize)
  const hoverIds = useHoverTarget(s => s.target?.ids || null)
  const listHover = useSectionHover(s => s.id), renaming = useSectionRename(s => s.id)
  const visible = layerShown(layers, 'sections')
  const shown = visible ? objects.filter(o => isSection(o) && nameShownBy({ on, selectedIds, hoverIds, listHover }, o.id)) : []
  const want = shown.map(s => s.id).concat(renaming && !shown.some(s => s.id === renaming) ? [renaming] : [])
  const key = want.join(',')
  // what a tag may not cover: the racks, the zones, the aisle and cross-aisle width labels, the R labels (when drawn),
  // and each tag placed before it
  const boxes = useMemo(() => {
    const out = {}
    if (!key) return out
    const blocks = tagBlocks(objects, gs, { labelSize, rows: rowsOn && layerShown(layers, 'racking') })
    for (const id of key.split(',')) {
      const s = objects.find(o => o.id === id)
      const b = s ? sectionTagBox(s, gs, zoom, { blocks, objects }) : null
      if (b) { out[id] = b; blocks.push(b) }
    }
    return out
  }, [key, objects, gs, zoom, labelSize, rowsOn, layers])
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
