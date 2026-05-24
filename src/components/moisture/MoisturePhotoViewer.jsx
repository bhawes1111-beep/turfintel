// Phase 7A.5 — Moisture photo lightbox.
//
// Opens from a tap on a photo chip in MoistureOverview. Renders the
// attachment(s) for a single moisture observation full-size. Supports
// multi-photo navigation when N > 1. Delete is gated on canEditMoisture
// and confirms before firing. Auto-closes after the last photo is deleted.
//
// Image bytes stream from /api/attachments/:id/file with 1h edge cache,
// so re-opens are fast. We render straight from att.url — no per-image
// blob fetch, no IDB indirection.

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../utils/feedback/toastContext'
import { deleteMoistureAttachment } from '../../utils/moisture/moistureStore'
import styles from './MoisturePhotoViewer.module.css'

/**
 * @param {Object|null} observation  - the moisture row whose photos to show
 * @param {Object[]}    attachments  - the row's attachments (from byParent.get(o.id))
 * @param {Function}    onClose      - dismiss the viewer
 */
export default function MoisturePhotoViewer({ observation, attachments, onClose }) {
  const [index, setIndex]     = useState(0)
  const [deleting, setDeleting] = useState(false)
  const { can } = useAuth()
  const toast   = useToast()

  const canDelete = can('canEditMoisture')

  // Reset index when the observation changes (open viewer for a different row).
  useEffect(() => { setIndex(0) }, [observation?.id])

  // Auto-close once the last photo is deleted. The parent removes the row's
  // chip on the same cache update; we just need to dismiss here.
  useEffect(() => {
    if (!observation) return
    if (!attachments || attachments.length === 0) onClose?.()
  }, [observation, attachments, onClose])

  // Clamp index if a deletion reduces the count below the current cursor.
  useEffect(() => {
    if (attachments && index >= attachments.length && attachments.length > 0) {
      setIndex(attachments.length - 1)
    }
  }, [attachments, index])

  // Esc → close; ←/→ → prev/next when N > 1.
  const handleKey = useCallback(e => {
    if (e.key === 'Escape')    onClose?.()
    if (!attachments || attachments.length < 2) return
    if (e.key === 'ArrowLeft')  setIndex(i => (i - 1 + attachments.length) % attachments.length)
    if (e.key === 'ArrowRight') setIndex(i => (i + 1) % attachments.length)
  }, [attachments, onClose])

  useEffect(() => {
    if (!observation) return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [observation, handleKey])

  if (!observation || !attachments || attachments.length === 0) return null

  const current = attachments[index]
  if (!current) return null
  const count = attachments.length

  async function handleDelete() {
    if (!canDelete) return
    // Existing pattern from DailyBriefingPanel — single confirm dialog,
    // wording calls out irreversibility because the Worker hard-deletes R2.
    if (!window.confirm('Delete this photo? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteMoistureAttachment(current.id, observation.id)
      toast?.success?.('Photo deleted', 2000)
      // The auto-close effect above will dismiss us if attachments hit 0.
      // Otherwise the index-clamp effect picks the right neighbor.
    } catch (err) {
      toast?.error?.(`Delete failed: ${err.message ?? err}`)
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Photos for ${observation.location}`}
    >
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>{observation.location}</span>
            {count > 1 && (
              <span className={styles.headerCount}>{index + 1} / {count}</span>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close photo viewer"
          >
            ✕
          </button>
        </div>

        <div className={styles.imageWrap}>
          {/* Native browser zoom (pinch / double-tap) covers detail inspection;
              no custom zoom layer. */}
          <img
            src={current.url}
            alt={current.fileName ?? `Photo of ${observation.location}`}
            className={styles.image}
          />
          {count > 1 && (
            <>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navPrev}`}
                onClick={() => setIndex(i => (i - 1 + count) % count)}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navNext}`}
                onClick={() => setIndex(i => (i + 1) % count)}
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
        </div>

        {/* Bottom action bar — explicit delete placement (not overlay) so
            an accidental tap near the image edge doesn't fire delete. */}
        <div className={styles.footer}>
          {canDelete ? (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : (
            // read_only and crew never see delete — keep the bar present
            // so the layout doesn't jump for non-edit users.
            <span className={styles.viewOnly}>View only</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
