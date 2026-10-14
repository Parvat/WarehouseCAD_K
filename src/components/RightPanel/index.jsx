import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'
import { useState } from 'react'
import { useRightPanel, setRightPanel, useRightPanelWidth, ELEV_MIN, elevMax } from '../../utils/rightPanel'

/* One right panel: the selection's properties, Check layout, the column check, groups, colour, layers, text, labels.
   A rack's elevation lives in its Properties (components/Elevations/ElevationSection.jsx), so while a rack is
   selected the panel widens (utils/rightPanel.js): drag its left edge, the width remembered; otherwise the normal
   width. */
export function RightPanel() {
  const { width, wide, elevW } = useRightPanelWidth()
  const [drag, setDrag] = useState(false)
  /* the edge: drag to resize (rAF-coalesced; no transition while dragging, or the edge lags the pointer) */
  const startResize = (e) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = elevW
    let raf = 0, v = w0
    setDrag(true)
    const move = (ev) => { v = Math.max(ELEV_MIN, Math.min(elevMax(), w0 - (ev.clientX - x0))); if (!raf) raf = requestAnimationFrame(() => { raf = 0; useRightPanel.setState({ elevW: v }) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (raf) cancelAnimationFrame(raf); setRightPanel({ elevW: v }); setDrag(false) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div aria-label="Right panel" style={{
      width, flexShrink:0, position:'relative',
      background:'var(--surface)', borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      transition: drag ? 'none' : 'width .2s cubic-bezier(.4,0,.2,1)',
    }}>
      {wide && (
        <div role="separator" aria-orientation="vertical" aria-label="Resize right panel" onPointerDown={startResize}
          style={{ position:'absolute', top:0, bottom:0, left:-6, width:12, cursor:'col-resize', zIndex:5, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:3, height:40, borderRadius:2, background: drag ? 'var(--text2)' : 'var(--border)' }} />
        </div>
      )}
      <div style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <LayoutCheckPanel />
        <PropertiesPanel />
        <ColumnCheckPanel />
        <GroupPanel />
        <ColorPanel />
        <LayerPanel />
        <TextPanel />
        <LabelsPanel />
      </div>
    </div>
  )
}
