import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasStore } from '../store/useCanvasStore'
import { useBayLedger } from '../components/RightPanel/useBayLedger'
import { useColumnCheckOptional } from '../generate/useColumnCheck'
import { summaryBase, scopeFigures, layoutScope, sectionScope, linesOfRack, bayFigures, LOST_REASONS, floorArea } from '../utils/summary'
import { typeById } from '../utils/elevations'
import { nameOf, projectOf, defaultCeiling } from '../utils/project'
import { equipmentResolver, sectionProfile, equipmentOf, designNotes } from '../utils/equipment'
import { isSection } from '../utils/sectionAreas'
import { checkLayout, shownCheck, runLayoutCheck, useLayoutCheck, HL } from '../utils/layoutCheck'
import { walkwayInNow } from '../utils/zoneCheck'
import { rackFootprint, MHE_PROFILES } from '../generate/columnCheck'
import { aisleGapShown, aisleLabelLayout, gapBase } from '../canvas2/hitTest'
import { crossAisleLabels } from '../canvas2/crossAisles'
import { labelScale } from '../render/labelSize'
import { useLabelPrefs } from '../canvas2/labelPrefs'
import { pxToFtIn } from '../utils/canvas'
import { SectionsList } from './sectionCards'
import { ftIn } from './cards'
import { Caption, CountChip, Btn, C, MONO } from './cardParts'

/* Summary follows selection (STUDIO.md §7a): the right card's Properties tab shows the layout's figures under whatever is
   selected — nothing: the whole layout's Storage · Building · Racking · Aisles · Sections · Checks; a building: its fields,
   then the same; a section: its fields, then Storage · Racking · Aisles · Checks of its racks; a rack line or pair: its
   fields, then Storage · Racking · Parts (its lines' mini BOM); several racks: their totals; a bay: its positions, levels
   and what it lost. Every figure is the BOM's, the Tally's or usable's own (utils/summary.js). Blocks: an 11px uppercase
   muted caption, mono numbers, 12px padding, a #2E3431 line between them. A click on Lost lights the racks that lose
   positions on the plan (Check layout's highlight: it stays until the next click on the canvas). */

export const LOST_COLOR = '#FFB4A3'
const n = (v) => (v ?? 0).toLocaleString('en-US')
const plural = (k, w) => `${n(k)} ${w}${k === 1 ? '' : 's'}`

/** A summary block: the caption, then its lines. */
export function Block({ label, aria, children, last }) {
  return (
    <div aria-label={aria || label} data-summary-block={aria || label} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: last ? 'none' : `1px solid ${C.divider}`, minWidth: 0 }}>
      <Caption>{label}</Caption>
      {children}
    </div>
  )
}
/** A line: its label left (12, muted), its value right (mono). `muted`: a value not set. */
export function Line({ label, value, sum, muted, swatch, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 12 }}>
      {swatch !== undefined && <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: swatch || 'transparent', border: swatch ? 'none' : `1px solid ${C.separator}` }} />}
      <span style={{ color: C.muted, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>
      <span data-sum={sum} style={{ marginLeft: 'auto', fontFamily: muted ? undefined : MONO, color: muted ? C.muted : C.strong, whiteSpace: 'nowrap' }}>{children ?? value}</span>
    </div>
  )
}

/** The layout's summary inputs, worked out once per change (utils/summary.js summaryBase). */
export function useSummaryBase() {
  const { objects, T, gs } = useCanvasStore(useShallow(s => ({ objects: s.objects, T: s.elevations, gs: s.gridSize || 40 })))
  const ledger = useBayLedger(objects, gs)
  // (outside the provider — a card rendered on its own — the check is run here, on the shipped reach truck)
  const cc = useColumnCheckOptional()
  const result = cc ? cc.result : undefined, profile = cc?.profile || MHE_PROFILES.reach, pickBothSides = !!cc?.pickBothSides
  const D = useMemo(() => summaryBase(objects, T, { gridSize: gs, ledger, check: result, profile }), [objects, T, gs, ledger, result, profile])
  return { D, objects, T, gs, profile, pickBothSides }
}

/** Light the racks that lose positions on the plan (a second click on the same set clears it). */
export function showLostRacks(ids, objects) {
  const hl = useLayoutCheck.getState().highlight, key = ids.slice().sort().join(',')
  if (!ids.length || (hl?.kind === 'lost' && hl.key === key)) { useLayoutCheck.setState({ highlight: null }); return }
  const set = new Set(ids)
  const shapes = objects.filter(o => set.has(o.id)).map(r => { const f = rackFootprint(r); return { id: r.id, x: f.x, y: f.y, w: f.w, h: f.h, color: HL.red, mode: 'fill' } })
  useLayoutCheck.setState({ highlight: { shapes, ids, at: Date.now(), kind: 'lost', key } })
}

