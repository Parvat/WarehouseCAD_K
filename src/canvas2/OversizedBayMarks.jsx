import { memo, useMemo } from 'react'
import { LabelOps } from './LabelOps'
import { oversizedOps } from '../render/labelOps'

const BEAM_RACK_TYPES = new Set(['rack_row', 'rack_double_row'])
/* ── Oversized-bay marks — BUG 67 ─────────────────────────────────────────────
   Distinct from BlockedFaceMarks (a column blocking a real pick spot): this is
   a bay that holds ZERO pallet positions regardless of any column, because the
   pallet's own loading face plus its GMA clearance is wider than the beam
   (positionsPerBeam === 0 — see utils/capacity.js). No column needed to
   trigger it, and no single position to point at either — the WHOLE bay is
   the mark, both faces of a double row (the same beam, same face width,
   either both fit or neither does).

   `getRackCapacity` already correctly contributes 0 for such a bay (the SAME
   positionsPerBeam call) — this component only supplies the missing VISUAL:
   a bay that "looks fine but holds nothing" should never look fine.

   The geometry and drawing are render/labelOps.js (blockedFaceOps and
   friends): the rects are built in the rack's own LOCAL (pre-rotation)
   frame and turned about its centre (spin()'s pivot) into world ops, the
   same ops the PDF export prints. Drawing size — a fixed size in feet from
   the Label size setting, scaling with the racks when you zoom.

   A read-only layer, decoration only: listening={false} throughout. */

/* One memoised item per rack: only a rack that changed redraws its marks. */
/* Drawing size: `lz` is the Label size scale (render/labelSize.js), not the
   view zoom — the marks are a fixed size in feet and scale with the racks. */
export function OversizedBayMarks({ objects = [], gridSize = 40, lz = 1 }) {
  const racks = objects.filter(o => BEAM_RACK_TYPES.has(o.type) && Array.isArray(o.beams) && o.beams.length)
  if (!racks.length) return null
  return (
    <>
      {racks.map(obj => <OversizedItem key={obj.id} obj={obj} gridSize={gridSize} lz={lz} />)}
    </>
  )
}

const OversizedItem = memo(function OversizedItem({ obj, gridSize, lz }) {
  const ops = useMemo(() => oversizedOps(obj, gridSize, lz), [obj, gridSize, lz])
  return <LabelOps ops={ops} name={'oversized-bay:' + obj.id} />
})
