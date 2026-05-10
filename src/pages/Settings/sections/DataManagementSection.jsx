/**
 * DataManagementSection — scoped per-key clear actions for local state.
 *
 * Each clear action targets one localStorage key (or a key prefix) and
 * confirms before wiping. Avoids a single "nuke everything" button.
 *
 * Keys cleared:
 *   - turfintel-sidebar-prefs            (sidebar collapsed/expanded state)
 *   - turfintel-weather-cache            (NOAA forecast cache)
 *   - turfintel-geo-imports-<courseId>   (KML / course imports — all)
 *   - turfintel-operations               (operations alerts/overrides)
 */

import { useState } from 'react'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from '../Settings.module.css'

const ACTIONS = [
  {
    id:    'sidebar',
    label: 'Reset Sidebar Preferences',
    desc:  'Clears collapsed state and expanded sections.',
    keys:  ['turfintel-sidebar-prefs'],
  },
  {
    id:    'weather',
    label: 'Clear Weather Cache',
    desc:  'Forces a fresh NOAA fetch on next render.',
    keys:  ['turfintel-weather-cache'],
  },
  {
    id:    'kml',
    label: 'Clear KML / Course Imports',
    desc:  'Removes user-imported map features for every course.',
    keyPrefix: 'turfintel-geo-imports-',
  },
  {
    id:    'operations',
    label: 'Clear Local Operations State',
    desc:  'Resets dismissed alerts, repair overrides, and equipment overrides.',
    keys:  ['turfintel-operations'],
  },
]

function clearKeys(action) {
  if (action.keys) {
    action.keys.forEach(k => localStorage.removeItem(k))
    return action.keys.length
  }
  if (action.keyPrefix) {
    let count = 0
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(action.keyPrefix)) {
        localStorage.removeItem(k)
        count++
      }
    }
    return count
  }
  return 0
}

export default function DataManagementSection() {
  const toast = useToast()
  const [confirming, setConfirming] = useState(null)

  function handleClick(action) {
    setConfirming(action.id)
  }

  function confirm(action) {
    const count = clearKeys(action)
    setConfirming(null)
    toast.success(
      count === 0
        ? `${action.label}: nothing to clear.`
        : `${action.label} — cleared.`
    )
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Data Management</p>
      </div>
      <p className={styles.cardDesc}>Scoped local-state clears. Each action affects only its target.</p>

      {ACTIONS.map(action => {
        const isConfirming = confirming === action.id
        return (
          <div key={action.id} className={styles.row}>
            <div className={styles.rowStack}>
              <span className={styles.rowLabel}>{action.label}</span>
              <span className={styles.rowDesc}>{action.desc}</span>
            </div>
            {isConfirming ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => confirm(action)}
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(212,237,212,0.6)' }}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className={styles.dangerBtn} onClick={() => handleClick(action)}>
                Clear
              </button>
            )}
          </div>
        )
      })}

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Import Data</span>
          <span className={styles.rowDesc}>KML import is available on the Course Map preview page.</span>
        </div>
        <span className={styles.rowValue}>Course Map → Import KML</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Export Data</span>
          <span className={styles.rowDesc}>Available when backend is connected.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Backup Settings</span>
          <span className={styles.rowDesc}>Available when backend is connected.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>
    </div>
  )
}
