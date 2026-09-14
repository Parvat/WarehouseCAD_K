import { useCanvasStore } from '../../store/useCanvasStore'
import { TOOLS } from '../../constants'
import { SectionHeader } from '../shared/SectionHeader'
import { Tooltip } from '../shared/Tooltip'
import { cn } from '../../utils/cn'

const S = (props) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" width="15" height="15" strokeWidth="1.7" {...props} />
)

const FP_TOOLS = [
  {
    id: TOOLS.FP_RECT, label: 'Room', key: '',
    icon: <S><rect x="3" y="3" width="14" height="14" rx="1" strokeWidth="2" /></S>,
    hint: 'Draw a rectangular room',
  },
  {
    id: TOOLS.FP_L, label: 'L-Room', key: '',
    icon: <S><path d="M4 3v13h12v-3H7V3z" strokeWidth="2" /></S>,
    hint: 'Draw an L-shaped room',
  },
  {
    id: TOOLS.FP_U, label: 'U-Room', key: '',
    icon: <S><path d="M3 3v13h4V7h6v9h4V3" strokeWidth="2" /></S>,
    hint: 'Draw a U-shaped room',
  },
  {
    id: TOOLS.FP_T, label: 'T-Room', key: '',
    icon: <S><path d="M3 3h14v4H11v10H9V7H3z" strokeWidth="2" /></S>,
    hint: 'Draw a T-shaped room',
  },
]

export function FloorPlanTools() {
  const { activeTool, setActiveTool } = useCanvasStore()
  return (
    <SectionHeader title="Floor Plan Rooms" defaultOpen={true}>
      <div className="px-2 pb-1">
        <p className="text-[9px] text-[var(--text3)] font-mono mb-2">
          Draw room shapes. Rooms snap to wall thickness and show dimensions.
        </p>
        <div className="grid grid-cols-4 gap-1">
          {FP_TOOLS.map(tool => {
            const active = activeTool === tool.id
            return (
              <Tooltip key={tool.id} content={tool.hint}>
                <button
                  onClick={() => setActiveTool(tool.id)}
                  className={cn(
                    'rounded border flex flex-col items-center justify-center gap-0.5 transition-all w-full py-1.5',
                    active
                      ? 'bg-[var(--blue)]/15 border-[var(--blue)] text-[var(--blue)]'
                      : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text3)] hover:border-[var(--blue)]/40 hover:bg-[var(--surface3)] hover:text-[var(--text2)]',
                  )}
                >
                  {tool.icon}
                  <span className="text-[7px] font-mono leading-tight overflow-hidden w-full text-center px-0.5" style={{ wordBreak:'break-word' }}>{tool.label}</span>
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Wall thickness control */}
      <WallThicknessControl />
    </SectionHeader>
  )
}

function WallThicknessControl() {
  const { floorPlan, setFloorPlan, selectedIds, objects, updateObject, gridSize } = useCanvasStore()
  const thickness = floorPlan?.wallThicknessFt ?? 0.5

  const selFpObjs = objects.filter(o =>
    selectedIds.includes(o.id) &&
    ['fp_rect','fp_l','fp_t','fp_u','rect','l_shape','t_shape','u_shape'].includes(o.type)
  )
  const hasSelection = selFpObjs.length > 0

  const applyThickness = (val) => {
    const pxWidth = Math.max(1.5, val * (gridSize || 40) * 0.5)
    if (hasSelection) {
      selFpObjs.forEach(o => updateObject(o.id, { strokeWidth: pxWidth }))
    }
    setFloorPlan({ wallThicknessFt: val })
  }

  return (
    <div className="px-3 pb-3 flex flex-col gap-2 border-t border-[var(--border)] pt-2 mt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--text3)] font-mono">Wall Thickness</span>
        <span className="text-[9px] font-mono" style={{ color: hasSelection ? 'var(--accent)' : 'var(--text)' }}>
          {hasSelection ? `→ ${selFpObjs.length} shape(s)` : `${(thickness * 12).toFixed(0)}"`}
        </span>
      </div>
      <input
        type="range" min="0.25" max="2" step="0.25"
        value={thickness}
        onChange={e => applyThickness(Number(e.target.value))}
        className="accent-[var(--blue)] h-1 w-full"
      />
      <div className="flex gap-1">
        {[0.25, 0.5, 0.75, 1].map(v => (
          <button key={v}
            onClick={() => applyThickness(v)}
            className={cn(
              'flex-1 text-[8px] font-mono py-0.5 rounded border transition-colors',
              thickness === v ? 'border-[var(--blue)] text-[var(--blue)] bg-[var(--blue)]/10' : 'border-[var(--border)] text-[var(--text3)] hover:text-[var(--text2)]'
            )}
          >
            {v * 12}"
          </button>
        ))}
      </div>
    </div>
  )
}
