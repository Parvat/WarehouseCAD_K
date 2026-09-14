import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
/* Grid3X3 / Ruler / Magnet left with the icon toggles they labelled — those
   three are switches in the settings menu now, named in words. */
import { Scissors, Copy, Clipboard, Undo2, Redo2, ZoomIn, ZoomOut,
         Save, FolderOpen, FilePlus, FileDown, MoreHorizontal, SlidersHorizontal } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { UNITS } from '../../constants'
import { RulesPanel } from '../Rules/RulesPanel'
import { isKonvaEnabled, setKonvaEnabled, subscribeKonvaFlag } from '../Canvas/konvaFlag'

/* ── palette — reads the active theme's CSS variables (see index.css) ──────── */
const C = {
  bg:       'var(--surface)',
  border:   'var(--border)',
  text:     'var(--text)',
  muted:    'var(--text3)',
  subtle:   'var(--text2)',
  surface:  'var(--surface3)',
  accent:   'var(--accent)',
  accentBg: 'var(--accent-solid)',
  danger:   'var(--red)',
  active:   'var(--accent-solid)',
  activeTxt:'var(--accent-fg)',
}

/* Quiet icon button — the only shape that stays in the always-visible bar. */
function IBtn({ icon: Icon, label, onClick, active, danger, title }) {
  return (
    <button onClick={onClick} title={title || label} aria-label={title || label}
      style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        width:30, height:30, borderRadius:7, border:'none', cursor:'pointer',
        fontSize:12, fontFamily:'inherit', fontWeight:500,
        background: active ? C.active : 'transparent',
        color: active ? C.activeTxt : danger ? C.danger : C.subtle,
        transition:'background 0.12s, color 0.12s',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = C.surface
          e.currentTarget.style.color = danger ? C.danger : C.text
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? C.active : 'transparent'
        e.currentTarget.style.color = active ? C.activeTxt : danger ? C.danger : C.subtle
      }}>
      <Icon size={15} strokeWidth={1.6} absoluteStrokeWidth/>
    </button>
  )
}

/* ── settings-menu primitives ──────────────────────────────────────────────
   Everything that used to crowd the bar lives in here. Rows are label-left /
   control-right so the menu reads as one column, not a second toolbar. */

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
    <div style={{
      padding:'14px 12px',
      borderTop: first ? 'none' : '0.5px solid var(--border)',
    }}>
      <MenuLabel>{label}</MenuLabel>
      {children}
    </div>
  )
}

