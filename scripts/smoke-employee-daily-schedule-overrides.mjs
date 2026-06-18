// Phase E.2 — Daily schedule + per-date overrides smoke.
//
//   node scripts/smoke-employee-daily-schedule-overrides.mjs
//
// Phase E.1 audit found the recurring weekly grid is the only way a
// supervisor can mark someone off / sick / vacation — flipping a
// Wednesday cell affected EVERY Wednesday. This phase adds:
//
//   • New table `employee_schedule_overrides` (migration 0053).
//     Separate table chosen over a column add because the existing
//     UNIQUE(course_id, employee_id, day_of_week) on employee_schedules
//     would force overrides to share the recurring row.
//   • Worker CRUD + idempotent POST + daily-merge endpoint.
//   • Server-side merge: override wins over recurring; missing both
//     means unscheduled.
//   • Client store + Today's Schedule UI mounted above the Weekly
//     Schedule Editor.
//   • DAB merges overrides into its dayEmployees filter so an operator
//     marked off today never appears as an assignable row, even if
//     their recurring rule says scheduled.
//
// Phase E.2 is server-aware client-aware additive — kiosk, Copy
// Yesterday, and spray code are NOT touched.

import { readFileSync, readdirSync } from 'fs'
import {
  isMutationAllowed,
  matchRule,
  MUTATION_RULES,
} from '../worker/lib/mutationPermissions.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIG    = readFileSync('worker/migrations/0053_employee_schedule_overrides.sql', 'utf8')
const SCHEDS = readFileSync('worker/api/schedules.js',                                 'utf8')
const IDX    = readFileSync('worker/index.js',                                          'utf8')
const PERM   = readFileSync('worker/lib/mutationPermissions.js',                        'utf8')
const STORE  = readFileSync('src/utils/schedules/scheduleOverridesStore.js',            'utf8')
const TAB    = readFileSync('src/pages/Employees/tabs/EmployeeScheduleTab.jsx',         'utf8')
const DAILY  = readFileSync('src/pages/Employees/tabs/DailyScheduleEditor.jsx',         'utf8')
const WEEKLY = readFileSync('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx',        'utf8')
const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',             'utf8')

// ── Migration 0053 — additive only, override table shape ──────────────
section('Migration 0053 — employee_schedule_overrides table')

assert(/CREATE TABLE IF NOT EXISTS employee_schedule_overrides/.test(MIG),
  '0053 creates employee_schedule_overrides table')

for (const col of [
  'id\\s+TEXT PRIMARY KEY',
  'course_id\\s+TEXT NOT NULL',
  'employee_id\\s+TEXT NOT NULL',
  'effective_date\\s+TEXT NOT NULL',
  'start_time\\s+TEXT',
  'end_time\\s+TEXT',
  'role\\s+TEXT',
  'status\\s+TEXT NOT NULL DEFAULT \'scheduled\'',
  'notes\\s+TEXT',
  'created_at\\s+TEXT NOT NULL DEFAULT',
  'updated_at\\s+TEXT NOT NULL DEFAULT',
]) {
  assert(new RegExp(col).test(MIG), `0053 includes column: ${col.replace(/\\s\+.*/, '')}`)
}

// UNIQUE constraint — one override per (course, employee, date).
assert(/UNIQUE INDEX[\s\S]{0,400}employee_schedule_overrides\(course_id,\s*employee_id,\s*effective_date\)/.test(MIG),
  'UNIQUE INDEX on (course_id, employee_id, effective_date) — single override per date')

// Hot-path index for the daily-merge endpoint.
assert(/INDEX[\s\S]{0,400}employee_schedule_overrides\(course_id,\s*effective_date\)/.test(MIG),
  'INDEX on (course_id, effective_date) — daily-merge hot path')

// Additive-only invariants.
assert(!/DROP\s+TABLE|DROP\s+COLUMN/i.test(MIG),
  '0053 contains no DROP statements')
assert(!/ALTER TABLE employee_schedules/i.test(MIG),
  '0053 does NOT ALTER employee_schedules (recurring grid untouched)')
