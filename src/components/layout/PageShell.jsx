import { useState, useEffect } from 'react'
import { useCourse } from '../../context/CourseContext'
import styles from './PageShell.module.css'

export default function PageShell({ title, tabs, activeTab, onTabChange, children }) {
  const { activeCourse } = useCourse()
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.courseBadge}>{activeCourse.name}</span>
      </div>

      {tabs && tabs.length > 0 && (
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
