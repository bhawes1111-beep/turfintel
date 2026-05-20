// Phase 31 — Log Feedback button + fast capture modal.
//
// Lightweight, mobile-first friction capture for the live pilot. One tap
// opens a small form: category chips + a note + optional auto-filled
// context (the current route). Posts to the pilot feedback store. No
// ticketing, no required fields beyond the note.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { createFeedback } from '../../utils/feedback/feedbackStore'
import styles from './LogFeedbackButton.module.css'

const CATEGORIES = [
  'bug', 'workflow', 'confusing', 'mobile', 'display-board',
  'assignment', 'spray', 'irrigation', 'weather', 'equipment',
]

const CATEGORY_LABEL = {
  'display-board': 'display board',
}

function FeedbackModal({ onClose, defaultContext }) {
  const [category, setCategory] = useState('workflow')
  const [note,     setNote]     = useState('')
  const [context,  setContext]  = useState(defaultContext ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const textRef = useRef(null)

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    // Autofocus the note so capture is one-tap-to-type on mobile.
    textRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSave() {
    const trimmed = note.trim()
    if (!trimmed) { setError('Add a quick note first.'); return }
    setSaving(true)
    setError(null)
    try {
      await createFeedback({
        category,
        note: trimmed,
        context: context.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save feedback.')
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log feedback"
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Log Feedback</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.fieldLabel}>Category</p>
          <div className={styles.chips}>
            {CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                className={`${styles.chip} ${category === c ? styles.chipActive : ''}`}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABEL[c] ?? c}
              </button>
            ))}
          </div>

          <p className={styles.fieldLabel}>Note</p>
          <textarea
            ref={textRef}
            className={styles.textarea}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What slowed you down / was confusing / saved time?"
            rows={3}
          />

          <p className={styles.fieldLabel}>Context <span className={styles.optional}>(optional)</span></p>
          <input
            type="text"
            className={styles.input}
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Page or screen"
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

export default function LogFeedbackButton({ compact = false }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const context = location?.pathname && location.pathname !== '/'
    ? location.pathname.replace(/^\//, '')
    : 'dashboard'

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.triggerCompact : ''}`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">✎</span> Log Feedback
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} defaultContext={context} />}
    </>
  )
}
