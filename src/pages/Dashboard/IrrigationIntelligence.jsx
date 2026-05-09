import { useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import {
  generateIrrigationRecommendations,
  computeIrrigationSummary,
} from '../../utils/weather/irrigationEngine'
import { IRRIGATION_SEVERITY_TOKENS } from '../../utils/intelligence/severity'
import RecommendationList from '../../components/intelligence/RecommendationList'
import styles from './IrrigationIntelligence.module.css'

export default function IrrigationIntelligence() {
  const { current, forecast, loading } = useWeather()

  const recommendations = useMemo(
    () => generateIrrigationRecommendations(current, forecast),
    [current, forecast]
  )

  const summary = useMemo(
    () => computeIrrigationSummary(current, forecast),
    [current, forecast]
  )

  if (loading) {
    return <p className={styles.iiEmpty}>Loading irrigation data…</p>
  }

  return (
    <div className={styles.iiWrap}>

      {/* Summary stat row — component-specific, not shared */}
      <div className={styles.iiSummary}>
        <div className={styles.iiStat}>
          <span className={styles.iiStatValue}>{summary.etToday.toFixed(2)}"</span>
          <span className={styles.iiStatLabel}>ET Today</span>
        </div>
        <div className={styles.iiStatDivider} />
        <div className={styles.iiStat}>
          <span className={`${styles.iiStatValue} ${summary.weeklyNetNeed >= 1.0 ? styles.iiStatAlert : ''}`}>
            {summary.weeklyNetNeed.toFixed(2)}"
          </span>
          <span className={styles.iiStatLabel}>7-Day Net Need</span>
        </div>
        <div className={styles.iiStatDivider} />
        <div className={styles.iiStat}>
          <span className={styles.iiStatValue}>{summary.rainOffset.toFixed(2)}"</span>
          <span className={styles.iiStatLabel}>Rain (24h)</span>
        </div>
        <div className={styles.iiStatDivider} />
        <div className={styles.iiStat}>
          <span className={`${styles.iiStatValue} ${summary.recApplication > 0 ? styles.iiStatRec : styles.iiStatGood}`}>
            {summary.recApplication > 0 ? `${summary.recApplication.toFixed(2)}"` : 'Skip'}
          </span>
          <span className={styles.iiStatLabel}>Rec. Tonight</span>
        </div>
      </div>

      <RecommendationList
        recommendations={recommendations}
        tokens={IRRIGATION_SEVERITY_TOKENS}
        emptyText="Irrigation conditions favorable. No advisories at this time."
      />

    </div>
  )
}
