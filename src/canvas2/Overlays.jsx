import { Rect, Line, Group } from 'react-konva'
import { SelectionOutline } from './shapes'
import { RackLabels, FpDimLabels, AisleLabelItem, ColumnClearanceLabels, rackLabelsEligible } from './DimensionLabels'
import { useMemo, memo } from 'react'
import { BlockedFaceMarks, firstById } from './BlockedFaceMarks'
import { useDragPreview, previewObjects } from './dragPreview'
import { UprightConflictMarks } from './UprightConflictMarks'
import { OversizedBayMarks } from './OversizedBayMarks'
import { aisleLabelLayout } from './hitTest'

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const near = (a, b) => Math.abs(a - b) < 1e-6
/** Is every aisle label, drawn from the shifted layout, exactly the unshifted
 *  one moved by (dx, dy) — same text, same stations? */
function aisleLabelsMoveRigidly(objects, shifted, dx, dy, gridSize) {
  const base = firstById(objects), moved = firstById(shifted)
  for (const a of objects) {
    if (!a || a.type !== 'aisle') continue
    const L0 = aisleLabelLayout(a, [base.get(a.row1Id), base.get(a.row2Id)].filter(Boolean), gridSize)
    const L1 = aisleLabelLayout(moved.get(a.id) || a, [moved.get(a.row1Id), moved.get(a.row2Id)].filter(Boolean), gridSize)
    if (!L0 || !L1) { if (L0 !== L1) return false; continue }
    if (L0.text !== L1.text || L0.isHoriz !== L1.isHoriz || L0.positions.length !== L1.positions.length) return false
    const along = L0.isHoriz ? dx : dy, across = L0.isHoriz ? dy : dx
    if (!near(L1.gapLo, L0.gapLo + across) || !near(L1.gapHi, L0.gapHi + across) || !near(L1.labelMid, L0.labelMid + across)) return false
    if (!L0.positions.every((q, i) => near(L1.positions[i], q + along))) return false
  }
  return true
}
/* What the derived overlays (aisle labels, column-check marks) are drawn from. */
const feedsOverlays = (o) => o && ((typeof o.type === 'string' && o.type.startsWith('rack_')) || o.type === 'aisle' || o.type === 'column_grid' || FP_TYPES.has(o.type))

/* ── Overlays: decoration only, never listens ────────────────────────────────
   The selection outline(s), dimension labels, marquee rect and aisle labels.
   Rendered in their own Layer, above the scene, with listening={false} on
   that Layer — an overlay must never intercept a press meant for an object
   underneath it (that was the ghost/decoy bug class, CANVAS2.md rule 5).
   This is the canvas2 analogue of the SVG engine's CanvasOverlays.jsx.

   Dimension labels (rack/floor-plan) are gated the same way the SVG engine
   gates them — selected only, one per selected object, here filtered out of
   the same `selectedObjects` list SelectionOutline already draws from, so
   there is no second "what's selected" query to drift out of sync. Aisle
   labels are the one exception: always on (subject to `showAisles`),
   independent of selection, so they need the full `objects` list too. */