assert(!/\bRENAME\s+(TO|COLUMN)\b/i.test(MIG),
  '0053 contains no RENAME TO / RENAME COLUMN statements')

// Design rationale documented so a future reviewer understands why we
// chose a peer table over a column add.
assert(/separate table.*NOT a column add|Design choice: separate table/i.test(MIG),
  'migration documents the separate-table design choice')

// ── Worker — listEmployeesDailySchedule + override CRUD ──────────────
section('Worker — daily-merge endpoint + override CRUD')

assert(/export async function listEmployeesDailySchedule\(env, courseId = null, date = null\)/.test(SCHEDS),
  'listEmployeesDailySchedule(env, courseId, date) exported')

assert(/export async function listEmployeeScheduleOverrides\(env, courseId = null, opts = \{\}\)/.test(SCHEDS),
  'listEmployeeScheduleOverrides exported')
assert(/export async function getEmployeeScheduleOverride\(env, id\)/.test(SCHEDS),
  'getEmployeeScheduleOverride exported')
assert(/export async function createEmployeeScheduleOverride\(env, request\)/.test(SCHEDS),
  'createEmployeeScheduleOverride exported')
assert(/export async function updateEmployeeScheduleOverride\(env, id, request\)/.test(SCHEDS),
  'updateEmployeeScheduleOverride exported')
assert(/export async function deleteEmployeeScheduleOverride\(env, id\)/.test(SCHEDS),
  'deleteEmployeeScheduleOverride exported')

// Date format validation — worker refuses non-ISO strings.
assert(/function coerceDate\(value\)/.test(SCHEDS),
  'coerceDate helper validates YYYY-MM-DD format')
assert(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/.test(SCHEDS),
  'coerceDate regex pins YYYY-MM-DD shape')

// Idempotent create — POSTing a duplicate (course, employee, date) returns existing.
assert(/SELECT \* FROM employee_schedule_overrides[\s\S]{0,400}WHERE course_id = \? AND employee_id = \? AND effective_date = \?/.test(SCHEDS),
  'createEmployeeScheduleOverride checks for existing (course, employee, date) before INSERT')
assert(/if \(existing\) return json\(rowToOverride\(existing\)\)/.test(SCHEDS),
  'create returns existing row on duplicate POST (idempotent)')

// INSERT includes all spec'd columns.
assert(/INSERT INTO employee_schedule_overrides \(\s*\n\s*id, course_id, employee_id, effective_date,\s*\n\s*start_time, end_time, role, status, notes\s*\n\s*\)/.test(SCHEDS),
  'INSERT includes id, course_id, employee_id, effective_date, start_time, end_time, role, status, notes')

// Daily merge — three SELECTs + override-wins precedence.
assert(/SELECT id, name, role, status\s*\n\s*FROM crew_employees[\s\S]{0,400}status != 'inactive'/.test(SCHEDS),
  'daily merge SELECTs active employees (excludes inactive)')
assert(/SELECT \* FROM employee_schedules[\s\S]{0,400}day_of_week = \?/.test(SCHEDS),
  'daily merge SELECTs recurring rows for the computed day_of_week')
assert(/SELECT \* FROM employee_schedule_overrides[\s\S]{0,400}effective_date = \?/.test(SCHEDS),
  'daily merge SELECTs override rows for the exact effective_date')

// Merge precedence pinned by code structure: override checked first.
assert(/const ov\s*=\s*overrideByEmp\.get\(emp\.id\)[\s\S]{0,400}if \(ov\)/.test(SCHEDS),
  'merge checks override BEFORE recurring (override wins)')
assert(/source:\s*'override'[\s\S]{0,400}source:\s*'recurring'[\s\S]{0,400}source:\s*'none'/.test(SCHEDS),
  'merge returns source: override | recurring | none for each row')

// ── Worker — route registration ──────────────────────────────────────
section('worker/index.js — route registration')

