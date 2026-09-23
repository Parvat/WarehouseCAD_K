import { useCanvasStore } from '../../../store/useCanvasStore'
import { getObjectBounds } from '../../../utils/canvas'
import { getRackCapacity } from '../../../utils/capacity'

// Standard beam lengths in inches
const BEAM_OPTIONS = [72, 96, 120, 144]

// ── Compute rack geometry from beams array ────────────────────────────────────
export function rackTotalInches(obj) {
  const upIn = obj.uprightWidth || 3
  const beams = obj.beams || [96]
  // Total = left upright + beams + (bays x right upright shared except last)
  // Each bay = beam + one upright on right. Plus left upright at start.
  return upIn + beams.reduce((s, b) => s + b, 0) + upIn * beams.length
  // Correction: bays share uprights. Layout = upright | beam | upright | beam | upright
  // So: uprightWidth + sum(beams) + uprightWidth x beams.length
  // = upIn x (beams.length + 1) + sum(beams)
}

export function rackTotalPx(obj, gridSize = 40) {
  const upIn = obj.uprightWidth || 3
  const beams = obj.beams || [96]
  const totalIn = upIn * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
  return (totalIn / 12) * gridSize
}

// ── Get inner clear width of parent FP along the rack axis ────────────────────
function getWallClear(obj, allObjects, gridSize) {
  if (!obj.parentId) return null
  const fp = allObjects.find(o => o.id === obj.parentId)
  if (!fp) return null
  const wt = fp.wallThicknessFt ? fp.wallThicknessFt * gridSize : 10
  const b  = getObjectBounds(fp)
  // Inner clear = bbox width - 2xwt (for horizontal rack along X axis)
  const clearPx = b.width - 2 * wt
  return { clearPx, clearIn: (clearPx / gridSize) * 12, fp, wt }
}

// ── Max additional bays that fit ──────────────────────────────────────────────
function maxFitBays(obj, allObjects, gridSize, newBeamIn = 96) {
  const clear = getWallClear(obj, allObjects, gridSize)
  if (!clear) return null
  const usedIn = rackTotalInches(obj)
  const upIn   = obj.uprightWidth || 3
  // Each additional bay = newBeamIn + uprightWidth
  const remainIn = clear.clearIn - usedIn
  return { remainIn, fits: remainIn >= newBeamIn + upIn, addIn: newBeamIn + upIn }
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function MultiBayPanel() {
  const { activeBaySelection, objects, deleteSelectedBays, changeSelectedBaysBeam, clearBaySelection, clearSelection, gridSize } = useCanvasStore()
  if (!activeBaySelection || activeBaySelection.length === 0) return null

  /* deleteSelectedBays (the store action) only ever clears
     activeBaySelection, not selectedIds — the rack ROWS a bay marquee
     added to selectedIds (so this panel and Properties would show them)
     stay selected after their bays are gone. With activeBaySelection now
     empty, canvas2's GroupRotateOverlay gate (selectedObjects.length >= 2
     && no active bay selection) is satisfied again, so the group-rotate
     outline/handle reappeared around racks nothing was actually asking to
     rotate (BUG 31). clearSelection() afterward drops selectedIds too, so
     a bay delete leaves nothing selected at all — matching "the bays are
     gone, so is the selection that picked them," not "now select the
     whole rows instead." Kept as a wrapper here rather than a change to
     the protected deleteSelectedBays action itself. */
  const deleteSelectedBaysAndClear = () => { deleteSelectedBays(); clearSelection() }

  const BEAM_OPTIONS = [72, 96, 120, 144]
  const fmtIn = (inches) => {
    const ft = Math.floor(Math.abs(inches) / 12)
    const inc = Math.round(Math.abs(inches) % 12)
    return inc === 0 ? `${ft}'` : `${ft}' ${inc}"`
  }

  // Summarise selected bays
  const rowCount = new Set(activeBaySelection.map(e => e.objId)).size
  const bayCount = activeBaySelection.length
  const beamSizes = [...new Set(activeBaySelection.map(({ objId, bayIdx }) => {
    const obj = objects.find(o => o.id === objId)
    return obj?.beams?.[bayIdx]
  }).filter(Boolean))]
  const allSame = beamSizes.length === 1

  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{
        padding: '6px 8px', borderRadius: 5,
        background: 'var(--accent-dim)', border: '1px solid var(--accent-bdr)',
        fontFamily: 'var(--font-mono)', fontSize: 9,
      }}>
        <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 2 }}>
          {bayCount} bay{bayCount > 1 ? 's' : ''} selected across {rowCount} row{rowCount > 1 ? 's' : ''}
        </div>
        <div style={{ color: 'var(--text3)' }}>
          {allSame ? `All ${fmtIn(beamSizes[0])} beams` : `Mixed: ${beamSizes.map(fmtIn).join(', ')}`}
        </div>
      </div>

      {/* Change beam size */}
      <div>
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Change all to
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {BEAM_OPTIONS.map(b => (
            <button key={b}
              onClick={() => changeSelectedBaysBeam(b)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 4, cursor: 'pointer',
                fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
                background: allSame && beamSizes[0] === b ? 'var(--accent-bdr)' : 'var(--surface3)',
                border: `1px solid ${allSame && beamSizes[0] === b ? 'var(--accent)' : 'var(--border)'}`,
                color: allSame && beamSizes[0] === b ? 'var(--accent)' : 'var(--text)',
              }}>
              {b}"
            </button>
          ))}
        </div>
      </div>

      {/* Delete + Clear */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={deleteSelectedBaysAndClear}
          style={{
            flex: 1, padding: '5px 0', borderRadius: 4, cursor: 'pointer',
            fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
            background: 'var(--red-dim)', border: '1px solid var(--red-bdr)', color: 'var(--red)',
          }}>
          Delete {bayCount} bay{bayCount > 1 ? 's' : ''}
        </button>
        <button
          onClick={clearBaySelection}
          style={{
            padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
            fontSize: 9, fontFamily: 'var(--font-mono)',
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)',
          }}>
          Clear
        </button>
      </div>
    </div>
  )
}

