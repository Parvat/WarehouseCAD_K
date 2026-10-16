import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'
import { RP_W } from '../../utils/rightPanel'

/* One right panel: the selection's properties, Check layout, the column check, groups, colour, layers, text, labels.
   Elevations have their own mode (the top bar's Layout | Elevations); Properties shows a rack's elevation as one line. */
export function RightPanel() {
  return (
    <div aria-label="Right panel" style={{
      width:RP_W, flexShrink:0, position:'relative',
      background:'var(--surface)', borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
    }}>
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
