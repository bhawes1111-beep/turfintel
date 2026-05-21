// Phase 18 — Weather workspace.
//
// Three tabs:
//   Current Conditions — every normalized field from the live provider
//                        feed (Ambient → NWS → METAR). Missing fields
//                        render "Data unavailable" — never faked.
//   Forecast           — the NWS 7-day outlook.
//   History            — persistent captured snapshots from the
//                        weather_observations table, with a manual
//                        Capture button and a simple date-range filter.
//
// One useWeather() instance lives at the page root and is passed down,
// so the page holds a single live-weather subscription.

import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import { useWeather } from '../../utils/weather/useWeather'
import {
  useWeatherHistoryData,
  captureCurrentWeather,
  refreshWeatherHistory,
} from '../../utils/weather/weatherHistoryStore'
import { useToast } from '../../utils/feedback/toastContext'
import { computeSprayConditions } from '../../utils/recommendations/operationalRecommendations'
import { WEATHER_SOURCE_LABEL, ET_SOURCE_LABEL } from '../../utils/weather/etSourceStore'
import styles from './Weather.module.css'

const TABS = ['Current Conditions', 'Forecast', 'History']
const UNAVAILABLE = 'Data unavailable'

// ── Formatting helpers ─────────────────────────────────────────────────
// Every value passes through these — a null/undefined field becomes the
// explicit "Data unavailable" string. No fabricated numbers.

function isNum(v) { return typeof v === 'number' && Number.isFinite(v) }

function fmt(value, { unit = '', digits = 0 } = {}) {
  if (value == null || value === '') return UNAVAILABLE
  if (isNum(value)) return `${value.toFixed(digits)}${unit}`
  return `${value}${unit}`
}

function fmtTimestamp(iso) {
  if (!iso) return UNAVAILABLE
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function titleCase(s) {
  if (!s) return UNAVAILABLE
  return String(s).charAt(0).toUpperCase() + String(s).slice(1)
}

export default function Weather() {
  const [activeTab, setActiveTab] = useState('Current Conditions')
  const weather = useWeather()

  return (
    <PageShell
      title="Weather"
      description="Live course conditions, forecast, and captured observation history."
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'Current Conditions' && <CurrentConditionsTab weather={weather} />}
      {activeTab === 'Forecast'           && <ForecastTab forecast={weather.forecast} />}
      {activeTab === 'History'            && <HistoryTab weather={weather} />}
    </PageShell>
  )
}

/* ── Current Conditions ─────────────────────────────────────────────── */

