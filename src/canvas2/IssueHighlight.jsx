import { useEffect, useRef } from 'react'
import { Group, Rect, Text, Line } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { useLayoutCheck } from '../utils/layoutCheck'

/* Check layout's highlight: the PROBLEM of the clicked item (utils/
   layoutCheck.js) — an aisle gap shaded with "7' · needs 8'", an overlap
   area, the upright frames a column stands on, a too-short bay, a rack's
   outline — and, for blocked pallets, the X marks themselves: a glowing X on
   exactly each blocked position. It pulses for a moment, then stays until the next click
   on the canvas or the next check. Pure paint: listening={false}, so the
   click that follows goes to whatever is under it. */

const PULSE_MS = 1400

export function IssueHighlight() {
  const hl = useLayoutCheck(s => s.highlight)
  const zoom = useCanvasStore(s => s.zoom)
  const ref = useRef(null)

  useEffect(() => {
    const g = ref.current
    if (!g || !hl) return
    let raf = 0
    const t0 = performance.now()
    const step = (t) => {
      const e = t - t0
      if (e >= PULSE_MS) { g.opacity(1); g.getLayer()?.batchDraw(); return }
      g.opacity(0.35 + 0.65 * Math.abs(Math.cos((e / PULSE_MS) * Math.PI * 3)))   // three beats
      g.getLayer()?.batchDraw()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hl])

  if (!hl || !hl.shapes.length) return null
  const fs = 12 / zoom, pad = 4 / zoom
  return (
    <Group ref={ref} name="issue-highlight" listening={false}>
      {hl.shapes.filter(s => s.mode === 'xmark').map((s, i) => (
        <Group key={'x' + i} name="issue-hl:xmark" x={s.x} y={s.y} listening={false}>
          <Rect width={s.w} height={s.h} fill={s.color + '33'} stroke={s.color} strokeWidth={1.5} strokeScaleEnabled={false}
            shadowColor={s.color} shadowBlur={14} shadowOpacity={0.9} listening={false} />
          <Line points={[0, 0, s.w, s.h]} stroke={s.color} strokeWidth={3} strokeScaleEnabled={false} shadowColor={s.color} shadowBlur={10} listening={false} />
          <Line points={[s.w, 0, 0, s.h]} stroke={s.color} strokeWidth={3} strokeScaleEnabled={false} shadowColor={s.color} shadowBlur={10} listening={false} />
        </Group>
      ))}
      {hl.shapes.filter(s => s.mode !== 'xmark').map((s, i) => (
        <Rect key={'s' + i} name={'issue-hl:' + s.mode} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={s.mode === 'fill' ? s.color + '4D' : undefined} stroke={s.color} strokeWidth={s.mode === 'outline' ? 3 : 1.5}
          dash={s.mode === 'outline' ? [8, 5] : undefined} strokeScaleEnabled={false} perfectDrawEnabled={false} listening={false} />
      ))}
      {hl.shapes.filter(s => s.label).map((s, i) => {
        const w = s.label.length * fs * 0.62 + pad * 2, h = fs + pad * 2
        return (
          <Group key={'l' + i} name="issue-hl-label" x={s.x + s.w / 2 - w / 2} y={s.y + s.h / 2 - h / 2} listening={false}>
            <Rect width={w} height={h} fill={s.color} cornerRadius={3 / zoom} listening={false} />
            <Text text={s.label} width={w} height={h} align="center" verticalAlign="middle" fontSize={fs}
              fontFamily="JetBrains Mono, monospace" fontStyle="bold" fill="#ffffff" listening={false} />
          </Group>
        )
      })}
    </Group>
  )
}
