import styles from './Upload.module.css'

const STATUS_CONFIG = {
  processed: { label: 'Processed', cls: styles.badgeProcessed, pulse: false },
  pending:   { label: 'Pending',   cls: styles.badgePending,   pulse: false },
  uploading: { label: 'Uploading', cls: styles.badgeUploading, pulse: true  },
  error:     { label: 'Error',     cls: styles.badgeError,     pulse: false },
}

/**
 * Props:
 *   status  — 'processed' | 'pending' | 'uploading' | 'error'
 *   label   — optional override for the displayed text
 */
export default function UploadStatusBadge({ status, label }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span className={`${styles.badge} ${cfg.cls}`}>
      <span className={`${styles.badgeDot} ${cfg.pulse ? styles.pulseDot : ''}`} />
      {label ?? cfg.label}
    </span>
  )
}
