// Phase 9C.3b — Display Board task delete smoke.
//
//   node scripts/smoke-display-board-delete.mjs
//
// Source-only checks against DisplayBoard.jsx + its CSS, plus the
// shared buildDeleteConfirmMessage helper that now powers every
// task-delete surface (TasksManagerModal, OperationsBoard, and the
// new Display Board overflow). The delete button is gated by
// !boardMode && !printMode so it never appears on /display-board/board
// or /display-board/print. The cascade path is unchanged from 9C.3a.

import { readFileSync, existsSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const HELPER_PATH = 'src/utils/tasks/deleteTaskCascade.js'
const DB_PATH     = 'src/pages/DisplayBoard/DisplayBoard.jsx'
const DB_CSS_PATH = 'src/pages/DisplayBoard/DisplayBoard.module.css'
const TMM_PATH    = 'src/pages/Crew/tabs/TasksManagerModal.jsx'
const OB_PATH     = 'src/pages/Operations/OperationsBoard.jsx'

const HELPER = readFileSync(HELPER_PATH, 'utf8')
const DB     = readFileSync(DB_PATH, 'utf8')
const DBCSS  = readFileSync(DB_CSS_PATH, 'utf8')
const TMM    = readFileSync(TMM_PATH, 'utf8')
const OB     = readFileSync(OB_PATH, 'utf8')

// ── Shared helper export ───────────────────────────────────────────────
section('buildDeleteConfirmMessage exported from deleteTaskCascade.js')

assert(existsSync(HELPER_PATH),
  `${HELPER_PATH} exists`)
assert(/export\s+function\s+buildDeleteConfirmMessage\s*\(\s*title\s*,\s*linkedCrewCount[^,]*,\s*linkedEqCount[^)]*\)/.test(HELPER),
  'buildDeleteConfirmMessage(title, linkedCrewCount, linkedEqCount) is exported')

// Helper handles the impact-aware copy variants.
assert(/Delete\s+"\$\{safeTitle\}"\s+for today\?/.test(HELPER),
  'helper builds the opener: `Delete "${safeTitle}" for today?`')
assert(/Assignments board and the Display Board/.test(HELPER),
  'helper copy mentions both Assignments board and Display Board')
assert(/'1 crew member is assigned'/.test(HELPER),
  'helper handles singular crew phrase')
assert(/'\$\{linkedCrewCount\} crew members are assigned'/.test(HELPER) ||
       /`\$\{linkedCrewCount\} crew members are assigned`/.test(HELPER),
  'helper handles plural crew phrase')
assert(/'1 piece of equipment is linked'/.test(HELPER),
  'helper handles singular equipment phrase')
assert(/pieces of equipment are linked/.test(HELPER),
  'helper handles plural equipment phrase')
assert(/Their assignment and equipment links for this task will also be cleared/.test(HELPER),
  'helper appends the "will also be cleared" closer when links exist')

// ── TasksManagerModal — Phase 9C.11 archive-only contract ──────────────
// Phase 9C.11 retired the per-day calendar_event delete flow from
// TasksManagerModal in favor of task-template archive. The shared
// buildDeleteConfirmMessage helper is no longer consumed here, but is
// still consumed by OperationsBoard (asserted below) and by the
// DisplayBoard delete affordance.
section('TasksManagerModal — Phase 9C.11 archive-only contract')

assert(!/buildDeleteConfirmMessage/.test(TMM),
  'TasksManagerModal no longer references buildDeleteConfirmMessage (templates use archive)')
assert(/archiveTaskTemplate/.test(TMM),
  'TasksManagerModal uses archiveTaskTemplate instead of per-event delete')

// ── OperationsBoard — uses shared helper ──────────────────────────────
section('OperationsBoard — uses buildDeleteConfirmMessage')

assert(/import\s*\{[^}]*\bbuildDeleteConfirmMessage\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/utils\/tasks\/deleteTaskCascade['"]/.test(OB),
  'OperationsBoard imports buildDeleteConfirmMessage')
assert(/buildDeleteConfirmMessage\(deleteConfirm\.title,\s*linkedCrewCount,\s*linkedEqCount\)/.test(OB),
  'OperationsBoard calls buildDeleteConfirmMessage(deleteConfirm.title, linkedCrewCount, linkedEqCount)')

// ── DisplayBoard imports + handler ─────────────────────────────────────
section('DisplayBoard — handleDeleteEvent + mode gating')

assert(/import\s*\{[^}]*\bdeleteTaskCascade\b[^}]*\bbuildDeleteConfirmMessage\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/utils\/tasks\/deleteTaskCascade['"]/.test(DB) ||
       /import\s*\{[^}]*\bbuildDeleteConfirmMessage\b[^}]*\bdeleteTaskCascade\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/utils\/tasks\/deleteTaskCascade['"]/.test(DB),
  'DisplayBoard imports both deleteTaskCascade and buildDeleteConfirmMessage')

assert(/async\s+function\s+handleDeleteEvent\s*\(\s*event\s*\)/.test(DB),
  'DisplayBoard defines async function handleDeleteEvent(event)')
assert(/crewAssignments\.filter\(a => a\.calendarEventId === event\.id\)\.length/.test(DB),
  'handleDeleteEvent computes linkedCrewCount')
assert(/equipmentReservations\.filter\(r => r\.calendarEventId === event\.id\)\.length/.test(DB),
  'handleDeleteEvent computes linkedEqCount')
assert(/confirm\(buildDeleteConfirmMessage\(event\.title[\s\S]{0,80}linkedCrewCount,\s*linkedEqCount\)\)/.test(DB),
  'handleDeleteEvent gates on confirm(buildDeleteConfirmMessage(event.title, linkedCrewCount, linkedEqCount))')
assert(/await deleteTaskCascade\(event\.id,\s*\{\s*crewAssignments,\s*equipmentReservations\s*\}\)/.test(DB),
  'handleDeleteEvent calls deleteTaskCascade(event.id, { crewAssignments, equipmentReservations })')

// Mode gate is computed and propagated to both card branches.
assert(/const\s+canDeleteTasks\s*=\s*!boardMode\s*&&\s*!printMode/.test(DB),
  'canDeleteTasks = !boardMode && !printMode')
assert(/<OperatorCard[\s\S]{0,300}canDeleteTasks=\{canDeleteTasks\}[\s\S]{0,200}onDeleteEvent=\{handleDeleteEvent\}/.test(DB),
  '<OperatorCard> receives canDeleteTasks + onDeleteEvent')
assert(/<TaskCard[\s\S]{0,300}canDeleteTasks=\{canDeleteTasks\}[\s\S]{0,200}onDeleteEvent=\{handleDeleteEvent\}/.test(DB),
  '<TaskCard> receives canDeleteTasks + onDeleteEvent')

// Component signatures destructure the new props.
assert(/function\s+OperatorCard\s*\(\s*\{\s*operator,\s*canDeleteTasks[^}]*onDeleteEvent[^}]*\}\s*\)/.test(DB),
  'OperatorCard destructures { operator, canDeleteTasks, onDeleteEvent }')
