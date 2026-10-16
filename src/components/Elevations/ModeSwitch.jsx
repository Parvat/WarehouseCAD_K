import { useCanvasStore } from '../../store/useCanvasStore'
import { useElevMode, enterElevations, leaveElevations, applyDraft, discardDraft, undoOrDiscard as undoIn } from '../../utils/elevMode'

/* Layout | Elevations — the top bar's mode switch (ELEVATIONS_PLAN.md §3). Leaving Elevation mode with changes not
   applied asks: Apply / Discard / Stay. */
const store = useCanvasStore
const seg = (on) => ({ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: on ? 'var(--accent-solid, #0B101D)' : 'transparent', color: on ? 'var(--accent-fg, #fff)' : 'var(--text2)' })

export function ModeSwitch() {
  const { on, leaving } = useElevMode()
  return (
    <div style={{ position: 'relative' }}>
      <div role="group" aria-label="Mode" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <button type="button" aria-pressed={!on} style={seg(!on)} onClick={() => on && leaveElevations(store)}>Layout</button>
        <button type="button" aria-pressed={on} style={seg(on)} onClick={() => !on && enterElevations(store)}>Elevations</button>
      </div>
      {leaving && (
        <div role="dialog" aria-label="Leave Elevation mode" style={{ position: 'absolute', top: 40, left: 0, zIndex: 80, width: 260, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 6px 20px rgba(0,0,0,0.16)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>Your elevation changes aren't applied yet.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => { applyDraft(store); useElevMode.setState({ leaving: false }); leaveElevations(store) }} style={{ ...seg(true), padding: '5px 10px' }}>Apply</button>
            <button type="button" onClick={() => { discardDraft(store); useElevMode.setState({ leaving: false }); leaveElevations(store) }} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>Discard</button>
            <button type="button" onClick={() => useElevMode.setState({ leaving: false })} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>Stay</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Undo in Elevation mode with a draft: the draft discarded (back to the last applied state), never a step further. */
export const undoOrDiscard = () => undoIn(store)
