// Phase DAB.10a.1 — Backend amendment for employee-day job ordering.
//
//   node scripts/smoke-dab-multi-job-backend-day.mjs
//
// Pins the correctly-scoped employee-day bulk endpoint:
//
//   POST /api/crew-assignments/bulk-employee-day
//   Body: { date, employeeName, employeeId?, role?, jobs: [
//     { calendarEventId, notes, notesEs, status, role },
//     …
//   ]}
//
// Each task is a distinct calendar_event (existing architecture).
// job_order = the supervisor's chosen ordering across multiple
// events on the same date, NOT per-event sub-row ordering.
//
// Pins:
//   • bulkReplaceEmployeeDay(env, request) helper exists in worker.
//   • POST /api/crew-assignments/bulk-employee-day routed correctly,
//     literal-before-/:id-catch-all.
//   • Validation: date required + YYYY-MM-DD format, employeeName
//     required, jobs must be array.
//   • Resolves calendar_events for (course, date) before mutating
//     anything.
//   • Validates every non-blank job's calendarEventId belongs to that
//     day/course set — refuses cross-date/cross-course writes.
//   • Reuses isBlankJobPayload from DAB.10a + treats "no event id"
//     as blank for this endpoint (no event = nothing to attach to).
//   • DELETE scoped to (employee + day's event ids) — other employees
//     untouched, other dates untouched.
//   • INSERT job_order = post-filter payload index (0..N-1).
//   • Returns hydrated rows ORDER BY job_order ASC.
//   • Empty-array case returns rows: [] (intentional clear path).
//   • Permission: gated via existing crewAssignmentRule (no new rule).
//   • Store helper bulkReplaceEmployeeDay(payload) wires the cache.
//   • Old bulkReplaceEmployeeJobs (DAB.10a per-event endpoint) is
//     preserved untouched.
//   • No migration: existing job_order column from DAB.10a suffices.
//   • No DAB editor / Display Board / Kiosk UI changes (deferred to
//     DAB.10b).

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const ASSIGN_W = readFileSync('worker/api/assignments.js',                    'utf8')
const ROUTER   = readFileSync('worker/index.js',                              'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',            'utf8')
const STORE    = readFileSync('src/utils/assignments/assignmentsStore.js',    'utf8')
const DAB      = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK    = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')

// ── No new migration / DAB.10a schema intact ──────────────────────
section('No new migration — DAB.10a job_order column suffices')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0055_crew_assignments_job_order.sql'),
  '0055_crew_assignments_job_order.sql still in the ledger (DAB.10a migration preserved)')
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (no new migration in DAB.10a.1)')

// ── Worker helper exists with full pipeline ───────────────────────
section('bulkReplaceEmployeeDay(env, request) — pipeline')

assert(/export async function bulkReplaceEmployeeDay\(env, request\)/.test(ASSIGN_W),
  'bulkReplaceEmployeeDay(env, request) exported')

// Validation rules.
assert(/date is required \(YYYY-MM-DD\)/.test(ASSIGN_W),
  'rejects missing date')
assert(/date must be YYYY-MM-DD/.test(ASSIGN_W),
  'rejects malformed date')
assert(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(ASSIGN_W),
  'validates date against /^\\d{4}-\\d{2}-\\d{2}$/')
assert(/employeeName is required/.test(ASSIGN_W),
  'rejects missing employeeName')
assert(/jobs must be an array/.test(ASSIGN_W),
  'rejects when jobs is not an array')

// Pipeline body.
const bulkDayBody = ASSIGN_W.match(/export async function bulkReplaceEmployeeDay[\s\S]{0,5500}?\n^\}/m)?.[0] ?? ''
assert(bulkDayBody.length > 0, 'bulkReplaceEmployeeDay body parsed')

// Step 1 — resolve day's events for the course.
assert(/SELECT id FROM calendar_events[\s\S]{0,200}start_date = \?/.test(bulkDayBody),
  'pipeline resolves day events via SELECT id FROM calendar_events ... start_date = ?')
assert(/buildCourseFilter\(courseId\)/.test(bulkDayBody),
  'pipeline scopes event lookup by course via buildCourseFilter()')
assert(/const dayEventIds = new Set\(dayEventRows\.map\(r => r\.id\)\)/.test(bulkDayBody),
  'pipeline collects day event ids into a Set for membership checks')

// Step 2 — validate calendarEventId membership.
assert(/requires calendarEventId \(job has content but no event\)/.test(bulkDayBody),
  'rejects job with content but no calendarEventId')
assert(/calendarEventId does not belong to \$\{body\.date\} on this course/.test(bulkDayBody),
  'rejects job whose calendarEventId is not in the day/course event set')

// Step 3 — blank filter reuses the DAB.10a helper.
assert(/isBlankJobPayload/.test(ASSIGN_W),
  'reuses isBlankJobPayload from DAB.10a')
assert(/const populatedJobs = body\.jobs\.filter\(j =>\s*\n?\s*!isBlankJobPayload\(j\) && j\.calendarEventId\s*\n?\s*\)/.test(bulkDayBody),
  'filters blanks AND requires calendarEventId (no event = nothing to attach)')

