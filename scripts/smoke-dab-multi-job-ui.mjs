// Phase DAB.10b — Multi-job editor + display rendering smoke.
//
//   node scripts/smoke-dab-multi-job-ui.mjs
//
// Pins:
//   • DAB editor data shaping — assignmentsByEmpId (new ordered Map)
//     coexists with the legacy assignmentByEmpId single-row lookup.
//   • Primary-row compatibility — all 5 legacy callsites unchanged.
//   • additionalJobsByEmpId Map returns jobs.slice(1) for multi-job
//     employees; single-job employees get an empty array and no
//     extra rows render.
//   • "+ Add Job" affordance + inline picker reveal pattern.
//   • Remove handler wires to deleteCrewAssignment (existing path).
//   • Add handler uses createCrewAssignment with body.jobOrder set
//     to (existing count) — defers to DAB.10a worker's dedupe.
//   • ORDINAL_LABELS constant defines "1st/2nd/3rd/4th Job".
//   • Editor adds extra rows via Fragment wrap; primary <tr> shape
//     unchanged.
//   • CSS classes for sub-rows + Add Job affordance defined.
//   • DisplayBoard sorts assignments by jobOrder ASC primary, then
//     startTime ASC, then priority (legacy tiebreaker preserved).
//   • DisplayBoard pushes jobOrder onto each assignment.
//   • DisplayBoard renders ordinal label ONLY when op.assignments
//     has more than one entry (single-job operators look unchanged).
//   • BOARD_ORDINAL_LABELS constant defines the kiosk labels.
//   • No worker / store / migration changes in DAB.10b.
//   • DAB.10a + DAB.10a.1 backend contracts still pinned.
//   • Spray / inventory untouched.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB        = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',        'utf8')
const DAB_CSS    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')
const KIOSK      = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',             'utf8')
const KIOSK_CSS  = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',      'utf8')
const ASSIGN_W   = readFileSync('worker/api/assignments.js',                           'utf8')
const STORE      = readFileSync('src/utils/assignments/assignmentsStore.js',           'utf8')

// ── No new migration / DAB.10a + DAB.10a.1 contracts intact ───────
section('No new migration / DAB.10a + DAB.10a.1 contracts intact')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0055_crew_assignments_job_order.sql',
  '0055 still the highest migration (no new migration in DAB.10b)')

assert(/export async function bulkReplaceEmployeeDay\(env, request\)/.test(ASSIGN_W),
  'DAB.10a.1 bulkReplaceEmployeeDay still exported in worker')
assert(/export async function bulkReplaceEmployeeJobs\(env, request\)/.test(ASSIGN_W),
  'DAB.10a bulkReplaceEmployeeJobs still exported in worker')
assert(/jobOrder:\s+row\.job_order \?\? 0/.test(ASSIGN_W),
  'rowToCrewAssignment still exposes jobOrder (DAB.10a invariant)')
assert(/export async function bulkReplaceEmployeeDay\(payload\)/.test(STORE),
  'store bulkReplaceEmployeeDay still exported')

// Phase DAB.10b — worker is unchanged this phase.
assert(!ASSIGN_W.includes('Phase DAB.10b'),
  'worker/api/assignments.js carries no Phase DAB.10b edits (no worker changes)')

// ── DAB editor — new data shaping ──────────────────────────────────
section('DAB editor — assignmentsByEmpId / assignmentByEmpId / additionalJobsByEmpId')

