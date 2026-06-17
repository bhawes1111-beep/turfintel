// Phase 13 — Schedule tab.
//
// The legacy CrewSchedule view (Phase 4) is replaced by the editable
// WeeklyScheduleEditor. The new editor writes to the persistent
// employee_schedules table; the Daily Assignment Board pulls its
// roster from this data with active-employee fallback when no
// schedules exist yet.
//
// Phase E.2 — A new DailyScheduleEditor surface mounts ABOVE the
// weekly grid so a supervisor can mark someone off / sick / vacation
// for one specific date without touching the recurring schedule. The
// weekly editor below remains the source of truth for recurring rules.

import DailyScheduleEditor  from './DailyScheduleEditor'
import WeeklyScheduleEditor from './WeeklyScheduleEditor'

export default function EmployeeScheduleTab() {
  return (
    <>
      <DailyScheduleEditor />
      <WeeklyScheduleEditor />
    </>
  )
}
