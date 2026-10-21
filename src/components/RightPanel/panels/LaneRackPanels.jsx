import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { withAnchoredPosition } from '../../../utils/bayAnchor'
import { getObjectBounds } from '../../../utils/canvas'
import { getRackCapacity } from '../../../utils/capacity'
import { TriangleAlert } from 'lucide-react'

/* Presentation (THEME.md): words PJS, figures mono (.t-num). Option buttons are 32px secondaries, the picked one
   pine (.is-on); inputs .t-input; the status is a white card (radius 4). The Properties body pads 16. */
const btnCls  = (active) => 't-btn t-btn--secondary t-seg' + (active ? ' is-on' : '')
const NUMB    = { padding: '0 8px', fontFamily: 'var(--font-mono)', fontWeight: 400 }
const LBL_ST  = { width: 72, flexShrink: 0 }
const IN_ST   = { width: 64, textAlign: 'right' }
const HINT    = { fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--steel)', minWidth: 0 }
const STATUS  = { borderTop: '1px solid var(--line)', paddingTop: 12, fontFamily: 'var(--font-ui)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }
const SROW    = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }
const SLBL    = { color: 'var(--steel)' }
const SNUM    = { color: 'var(--ink)', fontWeight: 600, fontSize: 13 }
const SWORD   = { color: 'var(--ink-2)', textAlign: 'right', minWidth: 0 }
const BOX     = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
const ROW     = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }
const OPTROW  = { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }
const SUBBOX  = { display: 'flex', flexDirection: 'column', gap: 8 }

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


  const lbl = (s) => <span className="t-label" style={LBL_ST}>{s}</span>

  return (
    <div style={BOX}>

      {/* Status */}
      <div style={STATUS}>
        <div style={SROW}>
          <span style={SLBL}>Capacity</span>
          <span className="t-num" style={SNUM}>{lanes * palletDeep} PAL</span>
        </div>
        <div style={SROW}>
          <span style={SLBL}>Footprint</span>
          <span className="t-num" style={{ color:'var(--ink)' }}>{Math.round(obj.width/gridSize*10)/10}' x {Math.round(obj.height/gridSize*10)/10}'</span>
        </div>
      </div>

      {/* Lanes + Deep — input boxes, select on focus */}
      {[
        { label: 'Lanes', val: lanes,      onCommit: v => recalc(v, palletDeep, palletWIn, palletDIn, upIn) },
        { label: 'Deep',  val: palletDeep, onCommit: v => recalc(lanes, v, palletWIn, palletDIn, upIn) },
      ].map(({ label, val, onCommit }) => (
        <div key={label} style={ROW}>
          {lbl(label)}
          <input type="text" defaultValue={val} key={`${label}-${obj.id}-${val}`}
            onFocus={e => e.target.select()}
            onBlur={e => { const v=parseInt(e.target.value); if(v>0) onCommit(v); else e.target.value=val }}
            onKeyDown={e => { if(e.key==='Enter') e.target.blur() }}
            className="t-input" style={IN_ST}/>
          <span style={HINT}>
            {label==='Lanes' ? `${val+1} uprights` : `${lanes*val} pal total`}
          </span>
        </div>
      ))}

      {/* Upright width */}
      <div style={OPTROW}>
        {lbl('Upright')}
        {[3,4].map(n => (
          <button key={n} onClick={() => recalc(lanes, palletDeep, palletWIn, palletDIn, n)}
            className={btnCls(upIn===n)} style={NUMB}>{n}"</button>
        ))}
      </div>

      {/* Pallet size */}
      <div style={SUBBOX}>
        <div className="t-cap">Pallet size (in)</div>
        <div style={OPTROW}>
          {[{w:48,d:48},{w:40,d:48},{w:48,d:40}].map(p => (
            <button key={`${p.w}x${p.d}`}
              onClick={() => recalc(lanes, palletDeep, p.w, p.d, upIn)}
              className={btnCls(palletWIn===p.w&&palletDIn===p.d)} style={NUMB}>
              {p.w}x{p.d}"
            </button>
          ))}
        </div>
      </div>
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

  const lbl = (s) => <span className="t-label" style={LBL_ST}>{s}</span>

  return (
    <div style={BOX}>
      <div style={STATUS}>
        <div style={SROW}><span style={SLBL}>Capacity</span><span className="t-num" style={SNUM}>{lanes*palletDeep} PAL</span></div>
        <div style={SROW}><span style={SLBL}>Mode</span><span style={SWORD}>FIFO — load back, pick front</span></div>
      </div>
      {[{label:'Lanes',val:lanes,onCommit:v=>recalc(v,palletDeep,palletWIn,palletDIn,upIn)},{label:'Deep',val:palletDeep,onCommit:v=>recalc(lanes,v,palletWIn,palletDIn,upIn)}].map(({label,val,onCommit})=>(
        <div key={label} style={ROW}>
          {lbl(label)}
          <input type="text" defaultValue={val} key={`${label}-${obj.id}-${val}`}
            onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}
            onBlur={e=>{const v=parseInt(e.target.value);if(v>0)onCommit(v);else e.target.value=val}}
            className="t-input" style={IN_ST}/>
          <span style={HINT}>{label==='Lanes'?`${val+1} uprights`:`${lanes*val} pal`}</span>
        </div>
      ))}
      <div style={OPTROW}>
        {lbl('Upright')}
        {[3,4].map(n=><button key={n} onClick={()=>recalc(lanes,palletDeep,palletWIn,palletDIn,n)} className={btnCls(upIn===n)} style={NUMB}>{n}"</button>)}
      </div>
      <div style={SUBBOX}>
        <div className="t-cap">Pallet size (in)</div>
        <div style={OPTROW}>
          {[{w:48,d:48},{w:40,d:48},{w:48,d:40}].map(p=>(
            <button key={`${p.w}x${p.d}`} onClick={()=>recalc(lanes,palletDeep,p.w,p.d,upIn)} className={btnCls(palletWIn===p.w&&palletDIn===p.d)} style={NUMB}>{p.w}x{p.d}"</button>
          ))}
        </div>
      </div>
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

  const lbl = (s) => <span className="t-label" style={LBL_ST}>{s}</span>

  return (
    <div style={BOX}>
      <div style={STATUS}>
        <div style={SROW}><span style={SLBL}>Capacity</span><span className="t-num" style={SNUM}>{lanes*palletDeep} PAL</span></div>
        <div style={SROW}><span style={SLBL}>Mode</span><span style={SWORD}>LIFO — carts on inclined rails</span></div>
        {palletDeep > 5 && <div style={{ display:'flex', alignItems:'center', gap:4, color:'var(--warn-fg)', fontSize:12 }}><TriangleAlert size={14} strokeWidth={1.5} absoluteStrokeWidth style={{ color:'var(--amber)', flexShrink:0 }} aria-hidden="true" />Pushback typically max 5-deep</div>}
      </div>
      {[{label:'Lanes',val:lanes,onCommit:v=>recalc(v,palletDeep,palletWIn,palletDIn,upIn)},{label:'Deep',val:palletDeep,onCommit:v=>recalc(lanes,v,palletWIn,palletDIn,upIn)}].map(({label,val,onCommit})=>(
        <div key={label} style={ROW}>
          {lbl(label)}
          <input type="text" defaultValue={val} key={`${label}-${obj.id}-${val}`}
            onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}
            onBlur={e=>{const v=parseInt(e.target.value);if(v>0)onCommit(v);else e.target.value=val}}
            className="t-input" style={IN_ST}/>
          <span style={HINT}>{label==='Lanes'?`${val+1} uprights`:`${lanes*val} pal`}</span>
        </div>
      ))}
      <div style={OPTROW}>
        {lbl('Upright')}
        {[3,4].map(n=><button key={n} onClick={()=>recalc(lanes,palletDeep,palletWIn,palletDIn,n)} className={btnCls(upIn===n)} style={NUMB}>{n}"</button>)}
      </div>
      <div style={SUBBOX}>
        <div className="t-cap">Pallet size (in)</div>
        <div style={OPTROW}>
          {[{w:48,d:48},{w:40,d:48},{w:48,d:40}].map(p=>(
            <button key={`${p.w}x${p.d}`} onClick={()=>recalc(lanes,palletDeep,p.w,p.d,upIn)} className={btnCls(palletWIn===p.w&&palletDIn===p.d)} style={NUMB}>{p.w}x{p.d}"</button>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Pallet Flow Panel ────────────────────────────────────────────────────────
export function PalletFlowPanel({ obj }) {
  const { commitObjectUpdate } = useCanvasStore(useShallow(s => ({ commitObjectUpdate: s.commitObjectUpdate })))
  const palletDeep = obj.palletDeep || 2
  const palletDIn  = obj.palletDIn  || 48


  const lbl = (s) => <span className="t-label" style={LBL_ST}>{s}</span>

  return (
    <div style={BOX}>
      <div style={STATUS}>
        <div style={SROW}>
          <span style={SLBL}>Mode</span>
          <span style={SWORD}>FIFO — gravity fed rollers</span>
        </div>
      </div>

      {/* Pallet deep */}
      <div style={ROW}>
        {lbl('Pallet deep')}
        <input type="text" defaultValue={palletDeep} key={`pd-${obj.id}-${palletDeep}`}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if(e.key==='Enter') e.target.blur() }}
          onBlur={e => { const v=parseInt(e.target.value); if(v>0) commitObjectUpdate(obj.id,{palletDeep:v}); else e.target.value=palletDeep }}
          className="t-input" style={IN_ST}/>
        <span style={HINT}>positions</span>
      </div>

      {/* Pallet depth */}
      <div style={OPTROW}>
        {lbl('Pallet depth')}
        {[40,48].map(d => (
          <button key={d} onClick={() => commitObjectUpdate(obj.id,{palletDIn:d})}
            className={btnCls(palletDIn===d)} style={NUMB}>{d}"</button>
        ))}
      </div>
    </div>
  )
}