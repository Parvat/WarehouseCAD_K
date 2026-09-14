import { Copy, Clipboard, Scissors, Layers, Ungroup, X } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'

export function GroupPanel() {
  const {
    selectedIds, groups, objects,
    groupSelected, ungroupSelected, removeFromGroup,
    copySelected, paste, cutSelected,
  } = useCanvasStore()

  const hasSelection = selectedIds.length > 0
  const canGroup     = selectedIds.length >= 2
  const selSet       = new Set(selectedIds)
  const activeGroups = (groups || []).filter(g => g.ids.some(id => selSet.has(id)))
  const canUngroup   = activeGroups.length > 0
  // All members of active groups are considered "highlighted"
  const activeGroupMemberIds = new Set(activeGroups.flatMap(g => g.ids))

  const Btn = ({ icon: Icon, label, onClick, disabled, color = 'var(--text2)', flex }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        color: disabled ? 'var(--text3)' : color,
        border: '1px solid var(--border)',
        background: 'var(--surface2)',
        fontSize: 'var(--fs-xs)',
        fontFamily: 'var(--font-mono)',
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', borderRadius: 5,
        width: flex ? undefined : '100%',
        flex: flex ? 1 : undefined,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--surface3)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)' }}
    >
      <Icon size={11} />
      {label}
    </button>
  )

  return (
    <SectionHeader title="Arrange" defaultOpen={true}>
      <div className="p-2 flex flex-col gap-1">

        {/* Copy / Paste / Cut */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <Btn icon={Copy}      label="Copy"  onClick={copySelected}  disabled={!hasSelection} />
          <Btn icon={Clipboard} label="Paste" onClick={paste} />
          {/* Cut is a clipboard move, not a destructive act — the red pulled the
              eye to the least important of the three sibling buttons. */}
          <Btn icon={Scissors}  label="Cut"   onClick={cutSelected}   disabled={!hasSelection} />
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

        {/* Group / Ungroup row */}
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn icon={Layers}  label={canGroup ? `Group (${selectedIds.length})` : 'Group'}
            onClick={groupSelected} disabled={!canGroup} color="var(--purple)" flex />
          <Btn icon={Ungroup} label="Ungroup"
            onClick={ungroupSelected} disabled={!canUngroup} color="var(--accent)" flex />
        </div>

        {/* Active group members — click × to remove from group */}
        {activeGroups.map(grp => (
          <div key={grp.id} style={{ marginTop: 4 }}>
            <div style={{
              fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)',
              color: 'var(--purple)', padding: '2px 4px 4px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)', flexShrink: 0 }} />
              Group · {grp.ids.length} objects · drag ↻ to rotate
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {grp.ids.map(id => {
                const obj = objects.find(o => o.id === id)
                if (!obj) return null
                const label = obj.label || obj.type || 'object'
                const isSelected = activeGroupMemberIds.has(id)
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 6px', borderRadius: 4,
                    border: `1px solid ${isSelected ? 'var(--purple-bdr)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--purple-dim)' : 'var(--surface2)',
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? 'var(--purple)' : 'var(--text3)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)', color: isSelected ? 'var(--purple)' : 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <button
                      title="Remove from group"
                      onClick={() => removeFromGroup(id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text3)', padding: '1px 2px', borderRadius: 3,
                        display: 'flex', alignItems: 'center',
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)' }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {!hasSelection && activeGroups.length === 0 && (
          <p style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text3)', padding: '2px 4px' }}>
            Select 2+ objects to group · Ctrl+G
          </p>
        )}
      </div>
    </SectionHeader>
  )
}