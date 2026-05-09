import { useEffect, useState } from 'react'
import { getThumbnailBlob } from '../../utils/media/mediaStore'
import { getFileSizeLabel } from '../../utils/media/mediaUtils'
import styles from './uploads.module.css'

// ── ImageThumb ─────────────────────────────────────────────────────────────────
// Loads the thumbnail blob for a media record and creates a session-ephemeral
// object URL. Revokes the URL when the component unmounts or the id changes.

function ImageThumb({ id, filename }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false

    getThumbnailBlob(id)
      .then(blob => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => { /* thumbnail missing — placeholder shown */ })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

  if (url) {
    return <img src={url} alt={filename} className={styles.galleryThumbImg} />
  }
  return <span className={styles.galleryThumbPlaceholder}>🖼</span>
}

// ── UploadGallery ──────────────────────────────────────────────────────────────

/**
 * Renders persisted media records split into an image grid and a document list.
 *
 * @param {Object[]}  records    - Array of TurfMediaRecord objects (from IDB, no live URLs)
 * @param {Function}  [onDelete] - Called with record id when delete is confirmed
 * @param {Function}  [onPreview]- Called with the full record when a card is clicked
 */
export default function UploadGallery({ records, onDelete, onPreview }) {
  const images = records.filter(r => r.type === 'image')
  const docs   = records.filter(r => r.type === 'document')

  if (records.length === 0) {
    return <p className={styles.galleryEmpty}>No files uploaded yet.</p>
  }

  return (
    <div className={styles.galleryWrap}>

      {images.length > 0 && (
        <section>
          <h4 className={styles.gallerySectionTitle}>
            Photos ({images.length})
          </h4>
          <div className={styles.galleryGrid}>
            {images.map(rec => (
              <div
                key={rec.id}
                className={styles.galleryCard}
                onClick={() => onPreview?.(rec)}
                role="button"
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onPreview?.(rec)}
                aria-label={`Preview ${rec.filename}`}
              >
                <div className={styles.galleryThumb}>
                  <ImageThumb id={rec.id} filename={rec.filename} />
                </div>
                <div className={styles.galleryMeta}>
                  <span className={styles.galleryFilename} title={rec.filename}>
                    {rec.filename}
                  </span>
                  <span className={styles.galleryDetail}>
                    {getFileSizeLabel(rec.size)}
                  </span>
                </div>
                <button
                  className={styles.galleryDelete}
                  onClick={e => { e.stopPropagation(); onDelete?.(rec.id) }}
                  aria-label={`Delete ${rec.filename}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {docs.length > 0 && (
        <section>
          <h4 className={styles.gallerySectionTitle}>
            Documents ({docs.length})
          </h4>
          <div className={styles.docList}>
            {docs.map(rec => (
              <div key={rec.id} className={styles.docCard}>
                <span className={styles.docIcon}>📄</span>
                <div className={styles.docInfo}>
                  <span className={styles.galleryFilename} title={rec.filename}>
                    {rec.filename}
                  </span>
                  <span className={styles.galleryDetail}>
                    {getFileSizeLabel(rec.size)}
                    {' · '}
                    {new Date(rec.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className={styles.docDelete}
                  onClick={() => onDelete?.(rec.id)}
                  aria-label={`Delete ${rec.filename}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
