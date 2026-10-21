import { Plus, Trash2, Tag } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { SectionHeader } from '../shared/SectionHeader'

/* label identity colours — object colours, not chrome; they stay hex */
const COLORS = ['#4a9eff','#22c55e','#f0b429','#a855f7','#ef4444','#ec4899','#14b8a6']

export function LabelsPanel() {
  const { labels, addLabel, deleteLabel } = useCanvasStore(useShallow(s => ({ labels: s.labels, addLabel: s.addLabel, deleteLabel: s.deleteLabel })))

  const handleAdd = () => {
    const text = window.prompt('Label text:')
    if (!text?.trim()) return
    addLabel({ text: text.trim(), color: COLORS[labels.length % COLORS.length] })
  }

  return (
    <SectionHeader title="Labels" action={
      <button onClick={handleAdd} className="t-icon">
        <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </button>
    }>
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {labels.map(label => (
          <div
            key={label.id}
            className="group"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 0 8px', minWidth: 0,
              borderRadius: 2, border: '1px solid var(--line)', background: 'var(--paper)', cursor: 'pointer' }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: label.color }} />
            <Tag size={14} strokeWidth={1.5} absoluteStrokeWidth style={{ flexShrink: 0, color: label.color }} />
            <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.text}</span>
            {label.count > 0 && (
              <span className="t-num" style={{ fontSize: 11, padding: '0 4px', borderRadius: 2, background: 'var(--bg2)', color: 'var(--steel)', flexShrink: 0 }}>{label.count}</span>
            )}
            <button
              onClick={() => deleteLabel(label.id)}
              className="t-icon t-icon--danger opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={16} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </div>
        ))}
        {!labels.length && (
          <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--steel)', lineHeight: 1.5 }}>No labels. Click + to add zone labels.</p>
        )}
      </div>
    </SectionHeader>
  )
}
