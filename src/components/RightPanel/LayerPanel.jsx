import { useCanvasStore } from '../../store/useCanvasStore'
import { setLayer } from '../../utils/layers'
import { C, SecLabel, Toggle, IconBtn } from '../../studio/cardParts'

/* The seven standard layers (utils/layers.js), each with a visibility switch and a padlock.
   Hidden: not drawn, not pickable, not in the PDF. Locked: drawn and printed,
   but not pickable, draggable, snappable or marqueed. Custom layers later.
   A body for the card's "More" fold. */
export function LayerBody() {
  const layers = useCanvasStore(s => s.layers)

  return (
    <>
      <SecLabel>Layers</SecLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {layers.map(layer => {
          const hidden = layer.visible === false, locked = !!layer.locked
          return (
            <div key={layer.id} data-layer={layer.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, minWidth: 0 }}>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: hidden ? C.faint : C.text,
              }}>
                {layer.name}
              </span>
              <span title={hidden ? 'Show' : 'Hide'} style={{ display: 'flex' }}>
                <Toggle on={!hidden}
                  label={`${hidden ? 'Show' : 'Hide'} ${layer.name} layer`}
                  onClick={() => setLayer(useCanvasStore, layer.id, { visible: hidden })} />
              </span>
              <IconBtn name="Lock" active={locked}
                label={`${locked ? 'Unlock' : 'Lock'} ${layer.name} layer`}
                title={locked ? 'Unlock' : 'Lock'}
                onClick={() => setLayer(useCanvasStore, layer.id, { locked: !locked })} />
            </div>
          )
        })}
      </div>
    </>
  )
}

export const LayerPanel = LayerBody
