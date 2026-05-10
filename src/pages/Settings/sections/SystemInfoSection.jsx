/**
 * SystemInfoSection — app version, environment, storage info.
 * Static-ish for Phase 1; backend-derived values noted as such.
 */

import { useMemo } from 'react'
import { useWeather } from '../../../utils/weather/useWeather'
import styles from '../Settings.module.css'

function formatBytes(n) {
  if (!n) return '0 KB'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function localStorageUsage() {
  if (typeof localStorage === 'undefined') return 0
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    const v = k ? localStorage.getItem(k) : null
    if (k && v) total += k.length + v.length
  }
  return total * 2 // UTF-16 = 2 bytes per char
}

export default function SystemInfoSection() {
  const { lastUpdated } = useWeather()
  const storageBytes = useMemo(() => localStorageUsage(), [])

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>System Info</p>
      </div>
      <p className={styles.cardDesc}>Build, environment, and storage details.</p>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>App</span>
        </div>
        <span className={styles.rowValue}>TurfIntel Pro</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Deployment Environment</span>
        </div>
        <span className={styles.rowValue}>Production · Cloudflare Workers</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Live URL</span>
        </div>
        <span className={styles.rowValue}>turfintel.bhawes1111.workers.dev</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Last Weather Sync</span>
        </div>
        <span className={styles.rowValue}>
          {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Local Storage Usage</span>
          <span className={styles.rowDesc}>Approximate — sidebar prefs, KML imports, weather cache, etc.</span>
        </div>
        <span className={styles.rowValue}>{formatBytes(storageBytes)}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Browser</span>
        </div>
        <span className={styles.rowValue}>{navigator.userAgent.split(' ').slice(-2).join(' ')}</span>
      </div>
    </div>
  )
}