function CurrentConditionsTab({ weather }) {
  const { current, forecast, loading, sourceLabel, observedAt, isLive } = weather
  const c = current ?? {}

  // Derived operational flags (rules-based, no fake data).
  const spray     = computeSprayConditions(c)
  const frostRisk = isNum(c.currentTemp) ? c.currentTemp <= 36 : null
  const heatIndex = isNum(c.currentTemp) && c.currentTemp >= 80 && isNum(c.feelsLike)
    ? c.feelsLike
    : null
  const nextDay   = forecast?.[0]

  return (
    <div className={styles.wrap}>
      <div className={styles.sourceBar}>
        <span className={styles.sourceLabel}>{sourceLabel ?? 'Live weather'}</span>
        <span className={styles.sourceMeta}>
          Observed {fmtTimestamp(observedAt ?? c.timestamp)}
          {loading && ' · refreshing…'}
          {!isLive && !loading && ' · placeholder (live feed unavailable)'}
        </span>
      </div>

      <section className={styles.fieldGroup}>
        <h3 className={styles.groupTitle}>Temperature &amp; Air</h3>
        <div className={styles.fieldGrid}>
          <Field label="Temperature"  value={fmt(c.currentTemp, { unit: '°F' })} />
          <Field label="Feels Like"   value={fmt(c.feelsLike,   { unit: '°F' })} />
          <Field label="Heat Index"   value={heatIndex != null ? fmt(heatIndex, { unit: '°F' }) : UNAVAILABLE} />
          <Field label="Humidity"     value={fmt(c.humidity,    { unit: '%' })} />
          <Field label="Dew Point"    value={fmt(c.dewPoint,    { unit: '°F' })} />
          <Field label="Pressure"     value={fmt(c.pressure,    { unit: ' inHg', digits: 2 })} />
        </div>
      </section>

      <section className={styles.fieldGroup}>
        <h3 className={styles.groupTitle}>Wind</h3>
        <div className={styles.fieldGrid}>
          <Field label="Wind Speed"     value={fmt(c.wind,     { unit: ' mph' })} />
          <Field label="Wind Gust"      value={fmt(c.windGust, { unit: ' mph' })} />
          <Field label="Wind Direction" value={c.windDir || UNAVAILABLE} />
        </div>
      </section>

      <section className={styles.fieldGroup}>
        <h3 className={styles.groupTitle}>Moisture</h3>
        <div className={styles.fieldGrid}>
          <Field label="Rainfall Today" value={fmt(c.rainfall24h,    { unit: '"', digits: 2 })} />
          <Field label="Hourly Rain"    value={fmt(c.rainfallHourly, { unit: '"', digits: 2 })} />
          <Field label="ET Rate"        value={fmt(c.etRate,         { unit: '"', digits: 2 })} />
        </div>
      </section>

      <section className={styles.fieldGroup}>
        <h3 className={styles.groupTitle}>Operational Signals</h3>
        <div className={styles.fieldGrid}>
          <Field
            label="Spray Window"
            value={spray.kind === 'unknown' ? UNAVAILABLE : spray.label}
            tone={spray.kind === 'unknown' ? undefined : spray.kind}
          />
          <Field
            label="Disease Pressure"
            value={titleCase(c.diseasePressure)}
            tone={
              c.diseasePressure === 'critical' || c.diseasePressure === 'high' ? 'unfavorable'
              : c.diseasePressure === 'medium' ? 'marginal'
              : c.diseasePressure === 'low' ? 'favorable' : undefined
            }
          />
          <Field
            label="Frost Risk"
            value={frostRisk == null ? UNAVAILABLE : (frostRisk ? 'Yes — at/below 36°F' : 'No')}
            tone={frostRisk == null ? undefined : (frostRisk ? 'unfavorable' : 'favorable')}
          />
        </div>
      </section>

      <section className={styles.fieldGroup}>
        <h3 className={styles.groupTitle}>Forecast Summary</h3>
        <div className={styles.fieldGrid}>
          <Field
            label="Tomorrow"
            value={nextDay ? (nextDay.label ?? nextDay.shortForecast ?? UNAVAILABLE) : UNAVAILABLE}
          />
          <Field
            label="Tomorrow High / Low"
            value={nextDay && (isNum(nextDay.high) || isNum(nextDay.low))
              ? `${fmt(nextDay.high, { unit: '°' })} / ${fmt(nextDay.low, { unit: '°' })}`
              : UNAVAILABLE}
          />
          <Field
            label="Tomorrow Rain"
            value={nextDay ? fmt(nextDay.rainfall, { unit: '"', digits: 2 }) : UNAVAILABLE}
          />
        </div>
      </section>
    </div>
  )
}

function Field({ label, value, tone }) {
  const isUnavailable = value === UNAVAILABLE
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span
        className={`${styles.fieldValue} ${isUnavailable ? styles.fieldUnavailable : ''}`}
        data-tone={tone}
      >
        {value}
      </span>
    </div>
  )
}

/* ── Forecast ───────────────────────────────────────────────────────── */