/* ── Storage ── */
function Figure({ label, value, color = C.strong, sum, onClick, title }) {
  const body = (
    <>
      <span data-sum={sum} style={{ fontFamily: MONO, fontSize: 15, color }}>{value}</span>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
    </>
  )
  return onClick
    ? <button type="button" className="st-hov" aria-label={title} title={title} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 4px', margin: '0 -4px', border: 0, borderRadius: 4, background: 'transparent', cursor: 'pointer' }}>{body}</button>
    : <div style={{ display: 'flex', flexDirection: 'column' }}>{body}</div>
}

export function StorageBlock({ f, objects, last }) {
  const lostOn = useLayoutCheck(s => s.highlight?.kind === 'lost')
  const tot = f.usable + f.lost
  return (
    <Block label="Storage" last={last}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Figure label="positions" sum="positions" value={n(f.positions)} />
        <Figure label="usable" sum="usable" value={n(f.usable)} color={C.accent} />
        <Figure label="lost" sum="lost" value={n(f.lost)} color={LOST_COLOR} title={lostOn ? 'Hide lost racks' : 'Show lost racks'}
          onClick={f.lost > 0 ? () => showLostRacks(f.lostRacks, objects) : undefined} />
      </div>
      {/* usable vs lost */}
      <div aria-label="Usable vs lost" style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: C.inset }}>
        {tot > 0 && <span style={{ width: `${(Math.max(0, f.usable) / tot) * 100}%`, background: C.accent }} />}
        {tot > 0 && <span style={{ width: `${(f.lost / tot) * 100}%`, background: LOST_COLOR }} />}
      </div>
      <Caption>Lost to</Caption>
      {LOST_REASONS.map(r => <Line key={r.key} label={r.label} sum={'lost-' + r.key} value={n(f.lostBy[r.key])} />)}
      {f.perK != null && <Line label="Positions per 1,000 sq ft" sum="per-1000" value={f.perK.toFixed(1)} />}
    </Block>
  )
}

/* ── Building ── */
export function BuildingBlock({ objects, T, gs }) {
  const fp = objects.find(o => typeof o?.type === 'string' && o.type.startsWith('fp_'))
  const ceil = defaultCeiling(projectOf(T))
  const area = objects.filter(o => typeof o?.type === 'string' && o.type.startsWith('fp_')).reduce((t, f) => t + floorArea(f), 0) / (gs * gs)
  const notSet = (v, sum) => (v > 0 ? <Line label={sum === 'clear' ? 'Clear height' : 'Sprinklers'} sum={sum} value={ftIn(v)} /> : <Line label={sum === 'clear' ? 'Clear height' : 'Sprinklers'} sum={sum} muted value="Not set" />)
  return (
    <Block label="Building">
      <Line label="Size" sum="size" value={fp ? `${Math.round(fp.width / gs)}′ × ${Math.round(fp.height / gs)}′` : '—'} />
      <Line label="Area" sum="area" value={`${n(Math.round(area))} sq ft`} />
      {notSet(ceil?.clearHeightIn, 'clear')}
      {notSet(ceil?.sprinklerIn, 'sprinkler')}
    </Block>
  )
}

/* ── Racking ── */
export function RackingBlock({ f, T, show = ['lines', 'bays', 'frames'], last }) {
  const lv = f.levels ? (f.levels[0] === f.levels[1] ? String(f.levels[0]) : `${f.levels[0]}–${f.levels[1]}`) : '—'
  return (
    <Block label="Racking" last={last}>
      {show.includes('racks') && <Line label="Racks" sum="racks" value={n(f.racks)} />}
      {show.includes('lines') && <Line label="Rack lines" sum="lines" value={n(f.lines)} />}
      <Line label="Bays" sum="bays" value={n(f.bays)} />
      <Line label="Frames" sum="frames" value={n(f.frames)} />
      {show.includes('levels') && <Line label="Levels" sum="levels" value={lv} />}
      {show.includes('elevations') && f.elevations.map(e => {
        const t = e.id != null ? typeById(T, e.id) : null
        return <Line key={e.id ?? 'none'} label={t ? nameOf(T, t) : 'No elevation'} swatch={t?.color || null} sum={'elev:' + (e.id ?? 'none')} value={plural(e.bays, 'bay')} />
      })}
    </Block>
  )
}

