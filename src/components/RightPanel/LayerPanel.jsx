import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { setLayer } from '../../utils/layers'

/* The seven standard layers (utils/layers.js), each with an eye and a padlock.
   Hidden: not drawn, not pickable, not in the PDF. Locked: drawn and printed,
   but not pickable, draggable, snappable or marqueed. Custom layers later. */
export function LayerPanel() {
  const layers = useCanvasStore(s => s.layers)

  const iconBtn = (on) => ({
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
    background: 'transparent', color: on ? 'var(--text)' : 'var(--text3)',
  })

  return (
    <SectionHeader title="Layers">
      <div style={{ padding: '2px 8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {layers.map(layer => {
          const hidden = layer.visible === false, locked = !!layer.locked
          return (
            <div key={layer.id} data-layer={layer.id}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', borderRadius: 6 }}>
              <button type="button" style={iconBtn(!hidden)}
                aria-label={`${hidden ? 'Show' : 'Hide'} ${layer.name} layer`} aria-pressed={!hidden}
                title={hidden ? 'Show' : 'Hide'}
                onClick={() => setLayer(useCanvasStore, layer.id, { visible: hidden })}>
                {hidden ? <EyeOff size={14} strokeWidth={1.5} absoluteStrokeWidth /> : <Eye size={14} strokeWidth={1.5} absoluteStrokeWidth />}
              </button>
              <button type="button" style={iconBtn(locked)}
                aria-label={`${locked ? 'Unlock' : 'Lock'} ${layer.name} layer`} aria-pressed={locked}
                title={locked ? 'Unlock' : 'Lock'}
                onClick={() => setLayer(useCanvasStore, layer.id, { locked: !locked })}>
                {locked ? <Lock size={13} strokeWidth={1.5} absoluteStrokeWidth /> : <LockOpen size={13} strokeWidth={1.5} absoluteStrokeWidth style={{ opacity: 0.45 }} />}
              </button>
              <span style={{
                flex: 1, minWidth: 0, marginLeft: 4, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: hidden ? 'var(--text3)' : 'var(--text)',
              }}>
                {layer.name}
              </span>
            </div>
          )
        })}
      </div>
    </SectionHeader>
  )
}
