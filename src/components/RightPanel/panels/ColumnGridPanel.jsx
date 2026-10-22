import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { getObjectBounds } from '../../../utils/canvas'
import { C, MONO, fieldBox, Grid2, Seg, Btn, Totals, SecLabel, Hint, ToggleRow } from '../../../studio/cardParts'

// ── Column Grid Panel ─────────────────────────────────────────────────────────
const COL_SIZES_IN = [12, 18, 24]

/* a caption over a control group (a div, not a <label>: a label would forward its clicks to the first button) */
const Labeled = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><SecLabel>{label}</SecLabel>{children}</div>
)

export function ColumnGridPanel({ obj }) {
  const { updateObject, commitObjectUpdate, gridSize } = useCanvasStore(useShallow(s => ({ updateObject: s.updateObject, commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize })))

  const spacingX    = obj.spacingX    || [40*gridSize]
  const spacingY    = obj.spacingY    || [40*gridSize]
  const colSizeIn   = obj.colSizeIn   || 12
  const showGrid    = obj.showGrid    !== false
  const wallAttached= obj.wallAttached !== false  // Fix 3: wall-attached default true

  const fmtIn = (px) => {
    const totalIn = (px / gridSize) * 12
    const ft = Math.floor(totalIn / 12), inc = Math.round(totalIn % 12)
    return inc === 0 ? `${ft}'` : `${ft}' ${inc}"`
  }

  const updateSpacing = (axis, idx, newFt) => {
    const newPx = newFt * gridSize
    const arr = axis === 'x' ? [...spacingX] : [...spacingY]
    arr[idx] = newPx
    const key = axis === 'x' ? 'spacingX' : 'spacingY'
    const colW = obj.columnW || (colSizeIn/12)*gridSize
    const colH = obj.columnH || (colSizeIn/12)*gridSize
    // Recalculate width/height
    const newW = (axis === 'x' ? arr : spacingX).reduce((s,v)=>s+v,0) + colW
    const newH = (axis === 'y' ? arr : spacingY).reduce((s,v)=>s+v,0) + colH
    commitObjectUpdate(obj.id, { [key]: arr, width: newW, height: newH })
  }

  const addBay = (axis) => {
    const arr = axis === 'x' ? [...spacingX, spacingX[spacingX.length-1]||40*gridSize]
                              : [...spacingY, spacingY[spacingY.length-1]||40*gridSize]
    const key = axis === 'x' ? 'spacingX' : 'spacingY'
    const colW = obj.columnW || (colSizeIn/12)*gridSize
    const colH = obj.columnH || (colSizeIn/12)*gridSize
    const newW = (axis === 'x' ? arr : spacingX).reduce((s,v)=>s+v,0) + colW
    const newH = (axis === 'y' ? arr : spacingY).reduce((s,v)=>s+v,0) + colH
    commitObjectUpdate(obj.id, { [key]: arr, width: newW, height: newH })
  }

  const removeBay = (axis) => {
    const arr = axis === 'x'
      ? (spacingX.length > 1 ? spacingX.slice(0,-1) : spacingX)
      : (spacingY.length > 1 ? spacingY.slice(0,-1) : spacingY)
    const key = axis === 'x' ? 'spacingX' : 'spacingY'
    const colW = obj.columnW || (colSizeIn/12)*gridSize
    const colH = obj.columnH || (colSizeIn/12)*gridSize
    const newW = (axis === 'x' ? arr : spacingX).reduce((s,v)=>s+v,0) + colW
    const newH = (axis === 'y' ? arr : spacingY).reduce((s,v)=>s+v,0) + colH
    commitObjectUpdate(obj.id, { [key]: arr, width: newW, height: newH })
  }

  const changeColSize = (sizeIn) => {
    const colPx = (sizeIn/12)*gridSize
    const newW = spacingX.reduce((s,v)=>s+v,0) + colPx
    const newH = spacingY.reduce((s,v)=>s+v,0) + colPx
    commitObjectUpdate(obj.id, { colSizeIn: sizeIn, columnW: colPx, columnH: colPx, width: newW, height: newH })
  }

  const unit = { fontFamily: MONO, fontSize: 12, color: C.muted }

  const SpacingRow = ({ label, arr, axis }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <SecLabel>{label} bays ({arr.length})</SecLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {arr.map((s, i) => {
          const ftVal = Math.round((s / gridSize) * 10) / 10
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ ...unit, minWidth: 22 }}>B{i+1}</span>
              <input
                type="text"
                className="st-field"
                defaultValue={Math.round(ftVal)}
                onFocus={e => e.target.select()}
                onBlur={e => {
                  const ft = parseFloat(e.target.value)
                  if (!isNaN(ft) && ft > 0) updateSpacing(axis, i, ft)
                  else e.target.value = Math.round(ftVal)
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                style={{ ...fieldBox(), width: 64, flex: 'none', textAlign: 'right' }}
              />
              <span style={unit}>ft</span>
              <span style={{ ...unit, marginLeft: 'auto', color: C.text }}>{fmtIn(s)}</span>
            </div>
          )
        })}
      </div>
      <Grid2>
        <Btn kind="ghost" onClick={() => addBay(axis)}>+ Bay</Btn>
        <Btn kind="danger" onClick={() => removeBay(axis)} disabled={arr.length<=1}
          style={arr.length>1 ? undefined : { color: C.faint, cursor: 'not-allowed' }}>- Bay</Btn>
      </Grid2>
    </div>
  )

  /* Studio card: a column of card parts; PropertiesPanel wraps it in the card block (padding 12px 16px). */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

      {/* Status */}
      <Totals items={[
        { label: 'Columns', value: (spacingX.length+1) * (spacingY.length+1) },
        { label: 'Grid size', value: `${fmtIn(obj.width)} x ${fmtIn(obj.height)}` },
      ]} />

      {/* Column size */}
      <Labeled label="Column">
        <Seg mono aria="Column size" value={colSizeIn} onChange={changeColSize}
          options={COL_SIZES_IN.map(s => ({ value: s, label: `${s}"` }))} />
      </Labeled>

      {/* Show/hide grid lines */}
      <ToggleRow label={<span style={{ color: C.text, fontSize: 13 }}>Grid <span style={{ color: C.muted, fontSize: 12 }}>{showGrid ? 'Visible' : 'Hidden'}</span></span>}
        aria="Grid lines" on={showGrid} onClick={() => commitObjectUpdate(obj.id, { showGrid: !showGrid })} />

      {/* Wall-attached toggle (Fix 3) */}
      <Labeled label="Walls">
        <Seg aria="Walls" value={wallAttached} onChange={v => commitObjectUpdate(obj.id, { wallAttached: v })}
          options={[{ value: true, label: 'Attached' }, { value: false, label: 'Free' }]} />
      </Labeled>
      {!wallAttached && (
        <Hint>Free-standing -- columns do not connect to walls</Hint>
      )}

      <div style={{ height: 1, background: C.divider, margin: '4px 0' }} />

      {/* X spacing */}
      <SpacingRow label="Column (X)" arr={spacingX} axis="x" />

      {/* Y spacing */}
      <SpacingRow label="Row (Y)" arr={spacingY} axis="y" />

    </div>
  )
}
