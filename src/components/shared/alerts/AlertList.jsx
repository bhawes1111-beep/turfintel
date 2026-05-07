import styles from './Alerts.module.css'
import AlertCard from './AlertCard'
import { PRIORITY_ORDER, STATUS_ORDER, resolvePriority, resolveStatus, MODULE_LABELS } from './alertTokens'

function groupAlerts(alerts, groupBy) {
  if (!groupBy) return [{ key: null, label: null, items: alerts }]

  const map = {}

  alerts.forEach(alert => {
    let key
    if (groupBy === 'priority') key = alert.priority ?? 'info'
    else if (groupBy === 'status') key = alert.status ?? 'new'
    else if (groupBy === 'module') key = alert.module ?? 'other'
    else key = 'all'

    if (!map[key]) map[key] = []
    map[key].push(alert)
  })

  let keys = Object.keys(map)

  if (groupBy === 'priority') {
    keys = keys.sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b))
  } else if (groupBy === 'status') {
    keys = keys.sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
  } else {
    keys = keys.sort()
  }

  return keys.map(key => {
    let label = key
    if (groupBy === 'priority') label = resolvePriority(key).label
    else if (groupBy === 'status') label = resolveStatus(key).label
    else if (groupBy === 'module') label = MODULE_LABELS[key] ?? key
    return { key, label, items: map[key] }
  })
}

/**
 * Renders a list of AlertCard components with optional grouping and empty state.
 *
 * Props:
 *   alerts        — array of alert objects
 *   compact       — bool  passed to AlertCard (default false)
 *   groupBy       — 'priority' | 'status' | 'module' | null (default null)
 *   onAcknowledge — (id) => void  optional
 *   onSnooze      — (id) => void  optional
 *   onDismiss     — (id) => void  optional
 *   emptyMessage  — string (default "No alerts at this time.")
 *   emptyIcon     — string emoji (default "✓")
 */
export default function AlertList({
  alerts = [],
  compact = false,
  groupBy = null,
  onAcknowledge,
  onSnooze,
  onDismiss,
  emptyMessage = 'No alerts at this time.',
  emptyIcon = '✓',
}) {
  if (alerts.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>{emptyIcon}</div>
        <div className={styles.emptyStateMessage}>{emptyMessage}</div>
      </div>
    )
  }

  const groups = groupAlerts(alerts, groupBy)

  return (
    <div className={styles.alertList}>
      {groups.map(group => (
        <div key={group.key ?? 'all'} className={group.label ? styles.alertGroup : undefined}>
          {group.label && (
            <div className={styles.alertGroupHeader}>
              <span className={styles.alertGroupLabel}>{group.label}</span>
              <span className={styles.alertGroupCount}>{group.items.length}</span>
            </div>
          )}
          {group.items.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              compact={compact}
              onAcknowledge={onAcknowledge}
              onSnooze={onSnooze}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
