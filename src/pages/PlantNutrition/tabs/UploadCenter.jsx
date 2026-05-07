import { useState } from 'react'
import styles from '../PlantNutrition.module.css'
import { UPLOADED_FILES } from '../../../data/plantNutrition'

const FILE_ICONS = { pdf: '📄', xlsx: '📊' }
const CATEGORIES = ['All', 'Soil Report', 'Tissue Report', 'Water Report', 'Historical Data']

export default function UploadCenter() {
  const [files, setFiles] = useState(UPLOADED_FILES)
  const [categoryFilter, setCategoryFilter] = useState('All')

  function handleRemove(id) {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const visible = categoryFilter === 'All' ? files : files.filter(f => f.category === categoryFilter)

  return (
    <div>
      <div className={styles.uploadZoneRow}>
        <div className={styles.uploadZone} role="button" tabIndex={0}>
          <div className={styles.uploadZoneIcon}>📄</div>
          <div className={styles.uploadZoneTitle}>Upload Lab PDF</div>
          <div className={styles.uploadZoneSubtitle}>Soil, tissue, or water report</div>
          <span className={styles.uploadZoneFormats}>PDF</span>
        </div>
        <div className={styles.uploadZone} role="button" tabIndex={0}>
          <div className={styles.uploadZoneIcon}>📊</div>
          <div className={styles.uploadZoneTitle}>Upload Excel / CSV</div>
          <div className={styles.uploadZoneSubtitle}>Historical data or custom spreadsheet</div>
          <span className={styles.uploadZoneFormats}>XLSX · CSV</span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 18 }}>
        Uploaded reports will be parsed and linked to the relevant tabs automatically. PDF parsing and AI extraction coming in a future update.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: categoryFilter === cat ? 'var(--color-accent)' : 'var(--color-card)',
              color: categoryFilter === cat ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className={styles.fileListHeader}>
        {visible.length} file{visible.length !== 1 ? 's' : ''}
        {categoryFilter !== 'All' ? ` — ${categoryFilter}` : ''}
      </div>

      <div className={styles.fileList}>
        {visible.map(file => (
          <div key={file.id} className={styles.fileCard}>
            <div className={styles.fileIcon}>{FILE_ICONS[file.type] || '📁'}</div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName}>{file.name}</div>
              <div className={styles.fileMeta}>
                {file.category} · {file.area} · {file.lab} · {file.size} · {file.date}
              </div>
            </div>
            <span className={`${styles.fileStatus} ${styles[file.status]}`}>{file.status}</span>
            <button
              onClick={() => handleRemove(file.id)}
              style={{
                fontSize: 14,
                color: 'var(--color-text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 4px',
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Remove file"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {visible.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No files in this category.</p>
      )}
    </div>
  )
}
