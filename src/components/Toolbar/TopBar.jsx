import { useState, useRef, useEffect } from 'react'
/* Grid3X3 / Ruler / Magnet left with the icon toggles they labelled — those
   three are switches in the settings menu now, named in words. */
import { Scissors, Copy, Clipboard, Undo2, Redo2, ZoomIn, ZoomOut,
         Save, FolderOpen, FilePlus, FileDown, MoreHorizontal, SlidersHorizontal, ClipboardCheck } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { UNITS } from '../../constants'
import { RulesPanel } from '../Rules/RulesPanel'
import { getCanvasContainerSize } from '../../utils/canvasContainer'
import { nanoid } from 'nanoid'
import { pasteAt } from '../../utils/pasteAt'
import { useLabelPrefs } from '../../canvas2/labelPrefs'
import { useLayoutCheck, runLayoutCheck, checkLabel, exportWithCheck } from '../../utils/layoutCheck'
import { ExportCheckDialog } from '../RightPanel/LayoutCheckPanel'
import { GeneratePanel } from '../Generate/GeneratePanel'
import { LABEL_SIZES, LABEL_SIZE_NAMES } from '../../render/labelSize'

/* The top bar (theme-p2): fixed 48px; every button in it 32px — the ghost icon buttons (undo, redo, the menu), the
   secondaries (Generate, Check layout) and the one primary (Export). 8px steps, 16px from each edge. */
export const TOP_BAR_H = 48
const ICON = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true }

/* Quiet icon button — the only shape that stays in the always-visible bar. */
function IBtn({ icon: Icon, label, onClick, active, title, menu }) {
  return (
    <button type="button" onClick={onClick} title={title || label} aria-label={title || label} className="t-icon"
      {...(menu ? { 'aria-haspopup': 'menu', 'aria-expanded': !!active } : null)}>
      <Icon {...ICON}/>
    </button>
  )
}

/* ── settings-menu primitives ──────────────────────────────────────────────
   Everything that used to crowd the bar lives in here. Rows are label-left /
   control-right so the menu reads as one column, not a second toolbar. */

function MenuGroup({ label, children, first }) {
  return (
    <div role="group" aria-label={label} style={{
      padding:'12px 8px',
      borderTop: first ? 'none' : '1px solid var(--line)',
    }}>
      <div className="t-cap" style={{ padding:'0 8px', marginBottom:8 }}>{label}</div>
      {children}
    </div>
  )
}

/* A full-width action: icon + name on the left, shortcut hint on the right. */
function MenuItem({ icon: Icon, children, onClick, hint }) {
  return (
    <button onClick={onClick} role="menuitem" tabIndex={-1}
      style={{
        display:'flex', alignItems:'center', gap:8, width:'100%', height:32,
        padding:'0 8px', borderRadius:2, border:'none', background:'transparent',
        cursor:'pointer', textAlign:'left',
        fontFamily:'var(--font-ui)', fontSize:13, fontWeight:500, color:'var(--ink)',
        transition:'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <Icon {...ICON} style={{ color:'var(--ink-2)', flexShrink:0 }}/>
      <span style={{ flex:1 }}>{children}</span>
      {hint && <span style={{ fontSize:11, color:'var(--steel)', fontFamily:'var(--font-ui)' }}>{hint}</span>}
    </button>
  )
}

/* Label-left / control-right row. */
function MenuRow({ label, children }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      gap:8, padding:'4px 8px', minHeight:40,
    }}>
      <span style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>{children}</div>
    </div>
  )
}

/* One segment of a segmented control — the chosen one pine. Words in PJS, figures in mono. */
function Seg({ active, onClick, title, children, wide, mono }) {
  return (
    <button onClick={onClick} title={title} tabIndex={-1} aria-label={title}
      {...(active === undefined ? { role: 'menuitem' } : { role: 'menuitemradio', 'aria-checked': !!active })}
      style={{
        minWidth: wide ? undefined : 32, height:30, padding: wide ? '0 8px' : '0 4px',
        display:'flex', alignItems:'center', justifyContent:'center', gap:4,
        borderRadius:0, cursor:'pointer', border:'none',
        background: active ? 'var(--pine)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--ink-2)',
        fontSize:12, fontWeight:600, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
        transition:'background 0.12s, color 0.12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      {children}
    </button>
  )
}

/* The segmented control's frame: one 32px box, a 1px line, radius 2. */
function SegGroup({ children }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', height:32, overflow:'hidden',
      background:'var(--paper)', border:'1px solid var(--line)', borderRadius:2,
    }}>{children}</div>
  )
}

