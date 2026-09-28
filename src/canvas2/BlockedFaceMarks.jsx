import { memo, useMemo } from 'react'
import { Group, Line } from 'react-konva'
import { positionRectForIndex, growToMinScreenSize, spin } from './shapes'

/* ── Blocked pick face marks — canvas2's analogue of the SVG engine's
   ColumnCheckOverlay.jsx (rack-column kind only; aisle-blocked marks stay
   ColumnClearanceLabels' own arrow+label territory, unchanged).

   BUG 60 — the generator no longer has an allowColumnInRack preference: a
   column that can't be flue-seated is always absorbed into whichever rack
   face it lands in (a bay-column). BUG 61 — the mark belongs on the BAY
   the dealer can't use, not on the column. BUG 62 — narrower still: the
   mark belongs on the specific PALLET POSITION the column blocks, not the
   whole bay it happens to sit in — `checkColumns` now attaches
   `bayIndex`/`faces`/`positionIndices` to each conflict (the exact GMA-
   standard slot(s), utils/capacity.js), and `positionRectForIndex` — a
   sub-rect of the same `bayRectForIndex` the bay-highlight overlays use —
   turns each one into the precise rect to draw on.

   Drawn inside a `spin(obj)` Group per rack, exactly like every other
   per-object overlay here (SelectionOutline, ResizeHandlesOverlay): the
   rect below is in the rack's own LOCAL (pre-rotation) coordinates, and
   Konva's rotation on the Group places it correctly for a 90° rack with
   no manual rotation math here to get wrong a second time.

   A read-only layer, decoration only: listening={false} throughout so it
   never eats a click meant for the rack underneath. */

/* Conflict red — the same value the old SVG engine's ColumnCheckOverlay
   reserves for this exact purpose (rack-object drawing colour, hardcoded
   per CLAUDE.md, never a theme token). */
const RED = '#C0392B'

/* BUG 66 — same 6 screen-px floor ColumnGridShape uses (matching
 * ResizeHandlesOverlay's own `hs = 6/zoom`) — a blocked position's own
 * slot can be narrower than that at building-overview zoom, same problem
 * as a column marker. */
const MIN_MARK_PX = 6

/* One memoised item per mark, fed only its own rack (looked up once through
   an id map, not a search per mark): a drag, a selection change or an edit
   redraws only the marks on racks that actually changed. */
export function BlockedFaceMarks({ rackConflicts = [], objects = [], gridSize = 40, zoom = 1 }) {
  const byId = useMemo(() => firstById(objects), [objects])
  if (!rackConflicts.length) return null
  return (
    <>
      {rackConflicts.map((c, i) => <BlockedFaceItem key={i} c={c} i={i} obj={byId.get(c.rackId)} gridSize={gridSize} zoom={zoom} />)}
    </>
  )
}

/** id -> object, the FIRST with that id (what objects.find returned). */
export function firstById(objects) {
  const m = new Map()
  for (const o of objects) if (o && !m.has(o.id)) m.set(o.id, o)
  return m
}

const BlockedFaceItem = memo(function BlockedFaceItem({ c, i, obj, gridSize, zoom }) {
  if (c.bayIndex == null) return null
  if (!obj) return null
  const sw = 2 / zoom
  const faces = c.faces || [0]
  const positions = c.positionIndices || []
  return (
    <Group name={'blocked-face:' + c.rackId + ':' + i} listening={false} {...spin(obj, gridSize)}>
      {faces.flatMap(f => positions.map(p => {
        const raw = positionRectForIndex(obj, gridSize, c.bayIndex, p, f)
        if (!raw || !(raw.width > 0)) return null
        const r = growToMinScreenSize(raw, zoom, MIN_MARK_PX)
        return (
          <Group key={f + ':' + p} listening={false}>
            <Line points={[r.x, r.y, r.x + r.width, r.y + r.height]} stroke={RED} strokeWidth={sw} listening={false} />
            <Line points={[r.x + r.width, r.y, r.x, r.y + r.height]} stroke={RED} strokeWidth={sw} listening={false} />
          </Group>
        )
      }))}
    </Group>
  )
})