function ForecastTab({ forecast }) {
  if (!forecast || forecast.length === 0) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>
          Forecast unavailable — the NWS gridpoint feed returned no data.
          Current conditions still work from the live station.
        </p>
      </div>
    )
  }
  return (
    <div className={styles.wrap}>
      <div className={styles.forecastGrid}>
        {forecast.map((d, i) => (
          <div key={i} className={styles.forecastCard}>
            <span className={styles.forecastDay}>{d.day ?? '—'}</span>
            <span className={styles.forecastDate}>{d.date ?? ''}</span>
            <span className={styles.forecastTemps}>
              <strong>{fmt(d.high, { unit: '°' })}</strong>
              {' / '}
              <span className={styles.forecastLow}>{fmt(d.low, { unit: '°' })}</span>
            </span>
            <div className={styles.forecastMeta}>
              <span>Rain {fmt(d.rainfall, { unit: '"', digits: 2 })}</span>
              {isNum(d._pop) && <span>· {d._pop}%</span>}
            </div>
            <div className={styles.forecastSignals}>
              {d.sprayWindow && (
                <span className={styles.miniPill} data-tone={d.sprayWindow}>
                  Spray: {titleCase(d.sprayWindow)}
                </span>
              )}
              {d.diseasePressure && (
                <span className={styles.miniPill} data-disease={d.diseasePressure}>
                  Disease: {titleCase(d.diseasePressure)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── History ────────────────────────────────────────────────────────── */

function HistoryTab({ weather }) {
  const { history, loading, error } = useWeatherHistoryData()
  const toast = useToast()
  const [capturing, setCapturing] = useState(false)
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')

  const liveHasData = isNum(weather.current?.currentTemp)

  async function handleCapture() {
    if (!liveHasData) {
      toast.info('Live weather not loaded yet — try again in a moment.')
      return
    }
    setCapturing(true)
    try {
      const saved = await captureCurrentWeather(weather.current, weather.source)
      toast.success(`Snapshot captured · ${fmt(saved.tempF, { unit: '°F' })}`)
    } catch (err) {
      toast.error(`Capture failed: ${err.message}`)
    } finally {
      setCapturing(false)
    }
  }

  function applyFilter() {
    refreshWeatherHistory({
      from: from ? `${from}T00:00:00` : null,
      to:   to   ? `${to}T23:59:59`   : null,
    })
  }

  function clearFilter() {
    setFrom('')
    setTo('')
    refreshWeatherHistory()
  }

  // Latest saved observation + last capture time (newest-first history).
  const latest = history[0] ?? null

  return (
    <div className={styles.wrap}>
      {/* Source attribution + automatic-capture status. */}
      <div className={styles.sourceBar}>
        <span className={styles.sourceLabel}>Live Weather Source: {WEATHER_SOURCE_LABEL}</span>
        <span className={styles.sourceMeta}>ET Source: {ET_SOURCE_LABEL}</span>
      </div>

      <div className={styles.sourceBar}>
        <span className={styles.sourceLabel}>
          {latest
            ? `Latest saved: ${fmt(latest.tempF, { unit: '°F' })}`
            : 'Automatic capture'}
        </span>
        <span className={styles.sourceMeta}>
          {latest
            ? `Last capture ${fmtTimestamp(latest.createdAt ?? latest.observedAt)} · auto-captures every 30 min`
            : 'Snapshots are captured automatically every 30 minutes'}
        </span>
      </div>

      <div className={styles.historyToolbar}>
        <button
          type="button"
          className={styles.captureBtn}
          onClick={handleCapture}
          disabled={capturing}
          title={liveHasData
            ? 'Store a snapshot of the current live weather'
            : 'Live weather not loaded yet'}
        >
          {capturing ? 'Capturing…' : '+ Capture Now'}
        </button>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>
            From
            <input
              type="date"
              className={styles.filterInput}
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
          </label>
          <label className={styles.filterLabel}>
            To
            <input
              type="date"
              className={styles.filterInput}
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </label>
          <button type="button" className={styles.filterBtn} onClick={applyFilter}>Apply</button>
          {(from || to) && (
            <button type="button" className={styles.filterClear} onClick={clearFilter}>Clear</button>
          )}
        </div>
      </div>

      {error && <p className={styles.errorBanner}>History load error: {error}</p>}

      {loading && history.length === 0 ? (
        <p className={styles.empty}>Loading weather history…</p>
      ) : history.length === 0 ? (
        <p className={styles.empty}>
          Weather history will appear after automatic captures begin. Snapshots
          are saved from {WEATHER_SOURCE_LABEL} every 30 minutes — or use
          <strong> + Capture Now </strong> to store the first one immediately.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Captured</th>
                <th>Temp</th>
                <th>Humidity</th>
                <th>Dew Pt</th>
                <th>Wind</th>
                <th>Rain Today</th>
                <th>Spray</th>
                <th>Disease</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {history.map(o => (
                <tr key={o.id}>
                  <td className={styles.tdTime}>{fmtTimestamp(o.observedAt ?? o.createdAt)}</td>
                  <td>{fmt(o.tempF, { unit: '°F' })}</td>
                  <td>{fmt(o.humidity, { unit: '%' })}</td>
                  <td>{fmt(o.dewPointF, { unit: '°F' })}</td>
                  <td>
                    {fmt(o.windMph, { unit: ' mph' })}
                    {o.windDir ? ` ${o.windDir}` : ''}
                  </td>
                  <td>{fmt(o.rainfallTodayIn, { unit: '"', digits: 2 })}</td>
                  <td>
                    {o.sprayWindow
                      ? <span className={styles.miniPill} data-tone={o.sprayWindow}>{titleCase(o.sprayWindow)}</span>
                      : <span className={styles.tdMuted}>{UNAVAILABLE}</span>}
                  </td>
                  <td>
                    {o.diseasePressure
                      ? <span className={styles.miniPill} data-disease={o.diseasePressure}>{titleCase(o.diseasePressure)}</span>
                      : <span className={styles.tdMuted}>{UNAVAILABLE}</span>}
                  </td>
                  <td className={styles.tdMuted}>{o.source ?? UNAVAILABLE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
