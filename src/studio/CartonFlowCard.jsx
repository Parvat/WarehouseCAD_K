// CartonFlowCard.jsx — (r8-carton-flow) the card of a carton flow, built on racks/cartonFlow.js. The head: "K1 · 3 bays ·
// 4 levels · 72 carton lanes"; then Size (Bays, Bay width, Depth), Levels (Levels, Lanes per level, Frame height, the pitch —
// card only) and its carton lanes (not pallet positions). Every field is one undo; lengths in the project's units; a list
// opens attached to its field, Custom allowed.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { Head, Sec, Field, Grid2, NumInput, Hint, Caption } from './cardParts'
import { CardLock } from './CardLock'
import { Inches, laneTag } from './LaneCard'
import { cartonSpec, cartonChange, cartonLanes, cartonHeadline, CARTON_BAY_IN, CARTON_DEPTH_IN, CARTON_HEIGHT_IN } from '../racks/cartonFlow'
import { rackUsable } from '../utils/rackUsable'
import { useColumnCheck } from '../generate/useColumnCheck'

export function CartonFlowCard({ obj }) {
  const { objects, gridSize, T } = useCanvasStore(useShallow(s => ({ objects: s.objects, gridSize: s.gridSize || 40, T: s.elevations })))
  const { profile } = useColumnCheck()
  const s = cartonSpec(obj, gridSize)
  const tag = useMemo(() => laneTag(objects, obj, gridSize, T), [objects, obj, gridSize, T])
  const use = rackUsable(objects, obj, gridSize, profile)
  const set = (p) => useCanvasStore.getState().commitObjectUpdate(obj.id, cartonChange(obj, p, gridSize))
  const lanes = cartonLanes(s), perBay = s.levels * s.lanesPerLevel
  return (
    <div data-carton-card style={{ display: 'contents' }}>
      <Head caption={cartonHeadline(obj, tag, gridSize)} right={<CardLock obj={obj} />} />
      <Sec aria-label="Size">
        <Caption>Size</Caption>
        <Grid2>
          <Field label="Bays"><NumInput aria="Bays" value={s.bays} min={1} step={1} onCommit={v => { if (v >= 1) set({ bays: Math.round(v) }) }} /></Field>
          <Field label="Bay width (in)"><Inches aria="Bay width (in)" value={s.bayWidthIn} options={CARTON_BAY_IN} onCommit={v => v > 0 && set({ bayWidthIn: v })} /></Field>
          <Field label="Depth (in)"><Inches aria="Depth (in)" value={s.depthIn} options={CARTON_DEPTH_IN} onCommit={v => v > 0 && set({ depthIn: v })} /></Field>
        </Grid2>
        <Hint>LOAD at the back, PICK at the front.</Hint>
      </Sec>
      <Sec aria-label="Levels">
        <Caption>Levels</Caption>
        <Grid2>
          <Field label="Levels"><NumInput aria="Levels" value={s.levels} min={1} step={1} onCommit={v => { if (v >= 1) set({ levels: Math.round(v) }) }} /></Field>
          <Field label="Lanes per level"><NumInput aria="Lanes per level" value={s.lanesPerLevel} min={1} step={1} onCommit={v => { if (v >= 1) set({ lanesPerLevel: Math.round(v) }) }} /></Field>
          <Field label="Frame height (in)"><Inches aria="Frame height (in)" value={s.frameHeightIn} options={CARTON_HEIGHT_IN} onCommit={v => v > 0 && set({ frameHeightIn: v })} /></Field>
        </Grid2>
        <span data-carton-pitch style={{ display: 'contents' }}><Hint>{`Pitch about ${s.pitchInPerFt} in per ft`}</Hint></span>
      </Sec>
      <Sec aria-label="Carton lanes">
        <Caption>Carton lanes</Caption>
        <span data-carton-lanes={lanes} style={{ display: 'contents' }}><Hint>{`${s.bays} bay${s.bays === 1 ? '' : 's'} × ${s.levels} level${s.levels === 1 ? '' : 's'} × ${s.lanesPerLevel} lane${s.lanesPerLevel === 1 ? '' : 's'} = ${lanes} carton lane${lanes === 1 ? '' : 's'}`}</Hint></span>
        <span data-carton-usable={use.usable * perBay} style={{ display: 'contents' }}><Hint>{`${use.usable * perBay} of ${use.boxes * perBay} usable${use.lost ? ` · ${use.lost * perBay} lost` : ''} · cartons, not pallet positions`}</Hint></span>
      </Sec>
    </div>
  )
}
