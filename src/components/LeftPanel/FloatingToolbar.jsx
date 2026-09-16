import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  /* chrome */
  Search, ChevronRight, ChevronsLeft, ChevronsRight, LayoutGrid, List,
  Pin, GripVertical, GripHorizontal, X, Settings,
  PencilRuler, Shapes, Frame,
  /* categories */
  Boxes, Forklift, Building2, ShieldAlert, PlugZap,
  /* racking */
  Grid3x3, Columns3, Rows4, AlignVerticalSpaceAround, ArrowDownToLine,
  ArrowRightLeft, ArrowBigRightDash, Layers2, Library,
  /* equipment */
  Truck, ArrowUpNarrowWide, HandPlatter, MoveHorizontal, Bot, TrendingUp,
  /* structural */
  LayoutGrid as LayoutGridIcon, RectangleVertical, DoorOpen, SeparatorHorizontal,
  LogOut, Blinds,
  /* safety */
  TrafficCone, Fence, Shield, Grip, Signpost,
  /* utilities */
  BatteryCharging, Fan, Droplets, Lightbulb, Armchair,
  /* draw tools + blocks */
  MousePointer2, Hand, Minus, MoveRight, Spline, Ruler, Signature, Type,
  Pencil, PenTool, Highlighter,
  RectangleHorizontal, Circle,
  /* floor plans — the L/T/U/cross outlines are drawn below, Lucide has none */
  Scan,
  /* toolbar chrome */
  ArrowUpDown, ArrowLeftRight,
} from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { TOOLS } from '../../constants'
import { ANNOT } from './AnnotationPanel'
import { WAREHOUSE_CATEGORIES } from '../../constants/warehouseObjects'
import { objectContains } from '../../utils/canvas'
import { getCanvasContainerSize } from '../../utils/canvasContainer'
import { PALETTE_COLORS } from '../../constants'
import { PEN_TYPES, PEN_ORDER, clampPenWidth, penDefaultWidth, loadPenPrefs, savePenPrefs } from '../../utils/freehand'

/* One glyph per preset — the text badges ate the popover's width. */
const PEN_ICONS = { pencil: Pencil, marker: PenTool, highlighter: Highlighter, technical: Ruler }

const FP_TYPES_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PANEL PREFERENCES — local to this component, persisted in localStorage.    */
/*  Deliberately NOT in the canvas store: none of this is document state.      */
/*  Panel width, collapsed, view mode, toolbar orientation/position and the    */
/*  pinned-tray position all live here.                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */
const PREFS_KEY = 'trace.leftpanel.v1'

/* Width has two writers — the collapse toggle and the drag handle. They share a
   single stored value: collapsing goes to RAIL_W, expanding restores whatever
   the drag last left behind, never a hardcoded default. */
const RAIL_W      = 50
const PANEL_MIN   = 150
const PANEL_MAX   = 420
const PANEL_START = 240
/* Below this the "Library" wordmark collides with the pin button. */
const LABEL_MIN_W = 190
/* Two footer rows + padding. The scroll body stops here, so it has to track the
   footer or the last section row hides underneath it. */
const FOOTER_H    = 80

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
}
const clampW = w => Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(w)))

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  rAF COALESCING — same shape as the canvas pan fix: hold the pending frame   */
/*  in a ref, cancel it, schedule exactly one write per frame. Resizing the     */
/*  panel and dragging a floating panel both run through this, so neither can   */
/*  fire more state writes than the compositor can draw.                       */
/* ═══════════════════════════════════════════════════════════════════════════ */
function useRafWriter() {
  const raf = useRef(null)
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])
  return useCallback(fn => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => { raf.current = null; fn() })
  }, [])
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ICON REGISTRY — every glyph in this panel is Lucide, one size, one stroke. */
/* ═══════════════════════════════════════════════════════════════════════════ */
export const ICON_STROKE = 1.5           // thinner, lighter line
export const ICON_SIZE   = 18            // list rows, chrome
export const HEADER_ICON = 22            // expanded section headers AND the rail,
                                         // so both states describe a section identically
export const TOOLBAR_ICON = 21           // floating drawing tools
/* List-row tree geometry. Sub-items indent INDENT from the section header; the
   spine sits CONNECTOR back from that so the connector lands on the row. */
const ROW_H     = 32
const ROW_GAP   = 1
const INDENT    = 15
const CONNECTOR = 11
/* Spread on EVERY Lucide glyph. absoluteStrokeWidth keeps the rendered stroke a
   true 1.5px at any box size, so nothing looks heavier than anything else. */

/* Lucide has no floor-plan outlines, and the nearest polygons do not read as the
   shape — L-Shape and L-Mirror both landed on Pentagon, which is a duplicate
   glyph for two different items. These are drawn to Lucide spec: 24×24, fill
   none, currentColor, minimal, and they repeat Lucide's absoluteStrokeWidth
   maths so the line weight matches every neighbouring glyph exactly. */
const fpGlyph = (d, name) => {
  const G = ({ size = 24, strokeWidth = 2, absoluteStrokeWidth = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d}/>
    </svg>
  )
  G.displayName = name
  return G
}
const FpRect   = fpGlyph('M3 6h18v12H3z',                          'FpRect')
const FpL      = fpGlyph('M3 3h7v11h11v7H3z',                      'FpL')
const FpLMirror= fpGlyph('M21 3h-7v11H3v7h18z',                    'FpLMirror')
const FpT      = fpGlyph('M3 3h18v7h-5.5v11h-7V10H3z',             'FpT')
const FpU      = fpGlyph('M3 3h5v11h8V3h5v18H3z',                  'FpU')
const FpCross  = fpGlyph('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',          'FpCross')
/* Lucide 0.400 has Info (a circle) and BadgeInfo, but no info-in-a-square.
   Same construction as above: rounded square, stem, and a round-capped dot —
   which is exactly how Lucide's own Info draws its dot (`M12 8h.01`). */
const InfoSquare = fpGlyph(
  'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 16v-4 M12 8h.01',
  'InfoSquare')

/* Footer — project-level entry points. No handlers yet: nothing in the store
   opens these, and inventing one would be a logic change. */
const FOOTER_ITEMS = [
  { id:'settings',   label:'Project Settings',   Icon:Settings   },
  { id:'properties', label:'Project Properties', Icon:InfoSquare },
]

/* keyed by item id where ids are unique, else by type */
const ITEM_ICONS = {
  /* racking */
  rack_row:            Grid3x3,
  rack_row_multi:      Columns3,
  rack_double_row:     Rows4,
  rack_cantilever:     AlignVerticalSpaceAround,
  rack_drive_in:       ArrowDownToLine,
  rack_drive_through:  ArrowRightLeft,
  rack_pushback:       ChevronsRight,
  rack_pallet_flow:    ArrowBigRightDash,
  rack_mezzanine:      Layers2,
  rack_shelving:       Library,
  /* equipment */
  mhe_forklift:        Forklift,
  mhe_reach_truck:     Truck,
  mhe_vna:             ArrowUpNarrowWide,
  mhe_pallet_jack:     HandPlatter,
  mhe_conveyor:        MoveHorizontal,
  mhe_agv:             Bot,
  mhe_dock_leveler:    TrendingUp,
  /* structural */
  column_grid:         LayoutGridIcon,
  struct_column:       RectangleVertical,
  struct_loading_dock: DoorOpen,
  struct_partition:    SeparatorHorizontal,
  struct_egress:       LogOut,
  struct_window:       Blinds,
  /* safety */
  safety_bollard:      TrafficCone,
  safety_guardrail:    Fence,
  safety_rack_guard:   Shield,
  safety_netting:      Grip,
  safety_sign:         Signpost,
  /* utilities */
  util_charging:       BatteryCharging,
  util_hvac:           Fan,
  util_sprinkler:      Droplets,
  util_lighting:       Lightbulb,
  util_office_desk:    Armchair,
  /* blocks — placeable shape objects */
  shape_rect:    RectangleHorizontal,
  shape_ellipse: Circle,
  /* floor plans */
  fp_rect:     FpRect,
  fp_l:        FpL,
  fp_l_mirror: FpLMirror,
  fp_t:        FpT,
  fp_u:        FpU,
  fp_cross:    FpCross,
  fp_custom:   Scan,
}

