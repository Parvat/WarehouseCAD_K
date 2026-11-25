// LaneCard.jsx — (r3-drive-in) the card of a lane rack (drive-in, drive-through; push-back R4, pallet flow R5), built on
// the lane engine (racks/laneEngine.js). The head: "D1 · 4 lanes × 5 deep × 4 levels · 80 PAL"; then Size, Pallet,
// Levels, Options. Every field is one undo (commitObjectUpdate); a length is typed in any form the project's units read
// (utils/units.js parseLengthAs — Imperial or Metric) and shown in them; a size with standard values opens its list
// attached to the field (studio/textSizeCard.jsx SizeInput). Lanes, deep, the pallet and the clearance resize the rack
// from its anchored corner (laneChange).
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { Head, Sec, Field, Grid2, NumInput, ToggleRow, Seg, Btn, Hint, Caption } from './cardParts'
import { SizeInput } from './textSizeCard'
import { CardLock } from './CardLock'
import { laneSpec, laneChange, LANE_NAMES, LANE_DEFAULTS } from '../racks/laneEngine'
import { getRackCapacity } from '../utils/capacity'
import { levelsResolver } from '../utils/elevations'
import { rackNumbersNow } from '../utils/rackLines'
import { lineNamer } from '../utils/lineNames'
import { parseLengthAs, showLengthAs, useUnits } from '../utils/units'

const PALLET_W = [40, 42, 48], PALLET_D = [40, 48], CLEAR = [2, 3, 4], POST = [3, 4], SPACING = [48, 54, 60, 66, 72]
const n = (v) => Math.round(v * 100) / 100

