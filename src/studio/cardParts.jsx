import { useEffect, useState } from 'react'
import { Icon } from './Icon'

/* The right card's parts (STUDIO.md §3, §5; every value from design/studio/Studio.dc.html — C1 props, C5 check,
   C6 zone, C7 empty, C4 generate). One set for every Properties section, so the card reads as one thing:
     Head / Sec — the card's blocks, split by 1px #2E3431 lines; SecLabel the 12px muted label
     Field / NumField / TextField / SelectField — the 30px inset field (mono numbers, PJS words), label above (4)
     InlineField — label left (56) and field (zone Name)
     Grid2 — the two-column field grid (gap 10)
     ToggleRow / Toggle — 30×18 switch; Row — label left, control right
     Seg — the inset segmented control (active: active fill, accent text)
     Btn — primary (accent) / ghost (separator border) / inset / danger, 36 in the card
     Totals — the Layout figures; Tag — a level tag; Note — a message box; Fold — a collapsible section
   Fields are written on Enter / blur exactly as before; being edited = a 1px select border (#2E7D5B). */

export const C = {
  island: '#1F2321', inset: '#2A2F2C', divider: '#2E3431', separator: '#3A403C', active: '#2E4A3C',
  strong: '#F2F4F1', text: '#E8EAE6', icon: '#C9CEC9', muted: '#9AA29C', faint: '#7E8680',
  accent: '#7BD3A4', onAccent: '#0F2A1F', select: '#2E7D5B', danger: '#FF9C86',
}
export const MONO = "'JetBrains Mono', monospace"
export const LEVEL = {
  error:   { bg: '#4A231B', fg: '#FFB4A3', title: '#FFD9CF', label: 'Error' },
  warning: { bg: '#3A2E17', fg: '#F2C77A', label: 'Warning' },
  note:    { bg: '#1E2E4A', fg: '#A9C4FF', label: 'Note' },
}

/** The card's top block (C1): the caption line, then whatever follows (the big figure). */
export function Head({ caption, children, last }) {
  return (
    <div style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: last ? 'none' : `1px solid ${C.divider}` }}>
      {caption != null && <span style={{ color: C.muted, fontSize: 12 }}>{caption}</span>}
      {children}
    </div>
  )
}

/** The big figure row (C1): 216 positions … 216 usable. */
export function BigFigure({ value, unit, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, color: C.strong }}>{value}</span>
      {unit && <span style={{ color: C.muted }}>{unit}</span>}
      {right != null && <span style={{ marginLeft: 'auto', fontFamily: MONO, color: C.accent }}>{right}</span>}
    </div>
  )
}

/** A card block: padding 12px 16px, a 1px line under it unless it is the last. */
export function Sec({ children, gap = 10, last, label, style, ...rest }) {
  return (
    <div {...rest} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap, borderBottom: last ? 'none' : `1px solid ${C.divider}`, minWidth: 0, ...style }}>
      {label != null && <SecLabel>{label}</SecLabel>}
      {children}
    </div>
  )
}
export const SecLabel = ({ children }) => <span style={{ color: C.muted, fontSize: 12 }}>{children}</span>
export const Hint = ({ children, style }) => <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.45, ...style }}>{children}</span>

export const Grid2 = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{children}</div>

/* the field's box: inset, no border, radius 6, 30 high; mono 12 for numbers, PJS 13 for words */
export const fieldBox = (words = false) => ({
  height: 30, width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 10px', border: 0, borderRadius: 6,
  background: C.inset, color: C.strong, outline: 'none',
  ...(words ? { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 13 } : { fontFamily: MONO, fontSize: 12 }),
})

/** Label above, field below (C1 Bays / Beam, C6 Width / Length). */
export function Field({ label, children, title }) {
  return (
    <label title={title} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  )
}
/** Label left (56), field filling the rest (C6 Name). */
export function InlineField({ label, children, labelWidth = 56 }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ width: labelWidth, flexShrink: 0, color: C.muted, fontSize: 12 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</span>
    </label>
  )
}

