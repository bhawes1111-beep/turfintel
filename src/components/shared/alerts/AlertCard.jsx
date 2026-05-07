import styles from './Alerts.module.css'
import AlertBadge from './AlertBadge'
import { MODULE_LABELS } from './alertTokens'

const PRIORITY_CLASS = {
  critical: styles.priorityCritical,
  high:     styles.priorityHigh,
  medium:   styles.priorityMedium,
  low:      styles.priorityLow,
  info:     styles.priorityInfo,
}

/**
 * Renders one alert in full or compact mode.
 *
 * Props:
 *   alert         — { id, title, message, module, priority, status, date, course, actionLabel }
 *   compact       — bool  compact = single-line row, full = card with message (default false)
 *   onAcknowledge — (id) => void  optional
 *   onSnooze      — (id) => void  optional
 *   onDismiss     — (id) => void  optional
 */
export default function AlertCard({ alert, compact = false, onAcknowledge, onSnooze, onDismiss }) {
  const priorityCls = PRIORITY_CLASS[alert.priority] ?? styles.priorityInfo
  const statusKey   = alert.status ?? 'new'
  const moduleLabel = MODULE_LABELS[alert.module] ?? alert.module

  const metaParts = [moduleLabel, alert.course, alert.date].filter(Boolean)

  if (compact) {
    return (
      <div className={`${styles.alertCardCompact} ${priorityCls} ${styles[statusKey] ?? ''}`}>
        <div className={styles.compactDot} />
        <div className={styles.compactTitle} title={alert.title}>{alert.title}</div>
        <div className={styles.compactRight}>
          <AlertBadge priority={alert.priority} />
          {alert.status !== 'new' && <AlertBadge status={alert.status} />}
          {onDismiss && (
            <button
              className={styles.dismissBtn}
              onClick={() => onDismiss(alert.id)}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.alertCard} ${priorityCls} ${styles[statusKey] ?? ''} ${alert.priority === 'critical' ? styles.critical : ''}`}>
      <div className={styles.alertCardBody}>
        <div className={styles.alertCardTitle}>{alert.title}</div>

        {alert.message && (
          <div className={styles.alertCardMessage}>{alert.message}</div>
        )}

        {metaParts.length > 0 && (
          <div className={styles.alertCardMeta}>
            {alert.module && (
              <span className={styles.alertModuleTag}>{moduleLabel}</span>
            )}
            {[alert.course, alert.date].filter(Boolean).map((part, i) => (
              <span key={i} className={styles.alertCardMetaText}>{part}</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.alertCardRight}>
        <div className={styles.alertCardBadges}>
          <AlertBadge priority={alert.priority} />
          <AlertBadge status={alert.status ?? 'new'} />
        </div>

        <div className={styles.alertCardActions}>
          {onAcknowledge && statusKey === 'new' && (
            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => onAcknowledge(alert.id)}
            >
              {alert.actionLabel ?? 'Acknowledge'}
            </button>
          )}
          {onSnooze && statusKey !== 'resolved' && statusKey !== 'snoozed' && (
            <button
              className={styles.actionBtn}
              onClick={() => onSnooze(alert.id)}
            >
              Snooze
            </button>
          )}
          {onDismiss && (
            <button
              className={styles.dismissBtn}
              onClick={() => onDismiss(alert.id)}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