export function RackRowPanel({ obj }) {
  const { objects, updateObject, commitObjectUpdate, gridSize } = useCanvasStore()

  const beams   = obj.beams || [96]
  const upIn    = obj.uprightWidth || 3
  const activeBay = obj.activeBayIdx ?? null
  const levels  = obj.levels || 1
  const totalIn = upIn * (beams.length + 1) + beams.reduce((s, b) => s + b, 0)
  const totalFt = totalIn / 12
  const capacity = getRackCapacity(obj)

  const clear   = getWallClear(obj, objects, gridSize)
  const clearIn = clear?.clearIn ?? null
  const remainIn = clearIn != null ? clearIn - totalIn : null
  const overBy   = remainIn != null && remainIn < 0 ? Math.abs(remainIn) : 0

  // Format inches
  const fmtIn = (inches) => {
    const ft  = Math.floor(Math.abs(inches) / 12)
    const inc = Math.round(Math.abs(inches) % 12)
    if (inc === 12) return `${ft+1}'`
    return inc === 0 ? `${ft}'` : `${ft}' ${inc}"`
  }

  // Add a bay
  const addBay = (beamIn = 96) => {
    const newBeams = [...beams, beamIn]
    const newTotalIn = upIn * (newBeams.length + 1) + newBeams.reduce((s,b)=>s+b,0)
    if (clearIn != null && (newTotalIn / 12) * gridSize > (clearIn / 12) * gridSize) return
    const newW = (newTotalIn / 12) * gridSize
    commitObjectUpdate(obj.id, { beams: newBeams, width: newW })
  }

  // Change a bay's beam
  const changeBay = (bayIdx, newBeamIn) => {
    const newBeams = [...beams]
    newBeams[bayIdx] = newBeamIn
    const newTotalIn = upIn * (newBeams.length + 1) + newBeams.reduce((s,b)=>s+b,0)
    if (clearIn != null && newTotalIn > clearIn) return  // blocked
    const newW = (newTotalIn / 12) * gridSize
    commitObjectUpdate(obj.id, { beams: newBeams, width: newW })
  }

  // Remove active bay (or last bay if none selected)
  const removeBay = () => {
    if (beams.length <= 1) return
    const idxToRemove = activeBay !== null ? activeBay : beams.length - 1
    const newBeams = beams.filter((_, i) => i !== idxToRemove)
    const newTotalIn = upIn * (newBeams.length + 1) + newBeams.reduce((s,b)=>s+b,0)
    const newW = (newTotalIn / 12) * gridSize
    commitObjectUpdate(obj.id, { beams: newBeams, width: newW, activeBayIdx: null })
  }

  const label = (s) => (
    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', minWidth: 36 }}>{s}</span>
  )

  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Capacity ── */}
      <div style={{
        padding: '6px 8px', borderRadius: 5,
        background: 'var(--green-dim)', border: '1px solid var(--green-bdr)',
        fontFamily: 'var(--font-mono)', fontSize: 9,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text3)' }}>Capacity</span>
          <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 11 }}>
            {capacity ? capacity.total : 0} PAL
          </span>
        </div>
        {capacity && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ color: 'var(--text3)' }}>Ground level</span>
            <span style={{ color: 'var(--text2)' }}>{capacity.groundTotal} pal × {levels} level{levels > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* ── Levels ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {label('Levels')}
        <input type="text" defaultValue={levels} key={`lvl-${obj.id}-${levels}`}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => {
            const v = parseInt(e.target.value)
            if (v > 0) commitObjectUpdate(obj.id, { levels: v })
            else e.target.value = levels
          }}
          style={{ width: 60, padding: '3px 6px', borderRadius: 4, fontSize: 11,
            fontFamily: 'var(--font-mono)', textAlign: 'right',
            background: 'var(--surface3)', border: '1px solid var(--border)',
            color: 'var(--text)', outline: 'none' }}/>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          beam levels
        </span>
      </div>

      {/* ── Fit Status ── */}
      <div style={{
        padding: '6px 8px', borderRadius: 5,
        background: overBy > 0 ? 'var(--red-dim)' : remainIn != null ? 'var(--green-dim)' : 'var(--surface3)',
        border: `1px solid ${overBy > 0 ? 'var(--red)' : remainIn != null ? 'var(--green-bdr)' : 'var(--border)'}`,
        fontFamily: 'var(--font-mono)', fontSize: 9,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text2)' }}>Total length</span>
          <span style={{ color: overBy > 0 ? 'var(--red)' : 'var(--text)', fontWeight: 700 }}>{fmtIn(totalIn)}</span>
        </div>
        {clearIn != null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: 'var(--text3)' }}>Wall clear</span>
              <span style={{ color: 'var(--text2)' }}>{fmtIn(clearIn)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: 'var(--text3)' }}>{overBy > 0 ? 'Exceeds by' : 'Remaining'}</span>
              <span style={{ color: overBy > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                {overBy > 0 ? `${fmtIn(overBy)} !` : fmtIn(remainIn)}
              </span>
            </div>
          </>
        )}
        {clearIn == null && (
          <div style={{ color: 'var(--text3)', marginTop: 2 }}>No floor plan -- length only</div>
        )}
      </div>

      {/* ── Bay list ── */}
      <div>
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Bays ({beams.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {beams.map((beamIn, i) => {
            const isActive = activeBay === i
            return (
              <div key={i}
                onClick={() => {
                  const newBay = activeBay === i ? null : i
                  updateObject(obj.id, { activeBayIdx: newBay })
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                  background: isActive ? 'var(--accent-solid)' : 'var(--surface2)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'all 0.1s',
                }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-fg)' : 'var(--text3)', minWidth: 20 }}>
                  B{i+1}
                </span>
                <span style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-fg)' : 'var(--text)' }}>
                  {fmtIn(beamIn)} beam
                </span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-fg)' : 'var(--text3)' }}>
                  {beamIn}"
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Active bay beam selector ── */}
      {activeBay !== null && (
        <div style={{
          padding: '6px 8px', borderRadius: 5,
          background: 'var(--surface2)', border: '1px solid var(--accent)',
        }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Bay {activeBay + 1} -- Change beam
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {BEAM_OPTIONS.map(b => {
              // Check if this beam fits
              const testBeams = [...beams]
              testBeams[activeBay] = b
              const testTotal = upIn * (testBeams.length + 1) + testBeams.reduce((s,x)=>s+x,0)
              const fits = clearIn == null || testTotal <= clearIn
              const isCurrent = beams[activeBay] === b

              return (
                <button key={b}
                  onClick={() => fits && changeBay(activeBay, b)}
                  style={{
                    padding: '4px 8px', borderRadius: 4, cursor: fits ? 'pointer' : 'not-allowed',
                    fontSize: 9, fontFamily: 'var(--font-mono)',
                    background: isCurrent ? 'var(--accent)' : fits ? 'var(--surface3)' : 'transparent',
                    border: `1px solid ${isCurrent ? 'var(--accent)' : fits ? 'var(--border)' : 'var(--red-bdr)'}`,
                    color: isCurrent ? '#000' : fits ? 'var(--text)' : 'var(--red-bdr)',
                    fontWeight: isCurrent ? 700 : 400,
                  }}>
                  {b}"
                  {!fits && <span style={{ marginLeft: 2 }}>x</span>}
                </button>
              )
            })}
          </div>
          {/* Show what each option would do */}
          {BEAM_OPTIONS.map(b => {
            const testBeams = [...beams]
            testBeams[activeBay] = b
            const testTotal = upIn * (testBeams.length + 1) + testBeams.reduce((s,x)=>s+x,0)
            const delta = testTotal - totalIn
            if (delta === 0) return null
            const fits = clearIn == null || testTotal <= clearIn
            return (
              <div key={b} style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: fits ? 'var(--text3)' : 'var(--red)', marginTop: 2 }}>
                {b}": {delta > 0 ? '+' : ''}{fmtIn(delta)} {fits ? (clearIn != null ? `-> ${fmtIn(clearIn - testTotal)} remaining` : '') : '-> exceeds wall'}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / Remove bay ── */}
      <div style={{ display: 'flex', gap: 4 }}>
        {BEAM_OPTIONS.map(b => {
          const testBeams = [...beams, b]
          const testTotal = upIn * (testBeams.length + 1) + testBeams.reduce((s,x)=>s+x,0)
          const fits = clearIn == null || testTotal <= clearIn
          return (
            <button key={b}
              onClick={() => addBay(b)}
              disabled={!fits}
              title={fits ? `Add ${b}" bay` : `${b}" bay doesn't fit`}
              style={{
                flex: 1, padding: '5px 4px', borderRadius: 4,
                fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
                cursor: fits ? 'pointer' : 'not-allowed',
                background: fits ? 'var(--green-dim)' : 'transparent',
                border: `1px solid ${fits ? 'var(--green-bdr)' : 'var(--border)'}`,
                color: fits ? 'var(--green)' : 'var(--text3)',
              }}>
              + {b}"
            </button>
          )
        })}
        <button
          onClick={removeBay}
          disabled={beams.length <= 1}
          style={{
            padding: '5px 8px', borderRadius: 4,
            fontSize: 9, fontFamily: 'var(--font-mono)',
            cursor: beams.length > 1 ? 'pointer' : 'not-allowed',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: beams.length > 1 ? 'var(--red)' : 'var(--text3)',
          }}>
          - Bay
        </button>
      </div>

      {/* ── Upright width ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label('Upright')}
        {[3, 4].map(u => (
          <button key={u}
            onClick={() => {
              const newTotalIn = u * (beams.length + 1) + beams.reduce((s,b)=>s+b,0)
              const newW = (newTotalIn / 12) * gridSize
              commitObjectUpdate(obj.id, { uprightWidth: u, width: newW })
            }}
            style={{
              padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              fontSize: 9, fontFamily: 'var(--font-mono)',
              background: upIn === u ? 'var(--accent-solid)' : 'var(--surface3)',
              border: `1px solid ${upIn === u ? 'var(--accent)' : 'var(--border)'}`,
              color: upIn === u ? 'var(--accent-fg)' : 'var(--text2)',
            }}>
            {u}"
          </button>
        ))}
      </div>

      {/* ── Pallet size — GMA standard: the loading face (narrower, 40"
          default) runs ACROSS the beam and is what sizes positions per bay;
          depth (48" default) runs into the frame and overhangs it by
          design (~3" each side on a 42" frame is standard, not undersized).
          No facing/orientation choice — this is the one convention. ── */}
      {(() => {
        const pw = obj.palletWIn || 40
        const pd = obj.palletDIn || 48
        const PRESETS = [
          { label: '40x48', w: 40, d: 48 },
          { label: '48x40', w: 48, d: 40 },
          { label: '47x32', w: 47, d: 32 },
        ]
        const isPreset = (w, d) => PRESETS.some(p => p.w === w && p.d === d)
        const inputStyle = {
          width: 42, padding: '2px 4px', borderRadius: 3, fontSize: 10,
          fontFamily: 'var(--font-mono)', textAlign: 'right',
          background: 'var(--surface3)', border: '1px solid var(--border)',
          color: 'var(--text)', outline: 'none',
        }
        return (
          <div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pallet size (in)
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => commitObjectUpdate(obj.id, { palletWIn: p.w, palletDIn: p.d })}
                  style={{
                    padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
                    fontSize: 9, fontFamily: 'var(--font-mono)',
                    background: pw===p.w&&pd===p.d ? 'var(--accent-solid)' : 'var(--surface3)',
                    border: `1px solid ${pw===p.w&&pd===p.d ? 'var(--accent)' : 'var(--border)'}`,
                    color: pw===p.w&&pd===p.d ? 'var(--accent-fg)' : 'var(--text2)',
                  }}>
                  {p.label}"
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Face — the loading-face width that runs across the beam and sets positions per bay">
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>Face</span>
              <input type="text" defaultValue={pw} key={`pw-${obj.id}`}
                onFocus={e => e.target.select()}
                onBlur={e => { const v=parseInt(e.target.value); if(v>0) commitObjectUpdate(obj.id,{palletWIn:v}); else e.target.value=pw }}
                onKeyDown={e=>{ if(e.key==='Enter') e.target.blur() }}
                style={inputStyle}/>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }} title="Depth — runs into the frame, overhangs by design, does not affect positions per bay">Depth</span>
              <input type="text" defaultValue={pd} key={`pd-${obj.id}`}
                onFocus={e => e.target.select()}
                onBlur={e => { const v=parseInt(e.target.value); if(v>0) commitObjectUpdate(obj.id,{palletDIn:v}); else e.target.value=pd }}
                onKeyDown={e=>{ if(e.key==='Enter') e.target.blur() }}
                style={inputStyle}/>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
                {!isPreset(pw,pd) ? 'custom' : ''}
              </span>
            </div>
            {/* Pallet deep — for drive-in, pushback, pallet flow */}
            {(obj.type==='rack_pushback'||obj.type==='rack_pallet_flow'||obj.type==='rack_drive_in'||obj.type==='rack_drive_through') && (() => {
              const deep = obj.palletDeep || 2
              return (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                  <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)' }}>Deep</span>
                  {[2,3,4,5,6,8].map(n => (
                    <button key={n} onClick={() => commitObjectUpdate(obj.id,{palletDeep:n})}
                      style={{
                        padding:'2px 6px', borderRadius:4, cursor:'pointer',
                        fontSize:9, fontFamily:'var(--font-mono)',
                        background: deep===n? 'var(--accent-solid)':'var(--surface3)',
                        border:`1px solid ${deep===n?'var(--accent)':'var(--border)'}`,
                        color: deep===n?'var(--accent-fg)':'var(--text2)',
                      }}>{n}</button>
                  ))}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── Flue space (double row only) ── */}
      {obj.type === 'rack_double_row' && (() => {
        const flue = obj.flueSpaceIn || 9
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {label('Flue')}
            {[6, 9, 12].map(f => (
              <button key={f}
                onClick={() => {
                  // Update height: newH = rowH*2 + newFlue
                  // rowH = (obj.height - oldFlueH) / 2
                  const oldFlueH = (flue / 12) * gridSize
                  const rowH    = (obj.height - oldFlueH) / 2
                  const newFlueH = (f / 12) * gridSize
                  const newH    = rowH * 2 + newFlueH
                  /* flueBaseIn alongside flueSpaceIn — a dealer picking a
                     Flue value here is a deliberate, genuine choice, so it
                     becomes the new base the live-auto-flue drag (see
                     useCanvasInteraction.js's beginDrag) reverts to away
                     from a column, not just this instant's rendered value. */
                  commitObjectUpdate(obj.id, { flueSpaceIn: f, flueBaseIn: f, height: newH })
                }}
                style={{
                  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  background: flue === f ? 'var(--accent-solid)' : 'var(--surface3)',
                  border: `1px solid ${flue === f ? 'var(--accent)' : 'var(--border)'}`,
                  color: flue === f ? 'var(--accent-fg)' : 'var(--text2)',
                }}>
                {f}"
              </button>
            ))}
          </div>
        )
      })()}

    </div>
  )
}