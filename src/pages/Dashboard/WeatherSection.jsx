import {
  SPRAY_WINDOW_TOKENS,
  DISEASE_PRESSURE_TOKENS,
  WEATHER_ICONS,
  formatTimestamp,
} from '../../components/shared/weather/weatherTokens'
import { WeatherAlertBanner } from '../../components/shared/weather'
import { useWeather } from '../../utils/weather/useWeather'
import { computeIrrigationSummary } from '../../utils/weather/irrigationEngine'
import styles from './WeatherSection.module.css'

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconCloud({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function forecastCondition(day) {
  if (day.rainfall >= 0.5) {
    return { label: 'Wet',     color: '#3a8ad4', bg: 'rgba(58,138,212,0.12)', border: 'rgba(58,138,212,0.4)' }
  }
  if (day.rainfall > 0.1) {
    return { label: 'Monitor', color: '#d4883a', bg: 'rgba(210,130,40,0.12)', border: 'rgba(210,130,40,0.3)' }
  }
  const sw = SPRAY_WINDOW_TOKENS[day.sprayWindow]
  if (day.sprayWindow === 'ideal')   return { label: 'Good',     color: sw.color, bg: sw.bg, border: sw.border }
  if (day.sprayWindow === 'caution') return { label: 'Marginal', color: sw.color, bg: sw.bg, border: sw.border }
  return { label: 'Poor', color: sw.color, bg: sw.bg, border: sw.border }
}

// ── Unified Weather Insights card (with embedded forecast) ────────────────────

function WeatherInsightsCard({ current, forecast, irrigationRec, isLive, isStale, loading, onRefresh }) {
  const w    = current
  const sw   = SPRAY_WINDOW_TOKENS[w.sprayWindow] ?? SPRAY_WINDOW_TOKENS.caution
  const dp   = DISEASE_PRESSURE_TOKENS[w.diseasePressure] ?? DISEASE_PRESSURE_TOKENS.low
  const icon = WEATHER_ICONS[forecast[0]?.icon] || '⛅'

  const METRICS = [
    { label: 'Humidity',  value: `${w.humidity}%`             },
    { label: 'Wind',      value: `${w.wind} mph ${w.windDir}` },
    { label: 'Dew Point', value: `${w.dewPoint}°F`            },
    { label: 'Soil Temp', value: w.soilTemp != null ? `${w.soilTemp}°F` : '—' },
    { label: '24h Rain',  value: `${w.rainfall24h}"`          },
    { label: 'Solar',     value: w.solarRadiation != null ? `${w.solarRadiation} W/m²` : '—' },
  ]

  return (
    <div className={styles.wsCard}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.wsCardHeader}>
        <div className={styles.wsCardHeaderLeft}>
          <span className={styles.wsCardIconWrap}><IconCloud size={15} /></span>
          <div>
            <div className={styles.wsCardTitle}>
              Weather Insights
              {isLive  && <span className={styles.wsLiveBadge}>LIVE</span>}
              {isStale && <span className={styles.wsStaleBadge}>STALE</span>}
            </div>
            <div className={styles.wsCardLocation}>{w.location}</div>
          </div>
        </div>
        <div className={styles.wsHeaderRight}>
          <span
            className={styles.wsCondBadge}
            style={{ color: sw.color, background: sw.bg, borderColor: sw.border }}
          >
            {sw.icon}&nbsp;{sw.label}
          </span>
          <div className={styles.wsUpdated}>Updated {formatTimestamp(w.timestamp)}</div>
          <button
            className={styles.wsRefreshBtn}
            onClick={onRefresh}
            disabled={loading}
            title="Refresh weather data"
            aria-label="Refresh weather"
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {/* ── Main conditions ─────────────────────────────────────────────────── */}
      <div className={styles.wsMainDisplay}>
        <div className={styles.wsMainLeft}>
          <div className={styles.wsTempRow}>
            <span className={styles.wsWeatherEmoji} role="img" aria-label="weather">{icon}</span>
            <span className={styles.wsCurrentTemp}>{w.currentTemp}°</span>
          </div>
          <span className={styles.wsFeelsLike}>Feels like {w.feelsLike}°F</span>
        </div>
        <div className={styles.wsMetricsGrid}>
          {METRICS.map(m => (
            <div key={m.label} className={styles.wsMetric}>
              <span className={styles.wsMetricLabel}>{m.label}</span>
              <span className={styles.wsMetricValue}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Status strip ─────────────────────────────────────────────────────── */}
      <div className={styles.wsStatusStrip}>
        <div className={styles.wsStatusItem}>
          <span className={styles.wsStatusLabel}>Disease Pressure</span>
          <span
            className={styles.wsStatusBadge}
            style={{ color: dp.color, background: dp.bg, borderColor: dp.border }}
          >
            {dp.label}
          </span>
        </div>
        <div className={styles.wsStatusItem}>
          <span className={styles.wsStatusLabel}>Irrigation Tonight</span>
          <span
            className={styles.wsIrrigationRec}
            style={{ color: irrigationRec > 0 ? '#3a8ad4' : 'var(--color-accent)' }}
          >
            {irrigationRec > 0 ? `${irrigationRec.toFixed(2)}"` : 'Skip'}
          </span>
        </div>
        <div className={styles.wsStatusItem}>
          <span className={styles.wsStatusLabel}>ET Today</span>
          <span className={styles.wsETToday}>{w.etRate}"</span>
        </div>
      </div>

      {/* ── Embedded compact 7-day forecast ──────────────────────────────────── */}
      <div className={styles.wsEmbForecast}>
        {forecast.map(day => {
          const isToday = day.day === 'Today'
          const cond    = forecastCondition(day)
          return (
            <div
              key={day.day}
              className={`${styles.wsEmbFcastCard} ${isToday ? styles.wsEmbFcastCardToday : ''}`}
            >
              <div className={styles.wsEmbFcastDay}>{day.day}</div>
              <div className={styles.wsEmbFcastDate}>{day.date}</div>
              <div className={styles.wsEmbFcastIcon} role="img" aria-label={day.icon}>
                {WEATHER_ICONS[day.icon] || '☀'}
              </div>
              <div className={styles.wsEmbFcastTemps}>
                <span className={styles.wsEmbFcastHigh}>{day.high}°</span>
                <span className={styles.wsEmbFcastSep}>/</span>
                <span className={styles.wsEmbFcastLow}>{day.low}°</span>
              </div>
              {day.rainfall > 0 ? (
                <div className={styles.wsEmbFcastRain}>&#x1F4A7;&nbsp;{day.rainfall.toFixed(2)}"</div>
              ) : (
                <div className={styles.wsEmbFcastNoRain}>No rain</div>
              )}
              <span
                className={styles.wsEmbFcastBadge}
                style={{ color: cond.color, background: cond.bg, borderColor: cond.border }}
              >
                {cond.label}
              </span>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function WeatherSection({ alerts = [], onDismissAlert }) {
  const { current, forecast, loading, error, isLive, isStale, refresh } = useWeather()
  const { recApplication } = computeIrrigationSummary(current, forecast)

  return (
    <div className={styles.wsSection}>

      {alerts.length > 0 && (
        <div className={styles.wsAlerts}>
          {alerts.map(alert => (
            <WeatherAlertBanner
              key={alert.id}
              message={alert.message}
              severity={alert.severity}
              onDismiss={() => onDismissAlert(alert.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className={styles.wsErrorBanner}>
          {error} Showing sample data.
        </div>
      )}

      <WeatherInsightsCard
        current={current}
        forecast={forecast}
        irrigationRec={recApplication}
        isLive={isLive}
        isStale={isStale}
        loading={loading}
        onRefresh={refresh}
      />

    </div>
  )
}
