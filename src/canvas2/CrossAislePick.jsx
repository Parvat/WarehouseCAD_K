// CrossAislePick.jsx — the picked cross-aisle on the plan (utils/crossAisleTool.js, STUDIO.md §7a Cross-aisles): each
// line's gap outlined in the selection green; while it is dragged, where it goes (whole bays) and a live label with the
// runs either side and its width — "7 bays · 9 ft · 7 bays". Pure paint.
import { Group, Rect, Text } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { useCrossAislePick, pickedCrossAisle, bayPitch } from '../utils/crossAisleTool'
import { useView, useLiveObjects } from './live'
import { ftIn, sizeWords } from '../utils/bom'

const SELECT = '#2E7D5B'

export function CrossAislePick() {
  const pick = useCrossAislePick(s => s.pick), drag = useCrossAislePick(s => s.drag)
  const objects = useLiveObjects(), gs = useCanvasStore(s => s.gridSize) || 40
  const zoom = useView().zoom
  if (!pick) return null
  const c = pickedCrossAisle(objects, pick)
  if (!c) return null
  const shift = drag ? drag.d * bayPitch(c, gs) : 0
  const rectOf = (l) => (c.rot ? { x: l.cross[0], y: l.lo + shift, w: l.cross[1] - l.cross[0], h: l.hi - l.lo } : { x: l.lo + shift, y: l.cross[0], w: l.hi - l.lo, h: l.cross[1] - l.cross[0] })
  const fs = 12 / zoom, pad = 4 / zoom
  const label = drag && drag.labels ? `${drag.labels.a} bays · ${sizeWords(ftIn(drag.labels.w * 12))} · ${drag.labels.b} bays` : null
  const mid = rectOf(c.lines[Math.floor(c.lines.length / 2)])
  const lw = label ? label.length * fs * 0.6 + pad * 2 : 0, lh = fs + pad * 2
  return (
    <Group name="cross-aisle-pick" listening={false}>
      {c.lines.map((l, i) => { const r = rectOf(l); return (
        <Rect key={i} name="cross-aisle-sel" x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(46,125,91,0.12)" stroke={SELECT} strokeWidth={1.5}
          strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      ) })}
      {label && (
        <Group name="cross-aisle-runs" x={mid.x + mid.w / 2 - lw / 2} y={mid.y + mid.h / 2 - lh / 2} listening={false}>
          <Rect width={lw} height={lh} fill="#1F2321" cornerRadius={3 / zoom} listening={false} />
          <Text name="cross-aisle-runs-text" text={label} width={lw} height={lh} align="center" verticalAlign="middle" fontSize={fs}
            fontFamily="JetBrains Mono, monospace" fill="#F2F4F1" listening={false} />
        </Group>
      )}
    </Group>
  )
}
