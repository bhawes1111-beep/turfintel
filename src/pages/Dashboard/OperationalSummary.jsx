import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOperations } from '../../utils/operations/OperationsContext'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useRepairsData } from '../../utils/repairs/repairsStore'
import { SPRAY_RECORDS } from '../../data/spray'
import { aggregateAll } from '../../utils/activity/activityBuilder'
import { SEVERITY_TOKENS } from '../../utils/intelligence/severity'
import { EmptyState } from '../../components/shared/EmptyState'
import styles from './OperationalSummary.module.css'

// ── Summary builder ───────────────────────────────────────────────────────────
// Returns an array of { icon, text, severity } briefing items derived from
// real operational data. Items are ordered by operational relevance.

function buildSummaryItems(alerts, { serviceLog = [], repairs = [], allActivities = [] } = {}) {
  const items = []

  // 1. Alert status — derived from OperationsContext (respects dismissals)
  // No route: alerts are visible on the same dashboard page
  const criticalHigh = alerts.filter(a => a.priority === 'critical' || a.priority === 'high')
  if (criticalHigh.length > 0) {
    items.push({
      icon:     '⚠️',
      text:     `${criticalHigh.length} high-priority alert${criticalHigh.length > 1 ? 's' : ''} require attention`,
      severity: 'critical',
    })
  } else if (alerts.length > 0) {
    items.push({
      icon:     '📋',
      text:     `${alerts.length} advisory ${alerts.length > 1 ? 'alerts' : 'alert'} — no critical issues`,
      severity: 'info',
    })
  } else {
    items.push({
      icon:     '✓',
      text:     'All systems clear — no active alerts',
      severity: 'good',
    })
  }

  // 2. Disease pressure — alert module tag, most urgent first
  const diseaseAlerts = alerts
    .filter(a => a.module === 'disease' && (a.priority === 'critical' || a.priority === 'high'))
  if (diseaseAlerts.length > 0) {
    items.push({
      icon:     '🔬',
      text:     diseaseAlerts[0].title,
      severity: 'warning',
      route:    '/disease',
    })
  }

  // 3. Weather advisory — alert module tag
  // No route: weather intelligence is visible on the same dashboard page
  const weatherAlert = alerts.find(a => a.module === 'weather')
  if (weatherAlert) {
    items.push({
      icon:     '🌤️',
      text:     weatherAlert.title,
      severity: weatherAlert.priority === 'high' || weatherAlert.priority === 'critical'
        ? 'warning'
        : 'info',
    })
  }

  // 4. Irrigation repairs — open / in-progress / parts-needed
  // Phase 5.1c: repairs is now the live D1-backed truth from repairsStore.
  const openRepairs   = repairs.filter(r => r.status !== 'completed')
  const highRepairs   = openRepairs.filter(r => r.priority === 'high')
  if (openRepairs.length > 0) {
    const suffix = highRepairs.length > 0
      ? ` — ${highRepairs.length} high priority`
      : ''
    items.push({
      icon:     '💧',
      text:     `${openRepairs.length} irrigation repair${openRepairs.length > 1 ? 's' : ''} open${suffix}`,
      severity: highRepairs.length > 0 ? 'critical' : 'caution',
      route:    '/irrigation',
    })
  } else {
    items.push({
      icon:     '💧',
      text:     'All irrigation repairs resolved',
      severity: 'good',
    })
  }

  // 5. Equipment maintenance — overdue or critical-open
  // Phase 5.1a: serviceLog is the live D1-backed truth from equipmentStore.
  const overdueItems = serviceLog.filter(l =>
    l.status === 'overdue' || (l.status === 'open' && l.priority === 'critical')
  )
  if (overdueItems.length > 0) {
    items.push({
      icon:     '⚙️',
      text:     `${overdueItems.length} equipment service item${overdueItems.length > 1 ? 's' : ''} overdue`,
      severity: 'warning',
      route:    '/equipment',
    })
  } else {
    items.push({
      icon:     '⚙️',
      text:     'Equipment maintenance up to date',
      severity: 'good',
    })
  }

  // 6. Planned spray applications
  const plannedApps = SPRAY_RECORDS.filter(r => r.status === 'planned')
  if (plannedApps.length > 0) {
    items.push({
      icon:     '🌿',
      text:     `${plannedApps.length} spray application${plannedApps.length > 1 ? 's' : ''} planned this season`,
      severity: 'info',
      route:    '/spray',
    })
  }

  // 7. Recent operational activity — last 7 days
  const recentCount = allActivities.filter(a => {
    return (Date.now() - new Date(a.timestamp).getTime()) / 86_400_000 <= 7
  }).length
  if (recentCount > 0) {
    items.push({
      icon:     '🕐',
      text:     `${recentCount} operation${recentCount > 1 ? 's' : ''} logged in the past 7 days`,
      severity: 'info',
      route:    '/activity',
    })
  }

  return items
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperationalSummary() {
  const { state }      = useOperations()
  const { serviceLog } = useEquipmentData()
  const { repairs }    = useRepairsData()
  const navigate       = useNavigate()

  const allActivities = useMemo(
    () => aggregateAll({ serviceLog, repairs }),
    [serviceLog, repairs],
  )

  const items = useMemo(
    () => buildSummaryItems(
      state.alerts.filter(a => a.status !== 'resolved'),
      { serviceLog, repairs, allActivities },
    ),
    [state.alerts, serviceLog, repairs, allActivities],
  )

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className={styles.osWrap}>
      <p className={styles.osDate}>{dateLabel}</p>
      <div className={styles.osList}>
        {items.length === 0 && (
          <EmptyState
            compact
            title="No briefing items today."
            description="Today's operational summary will populate as alerts, repairs, and applications come in."
          />
        )}
        {items.map((item, i) => {
          const meta = SEVERITY_TOKENS[item.severity] ?? SEVERITY_TOKENS.info
          const Tag  = item.route ? 'button' : 'div'
          return (
            <Tag
              key={i}
              className={`${styles.osItem}${item.route ? ` ${styles.osItemClickable}` : ''}`}
              onClick={item.route ? () => navigate(item.route) : undefined}
            >
              <span
                className={styles.osDot}
                style={{ background: meta.color }}
                title={item.severity}
              />
              <span className={styles.osIcon}>{item.icon}</span>
              <span className={styles.osText}>{item.text}</span>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
