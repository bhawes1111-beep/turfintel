/**
 * FeedbackReviewSection — Phase 31 pilot feedback triage.
 *
 * Simple review surface: list captured feedback (newest first), filter by
 * status, change status (new → reviewed → fixed / ignored), delete. No
 * editing of the note itself — this is triage, not authoring.
 */

import { useMemo, useState } from 'react'
import {
  usePilotFeedback,
  patchFeedback,
  deleteFeedback,
} from '../../../utils/feedback/feedbackStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import settings from '../Settings.module.css'
import styles from './FeedbackReviewSection.module.css'

const STATUSES = ['new', 'reviewed', 'fixed', 'ignored']
const STATUS_FILTERS = ['all', ...STATUSES]

const CATEGORY_LABEL = { 'display-board': 'display board' }

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function FeedbackReviewSection() {
  const { feedback, loading, error } = usePilotFeedback()
  const [filter, setFilter] = useState('all')

  const visible = useMemo(
    () => (filter === 'all' ? feedback : feedback.filter(f => f.status === filter)),
    [feedback, filter],
  )

  const counts = useMemo(() => {
    const c = { all: feedback.length }
    for (const s of STATUSES) c[s] = feedback.filter(f => f.status === s).length
    return c
  }, [feedback])

  function handleStatus(id, status) {
    patchFeedback(id, { status }).catch(() => {})
  }

  function handleDelete(id) {
    deleteFeedback(id).catch(() => {})
  }

  return (
    <div className={settings.card}>
      <div className={settings.cardHeader}>
        <p className={settings.cardTitle}>Pilot Feedback</p>
      </div>
      <p className={settings.cardDesc}>
        Friction notes captured during the live pilot. Triage by status — this is
        internal only and scoped to the active course.
      </p>

      <div className={styles.filterRow}>
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            type="button"
            className={`${styles.filterChip} ${filter === s ? styles.filterChipActive : ''}`}
            onClick={() => setFilter(s)}
          >
            {s} <span className={styles.filterCount}>{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p className={styles.error}>Could not load feedback: {error}</p>}

      {loading && feedback.length === 0 ? (
        <p className={styles.muted}>Loading feedback…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          title={filter === 'all' ? 'No feedback captured yet.' : `No ${filter} feedback.`}
          description="Use the Log Feedback button on the dashboard during the pilot."
        />
      ) : (
        <ul className={styles.list}>
          {visible.map(f => (
            <li key={f.id} className={styles.item} data-status={f.status}>
              <div className={styles.itemHead}>
                <span className={styles.category}>{CATEGORY_LABEL[f.category] ?? f.category}</span>
                <span className={styles.date}>{fmtDate(f.createdAt)}</span>
              </div>
              <p className={styles.note}>{f.note}</p>
              {f.context && <p className={styles.context}>@ {f.context}</p>}
              <div className={styles.actions}>
                <select
                  className={styles.statusSelect}
                  value={f.status}
                  onChange={e => handleStatus(f.id, e.target.value)}
                  aria-label="Change status"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(f.id)}
                  aria-label="Delete feedback"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
