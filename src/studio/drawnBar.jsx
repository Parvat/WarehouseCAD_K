// drawnBar.jsx — the selection bar for the drawing objects (d1-bar; design/selbar.png and design/fill.png, 1:1). Icons
// only — every choice shown as a picture of its result, never a word:
//   shapes (rectangle, circle, polyline)  Name | stroke colour · width ▾ (1 2 3) · solid · dashed | fill: none · tinted ·
//                                          hatched · fill colour | lock · duplicate · delete
//   line                                   Line | stroke colour · width ▾ · solid · dashed | length · angle | lock ·
//                                          duplicate · delete
//   text                                   Text | size ▾ · B · I · colour | left · centre · right · rotate 90 | lock ·
//                                          duplicate · delete
// Every change is ONE undo (drawTool.js styleDrawn); the card keeps all of these and more. Lock, Duplicate, Delete and
// Rotate are §9's icons (iconData.js); the strokes, fills and alignments are drawn pictures of what they make, as the
// mockup draws them — the icon set has none.
import { useCallback, useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { toggleLock, isLockedIn } from '../utils/layers'
import { styleDrawn, alignTexts, rotateTexts, angleShown, setDrawnLength, setDrawnAngle, feetOf } from '../utils/drawTool'
import { drawnGeom, hasEnds, endsOf, hasCorners, roundOn, blockSize, BLOCK_SIZES, drawnLength, canDim } from '../render/drawnShapes'
import { ftIn } from '../utils/bom'
import { B, MONO, Sep, IconBtn } from './barParts'
import { Swatch, onDark } from './Swatch'
import { Popover } from './Popover'
import { SizeInput } from './textSizeCard'
import { duplicateSelection, deleteSelection } from './selectionActions'
import { MoreMenu } from './SelectionBar'   // (stacking) ⋯ More: Send to back, Bring to front …

const store = useCanvasStore
const NAMES = { line: 'Line', rect: 'Rectangle', circle: 'Circle', polyline: 'Polyline', polygon: 'Polyline', text: 'Text', elbow: 'Elbow arrow', block_arrow: 'Block arrow' }
/** (d2-arrows) a line with an arrowhead is an Arrow */
const nameOf = (o) => (o.type === 'line' && endsOf(o) !== 'none' ? 'Arrow' : NAMES[o.type] || 'Shape')
const INK = '#E8EAE6'
// (d1-polish) 1 2 3 4 6 8 px, shown as line pictures — the bar's and the card's
export const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8]

