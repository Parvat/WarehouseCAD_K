import { pxToFtIn } from '../../utils/canvas'
const fmtLength = (px) => pxToFtIn(Math.abs(px))

const FOOT_PX  = 40
const INCH_PX  = FOOT_PX / 12

/* Level-of-detail thresholds — never draw marks closer together than this on screen */
const MIN_LABEL_PX = 56   // labelled foot ticks need room for the text
const MIN_TICK_PX  = 6    // bare inch ticks
const MAX_TICKS    = 200  // hard ceiling on nodes per ruler
const SPAN_PX      = 3000 // widest viewport the tick band must cover

/* 1-2-5 ladder: smallest tick interval (in feet) whose on-screen spacing clears minPx */
const LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
function chooseStepFt(zoom, minPx) {
  for (const n of LADDER) if (FOOT_PX * n * zoom >= minPx) return n
  return LADDER[LADDER.length - 1]
}

/* Number of ticks needed to cover the viewport at this spacing — was a flat 120 */
function tickCount(step) {
  return Math.max(8, Math.min(MAX_TICKS, Math.ceil(SPAN_PX / step) + 4))
}

function HRuler({ zoom, panX }) {
  const stepFt = chooseStepFt(zoom, MIN_LABEL_PX)
  const step   = FOOT_PX * stepFt * zoom
  const count  = tickCount(step)
  const showInches = stepFt === 1 && INCH_PX * zoom >= MIN_TICK_PX

  return (
    <div className="absolute top-0 left-5 right-0 h-5 bg-[var(--surface)] border-b border-[var(--border)] overflow-hidden z-10">
      <svg width="100%" height="20" style={{ position: 'absolute' }}>
        {Array.from({ length: count }, (_, i) => {
          // foot ticks
          const x  = ((panX % step) + i * step + step * 10) % (step * count) - step * 2
          const ft = Math.round((x - panX % step) / step) * stepFt
          return (
            <g key={`fh${i}`}>
              <line x1={x} y1={8} x2={x} y2={20} stroke="var(--border)" strokeWidth="1" />
              <text x={x+2} y={9} fontSize="7" fill="var(--text3)" fontFamily="JetBrains Mono,monospace">
                {fmtLength(ft * FOOT_PX)}
              </text>
            </g>
          )
        })}
        {/* Inch ticks — only once they are actually far enough apart to see */}
        {showInches && Array.from({ length: count * 12 }, (_, i) => i).map((i) => {
          const istep = INCH_PX * zoom
          const x     = ((panX % istep) + i * istep + istep * 100) % (istep * count * 12) - istep * 10
          // skip if this is a foot boundary (already drawn)
          if (i % 12 === 0) return null
          return <line key={`ih${i}`} x1={x} y1={14} x2={x} y2={20} stroke="var(--surface3)" strokeWidth="1" />
        })}
      </svg>
    </div>
  )
}

function VRuler({ zoom, panY }) {
  const stepFt = chooseStepFt(zoom, MIN_LABEL_PX)
  const step   = FOOT_PX * stepFt * zoom
  const count  = tickCount(step)
  const showInches = stepFt === 1 && INCH_PX * zoom >= MIN_TICK_PX

  return (
    <div className="absolute top-5 left-0 bottom-0 w-5 bg-[var(--surface)] border-r border-[var(--border)] overflow-hidden z-10">
      <svg width="20" height="100%" style={{ position: 'absolute' }}>
        {Array.from({ length: count }, (_, i) => {
          const y  = ((panY % step) + i * step + step * 10) % (step * count) - step * 2
          const ft = Math.round((y - panY % step) / step) * stepFt
          return (
            <g key={`fv${i}`}>
              <line x1={8} y1={y} x2={20} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={10} y={y+2} fontSize="7" fill="var(--text3)" fontFamily="JetBrains Mono,monospace"
                textAnchor="middle" transform={`rotate(-90,10,${y+2})`}>
                {fmtLength(ft * FOOT_PX)}
              </text>
            </g>
          )
        })}
        {showInches && Array.from({ length: count * 12 }, (_, i) => i).map((i) => {
          const istep = INCH_PX * zoom
          const y     = ((panY % istep) + i * istep + istep * 100) % (istep * count * 12) - istep * 10
          if (i % 12 === 0) return null
          return <line key={`iv${i}`} x1={14} y1={y} x2={20} y2={y} stroke="var(--surface3)" strokeWidth="1" />
        })}
      </svg>
    </div>
  )
}

export function Rulers({ zoom, panX, panY }) {
  return (
    <>
      <div className="absolute top-0 left-0 w-5 h-5 bg-[var(--surface)] border-r border-b border-[var(--border)] z-20" />
      <HRuler zoom={zoom} panX={panX} />
      <VRuler zoom={zoom} panY={panY} />
    </>
  )
}
