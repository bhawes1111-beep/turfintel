import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './AssignmentPhotoViewer.module.css'

export default function AssignmentPhotoViewer({
  attachments = [],
  title = 'Assignment photos',
  onClose,
  onDelete = null,
}) {
  const [index, setIndex] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (attachments.length === 0) return null

  const safeIndex = Math.min(index, attachments.length - 1)
  const current = attachments[safeIndex]
  const hasMultiple = attachments.length > 1

  async function handleDelete() {
    if (!onDelete || !current || deleting) return
    if (!window.confirm('Delete this assignment photo?')) return
    setDeleting(true)
    try {
      await onDelete(current)
      if (attachments.length === 1) onClose?.()
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.viewer}>
        <header className={styles.header}>
          <div>
            <strong>{title}</strong>
            <span>{safeIndex + 1} of {attachments.length}</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </header>

        <div className={styles.imageStage}>
          {hasMultiple && (
            <button
              type="button"
              className={`${styles.navButton} ${styles.previousButton}`}
              onClick={() => setIndex(value => (value - 1 + attachments.length) % attachments.length)}
              aria-label="Previous photo"
            >
              Previous
            </button>
          )}
          <img
            className={styles.image}
            src={current.url}
            alt={current.caption || current.fileName || title}
          />
          {hasMultiple && (
            <button
              type="button"
              className={`${styles.navButton} ${styles.nextButton}`}
              onClick={() => setIndex(value => (value + 1) % attachments.length)}
              aria-label="Next photo"
            >
              Next
            </button>
          )}
        </div>

        <footer className={styles.footer}>
          <span>{current.caption || current.fileName || 'Assignment photo'}</span>
          {onDelete && (
            <button
              type="button"
              className={styles.deleteButton}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete photo'}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
