import { useCanvasStore } from '../../store/useCanvasStore'
import { FORKLIFTS } from '../../constants'
import { SectionHeader } from '../shared/SectionHeader'
import { cn } from '../../utils/cn'

function getStatus(minAisleFt, aisleWidthFt) {
  const diff = aisleWidthFt - minAisleFt
  if (diff >= 1)  return { label: '✓ Fits',     cls: 'bg-[var(--green)]/20 text-[var(--green)]' }
  if (diff >= 0)  return { label: '⚠ Tight',    cls: 'bg-[var(--accent)]/20 text-[var(--accent)]' }
  return           { label: '✗ Too Wide',  cls: 'bg-[var(--red)]/20 text-[var(--red)]' }
}

function ForkliftIcon({ size = 'md' }) {
  const [w, h] = size === 'sm' ? [16, 24] : [20, 32]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke="var(--blue)" strokeWidth="1.2">
      <rect x="2" y="4" width={w - 4} height={h - 10} rx="2" fill="var(--blue-dim)" />
      <rect x="2" y="0" width="4" height="8" fill="var(--blue-bdr)" />
      <rect x="7" y="0" width="4" height="8" fill="var(--blue-bdr)" />
      <circle cx="5"    cy={h - 5} r="3.5" />
      <circle cx={w - 5} cy={h - 5} r="3.5" />
    </svg>
  )
}

export function ForkliftPanel() {
  const { activeForkliftId, setActiveForklift } = useCanvasStore()
  const aisleWidthFt = 10 // In a real app: measured from canvas

  return (
    <SectionHeader title="Forklift Check">
      <div className="p-2 flex flex-col gap-1.5">
        {FORKLIFTS.map(f => {
          const status = getStatus(f.minAisleFt, aisleWidthFt)
          const active = activeForkliftId === f.id
          return (
            <button
              key={f.id}
              onClick={() => setActiveForklift(f.id)}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md border text-left w-full transition-all duration-150',
                active
                  ? 'bg-[var(--blue)]/10 border-[var(--blue)]'
                  : 'bg-[var(--surface2)] border-[var(--border)] hover:border-[var(--blue)]/40 hover:bg-[var(--surface3)]'
              )}
            >
              <ForkliftIcon size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[var(--text)] truncate">{f.name}</div>
                <div className="text-[9px] text-[var(--text3)] font-mono">{f.dims} · min {f.minAisle}</div>
              </div>
              <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0', status.cls)}>
                {status.label}
              </span>
            </button>
          )
        })}
        <p className="text-[9px] text-[var(--text3)] font-mono px-1 pt-1">Aisle width: {aisleWidthFt} ft</p>
      </div>
    </SectionHeader>
  )
}
