import { useEffect, useState, useCallback } from 'react'
import { getMediaBlob } from '../../utils/media/mediaStore'
import { getFileSizeLabel } from '../../utils/media/mediaUtils'
import styles from './uploads.module.css'

/**
 * Lightbox preview modal for a single media record.
 * - Images: loads the full-resolution blob and displays it in an <img>
 * - Documents: shows a PDF placeholder (preview requires future integration)
 * - Metadata: filename, size, date, module, tags
 * - Delete: calls onDelete then onClose
 *
 * Object URL is created on open and revoked on close or record change.
 *
 * @param {Object|null} record    - TurfMediaRecord to preview, or null (modal hidden)
 * @param {Function}    onClose   - Called when backdrop, ✕ button, or Escape is pressed
 * @param {Function}    [onDelete]- Called with record.id when delete is confirmed
 */
export default function UploadPreviewModal({ record, onClose, onDelete }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loadingImg, setLoadingImg] = useState(false)

  // Load full-resolution blob when an image record is shown.
  // Revoke when the modal closes or the record changes.
  useEffect(() => {
    if (!record || record.type !== 'image') {
      setImageUrl(null)
      return
    }

    let objectUrl = null
    let cancelled = false
    setLoadingImg(true)

    getMediaBlob(record.id)
      .then(blob => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      })
      .catch(() => { /* blob missing — loading indicator stays */ })
      .finally(() => { if (!cancelled) setLoadingImg(false) })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setImageUrl(null)
    }
  }, [record])

  // Close on Escape key
  const handleKeyDown = useCallback(
    e => { if (e.key === 'Escape') onClose?.() },
    [onClose],
  )

  useEffect(() => {
    if (!record) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [record, handleKeyDown])

  if (!record) return null

  function handleDelete() {
    onDelete?.(record.id)
    onClose?.()
  }

  const dateStr = new Date(record.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div
      className={styles.modalOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${record.filename}`}
    >
      <div
        className={styles.modalPanel}
        onClick={e => e.stopPropagation()}
      >
        <button
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close preview"
        >
          ✕
        </button>

        {/* ── Preview area ─────────────────────────────────────────────── */}
        <div className={styles.modalPreview}>
          {record.type === 'image' ? (
            imageUrl
              ? <img src={imageUrl} alt={record.filename} className={styles.modalImage} />
              : <p className={styles.modalLoading}>{loadingImg ? 'Loading…' : 'Image unavailable'}</p>
          ) : (
            <div className={styles.modalPdfPlaceholder}>
              <span>📄</span>
              <p>PDF preview not yet supported</p>
            </div>
          )}
        </div>

        {/* ── Metadata strip ────────────────────────────────────────────── */}
        <div className={styles.modalMeta}>
          <p className={styles.modalFilename} title={record.filename}>
            {record.filename}
          </p>

          <div className={styles.modalMetaRow}>
            <span className={styles.modalMetaItem}>{getFileSizeLabel(record.size)}</span>
            <span className={styles.modalMetaItem}>{dateStr}</span>
            {record.module && (
              <span className={styles.modalMetaItem}>{record.module}</span>
            )}
          </div>

          {record.tags?.length > 0 && (
            <div className={styles.modalTags}>
              {record.tags.map(tag => (
                <span key={tag} className={styles.modalTag}>{tag}</span>
              ))}
            </div>
          )}

          <button className={styles.modalDeleteBtn} onClick={handleDelete}>
            Delete file
          </button>
        </div>
      </div>
    </div>
  )
}
