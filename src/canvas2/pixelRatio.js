// pixelRatio.js — (rack-design) the canvas drawn at the screen's own pixel density, kept in step when it changes.
//
// Konva reads window.devicePixelRatio once, when a layer's canvas is made. Browser zoom (Ctrl + / Ctrl −) and moving the
// window to another screen change it afterwards, and the plan was then drawn at the old density and scaled — every line
// soft. Here the stage's layers follow it: each layer's canvas is set to the current ratio and the stage redrawn, and
// Konva's own default follows too, so a layer made later (a drag's lifted layer — dragLift.js) starts right.
import { useEffect } from 'react'
import Konva from 'konva'

/** The ratio the canvas draws at now. */
export const devicePixelRatioNow = () => (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1)

/** Sets every layer of `stage` (its scene canvas) to `ratio` and redraws it. Returns true when anything changed. */
export function applyPixelRatio(stage, ratio = devicePixelRatioNow()) {
  Konva.pixelRatio = ratio
  if (!stage) return false
  let changed = false
  for (const layer of stage.getLayers()) {
    const cv = layer.getCanvas()
    if (cv && cv.getPixelRatio() !== ratio) { cv.setPixelRatio(ratio); changed = true }
  }
  if (changed) stage.batchDraw()
  return changed
}

/** Keeps the stage in `stageRef` at the device pixel ratio: now, and each time it changes. */
export function useDevicePixelRatio(stageRef, ready = true) {
  useEffect(() => {
    if (!ready || typeof window === 'undefined' || !window.matchMedia) return undefined
    let mq = null
    const watch = () => {
      applyPixelRatio(stageRef.current)
      mq?.removeEventListener?.('change', watch)
      // a media query for the ratio as it is now: it fires once the ratio moves off it, and is then made again
      mq = window.matchMedia(`(resolution: ${devicePixelRatioNow()}dppx)`)
      mq.addEventListener?.('change', watch)
    }
    watch()
    const onResize = () => applyPixelRatio(stageRef.current)
    window.addEventListener('resize', onResize)
    return () => { mq?.removeEventListener?.('change', watch); window.removeEventListener('resize', onResize) }
  }, [stageRef, ready])
}
