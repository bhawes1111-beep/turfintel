import { useMemo } from 'react'
import { useWeather } from '../../utils/weather/useWeather'
import { computeGDDSummary } from '../../utils/agronomy/gddEngine'
import styles from './GDDCard.module.css'

const TYPE_ROWS = [
  { key: 'fungicide', label: 'Fungicide' },
  { key: 'pgr',       label: 'PGR' },
  { key: 'nutrient',  label: 'Nutrient' },
]

function GDDScale({ current, windows, color }) {
  const { optimalStart, optimalEnd, expired } = windows
  const pct = Math.min(100, (current / expired) * 100)
  const m1  = (optimalStart / expired) * 100
  const m2  = (optimalEnd   / expired) * 100

  const trackBg = `linear-gradient(to right,
    rgba(58,138,212,0.22) 0%, rgba(58,138,212,0.22) ${m1}%,
    rgba(74,158,74,0.22) ${m1}%, rgba(74,158,74,0.22) ${m2}%,
    rgba(210,130,40,0.22) ${m2}%, rgba(210,130,40,0.22) 100%
  )`

  return (
    <div className={styles.gddScaleWrap}>
      <div className={styles.gddScaleTrack} style={{ background: trackBg }}>
        <div
          className={styles.gddScaleFill}
          style={{ width: `${pct}%`, background: color }}
        />
        <div className={styles.gddScaleMarker} style={{ left: `${m1}%` }} />
        <div className={styles.gddScaleMarker} style={{ left: `${m2}%` }} />
      </div>
      <div className={styles.gddScaleLabels}>
        <span className={styles.gddZoneLabel} style={{ left: `${m1 / 2}%` }}>Early</span>
        <span className={styles.gddZoneLabel} style={{ left: `${(m1 + m2) / 2}%` }}>Optimal</span>
        <span className={styles.gddZoneLabel} style={{ left: `${(m2 + 100) / 2}%` }}>Late</span>
      </div>
    </div>
  )
}

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
          <span className={styles.gddStatLabel}>7-Day Accum.</span>
        </div>
        <div className={styles.gddStatDivider} />
        <div className={styles.gddStat}>
          <span className={styles.gddStatValue}>{gdd.avgDailyGDD}</span>
          <span className={styles.gddStatLabel}>Daily Avg</span>
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
              <GDDScale
                current={gdd.sevenDayGDD}
                windows={gdd.windows[key]}
                color={meta.color}
              />
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
