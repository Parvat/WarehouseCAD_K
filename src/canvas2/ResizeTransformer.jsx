import { useEffect, useRef } from 'react'
import { Transformer, Rect } from 'react-konva'
import { useCanvasStore } from '../store/useCanvasStore'
import { resizeRackToWidth } from '../render/rackOps'

/* ── Resize and rotate, by Konva's own Transformer ───────────────────────────
   Not hand-rolled: Konva's Transformer already solves the two things a
   hand-rolled handle set fights forever — the handle box rotates WITH the
   object, and a rotated resize grows from the anchored corner/edge with none
   of the manual counter-rotation the SVG canvas's delta-based drag needs.

   Nothing here duplicates the single-hitTest picking rule (CANVAS2.md rule
   4). Konva's Transformer anchors are not "object nodes" in that rule's
   sense — they are UI chrome it creates and owns, and it calls
   e.cancelBubble = true on their own mousedown internally (verified in
   Konva's own source), so a press on a handle never reaches
   onStageMouseDown/hitTest at all. The Transformer's border/interior has NO
   hit region by default (shouldOverdrawWholeArea is off), so a press
   anywhere else — inside the rack, off it — falls straight through to our
   own geometric pick exactly as if the Transformer were not there.

   ── Why this attaches to a SHADOW node, not the real rack Group ──
   RackShape's Group (shapes.jsx) is centre-origin: spin() sets
   x=offsetX=cx, y=offsetY=cy so ROTATION pivots at the object's centre,
   while its Ops children still draw at plain absolute world coordinates
   (obj.x, not 0) — the two cancel out to an identity transform whenever
   rotation is 0, which is the whole trick that makes it work for painting.
   Konva's Transformer, though, does NOT expect a pre-baked offset on the
   node it manipulates: it computes its own centre-pivot rotation and
   opposite-edge-pinned resize internally, assuming a standard (0,0-origin)
   node. Attached directly to the real Group, this measurably breaks — a
   verified real-mouse test dragging middle-right by 50 screen px produced
   scaleX of 1.0003 (essentially no resize) and a position shift equal to
   almost the FULL drag distance, i.e. Konva treated the gesture as "move
   the already-offset node" rather than "grow its width." Whatever the
   width/height it reports outward look right, the inverse — turning a new
   desired box back into x/y/scale for THIS node shape — does not.

   The fix is the standard one for this class of Konva mismatch: give the
   Transformer a plain, ordinary Rect proxy with the object's own x/y/width/
   height/rotation and no offset trick, let Konva manipulate THAT, and read
   the result back off it. The proxy is invisible (opacity 0) and never
   listens — it exists purely as a well-behaved stand-in for the geometry
   Konva needs, redrawn fresh from the object every render so it can never
   drift from what is actually committed. */

const ALL_ANCHORS = [
  'top-left', 'top-center', 'top-right', 'middle-right',
  'middle-left', 'bottom-left', 'bottom-center', 'bottom-right',
]

/* CANVAS2.md's own Handle rules, verified against CanvasUI.jsx's ResizeHandles:
     - beam racks (beams/towers only stretch along their length) -> ml/mr only
     - lane racks (drive-in/through, pushback, pallet-flow) -> suppress tc
     - everything else ported here (mezzanine, shelving) -> the full set */
const ML_MR_ONLY = new Set(['rack_row', 'rack_double_row', 'rack_cantilever'])
const SUPPRESS_TC = new Set(['rack_drive_in', 'rack_drive_through', 'rack_pushback', 'rack_pallet_flow'])
const RACK_TYPES = new Set([...ML_MR_ONLY, ...SUPPRESS_TC, 'rack_mezzanine', 'rack_shelving'])

function anchorsFor(type) {
  if (ML_MR_ONLY.has(type)) return ['middle-left', 'middle-right']
  if (SUPPRESS_TC.has(type)) return ALL_ANCHORS.filter(a => a !== 'top-center')
  return ALL_ANCHORS
}

