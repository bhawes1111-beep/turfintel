import { readFileSync } from 'node:fs'

const shiftApi = readFileSync('worker/api/shiftTemplates.js', 'utf8')
const schedulesApi = readFileSync('worker/api/schedules.js', 'utf8')
const calendar = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.jsx', 'utf8')
const migration = readFileSync('worker/migrations/0063_shift_template_applications.sql', 'utf8')

const checks = [
  {
    name: 'migration creates shift/date application tracker',
    ok: /CREATE TABLE IF NOT EXISTS shift_template_applications/.test(migration) &&
      /template_id\s+TEXT NOT NULL/.test(migration) &&
      /effective_date\s+TEXT NOT NULL/.test(migration) &&
      /UNIQUE INDEX[\s\S]*course_id,\s*template_id,\s*effective_date/.test(migration),
  },
  {
    name: 'applying a shift records linked dates',
    ok: /async function recordShiftTemplateApplication/.test(shiftApi) &&
      /ON CONFLICT\(course_id, template_id, effective_date\)/.test(shiftApi) &&
      /trackApplication:\s*true/.test(shiftApi),
  },
  {
    name: 'replace apply removes other shift links for that date first',
    ok: /async function unlinkShiftTemplateApplicationsForDate/.test(shiftApi) &&
      /if \(replace\) await unlinkShiftTemplateApplicationsForDate/.test(shiftApi),
  },
  {
    name: 'editing shift rows refreshes linked applied dates',
    ok: /SELECT effective_date\s+FROM shift_template_applications/.test(shiftApi) &&
      /for \(const linked of linkedDates\)/.test(shiftApi) &&
      /replace:\s*true,\s*\n\s*trackApplication:\s*false/.test(shiftApi) &&
      /propagatedDates: linkedDates\.map/.test(shiftApi),
  },
  {
    name: 'deleting a shift removes application links',
    ok: /DELETE FROM shift_template_applications WHERE template_id = \?/.test(shiftApi),
  },
  {
    name: 'manual schedule edits unlink dates from shift propagation',
    ok: /async function unlinkShiftTemplateApplicationsForDate/.test(schedulesApi) &&
      /createEmployeeScheduleOverride[\s\S]*unlinkShiftTemplateApplicationsForDate/.test(schedulesApi) &&
      /updateEmployeeScheduleOverride[\s\S]*unlinkShiftTemplateApplicationsForDate/.test(schedulesApi) &&
      /deleteEmployeeScheduleOverride[\s\S]*unlinkShiftTemplateApplicationsForDate/.test(schedulesApi) &&
      /copyEmployeeSchedulesDay[\s\S]*unlinkShiftTemplateApplicationsForDate/.test(schedulesApi),
  },
  {
    name: 'shift edit UI reports refreshed applied dates',
    ok: /saved\?\.propagatedDates\?\.length/.test(calendar) &&
      /refreshed \$\{propagatedCount\} applied date/.test(calendar),
  },
]

let failed = 0
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS ${check.name}`)
  } else {
    failed += 1
    console.error(`FAIL ${check.name}`)
  }
}

if (failed > 0) process.exit(1)
