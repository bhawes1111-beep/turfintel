import styles from './expandable.module.css'

export default function ExpandableSection({ expanded, children }) {
  return (
    <div
      className={`${styles.esOuter} ${expanded ? styles.esExpanded : ''}`}
      aria-hidden={!expanded}
    >
      <div className={styles.esInner}>
        {children}
      </div>
    </div>
  )
}
