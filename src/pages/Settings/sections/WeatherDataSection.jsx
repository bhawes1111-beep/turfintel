/**
 * WeatherDataSection — weather + agronomic data sources.
 * Reads live state from useWeather (NOAA KSAV is the wired station today).
 */

import { useWeather } from '../../../utils/weather/useWeather'
import styles from '../Settings.module.css'

export default function WeatherDataSection() {
  const { isLive, lastUpdated, error } = useWeather()

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Weather &amp; Data Sources</p>
      </div>
      <p className={styles.cardDesc}>External feeds powering the dashboard intelligence cards.</p>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Weather Station</span>
          <span className={styles.rowDesc}>NOAA / Weather.gov</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={styles.rowValue}>KSAV — Savannah Hilton Head Intl</span>
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
          <span className={styles.rowLabel}>Rainfall Source</span>
          <span className={styles.rowDesc}>Currently reads from NOAA forecast bundle.</span>
        </div>
        <span className={styles.rowValue}>NOAA · KSAV</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>ET Source</span>
          <span className={styles.rowDesc}>Computed from NOAA forecast.</span>
        </div>
        <span className={styles.rowValue}>Computed (NOAA)</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Soil Temperature Source</span>
          <span className={styles.rowDesc}>Available when backend is connected.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Custom Station Configuration</span>
          <span className={styles.rowDesc}>Available when backend is connected.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>
    </div>
  )
}