function Switch({ on, onClick, label }) {
  return (
    <button onClick={onClick} role="menuitemcheckbox" aria-checked={on} aria-label={label} tabIndex={-1}
      style={{
        position:'relative', width:32, height:18, borderRadius:2, border:'none',
        cursor:'pointer', flexShrink:0, padding:0,
        background: on ? 'var(--pine)' : 'var(--line-2)',
        transition:'background 0.16s',
      }}>
      <span style={{
        position:'absolute', top:3, left: on ? 17 : 3, width:12, height:12,
        borderRadius:1, background:'var(--paper)',
        transition:'left 0.16s',
      }}/>
    </button>
  )
}

const selectSt = { height:32, padding:'0 8px', borderRadius:2, border:'1px solid var(--line)', background:'var(--paper)', color:'var(--ink)', fontSize:12, fontFamily:'var(--font-ui)', cursor:'pointer' }

function doZoom(factor) {
  const s = useCanvasStore.getState()
  const { w, h } = getCanvasContainerSize({ w: 1200, h: 800 })
  const cx = w / 2
  const cy = h / 2
  const nz = Math.max(0.01, Math.min(20, s.zoom * factor))
  s.setViewport(nz, cx - (cx - s.panX) * (nz / s.zoom), cy - (cy - s.panY) * (nz / s.zoom))
}

/* "Check layout": runs the check again every press. A secondary button that stays secondary (A8) — the count
   rides in a small chip: flag for errors, amber for warnings, none when clean. The full label is its name. */
function CheckLayoutButton() {
  const result = useLayoutCheck(s => s.result)
  const errors = result ? result.errors.length : 0
  const warnings = result ? result.warnings.length : 0
  const label = checkLabel(result)
  const chip = errors ? { n: errors, bg: 'var(--flag)', fg: 'var(--paper)' } : warnings ? { n: warnings, bg: 'var(--warn-bg)', fg: 'var(--warn-fg)', bd: 'var(--warn-bd)' } : null
  return (
    <button type="button" aria-label={label} title="List every problem in the layout — nothing is changed"
      onClick={() => runLayoutCheck(useCanvasStore)} className="t-btn t-btn--secondary">
      <ClipboardCheck {...ICON}/>
      Check layout
      {chip && (
        <span data-check-chip={errors ? 'error' : 'warning'} className="t-num" style={{
          minWidth:20, height:18, padding:'0 4px', borderRadius:2, display:'inline-flex', alignItems:'center', justifyContent:'center',
          background:chip.bg, color:chip.fg, border: chip.bd ? `1px solid ${chip.bd}` : 'none', fontSize:11, fontWeight:500,
        }}>{chip.n}</span>
      )}
    </button>
  )
}

