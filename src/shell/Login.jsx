// Trace — Login. Brand page in the pine-on-paper skin.
export function Login({ onEnter }) {
  const wrap = {
    position: 'fixed', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr',
    fontFamily: 'var(--font-ui)', background: 'var(--bg)', color: 'var(--ink)',
  }
  const dot = { width: 9, height: 9, background: 'currentColor', borderRadius: 1, transform: 'rotate(45deg)', display: 'inline-block' }
  const field = { marginTop: 16 }
  const labelSt = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--steel)', marginBottom: 8 }
  const inputSt = { width: '100%', height: 40, padding: '0 12px', fontSize: 14 }
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, color: 'var(--pine)' }}>
            <span style={dot} />Trace
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--steel)', marginTop: 12 }}>
            Design. Inspect. Label.
          </div>
          <div style={field}>
            <label style={labelSt}>Work email</label>
            <input className="t-input t-words" style={inputSt} type="email" placeholder="you@dealer.com" />
          </div>
          <div style={field}>
            <label style={labelSt}>Password</label>
            <input className="t-input t-words" style={inputSt} type="password" placeholder="••••••••" />
          </div>
          <button onClick={onEnter} className="t-btn t-btn--primary t-btn--44 t-btn--block" style={{ marginTop: 24 }}>Sign in</button>
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--steel)', textAlign: 'center' }}>
            New to Trace? <a href="#" onClick={e => { e.preventDefault(); onEnter() }} style={{ color: 'var(--pine)', fontWeight: 600, textDecoration: 'none' }}>Create a workspace</a>
          </div>
          <div style={{ marginTop: 40, fontSize: 11, color: 'var(--steel)', fontFamily: 'var(--font-ui)' }}>TRACE · dealer workspace · <span className="t-num">v0.1</span></div>
        </div>
      </div>

      <div style={{ position: 'relative', background: 'var(--pine)', color: 'var(--bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 56 }}>
        <svg style={{ position: 'absolute', inset: 0, opacity: 0.5 }} viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <pattern id="lg" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" style={{ stroke: 'var(--pine-2)' }} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="600" height="800" fill="url(#lg)" />
          <rect x="90" y="150" width="420" height="500" fill="none" style={{ stroke: 'var(--bg)' }} strokeOpacity="0.35" strokeWidth="2" />
          <g style={{ stroke: 'var(--bg)' }} strokeOpacity="0.55" strokeWidth="1.5" fill="none">
            {[190, 280, 306, 396, 422, 540].map((ry, i) => (
              <g key={i} transform={`translate(120,${ry})`}>
                <rect width="360" height="26" />
                {[60, 120, 180, 240, 300].map(cx => <line key={cx} x1={cx} y1="0" x2={cx} y2="26" />)}
              </g>
            ))}
          </g>
          <g style={{ fill: 'var(--bg)' }} fillOpacity="0.35">
            {[[210, 360], [300, 360], [390, 360], [210, 470], [300, 470], [390, 470]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="3" />)}
          </g>
        </svg>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 420 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, lineHeight: 1.15, margin: 0 }}>The dealer's rack<br />layout tool.</h1>
          <p style={{ marginTop: 16, fontSize: 14, color: 'var(--bg)', opacity: 0.8, maxWidth: 340 }}>Draw a warehouse, generate racking, and hand the same layout to inspection and labels — one file, every job.</p>
        </div>
      </div>
    </div>
  )
}
