import { useEffect, useState } from 'react'
import { getMediaByModule, getThumbnailBlob } from '../../utils/media/mediaStore'
import {
  getModuleIcon,
  getModuleLabel,
  getSeverityMeta,
  formatRelativeTime,
  formatActivityDate,
} from '../../utils/activity/activityFormatters'
import styles from './activity.module.css'

export default function ActivityCard({ activity }) {
  const [thumbUrls, setThumbUrls] = useState([])
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

  return (
    <div className={styles.acCard}>
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
    </div>
  )
}