export function TopBar() {
  const { labelSize, setLabelSize, pdfLabelSize, setPdfLabelSize } = useLabelPrefs()
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
  } = useCanvasStore(useShallow(s => ({ undo: s.undo, redo: s.redo, copySelected: s.copySelected, paste: s.paste, cutSelected: s.cutSelected, zoom: s.zoom, setViewport: s.setViewport, unit: s.unit, setUnit: s.setUnit, showGrid: s.showGrid, toggleGrid: s.toggleGrid, showRulers: s.showRulers, toggleRulers: s.toggleRulers, snapToGrid: s.snapToGrid, toggleSnap: s.toggleSnap, snapUnit: s.snapUnit, setSnapUnit: s.setSnapUnit, uiTheme: s.uiTheme, setUiTheme: s.setUiTheme, uiScale: s.uiScale, setUiScale: s.setUiScale, saveToFile: s.saveToFile, loadFromFile: s.loadFromFile, newScene: s.newScene, exportAsPDF: s.exportAsPDF, currentFilename: s.currentFilename, hasUnsavedChanges: s.hasUnsavedChanges })))

  /* Menu open/closed is presentation state — component-local, never the store. */
  const [menuOpen, setMenuOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const menuRef = useRef(null)
  const menuBox = useRef(null)
  const menuItems = () => [...(menuBox.current?.querySelectorAll('[role^="menuitem"], select') || [])]
  useEffect(() => { if (menuOpen) menuItems()[0]?.focus() }, [menuOpen])
  const onMenuKey = e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    if (e.target.tagName === 'SELECT' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return
    const items = menuItems()
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[n].focus()
  }

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
    <div data-float-avoid style={{
      height:TOP_BAR_H, background:'var(--surface)', borderBottom:'1px solid var(--line)',
      display:'flex', alignItems:'center', padding:'0 16px', gap:8,
      flexShrink:0, zIndex:50, position:'relative',
    }}>

      {/* Wordmark — the same mark the Hub and Login wear, so the app reads as
          one product across its shells. */}
      <div style={{
        display:'inline-flex', alignItems:'center', gap:8, flexShrink:0,
        fontFamily:'var(--font-display)', fontWeight:600, fontSize:18,
        color:'var(--pine)', userSelect:'none',
      }}>
        <span style={{
          width:8, height:8, background:'currentColor', borderRadius:1,
          transform:'rotate(45deg)', display:'inline-block',
        }}/>
        Trace
      </div>

      {/* Project name */}
      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, marginLeft:8 }}>
        <span style={{ color:'var(--line-2)', fontSize:15, userSelect:'none' }}>/</span>
        <span style={{
          fontSize:13, fontWeight:500, color:'var(--ink-2)',
          maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>
          {currentFilename || 'Untitled layout'}
        </span>
        {hasUnsavedChanges && (
          <div title="Unsaved changes"
            style={{ width:6, height:6, borderRadius:'50%', background:'var(--pine)', flexShrink:0 }}/>
        )}
      </div>

      <div style={{ flex:1 }} />

      {/* History stays in the bar: CLAUDE.md gives the top bar ownership of undo
          /redo, and the left panel's footer dropped its copies on that basis. */}
      <div style={{ display:'flex', alignItems:'center', gap:0 }}>
        <IBtn icon={Undo2} label="Undo" onClick={undo} title="Undo (Ctrl+Z)" />
        <IBtn icon={Redo2} label="Redo" onClick={redo} title="Redo (Ctrl+Y)" />
      </div>

      {/* Generate: the button and the panel it opens under itself (components/Generate/GeneratePanel.jsx) */}
      <GeneratePanel />

      {/* Check layout: every problem listed in the right panel (utils/layoutCheck.js); the count shows here */}
      <CheckLayoutButton />

      {/* Export — the one primary action; with errors in the layout it asks first, never blocks */}
      <ExportCheckDialog onExport={exportAsPDF} />
      <button type="button" onClick={() => exportWithCheck(useCanvasStore, exportAsPDF)} title="Export PDF" className="t-btn t-btn--primary">
        <FileDown {...ICON}/>
        Export
      </button>

      {/* Everything else — file, edit, view, appearance — lives behind this. */}
      <div ref={menuRef} style={{ position:'relative', flexShrink:0 }}>
        <IBtn icon={MoreHorizontal} label="Settings" menu
          onClick={() => setMenuOpen(o => !o)} active={menuOpen}
          title="Settings and more" />

        {menuOpen && (
          <div role="menu" aria-label="Settings and more" ref={menuBox} onKeyDown={onMenuKey} className="t-float" style={{
            position:'absolute', top:'calc(100% + 16px)', right:0, width:296, zIndex:100,
            maxHeight:'calc(100vh - 72px)', overflowY:'auto',
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
              <MenuItem icon={Clipboard} onClick={() => { pasteAt(useCanvasStore, 'cursor', nanoid); setMenuOpen(false) }} hint="Ctrl+V">Paste</MenuItem>
              <MenuItem icon={Clipboard} onClick={() => { pasteAt(useCanvasStore, 'inPlace', nanoid); setMenuOpen(false) }} hint="Ctrl+Shift+V">Paste in place</MenuItem>
            </MenuGroup>

            <MenuGroup label="View">
              <MenuRow label="Grid">
                <Switch on={showGrid} onClick={toggleGrid} label="Toggle grid" />
              </MenuRow>
              <MenuRow label="Rulers">
                <Switch on={showRulers} onClick={toggleRulers} label="Toggle rulers" />
              </MenuRow>
              <MenuRow label="Label size">
                <SegGroup>
                  {[['small','S'],['medium','M'],['large','L'],['xlarge','XL']].map(([val,lbl]) => (
                    <Seg key={val} active={labelSize===val} onClick={() => setLabelSize(val)} title={`${LABEL_SIZE_NAMES[val]} — ${LABEL_SIZES[val]} in text`}>{lbl}</Seg>
                  ))}
                </SegGroup>
              </MenuRow>
              <MenuRow label="PDF label size">
                <select value={pdfLabelSize} onChange={e => setPdfLabelSize(e.target.value)} aria-label="PDF label size" style={{ ...selectSt, maxWidth:140 }}>
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
                    <Seg key={val} mono active={snapUnit===val} onClick={() => setSnapUnit(val)}>{lbl}</Seg>
                  ))}
                </SegGroup>
              </MenuRow>
              <MenuRow label="Units">
                <select value={unit} onChange={e => setUnit(e.target.value)} style={selectSt}>
                  {Object.values(UNITS).map(u => <option key={u}>{u}</option>)}
                </select>
              </MenuRow>
              <MenuRow label="Zoom">
                <SegGroup>
                  <Seg onClick={() => doZoom(0.85)} title="Zoom out"><ZoomOut {...ICON}/></Seg>
                  <Seg mono onClick={() => setViewport(1, 80, 80)} title="Reset zoom" wide>{Math.round(zoom * 100)}%</Seg>
                  <Seg onClick={() => doZoom(1.18)} title="Zoom in"><ZoomIn {...ICON}/></Seg>
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

            <MenuGroup label="Appearance">
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
