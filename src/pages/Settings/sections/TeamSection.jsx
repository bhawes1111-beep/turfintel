/**
 * TeamSection — user roles, access levels, invites, permission groups.
 * Fully backend-dependent. Section structure shown for layout preview.
 */

import styles from '../Settings.module.css'

export default function TeamSection() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Team &amp; Permissions</p>
      </div>
      <p className={styles.cardDesc}>Manage who has access to TurfIntel and what they can do.</p>

      <div className={styles.pendingBanner}>
        <strong>Available when backend is connected.</strong> User roles, invitations,
        and permission groups require an authentication system.
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Users</span>
          <span className={styles.rowDesc}>List of accounts with access to this course.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Invite Users</span>
          <span className={styles.rowDesc}>Send email invitations.</span>
        </div>
        <button type="button" className={styles.actionBtn} disabled>+ Invite</button>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Permission Groups</span>
          <span className={styles.rowDesc}>Superintendent, Crew Lead, Crew, Read-only.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Access Levels</span>
          <span className={styles.rowDesc}>Per-module read / write controls.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>
    </div>
  )
}
