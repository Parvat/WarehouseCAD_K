// Swatch.jsx — a colour swatch that opens the drawing colours (and None, for a fill): the Draw bar's Stroke and Fill, a
// text's Colour, and a drawn shape's card (dealer audit). No Konva here — the card (PropertiesPanel) loads it in Node tests.
import { useEffect, useRef, useState } from 'react'
import { B } from './barParts'
import { DRAW_COLORS } from '../utils/drawTool'

const HATCH = 'repeating-linear-gradient(45deg, #5A615C 0 2px, transparent 2px 5px)'

/** A colour swatch that opens the colours (and None, for a fill): DRAW_COLORS, any colour picked. */
export function Swatch({ label, value, onPick, none = false }) {
  const [open, setOpen] = useState(false), ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true) }
  }, [open])
  const face = (v) => (v ? { background: v } : { background: HATCH })
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label} onClick={() => setOpen(o => !o)} data-swatch={value || 'none'}
        style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #5A615C', padding: 0, cursor: 'pointer', ...face(value) }} />
      {open && (
        <div role="dialog" aria-label={label + ' colours'} data-card-dark
          style={{ position: 'absolute', top: 30, left: -8, zIndex: 400, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5, 22px)', gap: 6,
            background: B.island, border: `1px solid ${B.line}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(15,18,16,.28)' }}>
          {none && <button type="button" aria-label="None" title="None" onClick={() => { onPick(null); setOpen(false) }}
            style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${!value ? B.accent : '#5A615C'}`, padding: 0, background: HATCH, cursor: 'pointer' }} />}
          {DRAW_COLORS.map(c => (
            <button key={c} type="button" aria-label={c} title={c} onClick={() => { onPick(c); setOpen(false) }}
              style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${value === c ? B.accent : '#5A615C'}`, padding: 0, background: c, cursor: 'pointer' }} />
          ))}
          <input type="color" aria-label={label + ' (any colour)'} value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#1F2321'} onChange={e => onPick(e.target.value)}
            style={{ width: 22, height: 22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }} />
        </div>
      )}
    </span>
  )
}

