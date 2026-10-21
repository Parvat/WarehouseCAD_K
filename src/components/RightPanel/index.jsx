import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'
import { ElevationsTab }   from '../Elevations/ElevationsTab'
import { useState } from 'react'
import { setRightPanel, setPanelWidth, resetPanelWidth, useRightPanelWidth, PANEL_HEAD_H, RP_MIN, RP_MAX } from '../../utils/rightPanel'

/* Tab headings: Oswald 13, tracked .08em; the active one ink with a 2px pine rule on the shared 1px line. */
const tabStyle = (on) => ({
  flex: 1, height: '100%', padding: 0, border: 'none', borderBottom: `2px solid ${on ? 'var(--pine)' : 'transparent'}`, marginBottom: -1,
  background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? 'var(--ink)' : 'var(--steel)',
})

/* One right panel, two tabs — Properties (the selection, Check layout, the column check, groups, colour, layers, text,
   labels; a rack's elevation as one read-only line) and Elevations (the drawing and the elevation chips,
   components/Elevations/ElevationsTab.jsx) — the tab remembered per browser. Drag the canvas-side edge to resize
   it (RP_MIN–RP_MAX); each tab keeps its own width, double-click the edge for the tab's default (utils/rightPanel.js).
   Its header row is PANEL_HEAD_H, the same as the left panel's, on the same 1px line. It never scrolls sideways:
   every row inside fits the width. */
export function RightPanel() {
  const { width, tab } = useRightPanelWidth()
  const [drag, setDrag] = useState(false)
  const [hover, setHover] = useState(false)
  /* the edge: rAF-coalesced while dragging (no width transition then, or the edge lags the pointer); written once on release */
  const startResize = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX, w0 = width
    let raf = 0, v = w0
    setDrag(true)
    const move = (ev) => { v = w0 - (ev.clientX - x0); if (!raf) raf = requestAnimationFrame(() => { raf = 0; setPanelWidth(v, { persist: false }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (raf) cancelAnimationFrame(raf); setPanelWidth(v); setDrag(false) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div aria-label="Right panel" style={{
      width, flexShrink:0, position:'relative', minWidth:0,
      background:'var(--surface)', borderLeft:'1px solid var(--line)',
      display:'flex', flexDirection:'column',
      transition: drag ? 'none' : 'width .2s cubic-bezier(.4,0,.2,1)',
    }}>
      {/* a 3px pill you can see in a 12px strip you can hit, on the canvas-side line; under the tabs, so the header row
          and its line stay as they are */}
      <div role="separator" aria-orientation="vertical" aria-label="Resize right panel"
        aria-valuemin={RP_MIN} aria-valuemax={RP_MAX} aria-valuenow={width} title="Drag to resize · double-click to reset"
        onPointerDown={startResize} onDoubleClick={resetPanelWidth}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ position:'absolute', top:PANEL_HEAD_H, bottom:0, left:-7, width:12, zIndex:5, cursor:'col-resize', touchAction:'none',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ width:3, height:40, borderRadius:2, background: drag ? 'var(--ink-2)' : 'var(--line-2)', opacity: drag || hover ? 1 : 0, transition:'opacity .12s' }} />
      </div>
      <div role="tablist" aria-label="Right panel tabs" style={{ display:'flex', height:PANEL_HEAD_H, borderBottom:'1px solid var(--line)', flexShrink:0 }}>
        <button type="button" role="tab" aria-selected={tab === 'properties'} style={tabStyle(tab === 'properties')} onClick={() => setRightPanel({ tab: 'properties' })}>Properties</button>
        <button type="button" role="tab" aria-selected={tab === 'elevations'} style={tabStyle(tab === 'elevations')} onClick={() => setRightPanel({ tab: 'elevations' })}>Elevations</button>
      </div>
      {tab === 'properties'
        ? <div role="tabpanel" style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', display:'flex', flexDirection:'column' }}>
            <LayoutCheckPanel />
            <PropertiesPanel />
            <ColumnCheckPanel />
            <GroupPanel />
            <ColorPanel />
            <LayerPanel />
            <TextPanel />
            <LabelsPanel />
          </div>
        : <div role="tabpanel" style={{ flex:1, minHeight:0, minWidth:0, overflowX:'hidden', display:'flex', flexDirection:'column' }}><ElevationsTab /></div>}
    </div>
  )
}
