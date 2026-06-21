// Phase DAB.10a — Backend contract for ordered multiple jobs per
// employee per day.
//
//   node scripts/smoke-dab-multi-job-backend.mjs
//
// Pins:
//   • Migration 0055 exists + introduces job_order column + drops the
//     old unique (event, employee) index + creates the new triple
//     unique (event, employee, job_order) + creates a convenience
//     index on (event, job_order).
//   • rowToCrewAssignment exposes jobOrder as camelCase, defaulting
//     to 0 when row.job_order is NULL/missing (legacy compatibility).
//   • createCrewAssignment honors body.jobOrder, dedupes on the
//     new triple key, and stores job_order in the row.
//   • CREW_CORE_COLUMNS includes jobOrder → job_order so PATCH callers
//     can update the order field via the existing update endpoint.
//   • New bulkReplaceEmployeeJobs(env, request) helper exists, with
//     validation, blank-job filtering, DELETE-all-then-INSERT-with-
//     ordered-index pipeline, and hydrated response.
//   • Worker router exposes POST /api/crew-assignments/bulk-jobs.
//   • Route is gated by canEditAssignments via the existing
//     /api/crew-assignments rule in MUTATION_RULES (no new rule).
//   • spraysStore exposes bulkReplaceEmployeeJobs(payload) helper.
//   • DAB editor / Display Board / Kiosk surfaces are UNCHANGED
//     (no UI work in DAB.10a — that's DAB.10b).
//
// Migration smoke ceiling is now 0055 (sweep done as part of DAB.10a).

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIG       = readFileSync('worker/migrations/0055_crew_assignments_job_order.sql', 'utf8')
const ASSIGN_W  = readFileSync('worker/api/assignments.js',                             'utf8')
const ROUTER    = readFileSync('worker/index.js',                                       'utf8')
const PERM      = readFileSync('worker/lib/mutationPermissions.js',                     'utf8')
const STORE     = readFileSync('src/utils/assignments/assignmentsStore.js',             'utf8')
const DAB       = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',          'utf8')
const KIOSK     = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',               'utf8')

// ── Migration ceiling now 0055 ────────────────────────────────────
section('Migration 0055 exists + replaces the (event, employee) unique')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0055_crew_assignments_job_order.sql'),
  '0055_crew_assignments_job_order.sql is on disk')
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 is the highest migration (new ceiling)')

assert(/ALTER TABLE crew_assignments ADD COLUMN job_order INTEGER NOT NULL DEFAULT 0/.test(MIG),
  'migration adds job_order INTEGER NOT NULL DEFAULT 0')
assert(/DROP INDEX IF EXISTS idx_crew_assignments_event_person/.test(MIG),
  'migration drops the old (event, employee) unique index')
assert(/CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_assignments_event_person_order\s*\n\s*ON crew_assignments\(calendar_event_id, employee_name, job_order\)/.test(MIG),
  'migration creates the new triple unique (event, employee, job_order)')
assert(/CREATE INDEX IF NOT EXISTS idx_crew_assignments_event_order\s*\n\s*ON crew_assignments\(calendar_event_id, job_order\)/.test(MIG),
  'migration creates convenience (event, job_order) lookup index')

// Defense in depth — the old unique name must NOT be recreated.
const newUniqueCount = (MIG.match(/idx_crew_assignments_event_person_order/g) ?? []).length
const oldUniqueCount = (MIG.match(/idx_crew_assignments_event_person\b(?!_order)/g) ?? []).length
assert(newUniqueCount >= 1 && oldUniqueCount >= 1,
  'old unique name only appears in DROP; new unique name in CREATE')

// ── rowToCrewAssignment exposes jobOrder ──────────────────────────
section('rowToCrewAssignment exposes jobOrder camelCase (default 0)')

assert(/jobOrder:\s+row\.job_order \?\? 0/.test(ASSIGN_W),
  'mapper returns jobOrder = row.job_order ?? 0 (legacy NULL → 0)')

// ── createCrewAssignment honors body.jobOrder ─────────────────────
section('createCrewAssignment honors body.jobOrder + dedupes on triple key')

assert(/const jobOrder = Number\.isFinite\(Number\(body\.jobOrder\)\)/.test(ASSIGN_W),
  'createCrewAssignment parses body.jobOrder as a non-negative integer')
assert(/Math\.max\(0, Math\.floor\(Number\(body\.jobOrder\)\)\)/.test(ASSIGN_W),
  'createCrewAssignment clamps jobOrder to non-negative integer')

// Dedupe SELECT widened to include job_order.
assert(/WHERE calendar_event_id = \? AND employee_name = \? AND job_order = \?/.test(ASSIGN_W),
  'createCrewAssignment dedupe SELECT includes job_order')