/** A text input in the field box, written on Enter / blur (`onCommit(text)`); reset to `value` when it changes. */
export function TextInput({ value, onCommit, words = false, aria, placeholder, onFocusSelect = true, inputProps }) {
  const [text, setText] = useState(String(value ?? ''))
  useEffect(() => setText(String(value ?? '')), [value])
  return (
    <input type="text" aria-label={aria} value={text} placeholder={placeholder} className="st-field" style={fieldBox(words)}
      onChange={e => setText(e.target.value)}
      onFocus={e => { if (onFocusSelect) e.target.select() }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(String(value ?? '')); e.currentTarget.blur() } }}
      onBlur={() => { if (text !== String(value ?? '')) onCommit(text) }} {...inputProps} />
  )
}

/** A number input in the field box: Enter / blur commits a finite number ≥ min; anything else goes back. */
export function NumInput({ value, onCommit, aria, min = 0, step, inputProps }) {
  const [text, setText] = useState(String(value ?? ''))
  useEffect(() => setText(String(value ?? '')), [value])
  const done = () => { const v = Number(text); if (String(text).trim() !== '' && Number.isFinite(v) && v >= min && v !== value) onCommit(v); else setText(String(value ?? '')) }
  return (
    <input type="number" aria-label={aria} value={text} min={min} step={step} className="st-field" style={fieldBox()}
      onChange={e => setText(e.target.value)} onBlur={done}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} {...inputProps} />
  )
}

/** A select in the field box (words or numbers) — drawn as the plain field, as the mockups draw it; `chevron` adds the
 *  12px Chevron at its right where the mockup draws one (C3 Ceiling, Pallet). */
export function SelectField({ value, onChange, aria, children, words = false, style, chevron = false }) {
  return (
    <span style={{ position: 'relative', display: 'flex', width: '100%', minWidth: 0 }}>
      <select aria-label={aria} value={value} onChange={onChange} className="st-field st-select" style={{ ...fieldBox(words), appearance: 'none', cursor: 'pointer', ...(chevron ? { paddingRight: 28 } : null), ...style }}>{children}</select>
      {chevron && <span aria-hidden style={{ position: 'absolute', right: 10, top: 9, pointerEvents: 'none', display: 'flex' }}><Icon name="Chevron" size={12} color={C.muted} /></span>}
    </span>
  )
}

/** A read-only value in the field box. */
export const StaticField = ({ children, words, aria }) => <span aria-label={aria} style={fieldBox(words)}>{children}</span>

/** Label left, control right (C1 Elevation, toggles). */
export function Row({ label, children, title }) {
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {children}
    </div>
  )
}

/** The 30×18 switch: off #3A403C with an icon-grey knob, on accent with an on-accent knob. */
export function Toggle({ on, onClick, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} onClick={onClick}
      style={{ width: 30, height: 18, borderRadius: 9, border: 0, padding: 0, flexShrink: 0, position: 'relative', cursor: 'pointer', background: on ? C.accent : C.separator }}>
      <span style={{ position: 'absolute', top: 2, ...(on ? { right: 2 } : { left: 2 }), width: 14, height: 14, borderRadius: 7, background: on ? C.onAccent : C.icon }} />
    </button>
  )
}
export const ToggleRow = ({ label, on, onClick, aria, title }) => (
  <Row label={label} title={title}><Toggle on={on} onClick={onClick} label={aria || label} /></Row>
)

