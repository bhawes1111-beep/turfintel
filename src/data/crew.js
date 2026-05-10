// Crew data — empty in production until live records are imported.
//
// Schemas (preserved for reference and future re-population):
//
// HOURS_LOG  — [{ id, employeeId, employeeName, department, role, date,
//                 startTime, endTime, totalHours, overtimeHours, hourlyRate,
//                 assignedTask, assignedArea, status, notes }]
// SCHEDULE   — [{ id, employeeId, employeeName, department, role, date,
//                 shiftType, startTime, endTime, scheduledHours,
//                 assignedTask, assignedArea, status, notes }]
// EMPLOYEES  — [{ employeeId, fullName, department, role, status, phone,
//                 email, hireDate, certifications, hourlyRate, assignedArea,
//                 supervisor, languages, profilePhoto, notes }]
// TASKS      — [{ id, title, department, assignedTo, priority, status,
//                 dueDate, estimatedHours, completedHours, assignedArea,
//                 equipment, notes }]

export const HOURS_LOG = []
export const SCHEDULE  = []
export const EMPLOYEES = []
export const TASKS     = []
