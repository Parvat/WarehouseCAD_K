import { useRef, useEffect } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { UNITS } from '../../constants'
import { getCanvasContainerSize } from '../../utils/canvasContainer'
import { nanoid } from 'nanoid'
import { pasteAt } from '../../utils/pasteAt'
import { useLabelPrefs } from '../../canvas2/labelPrefs'
import { LABEL_SIZES, LABEL_SIZE_NAMES } from '../../render/labelSize'
import { useViewPrefs } from '../../studio/viewPrefs'
import { textOwnsKey } from '../../utils/typing'

/* The layout menu (Studio, STUDIO.md §1: the project name ▾ in the top-left island opens it). It holds everything the
   old top bar's "Settings and more" menu held — File, Edit, View, Standards, Appearance — so no action is lost while
   the Studio frame replaces the bar. Its rows are restyled with the menu's own step (C14); here they keep their
   working shape, text only (no Lucide: STUDIO.md §9). Roles and arrow keys as before. */

const C = {
  bg:       'var(--surface)',
  border:   'var(--border)',
  text:     'var(--text)',
  muted:    'var(--text3)',
  accentBg: 'var(--accent-solid)',
  activeTxt:'var(--accent-fg)',
}

function MenuLabel({ children }) {
  return (
    <div style={{
      fontFamily:'var(--font-display)', fontSize:10, fontWeight:600,
      letterSpacing:'0.10em', textTransform:'uppercase', color:C.muted,
      padding:'0 4px', marginBottom:8,
    }}>{children}</div>
  )
}

function MenuGroup({ label, children, first }) {
  return (
    <div role="group" aria-label={label} style={{
      padding:'14px 12px',
      borderTop: first ? 'none' : '0.5px solid var(--border)',
    }}>
      <MenuLabel>{label}</MenuLabel>
      {children}
    </div>
  )
}

/* A full-width action: name on the left, shortcut hint on the right. */
function MenuItem({ children, onClick, hint }) {
  return (
    <button onClick={onClick} role="menuitem" tabIndex={-1}
      style={{
        display:'flex', alignItems:'center', gap:10, width:'100%',
        padding:'7px 8px', borderRadius:7, border:'none', background:'transparent',
        cursor:'pointer', textAlign:'left',
        fontFamily:'inherit', fontSize:12.5, fontWeight:500, color:C.text,
        transition:'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ flex:1 }}>{children}</span>
      {hint && <span style={{ fontSize:10.5, color:C.muted, fontFamily:'var(--font-mono)' }}>{hint}</span>}
    </button>
  )
}

/* Label-left / control-right row. */
function MenuRow({ label, children }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      gap:10, padding:'6px 8px', minHeight:32,
    }}>
      <span style={{ fontSize:12.5, fontWeight:500, color:C.text }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>{children}</div>
    </div>
  )
}

/* Pill-group segment — one shared shape for grid size, UI size and zoom. */
function Seg({ active, onClick, title, children, wide }) {
  return (
    <button onClick={onClick} title={title} tabIndex={-1} aria-label={title}
      {...(active === undefined ? { role: 'menuitem' } : { role: 'menuitemradio', 'aria-checked': !!active })}
      style={{
        minWidth: wide ? undefined : 28, height:26, padding: wide ? '0 9px' : '0 6px',
        display:'flex', alignItems:'center', justifyContent:'center', gap:5,
        borderRadius:6, cursor:'pointer', border:'none',
        background: active ? C.accentBg : 'transparent',
        color: active ? C.activeTxt : C.muted,
        fontSize:10.5, fontWeight:600, fontFamily:'var(--font-mono)',
        transition:'background 0.12s, color 0.12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      {children}
    </button>
  )
}

function SegGroup({ children }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:2, padding:2,
      background:'var(--surface2)', borderRadius:8,
    }}>{children}</div>
  )
}

