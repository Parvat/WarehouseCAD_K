import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

export function SectionHeader({ title, children, defaultOpen = true, action }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '0.5px solid var(--border)' }}>
      <div
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 13px', cursor:'pointer', userSelect:'none',
          transition:'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <ChevronRight size={11} style={{
            color:'var(--text3)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition:'transform 0.2s',
            flexShrink:0,
          }} />
          <span style={{
            fontFamily:'var(--font-display)',
            fontSize:'var(--fs-xs)',
            fontWeight:600,
            letterSpacing:'0.07em',
            textTransform:'uppercase',
            color:'var(--text3)',
          }}>
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