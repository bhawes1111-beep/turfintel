// Disease — Observations tab (the real D1-backed surface).
//
// Active concerns, monitoring, resolved, and a Log Observation quick entry
// with common-disease chips + free text. Real persisted data only. Status is
// user-set (tap to cycle); nothing here is predicted.

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  useDisease,
  createDisease,
  patchDisease,
  deleteDisease,
} from '../../../utils/disease/diseaseStore'
import { categorizeObservations } from '../../../utils/disease/diseaseView'
import { useToast } from '../../../utils/feedback/toastContext'
import { useAuth } from '../../../context/AuthContext'
import styles from './ObservationsTab.module.css'

// Common cool/warm-season turf diseases — chips for fast logging. Free text
// is always available for anything not listed.
const COMMON_DISEASES = [
  'Dollar Spot', 'Brown Patch', 'Pythium Blight', 'Anthracnose',
  'Large Patch', 'Spring Dead Spot', 'Fairy Ring', 'Snow Mold',
  'Take-All Patch', 'Leaf Spot', 'Rust', 'Gray Leaf Spot',
]
const STATUSES   = ['suspected', 'confirmed', 'treated', 'monitoring', 'resolved']
const SEVERITIES = ['low', 'moderate', 'high']
const STATUS_CYCLE = ['suspected', 'confirmed', 'treated', 'monitoring', 'resolved']

