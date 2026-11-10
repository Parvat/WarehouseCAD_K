import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { HOME_TOOL } from '../utils/homeTool'
import { B, modePill, Sep, Seg, CloseBtn } from '../studio/barParts'
import { SECTION_RECT_TOOL, SECTION_PEN_TOOL, cancelSection, useSectionRename, useSectionTool } from './sectionTool'
import { nameColor, LABEL, polygonOf } from '../utils/sectionAreas'
import { useShownNames } from './sectionNameShown'
import { useLiveObjects, useView } from './live'

/* The Section tool's mode bar (STUDIO.md §7a Sections; the mode bars' look): "Section", Rectangle · Custom shape, the
   hint, ✕ (Esc too) back to Pan. */
const word = { color: B.muted, fontSize: 12 }
export const SECTION_HINT = { [SECTION_RECT_TOOL]: 'Drag to draw a section', [SECTION_PEN_TOOL]: 'Pen: click points, double-click to close' }

export function SectionBar() {
  const tool = useCanvasStore(s => s.activeTool)
  const choosing = useSectionTool(s => !!s.sides)
  const close = () => { cancelSection(); useCanvasStore.getState().setActiveTool(HOME_TOOL) }
  const pick = (t) => { cancelSection(); useCanvasStore.getState().setActiveTool(t) }
  return (
    <div role="toolbar" aria-label="Section" data-mode-bar="section" className="st-pill" style={modePill}>
      <span style={{ fontWeight: 600, color: B.strong }}>Section</span>
      <Sep />
      <Seg aria="Section shape" options={[
        { value: SECTION_RECT_TOOL, label: 'Rectangle', aria: 'Rectangle', title: 'Rectangle — drag a box', on: tool === SECTION_RECT_TOOL, onClick: () => pick(SECTION_RECT_TOOL) },
        { value: SECTION_PEN_TOOL, label: 'Custom shape', aria: 'Custom shape', title: 'Custom shape — the pen: click points', on: tool === SECTION_PEN_TOOL, onClick: () => pick(SECTION_PEN_TOOL) },
      ]} />
      <Sep />
      <span data-mode-hint style={word}>{choosing ? 'Click the side to keep · Esc cancels' : SECTION_HINT[tool] || ''}</span>
      <CloseBtn label="Close Section" title="Close (Esc)" onClick={close} />
    </div>
  )
}

/* Renaming a section in place (a second click on its name): a box on the label itself; Enter or leaving writes it (one
   undo step), Esc drops it. Typing stays the box's (utils/typing.js: an input owns its keys). */
export function SectionRename() {
  const id = useSectionRename(s => s.id)
  // where the section is drawn now, in the view the canvas is drawn with now (live.js)
  const objects = useLiveObjects(), view = useView()
  const obj = id ? objects.find(o => o.id === id) || null : null
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (obj) { setText(obj.label || ''); requestAnimationFrame(() => ref.current?.select()) } }, [id])   // eslint-disable-line react-hooks/exhaustive-deps
  // over its name, where it is drawn (SectionNames.jsx publishes it); not placed yet: the section's middle
  const placed = useShownNames(st => (id ? st.boxes[id] : null))
  if (!obj) return null
  const b = placed || (() => { const p = polygonOf(obj), xs = p.map(q => q[0]), ys = p.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; return { x: cx - 60 / view.zoom, y: cy - 10 / view.zoom, w: 120 / view.zoom, h: 20 / view.zoom, fs: 14 / view.zoom } })()
  const px = Math.max(12, b.fs * view.zoom)
  const done = (save) => {
    const t = text.trim()
    useSectionRename.setState({ id: null })
    if (save && t && t !== obj.label) useCanvasStore.getState().commitObjectUpdate(obj.id, { label: t })
  }
  return (
    <input ref={ref} aria-label="Rename section" value={text} onChange={e => setText(e.target.value)} autoFocus
      onBlur={() => done(true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      style={{ position: 'absolute', zIndex: 145, left: b.x * view.zoom + view.panX - 3, top: b.y * view.zoom + view.panY - 3, width: Math.max(120, b.w * view.zoom + 24), height: px * 1.25 + 6,
        boxSizing: 'border-box', padding: '0 3px', border: '1px solid #2E7D5B', borderRadius: 3, outline: 'none', background: '#FFFFFF', color: nameColor(obj),
        fontFamily: LABEL.font, fontSize: px, fontWeight: 600 }} />
  )
}
