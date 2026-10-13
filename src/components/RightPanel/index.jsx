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

const TAB_KEY = 'trace.rightpanel.v1'
const readTab = () => { try { return localStorage.getItem(TAB_KEY) === 'elevations' ? 'elevations' : 'properties' } catch { return 'properties' } }
const tabStyle = (on) => ({
  flex: 1, padding: '9px 0 8px', border: 'none', borderBottom: `2px solid ${on ? 'var(--text)' : 'transparent'}`, background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: on ? 'var(--text)' : 'var(--text3)',
})

/* One right panel, two tabs — Properties (the selection, Check layout, the column check, groups, colour, layers, text,
   labels) and Elevations (the types) — the tab remembered per browser. */
export function RightPanel() {
  const [tab, setTab] = useState(readTab)
  const pick = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* private window */ } }
  return (
    <div style={{
      width:272, flexShrink:0,
      background:'var(--surface)', borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
    }}>
      <div role="tablist" aria-label="Right panel" style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <button type="button" role="tab" aria-selected={tab === 'properties'} style={tabStyle(tab === 'properties')} onClick={() => pick('properties')}>Properties</button>
        <button type="button" role="tab" aria-selected={tab === 'elevations'} style={tabStyle(tab === 'elevations')} onClick={() => pick('elevations')}>Elevations</button>
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