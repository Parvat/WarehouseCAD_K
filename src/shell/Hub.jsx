// Trace — Hub. The three doors. Draw opens the real CAD; the others are placeholders for now.
function Door({ title, desc, count, onClick, icon }) {
  return (
    <button onClick={onClick} style={{
      background: '#ECEAE1', border: '1px solid #D6D4C9', borderRadius: 4, padding: '26px 24px',
      textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 220,
      fontFamily: 'inherit', color: '#161C18',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#14392B' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#D6D4C9' }}>
      <div style={{ width: 44, height: 44, borderRadius: 4, background: '#E4E2D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#14392B', marginBottom: 20 }}>{icon}</div>
      <h3 style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 19, margin: 0 }}>{title}</h3>
      <p style={{ color: '#6E7A6F', fontSize: 13, marginTop: 8, flex: 1 }}>{desc}</p>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6E7A6F', marginTop: 2 }}>{count}</span>
      <span style={{ marginTop: 12, fontSize: 12.5, fontWeight: 700, color: '#14392B' }}>Open →</span>
    </button>
  )
}

export function Hub({ onOpen }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F2F1EC', color: '#161C18', fontFamily: "'Plus Jakarta Sans', sans-serif", overflowY: 'auto' }}>
      <div style={{ height: 56, borderBottom: '1.5px solid #14392B', background: '#ECEAE1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 19, color: '#14392B' }}>
          <span style={{ width: 8, height: 8, background: 'currentColor', borderRadius: 1, transform: 'rotate(45deg)', display: 'inline-block' }} />Trace
        </div>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#14392B', color: '#F2F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: "'Oswald', sans-serif" }}>PP</div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px 72px' }}>
        <h2 style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 27, color: '#14392B', margin: 0 }}>What do you need?</h2>
        <div style={{ color: '#6E7A6F', marginTop: 6, fontSize: 14, marginBottom: 26 }}>Pick where you're headed. Everything runs on the same layout.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
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

        <div style={{ marginTop: 34, border: '1px solid #D6D4C9', borderLeft: '3px solid #B8791E', background: '#ECEAE1', borderRadius: 4, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#B8791E', background: '#F1E4CB', padding: '3px 8px', borderRadius: 2 }}>Needs attention</span>
          <span style={{ fontSize: 13 }}><b>Four Seasons Produce</b> — inspection due, and a shared layout is awaiting customer approval.</span>
        </div>
      </div>
    </div>
  )
}
