import { useMemo, useRef } from 'react'
import { useDragPreview } from '../../canvas2/dragPreview'
import { bayLedger } from '../../utils/bayLedger'

/** The layout's bay ledger (utils/bayLedger.js) for a panel: worked out again only when the racks change
 *  (the ledger caches on their geometry), and held at its last value while a drag is in flight — a live-flue
 *  drag writes the rack every frame, and the counts don't need to follow it frame by frame. */
export function useBayLedger(objects, gridSize = 40) {
  const dragging = useDragPreview(s => s.dragging)
  const held = useRef(null)
  return useMemo(() => {
    if (dragging && held.current) return held.current
    held.current = bayLedger(objects, gridSize)
    return held.current
  }, [objects, gridSize, dragging])
}
