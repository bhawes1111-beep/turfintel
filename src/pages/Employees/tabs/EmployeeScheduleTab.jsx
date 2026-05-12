// Phase 4 — Schedule tab.
//
// Reuses the existing CrewSchedule view that previously lived inside
// OperationsBoard. Centralizing schedule view inside Employee Management
// removes the personnel-management concern from Operations.

import CrewSchedule from '../../Crew/tabs/CrewSchedule'

export default function EmployeeScheduleTab() {
  return <CrewSchedule />
}
