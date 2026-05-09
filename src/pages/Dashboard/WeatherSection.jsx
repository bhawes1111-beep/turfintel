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

function IconDroplet({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
    </svg>
  )
}

function IconWind({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function forecastCondition(day) {
  if (day.rainfall >= 0.5) {
    return { label: 'Wet Conditions', color: '#3a8ad4', bg: 'rgba(58,138,212,0.12)', border: 'rgba(58,138,212,0.4)' }
  }
  if (day.rainfall > 0.1) {
    return { label: 'Monitor', color: '#d4883a', bg: 'rgba(210,130,40,0.12)', border: 'rgba(210,130,40,0.3)' }
  }
  const sw = SPRAY_WINDOW_TOKENS[day.sprayWindow]
  if (day.sprayWindow === 'ideal')   return { label: 'Good Conditions', color: sw.color, bg: sw.bg, border: sw.border }
  if (day.sprayWindow === 'caution') return { label: 'Marginal',        color: sw.color, bg: sw.bg, border: sw.border }
  return { label: 'Poor Conditions', color: sw.color, bg: sw.bg, border: sw.border }
}

// ── ET bar chart ──────────────────────────────────────────────────────────────

function ETBarChart({ data }) {
  const maxEt = Math.max(...data.map(d => d.et), 0.01)
  return (
    <div className={styles.wsBarChart}>
      {data.map(d => {
        const heightPct = Math.round((d.et / maxEt) * 100)
        return (
          <div key={d.day} className={styles.wsBarCol}>
            <span className={styles.wsBarValue}>{d.et.toFixed(2)}</span>
            <div className={styles.wsBarTrack}>
              <div className={styles.wsBar} style={{ height: `${heightPct}%` }} />
            </div>
            <span className={styles.wsBarDay}>{d.day}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Weather Insights card ─────────────────────────────────────────────────────

function WeatherInsightsCard({ current, forecastDay0, irrigationRec, isLive, isStale, loading, onRefresh }) {
  const w   = current
  const sw  = SPRAY_WINDOW_TOKENS[w.sprayWindow] ?? SPRAY_WINDOW_TOKENS.caution
  const dp  = DISEASE_PRESSURE_TOKENS[w.diseasePressure] ?? DISEASE_PRESSURE_TOKENS.low
  const icon = WEATHER_ICONS[forecastDay0?.icon] || '⛅'

  const METRICS = [
    { label: 'Humidity',    value: `${w.humidity}%`             },
    { label: 'Wind',        value: `${w.wind} mph ${w.windDir}` },
    { label: 'Dew Point',   value: `${w.dewPoint}°F`            },
    { label: 'Soil Temp',   value: w.soilTemp != null ? `${w.soilTemp}°F` : '—' },
    { label: '24h Rain',    value: `${w.rainfall24h}"`          },
    { label: 'Solar Rad',   value: w.solarRadiation != null ? `${w.solarRadiation} W/m²` : '—' },
  ]

  return (
    <div className={styles.wsCard}>

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

      <div className={styles.wsMainDisplay}>
        <span className={styles.wsWeatherEmoji} role="img" aria-label="weather">{icon}</span>
        <div className={styles.wsTempBlock}>
          <span className={styles.wsCurrentTemp}>{w.currentTemp}°</span>
          <span className={styles.wsUnit}>Fahrenheit</span>
          <span className={styles.wsFeelsLike}>Feels like {w.feelsLike}°F</span>
        </div>
        <div className={styles.wsCondBadgeWrap}>
          <span
            className={styles.wsCondBadge}
            style={{ color: sw.color, background: sw.bg, borderColor: sw.border }}
          >
            {sw.icon}&nbsp;{sw.label}
          </span>
        </div>
      </div>

      <div className={styles.wsMetricsGrid}>
        {METRICS.map(m => (
          <div key={m.label} className={styles.wsMetric}>
            <span className={styles.wsMetricLabel}>{m.label}</span>
            <span className={styles.wsMetricValue}>{m.value}</span>
          </div>
        ))}
      </div>

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

    </div>
  )
}

// ── Evapotranspiration card ───────────────────────────────────────────────────

function ETSectionCard({ current, etTrend }) {
  const w       = current
  const sevenDay = etTrend.reduce((sum, d) => sum + d.et, 0).toFixed(2)

  return (
    <div className={styles.wsCard}>

      <div className={styles.wsCardHeader}>
        <div className={styles.wsCardHeaderLeft}>
          <span className={styles.wsCardIconWrap}><IconDroplet size={15} /></span>
          <div className={styles.wsCardTitle}>Evapotranspiration</div>
        </div>
        <span className={styles.wsETWeekTotal}>7-day total: {sevenDay}"</span>
      </div>

      <div className={styles.wsETValues}>
        <div className={styles.wsETValueBlock}>
          <span className={styles.wsETLabel}>ET Rate Today</span>
          <div className={styles.wsETBigRow}>
            <span className={styles.wsETBig}>{w.etRate.toFixed(2)}</span>
            <span className={styles.wsETUnit}>" / day</span>
          </div>
        </div>
        <div className={styles.wsETValueBlock}>
          <span className={styles.wsETLabel}>ET Deficit</span>
          <div className={styles.wsETBigRow}>
            <span className={`${styles.wsETBig} ${styles.wsETDeficit}`}>{w.etDeficit.toFixed(2)}</span>
            <span className={styles.wsETUnit}>" to restore</span>
          </div>
        </div>
      </div>

      <div className={styles.wsChartSection}>
        <span className={styles.wsChartTitle}>7-Day ET Trend</span>
        <ETBarChart data={etTrend} />
      </div>

    </div>
  )
}

// ── 7-day forecast row ────────────────────────────────────────────────────────

function ForecastRow({ forecast }) {
  return (
    <div className={styles.wsForecastOuter}>
      <div className={styles.wsForecastRow}>
        {forecast.map((day) => {
          const isToday = day.day === 'Today'
          const cond    = forecastCondition(day)
          return (
            <div
              key={day.day}
              className={`${styles.wsForecastCard} ${isToday ? styles.wsForecastCardToday : ''}`}
            >
              <div className={styles.wsFcastDayLabel}>{day.day}</div>
              <div className={styles.wsFcastDate}>{day.date}</div>

              <div className={styles.wsFcastIcon} role="img" aria-label={day.icon}>
                {WEATHER_ICONS[day.icon] || '☀'}
              </div>

              <div className={styles.wsFcastTemps}>
                <span className={styles.wsFcastHigh}>{day.high}°</span>
                <span className={styles.wsFcastSep}>/</span>
                <span className={styles.wsFcastLow}>{day.low}°</span>
              </div>

              {day.rainfall > 0 ? (
                <div className={styles.wsFcastRain}>&#x1F4A7;&nbsp;{day.rainfall.toFixed(2)}"</div>
              ) : (
                <div className={styles.wsFcastNoRain}>No rain</div>
              )}

              <div className={styles.wsFcastET}>ET {day.etRate.toFixed(2)}"</div>

              <span
                className={styles.wsFcastBadge}
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
  const { current, forecast, etTrend, loading, error, isLive, isStale, refresh } = useWeather()
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

      <div className={styles.wsTopRow}>
        <WeatherInsightsCard
          current={current}
          forecastDay0={forecast[0]}
          irrigationRec={recApplication}
          isLive={isLive}
          isStale={isStale}
          loading={loading}
          onRefresh={refresh}
        />
        <ETSectionCard current={current} etTrend={etTrend} />
      </div>

      <ForecastRow forecast={forecast} />

    </div>
  )
}
