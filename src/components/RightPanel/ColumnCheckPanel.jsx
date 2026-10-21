import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { SectionHeader } from '../shared/SectionHeader'
import { useColumnCheck, conflictKey } from '../../generate/useColumnCheck'
import { useRules } from '../../rules/useRules'
import { Forklift } from '../icons'
import { Note } from '../shared/Note'

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

/* words are PJS (captions steel); only the figures are mono (.t-num) */
const S = {
  cap:  { fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--steel)', lineHeight: 1.5 },
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

/* Where the frame sits, in the panel's 1-based bay numbers: an interior
   frame is shared by two bays, an end frame belongs to one. */
function uprightBayText(h) {
  const b = (h.bays || []).map(i => i + 1)
  if (b.length === 2) return `between bays ${b[0]} and ${b[1]}`
  if (b.length === 1) return h.upright === 0 ? `start of bay ${b[0]}` : `end of bay ${b[0]}`
  return `frame ${h.upright + 1}`
}

/* A count is information, not an error: ink, weight 600 — no red even for the costlier choice (`tone` is kept for
   the call sites but no longer colours the figure). `big` sets the layout-wide totals at 26, a card's at 18. */
function Stat({ label, value, tone, big }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }} data-tone={tone}>
      <div style={{ ...S.cap, marginBottom: 4 }}>{label}</div>
      <div className="t-num" style={{
        fontSize: big ? 26 : 18, fontWeight: 600,
        color: 'var(--ink)', lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  )
}

