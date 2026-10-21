import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { setLayer } from '../../utils/layers'

/* The seven standard layers (utils/layers.js), each with an eye and a padlock.
   Hidden: not drawn, not pickable, not in the PDF. Locked: drawn and printed,
   but not pickable, draggable, snappable or marqueed. Custom layers later. */
export function LayerPanel() {
  const layers = useCanvasStore(s => s.layers)

  /* ghost icon buttons (.t-icon); an eye / padlock that is on reads ink, off reads steel — not the pine pressed fill,
     which on seven always-visible eyes would be a column of solid blocks */
  const iconBtn = (on) => ({ background: 'transparent', color: on ? 'var(--ink)' : 'var(--steel)' })

  return (
    <SectionHeader title="Layers">
      <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {layers.map(layer => {
          const hidden = layer.visible === false, locked = !!layer.locked
          return (
            <div key={layer.id} data-layer={layer.id}
              style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <button type="button" className="t-icon" style={iconBtn(!hidden)}
                aria-label={`${hidden ? 'Show' : 'Hide'} ${layer.name} layer`} aria-pressed={!hidden}
                title={hidden ? 'Show' : 'Hide'}
                onClick={() => setLayer(useCanvasStore, layer.id, { visible: hidden })}>
                {hidden ? <EyeOff size={16} strokeWidth={1.5} absoluteStrokeWidth /> : <Eye size={16} strokeWidth={1.5} absoluteStrokeWidth />}
              </button>
              <button type="button" className="t-icon" style={iconBtn(locked)}
                aria-label={`${locked ? 'Unlock' : 'Lock'} ${layer.name} layer`} aria-pressed={locked}
                title={locked ? 'Unlock' : 'Lock'}
                onClick={() => setLayer(useCanvasStore, layer.id, { locked: !locked })}>
                {locked ? <Lock size={16} strokeWidth={1.5} absoluteStrokeWidth /> : <LockOpen size={16} strokeWidth={1.5} absoluteStrokeWidth style={{ opacity: 0.45 }} />}
              </button>
              <span style={{
                flex: 1, minWidth: 0, marginLeft: 4, fontFamily: 'var(--font-ui)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: hidden ? 'var(--steel)' : 'var(--ink)',
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
