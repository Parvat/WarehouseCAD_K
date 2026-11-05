import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

/* ── The bars' parts (STUDIO.md §1, §4, §5; design/studio/Studio.dc.html — the selection bars C1 / C6, the mode bars
   C8 / C9 / C10, the notice C6). Values copied from the mockup; icons from §9 only (src/studio/iconData.js, 24px).
     pill      — a selection or mode bar: the island fill, radius 12, the pill shadow (§4)
     Sep       — the 1×20 separator between groups
     IconBtn   — a 32×32 icon button, radius 8 (Delete's icon in the danger colour)
     Chip      — the 32h dropdown chip (C1's elevation, C6's zone): inset fill, a swatch, the name, the chevron
     Seg       — the 28h segmented control in a bar (Ask | Auto apply, Rows ↔ | Rows ↕): active = active fill + accent
     Menu      — the dark dropdown menu (the layout menu's look, C14), portalled over everything
     NoticePill— the notice above the tool pill (C6): message, Undo, ✕ — radius 10, 36 high */

export const B = {
  island: '#1F2321', line: '#323835', inset: '#2A2F2C', separator: '#3A403C', active: '#2E4A3C',
  strong: '#F2F4F1', text: '#E8EAE6', icon: '#C9CEC9', muted: '#9AA29C', accent: '#7BD3A4', onAccent: '#0F2A1F',
  danger: '#FF9C86', warnBg: '#3A2E17', warnFg: '#F2C77A', errFg: '#FFB4A3',
}
export const MONO = "'JetBrains Mono', monospace"
export const PJS = "'Plus Jakarta Sans', system-ui, sans-serif"
export const pill = {
  display: 'flex', alignItems: 'center', gap: 2, padding: 4, background: B.island, border: `1px solid ${B.line}`, borderRadius: 12,
  boxShadow: '0 10px 28px rgba(15,18,16,.22)', fontFamily: PJS, fontSize: 13, color: B.text, whiteSpace: 'nowrap', lineHeight: 'normal',
}
/** A mode bar (C8–C10): top 76, centred as the mockup places it (translateX(-62%)), padding 5 6 5 12, gap 6. */
export const modePill = { ...pill, position: 'fixed', left: '50%', top: 76, transform: 'translateX(-62%)', zIndex: 150, gap: 6, padding: '5px 6px 5px 12px' }

export const Sep = () => <span aria-hidden="true" style={{ width: 1, height: 20, background: B.separator, margin: '0 4px', flexShrink: 0 }} />

