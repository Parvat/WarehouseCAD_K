import { Group, Rect, Text } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { useFillTool, boxOfDrag } from '../utils/fillTool'
import { rackFootprint } from '../generate/columnCheck'
import { fmtLen } from '../utils/copyChange'
import { MHE_PROFILES } from '../generate/columnCheck'

/* "Fill racking" on the canvas (utils/fillTool.js, generate/fillRacking.js):
   the box being dragged, the racks it would place (faint), and a label with
   the box's size and a live estimate — "60' × 40' · ≈ 14 rows · 1,200
   positions". Pure paint: listening={false}. */
export function FillOverlay() {
  const drag = useFillTool(s => s.drag)
  const plan = useFillTool(s => s.plan)
  const zoom = useCanvasStore(s => s.zoom)
  const gridSize = useCanvasStore(s => s.gridSize) || 40
  if (!drag) return null
  const b = boxOfDrag(drag)
  /* C10 (design/studio/Studio.dc.html): the Fill box (STUDIO.md §7: mint at 6%, a #2E7D5B 1.5 edge dashed 6 4), the racks
     it would place white with a faint green edge, its size in a dark tag on its bottom-right corner — the rows and
     positions are the mode bar's (FillOptionsBar) */
  const fs = 8.5 / zoom, padX = 4 / zoom, padY = 3.5 / zoom
  const text = `${fmtLen(b.w, gridSize).replace(/'/g, '′').replace(/"/g, '″')} × ${fmtLen(b.h, gridSize).replace(/'/g, '′').replace(/"/g, '″')}`
  const w = text.length * fs * 0.6 + padX * 2, h = fs + padY * 2
  return (
    <Group name="fill-overlay" listening={false}>
      <Rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#7BD3A4" opacity={0.06} listening={false} />
      {(plan?.racks || []).map((r, i) => { const f = rackFootprint(r); return (
        <Rect key={'r' + i} x={f.x} y={f.y} width={f.w} height={f.h} fill="#FFFFFF" stroke="rgba(46,125,91,0.55)" strokeWidth={1}
          strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      ) })}
      <Rect name="fill-box" x={b.x} y={b.y} width={b.w} height={b.h} stroke="#2E7D5B" strokeWidth={1.5} dash={[6, 4]}
        strokeScaleEnabled={false} listening={false} />
      <Group name="fill-label" x={b.x + b.w - w} y={b.y + b.h - h / 2} listening={false}>
        <Rect width={w} height={h} fill="#1F2321" cornerRadius={3 / zoom} listening={false} />
        <Text text={text} width={w} height={h} align="center" verticalAlign="middle" fontSize={fs}
          fontFamily="JetBrains Mono, monospace" fill="#F2F4F1" listening={false} />
      </Group>
    </Group>
  )
}
