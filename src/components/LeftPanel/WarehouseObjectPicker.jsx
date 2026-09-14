import { useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { WAREHOUSE_CATEGORIES } from '../../constants/warehouseObjects'
import { SectionHeader } from '../shared/SectionHeader'
import { objectContains } from '../../utils/canvas'

const FP_TYPES_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])

// Snap type badge colors
const SNAP_BADGE = {
  end:    { color: 'var(--green)', label: 'END'  },
  wall:   { color: '#6366f1', label: 'WALL' },
  grid:   { color: '#f59e0b', label: 'GRID' },
  center: { color: 'var(--red)', label: 'CTR'  },
  free:   { color: 'var(--text3)', label: 'FREE' },
}

// ── Preview SVGs for each type ────────────────────────────────────────────────
function ObjectPreview({ type, color }) {
  const c = color
  const fill = { fill: c + '22', stroke: c, strokeWidth: 1.5 }
  const dim  = { fill: 'none',   stroke: c, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }

  switch (type) {
    case 'rack_selective':
      return (<svg viewBox="0 0 44 20" fill="none" width="44" height="20">
        <rect x="1" y="1" width="42" height="18" {...fill} rx="0.5"/>
        {[1,8,15,22,29,36,43].map(x => <line key={x} x1={x} y1="1" x2={x} y2="19" stroke={c} strokeWidth="1.8"/>)}
        <line x1="1" y1="7"  x2="43" y2="7"  stroke={c} strokeWidth="0.8" opacity="0.6"/>
        <line x1="1" y1="13" x2="43" y2="13" stroke={c} strokeWidth="0.8" opacity="0.6"/>
      </svg>)
    case 'rack_row':
      return (<svg viewBox="0 0 44 20" fill="none" width="44" height="20">
        <rect x="1" y="1" width="42" height="18" {...fill} rx="0.5"/>
        {[1,9,17,27,35,43].map(x => <line key={x} x1={x} y1="1" x2={x} y2="19" stroke={c} strokeWidth="2"/>)}
        <line x1="1" y1="8"  x2="43" y2="8"  stroke={c} strokeWidth="0.7" opacity="0.5"/>
        <line x1="1" y1="14" x2="43" y2="14" stroke={c} strokeWidth="0.7" opacity="0.5"/>
        <text x="22" y="24" textAnchor="middle" fontSize="4" fill={c} opacity="0.7">ROW</text>
      </svg>)
    case 'rack_double_row':
      return (<svg viewBox="0 0 44 28" fill="none" width="44" height="28">
        <rect x="1" y="1"  width="42" height="12" {...fill} rx="0.5"/>
        <rect x="1" y="15" width="42" height="12" {...fill} rx="0.5"/>
        {[1,8,15,22,29,36,43].map(x => <><line key={x+'a'} x1={x} y1="1" x2={x} y2="13" stroke={c} strokeWidth="1.8"/><line key={x+'b'} x1={x} y1="15" x2={x} y2="27" stroke={c} strokeWidth="1.8"/></>)}
        <text x="22" y="14.5" textAnchor="middle" fontSize="3" fill={c} opacity="0.6">6" FLUE</text>
      </svg>)
    case 'column_grid':
      return (<svg viewBox="0 0 44 44" fill="none" width="44" height="44">
        {[0,1,2,3].map(row => [0,1,2,3].map(col => (
          <rect key={row*4+col} x={col*13+5} y={row*13+5} width={4} height={4} fill={c} opacity={0.9}/>
        )))}
        {[0,1,2,3].map(i => (
          <g key={i}>
            <line x1={5} y1={i*13+7} x2={39} y2={i*13+7} stroke={c} strokeWidth={0.5} opacity={0.3}/>
            <line x1={i*13+7} y1={5} x2={i*13+7} y2={39} stroke={c} strokeWidth={0.5} opacity={0.3}/>
          </g>
        ))}
      </svg>)
    case 'rack_cantilever':
      return (<svg viewBox="0 0 44 28" fill="none" width="44" height="28">
        {/* Top arms */}
        {[4,11,18,25,32,39].map(x => <rect key={'t'+x} x={x} y={1} width={3} height={9} fill="none" stroke={c} strokeWidth="1.2"/>)}
        {/* Spine */}
        <rect x={1} y={10} width={42} height={4} fill={c} opacity={0.7}/>
        {/* X-brace */}
        <line x1={4} y1={10} x2={40} y2={14} stroke={c} strokeWidth={0.8} opacity={0.5}/>
        <line x1={4} y1={14} x2={40} y2={10} stroke={c} strokeWidth={0.8} opacity={0.5}/>
        {/* Towers */}
        <rect x={1}  y={10} width={6} height={4} fill={c} opacity={1}/>
        <rect x={37} y={10} width={6} height={4} fill={c} opacity={1}/>
        {/* Bottom arms */}
        {[4,11,18,25,32,39].map(x => <rect key={'b'+x} x={x} y={14} width={3} height={9} fill="none" stroke={c} strokeWidth="1.2"/>)}
      </svg>)
    case 'rack_pushback':
      return (<svg viewBox="0 0 44 20" fill="none" width="44" height="20">
        <rect x="1" y="1" width="42" height="18" {...fill} rx="0.5"/>
        {[1,8,15,22,29,36,43].map(x => <line key={x} x1={x} y1="1" x2={x} y2="19" stroke={c} strokeWidth="1.8"/>)}
        {[0,1,2,3].map(i => <line key={i} x1={12+i*3} y1={4+i*3} x2={32+i*3} y2={4+i*3} stroke={c} strokeWidth="0.9" opacity="0.7"/>)}
      </svg>)
    case 'rack_drive_through':
      return (<svg viewBox="0 0 28 44" fill="none" width="28" height="44">
        <rect x="1" y="1" width="26" height="42" {...fill} rx="0.5"/>
        {[1,9,19,27].map(x => <line key={x} x1={x} y1="1" x2={x} y2="43" stroke={c} strokeWidth="1.8"/>)}
        {[7,14,21].map(x => <g key={x}>
          <path d={`M${x} 6 L${x} 2 M${x-2} 4 L${x} 2 L${x+2} 4`} stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <path d={`M${x} 38 L${x} 42 M${x-2} 40 L${x} 42 L${x+2} 40`} stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        </g>)}
      </svg>)
    case 'rack_pallet_flow':
      return (<svg viewBox="0 0 44 20" fill="none" width="44" height="20">
        <rect x="1" y="1" width="42" height="18" {...fill} rx="0.5"/>
        {[1,8,15,22,29,36,43].map(x => <line key={x} x1={x} y1="1" x2={x} y2="19" stroke={c} strokeWidth="1.8"/>)}
        {[12,25,37].map(x => <path key={x} d={`M${x-3} 10 L${x+3} 10 M${x+1} 8 L${x+3} 10 L${x+1} 12`} stroke={c} strokeWidth="1" fill="none" strokeLinecap="round"/>)}
      </svg>)
    case 'rack_drive_in':
      return (<svg viewBox="0 0 28 44" fill="none" width="28" height="44">
        <rect x="1" y="1" width="26" height="42" {...fill} rx="0.5"/>
        {[1,9,19,27].map(x => <line key={x} x1={x} y1="1" x2={x} y2="43" stroke={c} strokeWidth="1.8"/>)}
        <path d="M14 38 L14 32 M11 35 L14 38 L17 35" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      </svg>)
    case 'rack_mezzanine':
      return (<svg viewBox="0 0 44 36" fill="none" width="44" height="36">
        <rect x="1" y="1" width="42" height="34" fill={c+'18'} stroke={c} strokeWidth="1.5" rx="0.5"/>
        {[7,13,19,25,31].map(x => <line key={x} x1={x} y1="1" x2={x} y2="35" stroke={c} strokeWidth="0.5" opacity="0.3"/>)}
        {[8,15,22,29].map(y => <line key={y} x1="1" y1={y} x2="43" y2={y} stroke={c} strokeWidth="0.5" opacity="0.3"/>)}
        {[0,1,2,3].map(i => <rect key={i} x={36-i*2} y={28+i*1.5} width="6" height="1.5" fill={c} opacity="0.6"/>)}
        <text x="12" y="20" fontSize="5" fill={c} opacity="0.8">MEZZ</text>
      </svg>)
    case 'rack_shelving':
      return (<svg viewBox="0 0 44 16" fill="none" width="44" height="16">
        <rect x="1" y="1" width="42" height="14" {...fill} rx="0.5"/>
        <line x1="1" y1="1" x2="1" y2="15" stroke={c} strokeWidth="2"/>
        <line x1="43" y1="1" x2="43" y2="15" stroke={c} strokeWidth="2"/>
        {[6,12,18,24,30,36].map(x => <line key={x} x1={x} y1="4" x2={x} y2="12" stroke={c} strokeWidth="0.8" opacity="0.5"/>)}
        <line x1="1" y1="8" x2="43" y2="8" stroke={c} strokeWidth="0.8"/>
      </svg>)
    case 'mhe_forklift':
      return (<svg viewBox="0 0 24 36" fill="none" width="24" height="36">
        <rect x="3" y="8" width="18" height="20" rx="2" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <rect x="5" y="10" width="14" height="10" rx="1" fill={c+'44'} stroke={c} strokeWidth="1"/>
        <rect x="5" y="1" width="2" height="9" fill={c} opacity="0.8"/>
        <rect x="17" y="1" width="2" height="9" fill={c} opacity="0.8"/>
        <rect x="3" y="26" width="18" height="4" rx="1" fill={c} opacity="0.4"/>
        <circle cx="7" cy="29" r="2" fill={c} opacity="0.5"/>
        <circle cx="17" cy="29" r="2" fill={c} opacity="0.5"/>
        <text x="12" y="35" textAnchor="middle" fontSize="4" fill={c} opacity="0.7">12' AISLE</text>
      </svg>)
    case 'mhe_reach_truck':
      return (<svg viewBox="0 0 20 36" fill="none" width="20" height="36">
        <rect x="2" y="8" width="16" height="18" rx="2" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <rect x="4" y="10" width="12" height="9" rx="1" fill={c+'44'} stroke={c} strokeWidth="1"/>
        <rect x="3" y="1" width="2" height="9" fill={c} opacity="0.7"/>
        <rect x="15" y="1" width="2" height="9" fill={c} opacity="0.7"/>
        <rect x="3" y="1" width="14" height="1.5" fill={c} opacity="0.6"/>
        <rect x="2" y="24" width="5" height="2" rx="1" fill={c} opacity="0.5"/>
        <rect x="13" y="24" width="5" height="2" rx="1" fill={c} opacity="0.5"/>
        <text x="10" y="32" textAnchor="middle" fontSize="4" fill={c} opacity="0.7">9' AISLE</text>
      </svg>)
    case 'mhe_vna':
      return (<svg viewBox="0 0 18 32" fill="none" width="18" height="32">
        <rect x="2" y="6" width="14" height="16" rx="2" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <rect x="4" y="1" width="2" height="7" fill={c} opacity="0.7"/>
        <rect x="12" y="1" width="2" height="7" fill={c} opacity="0.7"/>
        <rect x="4" y="1" width="10" height="1.5" fill={c} opacity="0.6"/>
        <text x="9" y="29" textAnchor="middle" fontSize="4" fill={c} opacity="0.7">5.5' VNA</text>
      </svg>)
    case 'mhe_pallet_jack':
      return (<svg viewBox="0 0 16 36" fill="none" width="16" height="36">
        <rect x="3" y="14" width="10" height="16" rx="1" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <rect x="3" y="2" width="2.5" height="14" rx="1" fill={c} opacity="0.7"/>
        <rect x="10.5" y="2" width="2.5" height="14" rx="1" fill={c} opacity="0.7"/>
        <path d="M8 14 L8 8 Q8 4 5 3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="5" cy="28" r="2" fill="none" stroke={c} strokeWidth="1.2"/>
        <circle cx="11" cy="28" r="2" fill="none" stroke={c} strokeWidth="1.2"/>
      </svg>)
    case 'mhe_conveyor':
      return (<svg viewBox="0 0 44 18" fill="none" width="44" height="18">
        <rect x="1" y="3" width="42" height="12" fill={c+'22'} stroke={c} strokeWidth="1.5" rx="1"/>
        {[5,9,13,17,21,25,29,33,37,41].map(x => <line key={x} x1={x} y1="4" x2={x} y2="14" stroke={c} strokeWidth="1.5" opacity="0.6"/>)}
        <path d="M14 9 L30 9 M26 6 L30 9 L26 12" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      </svg>)
    case 'mhe_agv':
      return (<svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <rect x="2" y="2" width="20" height="20" rx="3" fill={c+'22'} stroke={c} strokeWidth="1.5"/>
        <path d="M7 7 Q12 3 17 7" stroke={c} strokeWidth="1" opacity="0.6" fill="none"/>
        <path d="M12 16 L12 8 M9 11 L12 8 L15 11" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="5"  cy="5"  r="1.5" fill={c} opacity="0.5"/>
        <circle cx="19" cy="5"  r="1.5" fill={c} opacity="0.5"/>
        <circle cx="5"  cy="19" r="1.5" fill={c} opacity="0.5"/>
        <circle cx="19" cy="19" r="1.5" fill={c} opacity="0.5"/>
      </svg>)
    case 'mhe_dock_leveler':
      return (<svg viewBox="0 0 44 28" fill="none" width="44" height="28">
        <rect x="1" y="6" width="42" height="20" fill={c+'22'} stroke={c} strokeWidth="1.5" rx="1"/>
        {[8,16,24,32,40].map(x => <path key={x} d={`M${x-4} 10 L${x} 16 L${x-4} 22`} stroke={c} strokeWidth="1" opacity="0.5" fill="none"/>)}
        <rect x="1" y="1" width="42" height="5" fill={c+'44'} stroke={c} strokeWidth="1.2"/>
        <text x="22" y="4.5" textAnchor="middle" fontSize="3.5" fill={c}>DOCK WALL</text>
      </svg>)
    case 'struct_column':
      return (<svg viewBox="0 0 20 20" fill="none" width="20" height="20">
        <rect x="4" y="4" width="12" height="12" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <rect x="1" y="4" width="18" height="3" fill={c} opacity="0.6"/>
        <rect x="1" y="13" width="18" height="3" fill={c} opacity="0.6"/>
        <rect x="8" y="4" width="4" height="12" fill={c} opacity="0.4"/>
        {/* grid dots */}
        <circle cx="1" cy="1" r="1" fill={c} opacity="0.3"/>
        <circle cx="19" cy="1" r="1" fill={c} opacity="0.3"/>
        <circle cx="1" cy="19" r="1" fill={c} opacity="0.3"/>
        <circle cx="19" cy="19" r="1" fill={c} opacity="0.3"/>
      </svg>)
    case 'struct_loading_dock':
      return (<svg viewBox="0 0 44 32" fill="none" width="44" height="32">
        <rect x="1" y="22" width="42" height="4" fill={c+'44'} stroke={c} strokeWidth="1.5"/>
        <rect x="10" y="6" width="24" height="16" fill={c+'18'} stroke={c} strokeWidth="1.5" rx="0.5"/>
        <line x1="10" y1="11" x2="34" y2="11" stroke={c} strokeWidth="0.8" opacity="0.5"/>
        <line x1="10" y1="16" x2="34" y2="16" stroke={c} strokeWidth="0.8" opacity="0.5"/>
        <rect x="7"  y="22" width="4" height="6" rx="1" fill={c} opacity="0.5"/>
        <rect x="33" y="22" width="4" height="6" rx="1" fill={c} opacity="0.5"/>
        <text x="22" y="4" textAnchor="middle" fontSize="4" fill={c} opacity="0.8">DOCK</text>
      </svg>)
    case 'struct_partition':
      return (<svg viewBox="0 0 44 12" fill="none" width="44" height="12">
        <rect x="1" y="3" width="42" height="6" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        {[4,8,12,16,20,24,28,32,36,40].map(x => <line key={x} x1={x} y1="3" x2={x+3} y2="9" stroke={c} strokeWidth="0.8" opacity="0.5"/>)}
      </svg>)
    case 'struct_egress':
      return (<svg viewBox="0 0 28 28" fill="none" width="28" height="28">
        <line x1="1" y1="1" x2="1" y2="18" stroke={c} strokeWidth="2"/>
        <line x1="18" y1="1" x2="18" y2="18" stroke={c} strokeWidth="2"/>
        <rect x="1" y="1" width="17" height="3" fill={c+'55'} stroke={c} strokeWidth="1.2"/>
        <path d="M1 4 Q10 4 18 13" stroke={c} strokeWidth="1" strokeDasharray="2 1.5" fill="none"/>
        <line x1="1" y1="4" x2="18" y2="13" stroke={c} strokeWidth="1.2"/>
        <text x="22" y="10" fontSize="6" fill={c} fontWeight="bold">^</text>
      </svg>)
    case 'struct_window':
      return (<svg viewBox="0 0 44 12" fill="none" width="44" height="12">
        <rect x="1" y="3" width="42" height="6" fill={c+'22'} stroke={c} strokeWidth="1.5"/>
        <line x1="1" y1="3" x2="43" y2="9" stroke={c} strokeWidth="0.8" opacity="0.4"/>
        <line x1="1" y1="9" x2="43" y2="3" stroke={c} strokeWidth="0.8" opacity="0.4"/>
        <rect x="1" y="1" width="3" height="10" fill={c+'55'} stroke={c} strokeWidth="1"/>
        <rect x="40" y="1" width="3" height="10" fill={c+'55'} stroke={c} strokeWidth="1"/>
      </svg>)
    case 'safety_bollard':
      return (<svg viewBox="0 0 20 20" fill="none" width="20" height="20">
        <circle cx="10" cy="10" r="8" fill={c+'33'} stroke={c} strokeWidth="2"/>
        <circle cx="10" cy="10" r="4" fill={c} opacity="0.4"/>
        <circle cx="10" cy="10" r="1.5" fill={c}/>
      </svg>)
    case 'safety_guardrail':
      return (<svg viewBox="0 0 44 12" fill="none" width="44" height="12">
        <line x1="1" y1="6" x2="43" y2="6" stroke={c} strokeWidth="2.5"/>
        {[2,8,14,20,26,32,38,44].map(x => <line key={x} x1={x} y1="2" x2={x} y2="10" stroke={c} strokeWidth="2"/>)}
      </svg>)
    case 'safety_rack_guard':
      return (<svg viewBox="0 0 16 28" fill="none" width="16" height="28">
        <path d="M2 26 L2 4 Q2 2 8 2 Q14 2 14 4 L14 26 Z" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <line x1="2" y1="10" x2="14" y2="10" stroke={c} strokeWidth="0.8" opacity="0.5"/>
        <rect x="5" y="20" width="6" height="3" fill={c} opacity="0.5" rx="0.5"/>
      </svg>)
    case 'safety_netting':
      return (<svg viewBox="0 0 44 12" fill="none" width="44" height="12">
        <rect x="1" y="1" width="42" height="10" fill={c+'10'} stroke={c} strokeWidth="1.5" rx="1" strokeDasharray="4 2"/>
        {[5,9,13,17,21,25,29,33,37,41].map(x => <line key={x} x1={x} y1="1" x2={x} y2="11" stroke={c} strokeWidth="0.6" opacity="0.4"/>)}
        {[4,8].map(y => <line key={y} x1="1" y1={y} x2="43" y2={y} stroke={c} strokeWidth="0.6" opacity="0.4"/>)}
      </svg>)
    case 'safety_sign':
      return (<svg viewBox="0 0 20 20" fill="none" width="20" height="20">
        <rect x="2" y="5" width="16" height="10" rx="1.5" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        <line x1="10" y1="15" x2="10" y2="19" stroke={c} strokeWidth="1.5"/>
        <text x="10" y="12" textAnchor="middle" fontSize="5" fill={c} fontWeight="bold">AISLE</text>
      </svg>)
    case 'util_charging':
      return (<svg viewBox="0 0 44 32" fill="none" width="44" height="32">
        <rect x="1" y="1" width="42" height="30" fill={c+'18'} stroke={c} strokeWidth="1.5" rx="2"/>
        {[4,14,24,34].map(x => <rect key={x} x={x} y="6" width="8" height="14" rx="1" fill={c+'33'} stroke={c} strokeWidth="1"/>)}
        <path d="M22 24 L19 29 L22 29 L20 34" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      </svg>)
    case 'util_hvac':
      return (<svg viewBox="0 0 28 28" fill="none" width="28" height="28">
        <circle cx="14" cy="14" r="12" fill={c+'18'} stroke={c} strokeWidth="1.5"/>
        <circle cx="14" cy="14" r="3" fill={c} opacity="0.5"/>
        {[0,90,180,270].map(a => {
          const rad = a * Math.PI / 180
          const x1 = 14 + 3*Math.cos(rad), y1 = 14 + 3*Math.sin(rad)
          const x2 = 14 + 10*Math.cos(rad+0.5), y2 = 14 + 10*Math.sin(rad+0.5)
          return <path key={a} d={`M${x1} ${y1} Q${14+8*Math.cos(rad+0.2)} ${14+8*Math.sin(rad+0.2)} ${x2} ${y2}`} stroke={c} strokeWidth="2" fill={c+'33'} opacity="0.8"/>
        })}
      </svg>)
    case 'util_sprinkler':
      return (<svg viewBox="0 0 20 20" fill="none" width="20" height="20">
        <circle cx="10" cy="10" r="3" fill={c} opacity="0.7"/>
        {[0,45,90,135,180,225,270,315].map(a => {
          const rad = a * Math.PI / 180
          return <line key={a} x1={10+3*Math.cos(rad)} y1={10+3*Math.sin(rad)} x2={10+8*Math.cos(rad)} y2={10+8*Math.sin(rad)} stroke={c} strokeWidth="1.2" opacity="0.6"/>
        })}
        <circle cx="10" cy="10" r="8" fill="none" stroke={c} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.4"/>
      </svg>)
    case 'util_lighting':
      return (<svg viewBox="0 0 44 16" fill="none" width="44" height="16">
        <rect x="1" y="3" width="42" height="10" rx="2" fill={c+'33'} stroke={c} strokeWidth="1.5"/>
        {[5,10,15,20,25,30,35,40].map(x => <rect key={x} x={x-2} y="5" width="4" height="6" rx="1" fill={c} opacity="0.5"/>)}
        <line x1="22" y1="1" x2="22" y2="3" stroke={c} strokeWidth="2"/>
      </svg>)
    case 'util_office_desk':
      return (<svg viewBox="0 0 44 28" fill="none" width="44" height="28">
        <rect x="1" y="1" width="42" height="20" rx="1" fill={c+'22'} stroke={c} strokeWidth="1.5"/>
        <rect x="16" y="4" width="12" height="8" rx="1" fill={c+'44'} stroke={c} strokeWidth="1"/>
        <line x1="22" y1="12" x2="22" y2="14" stroke={c} strokeWidth="1.5"/>
        <line x1="18" y1="14" x2="26" y2="14" stroke={c} strokeWidth="1.5"/>
        <circle cx="22" cy="25" r="4" fill={c+'22'} stroke={c} strokeWidth="1.2"/>
      </svg>)
    default:
      return (<svg viewBox="0 0 32 24" fill="none" width="32" height="24">
        <rect x="1" y="1" width="30" height="22" rx="2" fill={color+'22'} stroke={color} strokeWidth="1.5"/>
      </svg>)
  }
}

