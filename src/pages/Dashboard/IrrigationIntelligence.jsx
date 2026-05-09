import { useState, useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import { useOperations } from '../../utils/operations/OperationsContext'
import { createAlert } from '../../utils/operations/actions'
import {
  generateIrrigationRecommendations,
  computeIrrigationSummary,
} from '../../utils/weather/irrigationEngine'
import styles from './IrrigationIntelligence.module.css'

const SEVERITY_META = {
  high:   { label: 'High',   color: '#3a8ad4', bg: 'rgba(58,138,212,0.10)', border: 'rgba(58,138,212,0.28)' },
  medium: { label: 'Medium', color: '#4a9e4a', bg: 'rgba(74,158,74,0.10)',  border: 'rgba(74,158,74,0.28)'  },
  low:    { label: 'Low',    color: '#7a9e7a', bg: 'rgba(74,158,74,0.06)',  border: 'rgba(74,158,74,0.18)'  },
}

export default function IrrigationIntelligence() {
  const { current, forecast, loading } = useWeather()
  const { dispatch }                   = useOperations()
  const [pushed, setPushed]            = useState(new Set())

  const recommendations = useMemo(
    () => generateIrrigationRecommendations(current, forecast),
    [current, forecast]
  )

  const summary = useMemo(
    () => computeIrrigationSummary(current, forecast),
    [current, forecast]
  )

  function pushToAlerts(rec) {
    if (pushed.has(rec.id)) return
    dispatch(createAlert({
      title:       rec.title,
      message:     `${rec.message} ${rec.recommendedAction}`,
      module:      'irrigation',
      priority:    rec.severity,
      actionLabel: 'Irrigation',
      sourceId:    rec.id,
    }))
    setPushed(prev => new Set([...prev, rec.id]))
  }

  function pushAllHigh() {
    recommendations
      .filter(r => r.severity === 'high' && !pushed.has(r.id))
      .forEach(pushToAlerts)
  }

  const highUnpushed = recommendations.filter(r => r.severity === 'high' && !pushed.has(r.id)).length

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
              const meta     = SEVERITY_META[rec.severity] ?? SEVERITY_META.low
              const isPushed = pushed.has(rec.id)
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
                    <p className={styles.iiAction}>→ {rec.recommendedAction}</p>
                  </div>

                  <button
                    className={`${styles.iiPushBtn} ${isPushed ? styles.iiPushBtnDone : ''}`}
                    onClick={() => pushToAlerts(rec)}
                    disabled={isPushed}
                    title={isPushed ? 'Added to alerts' : 'Push to Operations Alerts'}
                  >
                    {isPushed ? '✓ Added' : '+ Alert'}
                  </button>
                </div>
              )
            })}
          </div>

          {highUnpushed > 0 && (
            <div className={styles.iiFooter}>
              <button className={styles.iiPushAllBtn} onClick={pushAllHigh}>
                Push {highUnpushed} High-Priority Alert{highUnpushed !== 1 ? 's' : ''} →
              </button>
              <span className={styles.iiFooterSub}>Adds to Operations Alerts on this Dashboard</span>
            </div>
          )}
        </>
      )}

    </div>
  )
}
