/* ── Input router — ONE pointer surface, one owner per gesture ───────────────
   With the flag on, the Konva root sits above the canvas with pointer events
   enabled, so every press lands here first. This module decides who owns the
   gesture, and that decision is made ONCE per press and held until release.

   Three owners, and a press belongs to exactly one of them:

     TRANSFORMER  the press landed on a Transformer anchor or its rotater.
                  We do nothing at all: no stopPropagation, no forward. The
                  event continues into the Konva Stage and Konva's own
                  Transformer drives the resize or rotation natively.

     KONVA        the press landed on an object. We select and drag it here,
                  and stop the event dead. It never reaches the SVG, so the
                  SVG cannot also select, deselect, or start a tool.

     SVG          the press landed on empty space, or is a shift-marquee.
                  We re-dispatch it onto #canvas-svg so CanvasArea's existing
                  handlers run — pan, rubber-band, every drawing tool and
                  double-click-to-edit keep working untouched.

   The owner is latched on mousedown and every subsequent move/up goes to the
   same place. That latch is the whole point: without it a drag that began on an
   object would start firing tool handlers the moment the pointer crossed empty
   space, and a press on empty space that wandered over a rack would select it
   mid-marquee. One gesture, one owner, start to finish. */

export const OWNER = { NONE: 'none', KONVA: 'konva', SVG: 'svg', TRANSFORMER: 'transformer' }

/* Konva names Transformer parts internally; anchors end in `_anchor` and the
   rotate grip is the `rotater`. Matching on those keeps the Transformer's own
   gestures out of our hands without reaching into its internals. */
export function isTransformerPart(node) {
  if (!node) return false
  const n = node.name() || ''
  return n.includes('_anchor') || n.includes('rotater')
}

/* Re-dispatch a pointer event onto the SVG so React's handlers on it fire.
   React listens at its root container, so a bubbling event dispatched on the
   svg reaches the synthetic handler exactly as a real one would. */
export function forwardToSvg(e, type) {
  const svg = document.getElementById('canvas-svg')
  if (!svg) return false
  const ev = new MouseEvent(type || e.type, {
    bubbles: true, cancelable: true, composed: true,
    clientX: e.clientX, clientY: e.clientY,
    screenX: e.screenX, screenY: e.screenY,
    button: e.button ?? 0, buttons: e.buttons ?? 0,
    detail: e.detail ?? 1,
    shiftKey: !!e.shiftKey, ctrlKey: !!e.ctrlKey,
    altKey: !!e.altKey, metaKey: !!e.metaKey,
  })
  /* Marks the synthetic event so the router ignores it on the way back
     through — the svg is inside the container we listen on, so without this
     flag a forwarded press would be routed again and recurse. */
  ev.__konvaForwarded = true
  svg.dispatchEvent(ev)
  return true
}

export const isForwarded = e => !!e.__konvaForwarded

/* Wheel carries zoom, which lives on the canvas, so it always forwards. */
export function forwardWheel(e) {
  const svg = document.getElementById('canvas-svg')
  if (!svg) return false
  const ev = new WheelEvent('wheel', {
    bubbles: true, cancelable: true, composed: true,
    clientX: e.clientX, clientY: e.clientY,
    deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
    shiftKey: !!e.shiftKey, ctrlKey: !!e.ctrlKey,
    altKey: !!e.altKey, metaKey: !!e.metaKey,
  })
  ev.__konvaForwarded = true
  svg.dispatchEvent(ev)
  return true
}
