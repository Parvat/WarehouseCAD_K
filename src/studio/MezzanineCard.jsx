// MezzanineCard.jsx — (r9-mezzanine) the card of a mezzanine, built on racks/mezzanine.js. The head: "M1 · 30 × 20 ft ·
// 600 sq ft · deck 10 ft" (m and m² in metric); then Size (Width, Depth, Deck height, Column spacing — auto-fitted to whole
// bays), Deck (type, Handrail on open edges), Stairs and gates (counts; each one is dragged along the edges on the plan),
// and its checks (warnings, not errors). Every field is one undo; lengths in the project's units.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { Head, Sec, Field, Grid2, NumInput, ToggleRow, SelectField, Hint, Caption } from './cardParts'
import { CardLock } from './CardLock'
import { Inches, laneTag } from './LaneCard'
import { mezzSpec, mezzChange, mezzHeadline, DECK_TYPES } from '../racks/mezzanine'
import { mezzWarnings } from '../racks/mezzCheck'
import { useUnits } from '../utils/units'

const n = (v) => Math.round(v * 100) / 100

export function MezzanineCard({ obj }) {
  const { objects, gridSize, T } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize || 40, T: s.elevations })))
  const metric = useUnits(u => !!u.metric)
  const s = mezzSpec(obj, gridSize)
  const tag = useMemo(() => laneTag(objects, obj, gridSize, T), [objects, obj, gridSize, T])
  const warns = useMemo(() => mezzWarnings(objects, gridSize).filter(w => w.id === obj.id), [objects, gridSize, obj.id])
  const set = (p) => useCanvasStore.getState().commitObjectUpdate(obj.id, mezzChange(obj, p, gridSize))
  return (
    <div data-mezz-card style={{ display: 'contents' }}>
      <Head caption={mezzHeadline(obj, tag, gridSize, metric)} right={<CardLock obj={obj} />} />
      <Sec aria-label="Size">
        <Caption>Size</Caption>
        <Grid2>
          <Field label="Width (in)"><Inches aria="Width (in)" value={n(s.wIn)} onCommit={v => v > 0 && set({ widthIn: v })} /></Field>
          <Field label="Depth (in)"><Inches aria="Depth (in)" value={n(s.hIn)} onCommit={v => v > 0 && set({ depthIn: v })} /></Field>
          <Field label="Deck height (in)"><Inches aria="Deck height (in)" value={s.deckHeightIn} options={[96, 120, 144, 168]} onCommit={v => v > 0 && set({ deckHeightIn: v })} /></Field>
          <Field label="Column spacing (in)"><Inches aria="Column spacing (in)" value={s.colSpacingIn} options={[180, 240, 300]} onCommit={v => v > 0 && set({ colSpacingIn: v })} /></Field>
        </Grid2>
        <span data-mezz-grid style={{ display: 'contents' }}><Hint>{`${s.baysX} × ${s.baysY} bays · columns at ${n(s.spacingXIn / 12)} × ${n(s.spacingYIn / 12)} ft`}</Hint></span>
      </Sec>
      <Sec aria-label="Deck">
        <Caption>Deck</Caption>
        <Field label="Deck type">
          <SelectField words aria="Deck type" value={s.deckType} onChange={e => set({ deckType: e.target.value })}>
            {DECK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectField>
        </Field>
        <ToggleRow label="Handrail on open edges" aria="Handrail on open edges" on={s.handrail} onClick={() => set({ handrail: !s.handrail })} />
      </Sec>
      <Sec aria-label="Stairs and gates">
        <Caption>Stairs and gates</Caption>
        <Grid2>
          <Field label="Stairs"><NumInput aria="Stairs" value={s.stairs.length} min={0} step={1} onCommit={v => { if (v >= 0) set({ stairCount: Math.round(v) }) }} /></Field>
          <Field label="Pallet gates"><NumInput aria="Pallet gates" value={s.gates.length} min={0} step={1} onCommit={v => { if (v >= 0) set({ gateCount: Math.round(v) }) }} /></Field>
        </Grid2>
        <Hint>{`Each stair 4 ft wide, ${n(s.stairRunIn / 12)} ft run · drag a stair or a gate along the edges.`}</Hint>
      </Sec>
      {warns.length > 0 && (
        <Sec aria-label="Checks">
          <Caption>Checks</Caption>
          {warns.map((w, i) => <span key={i} data-mezz-warn={w.kind} style={{ display: 'contents' }}><Hint>{w.text}</Hint></span>)}
        </Sec>
      )}
    </div>
  )
}
