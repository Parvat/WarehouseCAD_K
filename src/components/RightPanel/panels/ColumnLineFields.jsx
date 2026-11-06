import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../../../store/useCanvasStore'
import { useColumnPick } from '../../../canvas2/columnPick'
import { lineIndexOf, gapsOf, setLineGap } from '../../../canvas2/columnLines'
import { isPickable } from '../../../utils/layers'
import { parseFeet } from './RackingAreaPanel'
import { Grid2, Field, TextInput, StaticField, SecLabel, LockedFields } from '../../../studio/cardParts'

/* A column picked (canvas2/columnPick.js): the distance from its lines to the line before and after each, as typed
   fields — typing moves that column's line (canvas2/columnLines.js setLineGap, one undo step); the other lines stay.
   On a locked Columns layer the fields are disabled at 45 %, titled Locked (STUDIO.md §7a Locks). */
const fmt = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′ ${i}″` : `${f}′` }

export function ColumnLineFields({ obj }) {
  const pick = useColumnPick(s => s.pick)
  const { gs, layers } = useCanvasStore(useShallow(s => ({ gs: s.gridSize || 40, layers: s.layers })))
  if (!pick || pick.gridId !== obj.id) return null
  const ix = lineIndexOf(obj, pick, 'x'), iy = lineIndexOf(obj, pick, 'y')
  const gx = gapsOf(obj, 'x', ix), gy = gapsOf(obj, 'y', iy)
  const field = (label, aria, axis, i, side, px) => (
    <Field label={label}>
      {px == null
        ? <StaticField aria={aria}>—</StaticField>
        : <TextInput aria={aria} value={fmt(px, gs)} onCommit={t => {
            const ft = parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"').replace(/-/g, ' '))
            if (ft != null) setLineGap(useCanvasStore, obj.id, axis, i, side, ft * gs)
          }} />}
    </Field>
  )
  return (
    <LockedFields locked={!isPickable(layers, obj)}>
      <SecLabel>Column lines</SecLabel>
      <Grid2>
        {field('To the line left', 'Distance to the line left', 'x', ix, 'prev', gx.prev)}
        {field('To the line right', 'Distance to the line right', 'x', ix, 'next', gx.next)}
        {field('To the line above', 'Distance to the line above', 'y', iy, 'prev', gy.prev)}
        {field('To the line below', 'Distance to the line below', 'y', iy, 'next', gy.next)}
      </Grid2>
    </LockedFields>
  )
}