/** The segmented control (C4 Row direction): inset track, padding 2, radius 6; 28 high segments, radius 4. */
export function Seg({ options, value, onChange, aria, mono = false }) {
  return (
    <div role="group" aria-label={aria} style={{ display: 'flex', padding: 2, borderRadius: 6, background: C.inset, minWidth: 0 }}>
      {options.map(o => {
        const on = o.on ?? (value === o.value)
        return (
          <button key={String(o.value ?? o.label)} type="button" aria-pressed={on} aria-label={o.aria} title={o.title} disabled={o.disabled}
            onClick={() => (o.onClick ? o.onClick() : onChange(o.value))}
            style={{ flex: 1, minWidth: 0, height: 28, border: 0, borderRadius: 4, background: on ? C.active : 'transparent', color: on ? C.accent : C.muted, fontSize: 12, fontFamily: mono ? MONO : 'inherit', cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Card buttons, 36 high, radius 8: primary (accent), ghost (separator line), inset, danger (ghost, danger text). */
export function Btn({ kind = 'ghost', children, style, ...rest }) {
  const k = {
    primary: { border: 0, background: C.accent, color: C.onAccent, fontWeight: 600 },
    ghost:   { border: `1px solid ${C.separator}`, background: 'transparent', color: C.text },
    inset:   { border: 0, background: C.inset, color: C.text },
    danger:  { border: `1px solid ${C.separator}`, background: 'transparent', color: C.danger },
  }[kind]
  /* hover: a secondary / inset / danger button turns the inset fill; the mint primary does not change (studio.css .st-hov) */
  return <button type="button" className={kind === 'primary' ? undefined : 'st-hov'} {...rest} style={{ height: 36, padding: '0 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', ...k, ...style }}>{children}</button>
}

/** An icon button in the card (28 square, transparent; the danger icon for Delete). */
export function IconBtn({ name, label, onClick, active, danger, title, kind = 'tool', size = 28, color }) {
  return (
    <button type="button" className="st-hov" aria-label={label} title={title || label} aria-pressed={active == null ? undefined : !!active} onClick={onClick}
      style={{ width: size, height: size, border: 0, borderRadius: 6, background: active ? C.active : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
      <Icon name={name} kind={kind} active={!!active} color={danger ? C.danger : color} />
    </button>
  )
}

/** The Layout figures (C1, C7): mono 15 over a 12px muted label; `accent` for usable. */
export function Totals({ items }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', flexDirection: 'column' }}>
          <span data-total={it.label} style={{ fontFamily: MONO, fontSize: 15, color: it.accent ? C.accent : C.strong }}>{it.value}</span>
          <span style={{ color: C.muted, fontSize: 12 }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

/** A level tag (C5): 18 high, radius 4, 11 / 600. */
export const Tag = ({ level, children }) => (
  <span style={{ height: 18, padding: '0 6px', display: 'flex', alignItems: 'center', borderRadius: 4, background: LEVEL[level].bg, color: LEVEL[level].fg, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{children || LEVEL[level].label}</span>
)
/** A count chip (C5 header): 20 high, radius 10, mono 11. */
export const CountChip = ({ level, n }) => (
  <span data-count={level} style={{ height: 20, padding: '0 7px', display: 'flex', alignItems: 'center', borderRadius: 10, background: LEVEL[level].bg, color: LEVEL[level].fg, fontFamily: MONO, fontSize: 11 }}>{n}</span>
)
/** A message box (C4): radius 6, padding 8px 10px, 12px, the level's colours. */
export const Note = ({ level = 'note', children, style, ...rest }) => (
  <div {...rest} style={{ padding: '8px 10px', borderRadius: 6, background: LEVEL[level].bg, color: LEVEL[level].fg, fontSize: 12, lineHeight: 1.45, ...style }}>{children}</div>
)

/** A collapsible card section: its label row (13, text colour) with the Chevron, the section's line under it. */
export function Fold({ title, children, defaultOpen = false, aria, last, gap = 10 }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div role="group" aria-label={aria || title} style={{ borderBottom: last ? 'none' : `1px solid ${C.divider}` }}>
      <button type="button" className="st-hov" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', border: 0, background: 'transparent', color: C.text, fontSize: 13, textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><Icon name="Chevron" size={12} color={C.muted} /></span>
      </button>
      {open && <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap }}>{children}</div>}
    </div>
  )
}
