import { useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import {
  generateIrrigationRecommendations,
  computeIrrigationSummary,
} from '../../utils/weather/irrigationEngine'
import { IRRIGATION_SEVERITY_TOKENS } from '../../utils/intelligence/severity'
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

      {/* Summary stat row */}
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

      {recommendations.length === 0 ? (
        <p className={styles.iiEmpty}>Irrigation conditions favorable. No advisories at this time.</p>
      ) : (
        <>
          <div className={styles.iiList}>
            {recommendations.map(rec => {
              const meta = IRRIGATION_SEVERITY_TOKENS[rec.severity] ?? IRRIGATION_SEVERITY_TOKENS.low
              return (
                <div
                  key={rec.id}
                  className={styles.iiItem}
                  style={{
                    '--ii-color':  meta.color,
                    '--ii-bg':     meta.bg,
                    '--ii-border': meta.border,
                  }}
                >
                  <div className={styles.iiItemLeft}>
                    <span className={styles.iiIcon}>{rec.icon}</span>
                    <span className={styles.iiSeverityLabel} style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>

                  <div className={styles.iiItemBody}>
                    <div className={styles.iiItemTop}>
                      <span className={styles.iiTitle}>{rec.title}</span>
                    </div>
                    <p className={styles.iiMessage}>{rec.message}</p>
                    <p className={styles.iiAction}>→ {rec.recommendation}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

    </div>
  )
}
