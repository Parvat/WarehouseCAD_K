import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/* The Studio's left rail, its library flyout and the bottom tool pill (STUDIO.md §1; values from
   design/studio/Studio.dc.html, screen C1). The library's own logic — what each section holds, how an item is placed,
   which tool is active, the pen options — stays in components/LeftPanel/FloatingToolbar.jsx, which renders these in
   studio mode. Icons: design/studio/Icons.dc.html only (STUDIO.md §9). */

/* the rail's categories and their icon (the rail section of the icon set) */
export const RAIL_ICON = {
  floorplans: 'Floor plans', racking: 'Racking', ops: 'Ops', structural: 'Structural', safety: 'Safety', zones: 'Zones', blocks: 'Blocks',
}

const railBtn = (on, color = 'transparent') => ({
  width: 36, height: 36, border: 0, borderRadius: 6, background: on ? '#2E4A3C' : color,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
})

/** The rail: one button per library section, then Project settings. `open` is the section whose flyout is open. */
export function StudioRail({ sections, open, onOpen, onSettings }) {
  return (
    <div className="st-island" data-island="rail" style={{ left: 16, top: 76, width: 48, flexDirection: 'column', gap: 4, padding: '6px 0' }}>
      {sections.map(sec => (
        <button key={sec.id} type="button" aria-label={sec.label} title={sec.label} aria-pressed={open === sec.id} aria-expanded={open === sec.id}
          onClick={() => onOpen(open === sec.id ? null : sec.id)} style={railBtn(open === sec.id)}>
          <Icon name={RAIL_ICON[sec.id]} kind="rail" />
        </button>
      ))}
      <span style={{ width: 24, height: 1, background: '#3A403C', margin: '4px 0' }} />
      <button type="button" aria-label="Project settings" title="Project settings" onClick={onSettings} style={railBtn(false)}>
        <Icon name="Settings" />
      </button>
    </div>
  )
}

/** The library flyout, right of the rail: the section's caption and its items as 36px rows. A pick places the item
 *  as before; the flyout then closes. Esc and a click outside close it too. */