// /api/employee-schedules/daily MUST precede /api/employee-schedules/:id
const dailyIdx = IDX.indexOf("pathname === '/api/employee-schedules/daily'")
const idIdx    = IDX.search(/\/\^\\\/api\\\/employee-schedules\\\/\(\[\^\/\]\+\)\$\//)
assert(dailyIdx >= 0 && idIdx >= 0 && dailyIdx < idIdx,
  '/api/employee-schedules/daily registered BEFORE the /:id regex (no path-consumption)')

// Daily endpoint passes date param.
assert(/listEmployeesDailySchedule\(env, courseId, date\)/.test(IDX),
  'daily route calls listEmployeesDailySchedule(env, courseId, date)')

// Overrides collection + :id routes.
assert(/pathname === '\/api\/employee-schedule-overrides'/.test(IDX),
  '/api/employee-schedule-overrides collection route registered')
assert(/\/\^\\\/api\\\/employee-schedule-overrides\\\/\(\[\^\/\]\+\)\$\//.test(IDX),
  '/api/employee-schedule-overrides/:id regex registered')

assert(/createEmployeeScheduleOverride\(env, request\)/.test(IDX),
  'POST → createEmployeeScheduleOverride')
assert(/updateEmployeeScheduleOverride\(env, id, request\)/.test(IDX),
  'PATCH → updateEmployeeScheduleOverride')
assert(/deleteEmployeeScheduleOverride\(env, id\)/.test(IDX),
  'DELETE → deleteEmployeeScheduleOverride')

// ── Mutation permissions ─────────────────────────────────────────────
section('Mutation permissions — canEditAssignments on overrides')

assert(/\['\/api\/employee-schedule-overrides',\s*'canEditAssignments'\]/.test(PERM),
  "MUTATION_RULES includes ['/api/employee-schedule-overrides', 'canEditAssignments']")

// Functional check via matchRule + isMutationAllowed.
for (const path of [
  '/api/employee-schedule-overrides',
  '/api/employee-schedule-overrides/schov-abc-123',
]) {
  assert(matchRule(path) === 'canEditAssignments',
    `matchRule('${path}') === 'canEditAssignments'`)
}

const ACTOR_SUPER = { role: 'superintendent' }   // has canEditAssignments
const ACTOR_CREW  = { role: 'crew' }             // does NOT have canEditAssignments

for (const method of ['POST', 'PATCH', 'DELETE']) {
  assert(isMutationAllowed(ACTOR_SUPER, '/api/employee-schedule-overrides', method) === true,
    `${method} /api/employee-schedule-overrides allowed for superintendent`)
  assert(isMutationAllowed(ACTOR_CREW, '/api/employee-schedule-overrides', method) === false,
    `${method} /api/employee-schedule-overrides denied for crew`)
}

// Path-collision guard — distinct from /api/employee-schedules.
assert(matchRule('/api/employee-schedules') === 'canEditAssignments',
  'regression: /api/employee-schedules still gated by canEditAssignments')
assert(matchRule('/api/employee-schedules/sch-abc-123') === 'canEditAssignments',
  '/api/employee-schedules/:id still resolves correctly (no overrides spillover)')

// ── Client store — scheduleOverridesStore ────────────────────────────
section('Client store — scheduleOverridesStore.js')

for (const fn of [
  'useScheduleOverridesData', 'refreshScheduleOverridesData',
  'createScheduleOverride',   'patchScheduleOverride',
  'deleteScheduleOverride',
]) {
  assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(STORE),
    `store exports ${fn}`)
}

assert(/const API = '\/api\/employee-schedule-overrides'/.test(STORE),
  'store targets /api/employee-schedule-overrides')
assert(/withCourseScope\(API\)/.test(STORE),
  'store reads via withCourseScope (Phase 5.7 contract)')
assert(/mutationHeaders\(\)/.test(STORE),
  'writes attach mutationHeaders')

// ── EmployeeScheduleTab — mounts both editors ────────────────────────
section('EmployeeScheduleTab — DailyScheduleEditor mounted above WeeklyScheduleEditor')

