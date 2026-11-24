// dragLift.js — (gen-lock) a drag redraws only what it moves. A plain drag moves the dragged objects' Konva nodes (their
// body, outline, handles, labels — useCanvasInteraction collectDragNodes); each move used to redraw the whole stage:
// every rack, every label, every row number, 5 layers a frame — on a big layout the frame went over budget on a slow
// machine. For the drag, the moved nodes are lifted out of their layers into a layer of their own just above each one
// (so they keep their place in the drawing order: a rack under the labels and the columns, its outline above them),
// the layers they left are drawn once without them, and each frame draws only the lifted layers. On the drop they go
// back to their own layers at their own places, before the drop's store write re-renders anything.
import Konva from 'konva'

let current = null

/** Lifts `nodes` ([{ node }]) for the drag → { layers, restore() }. Nothing to lift: null. */
export function liftDragNodes(stage, nodes) {
  dropLift()
  if (!stage || !nodes?.length) return null
  const byLayer = new Map()                               // its layer → [{ node, index }]
  for (const { node } of nodes) {
    const parent = node.getParent(), layer = node.getLayer()
    if (!layer || parent !== layer) continue              // only a layer's own children (collectDragNodes')
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push({ node, index: node.zIndex() })
  }
  if (!byLayer.size) return null
  const made = []
  // the layers bottom-up, each lifted layer right above its own layer
  for (const layer of [...byLayer.keys()].sort((a, b) => a.zIndex() - b.zIndex())) {
    const lift = new Konva.Layer({ listening: false, name: 'drag-lift' })
    stage.add(lift)
    lift.zIndex(layer.zIndex() + 1)
    const list = byLayer.get(layer).sort((a, b) => a.index - b.index)
    for (const it of list) it.node.moveTo(lift)
    made.push({ layer, lift, list })
    layer.batchDraw()                                     // drawn once without what was lifted
  }
  const handle = {
    layers: made.map(m => m.lift),
    draw() { for (const m of made) m.lift.batchDraw() },
    restore() {
      if (current !== handle) return
      current = null
      for (const m of made) {
        for (const it of m.list) {                          // back at its own place, bottom-up
          if (it.node.getParent() !== m.lift) continue
          it.node.moveTo(m.layer)
          it.node.zIndex(Math.min(it.index, m.layer.getChildren().length - 1))
        }
        m.lift.destroy()
        m.layer.batchDraw()
      }
    },
  }
  current = handle
  return handle
}

/** The drag's lifted nodes put back (the drop, a cancelled drag — any end of a gesture). */
export function dropLift() { current?.restore() }
