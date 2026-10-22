import { TOOLS, RAIL, OBJECTS } from './iconData'

/* The one icon set (STUDIO.md §9, design/studio/Icons.dc.html): box style, drawn at 24px only. The markup is copied
   from the design file by scripts/studio-icons.mjs — never redrawn here.
     tool   — the D tools pairs: idle grey, active mint
     rail   — the rail's category icons (object colours; active is the button's fill, not the icon)
     object — the object drawings; used as a tool (Text, Custom area) the idle grey turns mint when active (§9) */
const IDLE = '#C9CEC9', ACTIVE = '#7BD3A4'

/* `color` repaints the idle grey — the frame's dropdown Chevron is 12px in #9AA29C (the muted text) */
export function Icon({ name, kind = 'tool', active = false, size = 24, color, title, style }) {
  let d
  if (kind === 'tool') d = TOOLS[name] && (active ? TOOLS[name].active : TOOLS[name].idle)
  else if (kind === 'rail') d = RAIL[name]
  else d = OBJECTS[name]
  if (!d) return null
  let body = kind === 'object' && active ? d.body.split(IDLE).join(ACTIVE) : d.body
  if (color && !active) body = body.split(IDLE).join(color)
  return (
    <svg width={size} height={size} viewBox={d.viewBox} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}
      aria-label={title} style={{ display: 'block', flexShrink: 0, ...style }} dangerouslySetInnerHTML={{ __html: body }} />
  )
}

export const hasIcon = (name, kind = 'tool') => !!(kind === 'tool' ? TOOLS[name] : kind === 'rail' ? RAIL[name] : OBJECTS[name])
