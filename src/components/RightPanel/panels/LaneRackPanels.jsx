import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { withAnchoredPosition } from '../../../utils/bayAnchor'
import { getObjectBounds } from '../../../utils/canvas'
import { getRackCapacity } from '../../../utils/capacity'
import { C, fieldBox, Grid2, Seg, Totals, SecLabel, Hint, Note, Row } from '../../../studio/cardParts'

/* ── Studio card parts shared by the lane racks (presentation only; every panel keeps its own recalc) ──
   Each panel returns a column of card parts; PropertiesPanel wraps it in the card block (padding 12px 16px). */
const col = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }

/* a caption over a control group (a div, not a <label>: a label would forward its clicks to the first button) */
const Labeled = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><SecLabel>{label}</SecLabel>{children}</div>
)

/** "Mode  FIFO — …" read-out line. */
const ModeLine = ({ children }) => (
  <Row label={<SecLabel>Mode</SecLabel>}><span style={{ color: C.accent, fontSize: 12, textAlign: 'right' }}>{children}</span></Row>
)

/** A whole-number field written on blur / Enter (uncontrolled, re-keyed on the value as before). */
const CountInput = ({ label, val, inputKey, onCommit, hint, aria }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
    <SecLabel>{label}</SecLabel>
    <input type="text" className="st-field" aria-label={aria} defaultValue={val} key={inputKey}
      onFocus={e => e.target.select()}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      onBlur={e => { const v = parseInt(e.target.value); if (v > 0) onCommit(v); else e.target.value = val }}
      style={fieldBox()} />
    {hint != null && <Hint>{hint}</Hint>}
  </label>
)

const PALLET_SIZES = [{w:48,d:48},{w:40,d:48},{w:48,d:40}]

/** Lanes + Deep fields, Upright, Pallet size — the body every lane rack shares. */
function LaneControls({ obj, lanes, palletDeep, palletWIn, palletDIn, upIn, recalc, deepUnit }) {
  return (
    <>
      {/* Lanes + Deep — input boxes, select on focus */}
      <Grid2>
        <CountInput label="Lanes" val={lanes} inputKey={`Lanes-${obj.id}-${lanes}`} hint={`${lanes+1} uprights`}
          onCommit={v => recalc(v, palletDeep, palletWIn, palletDIn, upIn)} />
        <CountInput label="Deep" val={palletDeep} inputKey={`Deep-${obj.id}-${palletDeep}`} hint={`${lanes*palletDeep} ${deepUnit}`}
          onCommit={v => recalc(lanes, v, palletWIn, palletDIn, upIn)} />
      </Grid2>

      {/* Upright width */}
      <Labeled label="Upright">
        <Seg mono aria="Upright width" value={upIn} onChange={n => recalc(lanes, palletDeep, palletWIn, palletDIn, n)}
          options={[3,4].map(n => ({ value: n, label: `${n}"` }))} />
      </Labeled>

      {/* Pallet size */}
      <Labeled label="Pallet size (in)">
        <Seg mono aria="Pallet size"
          options={PALLET_SIZES.map(p => ({ value: `${p.w}x${p.d}`, label: `${p.w}x${p.d}"`, on: palletWIn===p.w&&palletDIn===p.d,
            onClick: () => recalc(lanes, palletDeep, p.w, p.d, upIn) }))} />
      </Labeled>
    </>
  )
}

// ── Drive-In Panel ───────────────────────────────────────────────────────────
export function DriveInPanel({ obj }) {
  const { commitObjectUpdate, gridSize } = useCanvasStore(useShallow(s => ({ commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize })))
  const lanes      = obj.lanes      || 2
  const palletDeep = obj.palletDeep || 5
  const palletWIn  = obj.palletWIn  || 48
  const palletDIn  = obj.palletDIn  || 48
  const upIn       = obj.uprightWidth || 4

  const recalc = (newLanes, newDeep, newPalletWIn, newPalletDIn, newUpIn) => {
    const upPx    = (newUpIn / 12)  * gridSize
    const ledgePx = (2 / 12)        * gridSize  // 2" ledge each side
    const clearPx = (1 / 12)        * gridSize  // 1" clearance each side
    const palletWPx = (newPalletWIn / 12) * gridSize
    const laneWPx = ledgePx*2 + clearPx*2 + palletWPx  // must match render formula
    const newW = (newLanes+1)*upPx + newLanes*laneWPx
    const newH = newDeep * (newPalletDIn/12)*gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, {
      lanes: newLanes, palletDeep: newDeep,
      palletWIn: newPalletWIn, palletDIn: newPalletDIn,
      uprightWidth: newUpIn, width: newW, height: newH,
    }))
  }

  return (
    <div style={col}>
      {/* Status */}
      <Totals items={[
        { label: 'Capacity', value: `${lanes * palletDeep} PAL`, accent: true },
        { label: 'Footprint', value: `${Math.round(obj.width/gridSize*10)/10}' x ${Math.round(obj.height/gridSize*10)/10}'` },
      ]} />
      <LaneControls obj={obj} lanes={lanes} palletDeep={palletDeep} palletWIn={palletWIn} palletDIn={palletDIn} upIn={upIn}
        recalc={recalc} deepUnit="pal total" />
    </div>
  )
}

