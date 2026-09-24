import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { useColumnCheck, conflictKey } from '../../generate/useColumnCheck'
import { useRules } from '../../rules/useRules'
import { Forklift } from '../icons'

/* ── Column check — the absorb vs remove decision ────────────────────────────
   checkColumns hands back both numbers for every conflict. The whole point of
   this panel is to put them side by side: absorbing costs a few pallet
   positions, removing the section costs the whole bay. Removing is always the
   worse of the two, so absorb is the default and the numbers are shown
   together rather than one at a time. */

/* Radii match the CAD's own panels: controls are square-ish at 2px, grouped
   cards get 4px. Anything rounder reads as a web widget pasted onto a
   drawing tool. */
const R      = 2
const CARD_R = 4

const S = {
  mono9:  { fontSize: 9,  fontFamily: 'var(--font-mono)' },
  mono10: { fontSize: 10, fontFamily: 'var(--font-mono)' },
}

/* Which bay does the column land in?
   Rack layout is `upright | beam | upright | beam | upright` (RackRowPanelCore),
   so bay i starts at upIn*(i+1) + sum(beams[0..i-1]) inches from the rack's
   left edge. Returns null for rack types that have no beam list — lane racks
   have no bay to remove. */
function bayIndexAt(rack, worldX, gridSize) {
  const beams = rack.beams
  if (!Array.isArray(beams) || !beams.length) return null
  const upIn = rack.uprightWidth || 3
  const offsetIn = ((worldX - rack.x) / gridSize) * 12
  let cursor = upIn
  for (let i = 0; i < beams.length; i++) {
    const end = cursor + beams[i]
    if (offsetIn < end) return i
    cursor = end + upIn
  }
  return beams.length - 1
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...S.mono9, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 700,
        color: tone === 'bad' ? 'var(--red)' : 'var(--text)', lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  )
}

function ConflictCard({ conflict, index }) {
  const { objects, gridSize, commitObjectUpdate } = useCanvasStore()
  const { resolutions, setResolution } = useColumnCheck()

  const key  = conflictKey(conflict)
  const mode = resolutions[key] || 'absorb'
  const rack = objects.find(o => o.id === conflict.rackId)

  /* Removing the section is a real edit to the rack: drop the bay the column
     sits in and re-derive the width from the beam list, using the same formula
     RackRowPanelCore uses so a rack edited here matches one edited there. */
  const removeSection = () => {
    if (!rack) return
    const beams = rack.beams
    if (!Array.isArray(beams) || beams.length <= 1) return
    const idx = bayIndexAt(rack, conflict.overlap.x, gridSize)
    if (idx == null) return
    const newBeams = beams.filter((_, i) => i !== idx)
    const upIn     = rack.uprightWidth || 3
    const totalIn  = upIn * (newBeams.length + 1) + newBeams.reduce((s, b) => s + b, 0)
    commitObjectUpdate(rack.id, {
      beams: newBeams,
      width: (totalIn / 12) * gridSize,
      activeBayIdx: null,
    })
    setResolution(key, 'removed')
  }

  const canRemove = Array.isArray(rack?.beams) && rack.beams.length > 1

  const btn = (active) => ({
    flex: 1, padding: '6px 0', borderRadius: R, cursor: 'pointer',
    ...S.mono9, fontWeight: 600,
    border: 'none',
    background: active ? 'var(--accent-solid)' : 'var(--surface2)',
    color:      active ? 'var(--accent-fg)'    : 'var(--text2)',
    transition: 'background 0.12s, color 0.12s',
  })

  return (
    <div style={{
      padding: 10, borderRadius: CARD_R,
      background: 'var(--surface2)', border: '0.5px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)' }}>
          {rack?.label || 'Rack'} · column {conflict.columnIndex + 1}
        </span>
        <span style={{ ...S.mono9, color: 'var(--text3)' }}>#{index + 1}</span>
      </div>

      {/* Both numbers, always together — the trade-off is the content. */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Stat label="Absorb" value={`−${conflict.positionsLost}`} />
        <Stat label="Remove section" value={`−${conflict.sectionsLost}`} tone="bad" />
      </div>

      {mode === 'removed' ? (
        <div style={{ ...S.mono9, color: 'var(--text3)' }}>
          Section removed · {conflict.sectionsLost} positions gone
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => setResolution(key, 'absorb')}
            title="Keep the rack, mark the blocked slots unusable"
            style={btn(mode === 'absorb')}>
            Absorb
          </button>
          <button onClick={removeSection} disabled={!canRemove}
            title={canRemove
              ? 'Delete the bay the column lands in'
              : 'This rack has no separate bay to remove'}
            style={{
              ...btn(false),
              cursor: canRemove ? 'pointer' : 'not-allowed',
              opacity: canRemove ? 1 : 0.45,
            }}>
            Remove section
          </button>
        </div>
      )}
    </div>
  )
}

