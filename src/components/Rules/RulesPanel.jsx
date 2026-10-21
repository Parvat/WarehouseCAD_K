import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, RotateCcw, Lock, TriangleAlert } from 'lucide-react'
import { Note } from '../shared/Note'
import { useRules } from '../../rules/useRules'
import { resolveRules, setAt, unsetAt, explainValue } from '../../rules/resolve'
import { DEFAULT_PROFILE_ID, LANE_TYPES, MHE_LABELS } from '../../rules/defaults'

/* ── The rules form ──────────────────────────────────────────────────────────
   Opens the defaults, edits, saves, applies.

   The one idea the whole form is built around: an edit writes into the ACTIVE
   LAYER only. Change a beam length while "Our reach standard" is selected and
   it lands in that profile; the Trace default underneath is never touched, and
   the profile stays a short list of changes. Every field shows where its
   current value came from, and offers to drop back to the inherited one. */

const R = 2

const S = {
  mono:  { fontFamily: 'var(--font-mono)', fontSize: 12 },
  // a word beside a field ("aisle", "min", "lanes", "deep"): PJS, steel
  word:  { fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--steel)' },
}
const ICON = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true }
/* every field row: the label column (the name, where its value came from under it), then the inputs — one grid, so
   the inputs line up down the whole form */
const ROW = { display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', columnGap: 12, alignItems: 'center' }

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="t-head" style={{ paddingBottom: 8, marginBottom: 12, borderBottom: '1px solid var(--line)' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

/* Where a value came from, plus a one-click revert. This is what stops the
   form reading as an undifferentiated blob of merged numbers. */
function Origin({ sourceId, sourceName, isOwn, onRevert }) {
  if (isOwn) {
    return (
      <button onClick={onRevert} title="Revert to the inherited value"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--pine)',
        }}>
        <RotateCcw size={12} strokeWidth={1.5} absoluteStrokeWidth /> this profile
      </button>
    )
  }
  return (
    <span style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--steel)' }}>
      from {sourceName || sourceId}
    </span>
  )
}

function Row({ label, origin, children }) {
  return (
    <div style={ROW}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</div>
        {origin}
      </div>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {children}
      </div>
    </div>
  )
}

/* An editable list — the "ship sensible, let them extend" case. A dealer adds
   their own frame widths or beam lengths here rather than us predicting them. */
