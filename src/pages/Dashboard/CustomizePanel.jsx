import { useEffect } from 'react'
import { Icon } from '../../components/shared/icons'
import { SIZEABLE_CARDS, LOCKED_FULL_WIDTH } from '../../utils/dashboard/useDashboardPrefs'
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

const SIZE_OPTIONS_DESKTOP = [
  { key: 'default',   label: 'Default',     icon: '▢' },
  { key: 'small',     label: 'Small',       icon: '▪' },
  { key: 'wide',      label: 'Wide',        icon: '▬' },
  { key: 'tall',      label: 'Tall',        icon: '▮' },
  { key: 'full',      label: 'Full',        icon: '■' },
  { key: 'wide-tall', label: 'Wide + Tall', icon: '▣' },
]

// Tablet caps at 'wide' — no full-width spanning.
const SIZE_OPTIONS_TABLET = SIZE_OPTIONS_DESKTOP.filter(o => o.key !== 'full')

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
  setSize,
  resetCurrentLayout,
}) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sizeOptions = tier === 'tablet' ? SIZE_OPTIONS_TABLET : SIZE_OPTIONS_DESKTOP
  const showSizeColumn = tier !== 'mobile'

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

        {/* Device tier indicator */}
        <div className={styles.tierBar}>
          <span className={styles.tierDot} data-tier={tier} />
          <span className={styles.tierText}>{TIER_LABEL[tier]}</span>
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

          {/* ── Sections (visibility + size) ── */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              {showSizeColumn ? 'Cards (visibility + size)' : 'Visible Cards'}
            </span>
            <ul className={styles.toggleList}>
              {SECTIONS.map(sec => {
                const isVisible    = prefs.visibility[tier][sec.key] !== false
                const isSizeable   = SIZEABLE_CARDS.includes(sec.key)
                const isLocked     = LOCKED_FULL_WIDTH.includes(sec.key)
                const currentSize  = prefs.sizes[tier]?.[sec.key] ?? 'default'

                return (
                  <li key={sec.key} className={styles.cardRow}>
                    <div
                      className={styles.cardRowMain}
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
                    </div>

                    {showSizeColumn && isVisible && isSizeable && (
                      <div className={styles.sizeRow}>
                        {sizeOptions.map(opt => (
                          <button
                            key={opt.key}
                            className={`${styles.sizeBtn} ${currentSize === opt.key ? styles.sizeBtnActive : ''}`}
                            onClick={() => setSize(sec.key, opt.key)}
                            title={opt.label}
                            aria-label={opt.label}
                          >
                            <span className={styles.sizeIcon}>{opt.icon}</span>
                            <span className={styles.sizeLabel}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {showSizeColumn && isVisible && isLocked && (
                      <div className={styles.lockedNote}>
                        Full-width composite — locked
                      </div>
                    )}
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