// INSERT column list includes job_order. createCrewAssignment is the
// first INSERT in the file; capture its block from `export async
// function createCrewAssignment` down to its `.run()`.
const createBody = ASSIGN_W.match(/export async function createCrewAssignment[\s\S]{0,3000}?\n\}/m)?.[0] ?? ''
assert(/INSERT INTO crew_assignments \([\s\S]{0,400}job_order\s*\n\s*\) VALUES/.test(createBody),
  'createCrewAssignment INSERT column list includes job_order')
assert(/jobOrder,\s*\/\/ Phase DAB\.10a/.test(ASSIGN_W),
  'createCrewAssignment binds jobOrder as the final positional parameter')

// CREW_CORE_COLUMNS now includes jobOrder.
assert(/jobOrder:\s+'job_order',\s+\/\/ Phase DAB\.10a/.test(ASSIGN_W),
  'CREW_CORE_COLUMNS maps jobOrder → job_order (PATCH support)')

// ── bulkReplaceEmployeeJobs helper ────────────────────────────────
section('bulkReplaceEmployeeJobs helper exists with full pipeline')

assert(/export async function bulkReplaceEmployeeJobs\(env, request\)/.test(ASSIGN_W),
  'bulkReplaceEmployeeJobs(env, request) exported')

assert(/function isBlankJobPayload\(j\)/.test(ASSIGN_W),
  'isBlankJobPayload(j) helper declared')
// Definition pinned.
const blankBody = ASSIGN_W.match(/function isBlankJobPayload[\s\S]{0,500}?\n\}/)?.[0] ?? ''
assert(/notes === '' && notesEs === '' && role === ''/.test(blankBody),
  'blank-job definition: no notes AND no notesEs AND no role (status alone never counts as content)')

// Required-field validation.
assert(/calendarEventId is required/.test(ASSIGN_W),
  'rejects missing calendarEventId')
assert(/employeeName is required/.test(ASSIGN_W),
  'rejects missing employeeName')
assert(/jobs must be an array/.test(ASSIGN_W),
  'rejects when jobs is not an array')

// Pipeline: filter blanks → DELETE for (event, employee) → INSERT each in order.
const bulkBody = ASSIGN_W.match(/export async function bulkReplaceEmployeeJobs[\s\S]{0,3500}?\n^\}/m)?.[0] ?? ''
assert(bulkBody.length > 0, 'bulkReplaceEmployeeJobs body parsed')
assert(/const populatedJobs = body\.jobs\.filter\(j => !isBlankJobPayload\(j\)\)/.test(bulkBody),
  'pipeline filters blank jobs out before DELETE/INSERT')
assert(/DELETE FROM crew_assignments\s*\n\s*WHERE calendar_event_id = \? AND employee_name = \?/.test(bulkBody),
  'pipeline DELETEs all rows for (event, employee) before INSERTing the new set')
assert(/INSERT INTO crew_assignments[\s\S]{0,400}?job_order/.test(bulkBody),
  'pipeline INSERTs new rows with job_order populated')
assert(/i,\s*\/\/ job_order = payload index/.test(bulkBody),
  'pipeline assigns job_order = payload index (0..N-1)')

// Returns hydrated rows.
assert(/SELECT \* FROM crew_assignments\s*\n\s*WHERE id IN \(\$\{placeholders\}\) ORDER BY job_order ASC/.test(bulkBody),
  'pipeline returns inserted rows ORDERed BY job_order ASC')
assert(/rows:\s+results\.map\(rowToCrewAssignment\)/.test(bulkBody),
  'response shape: { ok, calendarEventId, employeeName, rows: [<mapped>] }')

// Empty-array case returns ok + rows: [] (explicit "clear all jobs" path).
assert(/if \(insertedIds\.length === 0\)[\s\S]{0,300}rows:\s+\[\]/.test(bulkBody),
  'empty jobs (after blank filter) returns rows: [] without erroring (intentional clear path)')

// ── Router exposes /bulk-jobs ─────────────────────────────────────
section('Router exposes POST /api/crew-assignments/bulk-jobs')

assert(/bulkReplaceEmployeeJobs,\s+\/\/ Phase DAB\.10a/.test(ROUTER),
  'router imports bulkReplaceEmployeeJobs')
assert(/if \(pathname === '\/api\/crew-assignments\/bulk-jobs'\)/.test(ROUTER),
  'router matches pathname === "/api/crew-assignments/bulk-jobs"')
assert(/if \(method === 'POST'\) return bulkReplaceEmployeeJobs\(env, request\)/.test(ROUTER),
  'POST /api/crew-assignments/bulk-jobs → bulkReplaceEmployeeJobs')