const CATEGORY_ICONS = {
  storage:    Boxes,
  mhe:        Forklift,
  structural: Building2,
  safety:     ShieldAlert,
  utilities:  PlugZap,
  shapes:     Shapes,
  fp:         Frame,
}

/* Single place that renders an item glyph, so size and stroke can never drift.
   `Rack Row (multi-bay)` shares rack_row's type, so id wins when it resolves. */
function ItemIcon({ item, size = 18 }) {
  const C = ITEM_ICONS[item?.id] || ITEM_ICONS[item?.type] || Boxes
  return <C size={size} strokeWidth={ICON_STROKE} absoluteStrokeWidth />
}
function CatIcon({ id, size = ICON_SIZE, color }) {
  const C = CATEGORY_ICONS[id] || Boxes
  return <C size={size} strokeWidth={ICON_STROKE} absoluteStrokeWidth color={color}/>
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  BLOCKS — placeable shape OBJECTS. The drawing TOOLS (line, arrow, arc,     */
/*  dimension, draw, text) are actions, so they live in the floating toolbar.  */
/* ═══════════════════════════════════════════════════════════════════════════ */
/* Triangle, Diamond, Star and Cross are deliberately NOT here. They are real
   tools the canvas accepts, but drawing one crashes the whole app:
   CanvasObjectCore.jsx:148-151 calls trianglePath/diamondPath/starPath/
   crossPath without importing them (ShapeGeometry.jsx:4 imports the same four
   correctly). That file is protected — see the note in the handover. Put them
   back the moment the import is added.  */
const BLOCK_ITEMS = [
  { id:'shape_rect',    label:'Rectangle', tool:TOOLS.SQUARE },
  { id:'shape_ellipse', label:'Ellipse',   tool:TOOLS.CIRCLE },
]

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  FLOOR PLANS — its own top-level section. "Custom" drops a blank rectangle   */
/*  which the wall-drag system then reshapes into any outline.                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
const FP_ITEMS = [
  { id:'fp_rect',     label:'Rectangle', wFt:80,  hFt:60, type:'fp_rect'     },
  { id:'fp_l',        label:'L-Shape',   wFt:80,  hFt:60, type:'fp_l'        },
  { id:'fp_l_mirror', label:'L-Mirror',  wFt:80,  hFt:60, type:'fp_l_mirror' },
  { id:'fp_t',        label:'T-Shape',   wFt:80,  hFt:60, type:'fp_t'        },
  { id:'fp_u',        label:'U-Shape',   wFt:80,  hFt:60, type:'fp_u'        },
  { id:'fp_cross',    label:'Cross',     wFt:80,  hFt:80, type:'fp_cross'    },
  { id:'fp_custom',   label:'Custom',    wFt:100, hFt:80, type:'fp_rect',
    hint:'Blank floor plan — drag the walls to shape it' },
]

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  GRID LABELS — the word "Rack" is redundant once the icon carries the        */
/*  category colour, and 62px tiles have no room for it. List mode keeps the    */
/*  full name; the title attribute always carries it.                          */
/*  "Rack Row" keeps its noun — cutting to "Row" collides with "Double Row".    */
/* ═══════════════════════════════════════════════════════════════════════════ */
const SHORT_LABEL = {
  rack_selective:     'Selective',
  rack_cantilever:    'Cantilever',
  rack_drive_in:      'Drive-In',
  rack_drive_through: 'Drive-Thru',
  rack_pushback:      'Pushback',
  rack_pallet_flow:   'Pallet Flow',
  rack_shelving:      'Shelving',
  rack_row:           'Rack Row',
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  FLOATING PANEL — ONE drag implementation, used by the tool bar AND the      */
/*  pinned tray. Grip to move, position remembered by the caller, clamped so    */
/*  it can never be dragged off screen.                                        */
/*                                                                             */
/*  Portalled to the [data-theme] root, not document.body: every colour here    */
/*  is a CSS variable and those variables are scoped to that div. Portalling to */
/*  body resolves them all to nothing and the panel renders invisible.         */
/* ═══════════════════════════════════════════════════════════════════════════ */
const EDGE = 8
function clampPos(x, y, w, h) {
  const vw = window.innerWidth, vh = window.innerHeight
  return {
    x: Math.round(Math.max(EDGE, Math.min(x, Math.max(EDGE, vw - w - EDGE)))),
    y: Math.round(Math.max(EDGE, Math.min(y, Math.max(EDGE, vh - h - EDGE)))),
  }
}

function useThemeHost() {
  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.querySelector('[data-theme]')) }, [])
  return host
}

function FloatingPanel({ ariaLabel, pos, setPos, defaultPos, horizontal, children }) {
  const host     = useThemeHost()
  const ref      = useRef(null)
  const dragRef  = useRef(null)
  const schedule = useRafWriter()
  const [dragging, setDragging] = useState(false)

  /* First paint uses defaultPos; the moment it lands, snap it inside the
     viewport so a remembered position survives a smaller window. */
  useEffect(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const p = pos || defaultPos
    const c = clampPos(p.x, p.y, r.width, r.height)
    if (c.x !== p.x || c.y !== p.y) setPos(c)
  }, [host, horizontal])            // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = e => {
    if (e.button !== 0) return
    const r = ref.current.getBoundingClientRect()
    dragRef.current = { dx:e.clientX - r.left, dy:e.clientY - r.top, w:r.width, h:r.height }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    e.preventDefault()
  }
  const onMove = e => {
    const d = dragRef.current
    if (!d) return
    const x = e.clientX - d.dx, y = e.clientY - d.dy
    schedule(() => setPos(clampPos(x, y, d.w, d.h)))
  }
  const onUp = e => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already gone */ }
  }

  const p = pos || defaultPos
  const Gripper = horizontal ? GripVertical : GripHorizontal
  const node = (
    <div ref={ref} role="group" aria-label={ariaLabel} data-floating={ariaLabel}
      style={{
        position:'fixed', left:p.x, top:p.y, zIndex:9998,
        display:'flex', flexDirection: horizontal ? 'row' : 'column',
        alignItems: horizontal ? 'center' : 'stretch',
        background:'var(--panel-bg)', border:'0.5px solid var(--panel-border)',
        borderRadius:11, boxShadow:'0 8px 22px rgba(11,16,29,0.14)',
        userSelect:'none', touchAction:'none',
        cursor: dragging ? 'grabbing' : 'default',
      }}>
      {/* Grip — the only drag surface, so the buttons inside stay clickable.
          Lucide's Grip* glyphs are literally a 2×3 dot grid. It spans the full
          cross-axis with a 24px hit area, which is the touch-target floor. */}
      <div data-grip onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}
        title={`Drag to move ${ariaLabel}`} aria-label={`Move ${ariaLabel}`}
        style={{
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          cursor: dragging ? 'grabbing' : 'grab', color:'var(--panel-text4)',
          ...(horizontal ? { width:24, alignSelf:'stretch' } : { height:24 }),
        }}>
        <Gripper size={16} strokeWidth={2} absoluteStrokeWidth/>
      </div>
      {children}
    </div>
  )
  return host ? createPortal(node, host) : null
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  DRAWING TOOLBAR — actions, not objects, so it floats over the canvas.      */
/*  Every entry maps to a tool the canvas already handles.                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
/* Arrow (TOOLS.ARROW) and Arc (TOOLS.ARC) are missing on purpose. Both crash
   the app the moment you start the drag: the drawing-preview switch in
   CanvasObjectCore.jsx calls arrowPath/arcPath — and seven more path helpers —
   without importing any of them, though all nine are exported from
   utils/canvas.js. That file is protected; add the import and these two go
   straight back in.  */
