import { useState } from 'react'
import styles from '../Disease.module.css'
import { PHOTO_ITEMS } from '../../../data/disease'

export default function PhotoGallery() {
  const [filter, setFilter] = useState('all')

  const issues = [...new Set(PHOTO_ITEMS.map(p => p.issue))]
  const photos = filter === 'all' ? PHOTO_ITEMS : PHOTO_ITEMS.filter(p => p.issue === filter)

  return (
    <div>
      <div
        className={styles.uploadArea}
        onClick={() => {}}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && {}}
      >
        <div className={styles.uploadIcon}>📷</div>
        <div className={styles.uploadTitle}>Upload Disease Photos</div>
        <div className={styles.uploadSubtitle}>Click to browse or drag and drop — JPG, PNG, HEIC supported</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', ...issues].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: filter === f ? 'var(--color-accent)' : 'var(--color-card)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      <div className={styles.photoGrid}>
        {photos.map(photo => (
          <div key={photo.id} className={styles.photoCard}>
            <div
              className={styles.photoThumb}
              style={{
                '--thumb-bg': `hsl(${photo.hue})`,
                '--thumb-spot': `hsla(${photo.hue}, 0.6)`,
              }}
            >
              <span className={styles.photoPlaceholderIcon}>🍃</span>
            </div>
            <div className={styles.photoInfo}>
              <div className={styles.photoIssueName}>{photo.issue}</div>
              <div className={styles.photoMeta}>{photo.area} · {photo.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
