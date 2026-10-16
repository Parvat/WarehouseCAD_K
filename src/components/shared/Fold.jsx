import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'

/* Panel pieces in the Properties field style: a collapsible group (Fold) and a number field written on Enter / blur
   (Field). Used by the rack panel's sections and a selection's Rack fold. */

const F = {
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 86, flexShrink: 0, whiteSpace: 'nowrap' },
  input: { flex: 1, minWidth: 0, borderRadius: 6, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none', transition: 'border-color 0.15s' },
  unit: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', width: 14 },
  note: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', lineHeight: 1.45 },
}

/** One field, Properties style: written on Enter / blur. */
export function Field({ label, value, onCommit, aria, unit = 'in', title }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const done = () => { const v = Number(text); if (String(text).trim() !== '' && Number.isFinite(v) && v >= 0 && v !== value) onCommit(v); else setText(String(value)) }
  return (
    <label style={F.row} title={title}>
      <span style={F.label}>{label}</span>
      <input aria-label={aria} type="number" min={0} value={text} style={F.input} onChange={e => setText(e.target.value)}
        onFocus={e => { e.target.style.borderColor = 'var(--accent)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; done() }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      <span style={F.unit}>{unit}</span>
    </label>
  )
}

/** A collapsible group inside a panel section: a tracked-caps header with its chevron. */
export function Fold({ title, defaultOpen = true, children, aria }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div role="group" aria-label={aria || title} style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={11} style={{ color: 'var(--text3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' }}>{title}</span>
      </button>
      {open && children}
    </div>
  )
}
