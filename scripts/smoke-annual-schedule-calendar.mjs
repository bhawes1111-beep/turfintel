// Phase E.5 — Annual Schedule Calendar + Shift Templates smoke.
//
//   node scripts/smoke-annual-schedule-calendar.mjs
//
// Pins the data + endpoint + UI shape for the year-round scheduling
// surface. Key invariants:
//
//   • New tables shift_templates + shift_template_rows (migration 0053+).
//   • applyShiftTemplate writes to employee_schedule_overrides ONLY —
//     the recurring weekly grid stays untouched.
//   • copyEmployeeSchedulesDay copies the merged daily roster into
//     overrides for the destination date — also never touches the
//     recurring grid.
//   • New route ordering: /calendar and /copy-day MUST precede the
//     /api/employee-schedules/:id regex; /:id/apply MUST precede
//     /api/shift-templates/:id.
//   • Mutation permissions require canEditAssignments for the new
//     shift-templates prefix (copy-day inherits from existing
//     /api/employee-schedules entry).
//   • UI: month calendar with drag/drop, day editor, template picker,
//     save-as modal, clear-day-overrides button. Destination confirm
//     dialog warns when overrides already exist.
//   • Today's Schedule (E.2) AND Weekly Schedule Editor remain
//     mounted in the Schedule tab.
//   • DAB + kiosk schedule awareness (E.4) is unchanged — still
//     reads from the same employee_schedule_overrides table.
//   • No spray edits.

import { readFileSync, readdirSync } from 'fs'
import {
  isMutationAllowed,
  matchRule,
} from '../worker/lib/mutationPermissions.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIG    = readFileSync('worker/migrations/0054_shift_templates.sql', 'utf8')
const SHIFT  = readFileSync('worker/api/shiftTemplates.js',               'utf8')
const SCHEDS = readFileSync('worker/api/schedules.js',                    'utf8')
const IDX    = readFileSync('worker/index.js',                            'utf8')
const PERM   = readFileSync('worker/lib/mutationPermissions.js',          'utf8')
const STORE  = readFileSync('src/utils/schedules/shiftTemplatesStore.js', 'utf8')
const TAB    = readFileSync('src/pages/Employees/tabs/EmployeeScheduleTab.jsx', 'utf8')
const CAL    = readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.jsx', 'utf8')
const CAL_CSS= readFileSync('src/pages/Employees/tabs/AnnualScheduleCalendar.module.css', 'utf8')
const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')

// ── Migration 0054 ────────────────────────────────────────────────────
section('Migration 0054 — shift_templates + shift_template_rows tables')

assert(/CREATE TABLE IF NOT EXISTS shift_templates/.test(MIG),
  '0054 creates shift_templates table')
for (const col of [
  'id\\s+TEXT PRIMARY KEY',
  'course_id\\s+TEXT NOT NULL',
  'name\\s+TEXT NOT NULL',
  'label\\s+TEXT',
  'description\\s+TEXT',
  'created_at\\s+TEXT NOT NULL',
  'updated_at\\s+TEXT NOT NULL',
]) {
  assert(new RegExp(col).test(MIG), `0054 shift_templates includes: ${col.replace(/\\s.*/, '')}`)
}

assert(/CREATE TABLE IF NOT EXISTS shift_template_rows/.test(MIG),
  '0054 creates shift_template_rows table')
for (const col of [
  'template_id\\s+TEXT NOT NULL',
  'employee_id\\s+TEXT NOT NULL',
  'status\\s+TEXT NOT NULL',
  'start_time\\s+TEXT',
  'end_time\\s+TEXT',
  'role\\s+TEXT',
  'notes\\s+TEXT',
  'sort_order\\s+INTEGER',
]) {
  assert(new RegExp(col).test(MIG), `0054 shift_template_rows includes: ${col.replace(/\\s.*/, '')}`)
}

// UNIQUE name per course (prevents duplicate "A Shift" entries).
assert(/UNIQUE INDEX[\s\S]{0,400}shift_templates\(course_id,\s*name\)/.test(MIG),
  'UNIQUE INDEX on (course_id, name) — no duplicate template names per course')

// Additive — no ALTERs on existing tables.
assert(!/ALTER TABLE employee_schedules\b/i.test(MIG),
  '0054 does NOT ALTER employee_schedules (recurring grid untouched)')
assert(!/ALTER TABLE employee_schedule_overrides/i.test(MIG),
  '0054 does NOT ALTER employee_schedule_overrides')
