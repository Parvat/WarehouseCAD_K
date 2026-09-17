import { useMemo } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { rackDrawOps, PORTED_RACK_TYPES } from '../render/rackOps'
import { RackShape, FloorPlanShape, ColumnGridShape, AisleShape, FallbackShape } from './shapes'

/* ── STEP 2 · the scene ──────────────────────────────────────────────────────
   Everything in the store, drawn. One painter per object, chosen once, and no
   object is ever drawn twice — the whole class of ghost/decoy bugs from the old
   canvas came from two things painting the same object.

   Routing is by CLAIM, in order: a floor plan, then a column grid, then any
   rack type rackOps can draw, then the fallback for the rest. The fallback is
   deliberately a catch-all rather than a list, so a type added to the library
   tomorrow still appears instead of silently vanishing.

   FULL DETAIL AT EVERY ZOOM — no level-of-detail collapse. Consolidating each
   rack to a handful of nodes (one box, one path for all its bays) made full
   detail cheap enough that the drawing does not change as you zoom, which is
   what a drawing has to do.

   Draw order is the store's own array order, so z-order matches what the rest
   of the app believes. The building is drawn first regardless, because it is
   the ground everything else stands on. */

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

export function Scene({ listening = false, bind }) {
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize)
  const visibleLayerIds = useCanvasStore(s => s.layers)
  const activeBaySelection = useCanvasStore(s => s.activeBaySelection)

  /* A hidden layer hides its objects. Same rule the SVG applies — a layer counts
     as visible only when `visible` is truthy — so the two canvases cannot
     disagree about what is on the sheet. Guarded for the layerless case so an
     object never vanishes just because the layer system is absent. */
  const visibleIds = useMemo(
    () => new Set((visibleLayerIds || []).filter(l => l && l.visible).map(l => l.id)),
    [visibleLayerIds])
  const isVisible = (o) => visibleIds.size === 0 || !o.layerId || visibleIds.has(o.layerId)

  /* Rack ops are derived once per object and carry no zoom, so panning and
     zooming rebuild nothing here. */
  const scene = useMemo(() => {
    const floors = [], rest = []
    for (const o of objects) {
      if (!o || !isVisible(o)) continue
      if (FP_TYPES.has(o.type) && o.fpVerts) { floors.push(o); continue }
      if (o.type === 'column_grid') { rest.push({ kind: 'columns', obj: o }); continue }
      if (o.type === 'aisle') { rest.push({ kind: 'aisle', obj: o }); continue }
      if (PORTED_RACK_TYPES.has(o.type)) {
        const ops = rackDrawOps(o, { gridSize })
        // a degenerate rack has no ops; fall through so it is still visible
        if (ops) { rest.push({ kind: 'rack', obj: o, ops }); continue }
      }
      rest.push({ kind: 'fallback', obj: o })
    }
    return { floors, rest }
  }, [objects, gridSize, visibleIds])

  return (
    <>
      {scene.floors.map(o => (
        <FloorPlanShape key={o.id} obj={o} gridSize={gridSize} listening={listening} bind={bind} />
      ))}
      {scene.rest.map(e => {
        if (e.kind === 'rack') {
          return <RackShape key={e.obj.id} obj={e.obj} ops={e.ops} gridSize={gridSize} listening={listening} bind={bind}
            activeBaySelection={activeBaySelection} />
        }
        if (e.kind === 'columns') {
          return <ColumnGridShape key={e.obj.id} obj={e.obj} gridSize={gridSize} listening={listening} bind={bind} />
        }
        if (e.kind === 'aisle') {
          return <AisleShape key={e.obj.id} obj={e.obj} objects={objects} listening={listening} bind={bind} />
        }
        return <FallbackShape key={e.obj.id} obj={e.obj} listening={listening} bind={bind} />
      })}
    </>
  )
}
