import { memo, useMemo } from 'react'
import { Group, Rect } from 'react-konva'
import { firstById } from './BlockedFaceMarks'
import { uprightFramesLocal } from '../generate/columnCheck'
import { growToMinScreenSize, spin } from './shapes'

/* ── Column on an upright frame ──────────────────────────────────────────────
   A column overlapping an upright can't be built, so checkColumns flags it
   (`uprightHits`) and nothing moves: the dealer fixes it. The mark goes on the
   FRAME, not the pallet position, and is deliberately unlike the red pallet X:
   an orange outline with a light orange fill around the upright itself, on
   every face the column hits.

   Drawn inside a `spin(obj)` Group per rack, like BlockedFaceMarks: the frame
   rect is in the rack's local (pre-rotation) coordinates. A 3" frame is a few
   screen px at overview zoom, so it's grown to the same 6 px floor the column
   markers use, centred on the frame. Decoration only: listening={false}. */

/* Conflict orange — a drawing colour, hardcoded per CLAUDE.md like the red. */
const ORANGE = '#E67E22'
const MIN_MARK_PX = 6

/* One memoised item per mark, fed only its own rack (looked up once through
   an id map, not a search per mark): a drag, a selection change or an edit
   redraws only the marks on racks that actually changed. */
export function UprightConflictMarks({ uprightHits = [], objects = [], gridSize = 40, zoom = 1 }) {
  const byId = useMemo(() => firstById(objects), [objects])
  if (!uprightHits.length) return null
  return (
    <>
      {uprightHits.map((h, i) => <UprightItem key={i} h={h} obj={byId.get(h.rackId)} gridSize={gridSize} zoom={zoom} />)}
    </>
  )
}

const UprightItem = memo(function UprightItem({ h, obj, gridSize, zoom }) {
  if (!obj) return null
  const sw = 2 / zoom
  const frames = uprightFramesLocal(obj, gridSize).filter(f => f.upright === h.upright && h.faces.includes(f.face))
  return (
    <Group name={'upright-conflict:' + h.rackId + ':' + h.upright} listening={false} {...spin(obj, gridSize)}>
      {frames.map(f => {
        const r = growToMinScreenSize({ x: f.x, y: f.y, width: f.w, height: f.h }, zoom, MIN_MARK_PX)
        return (
          <Rect key={f.face} x={r.x} y={r.y} width={r.width} height={r.height}
            fill="rgba(230,126,34,0.25)" stroke={ORANGE} strokeWidth={sw}
            perfectDrawEnabled={false} shadowForStrokeEnabled={false} listening={false} />
        )
      })}
    </Group>
  )
})
