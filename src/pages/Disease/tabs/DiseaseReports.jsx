import styles from '../Disease.module.css'

const REPORTS = [
  {
    id: 1,
    icon: '📋',
    name: 'Active Issues Summary',
    desc: 'Current disease pressure across all areas — severity breakdown, affected turf, and recommended actions.',
    formats: ['PDF', 'CSV'],
  },
  {
    id: 2,
    icon: '📅',
    name: 'Monthly Disease Log',
    desc: 'All disease observations and treatment applications for the current month, sorted by date.',
    formats: ['PDF', 'CSV'],
  },
  {
    id: 3,
    icon: '📈',
    name: 'Seasonal Trend Report',
    desc: 'Disease occurrence trends across the season — compare year-over-year incidence and spray frequency.',
    formats: ['PDF'],
  },
  {
    id: 4,
    icon: '🗺',
    name: 'Course Map Export',
    desc: 'Printable overhead course map with disease pin locations, severities, and area labels.',
    formats: ['PDF'],
  },
  {
    id: 5,
    icon: '💊',
    name: 'Fungicide Usage Report',
    desc: 'Products applied per disease type — rates, application dates, and efficacy notes.',
    formats: ['PDF', 'CSV'],
  },
  {
    id: 6,
    icon: '📷',
    name: 'Photo Documentation Export',
    desc: 'All attached photos organized by disease type and area, suitable for record-keeping.',
    formats: ['PDF'],
  },
]

export default function DiseaseReports() {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Export disease records for documentation, compliance, or agronomist review.
      </p>
      <div className={styles.reportsGrid}>
        {REPORTS.map(r => (
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
