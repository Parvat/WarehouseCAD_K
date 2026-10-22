import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { nanoid } from 'nanoid'
import { pasteAt } from '../../utils/pasteAt'
import { C, SecLabel, Btn, IconBtn, Hint } from '../../studio/cardParts'

/* Arrange (Copy / Paste / Cut, Group / Ungroup, the active groups' members) — a body for the card's "More" fold. */
const off = disabled => (disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null)
const cell = { padding: '0 8px', minWidth: 0 }

export function GroupBody() {
  const {
    selectedIds, groups, objects,
    groupSelected, ungroupSelected, removeFromGroup,
    copySelected, cutSelected,
  } = useCanvasStore(useShallow(s => ({ selectedIds: s.selectedIds, groups: s.groups, objects: s.objects, groupSelected: s.groupSelected, ungroupSelected: s.ungroupSelected, removeFromGroup: s.removeFromGroup, copySelected: s.copySelected, paste: s.paste, cutSelected: s.cutSelected })))

  const hasSelection = selectedIds.length > 0
  const canGroup     = selectedIds.length >= 2
  const selSet       = new Set(selectedIds)
  const activeGroups = (groups || []).filter(g => g.ids.some(id => selSet.has(id)))
  const canUngroup   = activeGroups.length > 0
  // All members of active groups are considered "highlighted"
  const activeGroupMemberIds = new Set(activeGroups.flatMap(g => g.ids))
  const groupLabel = canGroup ? `Group (${selectedIds.length})` : 'Group'

  return (
    <>
      <SecLabel>Arrange</SecLabel>

      {/* Copy / Paste / Cut */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        <Btn title="Copy"  onClick={copySelected} disabled={!hasSelection} style={{ ...cell, ...off(!hasSelection) }}>Copy</Btn>
        <Btn title="Paste" onClick={() => pasteAt(useCanvasStore, 'cursor', nanoid)} style={cell}>Paste</Btn>
        <Btn title="Cut"   onClick={cutSelected}  disabled={!hasSelection} style={{ ...cell, ...off(!hasSelection) }}>Cut</Btn>
      </div>

      {/* Group / Ungroup row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        <Btn title={groupLabel} onClick={groupSelected} disabled={!canGroup} style={{ ...cell, ...off(!canGroup) }}>{groupLabel}</Btn>
        <Btn title="Ungroup" onClick={ungroupSelected} disabled={!canUngroup} style={{ ...cell, ...off(!canUngroup) }}>Ungroup</Btn>
      </div>

      {/* Active group members — Close removes one from its group */}
      {activeGroups.map(grp => (
        <div key={grp.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ height: 1, background: C.divider, margin: '4px 0' }} />
          <SecLabel>Group · {grp.ids.length} objects · drag ↻ to rotate</SecLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grp.ids.map(id => {
              const obj = objects.find(o => o.id === id)
              if (!obj) return null
              const label = obj.label || obj.type || 'object'
              const isSelected = activeGroupMemberIds.has(id)
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                  height: 30, padding: '0 2px 0 10px', borderRadius: 6,
                  background: isSelected ? C.active : C.inset,
                }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: isSelected ? C.text : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                  <IconBtn name="Close" label="Remove from group" onClick={() => removeFromGroup(id)} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {!hasSelection && activeGroups.length === 0 && (
        <Hint>Select 2+ objects to group · Ctrl+G</Hint>
      )}
    </>
  )
}

export const GroupPanel = GroupBody
