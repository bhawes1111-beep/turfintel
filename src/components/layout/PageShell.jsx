import { useState, useEffect } from 'react'
import { useCourse } from '../../context/CourseContext'
import { useAppPrefs } from '../../utils/prefs/useAppPrefs'
import styles from './PageShell.module.css'

/**
 * PageShell — shared page wrapper for all tabbed module pages.
 *
 * Section switcher is driven by the App Preferences > Page Navigation Style
 * preference (turfintel-app-prefs.pageNavStyle):
 *   - 'dropdown' (default) — current dropdown menu
 *   - 'buttons'            — pill-row across the top
 *
 * Every page that already passes `tabs` / `activeTab` / `onTabChange` picks
 * up the new switcher with zero per-page changes.
 */
export default function PageShell({ title, tabs, activeTab, onTabChange, children }) {
  const { activeCourse } = useCourse()
  const { prefs } = useAppPrefs()
  const [dropOpen, setDropOpen] = useState(false)

  useEffect(() => {
    if (!dropOpen) return
    const handler = (e) => { if (e.key === 'Escape') setDropOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dropOpen])

  const handleSelect = (tab) => {
    onTabChange(tab)
    setDropOpen(false)
  }

  const hasTabs       = Array.isArray(tabs) && tabs.length > 0
  const useButtonMode = prefs.pageNavStyle === 'buttons'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.courseBadge}>{activeCourse.name}</span>
      </div>

      {/* ── Button-row navigation ───────────────────────────────────────── */}
      {hasTabs && useButtonMode && (
        <div className={styles.navBarButtons} role="tablist" aria-label={`${title} sections`}>
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`${styles.navButton} ${activeTab === tab ? styles.navButtonActive : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* ── Dropdown navigation (default) ───────────────────────────────── */}
      {hasTabs && !useButtonMode && (
        <div className={styles.navBar}>
          <button
            className={styles.navBarTrigger}
            onClick={() => setDropOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={dropOpen}
          >
            <span className={styles.navBarDot} />
            <span className={styles.navBarCurrent}>{activeTab}</span>
            <span className={`${styles.navBarArrow} ${dropOpen ? styles.navBarArrowOpen : ''}`}>▾</span>
          </button>

          {dropOpen && (
            <div
              className={styles.navBarBackdrop}
              onClick={() => setDropOpen(false)}
              aria-hidden="true"
            />
          )}

          {dropOpen && (
            <ul className={styles.navBarDropdown} role="listbox">
              {tabs.map(tab => (
                <li
                  key={tab}
                  role="option"
                  aria-selected={activeTab === tab}
                  className={`${styles.navBarItem} ${activeTab === tab ? styles.navBarItemActive : ''}`}
                  onClick={() => handleSelect(tab)}
                >
                  {activeTab === tab && <span className={styles.navBarItemDot} />}
                  {tab}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
