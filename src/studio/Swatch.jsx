// Swatch.jsx — a colour swatch that opens the drawing colours (and None, for a fill): the Draw bar's Stroke and Fill, a
// text's Colour, a drawn shape's card and its selection bar (design/selbar.png). No Konva here — the card
// (PropertiesPanel) loads it in Node tests.
// (d1-bar) The colours open as a floating popover over the canvas, attached to the swatch (studio/Popover.jsx) — never
// inside a card, so they are never cut off: two rows of six round colours, the picked one ringed in green.
import { useCallback, useState } from 'react'
import { B } from './barParts'
import { Popover } from './Popover'
import { DRAW_COLORS } from '../utils/drawTool'

const HATCH = 'repeating-linear-gradient(45deg, #5A615C 0 2px, transparent 2px 5px)'
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()
/** A colour as it can be seen on the dark bar (selbar.png draws the ink stroke as a light ring): a very dark colour is
 *  shown light. */
export function onDark(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c || '')
  if (!m) return c
  const n = parseInt(m[1], 16), lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum < 0.22 ? '#E8EAE6' : c
}

/** The colours, as a popover attached to `anchor` (selbar.png): DRAW_COLORS in rows of six, None first for a fill, any
 *  colour below. */
export function ColourPop({ anchor, label, value, onPick, none = false, onClose }) {
  const cell = (c, on, title, extra) => (
    <button key={title} type="button" aria-label={title} title={title} aria-pressed={on} data-colour={c || 'none'} onClick={() => { onPick(c); onClose() }}
      style={{ width: 24, height: 24, borderRadius: '50%', padding: 0, cursor: 'pointer', border: c && same(c, '#FFFFFF') ? '1px solid #5A615C' : 0,
        boxShadow: on ? `0 0 0 2px ${B.island}, 0 0 0 4px ${B.accent}` : 'none', background: c || HATCH, ...extra }} />
  )
  return (
    <Popover anchor={anchor} onClose={onClose} label={label + ' colours'}
      style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: B.island, border: `1px solid ${B.line}`, borderRadius: 10, boxShadow: '0 10px 28px rgba(15,18,16,.28)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 24px)', gap: 8 }}>
        {none && cell(null, !value, 'None')}
        {DRAW_COLORS.map(c => cell(c, same(value, c), c))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: B.muted, cursor: 'pointer' }}>
        <input type="color" aria-label={label + ' (any colour)'} value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#1F2321'} onChange={e => onPick(e.target.value)}
          style={{ width: 22, height: 22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }} />
        Any colour
      </label>
    </Popover>
  )
}

/** A colour swatch that opens the colours (and None, for a fill): DRAW_COLORS, any colour picked. `round`: the selection
 *  bar's ring (selbar.png — a stroke colour drawn as a ring, a fill colour as a dot). */
export function Swatch({ label, value, onPick, none = false, round = null, locked = false }) {
  const [el, setEl] = useState(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  // the bar's: a stroke colour a ring, a fill colour a dot — a dark one drawn light, as the mockup's ink ring
  const face = round === 'ring' ? { width: 18, height: 18, borderRadius: '50%', border: `2px solid ${onDark(value) || '#E8EAE6'}`, background: 'transparent', boxSizing: 'border-box' }
    : round === 'dot' ? { width: 18, height: 18, borderRadius: '50%', border: onDark(value) !== value || same(value, '#FFFFFF') ? '1.5px solid #E8EAE6' : 0, background: value || HATCH, boxSizing: 'border-box' }
    : { width: 22, height: 22, borderRadius: 5, border: '1px solid #5A615C', background: value || HATCH }
  const btn = round
    ? { width: 32, height: 32, border: 0, borderRadius: 8, padding: 0, background: open ? B.active : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }
    : { padding: 0, border: 0, background: 'transparent', display: 'inline-flex', cursor: 'pointer' }
  return (
    <>
      <button ref={setEl} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={locked ? 'Locked' : label} disabled={locked}
        onClick={() => setOpen(o => !o)} data-swatch={value || 'none'} style={{ ...btn, ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>
        <span aria-hidden="true" style={{ display: 'block', ...face }} />
      </button>
      {open && el && <ColourPop anchor={el} label={label} value={value} onPick={onPick} none={none} onClose={close} />}
    </>
  )
}