function NumberList({ values, onChange, disabled, unit = '"' }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const n = Number(draft)
    if (!Number.isFinite(n) || n <= 0) return
    if (values.includes(n)) { setDraft(''); return }
    onChange([...values, n].sort((a, b) => a - b))
    setDraft('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {values.map(v => (
        <span key={v} className="t-num" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
          padding: disabled ? '0 8px' : '0 4px 0 8px', borderRadius: R,
          background: 'var(--bg2)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--ink)',
        }}>
          {v}{unit}
          {!disabled && (
            <button onClick={() => onChange(values.filter(x => x !== v))}
              aria-label={`Remove ${v}${unit}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', color: 'var(--steel)' }}>
              <X size={12} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="add" type="number"
            className="t-input" style={{ width: 64 }} />
          <button onClick={add} aria-label="Add value" className="t-icon">
            <Plus {...ICON} />
          </button>
        </span>
      )}
    </div>
  )
}

export function RulesPanel({ onClose }) {
  const { config, commit, validate, setActiveProfile, setActiveCustomer } = useRules()
  const [draft, setDraft] = useState(config)
  const [saveMsg, setSaveMsg] = useState(null)

  const [host, setHost] = useState(null)
  useEffect(() => { setHost(document.querySelector('[data-theme]')) }, [])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const customerId = draft.activeCustomerId
  const profileId  = draft.activeProfileId

  /* Which layer does an edit land in? The customer override when one is
     selected, otherwise the dealer profile. The shipped default is read-only —
     a correction to it has to reach every dealer, so it stays code. */
  const editingCustomer = !!customerId
  const editingLocked   = !editingCustomer && profileId === DEFAULT_PROFILE_ID
  const layerName = editingCustomer
    ? (draft.customerOverrides[customerId]?.name || customerId)
    : (draft.profiles.find(p => p.id === profileId)?.name || profileId)

  const resolved = useMemo(
    () => resolveRules(draft, profileId, customerId), [draft, profileId, customerId])
  const result = useMemo(() => validate(resolved), [resolved, validate])

  const ownRules = editingCustomer
    ? (draft.customerOverrides[customerId]?.rules || {})
    : (draft.profiles.find(p => p.id === profileId)?.rules || {})

  const writeOwn = (nextRules) => {
    setSaveMsg(null)
    setDraft(d => editingCustomer
      ? { ...d, customerOverrides: {
          ...d.customerOverrides,
          [customerId]: { ...d.customerOverrides[customerId], rules: nextRules } } }
      : { ...d, profiles: d.profiles.map(p =>
          p.id === profileId ? { ...p, rules: nextRules } : p) })
  }

  const at = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), resolved)
  const ownHas = (path) =>
    path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ownRules) !== undefined
  const set    = (path, v) => writeOwn(setAt(ownRules, path, v))
  const revert = (path)    => writeOwn(unsetAt(ownRules, path))

  const originFor = (path) => {
    const e = explainValue({ ...draft, activeProfileId: profileId, activeCustomerId: customerId }, path)
    /* The shipped default owns every value by definition, but it cannot be
       edited — offering "revert" there would be a button that does nothing. */
    return <Origin sourceId={e.source?.id} sourceName={e.source?.name}
      isOwn={!editingLocked && ownHas(path)} onRevert={() => revert(path)} />
  }

  const field = (path, { unit, step = 1, locked = false } = {}) => (
    <>
      <span className="t-field" style={{ flex: '0 0 96px' }}>
        <input type="number" step={step} value={at(path) ?? ''}
          disabled={locked || editingLocked}
          onChange={e => set(path, num(e.target.value))}
          className="t-input" style={unit ? undefined : { paddingRight: 8 }} />
        {unit && <span className="t-unit">{unit}</span>}
      </span>
      {locked && (
        <span title="Code/safety value — not a preference"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--steel)' }}>
          <Lock size={12} strokeWidth={1.5} absoluteStrokeWidth /> locked
        </span>
      )}
    </>
  )

  const list = (path, unit = '"') => (
    <NumberList values={at(path) || []} unit={unit}
      disabled={editingLocked}
      onChange={v => set(path, v)} />
  )

  const newProfile = () => {
    const id = `profile-${Date.now().toString(36)}`
    setDraft(d => ({
      ...d,
      /* A new profile extends what is on screen now and starts EMPTY — it is a
         set of changes, so copying the resolved table into it would defeat the
         cascade on its first day. */
      profiles: [...d.profiles, { id, name: 'New profile', extends: profileId, rules: {} }],
      activeProfileId: id, activeCustomerId: null,
    }))
  }

  const newCustomer = () => {
    const id = `customer-${Date.now().toString(36)}`
    setDraft(d => ({
      ...d,
      customerOverrides: { ...d.customerOverrides,
        [id]: { name: 'New customer', extends: profileId, rules: {} } },
      activeCustomerId: id,
    }))
  }

  const onSave = () => {
    const res = commit(draft)
    if (res.ok) {
      setActiveProfile(draft.activeProfileId)
      setActiveCustomer(draft.activeCustomerId)
      setSaveMsg({ ok: true, text: 'Saved and applied.' })
    } else {
      setSaveMsg({ ok: false, text: `${res.errors.length} problem${res.errors.length === 1 ? '' : 's'} — not saved.` })
    }
  }

  if (!host) return null

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'var(--overlay)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 760, maxWidth: '100%', maxHeight: 'calc(100vh - 32px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--paper)', border: '1px solid var(--line)',
        borderRadius: R, boxShadow: 'var(--shadow-pop)', color: 'var(--ink)',
        fontFamily: 'var(--font-ui)', fontSize: 13,
      }}>

        {/* ── Header ── */}
        <div className="t-modal-head">
          <span className="t-modal-title">Rules profiles</span>
          <button onClick={onClose} aria-label="Close" title="Close (Esc)" className="t-icon">
            <X {...ICON} />
          </button>
        </div>

        {/* ── Cascade selector ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px',
          borderBottom: '1px solid var(--line)', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div className="t-cap">DEALER PROFILE</div>
            <select value={profileId} className="t-input t-words" style={{ width: '100%', marginTop: 4 }}
              onChange={e => setDraft(d => ({ ...d, activeProfileId: e.target.value }))}>
              {draft.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={newProfile} className="t-btn t-btn--secondary">+ Profile</button>
          <div style={{ flex: '1 1 180px', minWidth: 0, marginLeft: 8 }}>
            <div className="t-cap">CUSTOMER OVERRIDE</div>
            <select value={customerId || ''} className="t-input t-words" style={{ width: '100%', marginTop: 4 }}
              onChange={e => setDraft(d => ({ ...d, activeCustomerId: e.target.value || null }))}>
              <option value="">— none —</option>
              {Object.entries(draft.customerOverrides).map(([id, c]) =>
                <option key={id} value={id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={newCustomer} className="t-btn t-btn--secondary">+ Customer</button>
        </div>

        {/* ── Which layer am I editing ── */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)',
          fontSize: 12, color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {editingLocked
            ? <Note level="note" icon={Lock} style={{ flex: 1 }}>Trace Default is read-only — add a profile to change anything.</Note>
            : <span>Editing <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{layerName}</span> · edits are stored as changes only</span>}
        </div>

        {/* ── The table ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 4px' }}>
          {!editingLocked && (
            <Section title="Identity">
              <Row label="Name">
                <input value={layerName} className="t-input t-words" style={{ flex: 1 }}
                  onChange={e => {
                    const name = e.target.value
                    setDraft(d => editingCustomer
                      ? { ...d, customerOverrides: { ...d.customerOverrides,
                          [customerId]: { ...d.customerOverrides[customerId], name } } }
                      : { ...d, profiles: d.profiles.map(p => p.id === profileId ? { ...p, name } : p) })
                  }} />
              </Row>
            </Section>
          )}

          <Section title="Pallet">
            <Row label="Width" origin={originFor('pallet.wIn')}>{field('pallet.wIn', { unit: 'in' })}</Row>
            <Row label="Depth" origin={originFor('pallet.dIn')}>{field('pallet.dIn', { unit: 'in' })}</Row>
          </Section>

          <Section title="Selective racking">
            <Row label="Frame widths"  origin={originFor('selective.frameWidthsIn')}>{list('selective.frameWidthsIn')}</Row>
            <Row label="Frame depths"  origin={originFor('selective.frameDepthsIn')}>{list('selective.frameDepthsIn')}</Row>
            <Row label="Beam lengths"  origin={originFor('selective.beamLengthsIn')}>{list('selective.beamLengthsIn')}</Row>
            <Row label="Beam faces"    origin={originFor('selective.beamFaceHeightsIn')}>{list('selective.beamFaceHeightsIn')}</Row>
            <Row label="Flue"          origin={originFor('selective.flueIn')}>{field('selective.flueIn', { unit: 'in' })}</Row>
          </Section>

          <Section title="Materials handling">
            {Object.keys(resolved.mhe || {}).map(key => (
              <div key={key} style={ROW}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                    {resolved.mhe[key]?.label || MHE_LABELS[key] || key}
                  </div>
                  {originFor(`mhe.${key}.aisleFt`)}
                </div>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={S.word}>aisle</span>
                  {field(`mhe.${key}.aisleFt`, { unit: 'ft', step: 0.5 })}
                  <span style={{ ...S.word, marginLeft: 8 }}>min</span>
                  {field(`mhe.${key}.minAisleFt`, { unit: 'ft', step: 0.5, locked: true })}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Lane storage">
            {LANE_TYPES.filter(t => resolved[t]).map(t => {
              const d = resolved[t].depth || [1, 1]
              const lanes = resolved[t].lanes || []
              return (
                <div key={t} style={ROW}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)', textTransform: 'capitalize' }}>
                      {t.replace(/([A-Z])/g, ' $1')}
                    </div>
                    {originFor(`${t}.depth`)}
                  </div>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={S.word}>lanes</span>
                    <NumberList values={lanes} unit="" disabled={editingLocked}
                      onChange={v => set(`${t}.lanes`, v)} />
                    <span style={{ ...S.word, marginLeft: 8 }}>deep</span>
                    <input type="number" value={d[0]} disabled={editingLocked}
                      onChange={e => set(`${t}.depth`, [num(e.target.value), d[1]])}
                      className="t-input" style={{ width: 64 }} />
                    <span style={{ ...S.mono, color: 'var(--steel)' }}>–</span>
                    <input type="number" value={d[1]} disabled={editingLocked}
                      onChange={e => set(`${t}.depth`, [d[0], num(e.target.value)])}
                      className="t-input" style={{ width: 64 }} />
                  </div>
                </div>
              )
            })}
          </Section>

          <Section title="Clearances">
            <Row label="ESFR below deflector" origin={originFor('clearances.esfrBelowDeflectorIn')}>
              {field('clearances.esfrBelowDeflectorIn', { unit: 'in', locked: true })}
            </Row>
          </Section>
        </div>

        {/* ── Validation + save ── */}
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 16px' }}>
          {(result.errors.length > 0 || result.warnings.length > 0) && (
            <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4,
              maxHeight: 112, overflowY: 'auto' }}>
              {result.errors.map((e, i) => (
                <Note key={`e${i}`} level="error" icon={e.kind === 'locked' ? Lock : TriangleAlert}>
                  <span>{e.message}</span>
                </Note>
              ))}
              {result.warnings.map((w, i) => (
                <Note key={`w${i}`} level="warning" icon={TriangleAlert}>
                  <span>{w.message}</span>
                </Note>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, flex: 1,
              color: saveMsg ? (saveMsg.ok ? 'var(--pine)' : 'var(--flag)') : 'var(--steel)' }}>
              {saveMsg ? saveMsg.text
                : result.ok ? 'Ready to save.'
                : 'Fix the problems above to save.'}
            </span>
            <button onClick={onClose} className="t-btn t-btn--secondary">Cancel</button>
            <button onClick={onSave} disabled={!result.ok} className="t-btn t-btn--primary">
              Save &amp; apply
            </button>
          </div>
        </div>
      </div>
    </div>,
    host
  )
}
