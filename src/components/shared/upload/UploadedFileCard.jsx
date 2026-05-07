import styles from './Upload.module.css'
import UploadStatusBadge from './UploadStatusBadge'

const FILE_ICONS = {
  pdf:  '📄',
  xlsx: '📊',
  xls:  '📊',
  csv:  '📋',
  jpg:  '🖼',
  jpeg: '🖼',
  png:  '🖼',
  heic: '🖼',
  heif: '🖼',
  webp: '🖼',
}

function extOf(name) {
  return name.split('.').pop().toLowerCase()
}

/**
 * Props:
 *   file      — { id, name, size, date, status, category?, area?, progress? }
 *   onRemove  — (id) => void   optional
 *   actions   — optional ReactNode rendered after the status badge (e.g. a View button)
 */
export default function UploadedFileCard({ file, onRemove, actions }) {
  const ext  = extOf(file.name)
  const icon = FILE_ICONS[ext] ?? '📁'
  const showProgress = file.status === 'uploading' && typeof file.progress === 'number'

  const metaParts = [
    file.category,
    file.area,
    file.size,
    file.date,
  ].filter(Boolean)

  return (
    <div className={styles.fileCard}>
      <div className={styles.fileIconWrap}>{icon}</div>

      <div className={styles.fileInfo}>
        <div className={styles.fileName} title={file.name}>{file.name}</div>

        {metaParts.length > 0 && (
          <div className={styles.fileMeta}>
            {metaParts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span className={styles.fileMetaDot}>·</span>}
                {part}
              </span>
            ))}
          </div>
        )}

        {showProgress && (
          <div className={styles.fileProgress}>
            <div
              className={styles.fileProgressFill}
              style={{ width: `${Math.min(100, file.progress)}%` }}
            />
          </div>
        )}
      </div>

      <div className={styles.fileActions}>
        <UploadStatusBadge status={file.status} />
        {actions}
        {onRemove && (
          <button
            className={styles.removeBtn}
            onClick={() => onRemove(file.id)}
            aria-label={`Remove ${file.name}`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
