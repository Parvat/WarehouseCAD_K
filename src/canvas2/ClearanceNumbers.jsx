import { useEffect, useRef, useState } from 'react'
import { Group } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { ColumnClearanceLabels } from './DimensionLabels'
import { clearanceTagsOn, clearancePx, zoomedIn, FADE_MS } from './clearanceView'

/* Its own component (not in Overlays.jsx): the one thing on the plan that reads the view zoom — the clearance numbers
   fade in when zoomed in (STUDIO.md §2: the only zoom-based change allowed) — so a zoom re-renders only this. */
/* The grey clearance numbers, faded in and out in place: on when zoomed in enough (with the buffer), a column grid
   selected, Show clearances on, or a drag / resize under way (clearanceView.js). Their own layer, so only they fade. */
/* `column`: one column picked out of its grid (columnPick.js) — then the grid is not "selected" as a whole: that
   column's numbers show, while its bar's Show clearances (`columnShow`) is on. */
export function ClearanceNumbers({ aisleBlocks, columns, objects, lz, gridSize, avoid, selectedObjects, dragging, show, column = null, columnShow = true }) {
  const zoom = useCanvasStore(s => s.zoom)
  const was = useRef(false)
  const zoomOn = zoomedIn(clearancePx(zoom, lz), was.current)
  was.current = zoomOn
  // (col-bubbles round: the View card's Column clearances alone — on, every column; off, none: no zoom, selection or drag rule)
  const all = clearanceTagsOn({ show })
  const only = null
  void dragging; void selectedObjects; void column; void columnShow; void zoomOn
  const opacity = useFade(all || !!only, FADE_MS)
  // what is drawn while it fades out stays what was shown (one column's, or all)
  const kept = useRef(null)
  if (all) kept.current = null
  else if (only) kept.current = only
  if (opacity <= 0) return null
  return (
    <Group name="clearance-numbers" opacity={opacity} listening={false}>
      <ColumnClearanceLabels aisleBlocks={aisleBlocks} columns={columns} objects={objects} lz={lz} gridSize={gridSize} avoid={avoid} showLabels="clear" warnings={false} only={all ? null : kept.current} />
    </Group>
  )
}
/** 0..1, eased toward `on` over `ms` (frames) — a fade in place. */
function useFade(on, ms) {
  const [v, setV] = useState(on ? 1 : 0)
  const cur = useRef(v)
  useEffect(() => {
    const target = on ? 1 : 0
    if (cur.current === target) return undefined
    const from = cur.current, t0 = performance.now()
    let raf = 0
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), x = from + (target - from) * k
      cur.current = x; setV(x)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [on, ms])
  return v
}
