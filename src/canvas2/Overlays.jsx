import { SELECT_BLUE, selectTint } from '../theme/tokens'
import { Rect, Line, Group } from 'react-konva'
import { SelectionOutline } from './shapes'
import { RackLabels, FpDimLabels, AisleLabelItem, CrossAisleLabels, FaceAisleLabels, ColumnClearanceLabels, rackLabelsEligible } from './DimensionLabels'
import { useMemo, useRef, memo } from 'react'
import { aisleLabelBoxes } from '../render/labelOps'
import { useColumnCheck } from '../generate/useColumnCheck'
import { BlockedFaceMarks, firstById } from './BlockedFaceMarks'
import { narrowAisleBlocks, blockedKeys } from '../generate/narrowAisles'
import { useDragPreview, previewObjects } from './dragPreview'
import { UprightConflictMarks } from './UprightConflictMarks'
import { OversizedBayMarks } from './OversizedBayMarks'
import { aisleLabelLayout, columnRectsOf } from './hitTest'
import { useLabelPrefs } from './labelPrefs'
import { useCanvasStore } from '../store/useCanvasStore'
import { layerShown } from '../utils/layers'
import { labelScale, aisleLabelScale } from '../render/labelSize'

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])
const near = (a, b) => Math.abs(a - b) < 1e-6
/** Is every aisle label, drawn from the shifted layout, exactly the unshifted
 *  one moved by (dx, dy) — same text, same stations? */
function aisleLabelsMoveRigidly(objects, shifted, dx, dy, gridSize) {
  const base = firstById(objects), moved = firstById(shifted)
  for (const a of objects) {
    if (!a || a.type !== 'aisle') continue
    const L0 = aisleLabelLayout(a, [base.get(a.row1Id), base.get(a.row2Id)].filter(Boolean), gridSize, { columns: columnRectsOf(objects, gridSize) })
    const L1 = aisleLabelLayout(moved.get(a.id) || a, [moved.get(a.row1Id), moved.get(a.row2Id)].filter(Boolean), gridSize, { columns: columnRectsOf(shifted, gridSize) })
    if (!L0 || !L1) { if (L0 !== L1) return false; continue }
    if (L0.text !== L1.text || L0.isHoriz !== L1.isHoriz || L0.positions.length !== L1.positions.length) return false
    const along = L0.isHoriz ? dx : dy, across = L0.isHoriz ? dy : dx
    if (!near(L1.gapLo, L0.gapLo + across) || !near(L1.gapHi, L0.gapHi + across) || !near(L1.labelMid, L0.labelMid + across)) return false
    if (!L0.positions.every((q, i) => near(L1.positions[i], q + along))) return false
  }
  return true
}
/* The same column squares as last time while none moved, so an aisle label (memoised on them) redraws only
   when a column it could slide off did. */
