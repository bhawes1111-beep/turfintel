import { useState } from 'react'
import SharedDropzone from '../shared/upload/UploadDropzone'
import { saveMedia } from '../../utils/media/mediaStore'
import { ALLOWED_MIME } from '../../utils/media/mediaSchemas'
import styles from './uploads.module.css'

const TYPE_CONFIG = {
  image:    { icon: '📷', label: 'Upload photos',    formats: ['JPG', 'PNG', 'WEBP', 'HEIC'] },
  document: { icon: '📄', label: 'Upload documents', formats: ['PDF'] },
}

/**
 * Media-aware upload dropzone. Wraps the shared UploadDropzone UI primitive
 * and drives the full saveMedia() pipeline including compression and thumbnail.
 *
 * @param {string}    module      - MEDIA_MODULE value ('spray' | 'irrigation' | …)
 * @param {string}    [type]      - 'image' | 'document'  (default 'image')
 * @param {string[]}  [tags]      - Tags applied to every file in this session
 * @param {boolean}   [multiple]  - Allow multi-file selection (default true)
 * @param {Function}  [onSaved]   - Called with the TurfMediaRecord after each save
 * @param {Function}  [onError]   - Called with Error when saveMedia throws
 */
export default function UploadDropzone({
  module,
  type     = 'image',
  tags     = [],
  multiple = true,
  onSaved,
  onError,
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(null)  // { done, total }
  const [errorMsg, setErrorMsg]   = useState(null)

  async function handleFiles(files) {
    if (!files.length) return
    setUploading(true)
    setErrorMsg(null)
    setProgress({ done: 0, total: files.length })

    let done = 0
    for (const file of files) {
      try {
        const record = await saveMedia(file, { type, module, tags })
        done++
        setProgress({ done, total: files.length })
        onSaved?.(record)
      } catch (err) {
        const msg = err?.message ?? 'Upload failed — check file type or available storage.'
        setErrorMsg(msg)
        onError?.(err)
        // Continue processing remaining files even if one fails
      }
    }

    setUploading(false)
    setProgress(null)
  }

  const cfg       = TYPE_CONFIG[type] ?? TYPE_CONFIG.image
  const acceptStr = (ALLOWED_MIME[type] ?? []).join(',')

  const label = uploading && progress
    ? `Saving ${progress.done} of ${progress.total}…`
    : cfg.label

  return (
    <div className={styles.dropzoneWrap}>
      <SharedDropzone
        accept={acceptStr}
        multiple={multiple}
        onFiles={handleFiles}
        disabled={uploading}
        icon={cfg.icon}
        label={label}
        sublabel={uploading ? undefined : 'Click or drag & drop'}
        formats={uploading ? undefined : cfg.formats}
      />
      {errorMsg && (
        <p className={styles.dropzoneError} role="alert">{errorMsg}</p>
      )}
    </div>
  )
}
