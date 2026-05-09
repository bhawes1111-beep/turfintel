import { useEffect, useState } from 'react'
import { getMediaByModule, deleteMedia } from '../../utils/media/mediaStore'
import { MODULE_LABELS } from '../../utils/intelligence/types'
import UploadDropzone from './UploadDropzone'
import UploadGallery from './UploadGallery'
import UploadPreviewModal from './UploadPreviewModal'
import styles from './uploads.module.css'

/**
 * Full-featured, self-contained upload manager for a single module.
 * Loads persisted media records from IndexedDB on mount, accepts new uploads
 * via the media-aware dropzone, and coordinates the gallery and preview modal.
 *
 * Usage:
 *   <UploadCenter module="spray" />
 *   <UploadCenter module="irrigation" type="document" />
 *
 * @param {string}  module       - MEDIA_MODULE value — determines which records are loaded
 * @param {string}  [type]       - 'image' | 'document'  (default 'image')
 * @param {string[]} [tags]      - Tags applied to all new uploads in this instance
 */
export default function UploadCenter({ module, type = 'image', tags = [], title }) {
  const [records, setRecords]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [previewRecord, setPreview]   = useState(null)

  // Load existing records for this module on mount
  useEffect(() => {
    let cancelled = false

    getMediaByModule(module)
      .then(recs => { if (!cancelled) setRecords(recs) })
      .catch(() => { if (!cancelled) setRecords([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [module])

  // Prepend newly saved record (already carries live object URLs from saveMedia)
  function handleSaved(record) {
    setRecords(prev => [record, ...prev])
  }

  // Remove from IDB and local state; close modal if the deleted record was open
  async function handleDelete(id) {
    try {
      await deleteMedia(id)
    } catch {
      // IDB delete failed — still remove from local state to keep UI consistent
    }
    setRecords(prev => prev.filter(r => r.id !== id))
    if (previewRecord?.id === id) setPreview(null)
  }

  const moduleLabel = title ?? MODULE_LABELS[module] ?? module

  return (
    <div className={styles.centerWrap}>

      <div className={styles.centerHeader}>
        <h3 className={styles.centerTitle}>{moduleLabel} Uploads</h3>
        <span className={styles.centerCount}>
          {records.length} file{records.length !== 1 ? 's' : ''}
        </span>
      </div>

      <UploadDropzone
        module={module}
        type={type}
        tags={tags}
        multiple
        onSaved={handleSaved}
      />

      {loading ? (
        <p className={styles.centerLoading}>Loading…</p>
      ) : (
        <UploadGallery
          records={records}
          onDelete={handleDelete}
          onPreview={setPreview}
        />
      )}

      <UploadPreviewModal
        record={previewRecord}
        onClose={() => setPreview(null)}
        onDelete={handleDelete}
      />

    </div>
  )
}
