import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { HOME_TOOL } from '../utils/homeTool'
import { B, modePill, Sep, Seg, CloseBtn } from '../studio/barParts'
import { SECTION_RECT_TOOL, SECTION_PEN_TOOL, cancelSection, useSectionRename, useSectionTool } from './sectionTool'
import { labelBox, LABEL } from '../utils/sectionAreas'

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
  const obj = useCanvasStore(s => (id ? s.objects.find(o => o.id === id) : null))
  const view = useCanvasStore(useShallow(s => ({ zoom: s.zoom, panX: s.panX, panY: s.panY })))
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (obj) { setText(obj.label || ''); requestAnimationFrame(() => ref.current?.select()) } }, [id])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!obj) return null
  const b = labelBox(obj, view.zoom)
  const done = (save) => {
    const t = text.trim()
    useSectionRename.setState({ id: null })
    if (save && t && t !== obj.label) useCanvasStore.getState().commitObjectUpdate(obj.id, { label: t })
  }
  return (
    <input ref={ref} aria-label="Rename section" value={text} onChange={e => setText(e.target.value)} autoFocus
      onBlur={() => done(true)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      style={{ position: 'absolute', zIndex: 145, left: b.x * view.zoom + view.panX - 3, top: b.y * view.zoom + view.panY - 3, width: Math.max(120, b.w * view.zoom + 24), height: LABEL.px + 10,
        boxSizing: 'border-box', padding: '0 3px', border: '1px solid #2E7D5B', borderRadius: 3, outline: 'none', background: '#FFFFFF', color: LABEL.color,
        fontFamily: LABEL.font, fontSize: LABEL.px, fontWeight: 600, fontVariant: 'small-caps' }} />
  )
}
