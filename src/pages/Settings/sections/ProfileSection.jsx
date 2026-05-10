/**
 * ProfileSection — user profile fields.
 * Backend-dependent. All fields disabled until auth/user system is wired.
 */

import styles from '../Settings.module.css'

export default function ProfileSection() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>Profile</p>
      </div>
      <p className={styles.cardDesc}>Personal account details for the signed-in user.</p>

      <div className={styles.pendingBanner}>
        <strong>Available when backend is connected.</strong> User profile fields require
        an authentication system. They are shown here as a preview of the final layout.
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Name</span>
        </div>
        <input className={styles.input} type="text" placeholder="—" disabled />
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Role / Title</span>
        </div>
        <input className={styles.input} type="text" placeholder="—" disabled />
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Email</span>
        </div>
        <input className={styles.input} type="email" placeholder="—" disabled />
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Phone</span>
        </div>
        <input className={styles.input} type="tel" placeholder="—" disabled />
      </div>

      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Course / Facility</span>
        </div>
        <input className={styles.input} type="text" placeholder="—" disabled />
      </div>
    </div>
  )
}
