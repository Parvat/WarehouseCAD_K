import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

/* A right-panel section: a 40px heading row (Oswald 13, tracked .08em) with its chevron, 16px in from the panel's
   edges, a 1px line under the section. */
export function SectionHeader({ title, children, defaultOpen = true, action }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--line)', minWidth: 0 }}>
      <div
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
          height:40, padding:'0 16px', cursor:'pointer', userSelect:'none',
          transition:'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <ChevronRight size={16} strokeWidth={1.5} absoluteStrokeWidth style={{
            color:'var(--steel)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition:'transform 0.2s',
            flexShrink:0,
          }} />
          <span className="t-head">
            {title}
          </span>
        </div>
        {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
      </div>
      <div style={{ overflow:'hidden', transition:'max-height 0.2s ease',
        maxHeight: open ? '9999px' : '0px' }}>
        {children}
      </div>
    </div>
  )
}