/* A full-width action: icon + name on the left, shortcut hint on the right. */
function MenuItem({ icon: Icon, children, onClick, hint, danger }) {
  return (
    <button onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:10, width:'100%',
        padding:'7px 8px', borderRadius:7, border:'none', background:'transparent',
        cursor:'pointer', textAlign:'left',
        fontFamily:'inherit', fontSize:12.5, fontWeight:500,
        color: danger ? C.danger : C.text,
        transition:'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <Icon size={14} strokeWidth={1.6} absoluteStrokeWidth style={{ color: danger ? C.danger : C.subtle, flexShrink:0 }}/>
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

/* Pill-group segment — one shared shape for grid size, UI size and theme. */
function Seg({ active, onClick, title, children, wide }) {
  return (
    <button onClick={onClick} title={title}
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

/* The pill-group's own container, so segments sit in one recessed track. */
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
    <button onClick={onClick} role="switch" aria-checked={on} aria-label={label}
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

function doZoom(factor) {
  const s = useCanvasStore.getState()
  const el = document.getElementById('canvas-container')
  const cx = el ? el.clientWidth  / 2 : 600
  const cy = el ? el.clientHeight / 2 : 400
  const nz = Math.max(0.01, Math.min(20, s.zoom * factor))
  s.setViewport(nz, cx - (cx - s.panX) * (nz / s.zoom), cy - (cy - s.panY) * (nz / s.zoom))
}

export function TopBar() {
  const {
    undo, redo, copySelected, paste, cutSelected,
    zoom, setViewport,
    unit, setUnit,
    showGrid, toggleGrid, showRulers, toggleRulers,
    snapToGrid, toggleSnap, snapUnit, setSnapUnit,
    uiTheme, setUiTheme,
    uiScale, setUiScale,
    saveToFile, loadFromFile, newScene, exportAsPDF,
    currentFilename, hasUnsavedChanges,
  } = useCanvasStore()

  /* Menu open/closed is presentation state — component-local, never the store. */
  const [menuOpen, setMenuOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const konvaOn = useSyncExternalStore(subscribeKonvaFlag, isKonvaEnabled, () => false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    const onKey  = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div style={{
      height:56, background:C.bg, borderBottom:`1px solid ${C.border}`,
      display:'flex', alignItems:'center', padding:'0 20px', gap:16,
      flexShrink:0, zIndex:50,
    }}>

      {/* Wordmark — the same mark the Hub and Login wear, so the app reads as
          one product across its shells. */}
      <div style={{
        display:'inline-flex', alignItems:'center', gap:9, flexShrink:0,
        fontFamily:'var(--font-display)', fontWeight:700, fontSize:19,
        letterSpacing:'0.01em', color:C.accent, userSelect:'none',
      }}>
        <span style={{
          width:8, height:8, background:'currentColor', borderRadius:1,
          transform:'rotate(45deg)', display:'inline-block',
        }}/>
        Trace
      </div>

      {/* Project name */}
      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
        <span style={{ color:C.border, fontSize:15, userSelect:'none' }}>/</span>
        <span style={{
          fontSize:13, fontWeight:500, color:C.subtle,
          maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>
          {currentFilename || 'Untitled layout'}
        </span>
        {hasUnsavedChanges && (
          <div title="Unsaved changes"
            style={{ width:5, height:5, borderRadius:'50%', background:C.accent, flexShrink:0 }}/>
        )}
      </div>

      <div style={{ flex:1 }} />

      {/* History stays in the bar: CLAUDE.md gives the top bar ownership of undo
          /redo, and the left panel's footer dropped its copies on that basis. */}
      <div style={{ display:'flex', alignItems:'center', gap:2 }}>
        <IBtn icon={Undo2} label="Undo" onClick={undo} title="Undo (Ctrl+Z)" />
        <IBtn icon={Redo2} label="Redo" onClick={redo} title="Redo (Ctrl+Y)" />
      </div>

      {/* Export — the one primary action */}
      <button onClick={exportAsPDF} title="Export PDF"
        style={{
          display:'flex', alignItems:'center', gap:7,
          height:34, padding:'0 15px', borderRadius:8, border:'none', cursor:'pointer',
          background:C.accentBg, color:C.activeTxt,
          fontFamily:'inherit', fontSize:12.5, fontWeight:600, letterSpacing:'0.01em',
          transition:'opacity 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
        <FileDown size={14} strokeWidth={1.7} absoluteStrokeWidth/>
        Export
      </button>

      {/* Everything else — file, edit, view, appearance — lives behind this. */}
      <div ref={menuRef} style={{ position:'relative', flexShrink:0 }}>
        <IBtn icon={MoreHorizontal} label="Settings"
          onClick={() => setMenuOpen(o => !o)} active={menuOpen}
          title="Settings and more" />

        {menuOpen && (
          <div style={{
            position:'absolute', top:'calc(100% + 10px)', right:0, width:296,
            background:C.bg, border:`0.5px solid ${C.border}`, borderRadius:12,
            boxShadow:'var(--shadow)', zIndex:100,
            maxHeight:'calc(100vh - 90px)', overflowY:'auto',
          }}>

            <MenuGroup label="File" first>
              <MenuItem icon={FilePlus}   onClick={() => { newScene();     setMenuOpen(false) }} hint="Ctrl+N">New</MenuItem>
              <MenuItem icon={FolderOpen} onClick={() => { loadFromFile(); setMenuOpen(false) }}>Open…</MenuItem>
              <MenuItem icon={Save}       onClick={() => { saveToFile();   setMenuOpen(false) }} hint="Ctrl+S">Save</MenuItem>
            </MenuGroup>

            <MenuGroup label="Edit">
              {/* Cut is a clipboard move, not a destructive act — it carried a red
                  accent that pulled the eye to the quietest item in the menu. */}
              <MenuItem icon={Scissors}  onClick={() => { cutSelected();  setMenuOpen(false) }}>Cut</MenuItem>
              <MenuItem icon={Copy}      onClick={() => { copySelected(); setMenuOpen(false) }}>Copy</MenuItem>
              <MenuItem icon={Clipboard} onClick={() => { paste();        setMenuOpen(false) }}>Paste</MenuItem>
            </MenuGroup>

            <MenuGroup label="View">
              <MenuRow label="Grid">
                <Switch on={showGrid} onClick={toggleGrid} label="Toggle grid" />
              </MenuRow>
              <MenuRow label="Rulers">
                <Switch on={showRulers} onClick={toggleRulers} label="Toggle rulers" />
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
                  <Seg onClick={() => doZoom(0.85)} title="Zoom out"><ZoomOut size={13} strokeWidth={1.6} absoluteStrokeWidth/></Seg>
                  <Seg onClick={() => setViewport(1, 80, 80)} title="Reset zoom" wide>{Math.round(zoom * 100)}%</Seg>
                  <Seg onClick={() => doZoom(1.18)} title="Zoom in"><ZoomIn size={13} strokeWidth={1.6} absoluteStrokeWidth/></Seg>
                </SegGroup>
              </MenuRow>
            </MenuGroup>

            <MenuGroup label="Standards">
              {/* The rules table the generator, capacity math and column check
                  all read. Lives here rather than in the right rail because it
                  is dealer configuration, not per-drawing state. */}
              <MenuItem icon={SlidersHorizontal}
                onClick={() => { setRulesOpen(true); setMenuOpen(false) }}>
                Rules profiles…
              </MenuItem>
            </MenuGroup>

            <MenuGroup label="Renderer">
              {/* Migration flag: mounts the Konva Stage alongside the SVG
                  canvas. Off is today's renderer, unchanged. */}
              <MenuRow label="Konva canvas (beta)">
                <Switch on={konvaOn} onClick={() => setKonvaEnabled(!konvaOn)}
                  label="Toggle Konva renderer" />
              </MenuRow>
            </MenuGroup>

            <MenuGroup label="Appearance">
              <MenuRow label="Theme">
                <SegGroup>
                  {[
                    /* Trace is the app's default skin (App.jsx), so it has to be
                       reachable — without it the switcher is a one-way door. */
                    { id:'trace',     label:'Trace',     dot1:'#ECEAE1', dot2:'#14392B' },
                    { id:'obsidian',  label:'Dark',      dot1:'#161b22', dot2:'#f97316' },
                    { id:'studio',    label:'Light',     dot1:'#ECEAE5', dot2:'#388BFD' },
                    { id:'blueprint', label:'Blueprint', dot1:'#0d1829', dot2:'#38bdf8' },
                  ].map(t => (
                    <Seg key={t.id} active={uiTheme===t.id} onClick={() => setUiTheme(t.id)} title={t.label}>
                      {/* Swatches stay literal — they preview a theme, so they
                          must not follow the active one. The neutral-grey ring
                          reads against both the light track and the ink pill,
                          which otherwise swallows a dark swatch whole. */}
                      <span style={{ display:'flex', gap:2 }}>
                        <span style={{ width:7, height:7, borderRadius:2, background:t.dot1, boxShadow:'0 0 0 1px rgba(128,128,128,0.45)' }}/>
                        <span style={{ width:7, height:7, borderRadius:2, background:t.dot2, boxShadow:'0 0 0 1px rgba(128,128,128,0.45)' }}/>
                      </span>
                    </Seg>
                  ))}
                </SegGroup>
              </MenuRow>
              <MenuRow label="Interface size">
                <SegGroup>
                  {[['sm','S'],['md','M'],['lg','L']].map(([val,lbl]) => (
                    <Seg key={val} active={uiScale===val} onClick={() => setUiScale(val)}>{lbl}</Seg>
                  ))}
                </SegGroup>
              </MenuRow>
            </MenuGroup>

          </div>
        )}
      </div>

      {rulesOpen && <RulesPanel onClose={() => setRulesOpen(false)} />}

    </div>
  )
}
