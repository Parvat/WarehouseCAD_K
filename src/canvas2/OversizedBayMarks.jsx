import { Group, Line } from 'react-konva'
import { bayRectForIndex, growToMinScreenSize, spin } from './shapes'
import { oversizedBayIndices } from '../utils/capacity'

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

   Drawn inside a `spin(obj)` Group per rack, exactly like BlockedFaceMarks —
   the rect is in the rack's own LOCAL (pre-rotation) coordinates, Konva's
   rotation places it correctly with no manual rotation math here.

   A read-only layer, decoration only: listening={false} throughout. */

const RED = '#C0392B'
const BEAM_RACK_TYPES = new Set(['rack_row', 'rack_double_row'])

/* Same 6 screen-px floor as ColumnGridShape/BlockedFaceMarks — a bay's own
 * rect is normally plenty big to read on its own, but stays consistent with
 * the same "never invisible at any zoom" floor everywhere else. */
const MIN_MARK_PX = 6

export function OversizedBayMarks({ objects = [], gridSize = 40, zoom = 1 }) {
  const racks = objects.filter(o => BEAM_RACK_TYPES.has(o.type) && Array.isArray(o.beams) && o.beams.length)
  if (!racks.length) return null

  return (
    <>
      {racks.map(obj => {
        const palletFaceIn = obj.palletWIn || 40
        const bad = oversizedBayIndices(obj.beams, palletFaceIn)
        if (!bad.length) return null
        return (
          <Group key={obj.id} name={'oversized-bay:' + obj.id} listening={false} {...spin(obj, gridSize)}>
            {bad.flatMap(bayIndex => bayRectForIndex(obj, gridSize, bayIndex).map((raw, f) => {
              const r = growToMinScreenSize(raw, zoom, MIN_MARK_PX)
              return (
                <Group key={bayIndex + ':' + f} listening={false}>
                  <Line points={[r.x, r.y, r.x + r.width, r.y + r.height]} stroke={RED} strokeWidth={2 / zoom} listening={false} />
                  <Line points={[r.x + r.width, r.y, r.x, r.y + r.height]} stroke={RED} strokeWidth={2 / zoom} listening={false} />
                </Group>
              )
            }))}
          </Group>
        )
      })}
    </>
  )
}
