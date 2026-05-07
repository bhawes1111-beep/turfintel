import styles from './Calendar.module.css'
import { MONTH_NAMES } from './calendarTokens'

/**
 * Props:
 *   year     — number (controlled)
 *   month    — number (0-indexed, controlled)
 *   onPrev   — () => void
 *   onNext   — () => void
 *   children — optional slot rendered after the title (e.g. a view toggle)
 */
export default function MonthNavigation({ year, month, onPrev, onNext, children }) {
  return (
    <div className={styles.viewToggleWrap}>
      <div className={styles.monthNav}>
        <button className={styles.navBtn} onClick={onPrev} aria-label="Previous month">‹</button>
        <span className={styles.monthTitle}>{MONTH_NAMES[month]} {year}</span>
        <button className={styles.navBtn} onClick={onNext} aria-label="Next month">›</button>
      </div>
      {children}
    </div>
  )
}