function Switch({ on, onClick, label }) {
  return (
    <button onClick={onClick} role="menuitemcheckbox" aria-checked={on} aria-label={label} tabIndex={-1}
      style={{
        position:'relative', width:34, height:20, borderRadius:999, border:'none',
        cursor:'pointer', flexShrink:0, padding:0,
        background: on ? C.accentBg : 'var(--surface3)',
        transition:'background 0.16s',
      }}>
      <span style={{
        position:'absolute', top:3, left: on ? 17 : 3, width:14, height:14,
        borderRadius:'50%', background: on ? C.activeTxt : 'var(--text4, var(--text3))',
        transition:'left 0.16s',
      }}/>
    </button>
  )
}

/** Zoom about the canvas centre (the bottom-left island's − / +, the menu's zoom). */
export function doZoom(factor) {
  const s = useCanvasStore.getState()
  const { w, h } = getCanvasContainerSize({ w: 1200, h: 800 })
  const cx = w / 2
  const cy = h / 2
  const nz = Math.max(0.01, Math.min(20, s.zoom * factor))
  s.setViewport(nz, cx - (cx - s.panX) * (nz / s.zoom), cy - (cy - s.panY) * (nz / s.zoom))
}

/** The layout menu. `onClose` closes it; `onRules` opens Rules profiles; `onHub` goes back to the Hub. Positioned by
 *  its caller (the top-left island), which also closes it on Esc and a click outside. */
