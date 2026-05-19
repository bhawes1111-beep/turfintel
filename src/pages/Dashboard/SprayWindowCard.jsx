// Phase 28B — Spray Window Intelligence dashboard card.
//
// Compact, 4-row card living in the intelligence row beside GDD,
// Application Effectiveness, and Agronomic Intelligence. Pulls data
// from existing stores (weather, sprays, labels) and feeds them to
// the pure-function intelligence layer in
// src/utils/sprayWindow/sprayWindowIntel.js. No fetching here.
//
// Rows:
//   (1) Current spray rating  — color-coded pill + wind/temp/RH summary
//   (2) Next ideal window     — first ideal day on the forecast, with date
//   (3) Top risk              — most-severe single warning (or "Clear")
//   (4) Rain context          — next rain day on the forecast, if any
//
// Every row falls back to an honest empty/explanatory state when its
// inputs aren't sufficient. Never invents weather. Every advisory has
// a `why` tooltip.

import { useMemo } from 'react'
import { useWeather }        from '../../utils/weather/useWeather'
import { useSpraysData }     from '../../utils/sprays/spraysStore'
import { useImportedLabels } from '../../utils/inventory/labelImportStore'
import { computeSprayWindowIntel } from '../../utils/sprayWindow/sprayWindowIntel'
import styles from './SprayWindowCard.module.css'

const RATING_LABEL = {
  ideal:      'Ideal',
  acceptable: 'Acceptable',
  caution:    'Caution',
  poor:       'Poor',
  unknown:    'Unknown',
}

const RATING_CLASS = {
  ideal:      styles.ratingIdeal,
  acceptable: styles.ratingIdeal,
  caution:    styles.ratingCaution,
  poor:       styles.ratingPoor,
  unknown:    styles.ratingUnknown,
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const ms = Date.parse(`${dateStr}T00:00:00`)
  if (!Number.isFinite(ms)) return dateStr
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function SprayWindowCard() {
  const { current, forecast, loading } = useWeather()
  const { records: sprays = [] }       = useSpraysData()
  const { labels = [] }                = useImportedLabels()

  const intel = useMemo(() => computeSprayWindowIntel({
    current,
    forecast,
    sprays,
    labels,
  }), [current, forecast, sprays, labels])

  if (loading) {
    return <p className={styles.empty}>Loading conditions…</p>
  }

  const { current: cur, nextIdeal, topRisk, forecastWindows } = intel
  const nextRainDay = (forecastWindows ?? []).find(w =>
    w.reasons?.some(r => r.axis === 'rain'),
  )

  return (
    <div className={styles.wrap}>

      {/* ── Row 1: Current spray rating ─────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>NOW</div>
        <div className={styles.rowBody}>
          <span
            className={`${styles.ratingPill} ${RATING_CLASS[cur.rating] ?? styles.ratingUnknown}`}
            title={cur.reasons?.map(r => r.why).join(' · ') || ''}
          >
            {RATING_LABEL[cur.rating] ?? 'Unknown'}
          </span>
          <span className={styles.metricStrip}>
            {current?.currentTemp != null && (
              <span className={styles.metric}>{current.currentTemp}°F</span>
            )}
            {current?.wind != null && (
              <span className={styles.metric}>
                {current.wind} mph{current.windGust != null ? ` · g${current.windGust}` : ''}
              </span>
            )}
            {current?.humidity != null && (
              <span className={styles.metric}>{current.humidity}% RH</span>
            )}
          </span>
        </div>
      </div>

      {/* ── Row 2: Next ideal window ───────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>NEXT IDEAL</div>
        <div className={styles.rowBody}>
          {nextIdeal ? (
            <>
              <span className={styles.dateChip}>{fmtDate(nextIdeal.date)}</span>
              <span className={styles.rowMeta}>
                forecast inside spray-friendly range
              </span>
            </>
          ) : (
            <span className={styles.rowMeta}>
              {forecastWindows.length === 0
                ? 'Forecast not available'
                : 'No ideal day in current forecast'}
            </span>
          )}
        </div>
      </div>

      {/* ── Row 3: Top risk ─────────────────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>TOP RISK</div>
        <div className={styles.rowBody}>
          {topRisk ? (
            <>
              <span className={`${styles.riskPill} ${
                topRisk.rating === 'poor' ? styles.riskPoor : styles.riskCaution
              }`}>
                {topRisk.source}
              </span>
              <span className={styles.rowMeta} title={topRisk.why}>
                {topRisk.why.length > 64 ? topRisk.why.slice(0, 62) + '…' : topRisk.why}
              </span>
            </>
          ) : (
            <span className={styles.rowMeta}>
              {cur.rating === 'ideal' ? 'No risks flagged' : '—'}
            </span>
          )}
        </div>
      </div>

      {/* ── Row 4: Rain context ─────────────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>NEXT RAIN</div>
        <div className={styles.rowBody}>
          {nextRainDay ? (
            <>
              <span className={styles.dateChip} data-tone="warn">
                {fmtDate(nextRainDay.date)}
              </span>
              <span className={styles.rowMeta}>
                {nextRainDay.reasons.filter(r => r.axis === 'rain').map(r => r.why).join(' · ')}
              </span>
            </>
          ) : (
            <span className={styles.rowMeta}>
              {forecastWindows.length === 0
                ? 'Forecast not available'
                : 'No measurable rain in forecast'}
            </span>
          )}
        </div>
      </div>

    </div>
  )
}
