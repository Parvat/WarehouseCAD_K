import { Eye, EyeOff, Lock, Unlock, Trash2, Edit2, Plus, GripVertical } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { cn } from '../../utils/cn'

export function LayerPanel() {
  const { layers, activeLayerId, setActiveLayer, addLayer, updateLayer, deleteLayer } = useCanvasStore()

  const rename = (layer) => {
    const n = window.prompt('Layer name:', layer.name)
    if (n && n.trim()) updateLayer(layer.id, { name: n.trim() })
  }

  return (
    <SectionHeader title="Layers" action={
      <button onClick={addLayer} className="text-[var(--text3)] hover:text-[var(--accent)] transition-colors">
        <Plus size={12} />
      </button>
    }>
      <div className="p-2 flex flex-col gap-1">
        {layers.map(layer => (
          <div
            key={layer.id}
            onClick={() => setActiveLayer(layer.id)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-all border group',
              layer.id === activeLayerId
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40'
                : 'border-transparent hover:bg-[var(--surface3)]'
            )}
          >
            <GripVertical size={10} className="text-[var(--border)] group-hover:text-[var(--text3)] cursor-grab shrink-0" />

            <button
              onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }) }}
              className="text-[var(--text3)] hover:text-[var(--text)] shrink-0"
            >
              {layer.visible
                ? <Eye size={11} style={{ color: layer.color }} />
                : <EyeOff size={11} />}
            </button>

            <button
              onClick={e => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }) }}
              className="text-[var(--text3)] hover:text-[var(--text)] shrink-0"
            >
              {layer.locked ? <Lock size={10} /> : <Unlock size={10} className="opacity-30" />}
            </button>

            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: layer.color }} />

            <span className={cn('flex-1 text-[11px] truncate', layer.locked ? 'text-[var(--text3)] line-through' : 'text-[var(--text)]')}>
              {layer.name}
            </span>

            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => { e.stopPropagation(); rename(layer) }}
                className="w-4 h-4 flex items-center justify-center rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)]"
              >
                <Edit2 size={9} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteLayer(layer.id) }}
                className="w-4 h-4 flex items-center justify-center rounded text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red)]/10"
              >
                <Trash2 size={9} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionHeader>
  )
}
