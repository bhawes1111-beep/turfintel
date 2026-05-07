import styles from './Weather.module.css'
import { PLACEHOLDER_CURRENT, PLACEHOLDER_ET_TREND } from './weatherTokens'

/**
 * ET rate + 7-day trend bar chart card.
 *
 * Props:
 *   current — current conditions object (uses etRate, etDeficit)
 *   trend   — array of { day, date, et } (7 entries)
 */
export default function ETCard({
  current = PLACEHOLDER_CURRENT,
  trend   = PLACEHOLDER_ET_TREND,
}) {
  const maxEt = Math.max(...trend.map(d => d.et), 0.01)

  return (
    <div className={styles.etCard}>

      <div className={styles.etHeader}>
        <div>
          <div className={styles.etRateValue}>{Number(current.etRate).toFixed(2)}"</div>
          <div className={styles.etRateLabel}>ET Rate Today</div>
        </div>
        <div className={styles.etDeficit}>
          <div className={styles.etDeficitValue}>{Number(current.etDeficit).toFixed(2)}"</div>
          <div className={styles.etRateLabel}>ET Deficit</div>
        </div>
      </div>

      <div className={styles.etTrendHeading}>7-Day ET Trend</div>

      <div className={styles.etTrend}>
        {trend.map(day => {
          const pct = (day.et / maxEt) * 100
          return (
            <div key={day.day} className={styles.etTrendItem}>
              <div className={styles.etTrendValue}>{day.et.toFixed(2)}</div>
              <div className={styles.etTrendBarTrack}>
                <div className={styles.etTrendBarFill} style={{ height: `${pct}%` }} />
              </div>
              <div className={styles.etTrendDay}>{day.day}</div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
