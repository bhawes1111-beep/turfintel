import { Link } from 'react-router-dom'
import { aggregateAll } from '../../utils/activity/activityBuilder'
import {
  getModuleIcon,
  getSeverityMeta,
  formatRelativeTime,
  formatActivityDate,
} from '../../utils/activity/activityFormatters'
import styles from './RecentActivity.module.css'

const RECENT = aggregateAll().slice(0, 10)

export default function RecentActivity() {
  return (
    <div className={styles.raWrap}>
      <div className={styles.raList}>
        {RECENT.map(a => {
          const severityMeta = getSeverityMeta(a.severity)
          const icon         = getModuleIcon(a.module)
          return (
            <div key={a.id} className={styles.raRow}>
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
            </div>
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