/** A picture button (32×32, radius 8): pressed = the active fill (green), as the mockup's. */
function PicBtn({ label, title, on = false, onClick, locked = false, children, btnRef, haspopup, expanded }) {
  return (
    <button ref={btnRef} type="button" aria-label={label} title={locked ? 'Locked' : (title || label)} aria-pressed={haspopup ? undefined : on} aria-haspopup={haspopup} aria-expanded={expanded}
      disabled={locked} onClick={onClick} data-pic={label}
      style={{ width: 32, height: 32, border: 0, borderRadius: 8, padding: 0, background: on ? B.active : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', ...(locked ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>
      {children}
    </button>
  )
}
const svg = (children, size = 18) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>{children}</svg>

/* the pictures (selbar.png, fill.png) */
export const PicSolid = ({ c = INK }) => svg(<line x1="3" y1="9" x2="15" y2="9" stroke={c} strokeWidth="2" strokeLinecap="round" />)
export const PicDashed = ({ c = INK }) => svg(<g fill={c}><circle cx="4" cy="9" r="1.3" /><circle cx="9" cy="9" r="1.3" /><circle cx="14" cy="9" r="1.3" /></g>)
export const PicWidths = ({ c = INK }) => svg(<g stroke={c} strokeLinecap="round"><line x1="3" y1="4.5" x2="15" y2="4.5" strokeWidth="1" /><line x1="3" y1="9" x2="15" y2="9" strokeWidth="2" /><line x1="3" y1="13.5" x2="15" y2="13.5" strokeWidth="3" /></g>)
/** None — an empty square with a red slash. */
export const PicNone = () => svg(<g><rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill="none" stroke={INK} strokeWidth="1.2" /><line x1="4.5" y1="13.5" x2="13.5" y2="4.5" stroke="#E5484D" strokeWidth="1.4" strokeLinecap="round" /></g>)
/** Tinted — a square filled with the fill colour. */
export const PicTint = ({ c }) => svg(<rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill={c} stroke={INK} strokeWidth="1.2" />)
/** Hatched — a square of 45° lines in the fill colour. */
export const PicHatch = ({ c }) => svg(
  <g>
    <defs><clipPath id="pic-hatch-clip"><rect x="3.5" y="3.5" width="11" height="11" rx="1.5" /></clipPath></defs>
    <g clipPath="url(#pic-hatch-clip)" stroke={c} strokeWidth="1.2">{[-6, -2, 2, 6, 10, 14].map(d => <line key={d} x1={3 + d} y1="15" x2={15 + d} y2="3" />)}</g>
    <rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill="none" stroke={INK} strokeWidth="1.2" />
  </g>)
const PicAlign = ({ a }) => {
  const rows = [[12, 0], [8, 1], [12, 0], [8, 1]]
  return svg(<g stroke={INK} strokeWidth="1.4" strokeLinecap="round">{rows.map(([w], i) => {
    const y = 4.5 + i * 3, x0 = a === 'left' ? 3 : a === 'right' ? 15 - w : 9 - w / 2
    return <line key={i} x1={x0} y1={y} x2={x0 + w} y2={y} />
  })}</g>)
}

/** Stroke width ▾ — 1 2 3 4 6 8 px as line pictures, a popover attached to its button (the bar's and the card's). */
export function WidthPick({ value, onPick, locked }) {
  const [el, setEl] = useState(null), [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <PicBtn btnRef={setEl} label="Stroke width" title={'Stroke width · ' + value + ' px'} haspopup="listbox" expanded={open} on={open} locked={locked} onClick={() => setOpen(o => !o)}><PicWidths /></PicBtn>
      {open && el && (
        <Popover anchor={el} onClose={close} role="listbox" label="Stroke widths"
          style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 2, background: B.island, border: `1px solid ${B.line}`, borderRadius: 10, boxShadow: '0 10px 28px rgba(15,18,16,.28)' }}>
          {STROKE_WIDTHS.map(w => (
            <button key={w} type="button" role="option" aria-selected={value === w} aria-label={w + ' px'} title={w + ' px'} onClick={() => { onPick(w); close() }}
              style={{ width: 56, height: 28, border: 0, borderRadius: 6, padding: '0 8px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: value === w ? B.active : 'transparent' }}>
              <span aria-hidden="true" style={{ display: 'block', width: '100%', height: w, borderRadius: w, background: value === w ? B.accent : INK }} />
            </button>
          ))}
        </Popover>
      )}
    </>
  )
}

/* (d2-arrows) the end styles (four pictures: none, end, start, both) and the corners (square, round) */
const PicEnds = ({ e, c = INK }) => svg(
  <g stroke={c} fill={c} strokeLinecap="round">
    <line x1={e === 'start' || e === 'both' ? 6 : 3} y1="9" x2={e === 'end' || e === 'both' ? 12 : 15} y2="9" strokeWidth="1.6" />
    {(e === 'end' || e === 'both') && <path d="M16 9 L11 6 L11 12 Z" stroke="none" />}
    {(e === 'start' || e === 'both') && <path d="M2 9 L7 6 L7 12 Z" stroke="none" />}
  </g>)
const PicCorner = ({ round }) => svg(<path d={round ? 'M4 15 V9 Q4 4 9 4 H15' : 'M4 15 V4 H15'} fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap={round ? 'round' : 'butt'} strokeLinejoin={round ? 'round' : 'miter'} />)
export const END_LABELS = { none: 'No arrowheads', end: 'Arrowhead at the end', start: 'Arrowhead at the start', both: 'Arrowheads at both ends' }
/** End style ▾ — a popover of the four pictures, attached to its button. */
function EndsPick({ objs, ids, locked }) {
  const [el, setEl] = useState(null), [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const cur = endsOf(objs[0])
  return (
    <>
      <PicBtn btnRef={setEl} label="End style" title={'End style · ' + END_LABELS[cur]} haspopup="listbox" expanded={open} on={open} locked={locked} onClick={() => setOpen(o => !o)}><PicEnds e={cur === 'none' ? 'none' : cur} /></PicBtn>
      {open && el && (
        <Popover anchor={el} onClose={close} role="listbox" label="End styles"
          style={{ padding: 4, display: 'flex', gap: 2, background: B.island, border: `1px solid ${B.line}`, borderRadius: 10, boxShadow: '0 10px 28px rgba(15,18,16,.28)' }}>
          {['none', 'end', 'start', 'both'].map(e => (
            <button key={e} type="button" role="option" aria-selected={cur === e} aria-label={END_LABELS[e]} title={END_LABELS[e]} data-ends={e} onClick={() => { styleDrawn(store, ids, { ends: e }); close() }}
              style={{ width: 32, height: 32, border: 0, borderRadius: 8, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: cur === e ? B.active : 'transparent' }}>
              <PicEnds e={e} c={cur === e ? B.accent : INK} />
            </button>
          ))}
        </Popover>
      )}
    </>
  )
}
/** Square · Round — corners (a rectangle, a polyline, an elbow); a line's ends. */
function CornersGroup({ objs, ids, locked }) {
  const round = roundOn(objs[0]), lineOnly = objs.every(o => o.type === 'line')
  return (
    <>
      <PicBtn label="Square" title={lineOnly ? 'Square — flat line ends' : 'Square corners'} on={!round} locked={locked} onClick={() => styleDrawn(store, ids, { corners: 'square' })}><PicCorner round={false} /></PicBtn>
      <PicBtn label="Round" title={lineOnly ? 'Round — round line ends' : 'Round corners (radius in the card)'} on={round} locked={locked} onClick={() => styleDrawn(store, ids, { corners: 'round' })}><PicCorner round /></PicBtn>
    </>
  )
}
/** A block arrow: its fill colour and its size (d1-polish: a plain number, like a text size — its body width in inches —
 *  from a dropdown of 6 8 12 18 24 36 48, any number typed). */
function BlockGroup({ objs, ids, locked, gs }) {
  const o = objs[0]
  return (
    <>
      <Swatch round="dot" label="Fill colour" value={o.fill || '#E07B22'} locked={locked} onPick={(c) => { if (c) styleDrawn(store, ids, { fill: c }) }} />
      <span style={{ display: 'inline-flex', ...(locked ? { opacity: 0.45, pointerEvents: 'none' } : null) }}>
        <SizeInput inches={blockSize(o, gs)} aria="Block arrow size" options={BLOCK_SIZES} onCommit={(v) => { if (v > 0) styleDrawn(store, ids, { size: v, bodyW: undefined }) }} />
      </span>
    </>
  )
}

/** (shape-dims) The ruler toggle: on shows the shapes' dimensions (render/drawnShapes.js dimLabels) — on when every one of
 *  them shows them; a click turns them all on (or, all on, all off) in one undo step. */
function DimsBtn({ objs, locked }) {
  const on = objs.every(o => o.showDims)
  return (
    <>
      <Sep />
      <IconBtn name="Measure" label="Dimensions" title={on ? 'Hide dimensions' : 'Show dimensions'} active={on} pressed={on} locked={locked}
        onClick={() => styleDrawn(store, objs.map(o => o.id), { showDims: !on })} />
    </>
  )
}

const LockDupDel = ({ locked, obj }) => (
  <>
    <IconBtn name="Lock" label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)'} active={locked} pressed={locked} onClick={() => toggleLock(store)} />
    <IconBtn name="Duplicate" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} locked={locked} />
    <IconBtn name="Delete" label="Delete" title="Delete (Del)" danger onClick={deleteSelection} locked={locked} />
    {obj && <MoreMenu obj={obj} />}
  </>
)

/** Stroke colour · width · solid · dashed — shapes and lines. */
function StrokeGroup({ objs, ids, locked }) {
  const o = objs[0], set = (u) => styleDrawn(store, ids, u)
  return (
    <>
      <Swatch round="ring" label="Stroke colour" value={o.stroke || '#1F2321'} locked={locked} onPick={(c) => set({ stroke: c || '#1F2321' })} />
      <WidthPick value={o.strokeWidth || 2} locked={locked} onPick={(w) => set({ strokeWidth: w })} />
      <PicBtn label="Solid" title="Solid" on={!o.dashed} locked={locked} onClick={() => set({ dashed: false })}><PicSolid /></PicBtn>
      <PicBtn label="Dashed" title="Dashed" on={!!o.dashed} locked={locked} onClick={() => set({ dashed: true })}><PicDashed /></PicBtn>
    </>
  )
}

/** None · Tinted · Hatched · fill colour (fill.png): the colour swatch sets the colour Tinted and Hatched use — picked while
 *  Fill is None, it switches Fill to Tinted in the same undo step. */
function FillGroup({ objs, ids, locked }) {
  const o = objs[0], set = (u) => styleDrawn(store, ids, u)
  const colour = o.fill || o.stroke || '#1F2321', seen = onDark(colour)
  const on = !o.noFill && !!o.fill, kind = !on ? 'none' : o.fillStyle === 'hatch' ? 'hatch' : 'tint'
  return (
    <>
      <PicBtn label="No fill" title="None — outline only" on={kind === 'none'} locked={locked} onClick={() => set({ noFill: true })}><PicNone /></PicBtn>
      <PicBtn label="Tinted" title="Tinted — a light wash of the fill colour" on={kind === 'tint'} locked={locked} onClick={() => set(q => ({ fill: q.fill || colour, noFill: false, fillStyle: 'tint' }))}><PicTint c={seen === colour ? colour : '#4A514D'} /></PicBtn>
      <PicBtn label="Hatched" title="Hatched — 45° lines in the fill colour" on={kind === 'hatch'} locked={locked} onClick={() => set(q => ({ fill: q.fill || colour, noFill: false, fillStyle: 'hatch' }))}><PicHatch c={seen} /></PicBtn>
      <Swatch round="dot" label="Fill colour" value={colour} locked={locked} onPick={(c) => { if (c) set(q => (!q.noFill && q.fill ? { fill: c } : { fill: c, noFill: false, fillStyle: 'tint' })) }} />
    </>
  )
}

/** Size ▾ · B · I · colour | left · centre · right · rotate 90 — texts. */
function TextGroup({ objs, ids, locked, gs }) {
  const o = objs[0], set = (u) => styleDrawn(store, ids, u)
  const inches = o.textIn || Math.round(((o.fontSize || 14) / gs) * 12 * 100) / 100
  const a = o.align || 'left'
  const letter = (k, ch, label, extra) => (
    <PicBtn label={label} title={label} on={!!o[k]} locked={locked} onClick={() => set({ [k]: !o[k] })}>
      <span aria-hidden="true" style={{ fontSize: 14, color: o[k] ? B.accent : INK, ...extra }}>{ch}</span>
    </PicBtn>
  )
  return (
    <>
      <span style={{ display: 'inline-flex', ...(locked ? { opacity: 0.45, pointerEvents: 'none' } : null) }}>
        <SizeInput inches={inches} aria="Text size" onCommit={(v) => { if (v > 0) set({ textIn: v, fontSize: (v / 12) * gs }) }} />
      </span>
      {letter('bold', 'B', 'Bold', { fontWeight: 700 })}
      {letter('italic', 'I', 'Italic', { fontStyle: 'italic', fontFamily: 'Georgia, serif' })}
      <Swatch round="ring" label="Text colour" value={o.fill || '#1F2321'} locked={locked} onPick={(c) => set({ fill: c || '#1F2321' })} />
      <Sep />
      {[['left', 'Align left'], ['center', 'Align centre'], ['right', 'Align right']].map(([v, l]) => (
        <PicBtn key={v} label={l} title={l} on={a === v} locked={locked} onClick={() => alignTexts(store, ids, v)}><PicAlign a={v} /></PicBtn>
      ))}
      <IconBtn name="Rotate" label="Rotate 90°" title="Rotate 90°" onClick={() => rotateTexts(store, ids)} locked={locked} />
    </>
  )
}

/** The bar for drawn shapes and texts (several: their count). */
export function DrawnBar({ objs }) {
  const layers = useCanvasStore(s => s.layers), gs = useCanvasStore(s => s.gridSize) || 40
  const locked = objs.every(o => isLockedIn(layers, o)), ids = objs.map(o => o.id)
  const kinds = [...new Set(objs.map(nameOf))]
  const blocks = objs.every(o => o.type === 'block_arrow'), anyBlock = objs.some(o => o.type === 'block_arrow')
  const texts = objs.every(o => o.type === 'text'), noText = !objs.some(o => o.type === 'text') && !anyBlock
  const lines = objs.every(o => o.type === 'line')
  const closed = noText && !lines && objs.every(o => o.type !== 'line' && o.type !== 'elbow' && drawnGeom(o).closed)
  // (d2-arrows) the end style (a line, an open polyline, an elbow) and the corners (not a circle, not a block arrow)
  const ends = noText && objs.every(hasEnds), corners = noText && objs.every(hasCorners)
  return (
    <>
      <span aria-label="Selected" data-bar-count style={{ padding: '0 8px 0 6px', fontSize: 12, fontWeight: 600, color: B.strong }}>
        {objs.length > 1 && kinds.length > 1 ? <><span style={{ fontFamily: MONO }}>{objs.length}</span> <span style={{ fontWeight: 400, color: B.muted }}>selected</span></> : kinds[0]}
      </span>
      <Sep />
      {noText && <StrokeGroup objs={objs} ids={ids} locked={locked} />}
      {ends && <EndsPick objs={objs} ids={ids} locked={locked} />}
      {corners && <><Sep /><CornersGroup objs={objs} ids={ids} locked={locked} /></>}
      {closed && <><Sep /><FillGroup objs={objs} ids={ids} locked={locked} /></>}
      {blocks && <BlockGroup objs={objs} ids={ids} locked={locked} gs={gs} />}
      {/* (d1-trim) a line, an arrow, an elbow arrow: annotations — no length or angle fields */}
      {texts && <TextGroup objs={objs} ids={ids} locked={locked} gs={gs} />}
      {/* (shape-dims) the ruler: its dimensions shown (design/dimtoggle.png) — every shape selected that has some, one undo */}
      {objs.some(canDim) && <DimsBtn objs={objs.filter(canDim)} locked={locked} />}
      {(noText || texts || blocks) && <Sep />}
      <LockDupDel locked={locked} obj={objs[0]} />
    </>
  )
}
