import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'

export function CustomObjects() {
  const { customObjects, saveAsCustomObject, deleteCustomObject, selectedIds } = useCanvasStore()
  const [saving, setSaving] = useState(false)
  const [name, setName]     = useState('')

  const handleSave = () => {
    if (!name.trim()) return
    saveAsCustomObject(name.trim())
    setName(''); setSaving(false)
  }

  return (
    <SectionHeader title="My Objects" action={
      <button onClick={() => setSaving(s => !s)} className="text-[var(--text3)] hover:text-[var(--accent)] transition-colors">
        <Plus size={12} />
      </button>
    }>
      <div className="p-2 flex flex-col gap-1.5">
        {saving && (
          <div className="flex gap-1">
            <input
              autoFocus type="text" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Object name..."
              className="flex-1 bg-[var(--surface3)] border border-[var(--accent)]/50 rounded text-[11px] text-[var(--text)] font-mono px-2 py-1 focus:outline-none"
            />
            <button onClick={handleSave} className="px-2 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] rounded border border-[var(--accent)]/50 hover:bg-[var(--accent)]/30 shrink-0">
              Save
            </button>
          </div>
        )}
        {customObjects.map(obj => (
          <div key={obj.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface2)] group cursor-pointer hover:border-[var(--purple)]/40 hover:bg-[var(--surface3)] transition-all">
            <div className="w-7 h-7 rounded bg-[var(--surface3)] border border-[var(--border)] flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={obj.color || '#a855f7'} strokeWidth="1.3">
                <rect x="2" y="2" width="10" height="10" rx="1" />
                <line x1="7" y1="2" x2="7" y2="12" strokeOpacity="0.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[var(--text)] truncate">{obj.name}</div>
              {obj.dims && <div className="text-[9px] text-[var(--text3)] font-mono">{obj.dims}</div>}
              {obj.objectCount && <div className="text-[9px] text-[var(--text3)] font-mono">{obj.objectCount} objects</div>}
            </div>
            <button onClick={() => deleteCustomObject(obj.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text3)] hover:text-[var(--red)] transition-all shrink-0">
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {!customObjects.length && !saving && (
          <p className="text-[9px] text-[var(--text3)] font-mono px-1">Select objects and click + to save for reuse.</p>
        )}
      </div>
    </SectionHeader>
  )
}
