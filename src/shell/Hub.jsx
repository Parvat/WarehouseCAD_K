import { ArrowRight } from 'lucide-react'
import { Note } from '../components/shared/Note'

// Trace — Hub. The three doors. Draw opens the real CAD; the others are placeholders for now.
function Door({ title, desc, count, onClick, icon }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: 24,
      textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 220,
      fontFamily: 'var(--font-ui)', color: 'var(--ink)',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--pine)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 4, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pine)', marginBottom: 20 }}>{icon}</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, margin: 0 }}>{title}</h3>
      <p style={{ color: 'var(--steel)', fontSize: 13, marginTop: 8, flex: 1 }}>{desc}</p>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>{count}</span>
      <span style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: 'var(--pine)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open <ArrowRight size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span>
    </button>
  )
}

export function Hub({ onOpen }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', overflowY: 'auto' }}>
      <div style={{ height: 48, borderBottom: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--pine)' }}>
          <span style={{ width: 8, height: 8, background: 'currentColor', borderRadius: 1, transform: 'rotate(45deg)', display: 'inline-block' }} />Trace
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--pine)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)' }}>PP</div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '48px 24px 72px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, color: 'var(--pine)', margin: 0 }}>What do you need?</h2>
        <div style={{ color: 'var(--steel)', marginTop: 8, fontSize: 14, marginBottom: 24 }}>Pick where you're headed. Everything runs on the same layout.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Door title="Draw" count="6 projects" onClick={() => onOpen('cad')}
            desc="Lay out racking inside a building — describe dimensions, import a PDF, or draw on-site."
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>} />
          <Door title="Inspect" count="2 due" onClick={() => onOpen('inspect')}
            desc="Walk a layout, log condition on each rack, and generate the PDF report."
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a1 1 0 0 1 1-1Z" /><path d="M9 13l2 2 4-4" /></svg>} />
          <Door title="Label" count="3 layouts ready" onClick={() => onOpen('label')}
            desc="Generate location labels and QR codes from a layout — export to PDF or CSV."
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5V5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 1.4.6l9.5 9.5a2 2 0 0 1 0 2.8l-4.6 4.6a2 2 0 0 1-2.8 0L3.6 11A2 2 0 0 1 3 9.6Z" /><circle cx="7.5" cy="7.5" r="1.4" /></svg>} />
        </div>

        <Note level="warning" title="Needs attention" style={{ marginTop: 32, padding: '16px', fontSize: 13 }}>
          <span><b style={{ fontWeight: 600 }}>Four Seasons Produce</b> — inspection due, and a shared layout is awaiting customer approval.</span>
        </Note>
      </div>
    </div>
  )
}
