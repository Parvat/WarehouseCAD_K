// TallyHighlight.jsx — the Tally drawer's lines on the plan (studio/TallyDrawer.jsx, STUDIO.md §7a): the R column under
// the pointer lights its rack line — filled #D7F0E2, a 2px #2E7D5B outline — with a small tag beside it, "R6 · 12 bays
// · 48 positions"; a section's Total column clicked lights every line of that section the same way (no tag).
// TallyFill is the fill, drawn in the scene's own layer over the racks with `multiply`, so a rack's white reads as
// #D7F0E2 and its bay lines stay; TallyHighlight the outline and the tag, over everything. Pure paint (never listens).
// Konva names: `tally-line` (each lit line's outline), `tally-tag`.

import { useMemo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackLinesNow } from '../utils/rackLines'
import { useTally, lineFigures, lineRect } from '../studio/tally'
import { useLiveObjects, useView } from './live'
import { lineFullNamer } from '../utils/lineNames'

const FILL = '#D7F0E2', LINE = '#2E7D5B', FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/** The lit lines: [{ no, rect, tag }] — the hovered one (with its tag), then a picked section's. */
function useLit() {
  const { open, hover, section } = useTally(useShallow(s => ({ open: s.open, hover: s.hover, section: s.section })))
  // the lines where the racks are drawn now (live.js)
  const objects = useLiveObjects()
  const { gs, T } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, T: s.elevations })))
  return useMemo(() => {
    if (!open || (hover == null && !section)) return []
    const lines = rackLinesNow(objects, gs), out = []
    const h = hover != null ? lines.find(l => l.no === hover) : null
    if (h) { const f = lineFigures(objects, h, gs, T); out.push({ no: h.no, rect: lineRect(h), tag: `${lineFullNamer(objects, T, gs)(h.no)} · ${f.bays} bay${f.bays === 1 ? '' : 's'} · ${f.positions.toLocaleString('en-US')} position${f.positions === 1 ? '' : 's'}` }) }
    if (section) for (const l of lines) if (section.nos.includes(l.no) && l.no !== h?.no) out.push({ no: l.no, rect: lineRect(l), tag: null })
    return out
  }, [open, hover, section, objects, gs, T])
}

export function TallyFill() {
  const lit = useLit()
  if (!lit.length) return null
  return (
    <Group name="tally-fill" listening={false}>
      {lit.map(l => <Rect key={l.no} x={l.rect.x} y={l.rect.y} width={l.rect.w} height={l.rect.h} fill={FILL} globalCompositeOperation="multiply" listening={false} perfectDrawEnabled={false} />)}
    </Group>
  )
}

export function TallyHighlight() {
  const lit = useLit()
  const zoom = useView().zoom || 1
  if (!lit.length) return null
  const fs = 11 / zoom, pad = 6 / zoom, th = fs + 8 / zoom, gap = 6 / zoom
  return (
    <Group name="tally-highlight" listening={false}>
      {lit.map(l => (
        <Rect key={l.no} name="tally-line" x={l.rect.x} y={l.rect.y} width={l.rect.w} height={l.rect.h} stroke={LINE} strokeWidth={2} strokeScaleEnabled={false}
          listening={false} perfectDrawEnabled={false} />
      ))}
      {lit.filter(l => l.tag).map(l => {
        const w = l.tag.length * fs * 0.58 + pad * 2
        return (
          <Group key={'t' + l.no} name="tally-tag" x={l.rect.x} y={l.rect.y - gap - th} listening={false}>
            <Rect width={w} height={th} fill={LINE} cornerRadius={4 / zoom} listening={false} />
            <Text text={l.tag} width={w} height={th} align="center" verticalAlign="middle" fontSize={fs} fontFamily={FONT} fontStyle="600" fill="#FFFFFF" listening={false} />
          </Group>
        )
      })}
    </Group>
  )
}
