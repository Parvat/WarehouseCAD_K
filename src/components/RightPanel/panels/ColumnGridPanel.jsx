import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { getObjectBounds } from '../../../utils/canvas'

// ── Column Grid Panel ─────────────────────────────────────────────────────────
const COL_SIZES_IN = [12, 18, 24]

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

  /* Words PJS (labels steel 12), figures mono (.t-num). Option buttons are 32px secondaries, the picked one pine
     (.is-on); "+ Bay" secondary, "- Bay" danger, disabled by the attribute alone. Status is a white card, radius 4. */
  const lbl = (s) => <span className="t-label" style={{ width: 56, flexShrink: 0 }}>{s}</span>
  const opt = (active) => 't-btn t-btn--secondary' + (active ? ' is-on' : '')
  const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }
  const statLbl = { fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--steel)' }

  const SpacingRow = ({ label, arr, axis }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="t-cap">
        {label} bays ({arr.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {arr.map((s, i) => {
          const ftVal = Math.round((s / gridSize) * 10) / 10
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span className="t-num" style={{ fontSize: 12, color: 'var(--steel)', width: 24, flexShrink: 0 }}>B{i+1}</span>
              <span className="t-field" style={{ flex: '0 1 96px' }}>
              <input
                type="text"
                defaultValue={Math.round(ftVal)}
                onFocus={e => e.target.select()}
                onBlur={e => {
                  const ft = parseFloat(e.target.value)
                  if (!isNaN(ft) && ft > 0) updateSpacing(axis, i, ft)
                  else e.target.value = Math.round(ftVal)
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                className="t-input"
                style={{ textAlign: 'right' }}
              />
              <span className="t-unit">ft</span>
              </span>
              <span className="t-num" style={{ fontSize: 12, color: 'var(--ink-2)', minWidth: 0 }}>{fmtIn(s)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => addBay(axis)} className="t-btn t-btn--secondary" style={{ flex: 1 }}>+ Bay</button>
        <button onClick={() => removeBay(axis)} disabled={arr.length<=1} className="t-btn t-btn--danger">- Bay</button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

      {/* Status */}
      <div style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--paper)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={statRow}>
          <span style={statLbl}>Columns</span>
          <span className="t-num" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{(spacingX.length+1) * (spacingY.length+1)}</span>
        </div>
        <div style={statRow}>
          <span style={statLbl}>Grid size</span>
          <span className="t-num" style={{ fontSize: 13, color: 'var(--ink)' }}>{fmtIn(obj.width)} x {fmtIn(obj.height)}</span>
        </div>
      </div>

      {/* Column size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {lbl('Column')}
        {COL_SIZES_IN.map(s => (
          <button key={s} onClick={() => changeColSize(s)} className={opt(colSizeIn === s) + ' t-num'} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontWeight: 400 }}>{s}"</button>
        ))}
      </div>

      {/* Show/hide grid lines */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {lbl('Grid')}
        <button onClick={() => commitObjectUpdate(obj.id, { showGrid: !showGrid })}
          className={opt(showGrid)} style={{ flex: 1, minWidth: 0 }}>
          {showGrid ? '* Visible' : 'o Hidden'}
        </button>
      </div>

      {/* Wall-attached toggle (Fix 3) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {lbl('Walls')}
        <button onClick={() => commitObjectUpdate(obj.id, { wallAttached: true })}
          className={opt(wallAttached)} style={{ flex: 1, minWidth: 0 }}>Attached</button>
        <button onClick={() => commitObjectUpdate(obj.id, { wallAttached: false })}
          className={opt(!wallAttached)} style={{ flex: 1, minWidth: 0 }}>Free</button>
      </div>
      {!wallAttached && (
        <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--steel)', lineHeight: 1.5 }}>
          Free-standing -- columns do not connect to walls
        </div>
      )}

      {/* X spacing */}
      <SpacingRow label="Column (X)" arr={spacingX} axis="x" />

      {/* Y spacing */}
      <SpacingRow label="Row (Y)" arr={spacingY} axis="y" />

    </div>
  )
}

