import { useState, useEffect } from 'react'
import { useCourse } from '../../context/CourseContext'
import { useAppPrefs } from '../../utils/prefs/useAppPrefs'
import styles from './PageShell.module.css'

/**
 * PageShell — shared workspace wrapper.
 *
 * Header structure (Phase 2.0):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [title]                          [actions] [courseBadge] │
 *   │ [description]                                            │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ [tab nav — dropdown OR button row per pageNavStyle]      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ children (content area)                                  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ secondary (optional footer slot)                         │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Props (all optional except title):
 *   title          — page title (required)
 *   description    — short subtitle below the title
 *   actions        — JSX rendered in the header right (next to course badge)
 *   tabs           — array of section labels
 *   activeTab      — current section label
 *   onTabChange    — (tab) => void
 *   secondary      — optional JSX footer block below the main content area
 *
 * Tab nav switcher is driven by useAppPrefs().pageNavStyle:
 *   'dropdown' (default) — current dropdown menu
 *   'buttons'            — pill-row across the top
 *
 * Backward-compatible: all new props are optional. Existing call sites
 * that pass only title/tabs/activeTab/onTabChange render identically.
 */
export default function PageShell({
  title,
  description,
  actions,
  tabs,
  activeTab,
  onTabChange,
  secondary,
  children,
}) {
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
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{title}</h1>
          {description && (
            <p className={styles.description}>{description}</p>
          )}
        </div>
        <div className={styles.headerRight}>
          {actions && (
            <div className={styles.actions}>{actions}</div>
          )}
          <span className={styles.courseBadge}>{activeCourse.name}</span>
        </div>
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

      {secondary && (
        <div className={styles.secondary}>
          {secondary}
        </div>
      )}
    </div>
  )
}
