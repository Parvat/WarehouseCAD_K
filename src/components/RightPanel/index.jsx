import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel }      from './LayerPanel'
import { TextPanel }       from './TextPanel'
import { ColorPanel }      from './ColorPanel'
import { LabelsPanel }     from './LabelsPanel'
import { GroupPanel }      from './GroupPanel'
import { ColumnCheckPanel } from './ColumnCheckPanel'
import { LayoutCheckPanel } from './LayoutCheckPanel'

export function RightPanel() {
  return (
    <div style={{
      width:272, flexShrink:0,
      background:'var(--surface)', borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column', overflowY:'auto',
    }}>
      <LayoutCheckPanel />
      <PropertiesPanel />
      <ColumnCheckPanel />
      <GroupPanel />
      <ColorPanel />
      <LayerPanel />
      <TextPanel />
      <LabelsPanel />
    </div>
  )
}