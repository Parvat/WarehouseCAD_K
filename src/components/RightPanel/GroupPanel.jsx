import { Copy, Clipboard, Scissors, Layers, Ungroup, X } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { SectionHeader } from '../shared/SectionHeader'
import { nanoid } from 'nanoid'
import { pasteAt } from '../../utils/pasteAt'

export function GroupPanel() {
  const {
    selectedIds, groups, objects,
    groupSelected, ungroupSelected, removeFromGroup,
    copySelected, paste, cutSelected,
  } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, groups: s.groups, objects: s.objects, groupSelected: s.groupSelected, ungroupSelected: s.ungroupSelected, removeFromGroup: s.removeFromGroup, copySelected: s.copySelected, paste: s.paste, cutSelected: s.cutSelected })))

  const hasSelection = selectedIds.length > 0
  const canGroup     = selectedIds.length >= 2
  const selSet       = new Set(selectedIds)
  const activeGroups = (groups || []).filter(g => g.ids.some(id => selSet.has(id)))
  const canUngroup   = activeGroups.length > 0
  // All members of active groups are considered "highlighted"
  const activeGroupMemberIds = new Set(activeGroups.flatMap(g => g.ids))

  /* every Arrange button is a 32px secondary in a 3-column grid; disabled is only the attribute (45%, not-allowed).
     The label truncates inside its column — the title carries it in full. */
  const Btn = ({ icon: Icon, label, onClick, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="t-btn t-btn--secondary"
      style={{ minWidth: 0, width: '100%', padding: '0 4px', gap: 4 }}
    >
      <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  )
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }

  return (
    <SectionHeader title="Arrange" defaultOpen={true}>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>

        {/* Copy / Paste / Cut */}
        <div style={grid}>
          <Btn icon={Copy}      label="Copy"  onClick={copySelected}  disabled={!hasSelection} />
          <Btn icon={Clipboard} label="Paste" onClick={() => pasteAt(useCanvasStore, 'cursor', nanoid)} />
          {/* Cut is a clipboard move, not a destructive act — the red pulled the
              eye to the least important of the three sibling buttons. */}
          <Btn icon={Scissors}  label="Cut"   onClick={cutSelected}   disabled={!hasSelection} />
        </div>

        {/* Group / Ungroup row */}
        <div style={grid}>
          <Btn icon={Layers}  label={canGroup ? `Group (${selectedIds.length})` : 'Group'}
            onClick={groupSelected} disabled={!canGroup} />
          <Btn icon={Ungroup} label="Ungroup"
            onClick={ungroupSelected} disabled={!canUngroup} />
        </div>

        {/* Active group members — click × to remove from group (purple = the canvas group highlight) */}
        {activeGroups.map(grp => (
          <div key={grp.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontFamily: 'var(--font-ui)',
              color: 'var(--purple)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--purple)', flexShrink: 0 }} />
              Group · {grp.ids.length} objects · drag ↻ to rotate
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {grp.ids.map(id => {
                const obj = objects.find(o => o.id === id)
                if (!obj) return null
                const label = obj.label || obj.type || 'object'
                const isSelected = activeGroupMemberIds.has(id)
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                    padding: '0 0 0 8px', borderRadius: 2,
                    border: `1px solid ${isSelected ? 'var(--purple-bdr)' : 'var(--line)'}`,
                    background: isSelected ? 'var(--purple-dim)' : 'var(--paper)',
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: isSelected ? 'var(--purple)' : 'var(--steel)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'var(--font-ui)', color: isSelected ? 'var(--purple)' : 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <button
                      title="Remove from group"
                      onClick={() => removeFromGroup(id)}
                      className="t-icon t-icon--danger"
                    >
                      <X size={14} strokeWidth={1.5} absoluteStrokeWidth />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {!hasSelection && activeGroups.length === 0 && (
          <p style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--steel)', margin: 0, lineHeight: 1.5 }}>
            Select 2+ objects to group · Ctrl+G
          </p>
        )}
      </div>
    </SectionHeader>
  )
}