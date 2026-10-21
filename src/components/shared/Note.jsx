/* One message box for the whole app (THEME.md message boxes): error, warning or note — a 3px left border, its
   background and text from the theme's box tokens (index.css --error-* / --warn-* / --note-*), radius 2, PJS 12.
   Check layout's list, the Properties banners, Generate, Rules, the Hub and the elevation depth note all use it. */

const LEVEL = {
  error:   { bd: 'var(--error-bd)', bg: 'var(--error-bg)', fg: 'var(--error-fg)' },
  warning: { bd: 'var(--warn-bd)',  bg: 'var(--warn-bg)',  fg: 'var(--warn-fg)' },
  note:    { bd: 'var(--note-bd)',  bg: 'var(--note-bg)',  fg: 'var(--note-fg)' },
}

/** `level` error | warning | note; `title` an optional bold first line; `icon` an optional Lucide glyph before it.
 *  Any other prop (role, aria-label, onClick, data-*) goes on the box. */
export function Note({ level = 'note', title, icon: Icon, children, style, ...rest }) {
  const c = LEVEL[level] || LEVEL.note
  return (
    <div data-note={level} {...rest} style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0,
      padding: '8px 12px', borderRadius: 2, borderLeft: `3px solid ${c.bd}`, background: c.bg, color: c.fg,
      fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: 1.5, fontWeight: 400,
      ...style,
    }}>
      {Icon && <Icon size={14} strokeWidth={1.5} absoluteStrokeWidth style={{ flexShrink: 0, marginTop: 2, color: c.bd }} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {title && <div style={{ fontWeight: 600 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}

export const NOTE_LEVELS = Object.keys(LEVEL)
