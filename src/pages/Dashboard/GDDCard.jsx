import { useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import { computeGDDSummary } from '../../utils/agronomy/gddEngine'
import styles from './GDDCard.module.css'

const TYPE_ROWS = [
  { key: 'fungicide', label: 'Fungicide' },
  { key: 'pgr',       label: 'PGR' },
  { key: 'nutrient',  label: 'Nutrient' },
]

export default function GDDCard() {
  const { forecast, loading } = useWeather()
  const gdd = useMemo(() => computeGDDSummary(forecast), [forecast])

  if (loading) return <p className={styles.gddEmpty}>Loading GDD data…</p>

  return (
    <div className={styles.gddWrap}>

      <div className={styles.gddStats}>
        <div className={styles.gddStat}>
          <span className={styles.gddStatValue}>{gdd.todayGDD}</span>
          <span className={styles.gddStatLabel}>GDD Today</span>
        </div>
        <div className={styles.gddStatDivider} />
        <div className={styles.gddStat}>
          <span className={styles.gddStatValue}>{gdd.sevenDayGDD}</span>
          <span className={styles.gddStatLabel}>7-Day GDD</span>
        </div>
        <div className={styles.gddStatDivider} />
        <div className={styles.gddStat}>
          <span className={styles.gddStatValue}>{gdd.baseTempF}°F</span>
          <span className={styles.gddStatLabel}>Base Temp</span>
        </div>
      </div>

      <div className={styles.gddList}>
        {TYPE_ROWS.map(({ key, label }) => {
          const { status, daysTo } = gdd[key]
          const meta = gdd.statusMeta[status]
          const pct  = Math.min(100, (gdd.sevenDayGDD / gdd.windows[key].expired) * 100)
          return (
            <div key={key} className={styles.gddRow}>
              <div className={styles.gddRowHeader}>
                <span className={styles.gddRowLabel}>{label}</span>
                <span
                  className={styles.gddBadge}
                  style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                >
                  {meta.label}
                </span>
              </div>
              <div className={styles.gddTrack}>
                <div
                  className={styles.gddFill}
                  style={{ width: `${pct}%`, background: meta.color }}
                />
              </div>
              {status === 'early' && daysTo > 0 && (
                <span className={styles.gddNote}>
                  ~{daysTo} day{daysTo !== 1 ? 's' : ''} to optimal window
                </span>
              )}
              {status === 'optimal' && (
                <span className={styles.gddNote}>Within reapplication window</span>
              )}
              {status === 'late' && (
                <span className={styles.gddNote}>Past optimal — review recent applications</span>
              )}
              {status === 'expired' && (
                <span className={styles.gddNote}>Threshold exceeded — reapplication due</span>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