/* ── Aisles ── */
const span = (ws, gs) => {
  if (!ws.length) return '—'
  const a = Math.min(...ws), b = Math.max(...ws)
  return Math.abs(b - a) < gs / 24 ? pxToFtIn(a, gs) : `${pxToFtIn(a, gs)} – ${pxToFtIn(b, gs)}`
}
const designLine = (p) => `Designed for ${+p.aisleFt.toFixed(2)} ft aisles, equipment to be confirmed`
export function AislesBlock({ objects, gs, profile, rackIds = null, section = null }) {
  const labelSize = useLabelPrefs(s => s.labelSize)
  const a = useMemo(() => {
    const has = (id) => !rackIds || rackIds.has(id)
    const gapR = equipmentResolver(objects, gapBase())
    const pick = objects.filter(o => o.type === 'aisle' && (has(o.row1Id) || has(o.row2Id)) && aisleGapShown(o, objects, gs, gapR.pair(o.row1Id, o.row2Id)))
      .map(o => aisleLabelLayout(o, objects, gs, { columns: [], lz: 1 })).filter(Boolean).map(L => L.gapHi - L.gapLo)
    const cross = new Map()
    for (const L of crossAisleLabels(objects, gs, { lz: labelScale(labelSize, gs) })) {
      if (rackIds && !(L.ids || []).some(has)) continue
      const k = L.ids ? L.key.split('|').slice(0, 3).join('|') : L.key   // a cross-aisle's labels (one about every 75 ft) are one
      cross.set(k, Math.min(cross.get(k) ?? Infinity, L.gapHi - L.gapLo))
    }
    // the equipment: the project forklift, then every other the racks in scope are held to
    const base = profile, R = equipmentResolver(objects, base), out = []
    const line = (p, who) => (p.custom ? { text: (who ? who + ' · ' : '') + designLine(p), note: true } : { text: (who ? who + ' · ' : '') + p.label })
    if (section) out.push(line(sectionProfile(section) || base, equipmentOf(section) ? null : 'Project forklift'))
    else if (rackIds) {
      const seen = new Map()
      for (const id of rackIds) { const p = R.of(id); if (!seen.has(p.key)) seen.set(p.key, p) }
      for (const p of seen.values()) out.push(line(p, p.key === base.key ? 'Project forklift' : null))
    } else {
      out.push(line(base, 'Project forklift'))
      for (const s of objects.filter(isSection)) { const p = sectionProfile(s); if (p && p.key !== base.key) out.push(line(p, s.label || 'Section')) }
      for (const t of designNotes(objects)) out.push({ text: t, note: true })
      const named = new Set([base.key, ...objects.filter(isSection).map(s => sectionProfile(s)?.key)])
      for (const p of R.inUse) if (!named.has(p.key) && !p.custom) out.push(line(p, null))
    }
    return { pick, cross: [...cross.values()], equip: out }
  }, [objects, gs, profile, rackIds, section, labelSize])
  return (
    <Block label="Aisles">
      <Line label="Pick aisle" sum="pick-aisle" value={span(a.pick, gs)} />
      <Line label="Cross aisles" sum="cross-aisles" value={a.cross.length ? `${a.cross.length} · ${span(a.cross, gs)}` : '0'} />
      <span style={{ color: C.muted, fontSize: 12 }}>Equipment</span>
      {a.equip.map(e => (
        <span key={e.text} data-equipment data-design-note={e.note && /^Designed/.test(e.text) ? '' : undefined}
          style={{ fontSize: 12, lineHeight: 1.45, color: e.note ? '#F2C77A' : C.strong }}>{e.text}</span>
      ))}
    </Block>
  )
}

/* ── Checks ── */
export function ChecksBlock({ objects, T, gs, profile, pickBothSides, ids = null, last }) {
  const counts = useMemo(() => {
    const r = shownCheck(checkLayout(objects, { profile, pickBothSides, walkwayIn: walkwayInNow(), gridSize: gs, elevations: T }), T)
    const mine = (it) => !ids || (it.ids || []).some(id => ids.has(id))
    return { error: r.errors.filter(mine).length, warning: r.warnings.filter(mine).length, note: ids ? 0 : (r.reminders || []).length }
  }, [objects, T, gs, profile, pickBothSides, ids])
  const none = !counts.error && !counts.warning && !counts.note
  return (
    <Block label="Checks" last={last}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {none ? <span style={{ color: C.muted, fontSize: 12 }}>No issues</span>
          : ['error', 'warning', 'note'].map(l => counts[l] > 0 && <span key={l} title={plural(counts[l], l)}><CountChip level={l} n={counts[l]} /></span>)}
        <Btn kind="inset" aria-label="Open layout check" style={{ marginLeft: 'auto', height: 26, padding: '0 10px', fontSize: 12 }} onClick={() => runLayoutCheck(useCanvasStore)}>Open</Btn>
      </div>
    </Block>
  )
}

/* ═══ the scopes ═══ */