export function StudioFlyout({ section, items, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-island="rail"]')) onClose() }
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [onClose])
  return (
    <div ref={ref} className="st-island" role="menu" aria-label={`${section.label} library`} data-island="flyout"
      style={{ left: 72, top: 76, width: 232, flexDirection: 'column', alignItems: 'stretch', padding: 6, maxHeight: 'calc(100vh - 152px)', overflowY: 'auto' }}>
      <span style={{ padding: '6px 8px 6px', color: '#9AA29C', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{section.label}</span>
      {items.map(it => (
        <button key={it.id} type="button" role="menuitem" title={it.hint || it.label} onClick={() => { onPick(it); onClose() }}
          style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 13, color: '#E8EAE6', textAlign: 'left' }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

/* the tool pill's button: 36×36, radius 8; active = the active fill and the active icon */
const pillBtn = (on, wide) => ({
  height: 36, ...(wide ? { padding: '0 6px', gap: 2 } : { width: 36 }), border: 0, borderRadius: 8,
  background: on ? '#2E4A3C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
})
const Sep = () => <span style={{ width: 1, height: 22, background: '#3A403C', margin: '0 4px', flexShrink: 0 }} />

/* the hover hint above a tool: name and, where one exists, its key */
function Hint({ label, keyName }) {
  return (
    <span role="tooltip" style={{ position: 'absolute', left: '50%', bottom: 'calc(100% + 10px)', transform: 'translateX(-50%)', height: 26, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 13, background: '#2E7D5B', color: '#FFFFFF', fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(15,18,16,.2)', pointerEvents: 'none' }}>
      {label}{keyName && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: .75 }}>{keyName}</span>}
    </span>
  )
}

/* a small dark menu above a pill button (Line tools, Zone) */
function PillMenu({ label, rows, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const down = (e) => { if (!ref.current?.parentElement?.contains(e.target)) onClose() }
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [onClose])
  return (
    <div ref={ref} role="menu" aria-label={label} style={{ position: 'absolute', left: 0, bottom: 'calc(100% + 12px)', minWidth: 180, display: 'flex', flexDirection: 'column', padding: 6, background: '#1F2321', border: '1px solid #323835', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,18,16,.18)' }}>
      {rows.map(r => (
        <button key={r.id} type="button" role="menuitem" aria-label={r.label} title={r.title || r.label} disabled={r.disabled} aria-pressed={!!r.on}
          onClick={() => { r.onClick(); onClose() }}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', border: 0, borderRadius: 6, background: r.on ? '#2E4A3C' : 'transparent', fontSize: 13, color: r.on ? '#7BD3A4' : '#E8EAE6', textAlign: 'left' }}>
          {r.icon}<span style={{ flex: 1 }}>{r.label}</span>
        </button>
      ))}
    </div>
  )
}

/** The tool pill: Select, Pan | Fill racking, Row group, Split | Line tools ▾, Measure, Text, Zone ▾.
 *  `tools` describes each (id, label, icon, kind, key, on, onClick); `lineTools` and `zones` fill the two menus;
 *  `penOptions` is shown above the pill while Freehand is the tool. */
export function StudioToolPill({ groups, lineTools, zones, penOptions }) {
  const [hover, setHover] = useState(null)
  const [menu, setMenu] = useState(null)
  const lineOn = lineTools.some(t => t.on)
  const btn = (t) => (
    <div key={t.id} style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(h => (h === t.id ? null : h))}>
      <button type="button" aria-label={t.label} aria-pressed={!!t.on} disabled={t.disabled} title={t.title} onClick={t.onClick} style={pillBtn(t.on)}>
        <Icon name={t.icon} kind={t.kind || 'tool'} active={!!t.on} />
      </button>
      {hover === t.id && !menu && <Hint label={t.label} keyName={t.keyName} />}
    </div>
  )
  return (
    <div className="st-pill" role="toolbar" aria-label="Drawing tools" data-island="tool-pill"
      style={{ left: '50%', bottom: 20, transform: 'translateX(-50%)', gap: 2, padding: 5 }}>
      {groups[0].map(btn)}
      <Sep />
      {groups[1].map(btn)}
      <Sep />
      <div style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setHover('lines')} onMouseLeave={() => setHover(h => (h === 'lines' ? null : h))}>
        <button type="button" aria-label="Line tools" aria-haspopup="menu" aria-expanded={menu === 'lines'} aria-pressed={lineOn}
          onClick={() => setMenu(m => (m === 'lines' ? null : 'lines'))} style={pillBtn(lineOn, true)}>
          <Icon name={(lineTools.find(t => t.on) || lineTools[0]).icon} kind={(lineTools.find(t => t.on) || lineTools[0]).kind || 'tool'} active={lineOn} />
          <Icon name="Chevron" size={12} color="#9AA29C" />
        </button>
        {hover === 'lines' && !menu && <Hint label="Line tools" />}
        {menu === 'lines' && <PillMenu label="Line tools" onClose={() => setMenu(null)}
          rows={lineTools.map(t => ({ ...t, icon: <Icon name={t.icon} kind={t.kind || 'tool'} active={!!t.on} /> }))} />}
        {penOptions}
      </div>
      {groups[2].map(btn)}
      <div style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setHover('zone')} onMouseLeave={() => setHover(h => (h === 'zone' ? null : h))}>
        <button type="button" aria-label="Zone" aria-haspopup="menu" aria-expanded={menu === 'zone'} onClick={() => setMenu(m => (m === 'zone' ? null : 'zone'))} style={pillBtn(false, true)}>
          <Icon name="Custom area" kind="object" />
          <Icon name="Chevron" size={12} color="#9AA29C" />
        </button>
        {hover === 'zone' && !menu && <Hint label="Zone" />}
        {menu === 'zone' && <PillMenu label="Zones" onClose={() => setMenu(null)}
          rows={zones.map(z => ({ ...z, icon: <Icon name={z.icon} kind="object" /> }))} />}
      </div>
    </div>
  )
}
