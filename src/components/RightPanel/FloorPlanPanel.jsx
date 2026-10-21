import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { SectionHeader } from '../shared/SectionHeader'
import { lShapePath, lMirrorPath, tShapePath, uShapePath, crossPath } from '../../utils/canvas'

function PlanPreview({ type }) {
  const pad = 4, vw = 54, vh = 40
  const W = vw-pad*2, H = vh-pad*2
  const s = { fill:'var(--surface)', stroke:'var(--pine)', strokeWidth:2.5, strokeLinejoin:'round' }
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
  const { placeFpObject } = useCanvasStore(useShallow(s => ({ placeFpObject: s.placeFpObject })))
  return (
    <SectionHeader title="Floor Plans" defaultOpen={true}>
      <div style={{ padding:'0 16px 16px', minWidth:0 }}>
        <p style={{ fontSize:12, color:'var(--steel)', fontFamily:'var(--font-ui)', margin:'0 0 8px', lineHeight:1.5 }}>
          Click to place a floor plan on the canvas.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:8 }}>
          {PLANS.map(plan => (
            <button key={plan.type} onClick={() => placeFpObject(plan)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:0,
                borderRadius:4, border:'1px solid var(--line)', padding:8,
                background:'var(--paper)', cursor:'pointer', transition:'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--pine)'; e.currentTarget.style.background='var(--bg)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--line)'; e.currentTarget.style.background='var(--paper)' }}
            >
              <div style={{ width:'100%', borderRadius:2, overflow:'hidden', background:'var(--canvas-bg)', border:'1px solid var(--line)' }}>
                <svg viewBox="0 0 54 40" width="100%" style={{ display:'block' }}>
                  {[14,27,40].flatMap(cx => [13,27].map(cy => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.8} fill="var(--pine)" opacity={0.2} />
                  )))}
                  <PlanPreview type={plan.type} />
                </svg>
              </div>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)', fontFamily:'var(--font-ui)' }}>
                {plan.label}
              </span>
              <span className="t-num" style={{ fontSize:11, color:'var(--steel)' }}>
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
  const { fpDefaults, setFpDefaults } = useCanvasStore(useShallow(s => ({ fpDefaults: s.fpDefaults, setFpDefaults: s.setFpDefaults })))
  const thickness = fpDefaults?.wallThicknessFt ?? 0.5
  return (
    <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--line)', display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span className="t-cap">Default Wall</span>
        <span className="t-num" style={{ fontSize:12, color:'var(--ink)' }}>{(thickness*12).toFixed(0)}"</span>
      </div>
      <input type="range" min={0.25} max={2} step={0.25} value={thickness}
        onChange={e => setFpDefaults({ wallThicknessFt: Number(e.target.value) })}
        style={{ accentColor:'var(--pine)', height:3, width:'100%' }} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:4 }}>
        {[0.25,0.5,0.75,1].map(v => (
          <button key={v} onClick={() => setFpDefaults({ wallThicknessFt: v })}
            className={'t-btn t-btn--secondary t-seg t-num' + (thickness===v ? ' is-on' : '')}
            style={{ padding:0, fontFamily:'var(--font-mono)', fontWeight:400 }}>
            {v*12}"
          </button>
        ))}
      </div>
    </div>
  )
}