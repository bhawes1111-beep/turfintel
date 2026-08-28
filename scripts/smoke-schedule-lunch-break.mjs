import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [helper, weekly, daily, annual, workerSchedules, shiftTemplates, migration, timeMigration] = await Promise.all([
  read('src/utils/schedules/scheduleHours.js'),
  read('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx'),
  read('src/pages/Employees/tabs/DailyScheduleEditor.jsx'),
  read('src/pages/Employees/tabs/AnnualScheduleCalendar.jsx'),
  read('worker/api/schedules.js'),
  read('worker/api/shiftTemplates.js'),
  read('worker/migrations/0073_schedule_lunch_breaks.sql'),
  read('worker/migrations/0074_schedule_lunch_times.sql'),
])

assert.match(helper, /DEFAULT_LUNCH_BREAK_MINUTES = 30/, 'shared helper defaults lunch to 30 minutes')
assert.match(helper, /gross < 8/, 'short shifts do not deduct lunch')
assert.match(helper, /lunchBreakMinutes/, 'paid hours accept a per-shift lunch value')
assert.match(weekly, /Auto 30-minute lunch/, 'weekly editor keeps the automatic lunch checkbox')
assert.match(weekly, /Lunch out/i, 'weekly editor exposes manual lunch out time')
assert.match(weekly, /Lunch in/i, 'weekly editor exposes manual lunch in time')
assert.match(weekly, /lunchBreakMinutes: 30/, 'new weekly shifts default lunch on')
assert.match(daily, /lunchStartTime/, 'date-specific schedule editor persists manual lunch times')
assert.doesNotMatch(daily, /onChange=\{e => applyEdit\(row, \{ (?:startTime|endTime|lunchStartTime|lunchEndTime)/, 'daily time inputs do not save on every keystroke')
assert.match(daily, /onBlur=\{e =>/, 'daily time inputs save after entry is complete')
assert.match(annual, /lunchToggle/, 'annual schedule and shift manager expose lunch controls')
assert.doesNotMatch(annual, /onChange=\{e => applyEdit\(row, \{ (?:startTime|endTime|lunchStartTime|lunchEndTime)/, 'annual day editor does not save times on every keystroke')
assert.match(workerSchedules, /auto_lunch_break/, 'schedule API stores and copies automatic lunch mode')
assert.match(shiftTemplates, /lunch_start_time/, 'shift templates retain manual lunch times')
assert.match(migration, /employee_schedules[\s\S]*employee_schedule_overrides[\s\S]*shift_template_rows/, 'migration adds lunch to all active schedule tables')
assert.match(timeMigration, /lunch_start_time[\s\S]*lunch_end_time[\s\S]*auto_lunch_break/, 'manual lunch migration adds both times and automatic mode')

console.log('Schedule lunch break smoke passed')
