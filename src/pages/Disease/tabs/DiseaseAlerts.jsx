import { useState } from 'react'
import styles from '../Disease.module.css'
import { DISEASE_ALERTS } from '../../../data/disease'
import { EmptyState } from '../../../components/shared/EmptyState'

const SEV_CLASS = { high: styles.severityHigh, medium: styles.severityMedium, low: styles.severityLow }

export default function DiseaseAlerts() {
  const [alerts, setAlerts] = useState(DISEASE_ALERTS)

  function dismiss(id) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true } : a))
  }

  function clearDismissed() {
    setAlerts(prev => prev.filter(a => !a.dismissed))
  }

  const active = alerts.filter(a => !a.dismissed)
  const dismissed = alerts.filter(a => a.dismissed)

  return (
    <div>
      <div className={styles.alertsHeader}>
        <div className={styles.alertsTitle}>
          {active.length} active alert{active.length !== 1 ? 's' : ''}
        </div>
        {dismissed.length > 0 && (
          <button className={styles.clearBtn} onClick={clearDismissed}>
            Clear {dismissed.length} dismissed
          </button>
        )}
      </div>

      <div className={styles.alertsList}>
        {alerts.map(alert => (
          <div
            key={alert.id}
            className={`${styles.alertCard} ${SEV_CLASS[alert.severity]} ${alert.dismissed ? styles.dismissed : ''}`}
          >
            <div className={styles.alertDot} />
            <div className={styles.alertBody}>
              <div className={styles.alertTitle}>{alert.title}</div>
              <div className={styles.alertMessage}>{alert.message}</div>
              <div className={styles.alertFooter}>
                <span>{alert.time}</span>
                <span className={styles.alertArea}>{alert.area}</span>
              </div>
            </div>
            {!alert.dismissed && (
              <button className={styles.dismissBtn} onClick={() => dismiss(alert.id)} aria-label="Dismiss alert">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {alerts.length === 0 && (
        <EmptyState
          title="No disease alerts."
          description="Pressure-driven and forecast-based disease alerts will appear here."
        />
      )}
    </div>
  )
}