assert(!/DROP\s+TABLE|DROP\s+COLUMN/i.test(MIG),
  '0054 contains no DROP statements')

// ── Worker shift-template CRUD + apply ────────────────────────────────
section('Worker — shiftTemplates.js CRUD + apply')

for (const fn of [
  'listShiftTemplates', 'getShiftTemplate', 'createShiftTemplate',
  'updateShiftTemplate', 'deleteShiftTemplate', 'applyShiftTemplate',
]) {
  assert(new RegExp(`export async function ${fn}\\b`).test(SHIFT),
    `shiftTemplates exports ${fn}`)
}

// Apply writes ONLY to employee_schedule_overrides (the recurring grid
// stays pristine). This is THE key invariant of the phase.
assert(/INSERT INTO employee_schedule_overrides/.test(SHIFT),
  'applyShiftTemplate INSERTs into employee_schedule_overrides')
assert(!/INSERT INTO employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT INSERT into employee_schedules (recurring grid untouched)')
assert(!/UPDATE employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT UPDATE employee_schedules')
assert(!/DELETE FROM employee_schedules\b/.test(SHIFT),
  'applyShiftTemplate does NOT DELETE from employee_schedules')

// Replace flag wipes existing overrides for the date BEFORE inserting.
assert(/if \(replace\) \{[\s\S]{0,400}DELETE FROM employee_schedule_overrides[\s\S]{0,400}course_id = \? AND effective_date = \?/.test(SHIFT),
  'applyShiftTemplate replace=true deletes existing overrides for that date first')

// Idempotency on duplicate template names — UNIQUE collision returns existing.
assert(/if \(String\(err\.message \?\? ''\)\.includes\('UNIQUE'\)\)[\s\S]{0,400}SELECT \* FROM shift_templates WHERE course_id = \? AND name = \?/.test(SHIFT),
  'createShiftTemplate handles UNIQUE name collision by returning existing row')

// Status validation.
assert(/const ALLOWED_STATUS = new Set\(\['scheduled', 'off', 'vacation', 'sick'\]\)/.test(SHIFT),
  'shift-template rows validate status against {scheduled, off, vacation, sick}')

// ── schedules.js — month calendar + copy-day endpoints ───────────────
section('schedules.js — month calendar + copy-day endpoints')

assert(/export async function listEmployeesMonthCalendar\(env, courseId = null, month = null\)/.test(SCHEDS),
  'listEmployeesMonthCalendar exported')
assert(/export async function copyEmployeeSchedulesDay\(env, request\)/.test(SCHEDS),
  'copyEmployeeSchedulesDay exported')

// Calendar endpoint returns per-day summaries.
assert(/days\.push\(\{\s*\n\s*date:\s*dateIso,\s*\n\s*dayOfWeek:\s*dow,\s*\n\s*scheduledCount:[\s\S]{0,200}offCount:[\s\S]{0,200}totalHours:[\s\S]{0,400}\}\)/.test(SCHEDS),
  'month calendar pushes per-day {date, dayOfWeek, scheduledCount, offCount, totalHours, appliedShiftLabel}')

// Copy-day writes to overrides only.
assert(/INSERT INTO employee_schedule_overrides/.test(SCHEDS),
  'copyEmployeeSchedulesDay INSERTs into employee_schedule_overrides')
const copyDayMatch = SCHEDS.match(/export async function copyEmployeeSchedulesDay\(env, request\)\s*\{[\s\S]*?\n\}/)
const copyDaySrc   = copyDayMatch ? copyDayMatch[0] : ''
assert(copyDaySrc.length > 0, 'copyEmployeeSchedulesDay body extracted')
assert(!/INSERT INTO employee_schedules\b/.test(copyDaySrc),
  'copyEmployeeSchedulesDay does NOT INSERT into employee_schedules (recurring grid untouched)')
assert(!/UPDATE employee_schedules\b/.test(copyDaySrc),
  'copyEmployeeSchedulesDay does NOT UPDATE employee_schedules')
assert(!/DELETE FROM employee_schedules\b/.test(copyDaySrc),
  'copyEmployeeSchedulesDay does NOT DELETE from employee_schedules')

// Same-day guard.
assert(/if \(sourceDate === destinationDate\)/.test(copyDaySrc),
  'copy-day rejects same source/destination')

// Replace flag.
assert(/if \(replace\) \{[\s\S]{0,400}DELETE FROM employee_schedule_overrides[\s\S]{0,400}course_id = \? AND effective_date = \?/.test(copyDaySrc),
  'copy-day replace=true wipes destination overrides first')

// Source merges override over recurring (matches daily merge contract).
assert(/const effective = ov \?\? rec/.test(copyDaySrc),
  'copy-day source merge: override wins over recurring')

// ── Route registration ──────────────────────────────────────────────
section('worker/index.js — route registration + ordering')

// Calendar route registered.
assert(/pathname === '\/api\/employee-schedules\/calendar'/.test(IDX),
  '/api/employee-schedules/calendar route registered')
assert(/listEmployeesMonthCalendar\(env, courseId, month\)/.test(IDX),
  'calendar route wired to listEmployeesMonthCalendar')

// Copy-day route registered.
assert(/pathname === '\/api\/employee-schedules\/copy-day'/.test(IDX),
  '/api/employee-schedules/copy-day route registered')
assert(/copyEmployeeSchedulesDay\(env, request\)/.test(IDX),
  'copy-day route wired to copyEmployeeSchedulesDay')

// Calendar + copy-day must precede the /:id regex so 'calendar' and
// 'copy-day' aren't consumed as ids.
const calIdx     = IDX.indexOf("pathname === '/api/employee-schedules/calendar'")
const copyIdx    = IDX.indexOf("pathname === '/api/employee-schedules/copy-day'")
const idRegexIdx = IDX.search(/\/\^\\\/api\\\/employee-schedules\\\/\(\[\^\/\]\+\)\$\//)
assert(calIdx >= 0 && copyIdx >= 0 && idRegexIdx >= 0
       && calIdx < idRegexIdx && copyIdx < idRegexIdx,
  'calendar + copy-day routes precede the /api/employee-schedules/:id regex')

// Shift-templates routes registered.
assert(/pathname === '\/api\/shift-templates'/.test(IDX),
  '/api/shift-templates collection route registered')
assert(/\/\^\\\/api\\\/shift-templates\\\/\(\[\^\/\]\+\)\$\//.test(IDX),
  '/api/shift-templates/:id regex registered')
assert(/\/\^\\\/api\\\/shift-templates\\\/\(\[\^\/\]\+\)\\\/apply\$\//.test(IDX),
  '/api/shift-templates/:id/apply route registered')

const applyIdx = IDX.search(/\/\^\\\/api\\\/shift-templates\\\/\(\[\^\/\]\+\)\\\/apply\$\//)
const tplIdIdx = IDX.search(/\/\^\\\/api\\\/shift-templates\\\/\(\[\^\/\]\+\)\$\//)
assert(applyIdx < tplIdIdx,
  '/api/shift-templates/:id/apply precedes /api/shift-templates/:id (apply not consumed as id)')

assert(/createShiftTemplate\(env, request\)/.test(IDX),
  'POST /api/shift-templates → createShiftTemplate')
assert(/applyShiftTemplate\(env, id, request\)/.test(IDX),
  'POST /api/shift-templates/:id/apply → applyShiftTemplate')

// ── Mutation permissions ─────────────────────────────────────────────
section('Mutation permissions — canEditAssignments on new prefixes')

assert(/\['\/api\/shift-templates',\s*'canEditAssignments'\]/.test(PERM),
  "MUTATION_RULES includes ['/api/shift-templates', 'canEditAssignments']")

// Functional: matchRule + isMutationAllowed for shift-template paths.
for (const path of [
  '/api/shift-templates',
  '/api/shift-templates/shift-abc-123',
  '/api/shift-templates/shift-abc-123/apply',
]) {
  assert(matchRule(path) === 'canEditAssignments',
    `matchRule('${path}') === 'canEditAssignments'`)
}

// copy-day inherits from /api/employee-schedules.
assert(matchRule('/api/employee-schedules/copy-day') === 'canEditAssignments',
  '/api/employee-schedules/copy-day inherits canEditAssignments via prefix match')

const SUPER = { role: 'superintendent' }
const CREW  = { role: 'crew' }
for (const method of ['POST', 'PATCH', 'DELETE']) {
  assert(isMutationAllowed(SUPER, '/api/shift-templates', method) === true,
    `${method} /api/shift-templates allowed for superintendent`)
  assert(isMutationAllowed(CREW, '/api/shift-templates', method) === false,
    `${method} /api/shift-templates denied for crew`)
}
assert(isMutationAllowed(SUPER, '/api/employee-schedules/copy-day', 'POST') === true,
  'POST /api/employee-schedules/copy-day allowed for superintendent')
assert(isMutationAllowed(CREW, '/api/employee-schedules/copy-day', 'POST') === false,
  'POST /api/employee-schedules/copy-day denied for crew')

// ── Client store ─────────────────────────────────────────────────────
section('shiftTemplatesStore.js — exported surface')

for (const fn of [
  'useShiftTemplatesData', 'refreshShiftTemplatesData',
  'fetchShiftTemplateById',
  'createShiftTemplate',   'patchShiftTemplate', 'deleteShiftTemplate',
  'applyShiftTemplate',    'copyScheduleDay',
]) {
  assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(STORE),
    `store exports ${fn}`)
}

assert(/const API = '\/api\/shift-templates'/.test(STORE),
  'store targets /api/shift-templates')
assert(/applyShiftTemplate[\s\S]{0,400}fetchJSON\(`\$\{API\}\/\$\{encodeURIComponent\(id\)\}\/apply`/.test(STORE),
  'applyShiftTemplate POSTs to /api/shift-templates/:id/apply')
assert(/copyScheduleDay[\s\S]{0,400}fetchJSON\('\/api\/employee-schedules\/copy-day'/.test(STORE),
  "copyScheduleDay POSTs to /api/employee-schedules/copy-day")

// ── EmployeeScheduleTab mounts all three editors ─────────────────────
section('EmployeeScheduleTab — AnnualScheduleCalendar mounted alongside Daily + Weekly')

assert(/import AnnualScheduleCalendar\s+from\s+['"]\.\/AnnualScheduleCalendar['"]/.test(TAB),
  'EmployeeScheduleTab imports AnnualScheduleCalendar')
assert(/import DailyScheduleEditor\s+from\s+['"]\.\/DailyScheduleEditor['"]/.test(TAB),
  'EmployeeScheduleTab still imports DailyScheduleEditor (E.2 surface kept)')
assert(/import WeeklyScheduleEditor\s+from\s+['"]\.\/WeeklyScheduleEditor['"]/.test(TAB),
  'EmployeeScheduleTab still imports WeeklyScheduleEditor (recurring grid kept)')

const calIdxTab = TAB.indexOf('<AnnualScheduleCalendar')
const dailyIdxTab = TAB.indexOf('<DailyScheduleEditor')
const weeklyIdxTab = TAB.indexOf('<WeeklyScheduleEditor')
assert(calIdxTab >= 0 && dailyIdxTab >= 0 && weeklyIdxTab >= 0,
  'all three editors mount in the Schedule tab')
assert(calIdxTab < dailyIdxTab && dailyIdxTab < weeklyIdxTab,
  'Annual calendar mounts at the TOP, Daily below, Weekly at the bottom')

// ── Calendar UI invariants ───────────────────────────────────────────
section('AnnualScheduleCalendar — UI invariants')

// Month navigation.
assert(/function shiftMonth\(yyyymm, months\)/.test(CAL),
  'shiftMonth helper present (prev/next month navigation)')
assert(/aria-label="Previous month"/.test(CAL) && /aria-label="Next month"/.test(CAL),
  'prev/next nav buttons have accessible labels')

// Month grid is 7-column with leading blanks for the 1st-of-month DOW.
assert(/function buildMonthGrid\(yyyymm\)/.test(CAL),
  'buildMonthGrid helper present')
assert(/const leadingBlanks = first\.getDay\(\)/.test(CAL),
  'buildMonthGrid uses first.getDay() for leading blank cells')

// Day tile is draggable + handles drop.
assert(/draggable=\{!busy\}/.test(CAL),
  'day tile is draggable (HTML5 DnD)')
assert(/onDragStart=\{\(\) => handleDragStart\(cell\.date\)\}/.test(CAL),
  'day tile onDragStart wires handleDragStart')
assert(/onDrop=\{\(\) => handleDrop\(cell\.date\)\}/.test(CAL),
  'day tile onDrop wires handleDrop')
assert(/onDragOver=\{handleDragOver\}/.test(CAL),
  'day tile onDragOver wired')

// Drop opens a confirmation dialog. Phase E.6 inlined the source/dest
// variables and reworded the prompt slightly; accept the new shape.
const dropMatch = CAL.match(/async function handleDrop\(destinationDate\)[\s\S]*?\n  \}/)
const dropSrc   = dropMatch ? dropMatch[0] : ''
assert(dropSrc.length > 0, 'handleDrop body extracted')
assert(/Copy schedule from \$\{dragSource\} to \$\{destinationDate\}\?/.test(dropSrc),
  'handleDrop confirms "Copy schedule from <src> to <dst>?" when destination is clean')
assert(/\$\{destinationDate\} already has a schedule\. Replace it with \$\{dragSource\}'s schedule\?/.test(dropSrc),
  'handleDrop warns when destination already has a schedule before replacing')

// Drop never touches recurring schedules.
assert(!/employee_schedules|patchEmployeeSchedule|createEmployeeSchedule/.test(dropSrc),
  'handleDrop never touches the recurring grid')
assert(/await copyScheduleDay\(\{ sourceDate: dragSource, destinationDate, replace \}\)/.test(dropSrc),
  'handleDrop delegates to copyScheduleDay store helper')

// Apply template flow. Phase E.6 moved the confirm into the template
// picker modal (preview pane + in-UI Replace toggle) — handleApplyTemplate
// now trusts a `replaceConfirmed` arg from the picker instead of firing
// its own browser confirm. Pin the new shape.
const applyMatch = CAL.match(/async function handleApplyTemplate\(templateId, replaceConfirmed\)[\s\S]*?\n  \}/)
const applySrc   = applyMatch ? applyMatch[0] : ''
assert(applySrc.length > 0, 'handleApplyTemplate body extracted (E.6 signature: templateId, replaceConfirmed)')
assert(/await applyShiftTemplate\(templateId, \{ effectiveDate: selectedDate, replace: replaceConfirmed \}\)/.test(applySrc),
  'handleApplyTemplate calls applyShiftTemplate with { effectiveDate, replace: replaceConfirmed } (E.6)')
// The replace-warning copy lives in the picker modal now.
assert(/already has overrides/.test(CAL),
  "template picker surfaces in-UI replace warning ('already has overrides')")

// Clear-day-overrides button never wipes the recurring grid.
assert(/async function clearDayOverrides/.test(CAL),
  'clearDayOverrides helper present')
const clearMatch = CAL.match(/async function clearDayOverrides[\s\S]*?\n  \}/)
const clearSrc   = clearMatch ? clearMatch[0] : ''
assert(/await deleteScheduleOverride\(ov\.id\)/.test(clearSrc),
  'clearDayOverrides deletes overrides only')
assert(!/patchEmployeeSchedule|deleteEmployeeSchedule|createEmployeeSchedule/.test(clearSrc),
  'clearDayOverrides never touches the recurring grid')

// Save-as-template flow.
assert(/async function handleSaveAsTemplate\(name\)/.test(CAL),
  'handleSaveAsTemplate helper present')
assert(/await createShiftTemplate\(\{ name: trimmed, rows \}\)/.test(CAL),
  'save-as creates a template with the current day rows')

// Status select offers all four values.
for (const [value, label] of [
  ['scheduled', 'Scheduled'],
  ['off',       'Off'],
  ['vacation',  'Vacation'],
  ['sick',      'Sick'],
]) {
  assert(new RegExp(`value:\\s*['"]${value}['"],\\s*label:\\s*['"]${label}['"]`).test(CAL),
    `STATUS_OPTS includes { value: '${value}', label: '${label}' }`)
}

// Day summary surfaces scheduled/off/totalHours.
assert(/styles\.dayCountScheduled[\s\S]{0,400}summary\.scheduledCount/.test(CAL),
  'day tile shows scheduledCount')
assert(/summary\.offCount > 0[\s\S]{0,200}styles\.dayCountOff/.test(CAL),
  'day tile shows offCount when > 0')
assert(/summary\.totalHours > 0[\s\S]{0,200}styles\.dayHours/.test(CAL),
  'day tile shows totalHours when > 0')

// ── CSS — required classes defined ───────────────────────────────────
section('AnnualScheduleCalendar.module.css — required classes')

for (const cls of [
  'calendarSection', 'calendarGrid', 'dayTile', 'dayNumber',
  'daySummary', 'dayCountScheduled', 'dayCountOff', 'dayHours',
  'dayEditor', 'editorTable', 'editorStatusSelect',
  'modalOverlay', 'modal', 'templateList',
]) {
  // Accept both `.cls {` and `.cls,` (multi-selector rule form).
  assert(new RegExp(`\\.${cls}\\s*[\\{,]`).test(CAL_CSS),
    `CSS class .${cls} defined`)
}

// Drag-over visual feedback.
assert(/\.dayTile\[data-drag-over="true"\]\s*\{[\s\S]{0,400}border-color:\s*rgba\(251,\s*191,\s*36/.test(CAL_CSS),
  '.dayTile[data-drag-over="true"] has amber highlight (drop target visible)')

// Selected day visual feedback.
assert(/\.dayTile\[data-selected="true"\]\s*\{[\s\S]{0,400}border-color:\s*rgba\(74,\s*222,\s*128/.test(CAL_CSS),
  '.dayTile[data-selected="true"] has green highlight')

// ── DAB + kiosk schedule awareness unchanged ─────────────────────────
section('DAB + kiosk schedule awareness preserved (E.4 invariants)')

// DAB still uses the shared merge helper.
assert(/isEmployeeAssignableForDate[\s\S]{0,200}from '\.\.\/\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(DAB),
  'DAB still imports isEmployeeAssignableForDate (E.4 invariant)')
assert(/const assignable = isEmployeeAssignableForDate\(\s*\n\s*empStillThere\.id,\s*\n\s*destinationDate,/.test(DAB),
  'DAB copy helper still consults destination schedule before each copy (E.4 invariant)')

// Kiosk still filters operator cards.
assert(/import \{ isEmployeeAssignableForDate, hasAnyScheduleData \} from '\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(KIOSK),
  'kiosk still imports schedule helpers (E.4 invariant)')
assert(/if \(hasAnyScheduleData\(weeklySchedules, scheduleOverrides\)\)\s*\{[\s\S]{0,400}cards = cards\.filter/.test(KIOSK),
  'kiosk still filters operatorCards via hasAnyScheduleData gate (E.4 invariant)')

// ── Scope guards — no spray / no Weekly editor / no DailyScheduleEditor edits ─
section('Scope guards — spray + Weekly + Daily editors untouched')

const WEEKLY = readFileSync('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx', 'utf8')
assert(!WEEKLY.includes('Phase E.5'),
  'WeeklyScheduleEditor carries no Phase E.5 edits (recurring grid surface untouched)')
assert(/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(WEEKLY),
  'WeeklyScheduleEditor still mutates employee_schedules (regression couple)')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(WEEKLY),
  'WeeklyScheduleEditor still does NOT touch override mutators (regression couple)')

const DAILY = readFileSync('src/pages/Employees/tabs/DailyScheduleEditor.jsx', 'utf8')
assert(!DAILY.includes('Phase E.5'),
  'DailyScheduleEditor carries no Phase E.5 edits (E.2 surface unchanged)')

// Spray files.
for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.5'),
    `${path} carries no Phase E.5 edits`)
}

// Translation + Task Library untouched.
for (const path of [
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/utils/translate/translateClient.js',
  'src/utils/tasks/taskTemplateStore.js',
  'worker/api/taskTemplates.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.5'),
    `${path} carries no Phase E.5 edits`)
}

// E.2 stores — schedules.js gains the new endpoints; scheduleOverridesStore.js stays as-is.
const OV_STORE = readFileSync('src/utils/schedules/scheduleOverridesStore.js', 'utf8')
assert(!OV_STORE.includes('Phase E.5'),
  'scheduleOverridesStore.js carries no Phase E.5 edits (E.2 store unchanged)')

// dailyScheduleMerge.js unchanged.
const MERGE = readFileSync('src/utils/schedules/dailyScheduleMerge.js', 'utf8')
assert(!MERGE.includes('Phase E.5'),
  'dailyScheduleMerge.js (E.4 helper) carries no Phase E.5 edits')

// ── Migration ledger ─────────────────────────────────────────────────
section('Migration ledger — 0054 ceiling, 0053 preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  '0054_shift_templates.sql present')
assert(migrationFiles.includes('0053_employee_schedule_overrides.sql'),
  '0053_employee_schedule_overrides.sql still present (E.2 schema)')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// 0053 untouched.
const m0053 = readFileSync('worker/migrations/0053_employee_schedule_overrides.sql', 'utf8')
assert(/CREATE TABLE IF NOT EXISTS employee_schedule_overrides/.test(m0053),
  'regression: 0053 still creates employee_schedule_overrides')
assert(!m0053.includes('Phase E.5'),
  '0053_employee_schedule_overrides.sql carries no Phase E.5 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