/* `broken` marks a tool the canvas cannot preview: the drag preview in
   CanvasObjectCore.jsx calls arrowPath/arcPath (and seven more path helpers)
   without importing any of them, so starting a drag white-screens the app.
   They render in place but disabled, so the tool set reads complete and
   nothing can crash. Drop the flag once that import lands — see CLAUDE.md. */
const TOOLBAR_TOOLS = [
  { id:'select',    tool:TOOLS.SELECT,    label:'Select',    Icon:MousePointer2 },
  { id:'pan',       tool:TOOLS.PAN,       label:'Pan',       Icon:Hand          },
  null,
  { id:'line',      tool:TOOLS.LINE,      label:'Line',      Icon:Minus         },
  { id:'arrow',     tool:TOOLS.ARROW,     label:'Arrow',     Icon:MoveRight     },
  { id:'arc',       tool:TOOLS.ARC,       label:'Arc',       Icon:Spline        },
  { id:'dimension', tool:ANNOT.DIMENSION, label:'Dimension', Icon:Ruler         },
  { id:'freehand',  tool:TOOLS.FREEHAND,  label:'Freehand',  Icon:Signature     },
  { id:'text',      tool:TOOLS.TEXT,      label:'Text',      Icon:Type          },
]
const BROKEN_HINT = ' — unavailable: CanvasObjectCore.jsx is missing its path-helper import'

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PEN OPTIONS — contextual sub-toolbar, shown only while Freehand is active. */
/*  Writes the tool DEFAULTS (localStorage, never the canvas store); colour    */
/*  reuses the store's existing strokeColor rather than adding a second source */
/*  of draw colour.                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PenOptions({ prefs, setPrefs, strokeColor, setStrokeColor, horizontal, selectedStroke }) {
  const row = (label, children) => (
    <div style={{ display:'flex', alignItems:'center', gap:8, minHeight:26 }}>
      <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--panel-text3)',
        width:44, flexShrink:0 }}>{label}</span>
      <div style={{ display:'flex', gap:4, flex:1, flexWrap:'wrap', alignItems:'center', minWidth:0 }}>{children}</div>
    </div>
  )
  const chip = (on, key, title, kids, onClick) => (
    <button key={key} title={title} aria-label={title} aria-pressed={on} onClick={onClick}
      style={{
        minWidth:26, height:24, padding:'0 7px', borderRadius:6, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontFamily:'var(--font-mono)', whiteSpace:'nowrap',
        background: on ? 'var(--panel-hover)' : 'transparent',
        color:      on ? 'var(--text)'        : 'var(--panel-text2)',
        border:`1px solid ${on ? 'var(--panel-text4)' : 'var(--panel-border)'}`,
      }}>{kids}</button>
  )
  const pen = PEN_TYPES[prefs.pen] || PEN_TYPES.pencil
  /* Only Technical draws a stroked polyline; the rest are filled outlines. */
  const isStroked = prefs.pen === 'technical'
  /* the slider spans the full 1-32 range; the pen's own range is the guide */
  const setWidth = w => setPrefs({ width: clampPenWidth(prefs.pen, Number(w) || 1) })

  return (
    <div role="dialog" aria-label="Pen options" data-pen-options
      style={{
        position:'absolute', zIndex:10000, width:244,
        ...(horizontal ? { top:'100%', left:0, marginTop:6 } : { left:'100%', top:0, marginLeft:6 }),
        display:'flex', flexDirection:'column', gap:7, padding:'10px 11px 11px',
        background:'var(--panel-bg)', border:'0.5px solid var(--panel-border)',
        borderRadius:11, boxShadow:'0 8px 22px rgba(11,16,29,0.14)',
      }}>
      {row('Pen', PEN_ORDER.map(k => {
        const P = PEN_TYPES[k], Icon = PEN_ICONS[k], active = prefs.pen === k
        return (
          <button key={k} aria-pressed={active}
            aria-label={`${P.label} (${P.min}–${P.max}px)`}
            title={`${P.label} (${P.min}–${P.max}px)`}
            /* switching preset jumps to that preset's DEFAULT width, so the
               slider lands mid-range instead of pinning to a clamped edge */
            onClick={() => setPrefs({ pen:k, width: penDefaultWidth(k) })}
            style={{
              width:32, height:32, padding:6, borderRadius:8, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: active ? 'var(--accent-solid)' : 'transparent',
              color:      active ? 'var(--accent-fg)'    : 'var(--panel-text2)',
              border:`1px solid ${active ? 'transparent' : 'var(--panel-border)'}`,
              transition:'background .12s, color .12s',
            }}>
            <Icon size={16} strokeWidth={ICON_STROKE} absoluteStrokeWidth/>
          </button>
        )
      }))}

      {row('Width', <>
        {/* range follows the ACTIVE preset — a fixed 1-32 track meant most of
            the slider clamped back and looked stuck */}
        <input type="range" min={pen.min} max={pen.max} step="0.5" aria-label="Stroke width"
          value={prefs.width} onChange={e => setWidth(e.target.value)}
          style={{ flex:1, minWidth:70, accentColor:'var(--text)', height:4 }}/>
        {/* anything draggable also accepts a typed exact value */}
        <input type="number" min={pen.min} max={pen.max} step="0.5" aria-label="Exact stroke width"
          value={prefs.width} onChange={e => setWidth(e.target.value)}
          style={{ width:50, height:24, borderRadius:6, padding:'0 6px',
            background:'var(--surface2)', border:'1px solid var(--panel-border)',
            fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text)', outline:'none' }}/>
      </>)}
      <div style={{ fontSize:9.5, fontFamily:'var(--font-mono)', color:'var(--panel-text4)',
        marginTop:-4, paddingLeft:52 }}>
        {pen.label} {pen.min}–{pen.max}px{pen.alpha < 1 ? ` · ${Math.round(pen.alpha*100)}% alpha` : ''}
      </div>

      {row('Color', <>
        {PALETTE_COLORS.slice(0, 8).map(c => (
          <button key={c} aria-label={`Color ${c}`} title={c} onClick={() => setStrokeColor(c)}
            style={{ width:18, height:18, borderRadius:4, cursor:'pointer', background:c,
              border:`1.5px solid ${strokeColor === c ? 'var(--text)' : 'transparent'}` }}/>
        ))}
        <input type="color" aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(strokeColor) ? strokeColor : '#888888'}
          onChange={e => setStrokeColor(e.target.value)}
          style={{ width:22, height:20, padding:0, border:'1px solid var(--panel-border)',
            borderRadius:4, background:'transparent', cursor:'pointer' }}/>
      </>)}

      {row('Cap', ['round','square','butt'].map(c =>
        chip(prefs.cap === c, 'c'+c, `Cap ${c}`, c, () => setPrefs({ cap:c }))))}
      {row('Join', ['round','miter','bevel'].map(j => {
        const on = prefs.join === j
        return (
          <button key={'j'+j} aria-pressed={on} disabled={!isStroked}
            aria-label={`Join ${j}`}
            title={isStroked ? `Join ${j}`
              : 'Join applies to Technical only — the other pens draw a filled outline, which has no joins'}
            onClick={() => setPrefs({ join:j })}
            style={{
              minWidth:26, height:24, padding:'0 7px', borderRadius:6,
              cursor: isStroked ? 'pointer' : 'not-allowed', opacity: isStroked ? 1 : 0.4,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:10, fontFamily:'var(--font-mono)', whiteSpace:'nowrap',
              background: on ? 'var(--panel-hover)' : 'transparent',
              color:      on ? 'var(--text)'        : 'var(--panel-text2)',
              border:`1px solid ${on ? 'var(--panel-text4)' : 'var(--panel-border)'}`,
            }}>{j}</button>
        )
      }))}
      <p style={{ margin:0, fontSize:9.5, lineHeight:1.45, fontFamily:'var(--font-mono)',
        color:'var(--panel-text4)' }}>
        {selectedStroke
          ? 'Editing the selected stroke — each change is one undo step.'
          : isStroked
            ? 'Cap and join need width above ~3 to read clearly.'
            : 'Mesh pens bake the cap into the outline: round or flat only.'}
      </p>
    </div>
  )
}

