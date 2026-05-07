import { useCourse } from '../../context/CourseContext'
import styles from './PageShell.module.css'

export default function PageShell({ title, tabs, activeTab, onTabChange, children }) {
  const { activeCourse } = useCourse()

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.courseBadge}>{activeCourse.name}</span>
      </div>

      {tabs && tabs.length > 0 && (
        <div className={styles.tabBar}>
          {tabs.map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
