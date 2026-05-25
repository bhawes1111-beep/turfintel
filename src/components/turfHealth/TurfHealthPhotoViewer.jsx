// Phase 7B.1 — Turf Health photo lightbox.
//
// Shape-port of MoisturePhotoViewer with turf-health store helpers and the
// canEditTurfHealth permission. Shares MoisturePhotoViewer.module.css for
// the chrome — Commit 7 (deferred) will deduplicate this into a single
// generalized PhotoViewer component.

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../utils/feedback/toastContext'
import {
  deleteTurfHealthAttachment,
  addPhotoToObservation,
} from '../../utils/turfHealth/turfHealthStore'
import { openPhotoPicker } from '../../utils/media/pickPhoto'
import styles from '../moisture/MoisturePhotoViewer.module.css'

/**
 * @param {Object|null} observation  - the turf health row whose photos to show
 * @param {Object[]}    attachments  - the row's attachments (from byParent.get(o.id))
 * @param {Function}    onClose      - dismiss the viewer
 */
export default function TurfHealthPhotoViewer({ observation, attachments, onClose }) {
  const [index, setIndex]       = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding]     = useState(false)
  const { can } = useAuth()
  const toast   = useToast()

  // Same permission floor as the FAB + capture sheet + row chip.
  const canEdit = can('canEditTurfHealth')

  useEffect(() => { setIndex(0) }, [observation?.id])

  // Auto-close once the last photo is deleted.
  useEffect(() => {
    if (!observation) return
    if (!attachments || attachments.length === 0) onClose?.()
  }, [observation, attachments, onClose])

  // Clamp index if a deletion reduces the count below the cursor.
  useEffect(() => {
    if (attachments && index >= attachments.length && attachments.length > 0) {
      setIndex(attachments.length - 1)
    }
  }, [attachments, index])

  // Esc → close; ← → → prev/next when N > 1.
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
    if (!canEdit) return
    if (!window.confirm('Delete this photo? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteTurfHealthAttachment(current.id, observation.id)
      toast?.success?.('Photo deleted', 2000)
    } catch (err) {
      toast?.error?.(`Delete failed: ${err.message ?? err}`)
    } finally {
      setDeleting(false)
    }
  }

  // "+ Add another" attaches a new photo to this row. Cache hand-merge
  // prepends (newest-first), so jump cursor to 0 so the user sees what
  // they just shot.
  function handleAddAnother() {
    if (!canEdit || !observation) return
    setAdding(true)
    openPhotoPicker(async (file) => {
      try {
        await addPhotoToObservation(observation.id, file)
        setIndex(0)
      } catch (err) {
        toast?.error?.(`Photo upload failed: ${err.message ?? err}`)
      } finally {
        setAdding(false)
      }
    })
    // Cancel-safe — if the user cancels the picker we never get onFile;
    // clear the disabled state once focus returns to the window.
    const reset = () => {
      setAdding(false)
      window.removeEventListener('focus', reset)
    }
    setTimeout(() => window.addEventListener('focus', reset), 300)
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
              >‹</button>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navNext}`}
                onClick={() => setIndex(i => (i + 1) % count)}
                aria-label="Next photo"
              >›</button>
            </>
          )}
        </div>

        <div className={styles.footer}>
          {canEdit ? (
            <>
              <button
                type="button"
                className={styles.addBtn}
                onClick={handleAddAnother}
                disabled={adding || deleting}
              >
                {adding ? 'Uploading…' : '+ Add another'}
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={handleDelete}
                disabled={deleting || adding}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : (
            <span className={styles.viewOnly}>View only</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
