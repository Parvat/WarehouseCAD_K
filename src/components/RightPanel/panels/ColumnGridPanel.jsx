import { useCanvasStore } from '../../../store/useCanvasStore'
import { getObjectBounds } from '../../../utils/canvas'

// ── Column Grid Panel ─────────────────────────────────────────────────────────
const COL_SIZES_IN = [12, 18, 24]

export function ColumnGridPanel({ obj }) {
  const { updateObject, commitObjectUpdate, gridSize } = useCanvasStore()

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

  const lbl = (s) => <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', minWidth: 40 }}>{s}</span>
  const btnStyle = (active) => ({
    padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-mono)',
    background: active ? 'var(--accent-solid)' : 'var(--surface3)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    color: active ? 'var(--accent-fg)' : 'var(--text2)',
  })

  const SpacingRow = ({ label, arr, axis }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label} bays ({arr.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {arr.map((s, i) => {
          const ftVal = Math.round((s / gridSize) * 10) / 10
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', minWidth: 18 }}>B{i+1}</span>
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
                style={{
                  width: 52, padding: '2px 4px', borderRadius: 3, fontSize: 10,
                  fontFamily: 'var(--font-mono)', textAlign: 'right',
                  background: 'var(--surface3)', border: '1px solid var(--border)',
                  color: 'var(--text)', outline: 'none',
                  MozAppearance: 'textfield',
                }}
              />
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>ft</span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text2)', marginLeft: 2 }}>{fmtIn(s)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button onClick={() => addBay(axis)} style={{ flex:1, padding:'4px 0', borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'var(--font-mono)', fontWeight:600, background:'var(--green-dim)', border:'1px solid var(--green-bdr)', color:'var(--green)' }}>+ Bay</button>
        <button onClick={() => removeBay(axis)} disabled={arr.length<=1} style={{ padding:'4px 8px', borderRadius:4, cursor:arr.length>1?'pointer':'not-allowed', fontSize:9, fontFamily:'var(--font-mono)', background:'transparent', border:'1px solid var(--border)', color:arr.length>1?'var(--red)':'var(--text3)' }}>- Bay</button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Status */}
      <div style={{ padding: '6px 8px', borderRadius: 5, background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text3)' }}>Columns</span>
          <span style={{ color: 'var(--text)', fontWeight: 700 }}>{(spacingX.length+1) * (spacingY.length+1)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: 'var(--text3)' }}>Grid size</span>
          <span style={{ color: 'var(--text)' }}>{fmtIn(obj.width)} x {fmtIn(obj.height)}</span>
        </div>
      </div>

      {/* Column size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {lbl('Column')}
        {COL_SIZES_IN.map(s => (
          <button key={s} onClick={() => changeColSize(s)} style={btnStyle(colSizeIn === s)}>{s}"</button>
        ))}
      </div>

      {/* Show/hide grid lines */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {lbl('Grid')}
        <button onClick={() => commitObjectUpdate(obj.id, { showGrid: !showGrid })}
          style={btnStyle(showGrid)}>
          {showGrid ? '* Visible' : 'o Hidden'}
        </button>
      </div>

      {/* Wall-attached toggle (Fix 3) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {lbl('Walls')}
        <button onClick={() => commitObjectUpdate(obj.id, { wallAttached: true })}
          style={btnStyle(wallAttached)}>Attached</button>
        <button onClick={() => commitObjectUpdate(obj.id, { wallAttached: false })}
          style={btnStyle(!wallAttached)}>Free</button>
      </div>
      {!wallAttached && (
        <div style={{ padding: '4px 6px', borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
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

