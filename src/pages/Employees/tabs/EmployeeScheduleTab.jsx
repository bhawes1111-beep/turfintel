// Phase 13 — Schedule tab.
//
// The legacy CrewSchedule view (Phase 4) is replaced by the editable
// WeeklyScheduleEditor. The new editor writes to the persistent
// employee_schedules table; the Daily Assignment Board pulls its
// roster from this data with active-employee fallback when no
// schedules exist yet.

import WeeklyScheduleEditor from './WeeklyScheduleEditor'

export default function EmployeeScheduleTab() {
  return <WeeklyScheduleEditor />
}
