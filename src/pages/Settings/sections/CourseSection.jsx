/**
 * CourseSection — course/facility configuration.
 * Reads Crosswinds from CourseContext (real config). Editing is
 * backend-dependent for now.
 */

import { useCourse } from '../../../context/CourseContext'
import styles from '../Settings.module.css'

export default function CourseSection() {
  const { activeCourse } = useCourse()
  const geo = activeCourse?.geo

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Course Settings</p>
      </div>
      <p className={styles.cardDesc}>Per-course configuration for the active facility.</p>

      <div className={styles.pendingBanner}>
        <strong>Available when backend is connected.</strong> Course details are read-only here.
        Editing the active course requires a multi-tenant data store.
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Course Name</span>
        </div>
        <span className={styles.rowValue}>{activeCourse?.name ?? '—'}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Anchor Coordinates</span>
          <span className={styles.rowDesc}>WGS-84 decimal degrees</span>
        </div>
        <span className={styles.rowValue}>
          {geo
            ? `${geo.center.lat.toFixed(6)}, ${geo.center.lng.toFixed(6)}`
            : 'Not configured'}
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Bounding Box</span>
          <span className={styles.rowDesc}>N / S / E / W</span>
        </div>
        <span className={styles.rowValue}>
          {geo
            ? `${geo.bounds.north.toFixed(4)} · ${geo.bounds.south.toFixed(4)} · ${geo.bounds.east.toFixed(4)} · ${geo.bounds.west.toFixed(4)}`
            : 'Not configured'}
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Default Map Zoom</span>
        </div>
        <span className={styles.rowValue}>{geo?.defaultZoom ?? '—'}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Aerial Image</span>
          <span className={styles.rowDesc}>Drop into <code>public{geo?.aerialUrl ?? '/courses/...'}</code></span>
        </div>
        <span className={styles.rowValue}>{geo?.aerialUrl ?? 'Not configured'}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Time Zone</span>
        </div>
        <span className={styles.rowValue}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Default Routing</span>
          <span className={styles.rowDesc}>Set per-day on the Operations Board</span>
        </div>
        <span className={styles.rowValue}>Press &amp; Roll</span>
      </div>
    </div>
  )
}
