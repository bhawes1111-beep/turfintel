/**
 * AppPreferencesSection — app-wide UI preferences.
 *
 * Phase 1 controls:
 *   - Page Navigation Style (dropdown / buttons)  — active, persists to
 *     turfintel-app-prefs and instantly affects this Settings page.
 *   - Theme (dark active; light disabled "Coming soon")
 *   - Sidebar default behavior (read-only — managed by sidebar itself)
 */

import { useAppPrefs } from '../../../utils/prefs/useAppPrefs'
import styles from '../Settings.module.css'

export default function AppPreferencesSection() {
  const { prefs, setPref } = useAppPrefs()

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <p className={styles.cardTitle}>App Preferences</p>
      </div>
      <p className={styles.cardDesc}>UI behavior and theme defaults applied across the app.</p>

      {/* Page Navigation Style */}
      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Page Navigation Style</span>
          <span className={styles.rowDesc}>Choose how multi-section pages display their navigation.</span>
        </div>
        <div className={styles.segmented} role="group" aria-label="Page navigation style">
          <button
            type="button"
            className={`${styles.segmentedBtn} ${prefs.pageNavStyle === 'dropdown' ? styles.segmentedBtnActive : ''}`}
            onClick={() => setPref('pageNavStyle', 'dropdown')}
            aria-pressed={prefs.pageNavStyle === 'dropdown'}
          >
            Dropdown Menu
          </button>
          <button
            type="button"
            className={`${styles.segmentedBtn} ${prefs.pageNavStyle === 'buttons' ? styles.segmentedBtnActive : ''}`}
            onClick={() => setPref('pageNavStyle', 'buttons')}
            aria-pressed={prefs.pageNavStyle === 'buttons'}
          >
            Button Navigation
          </button>
        </div>
      </div>

      {/* Theme */}
      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Theme</span>
          <span className={styles.rowDesc}>App color palette.</span>
        </div>
        <div className={styles.segmented} role="group" aria-label="Theme">
          <button type="button" className={`${styles.segmentedBtn} ${styles.segmentedBtnActive}`} aria-pressed="true">
            Dark
          </button>
          <button type="button" className={styles.segmentedBtn} disabled>
            Light
          </button>
          <span className={styles.segmentedHint}>Light theme coming soon</span>
        </div>
      </div>

      {/* Sidebar default */}
      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Sidebar Default Behavior</span>
          <span className={styles.rowDesc}>First-load state. Toggle from the sidebar header at any time.</span>
        </div>
        <span className={styles.rowValue}>Collapsed</span>
      </div>

      {/* Notifications — backend-dependent */}
      <div className={styles.row}>
        <div className={styles.rowStack}>
          <span className={styles.rowLabel}>Notification Preferences</span>
          <span className={styles.rowDesc}>Available when backend is connected.</span>
        </div>
        <span className={styles.rowValue}>—</span>
      </div>
    </div>
  )
}
