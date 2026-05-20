// Phase 32 — Mobile Quick Actions.
//
// A compact, mobile-only action row for one-handed field use. Reduces the
// "navigate to a full page to do one thing" friction (audit finding F3/F6).
//
// Actions:
//   - Add Note    → in-place mini modal → createOperationsNote (crew-visible
//                   briefing note; same source the Display Board reads)
//   - Log Issue   → reuses the Phase 31 feedback capture modal
//   - Spray Window→ navigate to /spray
//   - Irrigation  → navigate to /irrigation
//
// Hidden on desktop via CSS (the dashboard already has the full Quick
// Actions card there). No floating button, no clutter.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { createOperationsNote } from '../../utils/operations/notesStore'
import { useToast } from '../../utils/feedback/toastContext'
import LogFeedbackButton from './LogFeedbackButton'
import styles from './MobileQuickActions.module.css'

function AddNoteModal({ onClose }) {
  const [body,   setBody]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const toast = useToast()
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    const trimmed = body.trim()
    if (!trimmed) { setError('Write a quick note first.'); return }
    setSaving(true)
    setError(null)
    try {
      await createOperationsNote({ body: trimmed, priority: 'routine' })
      toast?.success?.('Note added — visible to crew')
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save note.')
      setSaving(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Add note">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Add Note</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>Crew-visible briefing note. Shows on the Display Board.</p>
          <textarea
            ref={ref}
            className={styles.textarea}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="e.g. Cup change before 7am; greens mowed N-S today"
            rows={3}
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function MobileQuickActions() {
  const navigate = useNavigate()
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <div className={styles.bar} role="group" aria-label="Quick actions">
      <button type="button" className={styles.action} onClick={() => setNoteOpen(true)}>
        <span className={styles.icon} aria-hidden="true">📝</span>
        <span className={styles.label}>Add Note</span>
      </button>

      {/* Log Issue reuses the Phase 31 feedback modal; styled to match the row. */}
      <span className={styles.feedbackWrap}>
        <LogFeedbackButton compact />
      </span>

      <button type="button" className={styles.action} onClick={() => navigate('/spray')}>
        <span className={styles.icon} aria-hidden="true">🌿</span>
        <span className={styles.label}>Spray Window</span>
      </button>

      <button type="button" className={styles.action} onClick={() => navigate('/irrigation')}>
        <span className={styles.icon} aria-hidden="true">💧</span>
        <span className={styles.label}>Irrigation</span>
      </button>

      {noteOpen && <AddNoteModal onClose={() => setNoteOpen(false)} />}
    </div>
  )
}
