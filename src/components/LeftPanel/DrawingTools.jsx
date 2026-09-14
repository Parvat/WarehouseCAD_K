import { useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { TOOLS } from '../../constants'
import { SectionHeader } from '../shared/SectionHeader'
import { Tooltip } from '../shared/Tooltip'

const S = (props) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" width="28" height="28" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props} />
)

const DRAW_TOOLS = [
  { id: TOOLS.SELECT,       label: 'Select (V)',   icon: <S><path d="M3 3l5 14 3-5 5-3L3 3z" fill="currentColor" stroke="none" /></S> },
  { id: TOOLS.MULTI_SELECT, label: 'Multi (M)',    icon: <S strokeDasharray="3 1.5"><rect x="2" y="2" width="8" height="8" rx="1" /><rect x="10" y="10" width="8" height="8" rx="1" /></S> },
  { id: TOOLS.LINE,         label: 'Line (L)',     icon: <S><line x1="3" y1="17" x2="17" y2="3" strokeLinecap="round" /></S> },
  { id: TOOLS.ARC,          label: 'Arc (A)',      icon: <S><path d="M3 16 Q10 2 17 16" strokeLinecap="round" /></S> },
  { id: TOOLS.SQUARE,       label: 'Rect (R)',     icon: <S><rect x="3" y="3" width="14" height="14" rx="1.5" /></S> },
  { id: TOOLS.CIRCLE,       label: 'Ellipse (C)',  icon: <S><ellipse cx="10" cy="10" rx="7" ry="4.5" /></S> },
  { id: TOOLS.TRIANGLE,     label: 'Triangle',     icon: <S><path d="M10 3 L17 17 L3 17 Z" /></S> },
  { id: TOOLS.DIAMOND,      label: 'Diamond',      icon: <S><path d="M10 2 L18 10 L10 18 L2 10 Z" /></S> },
  { id: TOOLS.STAR,         label: 'Star',         icon: <S><path d="M10 2 L12 8 L18 8 L13 12 L15 18 L10 14 L5 18 L7 12 L2 8 L8 8 Z" /></S> },
  { id: TOOLS.CROSS,        label: 'Cross',        icon: <S><path d="M7 3h6v4h4v6h-4v4H7v-4H3V7h4z" /></S> },
  { id: TOOLS.ARROW,        label: 'Arrow',        icon: <S><path d="M2 8h11V5l5 5-5 5v-3H2z" /></S> },
  { id: TOOLS.TEXT,         label: 'Text (T)',     icon: <S><text x="4" y="15" fontSize="14" fontWeight="bold" fill="currentColor" stroke="none">T</text></S> },
  { id: TOOLS.PAN,          label: 'Pan (H)',      icon: <S><path d="M10 3v2M3 10h2M17 10h-2M10 15v2" strokeLinecap="round" /><circle cx="10" cy="10" r="4" /></S> },
]

const COLS = 3
const DEFAULT_ROWS = 2

export function DrawingTools() {
  const { activeTool, setActiveTool } = useCanvasStore()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? DRAW_TOOLS : DRAW_TOOLS.slice(0, COLS * DEFAULT_ROWS)
  const hasMore = DRAW_TOOLS.length > COLS * DEFAULT_ROWS

  return (
    <SectionHeader title="Drawing Tools" defaultOpen={true}>
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
            {expanded ? '▲ Show less' : `▼ Show more (${DRAW_TOOLS.length - COLS * DEFAULT_ROWS} more)`}
          </button>
        )}
      </div>
    </SectionHeader>
  )
}