/** Its number as the plan draws it (D1 …). */
export function laneTag(objects, o, gridSize = 40, T = null) {
  const l = rackNumbersNow(objects, gridSize).find(x => x.ids.includes(o.id))
  if (!l) return ''
  try { return lineNamer(objects, T, gridSize)(l.no) || l.tag || '' } catch { return l.tag || '' }
}
/** "D1 · 4 lanes × 5 deep × 4 levels · 80 PAL". */
export function laneHeadline(o, { tag = '', levels, pal }) {
  const s = laneSpec(o)
  const pl = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`
  return [tag || null, `${pl(s.lanes, 'lane')} × ${s.deep} deep × ${pl(levels, 'level')}`, `${pal} PAL`].filter(Boolean).join(' · ')
}

/** An inches field in the project's units, with its standard sizes as a list (Custom: type any). */
function Inches({ value, aria, options, onCommit }) {
  const u = useUnits()
  return (
    <SizeInput inches={value} aria={aria} options={options} custom={!!options}
      parse={(t) => { const v = parseLengthAs(t, 'in', u); return v != null && v >= 0 ? n(v) : null }}
      format={(v) => (v === '' || v == null ? '' : showLengthAs(n(v), 'in', u))}
      onCommit={(v) => { if (v != null) onCommit(v) }} />
  )
}

export function LaneCard({ obj }) {
  const { objects, gridSize, T } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize || 40, T: s.elevations })))
  const s = laneSpec(obj, gridSize)
  const cap = getRackCapacity(obj, undefined, levelsResolver(T))
  const levels = cap?.levels ?? s.levels, pal = cap?.total ?? 0
  const tag = useMemo(() => laneTag(objects, obj, gridSize, T), [objects, obj, gridSize, T])
  const set = (p) => { const u = laneChange(obj, p, gridSize); useCanvasStore.getState().commitObjectUpdate(obj.id, u) }
  const raw = (u) => useCanvasStore.getState().commitObjectUpdate(obj.id, u)
  const lanesType = obj.type === 'rack_drive_in' || obj.type === 'rack_drive_through'
  const d = LANE_DEFAULTS[obj.type]
  const heightAuto = s.firstIn + levels * s.spacingIn
  return (
    <div data-lane-card={obj.type} style={{ display: 'contents' }}>
      <Head caption={laneHeadline(obj, { tag, levels, pal })} right={<CardLock obj={obj} />} />
      <Sec aria-label="Size">
        <Caption>Size</Caption>
        {lanesType && (
          <Field label="Type">
            <Seg aria="Lane rack type" value={obj.type} onChange={(t) => { if (t !== obj.type) set({ type: t }) }}
              options={[{ value: 'rack_drive_in', label: 'Drive-in', aria: 'Drive-in' }, { value: 'rack_drive_through', label: 'Drive-through', aria: 'Drive-through' }]} />
          </Field>
        )}
        <Grid2>
          <Field label="Lanes"><NumInput aria="Lanes" value={s.lanes} min={1} step={1} onCommit={v => { if (v >= 1) set({ lanes: Math.round(v) }) }} /></Field>
          <Field label="Deep (pallets)"><NumInput aria="Deep (pallets)" value={s.deep} min={d?.minDeep || 1} step={1} onCommit={v => { if (v >= 1) set({ deep: Math.round(v) }) }} /></Field>
        </Grid2>
        {d?.minDeep && <Hint>{`${d.minDeep} to ${d.maxDeep} deep.`}</Hint>}
        {obj.type === 'rack_drive_in' && (
          <Field label="Entry face">
            <Btn kind="inset" aria-label="Flip entry face" title="The ENTRY face to the other end (the rack turns 180°, its footprint stays)"
              onClick={() => raw({ rotation: (((obj.rotation || 0) + 180) % 360) })}>Flip to the other end</Btn>
          </Field>
        )}
        {obj.type === 'rack_drive_through' && <Hint>Both ends are ENTRY faces.</Hint>}
      </Sec>
      <Sec aria-label="Pallet">
        <Caption>Pallet</Caption>
        <Grid2>
          <Field label="Pallet width (in)"><Inches aria="Pallet width (in)" value={s.palletWIn} options={PALLET_W} onCommit={v => v > 0 && set({ palletWIn: v })} /></Field>
          <Field label="Pallet depth (in)"><Inches aria="Pallet depth (in)" value={s.palletDIn} options={PALLET_D} onCommit={v => v > 0 && set({ palletDIn: v })} /></Field>
          <Field label="Lane clearance (in)"><Inches aria="Lane clearance (in)" value={s.clearIn} options={CLEAR} onCommit={v => set({ clearIn: v })} /></Field>
          <Field label="Post size (in)"><Inches aria="Post size (in)" value={s.postIn} options={POST} onCommit={v => v > 0 && set({ postIn: v })} /></Field>
        </Grid2>
        <Hint data-lane-derived>{`Lane ${showLengthAs(n(s.laneWIn), 'in')} in · depth station ${showLengthAs(n(s.stationIn), 'in')} in`}</Hint>
      </Sec>
      <Sec aria-label="Levels">
        <Caption>Levels</Caption>
        <Grid2>
          <Field label="Levels"><NumInput aria="Levels" value={levels} min={1} step={1} onCommit={v => { if (v >= 1) set({ levels: Math.round(v) }) }} /></Field>
          <Field label={lanesType ? 'First rail (in)' : 'First beam (in)'}><Inches aria={lanesType ? 'First rail (in)' : 'First beam (in)'} value={s.firstIn} onCommit={v => set({ firstIn: v })} /></Field>
          <Field label="Level spacing (in)"><Inches aria="Level spacing (in)" value={s.spacingIn} options={SPACING} onCommit={v => v > 0 && set({ spacingIn: v })} /></Field>
          <Field label="Overall height (in)"><Inches aria="Overall height (in)" value={s.heightTyped ? s.heightIn : heightAuto} onCommit={v => v > 0 && set({ heightIn: Math.abs(v - heightAuto) < 1e-6 ? null : v })} /></Field>
        </Grid2>
        {s.heightTyped && <Btn kind="ghost" aria-label="Height from the levels" onClick={() => set({ heightIn: null })}>{`Back to first + levels × spacing (${n(heightAuto)} in)`}</Btn>}
        {obj.type === 'rack_pallet_flow' && <Hint data-lane-pitch>{`Pitch about ${s.pitchInPerFt ?? 0.375} in per ft`}</Hint>}
      </Sec>
      {lanesType && (
        <Sec aria-label="Options">
          <Caption>Options</Caption>
          <ToggleRow label="Floor guides" aria="Floor guides" on={s.floorGuides} onClick={() => set({ floorGuides: !s.floorGuides })} />
        </Sec>
      )}
    </div>
  )
}