assert(/function\s+TaskCard\s*\(\s*\{[^}]*canDeleteTasks[^}]*onDeleteEvent[^}]*\}\s*\)/.test(DB),
  'TaskCard destructures canDeleteTasks + onDeleteEvent')

// ── Per-assignment / per-task delete button render ─────────────────────
section('Delete button render — title, aria-label, mode gate')

// Operator card: button is rendered only when canDeleteTasks AND a.eventId.
assert(/canDeleteTasks && a\.eventId && \([\s\S]{0,400}className=\{styles\.assignDeleteBtn\}/.test(DB),
  'OperatorCard renders <button styles.assignDeleteBtn> gated on canDeleteTasks && a.eventId')
// TaskCard: button is rendered only when canDeleteTasks.
assert(/canDeleteTasks && \([\s\S]{0,400}className=\{styles\.assignDeleteBtn\}[\s\S]{0,400}onClick=\{\(\) => onDeleteEvent\?\.\(event\)\}/.test(DB),
  'TaskCard renders <button styles.assignDeleteBtn> with onClick → onDeleteEvent(event), gated on canDeleteTasks')
// Button copy.
assert(/title="Delete task"/.test(DB),
  'delete button title="Delete task"')
assert(/aria-label="Delete task"/.test(DB),
  'delete button aria-label="Delete task"')

// The OperatorCard delete click hands an { id, title } event-shaped
// object derived from a.eventId / a.title so deleteTaskCascade
// operates on the calendar_event, not the crew_assignment.
assert(/onDeleteEvent\?\.\(\{\s*id:\s*a\.eventId,\s*title:\s*a\.title\s*\}\)/.test(DB),
  'OperatorCard delete click calls onDeleteEvent({ id: a.eventId, title: a.title })')

// The operator-card data builder threads eventId onto each assignment.
assert(/eventId:\s*event\.id/.test(DB),
  'operatorCards derivation pushes eventId: event.id onto each assignment')

// ── CSS ────────────────────────────────────────────────────────────────
section('CSS — .assignDeleteBtn defined')

assert(/\.assignDeleteBtn\b/.test(DBCSS),
  'DisplayBoard.module.css defines .assignDeleteBtn')

// ── Phase 9C.3a regression couples ─────────────────────────────────────
section('Phase 9C.3a — cascade order preserved')

const patchIdx   = HELPER.search(/patchEquipmentReservation\(/)
const delCrewIdx = HELPER.search(/deleteCrewAssignment\(/)
const delEqIdx   = HELPER.search(/deleteEquipmentReservation\(/)
const delEvIdx   = HELPER.search(/deleteCalendarEvent\(/)
assert(patchIdx >= 0 && delCrewIdx > patchIdx,
  'cascade order: patchEquipmentReservation before deleteCrewAssignment')
assert(delCrewIdx >= 0 && delEqIdx > delCrewIdx,
  'cascade order: deleteCrewAssignment before deleteEquipmentReservation')
assert(delEqIdx >= 0 && delEvIdx > delEqIdx,
  'cascade order: deleteEquipmentReservation before deleteCalendarEvent')
assert(/export\s+async\s+function\s+deleteTaskCascade\b/.test(HELPER),
  'deleteTaskCascade is still exported async')

// ── Phase 9C.2 regression couple ───────────────────────────────────────
section('Phase 9C.2 — clear button + toast preserved')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
assert(/>Clear<\/button>/.test(DAB),
  "Phase 9C.2: <button>Clear</button> still rendered on Crosswinds")
assert(/`Cleared \$\{emp\.name\}'s assignment\. Equipment unlinked\.`/.test(DAB),
  "Phase 9C.2: clear-with-equipment toast still in source")

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — DAB / worker / D1 untouched')

assert(!DAB.includes('Phase 9C.3b'),
  'DailyAssignmentBoard.jsx carries no Phase 9C.3b edits')

const WORKER = readFileSync('worker/api/calendar.js', 'utf8')
assert(!WORKER.includes('Phase 9C.3b'),
  'worker/api/calendar.js carries no Phase 9C.3b edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
