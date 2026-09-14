// Trace — Login. Brand page in the pine-on-paper skin.
export function Login({ onEnter }) {
  const wrap = {
    position: 'fixed', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr',
    fontFamily: "'Plus Jakarta Sans', sans-serif", background: '#F2F1EC', color: '#161C18',
  }
  const dot = { width: 9, height: 9, background: 'currentColor', borderRadius: 1, transform: 'rotate(45deg)', display: 'inline-block' }
  const field = { marginTop: 18 }
  const labelSt = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#6E7A6F', marginBottom: 6 }
  const inputSt = {
    width: '100%', padding: '11px 12px', background: '#ECEAE1', border: '1px solid #C9C7BB',
    borderRadius: 2, fontFamily: 'inherit', fontSize: 14, color: '#161C18', boxSizing: 'border-box',
  }
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 26, color: '#14392B', letterSpacing: '.02em' }}>
            <span style={dot} />Trace
          </div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 15, color: '#6E7A6F', marginTop: 14, letterSpacing: '.03em' }}>
            Design. Inspect. Label.
          </div>
          <div style={field}>
            <label style={labelSt}>Work email</label>
            <input style={inputSt} type="email" placeholder="you@dealer.com" />
          </div>
          <div style={field}>
            <label style={labelSt}>Password</label>
            <input style={inputSt} type="password" placeholder="••••••••" />
          </div>
          <button onClick={onEnter} style={{
            width: '100%', marginTop: 22, padding: 12, background: '#14392B', color: '#F2F1EC',
            border: 'none', borderRadius: 2, fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Sign in</button>
          <div style={{ marginTop: 16, fontSize: 12.5, color: '#6E7A6F', textAlign: 'center' }}>
            New to Trace? <a href="#" onClick={e => { e.preventDefault(); onEnter() }} style={{ color: '#14392B', fontWeight: 600, textDecoration: 'none' }}>Create a workspace</a>
          </div>
          <div style={{ marginTop: 40, fontSize: 11, color: '#6E7A6F', fontFamily: "'JetBrains Mono', monospace" }}>TRACE · dealer workspace · v0.1</div>
        </div>
      </div>

      <div style={{ position: 'relative', background: '#14392B', color: '#F2F1EC', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 56 }}>
        <svg style={{ position: 'absolute', inset: 0, opacity: 0.5 }} viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <pattern id="lg" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#2C5B47" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="600" height="800" fill="url(#lg)" />
          <rect x="90" y="150" width="420" height="500" fill="none" stroke="#5C8574" strokeWidth="2" />
          <g stroke="#8CB3A2" strokeWidth="1.5" fill="none">
            {[190, 280, 306, 396, 422, 540].map((ry, i) => (
              <g key={i} transform={`translate(120,${ry})`}>
                <rect width="360" height="26" />
                {[60, 120, 180, 240, 300].map(cx => <line key={cx} x1={cx} y1="0" x2={cx} y2="26" />)}
              </g>
            ))}
          </g>
          <g fill="#5C8574">
            {[[210, 360], [300, 360], [390, 360], [210, 470], [300, 470], [390, 470]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="3" />)}
          </g>
        </svg>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 420 }}>
          <h1 style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 40, lineHeight: 1.05, margin: 0 }}>The dealer's rack<br />layout tool.</h1>
          <p style={{ marginTop: 16, fontSize: 14, color: '#C7D4CC', maxWidth: 340 }}>Draw a warehouse, generate racking, and hand the same layout to inspection and labels — one file, every job.</p>
        </div>
      </div>
    </div>
  )
}
