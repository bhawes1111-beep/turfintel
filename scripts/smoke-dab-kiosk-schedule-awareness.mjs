// Phase E.4 — DAB + kiosk schedule awareness smoke.
//
//   node scripts/smoke-dab-kiosk-schedule-awareness.mjs
//
// Phase E.2 added the override system but Copy Yesterday / Copy From
// Date still pulled in employees who were off / sick / vacation on the
// destination day, and the kiosk still showed assignment bars for those
// operators. Phase E.4 closes both gaps using a shared client merge
// helper:
//
//   • dailyScheduleMerge.js exposes buildScheduleByEmployeeForDate,
//     getScheduleStatusForEmployee, hasAnyScheduleData, and
//     isEmployeeAssignableForDate. The DAB AND the kiosk both consume
//     this single helper — no duplicated merge logic.
//   • copyAssignmentsFromDate consults the destination day's merged
//     schedule before each copy. Off / sick / vacation / unscheduled
//     employees skip with a named reason; the toast surfaces names.
//   • DAB widens dayEmployees to STILL include off/sick/vacation
//     employees who have an existing assignment — they render with a
//     conflict pill so the mismatch is visible (existing assignments
//     are NEVER auto-deleted; supervisor clears them).
//   • Kiosk operatorCards memo filters off off/sick/vacation operators
//     when at least one schedule rule exists. Both helpers preserve
//     the fallback rule: when BOTH stores are empty, every assigned
//     operator stays visible.
//   • No new D1 migration. No spray edits. No Weekly Schedule Editor
//     changes. No PTO workflow.

import { readFileSync, readdirSync } from 'fs'
import {
  buildScheduleByEmployeeForDate,
  getScheduleStatusForEmployee,
  hasAnyScheduleData,
  isEmployeeAssignableForDate,
} from '../src/utils/schedules/dailyScheduleMerge.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',         'utf8')
const DABCSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css',  'utf8')
const KIOSK  = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',              'utf8')
const HELPER = readFileSync('src/utils/schedules/dailyScheduleMerge.js',            'utf8')

// Extracted once near the top so all sections can pin into the same
// copyAssignmentsFromDate body.
const copyMatch = DAB.match(/async function copyAssignmentsFromDate\(sourceDate, destinationDate, options\)\s*\{[\s\S]*?\n  \}/)
const copySrc   = copyMatch ? copyMatch[0] : ''

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0053 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0053_employee_schedule_overrides.sql'),
  '0053_employee_schedule_overrides.sql still in the migration ledger (Phase E.2)')