function DrawToolbar({ pos, setPos, defaultPos, horizontal, onToggleOrient, onClose, activeTool, setActiveTool,
                       penPrefs, setPenPrefs, strokeColor, setStrokeColor, selectedStroke }) {
  /* Contextual: the sub-toolbar exists only while its tool is active (§7). */
  const showPen  = activeTool === TOOLS.FREEHAND
  /* 21px glyph + 8px padding on every side */
  const CELL = TOOLBAR_ICON + 16
  const btn = (t) => {
    const on = activeTool === t.tool
    return (
      <div key={t.id} style={{ position:'relative', flexShrink:0, display:'flex' }}>
      <button aria-label={t.label} aria-pressed={on} disabled={!!t.broken}
        title={t.broken ? t.label + BROKEN_HINT : t.label}
        onClick={() => setActiveTool(t.tool)}
        style={{
          width:CELL, height:CELL, flexShrink:0, padding:0, borderRadius:9, border:'none',
          cursor: t.broken ? 'not-allowed' : 'pointer', opacity: t.broken ? 0.38 : 1,
          display:'flex', alignItems:'center', justifyContent:'center',
          /* active is a soft hover-tone pill, NOT a solid ink fill */
          background: on ? 'var(--panel-hover)' : 'transparent',
          color:      on ? 'var(--text)'        : 'var(--panel-text2)',
          transition:'background .12s, color .12s',
        }}
        onMouseEnter={e => { if (!on && !t.broken) e.currentTarget.style.background = 'var(--panel-hover)' }}
        onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
        <t.Icon size={TOOLBAR_ICON} strokeWidth={ICON_STROKE} absoluteStrokeWidth/>
      </button>
      {/* Anchored to THIS button's relative wrapper, so it opens beside the
          freehand icon rather than under the toolbar's first cell. */}
      {showPen && t.id === 'freehand' && (
        <PenOptions prefs={penPrefs} setPrefs={setPenPrefs} horizontal={horizontal}
          strokeColor={strokeColor} setStrokeColor={setStrokeColor}
          selectedStroke={selectedStroke}/>
      )}
      </div>
    )
  }
  const rule = (i) => (
    <span key={`r${i}`} style={{
      flexShrink:0, background:'var(--panel-border)',
      ...(horizontal ? { width:1, height:22, margin:'0 3px' } : { height:1, width:22, margin:'3px auto' }),
    }}/>
  )
  const chrome = (label, Icon, onClick) => (
    <button key={label} aria-label={label} title={label} onClick={onClick}
      style={{
        width:CELL, height:CELL, flexShrink:0, padding:0, borderRadius:9, border:'none',
        background:'transparent', color:'var(--panel-text3)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--panel-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <Icon size={18} strokeWidth={ICON_STROKE} absoluteStrokeWidth/>
    </button>
  )
  return (
    <FloatingPanel ariaLabel="Drawing tools" pos={pos} setPos={setPos} horizontal={horizontal}
      defaultPos={defaultPos}>
      <div style={{
        position:'relative',
        display:'flex', flexDirection: horizontal ? 'row' : 'column', alignItems:'center', gap:2,
        padding: horizontal ? '5px 6px' : '0 5px 6px',
      }}>
        {TOOLBAR_TOOLS.map((t, i) => t ? btn(t) : rule(i))}
        {rule('end')}
        {chrome(horizontal ? 'Stack vertically' : 'Lay out horizontally',
          horizontal ? ArrowUpDown : ArrowLeftRight, onToggleOrient)}
        {chrome('Hide drawing tools', X, onClose)}
      </div>
    </FloatingPanel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  VIEW TOGGLE — one global segmented control for the whole panel.            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ViewToggle({ mode, onChange }) {
  const seg = (m, Glyph, label) => {
    const on = mode === m
    return (
      <button key={m} data-viewtoggle aria-label={label} title={label}
        onClick={e => { e.stopPropagation(); onChange(m) }}
        style={{
          width:24, height:22, padding:0, border:'none', borderRadius:5, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          background: on ? '#FFFFFF' : 'transparent',
          color:      on ? 'var(--text)' : 'var(--panel-text4)',
          boxShadow:  on ? '0 1px 2px rgba(11,16,29,0.12)' : 'none',
          transition:'background .12s, color .12s, box-shadow .12s',
        }}>
        <Glyph size={13} strokeWidth={ICON_STROKE} absoluteStrokeWidth/>
      </button>
    )
  }
  return (
    <div style={{ display:'flex', gap:2, padding:2, borderRadius:7,
      background:'var(--panel-hover)', flexShrink:0 }}>
      {seg('list', List, 'List view')}
      {seg('grid', LayoutGrid, 'Grid view')}
    </div>
  )
}

/* Pin affordance — hidden until the row/tile is hovered. */
function PinDot({ id, pinned, onTogglePin, style }) {
  const on = pinned.includes(id)
  return (
    <span data-pin onClick={e => onTogglePin(id, e)} title={on ? 'Unpin' : 'Pin'}
      style={{
        display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
        color: on ? 'var(--pin-accent)' : '#B4B0A4', flexShrink:0,
        opacity: on ? 1 : 0, transition:'opacity .12s', ...style,
      }}>
      <Pin size={12} strokeWidth={ICON_STROKE} absoluteStrokeWidth fill={on ? 'currentColor' : 'none'}/>
    </span>
  )
}
const showPin = (el, v) => { const p = el.querySelector('[data-pin]'); if (p) p.style.opacity = v }

/* ── item row (list mode) ─────────────────────────────────────────────────── */
function ItemRow({ item, color, onPick, pinned, onTogglePin }) {
  const on = pinned.includes(item.id)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:9, width:'100%', height:32,
      padding:'0 8px', borderRadius:7, transition:'background .1s' }}
      onMouseEnter={e => { e.currentTarget.style.background='var(--panel-hover)'; showPin(e.currentTarget, '1') }}
      onMouseLeave={e => { e.currentTarget.style.background='transparent';        showPin(e.currentTarget, on?'1':'0') }}>
      <button onClick={() => onPick(item)} title={item.hint || item.label}
        style={{ display:'flex', alignItems:'center', gap:9, flex:1, minWidth:0, height:'100%',
          padding:0, border:'none', background:'transparent', cursor:'pointer',
          font:'inherit', textAlign:'left', color:'var(--panel-label)' }}>
        <span style={{ width:21, height:21, flexShrink:0, display:'flex',
          alignItems:'center', justifyContent:'center', color }}>
          <ItemIcon item={item} size={21}/>
        </span>
        <span style={{ flex:1, minWidth:0, fontSize:12.5, fontWeight:500, lineHeight:1.35,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
      </button>
      <PinDot id={item.id} pinned={pinned} onTogglePin={onTogglePin}/>
    </div>
  )
}

/* ── item tile (grid mode) — borderless, neutral fill, same coloured icon ────
   Labels stay visible rather than hover-only: hover does not exist on touch.
   minWidth:0 on the tile AND the label is what lets the ellipsis fire — without
   it the grid track is sized by the longest word and the text just overflows. */
function ItemTile({ item, color, onPick, pinned, onTogglePin }) {
  const on   = pinned.includes(item.id)
  const text = SHORT_LABEL[item.id] || item.label
  return (
    <div style={{ position:'relative', minWidth:0 }}
      onMouseEnter={e => { showPin(e.currentTarget, '1') }}
      onMouseLeave={e => { showPin(e.currentTarget, on?'1':'0') }}>
      <button onClick={() => onPick(item)} title={item.hint || item.label}
        style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
          width:'100%', minWidth:0, padding:'13px 5px 10px', borderRadius:9,
          border:'none', background:'var(--tile-bg)', cursor:'pointer', font:'inherit',
          color, transition:'background .1s', overflow:'hidden',
        }}
        onMouseEnter={e => { e.currentTarget.style.background='var(--tile-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background='var(--tile-bg)' }}>
        <ItemIcon item={item} size={21}/>
        <span style={{ fontSize:10, fontWeight:600, color:'var(--panel-label)', lineHeight:1.25,
          textAlign:'center', width:'100%', minWidth:0,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {text}
        </span>
      </button>
      <PinDot id={item.id} pinned={pinned} onTogglePin={onTogglePin}
        style={{ position:'absolute', top:5, right:5, width:14, height:14, borderRadius:4 }}/>
    </div>
  )
}

/* Shared body — inline inside a section, in search results, and in the tray.
   Grid columns come from auto-fill, so the count falls out of whatever width
   the drag handle left behind. No breakpoints to keep in sync. */
function ItemBody({ items, mode, colorOf, onPick, pinned, onTogglePin,
                   minTile = 62, padX = 6, padB = 6, branches = false }) {
  if (mode === 'list') {
    /* Tree geometry, straight lines only — no curves, no rounded elbows.
       The spine sits INDENT-CONNECTOR in from the block edge so the 11px
       connector lands exactly on the row, and it stops at the centre of the
       last row rather than running past it. */
    const spineTop = 2
    const spineH   = items.length ? (items.length - 1) * (ROW_H + ROW_GAP) + ROW_H / 2 : 0
    /* The 15px is measured against the SECTION HEADER, which sits flush at the
       body's left edge with no padX of its own. Adding padX here too would
       indent the rows by padX + INDENT — 21px, not 15. */
    const padL = branches ? INDENT : padX
    return (
      <div style={{ position:'relative', padding:`${spineTop}px ${padX}px ${padB}px ${padL}px` }}>
        {branches && items.length > 0 && (
          <span aria-hidden="true" style={{
            position:'absolute', left: INDENT - CONNECTOR, top: spineTop,
            width:1, height: spineH, background:'var(--panel-branch)',
          }}/>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:ROW_GAP }}>
          {items.map(it => (
            <div key={it.id} style={{ position:'relative' }}>
              {branches && (
                <span aria-hidden="true" style={{
                  position:'absolute', left:-CONNECTOR, top:'50%',
                  width:CONNECTOR, height:1, background:'var(--panel-branch)',
                }}/>
              )}
              <ItemRow item={it} color={colorOf(it)} onPick={onPick}
                pinned={pinned} onTogglePin={onTogglePin}/>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{
      display:'grid', gridTemplateColumns:`repeat(auto-fill, minmax(${minTile}px, 1fr))`,
      gap:6, padding:`2px ${padX}px ${padB}px`,
    }}>
      {items.map(it => (
        <ItemTile key={it.id} item={it} color={colorOf(it)} onPick={onPick}
          pinned={pinned} onTogglePin={onTogglePin}/>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PINNED TRAY — floats over the canvas, dragged by the same wrapper as the    */
/*  tool bar so there is one drag implementation, not two.                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PinnedTray({ items, mode, colorOf, onPick, pinned, onTogglePin, onClose, pos, setPos, defaultPos }) {
  return (
    <FloatingPanel ariaLabel="Pinned objects" pos={pos} setPos={setPos} defaultPos={defaultPos}>
      <div style={{ width:212, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, padding:'2px 10px 6px' }}>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.09em', color:'var(--panel-text3)' }}>PINNED</span>
          <span style={{ fontSize:10, fontWeight:600, color:'var(--panel-text4)' }}>{items.length}</span>
          <span style={{ flex:1, minWidth:12 }}/>
          <button aria-label="Close pinned" title="Close pinned" onClick={onClose}
            style={{ width:18, height:18, border:'none', background:'transparent', borderRadius:4,
              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--panel-text4)' }}>
            <X size={12} strokeWidth={ICON_STROKE} absoluteStrokeWidth/>
          </button>
        </div>
        {items.length ? (
          <ItemBody items={items} mode={mode} colorOf={colorOf} onPick={onPick}
            pinned={pinned} onTogglePin={onTogglePin} minTile={58} padX={10} padB={10}/>
        ) : (
          <p style={{ margin:0, padding:'0 10px 12px', fontSize:11.5, lineHeight:1.5,
            color:'var(--panel-text4)' }}>
            Pin an object to keep it here.
          </p>
        )}
      </div>
    </FloatingPanel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function FloatingToolbar() {
  const {
    activeTool, setActiveTool,
    addObject, objects, zoom, panX, panY, activeLayerId, gridSize,
    placeFpObject, strokeColor, setStrokeColor, selectedIds, commitObjectUpdate,
  } = useCanvasStore()

  /* Pen defaults are presentation state — localStorage, never the canvas
     store. CanvasArea reads the same key when it commits a stroke. */
  const [penPrefs, setPenPrefsRaw] = useState(() => loadPenPrefs())

  /* A selected freehand stroke also takes the change, so cap/join and the rest
     are visible immediately instead of only affecting the NEXT stroke.
     commitObjectUpdate pushes history once, so each toggle is one undo step. */
  const selectedStroke = useMemo(() => {
    if (selectedIds?.length !== 1) return null
    const o = objects.find(o => o.id === selectedIds[0])
    return o?.type === 'freehand' ? o : null
  }, [selectedIds, objects])

  const setPenPrefs = useCallback(patch => {
    setPenPrefsRaw(prev => { const next = { ...prev, ...patch }; savePenPrefs(next); return next })
    if (selectedStroke) {
      const upd = {}
      if ('cap'   in patch) upd.strokeLinecap  = patch.cap
      if ('join'  in patch) upd.strokeLinejoin = patch.join
      if ('width' in patch) upd.strokeWidth    = patch.width
      if ('pen'   in patch) {
        upd.pen = patch.pen
        upd.opacity = (PEN_TYPES[patch.pen] || PEN_TYPES.pencil).alpha
        if ('width' in patch) upd.strokeWidth = patch.width
      }
      if (Object.keys(upd).length) commitObjectUpdate(selectedStroke.id, upd)
    }
  }, [selectedStroke, commitObjectUpdate])

  /* ── panel UI state (presentation only, persisted locally) ──────────────── */
  const prefs0 = useRef(loadPrefs()).current
  /* First run opens on the icon rail. The library is a place you go to fetch
     something, not a thing you read — starting it expanded spent 240px of the
     canvas on a list nobody had asked for yet. A returning visitor still gets
     whatever they last left it at, since prefs0 wins over the default. */
  const [collapsed, setCollapsed] = useState(prefs0.collapsed ?? true)
  const [viewMode,  setViewMode]  = useState(prefs0.viewMode  ?? 'list')
  const [pinned,    setPinned]    = useState(prefs0.pinned    ?? [])   // fixed order, never re-sorted
  const [usage,     setUsage]     = useState(prefs0.usage     ?? {})
  const [query,     setQuery]     = useState('')

  /* ONE stored width. Collapsing does not overwrite it, so expanding restores
     the last dragged width rather than snapping back to a constant. */
  const [panelW,   setPanelW]   = useState(clampW(prefs0.panelW ?? PANEL_START))
  const [resizing, setResizing] = useState(false)

  const [toolbarOpen,   setToolbarOpen]   = useState(prefs0.toolbarOpen   ?? false)
  const [toolbarHoriz,  setToolbarHoriz]  = useState(prefs0.toolbarHoriz  ?? false)
  const [toolbarPos,    setToolbarPos]    = useState(prefs0.toolbarPos    ?? null)
  const [trayOpen,      setTrayOpen]      = useState(false)
  const [trayPos,       setTrayPos]       = useState(prefs0.trayPos       ?? null)

  useEffect(() => {
    savePrefs({ collapsed, viewMode, pinned, usage, panelW,
                toolbarOpen, toolbarHoriz, toolbarPos, trayPos })
  }, [collapsed, viewMode, pinned, usage, panelW,
      toolbarOpen, toolbarHoriz, toolbarPos, trayPos])

  /* every placeable warehouse item, flattened once, for search */
  const allItems = useMemo(() => WAREHOUSE_CATEGORIES.flatMap(c =>
    c.objects.map(o => ({ ...o, color:c.color, catId:c.id, catLabel:c.label }))), [])

  const bumpUsage = useCallback(id => {
    if (!id) return
    setUsage(u => ({ ...u, [id]: (u[id] || 0) + 1 }))
  }, [])

  const togglePin = useCallback((id, e) => {
    e.stopPropagation()
    setPinned(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])  // append keeps order stable
  }, [])

  const q = query.trim().toLowerCase()
  const toolbarRef = useRef(null)
  const searchRef  = useRef(null)
  const [focusSearch, setFocusSearch] = useState(false)
  /* the rail's search icon expands the panel, then focuses the real input */
  useEffect(() => {
    if (!focusSearch || collapsed) return
    const t = setTimeout(() => { searchRef.current?.focus(); setFocusSearch(false) }, 60)
    return () => clearTimeout(t)
  }, [focusSearch, collapsed])

  /* place object — unchanged logic */
  const placeObject = useCallback((catItem) => {
    const item    = catItem
    const variant = item.variants?.[0] || { w:item.w||10, h:item.h||10 }
    const { w: cw, h: ch } = getCanvasContainerSize()
    const wx = (cw/2 - panX) / zoom
    const wy = (ch/2 - panY) / zoom
    const uprightInches = variant.uprightWidth ?? item.meta?.uprightWidth ?? 3
    const beamIn  = item.meta?.beamLengths?.[0] || 96
    const bays    = variant.bays || 1
    const beams   = Array(bays).fill(beamIn)
    const GS      = gridSize
    const RACK_TYPES     = new Set(['rack_selective','rack_row','rack_double_row','rack_pushback','rack_pallet_flow','rack_shelving'])
    const BAY_RACK_TYPES = new Set(['rack_row','rack_double_row','rack_cantilever','rack_pushback','rack_pallet_flow','rack_drive_through'])
    let w, h
    if (item.type === 'column_grid') {
      const fpFound = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, wx, wy))
      if (fpFound) { const wt=(fpFound.wallThicknessFt||0.25)*GS; w=fpFound.width-2*wt; h=fpFound.height-2*wt }
      else { w=200*GS; h=160*GS }
    } else if (item.type === 'rack_cantilever') {
      const armIn=variant.armLengthIn||36, dual=variant.doubleSided??true, tCount=variant.towers||2, spineIn=item.meta?.spineDepthIn||4
      w=((tCount-1)*48/12)*GS; h=((dual?armIn*2+spineIn:armIn+spineIn)/12)*GS
    } else if (['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(item.type)) {
      const upPx=(item.meta?.uprightWidth||4)/12*GS, ledgePx=2/12*GS, clearPx=1/12*GS
      const palletW=(item.meta?.palletWIn||40)/12*GS, palletD=(item.meta?.palletDIn||48)/12*GS
      const lanes=variant.lanes||2, deep=variant.palletDeep||5
      w=(lanes+1)*upPx+lanes*(ledgePx*2+clearPx*2+palletW); h=deep*palletD
    } else if (RACK_TYPES.has(item.type)) {
      w=((uprightInches*(bays+1)+beams.reduce((s,b)=>s+b,0))/12)*GS; h=variant.h*GS
    } else {
      w=(variant.w||item.w||10)*GS; h=(variant.h||item.h||10)*GS
    }
    const parentFp = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, wx, wy))
    const x  = (item.type==='column_grid'&&parentFp) ? parentFp.x+(parentFp.wallThicknessFt||0.25)*GS : wx-w/2
    const y2 = (item.type==='column_grid'&&parentFp) ? parentFp.y+(parentFp.wallThicknessFt||0.25)*GS : wy-h/2
    addObject({
      type:item.type, x, y:y2, width:w, height:h,
      fill:(item.color||'#22c55e')+'22', stroke:item.color||'#22c55e',
      strokeWidth:1.5, label:item.label, snapType:item.snapType,
      aisleMin:item.aisleMin||variant.aisleMin, clearance:item.clearance,
      uprightWidth:uprightInches,
      ...(BAY_RACK_TYPES.has(item.type)?{beams,activeBayIdx:null,palletWIn:48,palletDIn:40,palletDeep:variant.palletDeep??null}:{}),
      ...(['rack_drive_in','rack_drive_through','rack_pushback','rack_pallet_flow'].includes(item.type)?{
        lanes:variant.lanes||2, palletDeep:variant.palletDeep||(item.type==='rack_pushback'?2:5),
        palletWIn:item.meta?.palletWIn||40, palletDIn:item.meta?.palletDIn||48,
        uprightWidth:item.meta?.uprightWidth||(item.type==='rack_pushback'?3:4),
      }:{}),
      ...(item.type==='column_grid'?(()=>{
        const colPx=(12/12)*GS
        const fpL=[...objects].reverse().find(o=>FP_TYPES_SET.has(o.type)&&objectContains(o,wx,wy))
        if(fpL){const wt=(fpL.wallThicknessFt||0.25)*GS;const iW=fpL.width-2*wt,iH=fpL.height-2*wt
          return{spacingX:Array(5).fill((iW-colPx)/5),spacingY:Array(4).fill((iH-colPx)/4),columnW:colPx,columnH:colPx,colSizeIn:12,showGrid:true,wallAttached:true}}
        const spPx=40*GS; return{spacingX:Array(5).fill(spPx),spacingY:Array(4).fill(spPx),columnW:colPx,columnH:colPx,colSizeIn:12,showGrid:true,wallAttached:false}
      })():{}),
      ...(item.type==='rack_cantilever'?(()=>{
        const armIn=variant.armLengthIn||36,dual=variant.doubleSided??true,tCount=variant.towers||2
        return{towers:Array(tCount).fill(armIn),doubleSided:dual,towerWidthIn:item.meta?.towerWidthIn||10,
          spineDepthIn:item.meta?.spineDepthIn||4,armThicknessIn:item.meta?.armThicknessIn||3,activeTowerIdx:null}
      })():{}),
      ...(item.type==='rack_double_row'?{flueSpaceIn:item.meta?.flueSpace||6}:{}),
      layerId:activeLayerId,
      /* column_grid is parented like everything else: the columns are the
         building's own structure, so they travel with it and go with it when
         it is deleted. CanvasArea re-parents a grid on its first move anyway,
         so excluding it here only made parentage depend on being dragged. */
      ...(parentFp?{parentId:parentFp.id}:{}),
    })
  }, [addObject, objects, zoom, panX, panY, activeLayerId, gridSize])

  const getCategoryItems = catId => {
    const cat = WAREHOUSE_CATEGORIES.find(c => c.id === catId)
    if (!cat) return []
    return cat.objects.map(obj => ({ ...obj, color:cat.color }))
  }

  /* ── geometry ───────────────────────────────────────────────────────────── */
  const W        = collapsed ? RAIL_W : panelW
  const MOVE     = 'cubic-bezier(.4,0,.2,1)'
  /* Dragging the edge must track the pointer exactly — a transition here makes
     every absolutely-positioned control lag a third of a second behind it. */
  const T_MOVE   = resizing ? 'none' : `top .32s ${MOVE}, left .32s ${MOVE}`
  const FADE     = 'opacity .18s ease .1s'
  const BTN      = 32     // collapsed-rail cells, sized to hold a 22px glyph
  const GHOST    = 30     // circular pin / tools buttons in the top row
  const LOGO_Y   = 9
  /* Collapsed the trio stacks down the rail; expanded it sits in the top row.
     Only `top` changes for the block below, which is what closes the gap. */
  const BODY_TOP = collapsed ? 126 : 46
  const showWordmark = !collapsed && panelW >= LABEL_MIN_W

  /* Category identity colours — literal by design, never tokens (CLAUDE.md).
     Headers run a shade deeper than their own children, so the hierarchy reads
     as "the header is the deepest thing in its group". */
  const CAT_COLOR = {
    storage:'#165c45', mhe:'#f59e0b', structural:'#6366f1', safety:'#ef4444',
    utilities:'#3b82f6', shapes:'#8A8578', fp:'#8A8578',
  }
  const CAT_HEADER = {
    storage:'#0E4433', mhe:'#B87309', structural:'#4547C4', safety:'#C42B2B',
    utilities:'#4547C4', shapes:'#6B675F', fp:'#6B675F',
  }
  /* Sections own their items directly — no intermediate category row, so
     "Racking > Racking > items" collapses to "Racking > items". */
  const SECTIONS = [
    { id:'floorplans', label:'Floor Plans', icon:'fp',         cats:['fp'] },
    { id:'racking',    label:'Racking',     icon:'storage',    cats:['storage'] },
    { id:'ops',        label:'Ops',         icon:'mhe',        cats:['mhe','utilities'] },
    { id:'structural', label:'Structural',  icon:'structural', cats:['structural'] },
    { id:'safety',     label:'Safety',      icon:'safety',     cats:['safety'] },
    { id:'blocks',     label:'Blocks',      icon:'shapes',     cats:['shapes'] },
  ]
  const catItems = id =>
      id === 'shapes' ? BLOCK_ITEMS.map(o => ({ ...o, catId:'shapes' }))
    : id === 'fp'     ? FP_ITEMS.map(o => ({ ...o, catId:'fp' }))
    : getCategoryItems(id).map(o => ({ ...o, catId:id }))
  const secItems = sec => sec.cats.flatMap(catItems)
  const colorOf  = item => CAT_COLOR[item.catId] || 'var(--panel-text2)'

  const selectItem  = item => { bumpUsage(item.id); placeObject(item) }
  const selectShape = item => { setActiveTool(item.tool) }
  const selectFp    = item => { placeFpObject({ type:item.type, widthFt:item.wFt, heightFt:item.hFt }) }
  const pickItem    = item =>
      item.catId === 'shapes' ? selectShape(item)
    : item.catId === 'fp'     ? selectFp(item)
    : selectItem(item)

  /* Search and the pinned tray both need to resolve an id back to an item, and
     shapes and floor plans are pinnable too — so look across all three lists. */
  const everyItem = useMemo(() => [
    ...allItems,
    ...BLOCK_ITEMS.map(o => ({ ...o, catId:'shapes' })),
    ...FP_ITEMS.map(o => ({ ...o, catId:'fp' })),
  ], [allItems])
  const results = useMemo(() => !q ? []
    : everyItem.filter(i => i.label.toLowerCase().includes(q)), [q, everyItem])
  const pinnedItems = useMemo(() =>
    pinned.map(id => everyItem.find(i => i.id === id)).filter(Boolean), [pinned, everyItem])

  /* No section is open until asked for. Expanding into a pre-opened Racking
     list put ~10 rows on screen before the user had chosen a category. */
  const [openSections, setOpenSections] = useState(() => new Set())
  const toggleSection = id =>
    setOpenSections(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  /* ── drag-to-resize ─────────────────────────────────────────────────────── */
  const resizeRef = useRef(null)
  const schedule  = useRafWriter()
  const onResizeDown = e => {
    if (e.button !== 0 || collapsed) return
    resizeRef.current = { x0:e.clientX, w0:panelW }
    e.currentTarget.setPointerCapture(e.pointerId)
    setResizing(true)
    e.preventDefault()
  }
  const onResizeMove = e => {
    const r = resizeRef.current
    if (!r) return
    const next = clampW(r.w0 + (e.clientX - r.x0))
    schedule(() => setPanelW(next))
  }
  const onResizeUp = e => {
    if (!resizeRef.current) return
    resizeRef.current = null
    setResizing(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already gone */ }
  }

  /* ── the animating controls ─────────────────────────────────────────────── */
  const ghostBtn = ({ key, label, top, left, color, active, onClick, children }) => (
    <button key={key} aria-label={label} title={label} aria-pressed={!!active} onClick={onClick}
      style={{
        position:'absolute', top, left, width:GHOST, height:GHOST, transition:T_MOVE, zIndex:6,
        borderRadius:'50%', border:'none', color, cursor:'pointer', padding:0,
        background: active ? 'var(--panel-hover)' : 'transparent',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background='var(--panel-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'var(--panel-hover)' : 'transparent' }}>
      {children}
    </button>
  )

  return (
    <nav ref={toolbarRef} aria-label="Object library"
      style={{
        width:W, flexShrink:0, position:'relative', zIndex:30, minHeight:0,
        background:'var(--panel-bg)', borderRight:'1px solid var(--panel-border)',
        transition: resizing ? 'none' : `width .32s ${MOVE}`,
      }}>

      {/* logo — anchored, never moves */}
      <span style={{
        position:'absolute', top:LOGO_Y, left:collapsed ? 13 : 9, width:24, height:24,
        borderRadius:7, background:'#0B101D', color:'#FFFFFF', zIndex:6,
        transition:T_MOVE,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:12, fontWeight:700, lineHeight:1,
      }}>T</span>

      <span style={{
        position:'absolute', top:LOGO_Y + 4, left:40, zIndex:6,
        fontSize:14, fontWeight:500, color:'var(--panel-label)', whiteSpace:'nowrap',
        opacity: showWordmark ? 1 : 0, transition:FADE, pointerEvents:'none',
      }}>Library</span>

      {ghostBtn({ key:'pin', label:'Pinned tray',
        top:  collapsed ? 50 : LOGO_Y - 3,
        left: collapsed ? 10 : panelW - 82,
        color:'var(--pin-accent)', active:trayOpen, onClick:() => setTrayOpen(o => !o),
        children:<Pin size={20} strokeWidth={2} absoluteStrokeWidth fill={trayOpen?'currentColor':'none'}/>,
      })}
      {/* Stable name, state carried by aria-pressed — the toolbar's own close
          button is the one called "Hide drawing tools", and two controls must
          not share an accessible name. */}
      {ghostBtn({ key:'tools', label:'Drawing tools',
        top:  collapsed ? 86 : LOGO_Y - 3,
        left: collapsed ? 10 : panelW - 48,
        color:'var(--panel-text2)', active:toolbarOpen, onClick:() => setToolbarOpen(o => !o),
        children:<PencilRuler size={20} strokeWidth={2} absoluteStrokeWidth/>,
      })}

      {/* chevron — circular, straddles the right edge in both states */}
      <button aria-label={collapsed ? 'Expand library' : 'Collapse library'}
        title={collapsed ? 'Expand library' : 'Collapse library'}
        onClick={() => setCollapsed(c => !c)}
        style={{
          position:'absolute', top:LOGO_Y - 2, left:W - 14, width:28, height:28,
          transition:T_MOVE, zIndex:9, borderRadius:'50%', padding:0, cursor:'pointer',
          background:'var(--panel-bg)', color:'var(--panel-text3)',
          border:'1px solid var(--panel-border)', boxShadow:'0 1px 4px rgba(11,16,29,0.10)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
        {collapsed
          ? <ChevronsRight size={20} strokeWidth={2} absoluteStrokeWidth/>
          : <ChevronsLeft  size={20} strokeWidth={2} absoluteStrokeWidth/>}
      </button>

      {/* ── resize handle — 3px pill you can see, 24px strip you can hit ───── */}
      {!collapsed && (
        <div data-resize role="separator" aria-orientation="vertical"
          aria-label="Resize library" title="Drag to resize"
          onPointerDown={onResizeDown} onPointerMove={onResizeMove}
          onPointerUp={onResizeUp} onPointerCancel={onResizeUp}
          onDoubleClick={() => setPanelW(PANEL_START)}
          onMouseEnter={e => { e.currentTarget.firstChild.style.opacity = 1 }}
          onMouseLeave={e => { if (!resizing) e.currentTarget.firstChild.style.opacity = 0 }}
          style={{
            position:'absolute', top:40, bottom:0, left:W - 12, width:24, zIndex:8,
            cursor:'col-resize', touchAction:'none',
            transition:T_MOVE,
          }}>
          <span style={{
            position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            width:3, height:40, borderRadius:2, background:'var(--panel-text4)',
            opacity: resizing ? 1 : 0, transition:'opacity .12s', pointerEvents:'none',
          }}/>
        </div>
      )}

      {/* ── body — `top` slides up to close the vacated pin/tool gap ───────── */}
      <div style={{
        position:'absolute', left:0, right:0, top:BODY_TOP, bottom:FOOTER_H,
        transition:T_MOVE, overflowY:'auto', overflowX:'hidden',
        padding: collapsed ? '0 0 6px' : '0 6px 6px',
      }}>
        {collapsed ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:11 }}>
            <button aria-label="Search library" title="Search library"
              onClick={() => { setCollapsed(false); setFocusSearch(true) }}
              style={{ width:BTN, height:BTN, border:'none', borderRadius:7, background:'transparent',
                color:'var(--panel-text2)', cursor:'pointer', display:'flex',
                alignItems:'center', justifyContent:'center' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--panel-hover)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <Search size={HEADER_ICON} strokeWidth={ICON_STROKE} absoluteStrokeWidth/>
            </button>
            {SECTIONS.map(sec => (
              <button key={sec.id} aria-label={sec.label} title={sec.label}
                onClick={() => { setCollapsed(false); setOpenSections(s => new Set([...s, sec.id])) }}
                style={{ width:BTN, height:BTN, border:'none', borderRadius:7, cursor:'pointer',
                  background:'transparent', color:CAT_HEADER[sec.icon],
                  display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--panel-hover)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <CatIcon id={sec.icon} size={HEADER_ICON}/>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ opacity: collapsed ? 0 : 1, transition:FADE }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
              <div style={{ position:'relative', flex:1, display:'flex', alignItems:'center', minWidth:0 }}>
                <Search size={13} strokeWidth={ICON_STROKE} absoluteStrokeWidth
                  style={{ position:'absolute', left:8, color:'var(--panel-text4)', pointerEvents:'none' }}/>
                <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"
                  style={{ width:'100%', height:28, boxSizing:'border-box', borderRadius:8,
                    border:'0.5px solid var(--panel-border)', background:'#FFFFFF',
                    padding:'0 8px 0 26px', fontSize:12, color:'var(--text)',
                    outline:'none', font:'inherit', fontWeight:500 }}/>
              </div>
              <ViewToggle mode={viewMode} onChange={setViewMode}/>
            </div>

            {q ? (
              results.length
                ? <ItemBody items={results} mode={viewMode}
                    colorOf={colorOf} onPick={pickItem} pinned={pinned} onTogglePin={togglePin}/>
                : <p style={{ margin:0, padding:'14px 6px', fontSize:11.5, color:'var(--panel-text4)', textAlign:'center' }}>
                    No objects match “{query}”.
                  </p>
            ) : SECTIONS.map(sec => {
              const open = openSections.has(sec.id)
              return (
                <div key={sec.id}>
                  <button aria-label={sec.label + ' section'} aria-expanded={open}
                    onClick={() => toggleSection(sec.id)}
                    style={{
                      display:'flex', alignItems:'center', gap:9, width:'100%', height:36,
                      padding:'0 8px', marginTop:6, border:'none', background:'transparent',
                      cursor:'pointer', font:'inherit', textAlign:'left', borderRadius:7,
                      transition:'background .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--panel-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    {/* same glyph the collapsed rail shows, so the two states stay in sync */}
                    <span style={{ display:'flex', flexShrink:0, color:CAT_HEADER[sec.icon] }}>
                      <CatIcon id={sec.icon} size={HEADER_ICON}/>
                    </span>
                    {/* Tracked caps stay (CLAUDE.md), but the ink drops from the
                        near-black --panel-label to the muted grey: six headers
                        all shouting at full contrast is what made the column
                        read as dense. The category glyph carries the identity. */}
                    <span style={{ flex:1, minWidth:0, fontSize:11, fontWeight:600, letterSpacing:'0.10em',
                      textTransform:'uppercase', color:'var(--panel-muted)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sec.label}</span>
                    <ChevronRight size={12} strokeWidth={ICON_STROKE} absoluteStrokeWidth
                      style={{ color:'var(--panel-text4)', flexShrink:0,
                        transform:`rotate(${open?90:0}deg)`, transition:'transform 150ms ease' }}/>
                  </button>
                  {open && (
                    <ItemBody items={secItems(sec)} mode={viewMode} colorOf={colorOf}
                      onPick={pickItem} pinned={pinned} onTogglePin={togglePin} branches/>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer — Undo/Redo moved out; the top bar and the drawing toolbar
          already own history, and three copies of it read as clutter. */}
      <div style={{ position:'absolute', left:0, right:0, bottom:0,
        borderTop:'0.5px solid var(--panel-border)', padding: collapsed ? '6px 0' : '6px 4px',
        display:'flex', flexDirection:'column', alignItems: collapsed ? 'center' : 'stretch', gap:2 }}>
        {FOOTER_ITEMS.map(({ id, label, Icon }) => (
          <button key={id} aria-label={label} title={label}
            style={{
              display:'flex', alignItems:'center', gap:9, border:'none', background:'transparent',
              cursor:'pointer', font:'inherit', color:'var(--panel-muted)', borderRadius:7,
              transition:'background .1s',
              ...(collapsed
                ? { width:BTN, height:BTN, justifyContent:'center', padding:0 }
                : { width:'100%', height:30, padding:'0 8px', textAlign:'left' }),
            }}
            onMouseEnter={e => e.currentTarget.style.background='var(--panel-hover)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <Icon size={17} strokeWidth={ICON_STROKE} absoluteStrokeWidth style={{ flexShrink:0 }}/>
            {!collapsed && (
              <span style={{ flex:1, minWidth:0, fontSize:12, fontWeight:500,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── the two floating elements, both driven by FloatingPanel ────────── */}
      {trayOpen && (
        <PinnedTray items={pinnedItems} mode={viewMode} colorOf={colorOf} onPick={pickItem}
          pinned={pinned} onTogglePin={togglePin} onClose={() => setTrayOpen(false)}
          pos={trayPos} setPos={setTrayPos} defaultPos={{ x:W + 96, y:96 }}/>
      )}
      {toolbarOpen && (
        <DrawToolbar pos={toolbarPos} setPos={setToolbarPos} defaultPos={{ x:W + 24, y:130 }}
          horizontal={toolbarHoriz} onToggleOrient={() => setToolbarHoriz(h => !h)}
          onClose={() => setToolbarOpen(false)}
          activeTool={activeTool} setActiveTool={setActiveTool}
          penPrefs={penPrefs} setPenPrefs={setPenPrefs} selectedStroke={selectedStroke}
          strokeColor={strokeColor} setStrokeColor={setStrokeColor}/>
      )}
    </nav>
  )
}
