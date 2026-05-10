import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { aggregateAll } from '../../utils/activity/activityBuilder'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useRepairsData } from '../../utils/repairs/repairsStore'
import {
  getModuleIcon,
  getSeverityMeta,
  formatRelativeTime,
  formatActivityDate,
} from '../../utils/activity/activityFormatters'
import { EmptyState } from '../../components/shared/EmptyState'
import styles from './RecentActivity.module.css'

const MODULE_ROUTES = {
  spray:      '/spray',
  irrigation: '/irrigation',
  equipment:  '/equipment',
  alerts:     '/dashboard',
}

function getRoute(module) {
  return MODULE_ROUTES[module] ?? '/dashboard'
}

export default function RecentActivity() {
  const navigate            = useNavigate()
  const { serviceLog }      = useEquipmentData()
  const { repairs }         = useRepairsData()

  const RECENT = useMemo(
    () => aggregateAll({ serviceLog, repairs }).slice(0, 10),
    [serviceLog, repairs],
  )

  return (
    <div className={styles.raWrap}>
      <div className={styles.raList}>
        {RECENT.length === 0 && (
          <EmptyState
            compact
            title="No recent activity."
            description="Activity from sprays, irrigation, equipment, and alerts will appear here."
          />
        )}
        {RECENT.map(a => {
          const severityMeta = getSeverityMeta(a.severity)
          const icon         = getModuleIcon(a.module)
          return (
            <button
              key={a.id}
              className={styles.raRow}
              onClick={() => navigate(getRoute(a.module))}
            >
              <span className={styles.raIcon}>{icon}</span>
              <span className={styles.raTitle} title={a.title}>
                {a.title}
              </span>
              {a.attachments.length > 0 && (
                <span className={styles.raAttach} title="Has attachments">📎</span>
              )}
              <span
                className={styles.raTime}
                title={formatActivityDate(a.timestamp)}
              >
                {formatRelativeTime(a.timestamp)}
              </span>
              <span
                className={styles.raDot}
                style={{ background: severityMeta.color }}
                title={severityMeta.label}
              />
            </button>
          )
        })}
      </div>

      <div className={styles.raFooter}>
        <Link to="/activity" className={styles.raViewAll}>
          View All Activity →
        </Link>
      </div>
    </div>
  )
}
