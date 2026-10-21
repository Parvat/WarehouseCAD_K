import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'
import { ElevationsTab }   from '../Elevations/ElevationsTab'
import { setRightPanel, useRightPanelWidth, PANEL_HEAD_H } from '../../utils/rightPanel'

/* Tab headings: Oswald 13, tracked .08em; the active one ink with a 2px pine rule on the shared 1px line. */
const tabStyle = (on) => ({
  flex: 1, height: '100%', padding: 0, border: 'none', borderBottom: `2px solid ${on ? 'var(--pine)' : 'transparent'}`, marginBottom: -1,
  background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? 'var(--ink)' : 'var(--steel)',
})

/* One right panel, two tabs — Properties (the selection, Check layout, the column check, groups, colour, layers, text,
   labels; a rack's elevation as one read-only line) and Elevations (the drawing and the elevation chips,
   components/Elevations/ElevationsTab.jsx) — the tab remembered per browser. The panel is fixed at RP_W on both tabs
   (utils/rightPanel.js); its header row is PANEL_HEAD_H, the same as the left panel's, on the same 1px line. It
   never scrolls sideways: every row inside fits the width. */
export function RightPanel() {
  const { width, tab } = useRightPanelWidth()
  return (
    <div aria-label="Right panel" style={{
      width, flexShrink:0, position:'relative', minWidth:0,
      background:'var(--surface)', borderLeft:'1px solid var(--line)',
      display:'flex', flexDirection:'column',
    }}>
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
