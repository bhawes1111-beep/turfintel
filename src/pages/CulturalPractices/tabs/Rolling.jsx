import styles from '../CulturalPractices.module.css'
import { ROLLING_LOG, ROLLING_SUMMARY } from '../../../data/culturalPractices'
import { EmptyState } from '../../../components/shared/EmptyState'

const AREAS = ['greens', 'tees', 'fairways']
const AREA_LABELS = { greens: 'Greens', tees: 'Tees', fairways: 'Fairways' }

export default function Rolling() {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div className={styles.sectionTitle}>Month-to-Date Summary</div>
        <div className={styles.rollingSummaryGrid}>
          {AREAS.map(area => {
            const m = ROLLING_SUMMARY.currentMonth[area]
            const y = ROLLING_SUMMARY.ytd[area]
            return (
              <div key={area} className={styles.summaryCard}>
                <div className={styles.summaryCardTitle}>{AREA_LABELS[area]}</div>
                <div className={styles.summaryRow}>
                  <span>This Month</span>
                  <strong>{m.total}</strong>
                </div>
                <div className={styles.summaryRow}>
                  <span>Double Roll</span>
                  <span className={`${styles.rollTypeBadge} ${styles.double}`}>{m.double}×</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Single Roll</span>
                  <span className={`${styles.rollTypeBadge} ${styles.single}`}>{m.single}×</span>
                </div>
                <div className={styles.summaryRow} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                  <span>YTD Total</span>
                  <strong>{y.total}</strong>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.sectionTitle}>Recent Rolling Log</div>
      {ROLLING_LOG.length === 0 ? (
        <EmptyState
          title="No rolling sessions logged."
          description="Recent rolling activity across greens, tees, and fairways will appear here."
        />
      ) : (
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.rollingTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Area</th>
              <th>Type</th>
              <th>Equipment</th>
              <th>Operator</th>
              <th>Speed</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {ROLLING_LOG.map(row => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.area}</td>
                <td>
                  <span className={`${styles.rollTypeBadge} ${styles[row.type]}`}>
                    {row.type}
                  </span>
                </td>
                <td>{row.equipment}</td>
                <td>{row.operator}</td>
                <td>{row.speed}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{row.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