export function LayoutMenu({ onClose, onRules, onHub, style }) {
  const { labelSize, setLabelSize, pdfLabelSize, setPdfLabelSize } = useLabelPrefs()
  const {
    copySelected, cutSelected,
    zoom, setViewport,
    unit, setUnit,
    showGrid, toggleGrid, showRulers, toggleRulers,
    snapToGrid, toggleSnap, snapUnit, setSnapUnit,
    uiScale, setUiScale,
    saveToFile, loadFromFile, newScene,
  } = useCanvasStore(useShallow(s => ({ copySelected: s.copySelected, cutSelected: s.cutSelected, zoom: s.zoom, setViewport: s.setViewport, unit: s.unit, setUnit: s.setUnit, showGrid: s.showGrid, toggleGrid: s.toggleGrid, showRulers: s.showRulers, toggleRulers: s.toggleRulers, snapToGrid: s.snapToGrid, toggleSnap: s.toggleSnap, snapUnit: s.snapUnit, setSnapUnit: s.setSnapUnit, uiScale: s.uiScale, setUiScale: s.setUiScale, saveToFile: s.saveToFile, loadFromFile: s.loadFromFile, newScene: s.newScene })))
  const dblClickFit = useViewPrefs(s => s.dblClickFit)
  const menuBox = useRef(null)
  const menuItems = () => [...(menuBox.current?.querySelectorAll('[role^="menuitem"], select') || [])]
  useEffect(() => { menuItems()[0]?.focus() }, [])
  const onMenuKey = e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    if (textOwnsKey(e)) return                       // an arrow in the menu's select is the select's (utils/typing.js)
    const items = menuItems()
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[n].focus()
  }
  const done = (fn) => () => { fn(); onClose() }

  return (
    <div role="menu" aria-label="Layout menu" ref={menuBox} onKeyDown={onMenuKey} style={{
      position:'fixed', width:296, zIndex:160,
      background:C.bg, border:`0.5px solid ${C.border}`, borderRadius:12,
      boxShadow:'var(--shadow)', color:C.text, fontFamily:'var(--font-ui)',
      maxHeight:'calc(100vh - 90px)', overflowY:'auto', ...style,
    }}>

      <MenuGroup label="File" first>
        <MenuItem onClick={done(newScene)} hint="Ctrl+N">New</MenuItem>
        <MenuItem onClick={done(loadFromFile)}>Open…</MenuItem>
        <MenuItem onClick={done(saveToFile)} hint="Ctrl+S">Save</MenuItem>
      </MenuGroup>

      <MenuGroup label="Edit">
        <MenuItem onClick={done(cutSelected)}>Cut</MenuItem>
        <MenuItem onClick={done(copySelected)}>Copy</MenuItem>
        <MenuItem onClick={done(() => pasteAt(useCanvasStore, 'cursor', nanoid))} hint="Ctrl+V">Paste</MenuItem>
        <MenuItem onClick={done(() => pasteAt(useCanvasStore, 'inPlace', nanoid))} hint="Ctrl+Shift+V">Paste in place</MenuItem>
      </MenuGroup>

      <MenuGroup label="View">
        <MenuRow label="Grid">
          <Switch on={showGrid} onClick={toggleGrid} label="Toggle grid" />
        </MenuRow>
        <MenuRow label="Rulers">
          <Switch on={showRulers} onClick={toggleRulers} label="Toggle rulers" />
        </MenuRow>
        <MenuRow label="Double-click to fit">
          <Switch on={dblClickFit} onClick={() => useViewPrefs.getState().toggleDblClickFit()} label="Toggle double-click to fit" />
        </MenuRow>
        <MenuRow label="Label size">
          <SegGroup>
            {[['small','S'],['medium','M'],['large','L'],['xlarge','XL']].map(([val,lbl]) => (
              <Seg key={val} active={labelSize===val} onClick={() => setLabelSize(val)} title={`${LABEL_SIZE_NAMES[val]} — ${LABEL_SIZES[val]} in text`}>{lbl}</Seg>
            ))}
          </SegGroup>
        </MenuRow>
        <MenuRow label="PDF label size">
          <select value={pdfLabelSize} onChange={e => setPdfLabelSize(e.target.value)} aria-label="PDF label size"
            style={{ fontSize:11, fontFamily:'var(--font-mono)', background:'var(--surface2)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 4px' }}>
            <option value="auto">Auto (≥ 2.5 mm)</option>
            <option value="screen">Same as screen</option>
            {Object.keys(LABEL_SIZES).map(k => <option key={k} value={k}>{LABEL_SIZE_NAMES[k]} ({LABEL_SIZES[k]} in)</option>)}
          </select>
        </MenuRow>
        <MenuRow label="Snap to grid">
          <Switch on={snapToGrid} onClick={toggleSnap} label="Toggle snap" />
        </MenuRow>
        <MenuRow label="Grid size">
          <SegGroup>
            {[['ft','1ft'],['in','1"'],['half-in','½"']].map(([val,lbl]) => (
              <Seg key={val} active={snapUnit===val} onClick={() => setSnapUnit(val)}>{lbl}</Seg>
            ))}
          </SegGroup>
        </MenuRow>
        <MenuRow label="Units">
          <select value={unit} onChange={e => setUnit(e.target.value)}
            style={{
              background:'var(--surface2)', border:'none', borderRadius:7,
              fontSize:11, color:C.text, fontFamily:'var(--font-mono)',
              padding:'6px 8px', cursor:'pointer', outline:'none',
            }}>
            {Object.values(UNITS).map(u => <option key={u}>{u}</option>)}
          </select>
        </MenuRow>
        <MenuRow label="Zoom">
          <SegGroup>
            <Seg onClick={() => doZoom(0.85)} title="Zoom out">−</Seg>
            <Seg onClick={() => setViewport(1, 80, 80)} title="Reset zoom" wide>{Math.round(zoom * 100)}%</Seg>
            <Seg onClick={() => doZoom(1.18)} title="Zoom in">+</Seg>
          </SegGroup>
        </MenuRow>
      </MenuGroup>

      <MenuGroup label="Standards">
        {/* The rules table the generator, capacity math and column check all read. */}
        <MenuItem onClick={done(onRules)}>Rules profiles…</MenuItem>
      </MenuGroup>

      <MenuGroup label="Appearance">
        <MenuRow label="Interface size">
          <SegGroup>
            {[['sm','S'],['md','M'],['lg','L']].map(([val,lbl]) => (
              <Seg key={val} active={uiScale===val} onClick={() => setUiScale(val)}>{lbl}</Seg>
            ))}
          </SegGroup>
        </MenuRow>
      </MenuGroup>

      {onHub && (
        <MenuGroup label="Hub">
          <MenuItem onClick={done(onHub)}>Back to Hub</MenuItem>
        </MenuGroup>
      )}
    </div>
  )
}
