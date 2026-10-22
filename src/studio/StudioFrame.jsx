import { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutCheck, runLayoutCheck, checkLabel, exportWithCheck } from '../utils/layoutCheck'
import { ExportCheckDialog } from '../components/RightPanel/LayoutCheckPanel'
import { RulesPanel } from '../components/Rules/RulesPanel'
import { LayoutMenu, doZoom } from '../components/Toolbar/TopBar'
import { RightPanelTabs } from '../components/RightPanel/index'
import { GeneratePanel } from '../components/Generate/GeneratePanel'
import { useRightPanel, setRightPanel } from '../utils/rightPanel'
import { useColumnCheck } from '../generate/useColumnCheck'
import { useElevView, setShowColors } from '../utils/elevationDraw'
import { useViewPrefs, fitRef } from './viewPrefs'
import { Icon } from './Icon'

/* The Studio frame (STUDIO.md §1; every value from design/studio/Studio.dc.html, screen C1): the canvas fills the
   window and these islands float on it — top-left (logo, project name ▾, Auto-saved), top-right (undo, redo,
   Generate / Regenerate, Check with its count chip, Export), the right card (300 wide, top 76, as tall as its content
   down to 76px above the bottom, then it scrolls inside; Properties / Elevations, or Generate), bottom-left (Hub,
   zoom) and bottom-right (Aisles, Checks, Elevations, Fit). The rail, its flyout and the tool pill are the library's
   (components/LeftPanel/FloatingToolbar.jsx, studio mode). */

const RACK = /^rack_/