// Step 4 — scoped DELETE.
assert(/DELETE FROM crew_assignments\s*\n\s*WHERE employee_name = \?\s*\n\s*AND calendar_event_id IN/.test(bulkDayBody),
  'DELETE scopes to employee_name + calendar_event_id IN (day event ids)')
assert(/\[\.\.\.dayEventIds\]\.map\(\(\) => '\?'\)\.join\(','\)/.test(bulkDayBody),
  'DELETE binds the day event ids array')

// Critical negative pins — must NOT delete other employees or other dates.
const deleteSegment = bulkDayBody.match(/DELETE FROM crew_assignments[\s\S]{0,400}?\.run\(\)/)?.[0] ?? ''
assert(!/employee_name = \?\s*\n[\s\S]{0,200}OR\s/.test(deleteSegment),
  'DELETE never uses OR on employee_name (would leak to other employees)')
assert(!/AND \(.*OR.*\)/.test(deleteSegment),
  'DELETE never uses OR-grouped conditions (scoped tightly to employee + events)')

// Step 5 — INSERT with job_order = post-filter payload index.
assert(/INSERT INTO crew_assignments \([\s\S]{0,400}job_order\s*\n?\s*\) VALUES/.test(bulkDayBody),
  'INSERT column list includes job_order')
assert(/for \(let i = 0; i < populatedJobs\.length; i\+\+\)/.test(bulkDayBody),
  'loop iterates populatedJobs (post-blank-filter)')

// Step 6 — hydrated response ordered by job_order ASC.
assert(/SELECT \* FROM crew_assignments\s*\n\s*WHERE id IN \(\$\{placeholders\}\) ORDER BY job_order ASC/.test(bulkDayBody),
  'returns inserted rows ORDER BY job_order ASC')
assert(/rows:\s+results\.map\(rowToCrewAssignment\)/.test(bulkDayBody),
  'response shape: { ok, date, employeeName, rows: [<mapped rows>] }')

// Empty clear path.
assert(/if \(insertedIds\.length === 0\)[\s\S]{0,300}rows:\s+\[\]/.test(bulkDayBody),
  'empty jobs (after blank filter) returns rows: [] without erroring (intentional clear path)')

// ── Router exposes /bulk-employee-day correctly ───────────────────
section('Router — /api/crew-assignments/bulk-employee-day declared before /:id')

assert(/bulkReplaceEmployeeDay,\s+\/\/ Phase DAB\.10a\.1/.test(ROUTER),
  'router imports bulkReplaceEmployeeDay')
assert(/if \(pathname === '\/api\/crew-assignments\/bulk-employee-day'\)/.test(ROUTER),
  'router matches pathname === "/api/crew-assignments/bulk-employee-day"')
assert(/if \(method === 'POST'\) return bulkReplaceEmployeeDay\(env, request\)/.test(ROUTER),
  'POST /api/crew-assignments/bulk-employee-day → bulkReplaceEmployeeDay')

// Route ordering: literal /bulk-employee-day MUST come before the
// /:id regex (otherwise the regex would match "bulk-employee-day"
// as an id).
const bulkDayLine  = ROUTER.split('\n').findIndex(l => l.includes("'/api/crew-assignments/bulk-employee-day'"))
const crewIdLine   = ROUTER.split('\n').findIndex(l => l.includes("/api\\/crew-assignments\\/([^/]+)"))
assert(bulkDayLine >= 0 && crewIdLine >= 0 && bulkDayLine < crewIdLine,
  '/bulk-employee-day route declared BEFORE /:id route (literal before regex catch-all)')

// Both bulk routes coexist: DAB.10a's /bulk-jobs route is preserved.
const bulkJobsLine = ROUTER.split('\n').findIndex(l => l.includes("'/api/crew-assignments/bulk-jobs'"))
assert(bulkJobsLine >= 0,
  'DAB.10a /bulk-jobs route preserved (no DAB.10a regression)')
assert(bulkJobsLine < crewIdLine,
  '/bulk-jobs also declared before /:id catch-all (DAB.10a invariant preserved)')

// ── Permission gating — existing crewAssignmentRule covers it ─────
section('Permission — covered by existing crewAssignmentRule (no new rule)')

assert(/\['\/api\/crew-assignments',\s+crewAssignmentRule\]/.test(PERM),
  '/api/crew-assignments still mapped via crewAssignmentRule (function)')
assert(/return actorHasPermission\(actor, 'canEditAssignments'\)/.test(PERM),
  'crewAssignmentRule returns canEditAssignments for non-status-only requests (POST falls here)')

// Negative pin: no new rule for the bulk endpoints.
assert(!/'\/api\/crew-assignments\/bulk/.test(PERM),
  'no new MUTATION_RULES entry for /bulk-* routes (prefix coverage is enough)')

// ── Store helper ──────────────────────────────────────────────────
section('Store — bulkReplaceEmployeeDay(payload) helper exported')

