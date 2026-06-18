// Phase 13 — Schedule tab.
//
// Phase E.2 — DailyScheduleEditor mounts above the weekly grid for
// per-date "off / sick / vacation" overrides.
// Phase E.5 — AnnualScheduleCalendar mounts at the top: month view,
// drag-to-copy days, shift-template apply/save. The Daily editor +
// Weekly grid stay in place underneath as alternative surfaces.

import AnnualScheduleCalendar from './AnnualScheduleCalendar'
import DailyScheduleEditor    from './DailyScheduleEditor'
import WeeklyScheduleEditor   from './WeeklyScheduleEditor'

export default function EmployeeScheduleTab() {
  return (
    <>
      <AnnualScheduleCalendar />
      <DailyScheduleEditor />
      <WeeklyScheduleEditor />
    </>
  )
}