function OverlaysView({
  selectedObjects, gridSize, marquee, objects = [], zoom = 1, showAisles = true, activeWall = null, smartGuides = [],
  showMarks = true, aisleBlocks = [], columns = [], rackConflicts = [], pickBlocks = [], uprightHits = [],
}) {
  /* Overlays DERIVED from object positions (aisle labels, the column-check
     marks) are drawn from `pObjects`: the store's objects with the current
     drag's offset applied (dragPreview.js). A plain drag moves Konva nodes and
     writes the store only on mouseup, so without this they sat at the
     pre-drag layout until the drop — ghosts during a floor-plan or multi-
     select drag. Selection outlines and rack/fp dimension labels are NOT fed
     pObjects: the drag already moves their nodes directly
     (collectDragNodes), and offsetting them here too would move them twice.
     The clearance labels apply the preview themselves (they re-run the aisle
     check on the previewed layout). */
  const ids = useDragPreview(s => s.ids), dx = useDragPreview(s => s.dx), dy = useDragPreview(s => s.dy)
  /* A drag that carries EVERYTHING these overlays come from — a building
     dragged with all its racks, aisles and columns — moves them rigidly: they
     are drawn once from the store's objects inside a group offset by the
     drag, so a frame moves one group instead of re-deriving every label and
     mark. Any other drag derives them from the previewed objects, and each
     label / mark is its own memoised item, so only those touching a moved
     object redraw. */
  const rigid = useMemo(() => !!ids && objects.every(o => !feedsOverlays(o) || ids.has(o.id)), [objects, ids])
  const shifted = useMemo(() => previewObjects(objects, { ids, dx, dy }), [objects, ids, dx, dy])
  const pObjects = rigid ? objects : shifted
  const byId = useMemo(() => firstById(pObjects), [pObjects])
  /* The marks sit on their rack (spin(obj)), so moving the rack and moving the
     group are the same drawing. Aisle labels round a measured gap to a label
     and pick label stations by length, so a shifted layout can, at a float
     boundary, read differently: they ride the group only while every label
     is exactly the unshifted one moved by the drag, and otherwise are drawn
     from the shifted layout — exactly what was drawn before. */
  const aisleRigid = useMemo(() => rigid && showAisles && aisleLabelsMoveRigidly(objects, shifted, dx, dy, gridSize), [rigid, showAisles, objects, shifted, dx, dy, gridSize])
  const aisleSrc = aisleRigid || !rigid ? pObjects : shifted
  const aisleById = aisleSrc === pObjects ? byId : firstById(aisleSrc)
  const aisles = showAisles ? aisleSrc.filter(o => o.type === 'aisle') : []
  return (
    <>
      {selectedObjects.map(o => <SelectionOutline key={o.id} obj={o} gridSize={gridSize} objects={objects} />)}
      {selectedObjects.map(o => rackLabelsEligible(o.type)
        ? <RackLabels key={'rl:' + o.id} obj={o} zoom={zoom} gridSize={gridSize} /> : null)}
      {selectedObjects.map(o => (FP_TYPES.has(o.type) && o.fpVerts)
        ? <FpDimLabels key={'fp:' + o.id} obj={o} zoom={zoom} gridSize={gridSize}
            activeWallIdx={activeWall && activeWall.objId === o.id ? activeWall.wallIdx : null} /> : null)}
      <Group x={aisleRigid ? dx : 0} y={aisleRigid ? dy : 0} listening={false}>
      {aisles.map(a => <AisleLabelItem key={'ai:' + a.id} aisle={a} row1={aisleById.get(a.row1Id)} row2={aisleById.get(a.row2Id)} zoom={zoom} gridSize={gridSize} />)}
      </Group>
      {showMarks && <ColumnClearanceLabels aisleBlocks={aisleBlocks} columns={columns} objects={objects} zoom={zoom} gridSize={gridSize} rigidDrag={rigid} />}
      <Group x={rigid ? dx : 0} y={rigid ? dy : 0} listening={false}>
      {showMarks && <BlockedFaceMarks rackConflicts={pickBlocks.length ? [...rackConflicts, ...pickBlocks] : rackConflicts} objects={pObjects} gridSize={gridSize} zoom={zoom} />}
      {showMarks && <UprightConflictMarks uprightHits={uprightHits} objects={pObjects} gridSize={gridSize} zoom={zoom} />}
      {showMarks && <OversizedBayMarks objects={pObjects} gridSize={gridSize} zoom={zoom} />}
      </Group>
      {/* Smart-guide alignment lines, live during a plain object drag —
          CanvasArea's own colours (wall/column snaps purple, object-to-
          object snaps green) and dash, ported. Stroke width is a plain
          literal with strokeScaleEnabled, matching every other piece of
          canvas2 chrome (BUG 20's lesson) rather than SVG's raw /zoom. */}
      {smartGuides.map((g, i) => {
        const color = g.isWall ? '#a78bfa' : '#22c55e'
        const sw = g.isWall ? 1.5 : 1
        const points = g.axis === 'x' ? [g.val, g.from, g.val, g.to] : [g.from, g.val, g.to, g.val]
        return (
          <Line key={i} points={points}
            stroke={color} strokeWidth={sw} dash={[6, 3]} opacity={0.9}
            strokeScaleEnabled={false} perfectDrawEnabled={false}
            shadowForStrokeEnabled={false} listening={false} />
        )
      })}
      {marquee && (
        <Rect
          x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
          fill="rgba(74,158,255,0.10)" stroke="#4a9eff" strokeWidth={1}
          dash={[4, 3]} strokeScaleEnabled={false} listening={false}
        />
      )}
    </>
  )
}

export const Overlays = memo(OverlaysView)
