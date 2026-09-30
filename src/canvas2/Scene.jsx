import { useMemo, memo } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { shownIn } from '../utils/layers'
import { useLabelPrefs } from './labelPrefs'
import { labelScale } from '../render/labelSize'
import { rackDrawOps, PORTED_RACK_TYPES } from '../render/rackOps'
import { RackShape, FloorPlanShape, ColumnGridShape, AisleShape, FallbackShape, RackingAreaShape, ZoneShape } from './shapes'

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
   the ground everything else stands on, and the column grids LAST: a column is
   structure, and one inside a rack's footprint is exactly the conflict the
   column check reports — a rack painted over it would hide it. (Picking is
   unaffected: hitTest tries racks before column squares either way.) */

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

/* rackDrawOps is a pure function of the rack object and the grid size. */
const opsCache = new WeakMap()
function opsFor(o, gridSize) {
  const hit = opsCache.get(o)
  if (hit && hit.gridSize === gridSize) return hit.ops
  const ops = rackDrawOps(o, { gridSize })
  opsCache.set(o, { gridSize, ops })
  return ops
}

function SceneView({ listening = false, bind }) {
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize)
  // the racks' travel arrows are drawing size, sized by the Label size (not the zoom)
  const lz = labelScale(useLabelPrefs(s => s.labelSize), gridSize)
  const layers = useCanvasStore(s => s.layers)
  const activeBaySelection = useCanvasStore(s => s.activeBaySelection)
  /* Nothing here reads the zoom: every object — columns included — is drawn
     at its real size and the stage transform scales it, so zooming re-renders
     none of the scene. */

  /* A hidden layer hides its objects (utils/layers.js — the same rule the PDF
     and the picking use, so they cannot disagree about what is on the sheet).
     A locked layer still draws. */
  const isVisible = useMemo(() => shownIn(layers), [layers])

  /* Rack ops are derived once per object and carry no zoom, so panning and
     zooming rebuild nothing here. They are also kept per rack OBJECT: an edit
     makes a new objects array but leaves every untouched rack the same object,
     so it keeps the same ops and its (memoised) RackShape does not redraw. */
  const byId = useMemo(() => {
    const m = new Map()
    for (const o of objects) if (o && !m.has(o.id)) m.set(o.id, o)
    return m
  }, [objects])
  const scene = useMemo(() => {
    const floors = [], rest = [], columns = []
    for (const o of objects) {
      if (!o || !isVisible(o)) continue
      if (FP_TYPES.has(o.type) && o.fpVerts) { floors.push(o); continue }
      if (o.type === 'column_grid') { columns.push({ kind: 'columns', obj: o }); continue }
      if (o.type === 'aisle') { rest.push({ kind: 'aisle', obj: o }); continue }
      if (o.type === 'racking_area') { rest.push({ kind: 'area', obj: o }); continue }
      if (typeof o.type === 'string' && o.type.startsWith('zone_')) { rest.push({ kind: 'zone', obj: o }); continue }
      if (PORTED_RACK_TYPES.has(o.type)) {
        const ops = opsFor(o, gridSize)
        // a degenerate rack has no ops; fall through so it is still visible
        if (ops) { rest.push({ kind: 'rack', obj: o, ops }); continue }
      }
      rest.push({ kind: 'fallback', obj: o })
    }
    return { floors, rest: rest.concat(columns) }
  }, [objects, gridSize, isVisible])

  return (
    <>
      {scene.floors.map(o => (
        <FloorPlanShape key={o.id} obj={o} gridSize={gridSize} listening={listening} bind={bind} />
      ))}
      {scene.rest.map(e => {
        if (e.kind === 'rack') {
          return <RackShape key={e.obj.id} obj={e.obj} ops={e.ops} gridSize={gridSize} lz={lz} listening={listening} bind={bind}
            activeBaySelection={activeBaySelection} />
        }
        if (e.kind === 'columns') {
          return <ColumnGridShape key={e.obj.id} obj={e.obj} gridSize={gridSize} listening={listening} bind={bind} />
        }
        if (e.kind === 'aisle') {
          return <AisleShape key={e.obj.id} obj={e.obj} row1={byId.get(e.obj.row1Id)} row2={byId.get(e.obj.row2Id)} listening={listening} bind={bind} />
        }
        if (e.kind === 'area') return <RackingAreaShape key={e.obj.id} obj={e.obj} gridSize={gridSize} listening={listening} bind={bind} />
        if (e.kind === 'zone') return <ZoneShape key={e.obj.id} obj={e.obj} gridSize={gridSize} listening={listening} bind={bind} />
        return <FallbackShape key={e.obj.id} obj={e.obj} listening={listening} bind={bind} />
      })}
    </>
  )
}

export const Scene = memo(SceneView)
