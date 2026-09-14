import { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'

export function Tooltip({ children, content }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const timer = useRef(null)

  function show() {
    timer.current = setTimeout(() => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      const spaceRight = window.innerWidth - r.right
      setPos({
        top: r.top + r.height / 2,
        left: spaceRight > 150 ? r.right + 8 : r.left - 8,
        flip: spaceRight <= 150,
      })
    }, 300)
  }

  function hide() {
    clearTimeout(timer.current)
    setPos(null)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display:'block' }}>
      {children}
      {pos && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          top: pos.top,
          left: pos.flip ? undefined : pos.left,
          right: pos.flip ? window.innerWidth - pos.left + 16 : undefined,
          transform: 'translateY(-50%)',
          zIndex: 9999,
          background: 'var(--surface2)',
          border: '1px solid var(--border2)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          {content}
        </div>,
        document.body
      )}
    </div>
  )
}