export function ColumnCheckPanel() {
  const { result, mheKey, setMheKey, showMarks, setShowMarks, pickBothSides, setPickBothSides } = useColumnCheck()
  const { mheOptions } = useRules()
  const { rackConflicts, aisleBlocks, pickBlocks = [], summary } = result
  const blocked = (aisleBlocks || []).filter(a => a.blocked)
  const profileTravelFt = mheOptions[mheKey]?.travelFt ?? 8

  const clean = !rackConflicts.length && !blocked.length && !pickBlocks.length

  return (
    <SectionHeader title="Column Check" defaultOpen={true}>
      <div style={{ padding: '12px 13px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>

        {/* Forklift — the same value that drives the generated aisle width */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Forklift size={15} absoluteStrokeWidth
            style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ ...S.mono10, color: 'var(--text3)', width: 28, flexShrink: 0 }}>MHE</span>
          <select value={mheKey} onChange={e => setMheKey(e.target.value)}
            style={{
              flex: 1, minWidth: 0, borderRadius: R, padding: '5px 8px',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-mono)',
              outline: 'none', cursor: 'pointer',
            }}>
            {Object.values(mheOptions).map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        {clean ? (
          <div style={{ ...S.mono10, color: 'var(--text3)' }}>
            No column interference.
          </div>
        ) : (
          <>
            {/* Layout-wide totals, straight off summary */}
            <div style={{
              display: 'flex', gap: 10, padding: 10, borderRadius: CARD_R,
              background: 'var(--surface2)', border: '0.5px solid var(--border)',
            }}>
              <Stat label="If absorbed" value={`−${summary.positionsLostIfAbsorb}`} />
              <Stat label="If removed" value={`−${summary.sectionsLostIfRemove}`} tone="bad" />
            </div>

            <div style={{ ...S.mono9, color: 'var(--text3)' }}>
              {rackConflicts.length} column{rackConflicts.length === 1 ? '' : 's'} in racks
              {blocked.length > 0 && ` · ${blocked.length} aisle${blocked.length === 1 ? '' : 's'} blocked`}
              {summary.positionsLostToPickZone > 0 && ` · −${summary.positionsLostToPickZone} blocked from the aisle`}
            </div>

            {blocked.map((a, i) => (
              <div key={i} style={{
                padding: '8px 10px', borderRadius: CARD_R,
                background: 'var(--red-dim)', border: '0.5px solid var(--red-bdr)',
                ...S.mono9, color: 'var(--red)',
              }}>
                {a.level === 1
                  ? <>Aisle blocked · {a.clearFt}ft clear of {a.aisleFt}ft
                      — {summary.profile} needs {profileTravelFt}ft to drive through</>
                  : <>One-side pick only · {a.clearFt}ft clear of {a.aisleFt}ft
                      — {summary.profile} needs {mheOptions[mheKey]?.aisleFt}ft to pick both sides</>}
              </div>
            ))}

            {rackConflicts.map((c, i) => (
              <ConflictCard key={conflictKey(c)} conflict={c} index={i} />
            ))}
          </>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }} title="A column with clear space on only one side is accessible by default (drivable + pickable from the far side). Turn this on to flag those too.">
            Require pick from both sides
          </span>
          <button onClick={() => setPickBothSides(!pickBothSides)} role="switch" aria-checked={pickBothSides}
            aria-label="Require pick from both sides"
            style={{
              position: 'relative', width: 34, height: 20, borderRadius: 999, border: 'none',
              cursor: 'pointer', flexShrink: 0, padding: 0,
              background: pickBothSides ? 'var(--accent-solid)' : 'var(--surface3)',
              transition: 'background 0.16s',
            }}>
            <span style={{
              position: 'absolute', top: 3, left: pickBothSides ? 17 : 3, width: 14, height: 14,
              borderRadius: '50%', transition: 'left 0.16s',
              background: pickBothSides ? 'var(--accent-fg)' : 'var(--text3)',
            }} />
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Show markings</span>
          <button onClick={() => setShowMarks(!showMarks)} role="switch" aria-checked={showMarks}
            aria-label="Show markings"
            style={{
              position: 'relative', width: 34, height: 20, borderRadius: 999, border: 'none',
              cursor: 'pointer', flexShrink: 0, padding: 0,
              background: showMarks ? 'var(--accent-solid)' : 'var(--surface3)',
              transition: 'background 0.16s',
            }}>
            <span style={{
              position: 'absolute', top: 3, left: showMarks ? 17 : 3, width: 14, height: 14,
              borderRadius: '50%', transition: 'left 0.16s',
              background: showMarks ? 'var(--accent-fg)' : 'var(--text3)',
            }} />
          </button>
        </div>

      </div>
    </SectionHeader>
  )
}
