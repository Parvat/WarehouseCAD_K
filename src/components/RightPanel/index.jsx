import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'
import { ElevationsTab }   from '../Elevations/ElevationsTab'

/* The right card's two tabs' content (Studio: the card itself, its tabs and its size are src/studio/StudioFrame.jsx).
   Properties — the selection, Check layout, the column check, groups, colour, layers, text, labels; a rack's elevation
   as one read-only line. Elevations — the drawing and the elevation chips (components/Elevations/ElevationsTab.jsx).
   The tab is remembered per browser (utils/rightPanel.js). */
export function RightPanelTabs({ tab }) {
  return tab === 'properties'
    ? <div role="tabpanel" aria-label="Properties" style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
        <LayoutCheckPanel />
        <PropertiesPanel />
        <ColumnCheckPanel />
        <GroupPanel />
        <ColorPanel />
        <LayerPanel />
        <TextPanel />
        <LabelsPanel />
      </div>
    : <div role="tabpanel" aria-label="Elevations" style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}><ElevationsTab /></div>
}
