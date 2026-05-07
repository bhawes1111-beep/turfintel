import styles from '../CulturalPractices.module.css'
import { CP_REPORTS } from '../../../data/culturalPractices'

export default function CPReports() {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Export cultural practice logs for documentation, agronomist review, or compliance records.
      </p>
      <div className={styles.reportsGrid}>
        {CP_REPORTS.map(r => (
          <div key={r.id} className={styles.reportCard}>
            <div className={styles.reportIcon}>{r.icon}</div>
            <div className={styles.reportName}>{r.name}</div>
            <div className={styles.reportDesc}>{r.desc}</div>
            <div className={styles.reportActions}>
              {r.formats.map((fmt, i) => (
                <button
                  key={fmt}
                  className={`${styles.exportBtn} ${i === 0 ? styles.primary : ''}`}
                  onClick={() => {}}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
