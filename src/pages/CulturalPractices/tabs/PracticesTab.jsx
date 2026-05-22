// Cultural Practices — Practices tab (the real D1-backed surface).
//
// Recent + upcoming practices, recovery watch, and a Log Practice quick
// entry. Recovery state is user-set (explainable, never predicted). Real
// persisted data only.

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  useCulturalPractices,
  createCulturalPractice,
  patchCulturalPractice,
  deleteCulturalPractice,
} from '../../../utils/culturalPractices/culturalPracticesStore'
import {
  categorizePractices,
  effectiveRecovery,
  RECOVERY_STATES,
  RECOVERY_LABEL,
} from '../../../utils/culturalPractices/recoveryState'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './PracticesTab.module.css'

const PRACTICE_TYPES = [
  'aerification', 'topdressing', 'verticutting', 'grooming', 'rolling',
  'spiking', 'slicing', 'needle-tine', 'drill-fill', 'fraze-mow',
  'brushing', 'venting', 'sand', 'other',
]
const STATUSES = ['planned', 'completed', 'skipped']
const RECOVERY_COLOR = {
  'not-started': '#7a9e7a', 'in-progress': '#fbbf24', 'recovering': '#38bdf8',
  'recovered': '#4ade80', 'needs-attention': '#ef4444',
}
const todayIso = () => new Date().toISOString().slice(0, 10)
const titleCase = s => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : '')
const fmtDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

