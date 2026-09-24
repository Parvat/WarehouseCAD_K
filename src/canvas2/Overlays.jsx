import { Rect, Line } from 'react-konva'
import { SelectionOutline } from './shapes'
import { RackLabels, FpDimLabels, AisleLabel, ColumnClearanceLabels, rackLabelsEligible } from './DimensionLabels'
import { BlockedFaceMarks } from './BlockedFaceMarks'
import { OversizedBayMarks } from './OversizedBayMarks'

const FP_TYPES = new Set(['fp_rect', 'fp_l', 'fp_l_mirror', 'fp_t', 'fp_u', 'fp_cross'])

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
export function Overlays({
  selectedObjects, gridSize, marquee, objects = [], zoom = 1, showAisles = true, activeWall = null, smartGuides = [],
  showMarks = true, aisleBlocks = [], columns = [], rackConflicts = [], pickBlocks = [],
}) {
  const aisles = showAisles ? objects.filter(o => o.type === 'aisle') : []
  return (
    <>
      {selectedObjects.map(o => <SelectionOutline key={o.id} obj={o} gridSize={gridSize} objects={objects} />)}
      {selectedObjects.map(o => rackLabelsEligible(o.type)
        ? <RackLabels key={'rl:' + o.id} obj={o} zoom={zoom} gridSize={gridSize} /> : null)}
      {selectedObjects.map(o => (FP_TYPES.has(o.type) && o.fpVerts)
        ? <FpDimLabels key={'fp:' + o.id} obj={o} zoom={zoom} gridSize={gridSize}
            activeWallIdx={activeWall && activeWall.objId === o.id ? activeWall.wallIdx : null} /> : null)}
      {aisles.map(a => <AisleLabel key={'ai:' + a.id} aisle={a} objects={objects} zoom={zoom} gridSize={gridSize} />)}
      {showMarks && <ColumnClearanceLabels aisleBlocks={aisleBlocks} columns={columns} objects={objects} zoom={zoom} />}
      {showMarks && <BlockedFaceMarks rackConflicts={pickBlocks.length ? [...rackConflicts, ...pickBlocks] : rackConflicts} objects={objects} gridSize={gridSize} zoom={zoom} />}
      {showMarks && <OversizedBayMarks objects={objects} gridSize={gridSize} zoom={zoom} />}
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
