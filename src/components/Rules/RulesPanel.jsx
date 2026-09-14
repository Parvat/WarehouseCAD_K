import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, RotateCcw, Lock, AlertTriangle } from 'lucide-react'
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
  label: { fontSize: 10, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.02em' },
  mono:  { fontFamily: 'var(--font-mono)', fontSize: 11 },
}

const input = {
  padding: '5px 7px', background: 'var(--surface2)',
  border: '1px solid var(--border)', borderRadius: R,
  color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11,
  outline: 'none', minWidth: 0,
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 600,
        letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--text3)',
        paddingBottom: 7, marginBottom: 10, borderBottom: '0.5px solid var(--border)',
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
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
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)',
        }}>
        <RotateCcw size={9} /> this profile
      </button>
    )
  }
  return (
    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text4, var(--text3))' }}>
      from {sourceName || sourceId}
    </span>
  )
}

function Row({ label, origin, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 116, flexShrink: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text)' }}>{label}</div>
        {origin}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
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
        <span key={v} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 5px 3px 7px', borderRadius: R,
          background: 'var(--surface3)', ...S.mono, color: 'var(--text)',
        }}>
          {v}{unit}
          {!disabled && (
            <button onClick={() => onChange(values.filter(x => x !== v))}
              aria-label={`Remove ${v}${unit}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', color: 'var(--text3)' }}>
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="add" type="number"
            style={{ ...input, width: 54 }} />
          <button onClick={add} aria-label="Add value"
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
              color: 'var(--text3)', padding: 2 }}>
            <Plus size={12} />
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
      <input type="number" step={step} value={at(path) ?? ''}
        disabled={locked || editingLocked}
        onChange={e => set(path, num(e.target.value))}
        style={{ ...input, width: 76, opacity: (locked || editingLocked) ? 0.55 : 1 }} />
      {unit && <span style={{ ...S.mono, color: 'var(--text3)' }}>{unit}</span>}
      {locked && (
        <span title="Code/safety value — not a preference"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          <Lock size={9} /> locked
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
      background: 'rgba(0,0,0,0.32)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 760, maxWidth: '100%', maxHeight: '100%',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: R, boxShadow: 'var(--shadow)', color: 'var(--text)',
        fontFamily: 'var(--font-ui)',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Rules profiles</span>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', display: 'flex', padding: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* ── Cascade selector ── */}
        <div style={{ display: 'flex', gap: 10, padding: '11px 14px',
          borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.label}>DEALER PROFILE</div>
            <select value={profileId} style={{ ...input, width: '100%', marginTop: 3 }}
              onChange={e => setDraft(d => ({ ...d, activeProfileId: e.target.value }))}>
              {draft.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={newProfile} style={{ ...input, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Profile</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.label}>CUSTOMER OVERRIDE</div>
            <select value={customerId || ''} style={{ ...input, width: '100%', marginTop: 3 }}
              onChange={e => setDraft(d => ({ ...d, activeCustomerId: e.target.value || null }))}>
              <option value="">— none —</option>
              {Object.entries(draft.customerOverrides).map(([id, c]) =>
                <option key={id} value={id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={newCustomer} style={{ ...input, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Customer</button>
        </div>

        {/* ── Which layer am I editing ── */}
        <div style={{ padding: '8px 14px', borderBottom: '0.5px solid var(--border)',
          ...S.mono, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {editingLocked
            ? <><Lock size={11} /> Trace Default is read-only — add a profile to change anything.</>
            : <>Editing <span style={{ color: 'var(--text)' }}>{layerName}</span> · edits are stored as changes only</>}
        </div>

        {/* ── The table ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 4px' }}>
          {!editingLocked && (
            <Section title="Identity">
              <Row label="Name">
                <input value={layerName} style={{ ...input, flex: 1 }}
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
            <Row label="Wall clear"    origin={originFor('selective.wallClearanceIn')}>{field('selective.wallClearanceIn', { unit: 'in' })}</Row>
          </Section>

          <Section title="Materials handling">
            {Object.keys(resolved.mhe || {}).map(key => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 116, flexShrink: 0 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text)' }}>
                    {resolved.mhe[key]?.label || MHE_LABELS[key] || key}
                  </div>
                  {originFor(`mhe.${key}.aisleFt`)}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...S.mono, color: 'var(--text3)' }}>aisle</span>
                  {field(`mhe.${key}.aisleFt`, { unit: 'ft', step: 0.5 })}
                  <span style={{ ...S.mono, color: 'var(--text3)', marginLeft: 6 }}>min</span>
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
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 116, flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text)', textTransform: 'capitalize' }}>
                      {t.replace(/([A-Z])/g, ' $1')}
                    </div>
                    {originFor(`${t}.depth`)}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...S.mono, color: 'var(--text3)' }}>lanes</span>
                    <NumberList values={lanes} unit="" disabled={editingLocked}
                      onChange={v => set(`${t}.lanes`, v)} />
                    <span style={{ ...S.mono, color: 'var(--text3)', marginLeft: 6 }}>deep</span>
                    <input type="number" value={d[0]} disabled={editingLocked}
                      onChange={e => set(`${t}.depth`, [num(e.target.value), d[1]])}
                      style={{ ...input, width: 54 }} />
                    <span style={{ ...S.mono, color: 'var(--text3)' }}>–</span>
                    <input type="number" value={d[1]} disabled={editingLocked}
                      onChange={e => set(`${t}.depth`, [d[0], num(e.target.value)])}
                      style={{ ...input, width: 54 }} />
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
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
          {(result.errors.length > 0 || result.warnings.length > 0) && (
            <div style={{ marginBottom: 9, display: 'flex', flexDirection: 'column', gap: 5,
              maxHeight: 110, overflowY: 'auto' }}>
              {result.errors.map((e, i) => (
                <div key={`e${i}`} style={{ display: 'flex', gap: 6, alignItems: 'flex-start',
                  ...S.mono, fontSize: 10, color: 'var(--red)' }}>
                  {e.kind === 'locked' ? <Lock size={10} style={{ marginTop: 1, flexShrink: 0 }} />
                                       : <AlertTriangle size={10} style={{ marginTop: 1, flexShrink: 0 }} />}
                  <span>{e.message}</span>
                </div>
              ))}
              {result.warnings.map((w, i) => (
                <div key={`w${i}`} style={{ display: 'flex', gap: 6, alignItems: 'flex-start',
                  ...S.mono, fontSize: 10, color: 'var(--text3)' }}>
                  <AlertTriangle size={10} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...S.mono, fontSize: 10, flex: 1,
              color: saveMsg ? (saveMsg.ok ? 'var(--green)' : 'var(--red)') : 'var(--text3)' }}>
              {saveMsg ? saveMsg.text
                : result.ok ? 'Ready to save.'
                : 'Fix the problems above to save.'}
            </span>
            <button onClick={onClose} style={{ ...input, cursor: 'pointer' }}>Cancel</button>
            <button onClick={onSave} disabled={!result.ok}
              style={{
                padding: '6px 14px', borderRadius: R, border: 'none',
                background: 'var(--accent-solid)', color: 'var(--accent-fg)',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                cursor: result.ok ? 'pointer' : 'not-allowed',
                opacity: result.ok ? 1 : 0.5,
              }}>
              Save &amp; apply
            </button>
          </div>
        </div>
      </div>
    </div>,
    host
  )
}
