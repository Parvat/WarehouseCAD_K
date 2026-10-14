import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'
import { ElevationsPanel } from './ElevationsPanel'
import { useState } from 'react'
import { useRightPanel, setRightPanel, panelWidth, ELEV_MIN, elevMax } from '../../utils/rightPanel'

const tabStyle = (on) => ({
  flex: 1, padding: '9px 0 8px', border: 'none', borderBottom: `2px solid ${on ? 'var(--text)' : 'transparent'}`, background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: on ? 'var(--text)' : 'var(--text3)',
})

/* One right panel, two tabs — Properties (the selection, Check layout, the column check, groups, colour, layers, text,
   labels) and Elevations (the types, the drawing, its settings) — the tab remembered per browser. The Elevations tab
   widens the panel (utils/rightPanel.js): drag its left edge, the width remembered; Properties keeps the normal width. */
export function RightPanel() {
  const rp = useRightPanel(), tab = rp.tab
  const [drag, setDrag] = useState(false)
  /* the edge: drag to resize (rAF-coalesced; no transition while dragging, or the edge lags the pointer) */
  const startResize = (e) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = rp.elevW
    let raf = 0, v = w0
    setDrag(true)
    const move = (ev) => { v = Math.max(ELEV_MIN, Math.min(elevMax(), w0 - (ev.clientX - x0))); if (!raf) raf = requestAnimationFrame(() => { raf = 0; useRightPanel.setState({ elevW: v }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (raf) cancelAnimationFrame(raf); setRightPanel({ elevW: v }); setDrag(false) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div style={{
      width:panelWidth(rp), flexShrink:0, position:'relative',
      background:'var(--surface)', borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      transition: drag ? 'none' : 'width .2s cubic-bezier(.4,0,.2,1)',
    }}>
      {tab === 'elevations' && (
        <div role="separator" aria-orientation="vertical" aria-label="Resize right panel" onPointerDown={startResize}
          style={{ position:'absolute', top:0, bottom:0, left:-6, width:12, cursor:'col-resize', zIndex:5, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:3, height:40, borderRadius:2, background: drag ? 'var(--text2)' : 'var(--border)' }} />
        </div>
      )}
      <div role="tablist" aria-label="Right panel" style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <button type="button" role="tab" aria-selected={tab === 'properties'} style={tabStyle(tab === 'properties')} onClick={() => setRightPanel({ tab: 'properties' })}>Properties</button>
        <button type="button" role="tab" aria-selected={tab === 'elevations'} style={tabStyle(tab === 'elevations')} onClick={() => setRightPanel({ tab: 'elevations' })}>Elevations</button>
      </div>
      <div role="tabpanel" style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column' }}>
        {tab === 'properties' ? <>
          <LayoutCheckPanel />
          <PropertiesPanel />
          <ColumnCheckPanel />
          <GroupPanel />
          <ColorPanel />
          <LayerPanel />
          <TextPanel />
          <LabelsPanel />
        </> : <ElevationsPanel />}
      </div>
    </div>
  )
}
