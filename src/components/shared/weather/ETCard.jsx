import styles from './Weather.module.css'
import { PLACEHOLDER_CURRENT, PLACEHOLDER_ET_TREND } from './weatherTokens'
import { useSavannahEt, ET_SOURCE_LABEL } from '../../../utils/weather/etSourceStore'

/**
 * ET rate + 7-day trend bar chart card.
 *
 * Props:
 *   current — current conditions object (uses etRate, etDeficit)
 *   trend   — array of { day, date, et } (7 entries)
 *
 * ET source: when a Savannah reference ET is entered (Settings → Weather &
 * Data), it overrides the locally-estimated etRate and the card attributes
 * it to the Georgia Weather Network. Otherwise the local estimate is shown
 * and labeled as estimated.
 */
export default function ETCard({
  current = PLACEHOLDER_CURRENT,
  trend   = PLACEHOLDER_ET_TREND,
}) {
  const { value: savannahEt } = useSavannahEt()
  const maxEt = Math.max(...trend.map(d => d.et), 0.01)

  const usingReference = savannahEt != null
  const etToday = usingReference ? savannahEt : Number(current.etRate)
  const sourceText = usingReference
    ? `ET Source: ${ET_SOURCE_LABEL}`
    : 'ET Source: estimated from live conditions'

  return (
    <div className={styles.etCard}>

      <div className={styles.etHeader}>
        <div>
          <div className={styles.etRateValue}>{Number(etToday).toFixed(2)}"</div>
          <div className={styles.etRateLabel}>ET Rate Today</div>
        </div>
        <div className={styles.etDeficit}>
          <div className={styles.etDeficitValue}>{Number(current.etDeficit).toFixed(2)}"</div>
          <div className={styles.etRateLabel}>ET Deficit</div>
        </div>
      </div>

      <div className={styles.etSourceLine}>{sourceText}</div>

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
