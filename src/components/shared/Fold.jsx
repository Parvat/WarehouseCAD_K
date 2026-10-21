import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'

/* Panel pieces in the Properties field style: a collapsible group (Fold) and a number field written on Enter / blur
   (Field). Used by the rack panel's sections and a selection's Rack fold. A field row is a fixed label column with
   the input filling the rest, its unit inside on the right (index.css .t-row / .t-field). */

const F = {
  note: { fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--steel)', lineHeight: 1.5 },
}

/** One field, Properties style: written on Enter / blur. */
export function Field({ label, value, onCommit, aria, unit = 'in', title }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (String(text).trim() !== '' && Number.isFinite(v) && v >= 0 && v !== value) onCommit(v); else setText(String(value)) }
  return (
    <label className="t-row" title={title}>
      <span className="t-label">{label}</span>
      <span className="t-field">
        <input aria-label={aria} type="number" min={0} value={text} className="t-input" onChange={e => setText(e.target.value)}
          onBlur={() => done()}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        {unit && <span className="t-unit">{unit}</span>}
      </span>
    </label>
  )
}

/** A collapsible group inside a panel section: an Oswald 13 heading with its chevron. */
export function Fold({ title, defaultOpen = true, children, aria }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div role="group" aria-label={aria || title} style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={16} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--steel)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        <span className="t-head">{title}</span>
      </button>
      {open && children}
    </div>
  )
}

export const FOLD_NOTE = F.note