function ConflictCard({ conflict, index }) {
  const { objects, gridSize, deleteSingleBay } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize, deleteSingleBay: s.deleteSingleBay })))
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
    /* The column check's own bayIndex is rotation-aware; bayIndexAt reads
       world x against the rack's unturned box, wrong for a vertical rack —
       kept only as a fallback for a conflict without one. */
    const idx = conflict.bayIndex ?? bayIndexAt(rack, conflict.overlap.x, gridSize)
    if (idx == null) return
    /* The same store action as the Delete key (deleteSingleBay): an end
       section shortens the rack, a middle one splits it and leaves a gap —
       every remaining bay stays where it was drawn. */
    deleteSingleBay(rack.id, idx)
    setResolution(key, 'removed')
  }

  const canRemove = Array.isArray(rack?.beams) && rack.beams.length > 1

  /* Absorb / Remove section: two 32px secondaries; the chosen one is pine (.is-on). Disabled is the attribute only. */
  const btnCls = (active) => 't-btn t-btn--secondary t-seg' + (active ? ' is-on' : '')

  return (
    <div style={{
      borderTop: '1px solid var(--line)', paddingTop: 12,
      display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 0, overflowWrap: 'anywhere' }}>
          {rack?.label || 'Rack'} · column {conflict.columnIndex + 1}
        </span>
        <span className="t-num" style={{ fontSize: 11, color: 'var(--steel)', flexShrink: 0 }}>#{index + 1}</span>
      </div>

      {/* Both numbers, always together — the trade-off is the content. */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Stat label="Absorb" value={`−${conflict.positionsLost}`} />
        <Stat label="Remove section" value={`−${conflict.sectionsLost}`} tone="bad" />
      </div>

      {mode === 'removed' ? (
        <div style={S.cap}>
          Section removed · {conflict.sectionsLost} positions gone
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <button onClick={() => setResolution(key, 'absorb')}
            title="Keep the rack, mark the blocked slots unusable"
            className={btnCls(mode === 'absorb')} style={{ minWidth: 0 }}>
            Absorb
          </button>
          <button onClick={removeSection} disabled={!canRemove}
            title={canRemove
              ? 'Delete the bay the column lands in'
              : 'This rack has no separate bay to remove'}
            className={btnCls(false)} style={{ minWidth: 0 }}>
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
  const { rackConflicts, aisleBlocks, pickBlocks = [], uprightHits = [], summary } = result
  const objects = useCanvasStore(s => s.objects)
  const blocked = (aisleBlocks || []).filter(a => a.blocked)
  const profileTravelFt = mheOptions[mheKey]?.travelFt ?? 8

  const clean = !rackConflicts.length && !blocked.length && !pickBlocks.length && !uprightHits.length

  return (
    <SectionHeader title="Column Check" defaultOpen={true}>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        {/* Forklift — the project's (Project setup), the same value that drives the generated aisle width */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Forklift size={16} strokeWidth={1.5} absoluteStrokeWidth
            style={{ color: 'var(--steel)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--steel)', width: 32, flexShrink: 0 }}>MHE</span>
          {/* the project's forklift (Project setup); the aisle widths follow it */}
          <span aria-label="Forklift" title="Set in Project setup" style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mheOptions[mheKey]?.label || mheKey}</span>
        </div>

        {clean ? (
          <div style={S.cap}>
            No column interference.
          </div>
        ) : (
          <>
            {/* Layout-wide totals, straight off summary */}
            <div style={{
              display: 'flex', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--line)',
            }}>
              <Stat big label="If absorbed" value={`−${summary.positionsLostIfAbsorb}`} />
              <Stat big label="If removed" value={`−${summary.sectionsLostIfRemove}`} tone="bad" />
            </div>

            <div style={{ ...S.cap, overflowWrap: 'anywhere' }}>
              {rackConflicts.length} column{rackConflicts.length === 1 ? '' : 's'} in racks
              {blocked.length > 0 && ` · ${blocked.length} aisle${blocked.length === 1 ? '' : 's'} blocked`}
              {summary.positionsLostToPickZone > 0 && ` · −${summary.positionsLostToPickZone} blocked from the aisle`}
              {summary.columnsOnUprights > 0 && ` · ${summary.columnsOnUprights} on upright frame${summary.columnsOnUprights === 1 ? '' : 's'}`}
            </div>

            {blocked.map((a, i) => (
              <Note key={i} level="error">
                {a.level === 1
                  ? <>Aisle blocked · {a.clearFt}ft clear of {a.aisleFt}ft
                      — {summary.profile} needs {profileTravelFt}ft to drive through</>
                  : <>One-side pick only · {a.clearFt}ft clear of {a.aisleFt}ft
                      — {summary.profile} needs {mheOptions[mheKey]?.aisleFt}ft to pick both sides</>}
              </Note>
            ))}

            {/* Can't be built: a column through an upright frame. Flagged only —
                nothing here moves the rack; the dealer resolves it. */}
            {uprightHits.map((h, i) => (
              <Note key={'up' + i} level="warning" data-testid="column-on-upright">
                <span><strong style={{ fontWeight: 600 }}>Column on upright frame</strong>
                {' · '}{objects.find(o => o.id === h.rackId)?.label || 'Rack'}
                {' · '}{uprightBayText(h)}
                {' · column '}{h.columnIndex + 1}</span>
              </Note>
            ))}

            {rackConflicts.map((c, i) => (
              <ConflictCard key={conflictKey(c)} conflict={c} index={i} />
            ))}
          </>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)',
        }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-2)', minWidth: 0 }} title="A column with clear space on only one side is accessible by default (drivable + pickable from the far side). Turn this on to flag those too.">
            Require pick from both sides
          </span>
          <button onClick={() => setPickBothSides(!pickBothSides)} role="switch" aria-checked={pickBothSides}
            aria-label="Require pick from both sides"
            style={{
              position: 'relative', width: 32, height: 18, borderRadius: 2, border: 'none',
              cursor: 'pointer', flexShrink: 0, padding: 0,
              background: pickBothSides ? 'var(--pine)' : 'var(--line-2)',
              transition: 'background 0.16s',
            }}>
            <span style={{
              position: 'absolute', top: 2, left: pickBothSides ? 16 : 2, width: 14, height: 14,
              borderRadius: 2, transition: 'left 0.16s',
              background: 'var(--paper)',
            }} />
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)',
        }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-2)', minWidth: 0 }}>Show markings</span>
          <button onClick={() => setShowMarks(!showMarks)} role="switch" aria-checked={showMarks}
            aria-label="Show markings"
            style={{
              position: 'relative', width: 32, height: 18, borderRadius: 2, border: 'none',
              cursor: 'pointer', flexShrink: 0, padding: 0,
              background: showMarks ? 'var(--pine)' : 'var(--line-2)',
              transition: 'background 0.16s',
            }}>
            <span style={{
              position: 'absolute', top: 2, left: showMarks ? 16 : 2, width: 14, height: 14,
              borderRadius: 2, transition: 'left 0.16s',
              background: 'var(--paper)',
            }} />
          </button>
        </div>

      </div>
    </SectionHeader>
  )
}