const past0053 = migrationFiles.filter(f => /^00(5[4-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0053.length === 0,
  `no migration past 0053 (found: ${past0053.join(', ') || 'none'})`)

// ── Shared helper module — exported surface + behavior ───────────────
section('dailyScheduleMerge.js — shared helper exposes the required surface')

for (const fn of [
  'buildScheduleByEmployeeForDate',
  'getScheduleStatusForEmployee',
  'hasAnyScheduleData',
  'isEmployeeAssignableForDate',
]) {
  assert(new RegExp(`export function ${fn}\\b`).test(HELPER),
    `helper exports ${fn}`)
}

// Functional behavior — override wins.
const RECURRING = [
  { id: 'sch-1', employeeId: 'e1', dayOfWeek: 1, status: 'scheduled', role: 'Greens', startTime: '06:00', endTime: '14:00' },
  { id: 'sch-2', employeeId: 'e2', dayOfWeek: 1, status: 'scheduled' },
  { id: 'sch-3', employeeId: 'e3', dayOfWeek: 1, status: 'off' },
]
// Monday 2026-06-08 → dayOfWeek === 1
const OVERRIDES = [
  { id: 'ov-1', employeeId: 'e1', effectiveDate: '2026-06-08', status: 'sick',     role: null, notes: 'called out' },
  { id: 'ov-2', employeeId: 'e4', effectiveDate: '2026-06-08', status: 'scheduled', role: 'Spray Tech' },
]

const map = buildScheduleByEmployeeForDate('2026-06-08', RECURRING, OVERRIDES)

assert(map.get('e1')?.status === 'sick' && map.get('e1')?.source === 'override',
  'override wins over recurring: e1 had scheduled recurring + sick override → sick/override')
assert(map.get('e2')?.status === 'scheduled' && map.get('e2')?.source === 'recurring',
  'no override → recurring rule wins (e2)')
assert(map.get('e3')?.status === 'off' && map.get('e3')?.source === 'recurring',
  'recurring off propagates (e3) — source: recurring')
assert(map.get('e4')?.status === 'scheduled' && map.get('e4')?.source === 'override',
  'override-only employee (no recurring) carries source: override (e4)')
assert(map.get('e5') === undefined,
  'employee with NO recurring AND NO override returns undefined (caller decides fallback)')

// Override role carries the recurring role through when override.role is null.
assert(map.get('e1')?.role === 'Greens',
  'override with null role inherits recurring role (e1 keeps Greens from recurring)')

// hasAnyScheduleData semantics.
assert(hasAnyScheduleData([], []) === false,
  'hasAnyScheduleData: both empty → false (fallback mode)')
assert(hasAnyScheduleData(RECURRING, []) === true,
  'hasAnyScheduleData: only recurring rows → true')
assert(hasAnyScheduleData([], OVERRIDES) === true,
  'hasAnyScheduleData: only override rows → true')
assert(hasAnyScheduleData(RECURRING, OVERRIDES) === true,
  'hasAnyScheduleData: both → true')

// isEmployeeAssignableForDate decisions.
assert(isEmployeeAssignableForDate('e1', '2026-06-08', RECURRING, OVERRIDES).allowed === false,
  'isEmployeeAssignableForDate: e1 (sick override) → not allowed')
assert(isEmployeeAssignableForDate('e1', '2026-06-08', RECURRING, OVERRIDES).reason === 'sick',
  'isEmployeeAssignableForDate: e1 reason === "sick"')
assert(isEmployeeAssignableForDate('e2', '2026-06-08', RECURRING, OVERRIDES).allowed === true,
  'isEmployeeAssignableForDate: e2 (recurring scheduled) → allowed')
assert(isEmployeeAssignableForDate('e3', '2026-06-08', RECURRING, OVERRIDES).reason === 'off',
  'isEmployeeAssignableForDate: e3 (recurring off) → off')
assert(isEmployeeAssignableForDate('e5', '2026-06-08', RECURRING, OVERRIDES).reason === 'unscheduled',
  'isEmployeeAssignableForDate: e5 (no rules) → unscheduled when schedules exist')

// Fallback: empty stores → everything allowed.
assert(isEmployeeAssignableForDate('e99', '2026-06-08', [], []).allowed === true,
  'isEmployeeAssignableForDate: empty stores → allowed (fallback mode)')
assert(isEmployeeAssignableForDate('e99', '2026-06-08', [], []).reason === null,
  'isEmployeeAssignableForDate: empty stores → reason === null')

// getScheduleStatusForEmployee mirrors map lookup.
assert(getScheduleStatusForEmployee('e1', '2026-06-08', RECURRING, OVERRIDES)?.status === 'sick',
  'getScheduleStatusForEmployee: single-employee lookup matches buildScheduleByEmployeeForDate')

// ── DAB — Copy workflow consults destination schedule ────────────────
section('DAB — Copy Yesterday / Copy From Date consults destination schedule')

assert(/import \{[\s\S]{0,400}isEmployeeAssignableForDate[\s\S]{0,200}\} from '\.\.\/\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(DAB),
  'DAB imports isEmployeeAssignableForDate from the shared helper')

// Helper invocation inside the per-row loop of copyAssignmentsFromDate.
const helperCallMatch = DAB.match(/const assignable = isEmployeeAssignableForDate\(\s*\n\s*empStillThere\.id,\s*\n\s*destinationDate,\s*\n\s*weeklySchedules,\s*\n\s*scheduleOverrides,\s*\n\s*\)/)
assert(helperCallMatch !== null,
  'copy loop calls isEmployeeAssignableForDate(empStillThere.id, destinationDate, weeklySchedules, scheduleOverrides)')

assert(/if \(!assignable\.allowed\)\s*\{[\s\S]{0,300}skipped\+\+/.test(DAB),
  'copy loop: !allowed → skipped++ (does NOT call createCrewAssignment)')
assert(/skippedDetails\.push\(\{ name:\s*empStillThere\.name,\s*reason:\s*assignable\.reason \}\)/.test(DAB),
  'copy loop captures skipped employee {name, reason} into skippedDetails')

// Toast surfaces names + reasons.
assert(/if \(skippedDetails\.length > 0\)\s*\{[\s\S]{0,600}detailParts\.join\(', '\)/.test(DAB),
  'toast assembles skippedDetails into a comma-joined "name reason" string')
assert(/skippedDetails\.slice\(0, SHOW\)\.map\(d => `\$\{d\.name\} \$\{d\.reason\}`\)/.test(DAB),
  'toast format: "<name> <reason>" per skipped employee (slice(0, SHOW) for truncation)')

// Truncation — first 3 names + "+N more" so a snow-day toast doesn't
// produce a wall of text.
assert(/const SHOW = 3/.test(DAB),
  'truncation cap SHOW = 3 (first three skipped employees shown by name)')
assert(/const remaining = skippedDetails\.length - SHOW\s*\n\s*if \(remaining > 0\) detailParts\.push\(`\+\$\{remaining\} more`\)/.test(DAB),
  'truncation appends "+N more" when more than SHOW employees were skipped')

// Non-schedule skips (no destination event, existing assignment, etc.)
// still count toward skipped but don't get a names list.
assert(/} else \{\s*\n\s*parts\.push\(`\$\{skipped\} skipped`\)/.test(DAB),
  'anonymous skips (no schedule reason) fall through to plain "N skipped" toast')

// ── 9C.16 notes / notesEs / equipment / sourceId regression couples ──
section('Copy contract regression couples — notes / notesEs / equipment / sourceId preserved')

// 9C.16 — notes copy is gated by options.copyNotes; helper does NOT set notesEs.
assert(/notes:\s*options\.copyNotes \? \(oldA\.notes \?\? null\) : null/.test(DAB),
  '9C.16 notes carry: notes: options.copyNotes ? (oldA.notes ?? null) : null')
assert(!/\bnotesEs\b/.test(copySrc),
  '9C.16 notesEs is NEVER copied (worker NULLs notes_es; cron sweep refills)')

// 9C.15 equipment opt-in copy preserved.
assert(/if \(options\.copyEquipment\)/.test(copySrc),
  '9C.15 equipment block gated by options.copyEquipment')
assert(/createEquipmentReservation\(\{/.test(copySrc),
  '9C.15 equipment copy uses createEquipmentReservation')

// 9C.15 task-template sourceId rewrite preserved.
assert(/`task-template:\$\{tmplMatch\[1\]\}:\$\{destDate\}`/.test(DAB),
  '9C.15 task-template sourceId rewritten task-template:<id>:<destDate>')
assert(/`copied-task:\$\{sourceEvent\.id\}:\$\{destDate\}`/.test(DAB),
  '9C.15 ad-hoc events fall back to copied-task:<srcEventId>:<destDate>')

// ── DAB row render — conflict pill + widened dayEmployees ────────────
section('DAB — conflict pill + widened dayEmployees + zero auto-delete')

// dayEmployees now retains off/sick/vacation employees who STILL hold
// an assignment row, so the conflict pill is rendable.
assert(/Phase E\.4 — Widen this list to ALSO include off\/sick\/vacation\s*\n\s*\/\/ employees who STILL have a crew_assignment row/.test(DAB),
  'dayEmployees widening rationale documented inline')
assert(/const assignedEmpIds = new Set\(\)/.test(DAB),
  'dayEmployees builds assignedEmpIds set for the conflict path')
assert(/if \(ov\.status === ['"]scheduled['"]\) return true\s*\n[\s\S]{0,400}return assignedEmpIds\.has\(e\.id\)/.test(DAB),
  'dayEmployees: override non-scheduled employee kept ONLY if they have an active assignment (conflict path)')

// conflictByEmpId memo derives reason for each affected employee.
assert(/const conflictByEmpId = useMemo/.test(DAB),
  'conflictByEmpId useMemo derives the per-employee conflict reason')
assert(/buildScheduleByEmployeeForDate\(selectedDate, weeklySchedules, scheduleOverrides\)/.test(DAB),
  'conflictByEmpId uses buildScheduleByEmployeeForDate for canonical merge')

// Conflict pill labels — short human copy for the 4 reasons.
for (const [reason, label] of [
  ['off',         'Scheduled off today'],
  ['sick',        'Sick today'],
  ['vacation',    'Vacation today'],
  ['unscheduled', 'Not scheduled today'],
]) {
  assert(new RegExp(`${reason}:\\s*['"]${label}['"]`).test(DAB),
    `conflict label map: ${reason} → "${label}"`)
}

// Pill renders only when both (a) conflictReason exists AND (b) the
// employee has an existing assignment. We don't want pills on
// hidden-by-design empty rows.
assert(/conflictReason && assignment/.test(DAB),
  'conflict pill gated on (conflictReason && assignment) — only renders when there\'s a real mismatch')

// JSX uses styles.conflictPill + data-conflict attribute for CSS hooks.
assert(/<span\s*\n\s*className=\{styles\.conflictPill\}\s*\n\s*data-conflict=\{conflictReason\}/.test(DAB),
  '<span styles.conflictPill data-conflict={conflictReason}> renders')

// Row exposes data-conflict so the row tinting CSS rule can target it.
assert(/data-conflict=\{conflictLabel \? conflictReason : undefined\}/.test(DAB),
  '<tr data-conflict={conflictLabel ? conflictReason : undefined}> attribute set')

// Pill copy includes tooltip explaining the resolution path.
assert(/Clear the assignment to resolve\./.test(DAB),
  'pill tooltip explains the resolution path (Clear the assignment to resolve.)')

// No auto-delete of existing assignments — pin via negative.
assert(copySrc.length > 0, 'copyAssignmentsFromDate body extracted')
assert(!/deleteCrewAssignment[\s\S]{0,400}assignable\.reason/.test(copySrc),
  'copy helper does NOT delete existing destination assignments based on schedule status (regression-safe)')

// ── CSS — conflict pill classes defined ──────────────────────────────
section('CSS — conflict pill + row-level tint classes defined')

assert(/\.conflictPill\s*\{/.test(DABCSS),
  '.conflictPill base style defined')
for (const reason of ['sick', 'vacation', 'off']) {
  assert(new RegExp(`\\.conflictPill\\[data-conflict="${reason}"\\]\\s*\\{`).test(DABCSS),
    `.conflictPill[data-conflict="${reason}"] palette defined`)
}
assert(/\.assignTable tbody tr\[data-conflict="sick"\]\s*td/.test(DABCSS),
  'row-level tint for data-conflict="sick" defined')
assert(/\.assignTable tbody tr\[data-conflict="vacation"\]\s*td/.test(DABCSS),
  'row-level tint for data-conflict="vacation" defined')
assert(/\.assignTable tbody tr\[data-conflict="off"\]\s*td/.test(DABCSS),
  'row-level tint for data-conflict="off" defined')

// ── Kiosk — schedule-aware filtering ─────────────────────────────────
section('Kiosk — schedule-aware operatorCards filtering')

assert(/import \{ useEmployeeSchedulesData, refreshEmployeeSchedulesData \} from '\.\.\/\.\.\/utils\/schedules\/schedulesStore'/.test(KIOSK),
  'kiosk imports useEmployeeSchedulesData + refreshEmployeeSchedulesData')
assert(/import \{ useScheduleOverridesData, refreshScheduleOverridesData \} from '\.\.\/\.\.\/utils\/schedules\/scheduleOverridesStore'/.test(KIOSK),
  'kiosk imports useScheduleOverridesData + refreshScheduleOverridesData')
assert(/import \{ isEmployeeAssignableForDate, hasAnyScheduleData \} from '\.\.\/\.\.\/utils\/schedules\/dailyScheduleMerge'/.test(KIOSK),
  'kiosk imports the shared schedule helpers (single source of truth with DAB)')

// Hooks wired into the component.
assert(/const \{ schedules: weeklySchedules \}\s*=\s*useEmployeeSchedulesData\(\)/.test(KIOSK),
  'kiosk destructures { schedules: weeklySchedules }')
assert(/const \{ overrides: scheduleOverrides \}\s*=\s*useScheduleOverridesData\(\)/.test(KIOSK),
  'kiosk destructures { overrides: scheduleOverrides }')

// Auto-refresh covers both new stores.
assert(/refreshEmployeeSchedulesData\(\),\s*\n\s*refreshScheduleOverridesData\(\),/.test(KIOSK),
  'kiosk auto-refresh interval refreshes BOTH schedule stores')

// operatorCards filter — fallback gate first, then per-card check.
assert(/if \(hasAnyScheduleData\(weeklySchedules, scheduleOverrides\)\)\s*\{[\s\S]{0,400}cards = cards\.filter/.test(KIOSK),
  'kiosk operatorCards filter gated on hasAnyScheduleData (fallback preserved when empty)')
assert(/const verdict = isEmployeeAssignableForDate\(\s*\n\s*op\.employeeId,\s*\n\s*selectedDate,\s*\n\s*weeklySchedules,\s*\n\s*scheduleOverrides,\s*\n\s*\)/.test(KIOSK),
  'kiosk operatorCards calls isEmployeeAssignableForDate(op.employeeId, selectedDate, weekly, overrides)')
assert(/return verdict\.allowed/.test(KIOSK),
  'kiosk operatorCards keeps op when verdict.allowed === true')

// Legacy assignments without employeeId stay visible (name-only rows).
assert(/if \(!op\.employeeId\) return true[\s\S]{0,200}legacy assignments without employeeId/.test(KIOSK),
  'kiosk preserves legacy assignments without employeeId (no schedule check possible)')

// Memo deps include the new inputs so re-renders happen on store change.
assert(/\}, \[\s*\n[\s\S]{0,400}weeklySchedules, scheduleOverrides, selectedDate,\s*\n\s*\]\)/.test(KIOSK),
  'kiosk operatorCards memo deps include weeklySchedules + scheduleOverrides + selectedDate')

// ── Privacy / auth invariants — kiosk stays public-safe ──────────────
section('Privacy / auth — kiosk no-login contract preserved')

// Kiosk consumed stores must NOT reach for any private employee field
// in EXECUTABLE code. The kiosk source DOES mention these fields in
// explanatory comments (documenting that the privacy gate strips them
// server-side); those are evidence of intent, not leaks. Strip
// single-line comments before scanning to avoid false positives.
function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, '')          // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')    // block comments
}
const KIOSK_CODE = stripComments(KIOSK)
for (const privateField of ['payRate', 'emergencyContact', 'pesticideLicense', 'hireDate']) {
  assert(!new RegExp(`\\b${privateField}\\b`).test(KIOSK_CODE),
    `kiosk EXECUTABLE source does not reference private field "${privateField}"`)
}

// Kiosk has no auth gate — preserved by no new auth imports.
assert(!/useAuth\(\)|requireAuth|canEditAssignments/.test(KIOSK),
  'kiosk has no auth gate (no useAuth / requireAuth / permission checks added)')

// Feedback button + override management UI must NOT leak into the
// kiosk. (These live on the DAB only.)
assert(!/openFeedbackModal|FeedbackModal/.test(KIOSK),
  'kiosk does not render the Feedback button or modal')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(KIOSK),
  'kiosk does not import any schedule-override mutator (read-only consumption)')

// Auto-refresh interval semantics — the existing constant is preserved.
assert(/if \(intervalMs == null\) return\s*\n\s*const id = setInterval\(\(\) => \{[\s\S]{0,2400}\}, intervalMs\)/.test(KIOSK),
  'kiosk setInterval(() => {...}, intervalMs) auto-refresh pattern preserved')

// ── Scope guards — no spray / Weekly Schedule Editor / migration ─────
section('Scope guards — Weekly Schedule Editor + spray untouched')

const WEEKLY = readFileSync('src/pages/Employees/tabs/WeeklyScheduleEditor.jsx', 'utf8')
assert(!WEEKLY.includes('Phase E.4'),
  'WeeklyScheduleEditor carries no Phase E.4 edits (recurring-grid editor unchanged)')
// Weekly editor still mutates ONLY recurring schedules.
assert(/createEmployeeSchedule|patchEmployeeSchedule|deleteEmployeeSchedule/.test(WEEKLY),
  'WeeklyScheduleEditor still mutates employee_schedules (regression)')
assert(!/createScheduleOverride|patchScheduleOverride|deleteScheduleOverride/.test(WEEKLY),
  'WeeklyScheduleEditor still does NOT touch override mutators')

// Daily editor unchanged this phase.
const DAILY = readFileSync('src/pages/Employees/tabs/DailyScheduleEditor.jsx', 'utf8')
assert(!DAILY.includes('Phase E.4'),
  'DailyScheduleEditor (Phase E.2) carries no Phase E.4 edits')

// Spray files untouched.
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
  assert(!src.includes('Phase E.4'),
    `${path} carries no Phase E.4 edits`)
}

// Task Library, Translation, kiosk-side daily notes, alerts — all
// untouched. Phase E.4 changes are scoped to schedule awareness.
for (const path of [
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/utils/translate/translateClient.js',
  'src/utils/tasks/taskTemplateStore.js',
  'worker/api/taskTemplates.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/mutationPermissions.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.4'),
    `${path} carries no Phase E.4 edits`)
}

// E.2 surfaces — schedules.js + scheduleOverridesStore.js — also stay
// untouched this phase (the merge helper is a NEW file, not an edit).
const SCHEDS_API = readFileSync('worker/api/schedules.js', 'utf8')
assert(!SCHEDS_API.includes('Phase E.4'),
  'worker/api/schedules.js carries no Phase E.4 edits (E.2 endpoints unchanged)')
const OV_STORE = readFileSync('src/utils/schedules/scheduleOverridesStore.js', 'utf8')
assert(!OV_STORE.includes('Phase E.4'),
  'scheduleOverridesStore.js carries no Phase E.4 edits (E.2 store unchanged)')

// ── Regression couples — prior phase invariants ──────────────────────
section('Regression couples — prior phase invariants intact')

// Phase E.2 — DAB still uses the override-aware dayEmployees fallback.
assert(/const usingScheduleFallback = weeklySchedules\.length === 0 && scheduleOverrides\.length === 0/.test(DAB),
  'E.2 fallback gate (BOTH stores empty) preserved')

// Phase 9C.16 — Copy Yesterday still delegates to copyAssignmentsFromDate.
assert(/await copyAssignmentsFromDate\(yesterdayIso, selectedDate,\s*\{/.test(DAB),
  '9C.16 Copy Yesterday → copyAssignmentsFromDate delegation preserved')

// Phase 9C.12 — template defaults still applied via handleQuickTaskChange.
assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 carriedNotes preservation rule preserved')

// Phase 9C.18 — Feedback button still on DAB (not kiosk — see negative
// guard above).
assert(/data-variant="feedback"/.test(DAB),
  '9C.18 Feedback button still on DAB')

// Phase 9C.10 — kiosk Daily Notes strip still rendered.
assert(/<BoardModeDailyNotes\s+notes=\{dayNotes\}\s*\/>/.test(KIOSK),
  '9C.10 BoardModeDailyNotes still mounted in kiosk early-return')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