function useSteadyColumns(cols) {
  const ref = useRef(cols)
  const a = ref.current
  const same = a === cols || (a.length === cols.length && a.every((c, i) => c.x === cols[i].x && c.y === cols[i].y && c.w === cols[i].w && c.h === cols[i].h))
  if (!same) ref.current = cols
  return ref.current
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
   independent of selection, so they need the full `objects` list too.

   `part`: drawn in two layers (Canvas2.jsx) with the columns between them — 'marks' (aisle and cross-aisle
   labels, column clearances, X marks, upright flags, oversized bays) under the columns, 'chrome' (selection
   outlines, dimension labels, smart guides, the marquee) over them. Left out: both. */
function OverlaysView({
  selectedObjects, gridSize, marquee, objects = [], showAisles = true, activeWall = null, smartGuides = [],
  showMarks = true, aisleBlocks = [], columns = [], rackConflicts = [], pickBlocks = [], uprightHits = [], part = 'all',
}) {
  const marksPart = part !== 'chrome', chromePart = part !== 'marks'
  /* Every label and mark here is DRAWING size (render/labelSize.js): sized by
     the Label size setting, never by the view zoom, so zooming re-renders
     none of it — the stage transform scales it with the racks. */
  const labelSize = useLabelPrefs(s => s.labelSize)
  /* Layers (utils/layers.js): the Aisles layer carries the aisle and
     cross-aisle labels, the Checks layer every mark — X marks, red aisle
     warnings, upright flags, column clearance arrows and labels. Hiding
     Checks only stops the drawing: the check still runs, so capacity and
     usable are unchanged. */
  const layers = useCanvasStore(s => s.layers)
  const aislesOn = marksPart && showAisles && layerShown(layers, 'aisles')
  const marksOn = marksPart && showMarks && layerShown(layers, 'checks')
  const lz = labelScale(labelSize, gridSize)
  /* The aisle width labels are coloured by the aisle's grade (rowAisleLevel — the same function Check layout
     lists it by) against the column check's forklift, while the Checks layer and the markings are on; with
     them off the labels draw plain. Live: the labels already redraw from the drag preview. */
  const { profile: mhe } = useColumnCheck()
  const warnProfile = marksOn ? mhe : null
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
  const elevations = useCanvasStore(s => s.elevations)
  /* The X marks: a column's (in the rack, in a pick zone) and a face with less than the pick width in front of it
     (narrowAisles.js — a rack-to-rack aisle, or a zone / the wall) — the same mark, the same loss off usable. */
  const xMarks = useMemo(() => {
    const cols = pickBlocks.length ? [...rackConflicts, ...pickBlocks] : rackConflicts
    if (!marksOn) return cols
    const narrow = narrowAisleBlocks(pObjects, { profile: mhe, gridSize, already: blockedKeys({ rackConflicts, pickBlocks }), elevations })
    return narrow.length ? [...cols, ...narrow] : cols
  }, [rackConflicts, pickBlocks, pObjects, mhe, gridSize, marksOn, elevations])
  /* The marks sit on their rack (spin(obj)), so moving the rack and moving the
     group are the same drawing. Aisle labels round a measured gap to a label
     and pick label stations by length, so a shifted layout can, at a float
     boundary, read differently: they ride the group only while every label
     is exactly the unshifted one moved by the drag, and otherwise are drawn
     from the shifted layout — exactly what was drawn before. */
  const aisleRigid = useMemo(() => rigid && aislesOn && aisleLabelsMoveRigidly(objects, shifted, dx, dy, gridSize), [rigid, aislesOn, objects, shifted, dx, dy, gridSize])
  const aisleSrc = aisleRigid || !rigid ? pObjects : shifted
  const aisleById = aisleSrc === pObjects ? byId : firstById(aisleSrc)
  const aisles = aislesOn ? aisleSrc.filter(o => o.type === 'aisle') : []
  // the column squares the aisle labels slide off (hitTest.js aisleLabelStation) — from the same layout as the labels
  const aisleCols = useSteadyColumns(aislesOn ? columnRectsOf(aisleSrc, gridSize) : EMPTY_COLS)
  /* The aisle width labels' boxes exactly where they are drawn (the aisle labels from aisleSrc, riding the
     drag offset while rigid; the cross-aisle labels from the shifted layout): a column clearance label keeps
     clear of them — the aisle width label has priority. */
  // the clearance labels keep clear of the aisle labels whenever both are drawn — the clearances now draw
  // whenever the aisle labels do (not only with the Checks layer)
  const on = aislesOn
  const ownBoxes = useMemo(() => (on ? aisleLabelBoxes(aisleSrc, gridSize, labelSize, { cross: false, profile: warnProfile }) : []), [on, aisleSrc, gridSize, labelSize, warnProfile])
  const crossBoxes = useMemo(() => (on ? aisleLabelBoxes(shifted, gridSize, labelSize, { aisles: false, profile: warnProfile }) : []), [on, shifted, gridSize, labelSize, warnProfile])
  const avoid = useMemo(() => {
    const ox = aisleRigid ? dx : 0, oy = aisleRigid ? dy : 0
    return [...(ox || oy ? ownBoxes.map(r => ({ ...r, x: r.x + ox, y: r.y + oy })) : ownBoxes), ...crossBoxes]
  }, [ownBoxes, crossBoxes, aisleRigid, dx, dy])
  return (
    <>
      {chromePart && selectedObjects.map(o => <SelectionOutline key={o.id} obj={o} gridSize={gridSize} objects={objects} />)}
      {chromePart && selectedObjects.map(o => rackLabelsEligible(o.type)
        ? <RackLabels key={'rl:' + o.id} obj={o} zoom={lz} gridSize={gridSize} /> : null)}
      {chromePart && selectedObjects.map(o => (FP_TYPES.has(o.type) && o.fpVerts)
        ? <FpDimLabels key={'fp:' + o.id} obj={o} zoom={lz} gridSize={gridSize}
            activeWallIdx={activeWall && activeWall.objId === o.id ? activeWall.wallIdx : null} /> : null)}
      <Group x={aisleRigid ? dx : 0} y={aisleRigid ? dy : 0} listening={false}>
      {aisles.map(a => <AisleLabelItem key={'ai:' + a.id} aisle={a} row1={aisleById.get(a.row1Id)} row2={aisleById.get(a.row2Id)} lz={aisleLabelScale(a, labelSize, gridSize)} gridSize={gridSize} profile={warnProfile} columns={aisleCols} />)}
      </Group>
      {/* one width label per cross-aisle; few, so drawn from the previewed layout every drag frame */}
      {aislesOn && <CrossAisleLabels objects={shifted} lz={lz} gridSize={gridSize} profile={warnProfile} />}
      {aislesOn && <FaceAisleLabels objects={shifted} lz={lz} gridSize={gridSize} profile={warnProfile} />}
      {/* the Checks layer: clearance arrows and distances, red "under travel"
          marks and aisle shading, X marks, upright flags, oversized bays */}
      {/* a column in an aisle shows its clear distance on both sides whenever the aisle labels are shown (or
          the Checks layer is); the red "pinched" shade is a check mark — only with the Checks layer */}
      {(marksOn || aislesOn) && <ColumnClearanceLabels aisleBlocks={aisleBlocks} columns={columns} objects={objects} lz={lz} gridSize={gridSize} avoid={avoid} showLabels warnings={marksOn} />}
      <Group x={rigid ? dx : 0} y={rigid ? dy : 0} listening={false}>
      {marksOn && <BlockedFaceMarks rackConflicts={xMarks} objects={pObjects} gridSize={gridSize} lz={lz} />}
      {marksOn && <UprightConflictMarks uprightHits={uprightHits} objects={pObjects} gridSize={gridSize} lz={lz} />}
      {marksOn && <OversizedBayMarks objects={pObjects} gridSize={gridSize} lz={lz} />}
      </Group>
      {/* Smart-guide alignment lines, live during a plain object drag —
          CanvasArea's own colours (wall/column snaps purple, object-to-
          object snaps green) and dash, ported. Stroke width is a plain
          literal with strokeScaleEnabled, matching every other piece of
          canvas2 chrome (BUG 20's lesson) rather than SVG's raw /zoom. */}
      {chromePart && smartGuides.map((g, i) => {
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
      {chromePart && marquee && (
        <Rect
          x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
          fill={selectTint(0.10)} stroke={SELECT_BLUE} strokeWidth={1}
          dash={[4, 3]} strokeScaleEnabled={false} listening={false}
        />
      )}
    </>
  )
}

const EMPTY_COLS = []

export const Overlays = memo(OverlaysView)
