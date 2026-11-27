// CantileverCard.jsx — (r6-cantilever) the card of a cantilever, built on racks/cantilever.js. The head: "C1 · 4 columns ·
// 3 bays · 3 levels · single-sided"; then Size (Sides, Columns, Column spacing, Arm length), Arms (Arm levels, First arm
// height, Column height, Arm type, Base length) and its load spots. Every field is one undo (commitObjectUpdate); a length
// is typed in any form the project's units read and shown in them; a list opens attached to its field, Custom allowed.
// Columns, spacing, arm length and sides resize it from its anchored corner (cantChange).
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { Head, Sec, Field, Grid2, NumInput, Seg, Btn, Hint, Caption } from './cardParts'
import { CardLock } from './CardLock'
import { Inches, laneTag } from './LaneCard'
import { cantSpec, cantChange, cantSpots, cantHeadline, CANT_ARM_IN, CANT_SPACING_IN, CANT_HEIGHT_IN, ARM_TYPES } from '../racks/cantilever'
import { rackUsable } from '../utils/rackUsable'
import { useColumnCheck } from '../generate/useColumnCheck'

const n = (v) => Math.round(v * 100) / 100

export function CantileverCard({ obj }) {
  const { objects, gridSize, T } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize || 40, T: s.elevations })))
  const { profile } = useColumnCheck()
  const s = cantSpec(obj, gridSize)
  const tag = useMemo(() => laneTag(objects, obj, gridSize, T), [objects, obj, gridSize, T])
  const use = rackUsable(objects, obj, gridSize, profile)
  const set = (p) => useCanvasStore.getState().commitObjectUpdate(obj.id, cantChange(obj, p, gridSize))
  const spots = cantSpots(s), pl = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`
  return (
    <div data-cant-card style={{ display: 'contents' }}>
      <Head caption={cantHeadline(obj, tag, gridSize)} right={<CardLock obj={obj} />} />
      <Sec aria-label="Size">
        <Caption>Size</Caption>
        <Field label="Sides">
          <Seg aria="Sides" value={s.doubleSided ? 'double' : 'single'} onChange={(v) => { if ((v === 'double') !== s.doubleSided) set({ doubleSided: v === 'double' }) }}
            options={[{ value: 'single', label: 'Single', aria: 'Single' }, { value: 'double', label: 'Double', aria: 'Double' }]} />
        </Field>
        <Grid2>
          <Field label="Columns"><NumInput aria="Columns" value={s.columns} min={2} step={1} onCommit={v => { if (v >= 2) set({ columns: Math.round(v) }) }} /></Field>
          <Field label="Column spacing (in)"><Inches aria="Column spacing (in)" value={s.spacingIn} options={CANT_SPACING_IN} onCommit={v => v > 0 && set({ spacingIn: v })} /></Field>
          <Field label="Arm length (in)"><Inches aria="Arm length (in)" value={s.armIn} options={CANT_ARM_IN} onCommit={v => v > 0 && set({ armIn: v })} /></Field>
        </Grid2>
      </Sec>
      <Sec aria-label="Arms">
        <Caption>Arms</Caption>
        <Grid2>
          <Field label="Arm levels"><NumInput aria="Arm levels" value={s.levels} min={1} step={1} onCommit={v => { if (v >= 1) set({ levels: Math.round(v) }) }} /></Field>
          <Field label="First arm height (in)"><Inches aria="First arm height (in)" value={s.firstArmIn} onCommit={v => set({ firstArmIn: v })} /></Field>
          <Field label="Column height (in)"><Inches aria="Column height (in)" value={s.columnHeightIn} options={CANT_HEIGHT_IN} onCommit={v => v > 0 && set({ columnHeightIn: v })} /></Field>
          <Field label="Base length (in)"><Inches aria="Base length (in)" value={s.baseIn} onCommit={v => v > 0 && set({ baseIn: Math.abs(v - (s.armIn + 6)) < 1e-6 ? null : v })} /></Field>
        </Grid2>
        <Field label="Arm type">
          <Seg aria="Arm type" value={s.armType} onChange={(v) => { if (v !== s.armType) set({ armType: v }) }}
            options={ARM_TYPES.map(t => ({ ...t, aria: t.label }))} />
        </Field>
        {s.baseTyped && <Btn kind="ghost" aria-label="Base from the arm" onClick={() => set({ baseIn: null })}>{`Back to arm + 6 in (${n(s.armIn + 6)} in)`}</Btn>}
      </Sec>
      <Sec aria-label="Load spots">
        <Caption>Load spots</Caption>
        <span data-cant-spots={spots} style={{ display: 'contents' }}><Hint>{`${pl(s.bays, 'bay')} × ${pl(s.levels, 'level')} × ${pl(s.sides, 'side')} = ${spots} load spot${spots === 1 ? '' : 's'}`}</Hint></span>
        <span data-cant-usable={use.usable} style={{ display: 'contents' }}><Hint>{`${use.usable} of ${use.boxes} arm bay${use.boxes === 1 ? '' : 's'} usable${use.lost ? ` · ${use.lost} lost` : ''} · loads, not pallet positions`}</Hint></span>
      </Sec>
    </div>
  )
}