function LogModal({ onClose }) {
  const [form, setForm] = useState({
    practiceDate: todayIso(), practiceType: 'aerification', targetArea: '', holes: '',
    status: 'completed', recoveryStatus: '', equipmentUsed: '', materialUsed: '',
    depth: '', tineSpacing: '', sandAmount: '', playabilityImpact: '', recoveryNotes: '', notes: '',
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
    setSaving(true); setError(null)
    try {
      await createCulturalPractice({
        ...form,
        targetArea: form.targetArea.trim() || null,
        recoveryStatus: form.recoveryStatus || null,
      })
      toast?.success?.('Practice logged')
      onClose()
    } catch (err) { setError(err.message || 'Save failed'); setSaving(false) }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Log cultural practice">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.mHeader}><span className={styles.mTitle}>Log Cultural Practice</span><button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button></div>
        <div className={styles.mBody}>
          <p className={styles.lbl}>Practice type</p>
          <div className={styles.chips}>
            {PRACTICE_TYPES.map(t => (
              <button key={t} type="button" className={styles.chip} data-active={form.practiceType === t ? 'true' : 'false'} onClick={() => set('practiceType', t)}>{titleCase(t)}</button>
            ))}
          </div>
          <div className={styles.row2}>
            <div><p className={styles.lbl}>Date</p><input ref={ref} type="date" max={todayIso()} className={styles.input} value={form.practiceDate} onChange={e => set('practiceDate', e.target.value)} /></div>
            <div><p className={styles.lbl}>Status</p>
              <select className={styles.input} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.row2}>
            <div><p className={styles.lbl}>Area</p><input className={styles.input} value={form.targetArea} onChange={e => set('targetArea', e.target.value)} placeholder="e.g. Greens" /></div>
            <div><p className={styles.lbl}>Holes</p><input className={styles.input} value={form.holes} onChange={e => set('holes', e.target.value)} placeholder="e.g. 1-9" /></div>
          </div>
          <p className={styles.lbl}>Recovery status <span className={styles.optional}>(optional)</span></p>
          <select className={styles.input} value={form.recoveryStatus} onChange={e => set('recoveryStatus', e.target.value)}>
            <option value="">— default from status —</option>
            {RECOVERY_STATES.map(r => <option key={r} value={r}>{RECOVERY_LABEL[r]}</option>)}
          </select>
          <div className={styles.row3}>
            <div><p className={styles.lbl}>Equipment</p><input className={styles.input} value={form.equipmentUsed} onChange={e => set('equipmentUsed', e.target.value)} /></div>
            <div><p className={styles.lbl}>Depth</p><input className={styles.input} value={form.depth} onChange={e => set('depth', e.target.value)} placeholder="3 in" /></div>
            <div><p className={styles.lbl}>Tine spacing</p><input className={styles.input} value={form.tineSpacing} onChange={e => set('tineSpacing', e.target.value)} placeholder="2x2" /></div>
          </div>
          <div className={styles.row2}>
            <div><p className={styles.lbl}>Material</p><input className={styles.input} value={form.materialUsed} onChange={e => set('materialUsed', e.target.value)} placeholder="sand, seed…" /></div>
            <div><p className={styles.lbl}>Sand amount</p><input className={styles.input} value={form.sandAmount} onChange={e => set('sandAmount', e.target.value)} placeholder="40 tons" /></div>
          </div>
          <p className={styles.lbl}>Playability impact</p>
          <input className={styles.input} value={form.playabilityImpact} onChange={e => set('playabilityImpact', e.target.value)} placeholder="e.g. bumpy 7-10 days" />
          <p className={styles.lbl}>Recovery / notes</p>
          <textarea className={styles.input} rows={2} value={form.recoveryNotes} onChange={e => set('recoveryNotes', e.target.value)} />
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

function RecoveryBadge({ practice }) {
  const r = effectiveRecovery(practice)
  if (!r) return null
  return <span className={styles.recBadge} style={{ color: RECOVERY_COLOR[r], borderColor: RECOVERY_COLOR[r] }}>{RECOVERY_LABEL[r]}</span>
}

export default function PracticesTab() {
  const { practices, loading } = useCulturalPractices()
  const [logOpen, setLogOpen] = useState(false)
  const toast = useToast()

  const { recentCompleted, upcoming, watch } = useMemo(() => categorizePractices(practices), [practices])

  function cycleRecovery(p) {
    const cur = effectiveRecovery(p)
    const idx = RECOVERY_STATES.indexOf(cur)
    const next = RECOVERY_STATES[(idx + 1) % RECOVERY_STATES.length]
    patchCulturalPractice(p.id, { recoveryStatus: next }).catch(() => {})
  }
  function handleDelete(id) { deleteCulturalPractice(id).then(() => toast?.success?.('Deleted')).catch(() => {}) }

  function Row({ p, showRecovery }) {
    return (
      <li className={styles.row}>
        <div className={styles.rowMain}>
          <span className={styles.rowTop}>
            <span className={styles.rowType}>{titleCase(p.practiceType)}</span>
            <span className={styles.rowStatus} data-status={p.status}>{p.status}</span>
            {showRecovery && (
              <button type="button" className={styles.recBtn} onClick={() => cycleRecovery(p)} title="Tap to advance recovery">
                <RecoveryBadge practice={p} />
              </button>
            )}
          </span>
          <span className={styles.rowMeta}>
            {fmtDate(p.practiceDate)}{p.targetArea ? ` · ${p.targetArea}` : ''}{p.holes ? ` · ${p.holes}` : ''}
            {p.equipmentUsed ? ` · ${p.equipmentUsed}` : ''}
          </span>
          {p.playabilityImpact && <span className={styles.rowImpact}>⛳ {p.playabilityImpact}</span>}
        </div>
        <button type="button" className={styles.delBtn} onClick={() => handleDelete(p.id)} aria-label="Delete">✕</button>
      </li>
    )
  }

  const hasAny = practices.length > 0

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.headTitle}>Cultural Practices</span>
        <button type="button" className={styles.logBtn} onClick={() => setLogOpen(true)}>+ Log Practice</button>
      </div>

      {loading && !hasAny ? (
        <p className={styles.empty}>Loading practices…</p>
      ) : !hasAny ? (
        <p className={styles.empty}>
          No cultural practices logged yet. Tap <strong>Log Practice</strong> to record an aerification,
          topdressing, verticut, rolling, sand application, etc. Recovery status, playability impact, and
          upcoming planned work will appear here as you log them.
        </p>
      ) : (
        <>
          {watch.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Recovery Watch</p>
              <ul className={styles.list}>{watch.map(p => <Row key={p.id} p={p} showRecovery />)}</ul>
            </div>
          )}
          {upcoming.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Upcoming</p>
              <ul className={styles.list}>{upcoming.map(p => <Row key={p.id} p={p} showRecovery={false} />)}</ul>
            </div>
          )}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Recent Completed</p>
            {recentCompleted.length === 0 ? (
              <p className={styles.empty}>No completed practices yet.</p>
            ) : (
              <ul className={styles.list}>{recentCompleted.slice(0, 12).map(p => <Row key={p.id} p={p} showRecovery />)}</ul>
            )}
          </div>
        </>
      )}

      {logOpen && <LogModal onClose={() => setLogOpen(false)} />}
    </div>
  )
}
