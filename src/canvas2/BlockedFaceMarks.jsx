import { memo, useMemo } from 'react'
import { LabelOps } from './LabelOps'
import { blockedFaceOps } from '../render/labelOps'
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

   The geometry and drawing are render/labelOps.js (blockedFaceOps and
   friends): the rects are built in the rack's own LOCAL (pre-rotation)
   frame and turned about its centre (spin()'s pivot) into world ops, the
   same ops the PDF export prints. Drawing size — a fixed size in feet from
   the Label size setting, scaling with the racks when you zoom.

   A read-only layer, decoration only: listening={false} throughout so it
   never eats a click meant for the rack underneath. */

/* One memoised item per mark, fed only its own rack (looked up once through
   an id map, not a search per mark): a drag, a selection change or an edit
   redraws only the marks on racks that actually changed. */
/* Drawing size: `lz` is the Label size scale (render/labelSize.js), not the
   view zoom — the marks are a fixed size in feet and scale with the racks. */
export function BlockedFaceMarks({ rackConflicts = [], objects = [], gridSize = 40, lz = 1 }) {
  const byId = useMemo(() => firstById(objects), [objects])
  if (!rackConflicts.length) return null
  return (
    <>
      {rackConflicts.map((c, i) => <BlockedFaceItem key={i} c={c} i={i} obj={byId.get(c.rackId)} gridSize={gridSize} lz={lz} />)}
    </>
  )
}

/** id -> object, the FIRST with that id (what objects.find returned). */
export function firstById(objects) {
  const m = new Map()
  for (const o of objects) if (o && !m.has(o.id)) m.set(o.id, o)
  return m
}

const BlockedFaceItem = memo(function BlockedFaceItem({ c, i, obj, gridSize, lz }) {
  const ops = useMemo(() => blockedFaceOps(c, obj, gridSize, lz), [c, obj, gridSize, lz])
  return <LabelOps ops={ops} name={'blocked-face:' + c.rackId + ':' + i} />
})