assert(/import DailyScheduleEditor\s+from\s+['"]\.\/DailyScheduleEditor['"]/.test(TAB),
  'EmployeeScheduleTab imports DailyScheduleEditor')
assert(/import WeeklyScheduleEditor\s+from\s+['"]\.\/WeeklyScheduleEditor['"]/.test(TAB),
  'EmployeeScheduleTab still imports WeeklyScheduleEditor (regression)')

const dailyTagIdx  = TAB.indexOf('<DailyScheduleEditor')
const weeklyTagIdx = TAB.indexOf('<WeeklyScheduleEditor')
assert(dailyTagIdx >= 0 && weeklyTagIdx >= 0 && dailyTagIdx < weeklyTagIdx,
  'DailyScheduleEditor renders ABOVE WeeklyScheduleEditor in EmployeeScheduleTab')

// ── DailyScheduleEditor — date picker + status + notes + reset ───────
section('DailyScheduleEditor — UI invariants')

// Date defaults to today.
assert(/const TODAY_ISO = \(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(DAILY),
  'TODAY_ISO helper computes YYYY-MM-DD')
assert(/const \[selectedDate, setSelectedDate\]\s*=\s*useState\(TODAY_ISO\)/.test(DAILY),
  'selectedDate defaults to today')

// Date input bound.
assert(/<input\s+type="date"\s+value=\{selectedDate\}/.test(DAILY),
  '<input type="date"> bound to selectedDate')

// Status select has all four required values.
for (const [value, label] of [
  ['scheduled', 'Scheduled'],
  ['off',       'Off'],
  ['vacation',  'Vacation'],
  ['sick',      'Sick'],
]) {
  assert(new RegExp(`value:\\s*['"]${value}['"],\\s*label:\\s*['"]${label}['"]`).test(DAILY),
    `STATUS_OPTS includes { value: '${value}', label: '${label}' }`)
}

// Notes input present.
assert(/<input\s+type="text"[\s\S]{0,400}className=\{styles\.dailyNotesInput\}/.test(DAILY),
  'notes <input type="text"> present')
assert(/placeholder="called out, doctor, late…"/.test(DAILY),
  'notes input placeholder explains intended use')

// Three sources rendered as pill.
for (const src of ['override', 'recurring', 'none']) {
  assert(new RegExp(`row\\.source === ['"]${src}['"]`).test(DAILY),
    `daily render branches on source === '${src}'`)
}

// Reset button only shown when override exists.
assert(/\{row\.overrideId && \(\s*\n?\s*<button/.test(DAILY),
  'Reset button gated on row.overrideId truthy')
assert(/onClick=\{\(\) => resetToRecurring\(row\)\}/.test(DAILY),
  'Reset button calls resetToRecurring(row)')

// Reset uses deleteScheduleOverride (not patch — restores to recurring).
const resetMatch = DAILY.match(/async function resetToRecurring\(row\)[\s\S]*?\n  \}/)
const resetSrc   = resetMatch ? resetMatch[0] : ''
assert(resetSrc.length > 0, 'resetToRecurring body extracted')
assert(/await deleteScheduleOverride\(row\.overrideId\)/.test(resetSrc),
  'resetToRecurring deletes the override (does NOT patch the recurring grid)')

// Edits route through createScheduleOverride / patchScheduleOverride.
const editMatch = DAILY.match(/async function applyEdit\(row, patch\)[\s\S]*?\n  \}/)
const editSrc   = editMatch ? editMatch[0] : ''
assert(editSrc.length > 0, 'applyEdit body extracted')
assert(/if \(row\.overrideId\)[\s\S]{0,200}await patchScheduleOverride\(row\.overrideId, payload\)/.test(editSrc),
  'applyEdit PATCHes existing override when overrideId is present')
assert(/else[\s\S]{0,200}await createScheduleOverride\(/.test(editSrc),
  'applyEdit POSTs new override when no overrideId')

// applyEdit never touches employee_schedules / patchEmployeeSchedule
// (recurring grid stays out of the daily flow).
assert(!/patchEmployeeSchedule|createEmployeeSchedule|deleteEmployeeSchedule/.test(DAILY),
  'DailyScheduleEditor does NOT call any recurring-grid mutation (weekly grid stays pristine)')

// ── WeeklyScheduleEditor — recurring behavior unchanged ──────────────
section('WeeklyScheduleEditor — still mutates ONLY recurring schedules')

assert(/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(WEEKLY),
  'WeeklyScheduleEditor still mutates employee_schedules (regression)')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(WEEKLY),
  'WeeklyScheduleEditor does NOT touch overrides (separation of concerns)')

// ── DAB integration — override-aware dayEmployees filter ─────────────
section('DAB integration — override-aware dayEmployees filter')

assert(/import \{ useScheduleOverridesData \} from '\.\.\/\.\.\/\.\.\/utils\/schedules\/scheduleOverridesStore'/.test(DAB),
  'DAB imports useScheduleOverridesData')
assert(/const \{ overrides: scheduleOverrides \} = useScheduleOverridesData\(\)/.test(DAB),
  'DAB destructures { overrides: scheduleOverrides }')

// Fallback gate widens to include overrides — if BOTH stores are
// empty, fall back to all active. If either has rows, the merge rules.
assert(/const usingScheduleFallback = weeklySchedules\.length === 0 && scheduleOverrides\.length === 0/.test(DAB),
  'fallback requires BOTH weeklySchedules AND scheduleOverrides empty (regression-safe)')

// Per-date override map keyed by employee.
assert(/const overridesByEmpForDate = useMemo/.test(DAB),
  'overridesByEmpForDate useMemo defined')
assert(/o\.effectiveDate !== selectedDate/.test(DAB),
  'override map filters by effectiveDate === selectedDate')

// dayEmployees merge — override wins for assignable check. Phase E.4
// widened the body to ALSO keep off/sick/vacation employees who STILL
// hold an assignment so the conflict pill can render. The original
// invariants below remain true at the assignable-path level: override
// scheduled → true; no override + recurring scheduled → true.
assert(/const ov = overridesByEmpForDate\.get\(e\.id\)[\s\S]{0,400}if \(ov\.status === ['"]scheduled['"]\) return true/.test(DAB),
  'dayEmployees: override.status === "scheduled" → true (assignable path, Phase E.2 invariant)')
assert(/recurringScheduledIds\.has\(e\.id\)/.test(DAB),
  'dayEmployees: recurring rule decides when no override exists (Phase E.2 invariant)')

// Assignment rows are NOT deleted automatically — only the assignable
// filter narrows. Pin by negative — DAB has no override-driven delete.
assert(!/deleteCrewAssignment.*override/i.test(DAB),
  'DAB does not auto-delete crew_assignments when an employee is marked off (regression-safe)')

// scheduleRoleByEmpId now considers overrides too — override role wins.
assert(/for \(const o of scheduleOverrides\)[\s\S]{0,400}o\.role/.test(DAB),
  'scheduleRoleByEmpId loop walks scheduleOverrides for override role override')

// ── Phase scope guards — no kiosk / spray / Copy Yesterday edits ─────
section('Phase scope guards — kiosk / spray / Copy Yesterday untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  // Other workflow code that must stay pristine this phase.
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/utils/translate/translateClient.js',
  'worker/lib/autoTranslate.js',
  'worker/lib/translate.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.2'),
    `${path} carries no Phase E.2 edits`)
}

// Copy Yesterday flow on DAB is untouched (only the dayEmployees
// filter changed). Pin handleCopyYesterday delegation from 9C.16
// as a regression couple.
assert(/await copyAssignmentsFromDate\(yesterdayIso, selectedDate,\s*\{/.test(DAB),
  '9C.16 Copy Yesterday → copyAssignmentsFromDate delegation preserved')

// ── Migration ledger ─────────────────────────────────────────────────
section('Migrations ledger — 0053 ceiling')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0053_employee_schedule_overrides.sql'),
  '0053_employee_schedule_overrides.sql present in worker/migrations')
const past0053 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0053.length === 0,
  `no migration past 0054 (found: ${past0053.join(', ') || 'none'})`)

// employee_schedules migration (0024) untouched as regression couple.
const m0024 = readFileSync('worker/migrations/0024_employee_schedules.sql', 'utf8')
assert(/CREATE TABLE IF NOT EXISTS employee_schedules/.test(m0024),
  'regression: 0024_employee_schedules.sql still creates employee_schedules')
assert(!m0024.includes('Phase E.2'),
  '0024_employee_schedules.sql carries no Phase E.2 edits (recurring grid schema unchanged)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
