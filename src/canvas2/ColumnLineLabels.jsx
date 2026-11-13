import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useColumnLine, linesOf, gapsOf } from './columnLines'
import { useColumnPick } from './columnPick'
import { useLiveObjects, useView } from './live'
import { layerShown } from '../utils/layers'

/* While a column's line is dragged (canvas2/columnLines.js): the distance to the line before and after it, live, each
   midway between the two lines at the dragged column — dimension numbers (STUDIO.md §2: #1B4FD8, Plus Jakarta Sans
   600, tabular figures). Screen px over the canvas, like the selection bar. Hidden while the grid's dimension chain shows
   (col-bubbles round — the grid selected, its Columns layer shown: ColumnGridAnnot.jsx; the chain carries the same
   distances, live, and the two overlapped). */
const fmt = (px, gs) => { const t = Math.round(px / gs * 12), f = Math.floor(t / 12), i = t - f * 12; return i ? `${f}′-${i}″` : `${f}′` }

export function ColumnLineLabels() {
  const live = useColumnLine(s => s.live)
  // the grid where it is drawn now, placed by the view the canvas is drawn with now (live.js)
  const objects = useLiveObjects(), { zoom, panX, panY } = useView()
  const g = live ? objects.find(o => o.id === live.gridId) : null
  const gs = useCanvasStore(s => s.gridSize || 40)
  const pick = useColumnPick(s => s.pick)
  const chainShown = useCanvasStore(s => !!g && g.showGrid !== false && s.selectedIds.includes(g.id) && layerShown(s.layers, 'columns'))
  if (!live || !g || chainShown) return null
  const X = live.axis === 'x', ls = X ? linesOf(g).xs : linesOf(g).ys, at = ls[live.i]
  // across the line: at the dragged column (the picked one), else the grid's first line
  const across = pick && pick.gridId === g.id ? (X ? pick.y + pick.h / 2 : pick.x + pick.w / 2) : (X ? g.y : g.x)
  const gaps = gapsOf(g, live.axis, live.i)
  const tags = [['prev', gaps.prev, at - (gaps.prev || 0) / 2], ['next', gaps.next, at + (gaps.next || 0) / 2]].filter(t => t[1] != null)
  return (
    <>
      {tags.map(([side, d, mid]) => {
        const sx = (X ? mid : across) * zoom + panX, sy = (X ? across : mid) * zoom + panY
        return (
          <span key={side} data-column-gap={side} style={{
            position: 'absolute', left: sx, top: sy, transform: 'translate(-50%, -150%)', zIndex: 130, pointerEvents: 'none',
            padding: '1px 5px', borderRadius: 4, background: '#FFFFFF', color: '#1B4FD8', fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(15,18,16,.18)',
          }}>{fmt(d, gs)}</span>
        )
      })}
    </>
  )
}