assert(/export async function bulkReplaceEmployeeDay\(payload\)/.test(STORE),
  'store exports bulkReplaceEmployeeDay(payload)')

// Sends to /bulk-employee-day with course scope.
assert(/fetchJSON\(\`\$\{CREW_API\}\/bulk-employee-day\`/.test(STORE),
  'store POSTs to ${CREW_API}/bulk-employee-day')
assert(/courseId: getSelectedCourseId\(\),\s+\.\.\.payload/.test(STORE),
  'store injects courseId from getSelectedCourseId() into the payload')

// Local cache rebuild path — non-empty case scopes the filter to
// (employee, calendarEventIds we touched).
assert(/const newRowEventIds = new Set\(newRows\.map\(r => r\.calendarEventId\)\)/.test(STORE),
  'non-empty save computes affected event ids from response')
assert(/!\(a\.employeeName === empName && newRowEventIds\.has\(a\.calendarEventId\)\)/.test(STORE),
  'cache rebuild drops rows for (employee, calendarEventIds we touched)')

// Empty/clear path falls back to a refresh because the response
// can't tell us which event ids were deleted.
assert(/if \(newRows\.length === 0\)[\s\S]{0,400}refreshAssignmentsData/.test(STORE),
  'empty save triggers refreshAssignmentsData to re-pull canonical state')

// Error path: refresh on failure.
assert(/refreshAssignmentsData\(\)/.test(STORE),
  'error path calls refreshAssignmentsData to flush optimistic drift')

// Store still also exports DAB.10a's bulkReplaceEmployeeJobs (graceful coexistence).
assert(/export async function bulkReplaceEmployeeJobs\(payload\)/.test(STORE),
  'DAB.10a store helper bulkReplaceEmployeeJobs still exported (per-event subrow workflow preserved)')

// ── DAB.10a endpoint preserved untouched ──────────────────────────
section('DAB.10a endpoint preserved untouched')

assert(/export async function bulkReplaceEmployeeJobs\(env, request\)/.test(ASSIGN_W),
  'worker bulkReplaceEmployeeJobs still exported')

// Confirm DAB.10a pipeline still intact (per-event delete).
const bulkJobsBody = ASSIGN_W.match(/export async function bulkReplaceEmployeeJobs[\s\S]{0,3500}?\n^\}/m)?.[0] ?? ''
assert(/DELETE FROM crew_assignments\s*\n\s*WHERE calendar_event_id = \? AND employee_name = \?/.test(bulkJobsBody),
  'DAB.10a per-event DELETE preserved')

// Existing list/get/create/update/delete preserved.
for (const name of ['listCrewAssignments', 'getCrewAssignment', 'createCrewAssignment',
                    'updateCrewAssignment', 'deleteCrewAssignment',
                    'listEquipmentReservations', 'createEquipmentReservation']) {
  assert(new RegExp(`export async function ${name}\\b`).test(ASSIGN_W),
    `${name} still exported`)
}

// ── jobOrder still exposed on the read model (DAB.10b needs it) ──
section('jobOrder still exposed in rowToCrewAssignment (DAB.10b sort key)')

assert(/jobOrder:\s+row\.job_order \?\? 0/.test(ASSIGN_W),
  'rowToCrewAssignment exposes jobOrder = row.job_order ?? 0 (DAB.10a invariant)')

// ── No DAB editor / Display Board / Kiosk UI changes ──────────────
section('No DAB editor / Display Board / Kiosk UI changes in DAB.10a.1')

assert(!DAB.includes('Phase DAB.10a.1'),
  'DailyAssignmentBoard carries no Phase DAB.10a.1 edits (UI deferred to DAB.10b)')
assert(!KIOSK.includes('Phase DAB.10a.1'),
  'DisplayBoard carries no Phase DAB.10a.1 edits (UI deferred to DAB.10b)')

// ── Existing single-job flow still works (regression couples) ─────
section('Backwards compatibility — single-job assignments still function')

// Legacy callers continue to use createCrewAssignment / patchCrewAssignment.
assert(/export async function createCrewAssignment\b/.test(STORE),
  'store createCrewAssignment still exported (single-job morning workflow)')
assert(/export async function patchCrewAssignment\b/.test(STORE),
  'store patchCrewAssignment still exported (status / notes edits)')
assert(/export async function deleteCrewAssignment\b/.test(STORE),
  'store deleteCrewAssignment still exported (clear handler)')

// Worker createCrewAssignment still defaults jobOrder to 0.
assert(/\? Math\.max\(0, Math\.floor\(Number\(body\.jobOrder\)\)\)\s+:\s+0/.test(ASSIGN_W),
  'createCrewAssignment still defaults to jobOrder = 0 (legacy single-job compatibility)')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — spray + inventory untouched')

for (const path of [
  'worker/api/sprays.js',
  'worker/api/inventory.js',
  'worker/api/sprayPrograms.js',
  'src/utils/sprays/spraysStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10a.1'),
    `${path} carries no Phase DAB.10a.1 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
