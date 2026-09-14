import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { lShapePath, lMirrorPath, tShapePath, uShapePath, crossPath } from '../../utils/canvas'

function PlanPreview({ type }) {
  const pad = 4, vw = 54, vh = 40
  const W = vw-pad*2, H = vh-pad*2
  const s = { fill:'var(--surface)', stroke:'var(--blue)', strokeWidth:2.5, strokeLinejoin:'round' }
  switch (type) {
    case 'fp_rect':     return <rect {...s} x={pad} y={pad} width={W} height={H} rx={1} />
    case 'fp_l':        return <path {...s} d={lShapePath(pad,pad,W,H)} />
    case 'fp_u':        return <path {...s} d={uShapePath(pad,pad,W,H)} />
    case 'fp_t':        return <path {...s} d={tShapePath(pad,pad,W,H)} />
    case 'fp_cross':    return <path {...s} d={crossPath(pad,pad,W,H)} />
    case 'fp_l_mirror': return <path {...s} d={lMirrorPath(pad,pad,W,H)} />
    default:            return <rect {...s} x={pad} y={pad} width={W} height={H} rx={1} />
  }
}

const PLANS = [
  { type:'fp_rect',     label:'Rectangle', widthFt:80, heightFt:60 },
  { type:'fp_l',        label:'L-Shape',   widthFt:80, heightFt:60 },
  { type:'fp_u',        label:'U-Shape',   widthFt:80, heightFt:60 },
  { type:'fp_t',        label:'T-Shape',   widthFt:80, heightFt:60 },
  { type:'fp_cross',    label:'Plus',      widthFt:60, heightFt:60 },
  { type:'fp_l_mirror', label:'L-Mirror',  widthFt:80, heightFt:60 },
]

export function FloorPlanPicker() {
  const { placeFpObject } = useCanvasStore()
  return (
    <SectionHeader title="Floor Plans" defaultOpen={true}>
      <div style={{ padding:'4px 8px 12px' }}>
        <p style={{ fontSize:'var(--fs-xs)', color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:8, lineHeight:1.5 }}>
          Click to place a floor plan on the canvas.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {PLANS.map(plan => (
            <button key={plan.type} onClick={() => placeFpObject(plan)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                borderRadius:8, border:'1px solid var(--border)', padding:6,
                background:'var(--surface2)', cursor:'pointer', transition:'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--blue)'; e.currentTarget.style.background='var(--surface3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--surface2)' }}
            >
              <div style={{ width:'100%', borderRadius:5, overflow:'hidden', background:'var(--canvas-bg)', border:'1px solid var(--border)' }}>
                <svg viewBox="0 0 54 40" width="100%" style={{ display:'block' }}>
                  {[14,27,40].flatMap(cx => [13,27].map(cy => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.8} fill="var(--blue)" opacity={0.2} />
                  )))}
                  <PlanPreview type={plan.type} />
                </svg>
              </div>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--text2)', fontFamily:'var(--font-display)', letterSpacing:'0.05em', textTransform:'uppercase' }}>
                {plan.label}
              </span>
              <span style={{ fontSize:'var(--fs-xs)', color:'var(--text3)', fontFamily:'var(--font-mono)' }}>
                {plan.widthFt}′ × {plan.heightFt}′
              </span>
            </button>
          ))}
        </div>
        <WallThicknessDefault />
      </div>
    </SectionHeader>
  )
}

function WallThicknessDefault() {
  const { fpDefaults, setFpDefaults } = useCanvasStore()
  const thickness = fpDefaults?.wallThicknessFt ?? 0.5
  return (
    <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'var(--fs-xs)', color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Default Wall</span>
        <span style={{ fontSize:'var(--fs-xs)', color:'var(--text)', fontFamily:'var(--font-mono)' }}>{(thickness*12).toFixed(0)}"</span>
      </div>
      <input type="range" min={0.25} max={2} step={0.25} value={thickness}
        onChange={e => setFpDefaults({ wallThicknessFt: Number(e.target.value) })}
        style={{ accentColor:'var(--blue)', height:3, width:'100%' }} />
      <div style={{ display:'flex', gap:3 }}>
        {[0.25,0.5,0.75,1].map(v => (
          <button key={v} onClick={() => setFpDefaults({ wallThicknessFt: v })}
            style={{
              flex:1, fontSize:'var(--fs-xs)', fontFamily:'var(--font-mono)', padding:'3px 0',
              borderRadius:5, border: thickness===v ? '1px solid var(--blue)' : '1px solid var(--border)',
              background: thickness===v ? 'var(--blue-dim)' : 'transparent',
              color: thickness===v ? 'var(--blue)' : 'var(--text3)', cursor:'pointer',
            }}>
            {v*12}"
          </button>
        ))}
      </div>
    </div>
  )
}