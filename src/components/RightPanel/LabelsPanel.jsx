import { Plus, Trash2, Tag } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'

const COLORS = ['#4a9eff','#22c55e','#f0b429','#a855f7','#ef4444','#ec4899','#14b8a6']

export function LabelsPanel() {
  const { labels, addLabel, deleteLabel } = useCanvasStore()

  const handleAdd = () => {
    const text = window.prompt('Label text:')
    if (!text?.trim()) return
    addLabel({ text: text.trim(), color: COLORS[labels.length % COLORS.length] })
  }

  return (
    <SectionHeader title="Labels" action={
      <button onClick={handleAdd} className="text-[var(--text3)] hover:text-[var(--accent)] transition-colors">
        <Plus size={12} />
      </button>
    }>
      <div className="p-2 flex flex-col gap-1">
        {labels.map(label => (
          <div
            key={label.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface2)] group hover:border-[var(--accent)]/30 hover:bg-[var(--surface3)] cursor-pointer transition-all"
          >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: label.color }} />
            <Tag size={9} className="shrink-0" style={{ color: label.color }} />
            <span className="flex-1 text-[11px] text-[var(--text)] truncate">{label.text}</span>
            {label.count > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--surface3)] text-[var(--text3)] font-mono shrink-0">{label.count}</span>
            )}
            <button
              onClick={() => deleteLabel(label.id)}
              className="opacity-0 group-hover:opacity-100 text-[var(--text3)] hover:text-[var(--red)] transition-all shrink-0"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {!labels.length && (
          <p className="text-[9px] text-[var(--text3)] font-mono px-1">No labels. Click + to add zone labels.</p>
        )}
      </div>
    </SectionHeader>
  )
}