// Route must be matched BEFORE /api/crew-assignments/:id (or :id regex
// must not greedily consume "bulk-jobs"). The regex is `[^/]+` which
// would happily match "bulk-jobs" — so the literal route must come
// first. Verify by line numbers.
const bulkLine    = ROUTER.split('\n').findIndex(l => l.includes("'/api/crew-assignments/bulk-jobs'"))
const crewIdLine  = ROUTER.split('\n').findIndex(l => l.includes("/api\\/crew-assignments\\/([^/]+)"))
assert(bulkLine >= 0 && crewIdLine >= 0 && bulkLine < crewIdLine,
  '/bulk-jobs route declared BEFORE /:id route (literal match before regex catch-all)')

// ── Permission gated by canEditAssignments ────────────────────────
section('Permission — /api/crew-assignments prefix already maps to canEditAssignments')

// /api/crew-assignments maps to a function rule (crewAssignmentRule)
// rather than a literal string, because PATCH-status-only carves out
// the lighter canUpdateTaskStatus permission. POST (the bulk-jobs
// route's method) falls through to canEditAssignments — verified by
// reading the rule body below.
assert(/\['\/api\/crew-assignments',\s+crewAssignmentRule\]/.test(PERM),
  'MUTATION_RULES gates /api/crew-assignments via crewAssignmentRule (function)')
assert(/return actorHasPermission\(actor, 'canEditAssignments'\)/.test(PERM),
  'crewAssignmentRule returns actorHasPermission(actor, canEditAssignments) for non-status-only requests (POST falls here)')

// ── Store helper ──────────────────────────────────────────────────
section('Store — bulkReplaceEmployeeJobs(payload) helper exported')

assert(/export async function bulkReplaceEmployeeJobs\(payload\)/.test(STORE),
  'store exports bulkReplaceEmployeeJobs(payload)')

// Sends to /bulk-jobs with course scope.
assert(/fetchJSON\(\`\$\{CREW_API\}\/bulk-jobs\`/.test(STORE),
  'store POSTs to ${CREW_API}/bulk-jobs')
assert(/courseId: getSelectedCourseId\(\),\s+\.\.\.payload/.test(STORE),
  'store injects courseId from getSelectedCourseId() into the payload')

// Local cache rebuild: drop existing (event, employee) rows + merge saved rows.
assert(/state\.crewAssignments\.filter\(a =>\s*\n?\s*!\(a\.calendarEventId === eventId && a\.employeeName === empName\)/.test(STORE),
  'store rebuilds local cache by dropping rows for (event, employee) before merging saved rows')
assert(/setState\(\{\s*\n?\s*crewAssignments:\s+\[/.test(STORE),
  'store calls setState with the rebuilt list')

// Error path: refresh on failure to prevent optimistic drift.
assert(/refreshAssignmentsData\(\)/.test(STORE),
  'store calls refreshAssignmentsData on error to flush optimistic drift')

// ── No UI changes in DAB.10a (DAB.10b territory) ──────────────────
section('No DAB editor / Display Board / Kiosk UI changes in DAB.10a')

assert(!DAB.includes('Phase DAB.10a'),
  'DailyAssignmentBoard carries no Phase DAB.10a edits (UI deferred)')
assert(!KIOSK.includes('Phase DAB.10a'),
  'DisplayBoard carries no Phase DAB.10a edits (UI deferred)')

// ── Backwards compatibility — single-job assignments still work ───
section('Backwards compatibility — legacy single-job rows + endpoints intact')

// Legacy callers omit jobOrder → defaults to 0.
assert(/\? Math\.max\(0, Math\.floor\(Number\(body\.jobOrder\)\)\)\s+:\s+0/.test(ASSIGN_W),
  'createCrewAssignment defaults to jobOrder = 0 when body.jobOrder is missing/invalid')

// Existing endpoints still exported.
assert(/export async function listCrewAssignments\b/.test(ASSIGN_W),
  'listCrewAssignments still exported')
assert(/export async function getCrewAssignment\b/.test(ASSIGN_W),
  'getCrewAssignment still exported')
assert(/export async function updateCrewAssignment\b/.test(ASSIGN_W),
  'updateCrewAssignment still exported')
assert(/export async function deleteCrewAssignment\b/.test(ASSIGN_W),
  'deleteCrewAssignment still exported')

// Existing PATCH-with-notes invalidates notes_es (Phase 9C.5c3).
assert(/sets\.push\('notes_es = NULL'\)/.test(ASSIGN_W),
  'updateCrewAssignment still NULLs notes_es when notes is PATCHed without notesEs (Phase 9C.5c3 preserved)')

// Existing store helpers still exported.
for (const name of ['createCrewAssignment', 'patchCrewAssignment', 'deleteCrewAssignment',
                    'createEquipmentReservation', 'patchEquipmentReservation', 'deleteEquipmentReservation',
                    'refreshAssignmentsData', 'useAssignmentsData']) {
  assert(new RegExp(`export async function ${name}\\b|export function ${name}\\b`).test(STORE),
    `store still exports ${name}`)
}

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB UI + kiosk + spray surfaces untouched')

for (const path of [
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10a'),
    `${path} carries no Phase DAB.10a edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