// ── Main Picker ───────────────────────────────────────────────────────────────
export function WarehouseObjectPicker() {
  const { addObject, activeLayerId, objects, zoom, panX, panY } = useCanvasStore()
  // Track selected variant per object id
  const [variantSel, setVariantSel] = useState({})
  const [gridSetup, setGridSetup] = useState({ baysX: 5, baysY: 4 })

  const place = (item, variant) => {
    const el = document.getElementById('canvas-container')
    const cw = el ? el.clientWidth  : 900
    const ch = el ? el.clientHeight : 600
    const wx = (cw / 2 - panX) / zoom
    const wy = (ch / 2 - panY) / zoom

    // For rack types: total width = beam length + upright on each end
    const RACK_TYPES = new Set(['rack_selective','rack_row','rack_double_row','rack_pushback','rack_pallet_flow','rack_shelving'])
    const BAY_RACK_TYPES = new Set(['rack_row','rack_double_row','rack_cantilever','rack_pushback','rack_pallet_flow','rack_drive_through'])
    // uprightWidth in inches: prefer variant-level → item meta → default 3"
    const uprightInches = variant.uprightWidth ?? item.meta?.uprightWidth ?? 3
    const uprightFt = uprightInches / 12
    // Default beam length from meta, not variant.w (which is total width for multi-bay racks)
    const beamIn = item.meta?.beamLengths?.[0] || 96  // default 96"
    const bays   = variant.bays || 1
    const beams  = Array(bays).fill(beamIn)

    // Cantilever: w/h from tower count + arm length
    let w, h
    if (item.type === 'column_grid') {
      const colIn  = 12
      const colPx   = (colIn / 12) * 40
      const fpFound = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, wx, wy))
      if (fpFound) {
        const wt = (fpFound.wallThicknessFt || 0.25) * 40
        w = fpFound.width  - 2 * wt
        h = fpFound.height - 2 * wt
      } else {
        // No FP — use bays × default 40ft spacing
        const spacePx = 40 * 40
        w = gridSetup.baysX * spacePx + colPx
        h = gridSetup.baysY * spacePx + colPx
      }
        } else if (item.type === 'rack_cantilever') {
      const armIn   = variant.armLengthIn || 36
      const dual    = variant.doubleSided ?? true
      const tCount  = variant.towers || 5
      const spineIn = item.meta?.spineDepthIn || 4
      w = ((tCount - 1) * 48 / 12) * 40   // (towers-1) × 48" spacing
      h = ((dual ? armIn * 2 + spineIn : armIn + spineIn) / 12) * 40
    } else if (['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(item.type)) {
      const upIn    = item.meta?.uprightWidth || 4
      const upPx    = (upIn/12)*40
      const ledgePx = (2/12)*40
      const clearPx = (1/12)*40
      const palletW = ((item.meta?.palletWIn||40)/12)*40
      const palletD = ((item.meta?.palletDIn||48)/12)*40
      const lanes   = variant.lanes || 2
      const deep    = variant.palletDeep || 5
      w = (lanes+1)*upPx + lanes*(ledgePx*2 + clearPx*2 + palletW)
      h = deep * palletD
    } else if (RACK_TYPES.has(item.type)) {
      w = ((uprightInches * (bays + 1) + beams.reduce((s,b)=>s+b,0)) / 12) * 40
      h = variant.h * 40
    } else {
      w = variant.w * 40
      h = variant.h * 40
    }
    const parentFp = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, wx, wy))
    const x = (item.type === 'column_grid' && parentFp)
      ? parentFp.x + (parentFp.wallThicknessFt || 0.25) * 40
      : wx - w / 2
    const y = (item.type === 'column_grid' && parentFp)
      ? parentFp.y + (parentFp.wallThicknessFt || 0.25) * 40
      : wy - h / 2
    addObject({
      type: item.type, x, y, width: w, height: h,
      fill: item.color + '22', stroke: item.color,
      strokeWidth: 1.5, label: item.label,
      snapType: item.snapType,
      aisleMin: item.aisleMin || variant.aisleMin,
      clearance: item.clearance,
      uprightWidth: uprightInches,
      // Bay system for rack types
      ...(BAY_RACK_TYPES.has(item.type) ? { beams, activeBayIdx: null, palletWIn: 48, palletDIn: 40, palletDeep: variant.palletDeep ?? null } : {}),
      ...(['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(item.type) ? {
        lanes:        variant.lanes        || 2,
        palletDeep:   variant.palletDeep   || (item.type === 'rack_pushback' ? 2 : 5),
        palletWIn:    item.meta?.palletWIn || 40,
        palletDIn:    item.meta?.palletDIn || 48,
        uprightWidth: item.meta?.uprightWidth || (item.type === 'rack_pushback' ? 3 : 4),
      } : {}),
      ...(item.type === 'column_grid' ? (() => {
        const colIn  = 12  // standard 12" default; adjustable in Properties panel
        const colPx   = (colIn / 12) * 40
        const fpLocal = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, wx, wy))
        if (fpLocal) {
          const wt     = (fpLocal.wallThicknessFt || 0.25) * 40
          const innerW = fpLocal.width  - 2 * wt
          const innerH = fpLocal.height - 2 * wt
          // Spacing = (inner clear - colW) / bays
          // so last column right edge = origin + bays*spX + colW = innerClear exactly
          const spX = (innerW - colPx) / gridSetup.baysX
          const spY = (innerH - colPx) / gridSetup.baysY
          return {
            spacingX:     Array(gridSetup.baysX).fill(spX),
            spacingY:     Array(gridSetup.baysY).fill(spY),
            columnW:      colPx, columnH: colPx,
            colSizeIn:    12,
            showGrid:     true, wallAttached: true,
          }
        } else {
          const spPx = 40 * 40
          return {
            spacingX:     Array(gridSetup.baysX).fill(spPx),
            spacingY:     Array(gridSetup.baysY).fill(spPx),
            columnW:      colPx, columnH: colPx,
            colSizeIn:    12,
            showGrid:     true, wallAttached: false,
          }
        }
      })() : {}),
      ...(item.type === 'rack_cantilever' ? (() => {
        const armIn     = variant.armLengthIn || 36
        const dual      = variant.doubleSided ?? true
        const tCount    = variant.towers || 5
        const spineIn   = item.meta?.spineDepthIn || 4
        const TSPACE_IN = 48  // 48" tower spacing
        const totalW    = ((tCount - 1) * TSPACE_IN / 12) * 40
        const totalH    = ((dual ? armIn * 2 + spineIn : armIn + spineIn) / 12) * 40
        return {
          towers:         Array(tCount).fill(armIn),  // [36,36,36,36,36]
          doubleSided:    dual,
          towerWidthIn:   item.meta?.towerWidthIn   || 10,
          spineDepthIn:   spineIn,
          armThicknessIn: item.meta?.armThicknessIn || 3,
          activeTowerIdx: null,
          // Override width/height with exact dimensions
          _overrideW: totalW,
          _overrideH: totalH,
        }
      })() : {}),
      ...(item.type === 'rack_double_row' ? { flueSpaceIn: item.meta?.flueSpace || 6 } : {}),
      layerId: activeLayerId,
      /* column_grid is parented like everything else — see FloatingToolbar. */
      ...(parentFp ? { parentId: parentFp.id } : {}),
    })
  }

  return (
    <>
      {WAREHOUSE_CATEGORIES.map(cat => (
        <SectionHeader key={cat.id} title={cat.label} defaultOpen={false}>
          <div style={{ padding: '4px 6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cat.objects.map(item => {
              const selIdx  = variantSel[item.id] ?? 0
              const variant = item.variants[selIdx]
              const badge   = SNAP_BADGE[item.snapType] || SNAP_BADGE.free
              const hasClearance = !!item.clearance

              return (
                <div key={item.id} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 6, overflow: 'hidden',
                }}>
                  {/* Top row: preview + info + place button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
                    {/* Preview */}
                    <div style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 48, height: 36, borderRadius: 4,
                      background: cat.color + '11', border: '1px solid ' + cat.color + '33',
                    }}>
                      <ObjectPreview type={item.type} color={cat.color} />
                    </div>

                    {/* Name + badges */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-ui)',
                        color: 'var(--text)', lineHeight: 1.3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{item.label}</div>
                      <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
                        {/* Snap type badge */}
                        <span style={{
                          fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          padding: '1px 4px', borderRadius: 2,
                          background: badge.color + '22', color: badge.color,
                          border: '1px solid ' + badge.color + '44',
                          letterSpacing: '0.05em',
                        }}>{badge.label}</span>
                        {/* Aisle requirement badge for MHE */}
                        {hasClearance && (
                          <span style={{
                            fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: 700,
                            padding: '1px 4px', borderRadius: 2,
                            background: '#f59e0b22', color: '#f59e0b',
                            border: '1px solid #f59e0b44',
                          }}>{item.aisleMin}'+ AISLE</span>
                        )}
                        {/* Variant dims / grid config summary */}
                        {item.type === 'column_grid' ? (
                          <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--text3)', padding: '1px 2px' }}>
                            {gridSetup.baysX} x {gridSetup.baysY} bays
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 7, fontFamily: 'var(--font-mono)',
                            color: 'var(--text3)', padding: '1px 2px',
                          }}>{variant.w}'x{variant.h}'</span>
                        )}
                      </div>
                    </div>

                    {/* Place button */}
                    <button
                      onClick={() => place(item, variant)}
                      title={item.description}
                      style={{
                        flexShrink: 0, padding: '5px 8px',
                        background: cat.color + '22', border: '1px solid ' + cat.color + '55',
                        borderRadius: 4, cursor: 'pointer',
                        fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: cat.color, letterSpacing: '0.03em',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = cat.color + '44' }}
                      onMouseLeave={e => { e.currentTarget.style.background = cat.color + '22' }}
                    >ADD</button>
                  </div>

                  {/* Column grid config form OR normal variant selector */}
                  {item.type === 'column_grid' ? (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 2 }}>
                        {gridSetup.baysX} x {gridSetup.baysY} bays -- drop inside floor plan to auto-fit
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { key: 'baysX', label: 'Bays X' },
                          { key: 'baysY', label: 'Bays Y' },
                        ].map(({ key, label }) => (
                          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                            <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{label}</span>
                            <input type="number" min={1} max={50} step={1}
                              value={gridSetup[key]}
                              onChange={e => setGridSetup(prev => ({ ...prev, [key]: Math.max(1, Number(e.target.value)) }))}
                              style={{
                                width: '100%', padding: '2px 4px', borderRadius: 3,
                                fontSize: 10, fontFamily: 'var(--font-mono)', textAlign: 'right',
                                background: 'var(--surface3)', border: '1px solid var(--border)',
                                color: 'var(--text)', outline: 'none',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : item.variants.length > 1 && (
                    <div style={{
                      borderTop: '1px solid var(--border)',
                      padding: '3px 8px', display: 'flex', gap: 3, flexWrap: 'wrap',
                    }}>
                      {item.variants.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => setVariantSel(prev => ({ ...prev, [item.id]: i }))}
                          style={{
                            padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
                            fontSize: 7, fontFamily: 'var(--font-mono)',
                            background: selIdx === i ? cat.color + '33' : 'transparent',
                            border: selIdx === i ? '1px solid ' + cat.color + '66' : '1px solid transparent',
                            color: selIdx === i ? cat.color : 'var(--text3)',
                            transition: 'all 0.1s',
                          }}
                        >{v.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionHeader>
      ))}
    </>
  )
}