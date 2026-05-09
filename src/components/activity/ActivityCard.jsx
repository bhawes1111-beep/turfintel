import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMediaByModule, getThumbnailBlob } from '../../utils/media/mediaStore'
import {
  getModuleIcon,
  getModuleLabel,
  getSeverityMeta,
  formatRelativeTime,
  formatActivityDate,
} from '../../utils/activity/activityFormatters'
import ContextActions from '../contextActions/ContextActions'
import styles from './activity.module.css'

const MODULE_ROUTES = {
  spray:      '/spray',
  irrigation: '/irrigation',
  equipment:  '/equipment',
  alerts:     '/dashboard',
}

export default function ActivityCard({ activity }) {
  const navigate    = useNavigate()
  const [thumbUrls, setThumbUrls] = useState([])
  const [hovered,   setHovered]   = useState(false)
  const sourceId = activity.metadata?.sourceId

  useEffect(() => {
    if (!sourceId) return
    let cancelled = false
    const created = []

    async function load() {
      try {
        const records  = await getMediaByModule(sourceId)
        const images   = records.filter(r => r.type === 'image').slice(0, 3)
        const urls = await Promise.all(images.map(async rec => {
          const blob = await getThumbnailBlob(rec.id)
          if (!blob) return null
          const url = URL.createObjectURL(blob)
          created.push(url)
          return url
        }))
        if (!cancelled) setThumbUrls(urls.filter(Boolean))
      } catch {}
    }
    load()

    return () => {
      cancelled = true
      created.forEach(u => URL.revokeObjectURL(u))
    }
  }, [sourceId])

  const severityMeta = getSeverityMeta(activity.severity)
  const icon         = getModuleIcon(activity.module)
  const moduleLabel  = getModuleLabel(activity.module)

  const route = MODULE_ROUTES[activity.module] ?? '/dashboard'

  return (
    <div
      className={styles.acCard}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.acHeader}>
        <span className={styles.acIcon}>{icon}</span>
        <div className={styles.acTitleGroup}>
          <span className={styles.acTitle}>{activity.title}</span>
          <span
            className={styles.acTimestamp}
            title={formatActivityDate(activity.timestamp)}
          >
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>
        <span
          className={styles.acSeverityBadge}
          style={{
            color:      severityMeta.color,
            background: severityMeta.bg,
            border:     `1px solid ${severityMeta.border}`,
          }}
        >
          {severityMeta.label}
        </span>
      </div>

      {activity.description && (
        <p className={styles.acDescription}>{activity.description}</p>
      )}

      <div className={styles.acFooter}>
        <span className={styles.acModuleTag}>{moduleLabel}</span>
        {activity.metadata?.status && (
          <span className={styles.acStatusTag}>{activity.metadata.status}</span>
        )}
        {thumbUrls.length > 0 && (
          <div className={styles.acThumbStrip}>
            {thumbUrls.map((url, i) => (
              <img key={i} src={url} className={styles.acThumb} alt="" />
            ))}
          </div>
        )}
      </div>

      <ContextActions
        hovered={hovered}
        actions={[{
          id: 'view',
          label: '→ View',
          onClick: () => navigate(route),
          title: `Go to ${activity.module}`,
        }]}
      />
    </div>
  )
}