// ── Drive-Through Panel (reuses DriveInPanel logic, FIFO label) ─────────────
export function DriveThroughPanel({ obj }) {
  const { commitObjectUpdate, gridSize } = useCanvasStore(useShallow(s => ({ commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize })))
  const lanes      = obj.lanes        || 2
  const palletDeep = obj.palletDeep   || 5
  const palletWIn  = obj.palletWIn    || 40
  const palletDIn  = obj.palletDIn    || 48
  const upIn       = obj.uprightWidth || 4

  const recalc = (newLanes, newDeep, newPWIn, newPDIn, newUpIn) => {
    const upPx    = (newUpIn/12)*gridSize
    const ledgePx = (2/12)*gridSize, clearPx = (1/12)*gridSize
    const palletWPx = (newPWIn/12)*gridSize
    const laneWPx = ledgePx*2 + clearPx*2 + palletWPx
    const newW = (newLanes+1)*upPx + newLanes*laneWPx
    const newH = newDeep * (newPDIn/12)*gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { lanes: newLanes, palletDeep: newDeep, palletWIn: newPWIn, palletDIn: newPDIn, uprightWidth: newUpIn, width: newW, height: newH }))
  }

  return (
    <div style={col}>
      <Totals items={[{ label: 'Capacity', value: `${lanes*palletDeep} PAL`, accent: true }]} />
      <ModeLine>FIFO — load back, pick front</ModeLine>
      <LaneControls obj={obj} lanes={lanes} palletDeep={palletDeep} palletWIn={palletWIn} palletDIn={palletDIn} upIn={upIn}
        recalc={recalc} deepUnit="pal" />
    </div>
  )
}

// ── Pushback Panel ────────────────────────────────────────────────────────────
export function PushbackPanel({ obj }) {
  const { commitObjectUpdate, gridSize } = useCanvasStore(useShallow(s => ({ commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize })))
  const lanes      = obj.lanes        || 2
  const palletDeep = obj.palletDeep   || 2
  const palletWIn  = obj.palletWIn    || 40
  const palletDIn  = obj.palletDIn    || 48
  const upIn       = obj.uprightWidth || 3

  const recalc = (newLanes, newDeep, newPWIn, newPDIn, newUpIn) => {
    const upPx    = (newUpIn/12)*gridSize
    const ledgePx = (2/12)*gridSize, clearPx = (1/12)*gridSize
    const palletWPx = (newPWIn/12)*gridSize
    const laneWPx = ledgePx*2 + clearPx*2 + palletWPx
    const newW = (newLanes+1)*upPx + newLanes*laneWPx
    const newH = newDeep * (newPDIn/12)*gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { lanes: newLanes, palletDeep: newDeep, palletWIn: newPWIn, palletDIn: newPDIn, uprightWidth: newUpIn, width: newW, height: newH }))
  }

  return (
    <div style={col}>
      <Totals items={[{ label: 'Capacity', value: `${lanes*palletDeep} PAL`, accent: true }]} />
      <ModeLine>LIFO — carts on inclined rails</ModeLine>
      {palletDeep > 5 && <Note level="warning">⚠ Pushback typically max 5-deep</Note>}
      <LaneControls obj={obj} lanes={lanes} palletDeep={palletDeep} palletWIn={palletWIn} palletDIn={palletDIn} upIn={upIn}
        recalc={recalc} deepUnit="pal" />
    </div>
  )
}


// ── Pallet Flow Panel ────────────────────────────────────────────────────────
export function PalletFlowPanel({ obj }) {
  const { commitObjectUpdate } = useCanvasStore(useShallow(s => ({ commitObjectUpdate: s.commitObjectUpdate })))
  const palletDeep = obj.palletDeep || 2
  const palletDIn  = obj.palletDIn  || 48

  return (
    <div style={col}>
      <ModeLine>FIFO — gravity fed rollers</ModeLine>

      <Grid2>
        {/* Pallet deep */}
        <CountInput label="Pallet deep" val={palletDeep} inputKey={`pd-${obj.id}-${palletDeep}`} hint="positions"
          onCommit={v => commitObjectUpdate(obj.id,{palletDeep:v})} />

        {/* Pallet depth */}
        <Labeled label="Pallet depth">
          <Seg mono aria="Pallet depth" value={palletDIn} onChange={d => commitObjectUpdate(obj.id,{palletDIn:d})}
            options={[40,48].map(d => ({ value: d, label: `${d}"` }))} />
        </Labeled>
      </Grid2>
    </div>
  )
}
