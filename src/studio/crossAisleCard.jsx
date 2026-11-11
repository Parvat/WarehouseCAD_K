import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useCrossAislePick, pickedCrossAisle, positionFt, runsAt, bayPitch, moveCrossAisle } from '../utils/crossAisleTool'
import { setCrossAisleWidth, deleteCrossAisle } from '../utils/crossAisleCut'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { ftIn, sizeWords } from '../utils/bom'
import { Head, Sec, Field, TextInput, Row, Hint, Btn, C, MONO } from './cardParts'

/* A picked cross-aisle in the right card (STUDIO.md §7a Cross-aisles): its place from the start wall — typed: it moves
   there in whole bays, as far as 3 bays a run allow, one undo — the runs either side, its Width — typed: the run after it
   starts that far from the run before it (utils/crossAisleCut.js, xaisle-tool), one undo — and Delete: its rows joined
   again (Delete or Backspace too). */
const feetOf = (t) => parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"').replace(/\s*ft\s*/g, "'").replace(/\s*in\s*/g, '"'))

export function CrossAisleCard() {
  const pick = useCrossAislePick(s => s.pick)
  const { objects, gs } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40 })))
  const c = pickedCrossAisle(objects, pick)
  if (!c) return null
  const at = positionFt(objects, c, gs), runs = runsAt(objects, c, 0, gs), pitchFt = bayPitch(c, gs) / gs
  const fmt = (ft) => sizeWords(ftIn(ft * 12))
  const commit = (t) => {
    const ft = feetOf(t)
    if (ft == null) return
    const d = Math.round((ft - at) / pitchFt)
    if (d) moveCrossAisle(useCanvasStore, c, d)
  }
  const width = (t) => { const ft = feetOf(t); if (ft != null && ft > 0 && Math.abs(ft - runs.w) > 1e-3) setCrossAisleWidth(useCanvasStore, c, ft) }
  return (
    <>
      <Head caption="Cross-aisle" />
      <Sec aria-label="Cross-aisle settings">
        <Field label="Position from start wall" title="From the building's inner wall at the run's start (the left, the top) to the aisle — in whole bays">
          <TextInput aria="Cross-aisle position" value={fmt(at)} onCommit={commit} />
        </Field>
        <Row label="Runs"><span data-cross-runs style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{runs.a} bays · {runs.b} bays</span></Row>
        <Field label="Width" title="The run after it starts this far from the run before it — whole bays to where the row ended">
          <TextInput aria="Cross-aisle width" value={fmt(runs.w)} onCommit={width} />
        </Field>
        <Hint>Drag it along the run to move it a bay at a time. A run stays at least 3 bays.</Hint>
        <Btn kind="ghost" aria-label="Delete cross-aisle" title="Delete (Del) — its rows join again" onClick={() => deleteCrossAisle(useCanvasStore, c)}>Delete</Btn>
      </Sec>
    </>
  )
}
