// Phase 13 — Schedule tab.
//
// Phase E.7 — Simplify the page: the Annual Calendar is now the only
// expanded surface. Today's Schedule (E.2) and Weekly Schedule Editor
// move into native <details> sections so they're available but don't
// crowd a new supervisor. <details> beats a custom Collapsible: it's
// accessible by default, persists the open state across re-renders,
// and works on every browser/keyboard.

import AnnualScheduleCalendar from './AnnualScheduleCalendar'
import DailyScheduleEditor    from './DailyScheduleEditor'
import WeeklyScheduleEditor   from './WeeklyScheduleEditor'
import styles from './EmployeeScheduleTab.module.css'

export default function EmployeeScheduleTab() {
  return (
    <>
      <AnnualScheduleCalendar />

      <p className={styles.layerHint}>
        <strong>Recurring defaults</strong> are the normal weekly pattern.
        Calendar changes override them for specific dates.
      </p>

      <details className={styles.secondarySection}>
        <summary className={styles.secondarySummary}>
          Quick Today View
          <span className={styles.secondaryHint}>· Today's roster (also editable on the calendar)</span>
        </summary>
        <div className={styles.secondaryBody}>
          <DailyScheduleEditor />
        </div>
      </details>

      <details className={styles.secondarySection}>
        <summary className={styles.secondarySummary}>
          Recurring Defaults
          <span className={styles.secondaryHint}>· Weekly schedule (Monday–Sunday baseline)</span>
        </summary>
        <div className={styles.secondaryBody}>
          <WeeklyScheduleEditor />
        </div>
      </details>
    </>
  )
}
