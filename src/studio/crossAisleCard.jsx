import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useCrossAislePick, pickedCrossAisle, positionFt, runsAt, bayPitch, moveCrossAisle } from '../utils/crossAisleTool'
import { parseFeet } from '../components/RightPanel/panels/RackingAreaPanel'
import { ftIn, sizeWords } from '../utils/bom'
import { Head, Sec, Field, TextInput, Row, Hint, C, MONO } from './cardParts'

/* A picked cross-aisle in the right card (STUDIO.md §7a Cross-aisles, cross-aisle round): its place from the start wall
   — typed: it moves there in whole bays, as far as Max run and 3 bays a run allow, one undo — the runs either side and
   its width. */
export function CrossAisleCard() {
  const pick = useCrossAislePick(s => s.pick)
  const { objects, gs } = useCanvasStore(useShallow(s => ({ objects: s.objects, gs: s.gridSize || 40 })))
  const c = pickedCrossAisle(objects, pick)
  if (!c) return null
  const at = positionFt(objects, c, gs), runs = runsAt(objects, c, 0, gs), pitchFt = bayPitch(c, gs) / gs
  const fmt = (ft) => sizeWords(ftIn(ft * 12))
  const commit = (t) => {
    const ft = parseFeet(String(t).replace(/′/g, "'").replace(/″/g, '"').replace(/\s*ft\s*/g, "'").replace(/\s*in\s*/g, '"'))
    if (ft == null) return
    const d = Math.round((ft - at) / pitchFt)
    if (d) moveCrossAisle(useCanvasStore, c, d)
  }
  return (
    <>
      <Head caption="Cross-aisle" />
      <Sec aria-label="Cross-aisle settings">
        <Field label="Position from start wall" title="From the building's inner wall at the run's start (the left, the top) to the aisle — in whole bays">
          <TextInput aria="Cross-aisle position" value={fmt(at)} onCommit={commit} />
        </Field>
        <Row label="Runs"><span data-cross-runs style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{runs.a} bays · {runs.b} bays</span></Row>
        <Row label="Width"><span data-cross-width style={{ fontFamily: MONO, color: C.strong, fontSize: 12 }}>{fmt(runs.w)}</span></Row>
        <Hint>Drag it along the run to move it a bay at a time. A run stays within Max run and at least 3 bays.</Hint>
      </Sec>
    </>
  )
}
