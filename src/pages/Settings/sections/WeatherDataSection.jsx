/**
 * WeatherDataSection — weather + agronomic data sources.
 *
 * Source architecture:
 *   - Weather Source = Ambient Weather (live; current conditions, rainfall,
 *     humidity, wind, temperature) — falls back to NOAA/METAR when the
 *     Ambient keys aren't configured.
 *   - ET Source = Georgia Weather Network — Savannah (reference). Its page
 *     is a form-driven HTML calculator, so the superintendent reads the
 *     Savannah reference ET and enters it here; when set it overrides the
 *     local estimate. Unset → local estimate is used.
 */

import { useState } from 'react'
import { useWeather } from '../../../utils/weather/useWeather'
import {
  WEATHER_SOURCE_LABEL,
  ET_SOURCE_LABEL,
  ET_SOURCE_URL,
  useSavannahEt,
  setSavannahEt,
} from '../../../utils/weather/etSourceStore'
import styles from '../Settings.module.css'

export default function WeatherDataSection() {
  const { isLive, lastUpdated, error, source } = useWeather()
  const { value: savannahEt, observedDate } = useSavannahEt()
  const [draft, setDraft] = useState(savannahEt != null ? String(savannahEt) : '')

  // The live weather label reflects whichever source actually answered.
  // Ambient is primary; NOAA/METAR are documented fallbacks.
  const liveLabel = source === 'ambient'
    ? WEATHER_SOURCE_LABEL
    : `${WEATHER_SOURCE_LABEL} (fallback: ${source ? source.toUpperCase() : 'NOAA'})`

  function saveEt() {
    setSavannahEt(draft.trim())
  }

  function clearEt() {
    setDraft('')
    setSavannahEt('')
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Weather &amp; Data Sources</p>
      </div>
      <p className={styles.cardDesc}>External feeds powering the dashboard intelligence cards.</p>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Weather Source</span>
          <span className={styles.rowDesc}>Live operational weather — current conditions, rainfall, humidity, wind, temperature.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={styles.rowValue}>{liveLabel}</span>
          <span
            className={`${styles.statusPill} ${
              isLive ? styles.statusPillConnected : styles.statusPillNotConfigured
            }`}
          >
            <span className={styles.statusDot} />
            {isLive ? 'Live' : error ? 'Cached' : 'Connecting…'}
          </span>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Last Sync</span>
        </div>
        <span className={styles.rowValue}>
          {lastUpdated
            ? new Date(lastUpdated).toLocaleString()
            : 'Not yet synced'}
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>ET Source</span>
          <span className={styles.rowDesc}>
            Reference evapotranspiration.{' '}
            <a href={ET_SOURCE_URL} target="_blank" rel="noopener noreferrer">
              Open Savannah ET calculator ↗
            </a>
          </span>
        </div>
        <span className={styles.rowValue}>{ET_SOURCE_LABEL}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Savannah Reference ET (in/day)</span>
          <span className={styles.rowDesc}>
            {savannahEt != null
              ? `Using entered value — overrides the local estimate${observedDate ? ` (set ${observedDate})` : ''}.`
              : 'Optional. Leave blank to use the locally-estimated ET.'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="e.g. 0.18"
            aria-label="Savannah reference ET in inches per day"
            style={{
              width: 90, padding: '6px 8px', fontSize: 14,
              background: 'var(--color-bg)', color: 'var(--color-text)',
              border: '1px solid var(--color-border)', borderRadius: 6,
            }}
          />
          <button
            type="button"
            onClick={saveEt}
            style={{
              fontSize: 13, fontWeight: 600, color: '#0d1a0d',
              background: 'var(--color-accent)', border: '1px solid var(--color-accent)',
              borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            Save
          </button>
          {savannahEt != null && (
            <button
              type="button"
              onClick={clearEt}
              style={{
                fontSize: 13, color: 'var(--color-text-muted)',
                background: 'transparent', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Soil Temperature Source</span>
          <span className={styles.rowDesc}>Available when backend is connected.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>
    </div>
  )
}
