import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { pickAt } from './hitTest'

/* (stacking) A click that lands where 2 or more objects stack (the building itself not counted) shows a small hint near
   the pointer: "Tab for the next one under here" — Tab then cycles them (hooks/useKeyboardShortcuts.js). It goes when the
   pointer moves off (12 px), after 3 s, on Tab, or on the next click elsewhere. Screen UI: its size never follows the
   zoom. */
export const useStackHint = create(() => ({ n: 0, at: 0 }))
const FP = /^fp_/

/** After a click picked at world point `w`: show the hint when 2 or more objects stack there. */
export function stackHintAfterClick(st, w) {
  if (!w) return
  // what truly holds the point (its own shape — not only its pick padding), the building not counted
  let n = 0
  const skip = new Set()
  for (let k = 0; k < 12; k++) {
    const h = pickAt(st.objects.filter(o => !skip.has(o.id)), st.layers, w.x, w.y, st.zoom || 1, st.gridSize || 40)
    if (!h.id || !h.real || h.kind === 'floor' || h.kind === 'wall') break
    skip.add(h.id)
    const o = st.objects.find(x => x.id === h.id)
    if (o && !FP.test(o.type)) n++
  }
  useStackHint.setState({ n: n >= 2 ? n : 0, at: Date.now() })
}
export const hideStackHint = () => { if (useStackHint.getState().n) useStackHint.setState({ n: 0 }) }

let last = { x: 0, y: 0 }
if (typeof window !== 'undefined') window.addEventListener('mousemove', (e) => { last = { x: e.clientX, y: e.clientY } }, { capture: true, passive: true })

export function StackHint() {
  const { n, at } = useStackHint()
  const [pos, setPos] = useState(null)
  const origin = useRef(null)
  useEffect(() => {
    if (!n) { setPos(null); return }
    origin.current = { ...last }
    setPos({ ...last })
    const t = setTimeout(hideStackHint, 3000)
    const move = (e) => { const o = origin.current; if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 12) hideStackHint() }
    const key = (e) => { if (e.key === 'Tab' || e.key === 'Escape') setTimeout(hideStackHint, 0) }
    window.addEventListener('mousemove', move); window.addEventListener('keydown', key)
    return () => { clearTimeout(t); window.removeEventListener('mousemove', move); window.removeEventListener('keydown', key) }
  }, [n, at])
  if (!n || !pos) return null
  return (
    <div role="status" aria-label="Stack hint" data-stack-hint={n}
      style={{ position: 'fixed', left: pos.x + 14, top: pos.y + 16, zIndex: 140, pointerEvents: 'none',
        background: 'rgba(31,35,33,0.92)', color: '#E8EAE6', font: "500 11px 'Plus Jakarta Sans', system-ui, sans-serif",
        padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
      <span style={{ display: 'inline-block', padding: '0 4px', marginRight: 4, borderRadius: 3, border: '1px solid rgba(232,234,230,0.45)', fontSize: 10 }}>Tab</span>
      for the next one under here
    </div>
  )
}