/** Nothing selected (and a building, under its fields): the whole layout. */
export function LayoutSummary() {
  const { D, objects, T, gs, profile, pickBothSides } = useSummaryBase()
  const f = useMemo(() => scopeFigures(D, layoutScope(D)), [D])
  return (
    <div aria-label="Layout summary" style={{ display: 'contents' }}>
      <StorageBlock f={f} objects={objects} />
      <BuildingBlock objects={objects} T={T} gs={gs} />
      <RackingBlock f={f} T={T} show={['lines', 'bays', 'frames', 'elevations']} />
      <AislesBlock objects={objects} gs={gs} profile={profile} />
      <SectionsList />
      <ChecksBlock objects={objects} T={T} gs={gs} profile={profile} pickBothSides={pickBothSides} />
    </div>
  )
}

/** A section: its racks' Storage, Racking (its BOM section's lines), Aisles, Checks. */
export function SectionSummary({ obj }) {
  const { D, objects, T, gs, profile, pickBothSides } = useSummaryBase()
  const sc = useMemo(() => sectionScope(D, obj), [D, obj])
  const f = useMemo(() => scopeFigures(D, sc), [D, sc])
  const ids = useMemo(() => new Set([...sc.rackIds, obj.id]), [sc, obj.id])
  return (
    <div aria-label="Section summary" style={{ display: 'contents' }}>
      <StorageBlock f={f} objects={objects} />
      <RackingBlock f={f} T={T} show={['lines', 'bays', 'frames', 'elevations']} />
      <AislesBlock objects={objects} gs={gs} profile={profile} rackIds={sc.rackIds} section={obj} />
      <ChecksBlock objects={objects} T={T} gs={gs} profile={profile} pickBothSides={pickBothSides} ids={ids} />
    </div>
  )
}

/** A rack line or pair: its lines' Storage (the Tally's positions), Racking (bays, frames, levels) and Parts (its
 *  columns of the By row table). A bay picked: that bay. */
export function LineSummary({ obj }) {
  const { D, objects, T } = useSummaryBase()
  const lines = useMemo(() => linesOfRack(D, obj), [D, obj])
  const f = useMemo(() => (lines.length ? scopeFigures(D, { rackIds: new Set(lines.flatMap(l => l.ids)), nos: new Set(lines.map(l => l.no)), lines: true }) : null), [D, lines])
  if (!f) return null
  return (
    <div aria-label="Line summary" style={{ display: 'contents' }}>
      <StorageBlock f={f} objects={objects} />
      <RackingBlock f={f} T={T} show={['lines', 'bays', 'frames', 'levels']} />
      <Block label={`Parts · ${lines.map(l => l.label).join(', ')}`} aria="Parts">
        {f.parts.map(p => <Line key={p.key} label={p.name} sum={'part:' + p.key} value={n(p.qty)} />)}
        {!f.parts.length && <span style={{ color: C.muted, fontSize: 12 }}>No parts</span>}
      </Block>
    </div>
  )
}

/** A bay: its positions and levels, and what it lost (X-marked). */
export function BaySummary({ obj }) {
  const { D, objects } = useSummaryBase()
  const side = obj.type === 'rack_double_row' && (obj.activeBaySide === 0 || obj.activeBaySide === 1) ? obj.activeBaySide : null
  const b = useMemo(() => bayFigures(D, obj.id, obj.activeBayIdx, side), [D, obj.id, obj.activeBayIdx, side])
  const lv = b.levels ? (b.levels[0] === b.levels[1] ? String(b.levels[0]) : `${b.levels[0]}–${b.levels[1]}`) : '—'
  return (
    <Block label={`Bay ${obj.activeBayIdx + 1}`} aria="Bay summary">
      <Line label="Positions" sum="positions" value={n(b.positions)} />
      <Line label="Levels" sum="levels" value={lv} />
      {b.lost > 0 && (
        <Line label="Lost" sum="lost">
          <button type="button" className="st-hov" aria-label="Show lost racks" onClick={() => showLostRacks([obj.id], objects)} style={{ border: 0, padding: '0 4px', borderRadius: 4, background: 'transparent', fontFamily: MONO, fontSize: 12, color: LOST_COLOR, cursor: 'pointer' }}>{n(b.lost)}</button>
        </Line>
      )}
    </Block>
  )
}

/** Several racks (or a group): their totals — Storage, then Racking (racks, bays, frames). */
export function SelectionSummary({ selected }) {
  const { D, objects, T } = useSummaryBase()
  const key = selected.filter(o => /^rack_/.test(o.type || '')).map(o => o.id).join(',')
  const f = useMemo(() => {
    if (!key) return null
    const ids = new Set(key.split(','))
    return { ...scopeFigures(D, { rackIds: ids }), racks: ids.size }
  }, [D, key])
  if (!f) return null
  return (
    <div aria-label="Selection summary" style={{ display: 'contents' }}>
      <StorageBlock f={f} objects={objects} />
      <RackingBlock f={f} T={T} show={['racks', 'bays', 'frames']} />
    </div>
  )
}
