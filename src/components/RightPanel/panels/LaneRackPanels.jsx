import { useCanvasStore } from '../../../store/useCanvasStore'
import { withAnchoredPosition } from '../../../utils/bayAnchor'
import { getObjectBounds } from '../../../utils/canvas'
import { getRackCapacity } from '../../../utils/capacity'

// ── Drive-In Panel ───────────────────────────────────────────────────────────
export function DriveInPanel({ obj }) {
  const { commitObjectUpdate, gridSize } = useCanvasStore()
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

  const btnStyle = (active) => ({
    padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
    fontSize: 9, fontFamily: 'var(--font-mono)',
    background: active ? 'var(--accent-solid)' : 'var(--surface3)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    color: active ? 'var(--accent-fg)' : 'var(--text2)',
  })

  const lbl = (s) => <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)', minWidth:50 }}>{s}</span>

  return (
    <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:8 }}>

      {/* Status */}
      <div style={{ padding:'6px 8px', borderRadius:5, background:'var(--green-dim)', border:'1px solid var(--green-bdr)', fontFamily:'var(--font-mono)', fontSize:9 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{color:'var(--text3)'}}>Capacity</span>
          <span style={{color:'var(--green)', fontWeight:700, fontSize:11}}>{lanes * palletDeep} PAL</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
          <span style={{color:'var(--text3)'}}>Footprint</span>
          <span style={{color:'var(--text)'}}>{Math.round(obj.width/gridSize*10)/10}' x {Math.round(obj.height/gridSize*10)/10}'</span>
        </div>
      </div>

      {/* Lanes + Deep — input boxes, select on focus */}
      {[
        { label: 'Lanes', val: lanes,      onCommit: v => recalc(v, palletDeep, palletWIn, palletDIn, upIn) },
        { label: 'Deep',  val: palletDeep, onCommit: v => recalc(lanes, v, palletWIn, palletDIn, upIn) },
      ].map(({ label, val, onCommit }) => (
        <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lbl(label)}
          <input type="text" defaultValue={val} key={`${label}-${obj.id}-${val}`}
            onFocus={e => e.target.select()}
            onBlur={e => { const v=parseInt(e.target.value); if(v>0) onCommit(v); else e.target.value=val }}
            onKeyDown={e => { if(e.key==='Enter') e.target.blur() }}
            style={{
              width:60, padding:'3px 6px', borderRadius:4, fontSize:11,
              fontFamily:'var(--font-mono)', textAlign:'right',
              background:'var(--surface3)', border:'1px solid var(--border)',
              color:'var(--text)', outline:'none',
            }}/>
          <span style={{fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)'}}>
            {label==='Lanes' ? `${val+1} uprights` : `${lanes*val} pal total`}
          </span>
        </div>
      ))}

      {/* Upright width */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {lbl('Upright')}
        {[3,4].map(n => (
          <button key={n} onClick={() => recalc(lanes, palletDeep, palletWIn, palletDIn, n)}
            style={btnStyle(upIn===n)}>{n}"</button>
        ))}
      </div>

      {/* Pallet size */}
      <div>
        <div style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Pallet size (in)</div>
        <div style={{ display:'flex', gap:4 }}>
          {[{w:48,d:48},{w:40,d:48},{w:48,d:40}].map(p => (
            <button key={`${p.w}x${p.d}`}
              onClick={() => recalc(lanes, palletDeep, p.w, p.d, upIn)}
              style={btnStyle(palletWIn===p.w&&palletDIn===p.d)}>
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
  const { commitObjectUpdate, gridSize } = useCanvasStore()
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

  const btnStyle = (active) => ({ padding:'3px 8px', borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'var(--font-mono)', background: active? 'var(--accent-solid)':'var(--surface3)', border:`1px solid ${active?'var(--accent)':'var(--border)'}`, color: active?'var(--accent-fg)':'var(--text2)' })
  const lbl = (s) => <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)', minWidth:50 }}>{s}</span>

  return (
    <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ padding:'6px 8px', borderRadius:5, background:'var(--green-dim)', border:'1px solid var(--green-bdr)', fontFamily:'var(--font-mono)', fontSize:9 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{color:'var(--text3)'}}>Capacity</span><span style={{color:'var(--green)', fontWeight:700, fontSize:11}}>{lanes*palletDeep} PAL</span></div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}><span style={{color:'var(--text3)'}}>Mode</span><span style={{color:'var(--accent)'}}>FIFO — load back, pick front</span></div>
      </div>
      {[{label:'Lanes',val:lanes,onCommit:v=>recalc(v,palletDeep,palletWIn,palletDIn,upIn)},{label:'Deep',val:palletDeep,onCommit:v=>recalc(lanes,v,palletWIn,palletDIn,upIn)}].map(({label,val,onCommit})=>(
        <div key={label} style={{display:'flex',alignItems:'center',gap:8}}>
          {lbl(label)}
          <input type="text" defaultValue={val} key={`${label}-${obj.id}-${val}`}
            onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}
            onBlur={e=>{const v=parseInt(e.target.value);if(v>0)onCommit(v);else e.target.value=val}}
            style={{width:60,padding:'3px 6px',borderRadius:4,fontSize:11,fontFamily:'var(--font-mono)',textAlign:'right',background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text)',outline:'none'}}/>
          <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{label==='Lanes'?`${val+1} uprights`:`${lanes*val} pal`}</span>
        </div>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        {lbl('Upright')}
        {[3,4].map(n=><button key={n} onClick={()=>recalc(lanes,palletDeep,palletWIn,palletDIn,n)} style={btnStyle(upIn===n)}>{n}"</button>)}
      </div>
      <div>
        <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Pallet size (in)</div>
        <div style={{display:'flex',gap:4}}>
          {[{w:48,d:48},{w:40,d:48},{w:48,d:40}].map(p=>(
            <button key={`${p.w}x${p.d}`} onClick={()=>recalc(lanes,palletDeep,p.w,p.d,upIn)} style={btnStyle(palletWIn===p.w&&palletDIn===p.d)}>{p.w}x{p.d}"</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Pushback Panel ────────────────────────────────────────────────────────────
export function PushbackPanel({ obj }) {
  const { commitObjectUpdate, gridSize } = useCanvasStore()
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

  const btnStyle = (active) => ({ padding:'3px 8px', borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'var(--font-mono)', background: active? 'var(--accent-solid)':'var(--surface3)', border:`1px solid ${active?'var(--accent)':'var(--border)'}`, color: active?'var(--accent-fg)':'var(--text2)' })
  const lbl = (s) => <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)', minWidth:50 }}>{s}</span>

  return (
    <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ padding:'6px 8px', borderRadius:5, background:'var(--green-dim)', border:'1px solid var(--green-bdr)', fontFamily:'var(--font-mono)', fontSize:9 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{color:'var(--text3)'}}>Capacity</span><span style={{color:'var(--green)', fontWeight:700, fontSize:11}}>{lanes*palletDeep} PAL</span></div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}><span style={{color:'var(--text3)'}}>Mode</span><span style={{color:'var(--accent)'}}>LIFO — carts on inclined rails</span></div>
        {palletDeep > 5 && <div style={{color:'var(--color-text-danger,var(--red))',fontSize:9,marginTop:2}}>⚠ Pushback typically max 5-deep</div>}
      </div>
      {[{label:'Lanes',val:lanes,onCommit:v=>recalc(v,palletDeep,palletWIn,palletDIn,upIn)},{label:'Deep',val:palletDeep,onCommit:v=>recalc(lanes,v,palletWIn,palletDIn,upIn)}].map(({label,val,onCommit})=>(
        <div key={label} style={{display:'flex',alignItems:'center',gap:8}}>
          {lbl(label)}
          <input type="text" defaultValue={val} key={`${label}-${obj.id}-${val}`}
            onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}
            onBlur={e=>{const v=parseInt(e.target.value);if(v>0)onCommit(v);else e.target.value=val}}
            style={{width:60,padding:'3px 6px',borderRadius:4,fontSize:11,fontFamily:'var(--font-mono)',textAlign:'right',background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text)',outline:'none'}}/>
          <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>{label==='Lanes'?`${val+1} uprights`:`${lanes*val} pal`}</span>
        </div>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        {lbl('Upright')}
        {[3,4].map(n=><button key={n} onClick={()=>recalc(lanes,palletDeep,palletWIn,palletDIn,n)} style={btnStyle(upIn===n)}>{n}"</button>)}
      </div>
      <div>
        <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Pallet size (in)</div>
        <div style={{display:'flex',gap:4}}>
          {[{w:48,d:48},{w:40,d:48},{w:48,d:40}].map(p=>(
            <button key={`${p.w}x${p.d}`} onClick={()=>recalc(lanes,palletDeep,p.w,p.d,upIn)} style={btnStyle(palletWIn===p.w&&palletDIn===p.d)}>{p.w}x{p.d}"</button>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Pallet Flow Panel ────────────────────────────────────────────────────────
export function PalletFlowPanel({ obj }) {
  const { commitObjectUpdate } = useCanvasStore()
  const palletDeep = obj.palletDeep || 2
  const palletDIn  = obj.palletDIn  || 48

  const btnStyle = (active) => ({
    padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
    fontSize: 9, fontFamily: 'var(--font-mono)',
    background: active ? 'var(--accent-solid)' : 'var(--surface3)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    color: active ? 'var(--accent-fg)' : 'var(--text2)',
  })

  const lbl = (s) => <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text3)', minWidth:70 }}>{s}</span>

  return (
    <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ padding:'6px 8px', borderRadius:5, background:'var(--surface2)', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:9 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{color:'var(--text3)'}}>Mode</span>
          <span style={{color:'var(--accent)'}}>FIFO — gravity fed rollers</span>
        </div>
      </div>

      {/* Pallet deep */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {lbl('Pallet deep')}
        <input type="text" defaultValue={palletDeep} key={`pd-${obj.id}-${palletDeep}`}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if(e.key==='Enter') e.target.blur() }}
          onBlur={e => { const v=parseInt(e.target.value); if(v>0) commitObjectUpdate(obj.id,{palletDeep:v}); else e.target.value=palletDeep }}
          style={{width:60,padding:'3px 6px',borderRadius:4,fontSize:11,fontFamily:'var(--font-mono)',textAlign:'right',background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text)',outline:'none'}}/>
        <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text3)'}}>positions</span>
      </div>

      {/* Pallet depth */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {lbl('Pallet depth')}
        {[40,48].map(d => (
          <button key={d} onClick={() => commitObjectUpdate(obj.id,{palletDIn:d})}
            style={btnStyle(palletDIn===d)}>{d}"</button>
        ))}
      </div>
    </div>
  )
}