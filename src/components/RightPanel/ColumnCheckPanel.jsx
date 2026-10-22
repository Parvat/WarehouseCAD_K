import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { useColumnCheck, conflictKey } from '../../generate/useColumnCheck'
import { useRules } from '../../rules/useRules'
import { Icon } from '../../studio/Icon'
import { Row, ToggleRow, Seg, Note, Hint, SecLabel, C, MONO } from '../../studio/cardParts'

/* ── Column check — the absorb vs remove decision ────────────────────────────
   checkColumns hands back both numbers for every conflict. The whole point of
   this panel is to put them side by side: absorbing costs a few pallet
   positions, removing the section costs the whole bay. Removing is always the
   worse of the two, so absorb is the default and the numbers are shown
   together rather than one at a time. */

/* Radii match the CAD's own panels: controls are square-ish at 2px, grouped
   cards get 4px. Anything rounder reads as a web widget pasted onto a
   drawing tool. */

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

function Stat({ label, value, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }} data-tone={tone}>
      <span style={{ fontFamily: MONO, fontSize: 15, color: C.strong }}>{value}</span>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.divider}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: C.strong }}>{rack?.label || 'Rack'} · column <span style={{ fontFamily: MONO }}>{conflict.columnIndex + 1}</span></span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>#{index + 1}</span>
      </div>

      {/* Both numbers, always together — the trade-off is the content. */}
      <div style={{ display: 'flex', gap: 16 }}>
        <Stat label="Absorb" value={`−${conflict.positionsLost}`} />
        <Stat label="Remove section" value={`−${conflict.sectionsLost}`} tone="bad" />
      </div>

      {mode === 'removed' ? (
        <Hint>Section removed · {conflict.sectionsLost} positions gone</Hint>
      ) : (
        <Seg aria="Absorb or remove" options={[
          { value: 'absorb', label: 'Absorb', title: 'Keep the rack, mark the blocked slots unusable', on: mode === 'absorb', onClick: () => setResolution(key, 'absorb') },
          { value: 'remove', label: 'Remove section', on: false, disabled: !canRemove, onClick: removeSection,
            title: canRemove ? 'Delete the bay the column lands in' : 'This rack has no separate bay to remove' },
        ]} />
      )}
    </div>
  )
}

/** The column check's detail (under More): the forklift, the totals, the blocked aisles, columns on frames, each
 *  conflict with Absorb / Remove section; its two switches (the C1 block shows them for a rack, so `toggles` off). */
export function ColumnCheckBody({ toggles = true }) {
  const { result, mheKey, showMarks, setShowMarks, pickBothSides, setPickBothSides } = useColumnCheck()
  const { mheOptions } = useRules()
  const { rackConflicts, aisleBlocks, pickBlocks = [], uprightHits = [], summary } = result
  const objects = useCanvasStore(s => s.objects)
  const blocked = (aisleBlocks || []).filter(a => a.blocked)
  const profileTravelFt = mheOptions[mheKey]?.travelFt ?? 8

  const clean = !rackConflicts.length && !blocked.length && !pickBlocks.length && !uprightHits.length

  return (
    <>
      <SecLabel>Column check</SecLabel>
      {/* Forklift — the project's (Project setup), the same value that drives the generated aisle width */}
      <Row label={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="Forklift" kind="object" /><span style={{ color: C.muted, fontSize: 12 }}>MHE</span></span>}>
        <span aria-label="Forklift" title="Set in Project setup" style={{ color: C.strong }}>{mheOptions[mheKey]?.label || mheKey}</span>
      </Row>

      {clean ? (
        <Hint>No column interference.</Hint>
      ) : (
        <>
          {/* Layout-wide totals, straight off summary */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Stat label="If absorbed" value={`−${summary.positionsLostIfAbsorb}`} />
            <Stat label="If removed" value={`−${summary.sectionsLostIfRemove}`} tone="bad" />
          </div>

          <Hint>
            {rackConflicts.length} column{rackConflicts.length === 1 ? '' : 's'} in racks
            {blocked.length > 0 && ` · ${blocked.length} aisle${blocked.length === 1 ? '' : 's'} blocked`}
            {summary.positionsLostToPickZone > 0 && ` · −${summary.positionsLostToPickZone} blocked from the aisle`}
            {summary.columnsOnUprights > 0 && ` · ${summary.columnsOnUprights} on upright frame${summary.columnsOnUprights === 1 ? '' : 's'}`}
          </Hint>

          {blocked.map((a, i) => (
            <Note key={i} level="error">
              {a.level === 1
                ? <>Aisle blocked · {a.clearFt}ft clear of {a.aisleFt}ft
                    — {summary.profile} needs {profileTravelFt}ft to drive through</>
                : <>One-side pick only · {a.clearFt}ft clear of {a.aisleFt}ft
                    — {summary.profile} needs {mheOptions[mheKey]?.aisleFt}ft to pick both sides</>}
            </Note>
          ))}

          {/* Can't be built: a column through an upright frame. Flagged only — nothing here moves the rack. */}
          {uprightHits.map((h, i) => (
            <Note key={'up' + i} level="warning" data-testid="column-on-upright">
              <strong style={{ fontWeight: 600 }}>Column on upright frame</strong>
              {' · '}{objects.find(o => o.id === h.rackId)?.label || 'Rack'}
              {' · '}{uprightBayText(h)}
              {' · column '}{h.columnIndex + 1}
            </Note>
          ))}

          {rackConflicts.map((c, i) => (
            <ConflictCard key={conflictKey(c)} conflict={c} index={i} />
          ))}
        </>
      )}

      {toggles && (
        <>
          <ToggleRow label="Require pick from both sides" title="A column with clear space on only one side is accessible by default (drivable + pickable from the far side). Turn this on to flag those too."
            on={pickBothSides} onClick={() => setPickBothSides(!pickBothSides)} />
          <ToggleRow label="Show markings" on={showMarks} onClick={() => setShowMarks(!showMarks)} />
        </>
      )}
      <div style={{ height: 1, background: C.divider, margin: '4px 0' }} />
    </>
  )
}

export const ColumnCheckPanel = ColumnCheckBody
