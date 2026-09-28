import { memo, useMemo } from 'react'
import { firstById } from './BlockedFaceMarks'
import { LabelOps } from './LabelOps'
import { uprightOps } from '../render/labelOps'
/* ── Column on an upright frame ──────────────────────────────────────────────
   A column overlapping an upright can't be built, so checkColumns flags it
   (`uprightHits`) and nothing moves: the dealer fixes it. The mark goes on the
   FRAME, not the pallet position, and is deliberately unlike the red pallet X:
   an orange outline with a light orange fill around the upright itself, on
   every face the column hits.

   The geometry and drawing are render/labelOps.js (blockedFaceOps and
   friends): the rects are built in the rack's own LOCAL (pre-rotation)
   frame and turned about its centre (spin()'s pivot) into world ops, the
   same ops the PDF export prints. Drawing size — a fixed size in feet from
   the Label size setting, scaling with the racks when you zoom. Decoration only: listening={false}. */

/* One memoised item per mark, fed only its own rack. */
/* Drawing size: `lz` is the Label size scale (render/labelSize.js), not the
   view zoom — the marks are a fixed size in feet and scale with the racks. */
export function UprightConflictMarks({ uprightHits = [], objects = [], gridSize = 40, lz = 1 }) {
  const byId = useMemo(() => firstById(objects), [objects])
  if (!uprightHits.length) return null
  return (
    <>
      {uprightHits.map((h, i) => <UprightItem key={i} h={h} obj={byId.get(h.rackId)} gridSize={gridSize} lz={lz} />)}
    </>
  )
}

const UprightItem = memo(function UprightItem({ h, obj, gridSize, lz }) {
  const ops = useMemo(() => uprightOps(h, obj, gridSize, lz), [h, obj, gridSize, lz])
  return <LabelOps ops={ops} name={'upright-conflict:' + h.rackId + ':' + h.upright} />
})