/* `locked`: the selection is locked (STUDIO.md §7a Locks) — disabled, at 45 %, titled Locked */
export function IconBtn({ name, label, title, onClick, danger = false, active = false, disabled = false, pressed, locked = false }) {
  return (
    <button type="button" aria-label={label} title={locked ? 'Locked' : (title || label)} onClick={onClick} disabled={disabled || locked} aria-pressed={pressed}
      style={{ width: 32, height: 32, border: 0, borderRadius: 8, padding: 0, background: active ? B.active : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>
      <Icon name={name} active={active} color={danger ? B.danger : undefined} />
    </button>
  )
}

/** The 32h chip: a swatch (optional), its words, the chevron (§9's Chevron, 12px muted — as the frame's dropdowns). */
/* `locked`: the selection is locked (STUDIO.md §7a Locks) — disabled, at 45 %, titled Locked */
export function Chip({ swatch, children, label, title, onClick, chipRef, open, locked = false }) {
  return (
    <button ref={chipRef} type="button" className="st-ghost" aria-label={label} title={locked ? 'Locked' : title} aria-haspopup="menu" aria-expanded={!!open} onClick={onClick} disabled={locked}
      style={{ height: 32, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', border: 0, borderRadius: 8, background: B.inset, fontSize: 12, color: B.text, maxWidth: 200, flexShrink: 0, ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>
      {swatch && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: swatch, flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      <Icon name="Chevron" size={12} color={B.muted} />
    </button>
  )
}

/** The bar's segmented control: an inset track (padding 2, radius 6), 28h segments; active = active fill + accent. */
export function Seg({ aria, options }) {
  return (
    <div role="group" aria-label={aria} style={{ display: 'flex', padding: 2, borderRadius: 6, background: B.inset, flexShrink: 0 }}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={!!o.on} aria-label={o.aria} title={o.title} onClick={o.onClick}
          style={{ height: 28, padding: '0 10px', border: 0, borderRadius: 6, fontSize: 12, background: o.on ? B.active : 'transparent', color: o.on ? B.accent : B.muted }}>{o.label}</button>
      ))}
    </div>
  )
}

/** A 28h text button in a bar: the primary (mint), or an inset one. */
export const barBtn = (primary = false) => ({
  height: 28, padding: '0 12px', border: 0, borderRadius: 6, fontSize: 12, fontWeight: primary ? 600 : 400, flexShrink: 0,
  background: primary ? B.accent : B.inset, color: primary ? B.onAccent : B.text,
})
/** Its class: hover a step lighter, never darker (studio.css) — every barBtn carries one. */
export const btnClass = (primary = false) => (primary ? 'st-primary' : 'st-ghost')
/** The ✕ of a bar or a notice: 28×28, §9's Close. */
export function CloseBtn({ label = 'Close', title, onClick }) {
  return (
    <button type="button" aria-label={label} title={title || label} onClick={onClick}
      style={{ width: 28, height: 28, border: 0, borderRadius: 6, padding: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name="Close" color={B.muted} />
    </button>
  )
}

/* ── the dropdown menu: portalled to the themed root at the top of the stack, placed under its anchor (flipped above
   near the bottom), closed by a press outside, a scroll, a resize or Esc ── */
const MENU_W = 240
export const menuRow = { height: 34, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 13, color: B.text, textAlign: 'left', cursor: 'pointer', fontFamily: PJS, width: '100%' }
export const MenuLine = () => <span aria-hidden="true" style={{ height: 1, background: '#2E3431', margin: '4px 6px' }} />
export function Menu({ label, anchor, at, onClose, children, width = MENU_W }) {
  const ref = useRef(null)
  const [h, setH] = useState(0)
  useLayoutEffect(() => { if (ref.current) setH(ref.current.offsetHeight) })
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose() }
    const away = (e) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose() }
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('pointerdown', down, true); window.addEventListener('scroll', away, true); window.addEventListener('resize', onClose); window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', onClose); window.removeEventListener('keydown', key, true) }
  }, [onClose, anchor])
  const host = document.querySelector('[data-theme]') || document.body
  const r = anchor ? anchor.getBoundingClientRect() : { left: at.x, right: at.x + width, top: at.y, bottom: at.y }
  const left = Math.max(8, Math.min(anchor ? r.left : r.left, window.innerWidth - width - 8))
  const below = (anchor ? r.bottom + 6 : r.top)
  const top = below + h > window.innerHeight - 8 ? Math.max(8, (anchor ? r.top - 6 : r.top) - h) : below
  return createPortal(
    <div ref={ref} role="menu" aria-label={label} data-card-dark style={{ position: 'fixed', left, top, zIndex: 500, width, padding: 6, borderRadius: 10, background: B.island, border: `1px solid ${B.line}`, boxShadow: '0 16px 40px rgba(15,18,16,.3)', display: 'flex', flexDirection: 'column', fontFamily: PJS }}>
      {children}
    </div>, host)
}
/** A menu row. `icon`: its section-9 icon on the left, 24px ({ name, kind }) — `icon={null}` keeps the slot empty (an
 *  item with no icon yet), so every row's words line up; `keys`: its shortcut on the right, faint, mono 11 (only one
 *  that works) — as the layout menu shows them. */
export function MenuItem({ children, onClick, disabled = false, danger = false, swatch, title, right, icon, keys }) {
  return (
    <button type="button" role="menuitem" className="st-hov" disabled={disabled} title={title} onClick={onClick}
      style={{ ...menuRow, color: danger ? B.danger : B.text, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {icon !== undefined && <span aria-hidden="true" data-menu-icon={icon ? icon.name : ''} style={{ width: 24, height: 24, flexShrink: 0, display: 'flex' }}>{icon && <Icon name={icon.name} kind={icon.kind || 'tool'} />}</span>}
      {swatch && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: swatch, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {keys && <span data-menu-keys style={{ fontFamily: MONO, fontSize: 11, color: '#7E8680', flexShrink: 0 }}>{keys}</span>}
      {right}
    </button>
  )
}

/** A notice (C6): its message, Undo (when the thing it reports is one undo step), ✕ — and, below the message, the lines
 *  that name rows (amber warnings, red skipped). */
export function NoticePill({ role = 'status', label, children, lines = [], onUndo = null, onClose = null, closeLabel = 'Close', closeTitle, actions = null }) {
  return (
    <div role={role} aria-label={label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minHeight: 36, boxSizing: 'border-box', padding: lines.length ? '6px 6px 6px 14px' : '0 6px 0 14px', background: B.island, border: `1px solid ${B.line}`, borderRadius: 10, boxShadow: '0 10px 28px rgba(15,18,16,.22)', fontFamily: PJS, fontSize: 13, color: B.text, maxWidth: 'min(760px, calc(100vw - 32px))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 34 }}>
        <span style={{ color: B.text, whiteSpace: 'normal' }}>{children}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {actions}
          {onUndo && <button type="button" className="st-ghost" onClick={onUndo} style={{ height: 26, padding: '0 10px', border: 0, borderRadius: 6, background: B.inset, color: B.accent, fontSize: 12, fontWeight: 600 }}>Undo</button>}
          {onClose && <CloseBtn label={closeLabel} title={closeTitle} onClick={onClose} />}
        </span>
      </div>
      {lines.map((l, i) => <div key={i} style={{ fontSize: 12, color: l.tone === 'red' ? B.errFg : B.warnFg, lineHeight: 1.4, paddingRight: 8 }}>{l.text}</div>)}
    </div>
  )
}
