import { useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader }  from '../shared/SectionHeader'
import { Tooltip }        from '../shared/Tooltip'

export const ANNOT = {
  LABEL:        'annot_label',
  LABEL_BOX:    'annot_label_box',
  LABEL_CIRCLE: 'annot_label_circle',
  AUTO_NUMBER:  'annot_auto_number',
  DIMENSION:    'annot_dimension',
  MEASURE_WALLS:'annot_measure_walls',
  NORTH_ARROW:  'annot_north_arrow',
  SCALE_BAR:    'annot_scale_bar',
  SOLID_LINE:   'annot_solid_line',
  DOTTED_LINE:  'annot_dotted_line',
  DASHED_LINE:  'annot_dashed_line',
  DASHDOT_LINE: 'annot_dashdot_line',
  DRAW_LINE:    'annot_draw_line',
  ARROW_LINE:   'annot_arrow_line',
  DOUBLE_ARROW: 'annot_double_arrow',
  CURVE_ARROW:  'annot_curve_arrow',
  CALLOUT:      'annot_callout',
  CLOUD:        'annot_cloud',
}

export const ANNOT_SET = new Set(Object.values(ANNOT))

const S = (props) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" width="28" height="28" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props} />
)

const TOOLS_LIST = [
  { id: ANNOT.LABEL,        label: 'Label',      icon: <S><rect x="2" y="5" width="16" height="10" rx="1.5" fill="var(--surface)" stroke="currentColor"/><text x="10" y="13" textAnchor="middle" fontSize="7" fontFamily="sans-serif" fill="currentColor" stroke="none" fontWeight="bold">Abc</text></S> },
  { id: ANNOT.LABEL_BOX,    label: 'Label Box',  icon: <S><rect x="2" y="5" width="16" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeDasharray="3 1.5"/><text x="10" y="13" textAnchor="middle" fontSize="7" fontFamily="sans-serif" fill="currentColor" stroke="none" fontWeight="bold" fontStyle="italic">Abc</text></S> },
  { id: ANNOT.LABEL_CIRCLE, label: 'Label Oval', icon: <S><ellipse cx="10" cy="10" rx="8" ry="5.5" fill="var(--surface3)" stroke="currentColor"/><text x="10" y="13" textAnchor="middle" fontSize="7" fontFamily="sans-serif" fill="currentColor" stroke="none" fontWeight="bold">Abc</text></S> },
  { id: ANNOT.AUTO_NUMBER,  label: 'Auto №',     icon: <S><circle cx="10" cy="10" r="7.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor"/><text x="10" y="13.5" textAnchor="middle" fontSize="9" fontFamily="sans-serif" fill="currentColor" stroke="none" fontWeight="bold">1</text></S> },
  { id: ANNOT.DIMENSION,    label: 'Dimension',  icon: <S><line x1="3" y1="14" x2="17" y2="14"/><line x1="3" y1="11" x2="3" y2="17"/><line x1="17" y1="11" x2="17" y2="17"/><line x1="3" y1="6" x2="17" y2="6" strokeDasharray="3 1.5"/><text x="10" y="10" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none">dim</text></S> },
  { id: ANNOT.MEASURE_WALLS,label: 'Measure All',icon: <S><rect x="3" y="5" width="14" height="10" rx="1"/><line x1="3" y1="15" x2="17" y2="15" strokeWidth="2"/><line x1="3" y1="14" x2="3" y2="17"/><line x1="17" y1="14" x2="17" y2="17"/></S> },
  { id: ANNOT.NORTH_ARROW,  label: 'North',      icon: <S><circle cx="10" cy="10" r="7.5" strokeWidth="1.5"/><line x1="10" y1="4" x2="10" y2="16"/><path d="M7 8 L10 3 L13 8" fill="currentColor" strokeWidth="1"/><text x="10" y="19" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none">N</text></S> },
  { id: ANNOT.SCALE_BAR,    label: 'Scale Bar',  icon: <S><rect x="2" y="8" width="6" height="4" fill="currentColor"/><rect x="8" y="8" width="5" height="4" fill="none" stroke="currentColor"/><rect x="13" y="8" width="5" height="4" fill="currentColor"/><text x="10" y="18" textAnchor="middle" fontSize="4" fill="currentColor" stroke="none">0  1  2</text></S> },
  { id: ANNOT.SOLID_LINE,   label: 'Solid Line', icon: <S><line x1="2" y1="10" x2="18" y2="10" strokeWidth="1.5"/></S> },
  { id: ANNOT.DOTTED_LINE,  label: 'Dotted',     icon: <S><line x1="2" y1="10" x2="18" y2="10" strokeWidth="1.5" strokeDasharray="1.5 2.5"/></S> },
  { id: ANNOT.DASHED_LINE,  label: 'Dashed',     icon: <S><line x1="2" y1="10" x2="18" y2="10" strokeWidth="1.5" strokeDasharray="5 2"/></S> },
  { id: ANNOT.DASHDOT_LINE, label: 'Dash·Dot',   icon: <S><line x1="2" y1="10" x2="18" y2="10" strokeWidth="1.5" strokeDasharray="5 2 1.5 2"/></S> },
  { id: ANNOT.DRAW_LINE,    label: 'Draw',       icon: <S><path d="M3 15 Q5 10 8 12 Q11 14 13 8 Q15 4 17 6" strokeLinecap="round"/><path d="M16 4 L18 8 L14 7 Z" fill="currentColor" strokeWidth="0.5"/></S> },
  { id: ANNOT.ARROW_LINE,   label: 'Arrow →',    icon: <S><line x1="2" y1="10" x2="15" y2="10"/><path d="M13 7 L18 10 L13 13" fill="currentColor" strokeWidth="0.5"/></S> },
  { id: ANNOT.DOUBLE_ARROW, label: 'Arrow ↔',    icon: <S><line x1="4" y1="10" x2="16" y2="10"/><path d="M6 7 L1 10 L6 13" fill="currentColor" strokeWidth="0.5"/><path d="M14 7 L19 10 L14 13" fill="currentColor" strokeWidth="0.5"/></S> },
  { id: ANNOT.CURVE_ARROW,  label: 'Curve',      icon: <S><path d="M3 15 Q10 2 17 10" strokeLinecap="round"/><path d="M14 7 L18 12 L13 11" fill="currentColor" strokeWidth="0.5"/></S> },
  { id: ANNOT.CALLOUT,      label: 'Callout',    icon: <S><rect x="2" y="3" width="16" height="10" rx="1.5"/><path d="M5 13 L3 17 L9 13" fill="var(--surface3)" stroke="currentColor"/><text x="10" y="10" textAnchor="middle" fontSize="5.5" fill="currentColor" stroke="none">Note</text></S> },
  { id: ANNOT.CLOUD,        label: 'Cloud',      icon: <S><path d="M4 14 Q2 14 2 12 Q2 10 4 10 Q4 7 7 7 Q8 5 11 5 Q14 5 15 8 Q17 8 17 11 Q18 14 15 14 Z" strokeLinejoin="round"/></S> },
]

const COLS = 3
const DEFAULT_ROWS = 2

export function AnnotationPanel() {
  const { activeTool, setActiveTool } = useCanvasStore()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? TOOLS_LIST : TOOLS_LIST.slice(0, COLS * DEFAULT_ROWS)
  const hasMore = TOOLS_LIST.length > COLS * DEFAULT_ROWS

  return (
    <SectionHeader title="Annotations" defaultOpen={true}>
      <div style={{ padding:'6px 8px 4px' }}>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:4 }}>
          {visible.map(tool => {
            const active = activeTool === tool.id
            return (
              <Tooltip key={tool.id} content={tool.label}>
                <button
                  onClick={() => setActiveTool(tool.id)}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'center',
                    padding:'9px 0', borderRadius:6,
                    border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-solid)' : 'var(--surface2)',
                    color: active ? 'var(--accent-fg)' : 'var(--text2)',
                    opacity: active ? 1 : 0.85,
                    cursor:'pointer', width:'100%', transition:'all 0.12s',
                    flexDirection:'column', gap:3,
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background='var(--surface3)'; e.currentTarget.style.color='var(--text)'; e.currentTarget.style.opacity='1' }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background='var(--surface2)'; e.currentTarget.style.color='var(--text2)'; e.currentTarget.style.opacity='0.85' }}}
                >
                  {tool.icon}
                
                </button>
              </Tooltip>
            )
          })}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              width:'100%', marginTop:4, padding:'4px 0',
              background:'transparent', border:'none',
              color:'var(--text3)', fontSize:10,
              fontFamily:'var(--font-mono)', cursor:'pointer',
              letterSpacing:'0.05em',
            }}
            onMouseEnter={e => e.currentTarget.style.color='var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}
          >
            {expanded ? '▲ Show less' : `▼ Show more (${TOOLS_LIST.length - COLS * DEFAULT_ROWS} more)`}
          </button>
        )}
      </div>
    </SectionHeader>
  )
}