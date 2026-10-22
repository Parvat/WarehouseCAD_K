import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { C, MONO, SecLabel, Btn, IconBtn, Hint } from '../../studio/cardParts'

const COLORS = ['#4a9eff','#22c55e','#f0b429','#a855f7','#ef4444','#ec4899','#14b8a6']

/* Zone labels — a body for the card's "More" fold. The dot keeps the label's own colour (data). */
export function LabelsBody() {
  const { labels, addLabel, deleteLabel } = useCanvasStore(useShallow(s => ({ labels: s.labels, addLabel: s.addLabel, deleteLabel: s.deleteLabel })))

  const handleAdd = () => {
    const text = window.prompt('Label text:')
    if (!text?.trim()) return
    addLabel({ text: text.trim(), color: COLORS[labels.length % COLORS.length] })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex' }}><SecLabel>Labels</SecLabel></span>
        <Btn kind="ghost" title="Add label" onClick={handleAdd} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>+ Add</Btn>
      </div>
      {labels.map(label => (
        <div key={label.id} className="st-hov"
          style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, height: 30, padding: '0 2px 0 10px', borderRadius: 6, background: C.inset }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: label.color }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.text}</span>
          {label.count > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, flexShrink: 0 }}>{label.count}</span>
          )}
          <IconBtn name="Delete" danger label="Delete label" onClick={() => deleteLabel(label.id)} />
        </div>
      ))}
      {!labels.length && (
        <Hint>No labels. Click + to add zone labels.</Hint>
      )}
    </>
  )
}

export const LabelsPanel = LabelsBody