const todayIso = () => new Date().toISOString().slice(0, 10)
const titleCase = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const fmtDate = iso => {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function LogModal({ onClose }) {
  const [form, setForm] = useState({
    observedAt: todayIso(), diseaseName: '', status: 'suspected', severity: '',
    location: '', hole: '', affectedArea: '', turfSpecies: '', symptoms: '',
    treatmentNotes: '', followUpDate: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const toast = useToast()
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.diseaseName.trim()) { setError('Disease name is required'); return }
    setSaving(true); setError(null)
    try {
      await createDisease({
        observedAt:     `${form.observedAt}T12:00:00.000Z`,
        diseaseName:    form.diseaseName.trim(),
        status:         form.status,
        severity:       form.severity || null,
        location:       form.location.trim() || null,
        hole:           form.hole === '' ? null : Number(form.hole),
        affectedArea:   form.affectedArea.trim() || null,
        turfSpecies:    form.turfSpecies.trim() || null,
        symptoms:       form.symptoms.trim() || null,
        treatmentNotes: form.treatmentNotes.trim() || null,
        followUpDate:   form.followUpDate || null,
        notes:          form.notes.trim() || null,
      })
      toast?.success?.('Observation logged')
      onClose()
    } catch (err) { setError(err.message || 'Save failed'); setSaving(false) }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Log disease observation">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.mHeader}><span className={styles.mTitle}>Log Disease Observation</span><button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button></div>
        <div className={styles.mBody}>
          <p className={styles.lbl}>Disease</p>
          <div className={styles.chips}>
            {COMMON_DISEASES.map(d => (
              <button key={d} type="button" className={styles.chip} data-active={form.diseaseName === d ? 'true' : 'false'} onClick={() => set('diseaseName', d)}>{d}</button>
            ))}
          </div>
          <input ref={ref} className={styles.input} style={{ marginTop: 6 }} value={form.diseaseName} onChange={e => set('diseaseName', e.target.value)} placeholder="Disease name (or pick above)" />

          <div className={styles.row2}>
            <div><p className={styles.lbl}>Observed</p><input type="date" max={todayIso()} className={styles.input} value={form.observedAt} onChange={e => set('observedAt', e.target.value)} /></div>
            <div><p className={styles.lbl}>Status</p>
              <select className={styles.input} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.row3}>
            <div><p className={styles.lbl}>Severity <span className={styles.optional}>(opt)</span></p>
              <select className={styles.input} value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="">—</option>
                {SEVERITIES.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            </div>
            <div><p className={styles.lbl}>Location</p><input className={styles.input} value={form.location} onChange={e => set('location', e.target.value)} placeholder="Green 7" /></div>
            <div><p className={styles.lbl}>Hole</p><input className={styles.input} value={form.hole} onChange={e => set('hole', e.target.value)} placeholder="7" inputMode="numeric" /></div>
          </div>
          <div className={styles.row2}>
            <div><p className={styles.lbl}>Affected area</p><input className={styles.input} value={form.affectedArea} onChange={e => set('affectedArea', e.target.value)} placeholder="approach, low side" /></div>
            <div><p className={styles.lbl}>Turf species</p><input className={styles.input} value={form.turfSpecies} onChange={e => set('turfSpecies', e.target.value)} placeholder="bentgrass" /></div>
          </div>
          <p className={styles.lbl}>Symptoms</p>
          <textarea className={styles.input} rows={2} value={form.symptoms} onChange={e => set('symptoms', e.target.value)} placeholder="small bleached spots, mycelium at dawn…" />
          <p className={styles.lbl}>Treatment notes <span className={styles.optional}>(optional)</span></p>
          <textarea className={styles.input} rows={2} value={form.treatmentNotes} onChange={e => set('treatmentNotes', e.target.value)} placeholder="product, rate, applied…" />
          <p className={styles.lbl}>Follow-up date <span className={styles.optional}>(optional)</span></p>
          <input type="date" className={styles.input} value={form.followUpDate} onChange={e => set('followUpDate', e.target.value)} />
          <p className={styles.lbl}>Notes <span className={styles.optional}>(optional)</span></p>
          <textarea className={styles.input} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.mFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function ObservationsTab() {
  const { observations, loading } = useDisease()
  const [logOpen, setLogOpen] = useState(false)
  const toast = useToast()
  const { can } = useAuth()
  const canDelete = can('canDeleteRecords')

  const { active, monitoring, resolved } = useMemo(() => categorizeObservations(observations), [observations])

  function cycleStatus(o) {
    const idx  = STATUS_CYCLE.indexOf(o.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    patchDisease(o.id, { status: next }).catch(() => {})
  }
  function handleDelete(id) { deleteDisease(id).then(() => toast?.success?.('Deleted')).catch(() => {}) }

  function Row({ o }) {
    return (
      <li className={styles.row}>
        <div className={styles.rowMain}>
          <span className={styles.rowTop}>
            <span className={styles.rowName}>{o.diseaseName}</span>
            <button type="button" className={styles.statusBtn} onClick={() => cycleStatus(o)} title="Tap to advance status">
              <span className={styles.status} data-status={o.status}>{o.status}</span>
            </button>
            {o.severity && <span className={styles.sev} data-sev={o.severity}>{o.severity}</span>}
          </span>
          <span className={styles.rowMeta}>
            {fmtDate(o.observedAt)}
            {o.location ? ` · ${o.location}` : ''}{o.hole != null ? ` · #${o.hole}` : ''}
            {o.turfSpecies ? ` · ${o.turfSpecies}` : ''}
          </span>
          {o.symptoms && <span className={styles.rowSymptoms}>{o.symptoms}</span>}
          {o.followUpDate && <span className={styles.rowFollowUp}>↻ Follow-up {fmtDate(o.followUpDate)}</span>}
        </div>
        {canDelete && (
          <button type="button" className={styles.delBtn} onClick={() => handleDelete(o.id)} aria-label="Delete">✕</button>
        )}
      </li>
    )
  }

  const hasAny = observations.length > 0

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.headTitle}>Disease Observations</span>
        <button type="button" className={styles.logBtn} onClick={() => setLogOpen(true)}>+ Log Observation</button>
      </div>

      {loading && !hasAny ? (
        <p className={styles.empty}>Loading observations…</p>
      ) : !hasAny ? (
        <p className={styles.empty}>
          No disease observations logged yet. Tap <strong>Log Observation</strong> to record what you scout —
          disease, location, severity, symptoms, and treatment. Active concerns, follow-ups, and the disease
          pressure awareness card on the Overview will populate as you log.
        </p>
      ) : (
        <>
          {active.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Active Concerns</p>
              <ul className={styles.list}>{active.map(o => <Row key={o.id} o={o} />)}</ul>
            </div>
          )}
          {monitoring.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Treated / Monitoring</p>
              <ul className={styles.list}>{monitoring.map(o => <Row key={o.id} o={o} />)}</ul>
            </div>
          )}
          {resolved.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Resolved</p>
              <ul className={styles.list}>{resolved.slice(0, 12).map(o => <Row key={o.id} o={o} />)}</ul>
            </div>
          )}
        </>
      )}

      {logOpen && <LogModal onClose={() => setLogOpen(false)} />}
    </div>
  )
}
