import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import { useCanvasStore } from '../../store/useCanvasStore'
import { resizeRackToWidth } from '../../render/rackOps'
import { findObjectNode } from './useKonvaRackInteraction'

/* ── Resize and rotate, by Konva's own Transformer ───────────────────────────
   Not hand-rolled, deliberately. The Transformer already solves the two things
   the SVG path kept fighting:

     • the handle box ROTATES with the object, so a turned rack gets a turned
       frame instead of an axis-aligned one;
     • a rotated resize grows from the anchored edge, with none of the manual
       counter-rotation and anchor correction that produced the bounce.

   What it cannot know is what a resize MEANS. Scaling a rack would stretch its
   bays, and a bay is a physical 96in opening — it does not stretch. So the
   scale never reaches the store: onTransformEnd reads the width the gesture
   produced, converts it to a whole number of bays, writes the bay list, and
   resets the node's scale to 1. The rack then re-renders from its own beams at
   the nearest honest width. Everything else — a deck, a shelving unit, a dock
   door — takes the plain geometric resize. */

export function KonvaTransformer({ stageRef, layerRef }) {
  const trRef = useRef(null)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const objects     = useCanvasStore(s => s.objects)
  const gridSize    = useCanvasStore(s => s.gridSize)

  /* Attach to whatever is selected. Re-run on objects too: a node is recreated
     when its ops change, and a Transformer holding a destroyed node draws
     handles around nothing. */
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return

    let raf = 0

    /* findObjectNode knows BOTH naming schemes. Looking up only "rack:<id>"
       silently missed floor plans, which are "fp:<id>" — so selecting the
       building attached the Transformer to nothing at all, and the building is
       the easiest thing on the sheet to click.
       getStage() is checked too: a node detached by a re-render is as useless
       as one that was never found. */
    const attach = (isRetry) => {
      const nodes = []
      const missing = []
      for (const id of selectedIds) {
        const n = findObjectNode(stage, id)
        if (n && n.getStage()) nodes.push(n)
        else missing.push(id)
      }
      tr.nodes(nodes)
      tr.getLayer()?.batchDraw()
      if (!missing.length) return

      /* Not necessarily broken — the store can select an object in the same
         tick it creates one (placing a floor plan does exactly that), and this
         effect then runs before react-konva has committed the node. Give it one
         frame before believing it. */
      if (!isRetry) { raf = requestAnimationFrame(() => attach(true)); return }

      /* Still missing a frame later: the Transformer is holding something the
         user cannot see or grab. This must never fire; it is here so that if it
         ever does, it says so instead of presenting dead handles. */
      if (typeof console !== 'undefined') {
        console.warn('[KonvaTransformer] selected but not drawn:', missing.join(', '))
      }
    }

    attach(false)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [selectedIds, objects, stageRef])

  const onTransformEnd = () => {
    const tr = trRef.current
    if (!tr) return
    const st = useCanvasStore.getState()

    for (const node of tr.nodes()) {
      const id = (node.name() || '').replace(/^(rack|fp):/, '')
      const obj = st.objects.find(o => o.id === id)
      if (!obj) continue

      const scaleX = node.scaleX() || 1
      const scaleY = node.scaleY() || 1
      const rotation = Math.round(node.rotation() * 10) / 10

      /* Reset the scale before anything else. The store carries real
         dimensions, never a scale factor — leaving it on the node would
         double-apply it the moment the object re-rendered. */
      node.scaleX(1); node.scaleY(1)

      const patch = { rotation: ((rotation % 360) + 360) % 360 }

      const baseW = obj.width || 0
      const baseH = obj.height || 0
      const newW = baseW * scaleX
      const newH = baseH * scaleY

      if (Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6) {
        /* A beam rack resizes in BAYS. Anything else takes the geometry. */
        const bayPatch = resizeRackToWidth(obj, newW, gridSize)
        if (bayPatch) {
          patch.beams = bayPatch.beams
          patch.width = bayPatch.width
          if (Math.abs(scaleY - 1) > 1e-6) patch.height = Math.max(1, newH)
        } else {
          if (newW > 0) patch.width = newW
          if (newH > 0) patch.height = newH
        }
      }

      /* ONE history entry for the whole gesture. commitObjectUpdate pushes
         history; updateObject would not, and calling it per frame during the
         transform is exactly why this runs on END rather than on change. */
      st.commitObjectUpdate(id, patch)
    }
    tr.getLayer()?.batchDraw()
  }

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      /* 5deg steps, matching the SVG rotate handle; shift gives the coarse 45. */
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      rotationSnapTolerance={3}
      ignoreStroke
      flipEnabled={false}
      /* Beam racks only resize along their length — the other handles would
         imply a stretch the object cannot express. */
      keepRatio={false}
      anchorSize={8}
      anchorStroke="#4a9eff"
      anchorFill="#0e1420"
      anchorCornerRadius={1}
      borderStroke="#4a9eff"
      borderDash={[5, 3]}
      onTransformEnd={onTransformEnd}
      boundBoxFunc={(oldBox, newBox) => (
        /* Never let a drag invert or collapse an object. */
        newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
      )}
    />
  )
}
