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

const TIER_LABEL = {
  desktop: 'Editing Desktop Layout',
  tablet:  'Editing Tablet Layout',
  mobile:  'Editing Mobile Layout',
}

export default function CustomizePanel({
  prefs,
  tier,
  onClose,
  setDensity,
  toggleSection,
  resetCurrentLayout,
}) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop only on mobile (panel is non-modal on desktop/tablet so cards
          remain interactive for drag-to-resize). */}
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      <div className={styles.panel} role="dialog" aria-label="Customize dashboard">

        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Customize Dashboard</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Device tier indicator */}
        <div className={styles.tierBar}>
          <span className={styles.tierDot} data-tier={tier} />
          <span className={styles.tierText}>{TIER_LABEL[tier]}</span>
        </div>

        <div className={styles.panelBody}>

          {/* ── Drag hint (desktop/tablet only) ── */}
          {tier !== 'mobile' && (
            <div className={styles.hint}>
              Drag card edges or corners to resize.
            </div>
          )}

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
            <span className={styles.sectionLabel}>Visible Cards</span>
            <ul className={styles.toggleList}>
              {SECTIONS.map(sec => {
                const isVisible = prefs.visibility[tier][sec.key] !== false
                return (
                  <li
                    key={sec.key}
                    className={styles.toggleRow}
                    onClick={() => toggleSection(sec.key)}
                    role="switch"
                    aria-checked={isVisible}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        toggleSection(sec.key)
                      }
                    }}
                  >
                    <span className={`${styles.toggleLabel} ${!isVisible ? styles.toggleLabelOff : ''}`}>
                      {sec.label}
                    </span>
                    <span className={`${styles.toggle} ${isVisible ? styles.toggleOn : ''}`}>
                      <span className={styles.toggleThumb} />
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ── Reset current layout ── */}
          <div className={styles.section}>
            <button
              className={styles.resetBtn}
              onClick={resetCurrentLayout}
              title={`Reset ${tier} layout to defaults`}
            >
              Reset Current Layout
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
