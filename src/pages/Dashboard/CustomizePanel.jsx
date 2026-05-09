import { useEffect } from 'react'
import { Icon } from '../../components/shared/icons'
import styles from './CustomizePanel.module.css'

const DENSITY_OPTIONS = [
  { key: 'compact',     label: 'Compact' },
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'expanded',    label: 'Expanded' },
]

const SECTIONS = [
  { key: 'alerts',                 label: 'Alerts' },
  { key: 'quickActions',           label: 'Quick Actions' },
  { key: 'opsCommand',             label: 'Operations Command' },
  { key: 'schedulingAwareness',    label: 'Scheduling Awareness' },
  { key: 'weatherIntelligence',    label: 'Weather Intelligence' },
  { key: 'irrigationIntelligence', label: 'Irrigation Intelligence' },
  { key: 'gdd',                    label: 'Growing Degree Days' },
  { key: 'activity',               label: 'Activity Feed' },
  { key: 'calendar',               label: 'Operations Calendar' },
  { key: 'equipmentAlerts',        label: 'Equipment Alerts' },
  { key: 'upcomingApplications',   label: 'Upcoming Applications' },
  { key: 'recentNotes',            label: 'Recent Notes' },
]

export default function CustomizePanel({ prefs, onClose, setDensity, toggleSection }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      <div className={styles.panel} role="dialog" aria-label="Customize dashboard">

        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Customize Dashboard</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className={styles.panelBody}>

          {/* ── Density ── */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Density</span>
            <div className={styles.densityRow}>
              {DENSITY_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  className={`${styles.densityBtn} ${prefs.density === opt.key ? styles.densityBtnActive : ''}`}
                  onClick={() => setDensity(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Visible Sections ── */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Visible Sections</span>
            <ul className={styles.toggleList}>
              {SECTIONS.map(sec => (
                <li
                  key={sec.key}
                  className={styles.toggleRow}
                  onClick={() => toggleSection(sec.key)}
                  role="switch"
                  aria-checked={prefs.visibility[sec.key]}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') toggleSection(sec.key) }}
                >
                  <span className={`${styles.toggleLabel} ${!prefs.visibility[sec.key] ? styles.toggleLabelOff : ''}`}>
                    {sec.label}
                  </span>
                  <span className={`${styles.toggle} ${prefs.visibility[sec.key] ? styles.toggleOn : ''}`}>
                    <span className={styles.toggleThumb} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </>
  )
}
