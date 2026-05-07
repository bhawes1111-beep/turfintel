import styles from './Alerts.module.css'
import { resolvePriority, resolveStatus } from './alertTokens'

const PRIORITY_CLASS = {
  critical: styles.priorityCritical,
  high:     styles.priorityHigh,
  medium:   styles.priorityMedium,
  low:      styles.priorityLow,
  info:     styles.priorityInfo,
}

const STATUS_CLASS = {
  new:          styles.statusNew,
  acknowledged: styles.statusAcknowledged,
  snoozed:      styles.statusSnoozed,
  resolved:     styles.statusResolved,
}

/**
 * Renders a priority pill or a status pill.
 * Pass exactly one of: priority | status
 *
 * Props:
 *   priority — 'critical' | 'high' | 'medium' | 'low' | 'info'
 *   status   — 'new' | 'acknowledged' | 'snoozed' | 'resolved'
 */
export default function AlertBadge({ priority, status }) {
  if (priority) {
    const cfg = resolvePriority(priority)
    const tokenCls = PRIORITY_CLASS[priority] ?? styles.priorityInfo
    return (
      <span className={`${styles.badge} ${styles.priorityBadge} ${tokenCls}`}>
        {cfg.label}
      </span>
    )
  }

  if (status) {
    const cfg = resolveStatus(status)
    const tokenCls = STATUS_CLASS[status] ?? styles.statusNew
    return (
      <span className={`${styles.badge} ${styles.statusBadge} ${tokenCls}`}>
        {cfg.pulse && (
          <span className={`${styles.badgeDot} ${styles.pulseDot}`} />
        )}
        {cfg.label}
      </span>
    )
  }

  return null
}