/* a transparent island button: 32 (top bar) or 30 (bottom bars) square or padded, radius 6 */
const ghost = (extra) => ({ border: 0, borderRadius: 6, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', ...extra })

function TopLeft({ onHub }) {
  const name = useCanvasStore(s => s.currentFilename)
  const [menu, setMenu] = useState(false)
  const [rules, setRules] = useState(false)
  const wrap = useRef(null)
  useEffect(() => {
    if (!menu) return
    const down = (e) => { if (!wrap.current?.contains(e.target)) setMenu(false) }
    const key = (e) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [menu])
  return (
    <div ref={wrap}>
      <div className="st-island" data-island="top-left" style={{ left: 16, top: 16, height: 44, gap: 10, padding: '0 12px 0 14px' }}>
        <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0l6 6-6 6-6-6z" fill="#7BD3A4" /></svg>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Trace</span>
        <span style={{ width: 1, height: 18, background: '#3A403C' }} />
        <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="Layout menu" onClick={() => setMenu(m => !m)}
          style={ghost({ height: 30, gap: 6, padding: '0 8px', fontSize: 13, color: '#E8EAE6' })}>
          {name || 'Untitled layout'}<Icon name="Chevron" size={12} color="#9AA29C" />
        </button>
        <span style={{ height: 22, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 6, background: '#2A2F2C', color: '#9AA29C', fontSize: 12 }}>Auto-saved</span>
      </div>
      {menu && <LayoutMenu style={{ left: 120, top: 66 }} onClose={() => setMenu(false)} onRules={() => setRules(true)} onHub={onHub} />}
      {rules && <RulesPanel onClose={() => setRules(false)} />}
    </div>
  )
}

/* Check's count: errors in the mockup's chip colours, warnings in the warning level's; none when clean */
function CheckChip() {
  const result = useLayoutCheck(s => s.result)
  const e = result ? result.errors.length : 0, w = result ? result.warnings.length : 0
  if (!e && !w) return null
  const c = e ? { bg: '#5A2A20', fg: '#FFB4A3', n: e } : { bg: '#3A2E17', fg: '#F2C77A', n: w }
  return <span data-check-chip={e ? 'error' : 'warning'} style={{ height: 18, padding: '0 6px', borderRadius: 9, background: c.bg, color: c.fg, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, display: 'flex', alignItems: 'center' }}>{c.n}</span>
}

function TopRight() {
  const { undo, redo, exportAsPDF, hasRacks } = useCanvasStore(useShallow(s => ({ undo: s.undo, redo: s.redo, exportAsPDF: s.exportAsPDF, hasRacks: s.objects.some(o => RACK.test(o.type || '')) })))
  const result = useLayoutCheck(s => s.result)
  const card = useViewPrefs(s => s.card)
  /* STUDIO.md §7: "Generate" on an empty plan, "Regenerate" when racks exist */
  const genLabel = hasRacks ? 'Regenerate' : 'Generate'
  const check = () => { useViewPrefs.getState().setCard('tabs'); setRightPanel({ tab: 'properties' }); runLayoutCheck(useCanvasStore) }
  return (
    <div className="st-island" data-island="top-right" style={{ right: 16, top: 16, height: 44, gap: 4, padding: '0 6px' }}>
      <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={undo} style={ghost({ width: 32, height: 32 })}><Icon name="Undo" /></button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" onClick={redo} style={ghost({ width: 32, height: 32 })}><Icon name="Redo" /></button>
      <span style={{ width: 1, height: 18, background: '#3A403C', margin: '0 4px' }} />
      <button type="button" aria-label={genLabel} aria-pressed={card === 'generate'} onClick={() => useViewPrefs.getState().setCard(card === 'generate' ? 'tabs' : 'generate')}
        style={ghost({ height: 32, padding: '0 10px', fontSize: 13, color: '#E8EAE6', gap: 6 })}>
        <Icon name="Generate" active />{genLabel}
      </button>
      <button type="button" aria-label={checkLabel(result)} title="List every problem in the layout — nothing is changed" onClick={check}
        style={ghost({ height: 32, padding: '0 10px', fontSize: 13, color: '#E8EAE6', gap: 8 })}>
        Check<CheckChip />
      </button>
      <ExportCheckDialog onExport={exportAsPDF} />
      <button type="button" className="st-primary" title="Export PDF" onClick={() => exportWithCheck(useCanvasStore, exportAsPDF)}
        style={{ height: 32, padding: '0 14px', border: 0, borderRadius: 6, background: '#7BD3A4', color: '#0F2A1F', fontSize: 13, fontWeight: 600 }}>Export</button>
    </div>
  )
}

/* The right card: Properties / Elevations (the existing panels, restyled in later steps), or Generate. */
function RightCard() {
  const card = useViewPrefs(s => s.card)
  const tab = useRightPanel(s => s.tab)
  const seg = (on) => ({ flex: 1, height: 28, border: 0, borderRadius: 6, background: on ? '#3A403C' : 'transparent', fontSize: 13, fontWeight: on ? 500 : 400, color: on ? '#F2F4F1' : '#9AA29C' })
  /* the Elevations tab lays its drawing out against a fixed height: the card takes its full height there */
  const full = card === 'tabs' && tab === 'elevations'
  return (
    <div className="st-island" aria-label="Right panel" data-island="right-card" style={{
      right: 16, top: 76, width: 300, maxHeight: 'calc(100vh - 152px)', height: full ? 'calc(100vh - 152px)' : undefined,
      flexDirection: 'column', alignItems: 'stretch', overflow: 'hidden',
    }}>
      {card === 'generate'
        ? <div data-card-body style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--surface)', color: 'var(--text)' }}>
            <GeneratePanel embedded onClose={() => useViewPrefs.getState().setCard('tabs')} />
          </div>
        : <>
            <div style={{ padding: 8, flexShrink: 0 }}>
              <div role="tablist" aria-label="Right panel tabs" style={{ display: 'flex', padding: 3, borderRadius: 8, background: '#2A2F2C' }}>
                <button type="button" role="tab" aria-selected={tab === 'properties'} style={seg(tab === 'properties')} onClick={() => setRightPanel({ tab: 'properties' })}>Properties</button>
                <button type="button" role="tab" aria-selected={tab === 'elevations'} style={seg(tab === 'elevations')} onClick={() => setRightPanel({ tab: 'elevations' })}>Elevations</button>
              </div>
            </div>
            {/* the existing content, as it was (its own restyle is a later step): its light ground keeps it legible */}
            <div data-card-body style={{ flex: full ? 1 : '0 1 auto', minHeight: 0, overflowY: full ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--text)' }}>
              <RightPanelTabs tab={tab} />
            </div>
          </>}
    </div>
  )
}

function BottomLeft({ onHub }) {
  const zoom = useCanvasStore(s => s.zoom)
  return (
    <div className="st-island" data-island="bottom-left" style={{ left: 16, bottom: 20, height: 40, gap: 2, padding: '0 4px' }}>
      <button type="button" title="Back to hub" onClick={onHub} style={ghost({ height: 30, padding: '0 10px', fontSize: 13, color: '#C9CEC9' })}>Hub</button>
      <span style={{ width: 1, height: 18, background: '#3A403C' }} />
      <button type="button" aria-label="Zoom out" onClick={() => doZoom(0.85)} style={ghost({ width: 30, height: 30, color: '#C9CEC9', fontSize: 16 })}>−</button>
      <span aria-label="Zoom" style={{ width: 44, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8EAE6' }}>{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => doZoom(1.18)} style={ghost({ width: 30, height: 30, color: '#C9CEC9', fontSize: 16 })}>+</button>
    </div>
  )
}

function BottomRight() {
  const showAisles = useCanvasStore(s => s.showAisles ?? true)
  const toggleAisles = useCanvasStore(s => s.toggleAisles)
  const { showMarks, setShowMarks } = useColumnCheck()
  const showColors = useElevView(s => s.showColors)
  const tog = (on) => ({ height: 30, padding: '0 10px', border: 0, borderRadius: 6, background: on ? '#2E4A3C' : 'transparent', color: on ? '#7BD3A4' : '#C9CEC9', fontSize: 12 })
  return (
    <div className="st-island" data-island="bottom-right" style={{ right: 16, bottom: 20, height: 40, gap: 2, padding: '0 4px' }}>
      <button type="button" aria-label="Aisle labels" aria-pressed={showAisles} onClick={toggleAisles} style={tog(showAisles)}>Aisles</button>
      <button type="button" aria-label="Checks" aria-pressed={showMarks} onClick={() => setShowMarks(!showMarks)} style={tog(showMarks)}>Checks</button>
      <button type="button" aria-label="Elevation colours" aria-pressed={showColors} onClick={() => setShowColors(!showColors)} style={tog(showColors)}>Elevations</button>
      <button type="button" aria-label="Fit" title="Fit to content" onClick={() => fitRef.current?.()} style={ghost({ width: 30, height: 30 })}><Icon name="Full screen" /></button>
    </div>
  )
}

export function StudioFrame({ onHub }) {
  return (
    <>
      <TopLeft onHub={onHub} />
      <TopRight />
      <RightCard />
      <BottomLeft onHub={onHub} />
      <BottomRight />
    </>
  )
}