export function ResizeTransformer() {
  const trRef = useRef(null)
  const shadowRef = useRef(null)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const objects = useCanvasStore(s => s.objects)
  const gridSize = useCanvasStore(s => s.gridSize)

  const selected = selectedIds.length === 1 ? objects.find(o => o.id === selectedIds[0]) : null
  const isRack = !!selected && RACK_TYPES.has(selected.type)

  /* Attach to the shadow proxy. Resize/rotate is a single-object control
     surface, matching the SVG's own `!groupSelected` gate — a multi-
     selection keeps its plain outline, no handles. */
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const shadow = isRack ? shadowRef.current : null
    tr.nodes(shadow ? [shadow] : [])
    tr.getLayer()?.batchDraw()
  }, [isRack, selected?.id])

  const onTransformEnd = () => {
    const shadow = shadowRef.current
    if (!shadow || !selected) return
    const st = useCanvasStore.getState()
    const obj = st.objects.find(o => o.id === selected.id)
    if (!obj) return

    const scaleX = shadow.scaleX() || 1
    const scaleY = shadow.scaleY() || 1
    const rotation = Math.round(shadow.rotation() * 10) / 10

    /* Reset the shadow's own scale before anything else — it gets rebuilt
       fresh from the object on the next render either way, but leaving a
       stale scale on it would misreport the NEXT gesture's starting size. */
    shadow.scaleX(1); shadow.scaleY(1)

    const patch = { rotation: ((rotation % 360) + 360) % 360 }
    const resized = Math.abs(scaleX - 1) > 1e-3 || Math.abs(scaleY - 1) > 1e-3
    if (resized) {
      const newW = (obj.width || 0) * scaleX
      const newH = (obj.height || 0) * scaleY

      /* A beam rack resizes in BAYS — a bay is a physical opening, it does
         not stretch. Anything else (resizeRackToWidth only knows rack_row/
         rack_double_row) takes the raw geometric width/height; there is no
         absolute-width tower/lane-count helper for cantilever or the lane
         types in render/rackOps.js to convert through instead. */
      const bayPatch = resizeRackToWidth(obj, newW, gridSize)
      if (bayPatch) {
        patch.beams = bayPatch.beams
        patch.width = bayPatch.width
        if (Math.abs(scaleY - 1) > 1e-3) patch.height = Math.max(1, newH)
      } else {
        if (newW > 0) patch.width = newW
        if (newH > 0) patch.height = newH
      }

      /* The shadow has NO offset — x()/y() already ARE the top-left world
         position Konva computed to keep the opposite edge/corner pinned,
         no centre-based conversion needed the way the real Group would. */
      patch.x = shadow.x()
      patch.y = shadow.y()
    }

    /* ONE history entry for the whole gesture. commitObjectUpdate pushes
       history; updateObject would not, and doing this per-frame during the
       transform (instead of once here, on end) is exactly what would spam
       undo with every intermediate frame of the drag. */
    st.commitObjectUpdate(obj.id, patch)
    shadow.getLayer()?.batchDraw()
  }

  const anchors = isRack ? anchorsFor(selected.type) : []

  return (
    <>
      {isRack && (
        <Rect
          ref={shadowRef}
          x={selected.x} y={selected.y}
          width={selected.width} height={selected.height}
          rotation={selected.rotation || 0}
          opacity={0}
          listening={false}
        />
      )}
      <Transformer
        ref={trRef}
        enabledAnchors={anchors}
        rotateEnabled={isRack}
        /* Matches the SVG rotate handle's snap points; free rotation elsewhere. */
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        rotationSnapTolerance={3}
        ignoreStroke
        flipEnabled={false}
        keepRatio={false}
        /* Plain screen px, undivided by zoom. Verified directly at 7% (the
           CANVAS2.md rule 7 working zoom) by reading anchor.getClientRect()
           back from a live Stage: Konva's Transformer already renders its
           own chrome at a size independent of the ambient Stage/Layer
           scale — an anchorSize of 9 measures 10x10 screen px (9 body +
           stroke) whether the Stage is at 100% or 7%. Dividing by zoom
           here, the way the SVG's own hand-drawn (non-Konva) handles have
           to, double-compensates and produces handles roughly zoom times
           too large — confirmed by that same live read-back once, before
           this was caught, showing ~140px squares instead. */
        anchorSize={9}
        anchorStrokeWidth={1}
        anchorCornerRadius={2}
        borderStrokeWidth={1.5}
        rotateAnchorOffset={32}
        padding={4}
        anchorStroke="#4a9eff"
        anchorFill="#0e1420"
        borderStroke="#4a9eff"
        borderDash={[5, 3]}
        onTransformEnd={onTransformEnd}
        boundBoxFunc={(oldBox, newBox) => (
          // Never let a drag invert or collapse the object.
          newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
        )}
      />
    </>
  )
}