// New ordered-array Map exists.
assert(/const assignmentsByEmpId = useMemo\(/.test(DAB),
  'assignmentsByEmpId (Map<empKey, ordered Job[]>) declared')

// Sort by jobOrder ASC with assignedAt fallback for legacy ties.
assert(/const jx = x\.jobOrder \?\? 0\s*\n\s*const jy = y\.jobOrder \?\? 0\s*\n\s*if \(jx !== jy\) return jx - jy/.test(DAB),
  'assignmentsByEmpId sort uses jobOrder ASC, falls back to assignedAt')

// Backward-compat single-row lookup is built FROM the new ordered Map.
assert(/const assignmentByEmpId = useMemo\(\(\) => \{\s*\n\s*const m = new Map\(\)\s*\n\s*for \(const \[k, arr\] of assignmentsByEmpId\.entries\(\)\) \{\s*\n\s*if \(arr\.length > 0\) m\.set\(k, arr\[0\]\)/.test(DAB),
  'assignmentByEmpId derives jobs[0] from assignmentsByEmpId (legacy single-row callsites unchanged)')

// Additional jobs Map.
assert(/const additionalJobsByEmpId = useMemo\(\(\) => \{\s*\n\s*const m = new Map\(\)\s*\n\s*for \(const \[k, arr\] of assignmentsByEmpId\.entries\(\)\) \{\s*\n\s*if \(arr\.length > 1\) m\.set\(k, arr\.slice\(1\)\)/.test(DAB),
  'additionalJobsByEmpId returns jobs.slice(1) for multi-job employees')

// ── Primary-row compatibility — 5 legacy callsites unchanged ──────
section('Primary-row compatibility — all 5 legacy callsites unchanged')

// All 5 original sites still read assignmentByEmpId (the now-derived
// primary-only Map). Counted via the .get(emp.id) ?? .get(emp.name)
// pattern which is the canonical lookup signature.
const legacyLookups = (DAB.match(/assignmentByEmpId\.get\(emp\.id\) \?\? assignmentByEmpId\.get\(emp\.name\)/g) ?? []).length
assert(legacyLookups >= 4,
  `at least 4 legacy lookups of assignmentByEmpId.get(emp.id) ?? .get(emp.name) preserved (found: ${legacyLookups})`)
// (The 5th use is in the modal-employee derivation which uses
// modalEmployee.id/name instead of emp — also preserved below.)
assert(/assignmentByEmpId\.get\(modalEmployee\.id\) \?\? assignmentByEmpId\.get\(modalEmployee\.name\)/.test(DAB),
  'modal-employee assignment lookup also still reads assignmentByEmpId (primary row only)')

// ── Add Job affordance ────────────────────────────────────────────
section('Add Job affordance — opt-in picker reveal')

// State + handlers.
assert(/const \[addingJobForEmpId, setAddingJobForEmpId\] = useState\(null\)/.test(DAB),
  'addingJobForEmpId state declared')
assert(/function openAddJobPicker\(emp\)/.test(DAB),
  'openAddJobPicker(emp) declared')
assert(/function closeAddJobPicker\(\)/.test(DAB),
  'closeAddJobPicker() declared')
assert(/async function handleAddAdditionalJob\(emp, templateId\)/.test(DAB),
  'handleAddAdditionalJob(emp, templateId) declared')

// Handler computes next job_order from existing jobs count.
assert(/const nextOrder = existingJobs\.length/.test(DAB),
  'handleAddAdditionalJob computes nextOrder = existingJobs.length')
// Handler uses createCrewAssignment with jobOrder set to nextOrder.
assert(/await createCrewAssignment\(\{[\s\S]{0,400}jobOrder:\s+nextOrder/.test(DAB),
  'handleAddAdditionalJob calls createCrewAssignment({ ..., jobOrder: nextOrder })')

// Dedupe guard — refuses to add the same task twice.
assert(/existingJobs\.some\(j => j\.calendarEventId === event\.id\)/.test(DAB),
  'handleAddAdditionalJob refuses duplicate (employee, event)')

// Rendered button + picker.
assert(/\+ Add Job/.test(DAB),
  '"+ Add Job" button text present')
assert(/dabAddJobBtn/.test(DAB) && /\.dabAddJobBtn\s*\{/.test(DAB_CSS),
  '.dabAddJobBtn class rendered + styled')
assert(/dabAddJobPicker/.test(DAB) && /\.dabAddJobPicker\s*\{/.test(DAB_CSS),
  '.dabAddJobPicker class rendered + styled')

// "+ Add Job" gated to employees with an assignment (the primary
// task picker handles the unassigned → first-task path).
assert(/\{assignment && \(\s*\n\s*<tr className=\{styles\.dabAddJobRow\}/.test(DAB),
  '"+ Add Job" sub-row gated on `assignment` (employee must have a primary task first)')

// ── Additional job rows + Remove ──────────────────────────────────
section('Additional job rows — render + Remove')

assert(/async function handleRemoveAdditionalJob\(emp, assignment\)/.test(DAB),
  'handleRemoveAdditionalJob declared')
assert(/await unlinkReservationsFor\(assignment\.id\)\s*\n\s*await deleteCrewAssignment\(assignment\.id\)/.test(DAB),
  'remove handler unlinks reservations then calls existing deleteCrewAssignment')

// Additional rows are rendered via the additionalJobs array.
assert(/additionalJobs\.map\(\(aj, idx\) =>/.test(DAB),
  'additionalJobs.map((aj, idx)) renders the extra rows')

// Ordinal labels (1st Job for idx=0, 2nd Job for idx=1, etc.).
assert(/const ORDINAL_LABELS = \['1st Job', '2nd Job', '3rd Job', '4th Job'\]/.test(DAB),
  'ORDINAL_LABELS constant defines 1st/2nd/3rd/4th Job')
assert(/const jobLabel = ORDINAL_LABELS\[idx \+ 1\] \?\? `Job \$\{idx \+ 2\}`/.test(DAB),
  'additional-job label = ORDINAL_LABELS[idx + 1] (2nd Job for first additional, etc.)')

// Per-row Remove button.
assert(/onClick=\{\(\) => handleRemoveAdditionalJob\(emp, aj\)\}/.test(DAB),
  'Remove button calls handleRemoveAdditionalJob(emp, aj)')
assert(/aria-label=\{`Remove \$\{jobLabel\} for \$\{emp\.name\}`\}/.test(DAB),
  'Remove button has accessible aria-label')

// CSS classes.
for (const cls of ['dabAdditionalJobRow', 'dabAdditionalJobLabel',
                   'dabAdditionalJobTask', 'dabAdditionalJobNotes',
                   'dabAdditionalJobActions', 'dabRemoveJobBtn']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(DAB_CSS),
    `.${cls} CSS class defined`)
  assert(new RegExp(`styles\\.${cls}`).test(DAB),
    `styles.${cls} used in JSX`)
}

// Fragment wrap — emp.map returns a Fragment now (not just a single tr).
assert(/import \{ useMemo, useState, Fragment \} from 'react'/.test(DAB),
  'Fragment imported from react')
assert(/return \(\s*\n\s*<Fragment key=\{emp\.id\}>/.test(DAB),
  'employee row returns <Fragment key={emp.id}> wrapping primary + extra rows')

// Primary tr no longer carries key=emp.id (Fragment took the key).
assert(/<tr\s*\n\s*data-busy=\{busyEmpId === emp\.id \? 'true' : undefined\}/.test(DAB),
  'primary <tr> has data-busy attr (key moved to Fragment)')

// ── Empty job filtering — no empty placeholders rendered ──────────
section('Empty job filtering — no empty 2nd/3rd placeholders by default')

// additionalJobs is only populated for employees with > 1 job.
// Single-job employees → additionalJobs.length === 0 → map renders
// nothing. Negative pin: there's no unconditional render of empty
// slots based on hard-coded indices.
assert(!/\[0, 1, 2, 3\]\.map\(\(_, i\) =>/.test(DAB),
  'no hard-coded empty-slot iteration (additional rows are data-driven)')

// On reload, only populated jobs render because additionalJobs is
// derived from crewAssignments which only contains real DB rows.
// (Pin already covered above via additionalJobsByEmpId definition.)

// ── DisplayBoard — sort + ordinal labels ──────────────────────────
section('DisplayBoard — jobOrder primary sort + ordinal labels (only when N > 1)')

// jobOrder pushed onto assignment object.
assert(/jobOrder:\s+a\.jobOrder \?\? 0/.test(KIOSK),
  'DisplayBoard pushes jobOrder onto each assignment')

// Sort: jobOrder ASC first.
assert(/op\.assignments\.sort\(\(x, y\) => \{\s*\n\s*const jx = x\.jobOrder \?\? 0\s*\n\s*const jy = y\.jobOrder \?\? 0\s*\n\s*if \(jx !== jy\) return jx - jy/.test(KIOSK),
  'assignments sorted by jobOrder ASC primary')

// Legacy tiebreaker preserved.
assert(/const t = \(x\.startTime \?\? ''\)\.localeCompare\(y\.startTime \?\? ''\)\s*\n\s*if \(t !== 0\) return t\s*\n\s*return \(PRIORITY_ORDER\[x\.priority\] \?\? 9\) - \(PRIORITY_ORDER\[y\.priority\] \?\? 9\)/.test(KIOSK),
  'startTime ASC + priority break ties (legacy sort preserved as tiebreaker)')

// Ordinal labels — only when length > 1.
assert(/const showOrdinal = op\.assignments\.length > 1/.test(KIOSK),
  'showOrdinal gate: op.assignments.length > 1')
assert(/const BOARD_ORDINAL_LABELS = \['1st Job', '2nd Job', '3rd Job', '4th Job'\]/.test(KIOSK),
  'BOARD_ORDINAL_LABELS constant defines 1st/2nd/3rd/4th Job')
assert(/const jobLabel\s+= showOrdinal\s*\n\s*\? \(BOARD_ORDINAL_LABELS\[idx\] \?\? `Job \$\{idx \+ 1\}`\)\s*\n\s*: null/.test(KIOSK),
  'jobLabel = label only when showOrdinal (null otherwise → no badge rendered)')

// Render gate.
assert(/\{jobLabel && \(\s*\n\s*<span className=\{styles\.boardJobOrdinal\}>\{jobLabel\}<\/span>\s*\n\s*\)\}/.test(KIOSK),
  'kiosk renders <span.boardJobOrdinal> conditional on jobLabel')

// CSS class.
assert(/\.boardJobOrdinal\s*\{/.test(KIOSK_CSS),
  '.boardJobOrdinal CSS class defined (kiosk-readable green ordinal badge)')

// Single-job operators look unchanged: showOrdinal=false → jobLabel
// is null → the {jobLabel && …} render branch short-circuits and no
// boardJobOrdinal element is emitted. Verified by counting render
// sites (must be exactly one, inside the conditional).
const ordinalRenderCount = (KIOSK.match(/<span className=\{styles\.boardJobOrdinal\}>/g) ?? []).length
assert(ordinalRenderCount === 1,
  `exactly one boardJobOrdinal render site in DisplayBoard (found ${ordinalRenderCount}) — single-job operators keep label-free look via the {jobLabel && …} guard`)

// ── Out-status behavior preserved ─────────────────────────────────
section('Out-status — kiosk continues to strip assignments for out employees')

// The existing out-status branch sets op.assignments = []. With
// op.assignments.length === 0, the ordinal-label render branch
// short-circuits → no orphan "1st Job" badge on an out card.
assert(/op\.assignments = \[\]\s+\/\/ do not show prior assignments/.test(KIOSK),
  'out-status branch still empties op.assignments (no jobs render for out employees)')

// ── Mobile breakpoint ─────────────────────────────────────────────
section('Mobile breakpoint — additional rows stack cleanly')

assert(/@media \(max-width: 600px\)[\s\S]{0,600}\.dabAdditionalJobRow td/.test(DAB_CSS),
  'mobile @media tightens .dabAdditionalJobRow padding/size')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — spray / inventory / employee schedule untouched')

for (const path of [
  'src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',
  'src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',
  'src/pages/Inventory/tabs/InventoryProducts.jsx',
  'worker/api/sprays.js',
  'worker/api/inventory.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase DAB.10b'),
    `${path} carries no Phase DAB.10b edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
