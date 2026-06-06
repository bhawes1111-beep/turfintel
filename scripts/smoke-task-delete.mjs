// Phase 9C.3a — Real task delete cascade smoke.
//
//   node scripts/smoke-task-delete.mjs
//
// Source-only checks confirming:
//   - the shared deleteTaskCascade helper exists, imports the right
//     store mutators, and orders them correctly
//     (patch reservations → delete crew → delete reservations → delete event)
//   - TasksManagerModal routes deletes through the cascade helper
//     instead of calling deleteCalendarEvent directly
//   - OperationsBoard has dropped the legacy deletedTaskIds local-only
//     hide and its handleDelete now uses the cascade helper
//   - confirmation copy in both surfaces summarizes the cascade impact
//   - Phase 9C.2 row-clear button + toast literals are preserved
//   - DisplayBoard / DailyAssignmentBoard / worker / D1 untouched

import { readFileSync, existsSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const HELPER_PATH = 'src/utils/tasks/deleteTaskCascade.js'
const TMM_PATH    = 'src/pages/Crew/tabs/TasksManagerModal.jsx'
const OB_PATH     = 'src/pages/Operations/OperationsBoard.jsx'

// ── deleteTaskCascade helper ───────────────────────────────────────────
section('deleteTaskCascade helper')

assert(existsSync(HELPER_PATH),
  `${HELPER_PATH} exists`)

const HELPER = readFileSync(HELPER_PATH, 'utf8')

assert(/export\s+async\s+function\s+deleteTaskCascade\s*\(/.test(HELPER),
  'deleteTaskCascade is exported as an async function')

// Helper imports each required store mutator.
assert(/import\s+\{[\s\S]*?patchEquipmentReservation[\s\S]*?\}\s+from\s+['"]\.\.\/assignments\/assignmentsStore['"]/.test(HELPER),
  'helper imports patchEquipmentReservation from assignmentsStore')
assert(/import\s+\{[\s\S]*?deleteCrewAssignment[\s\S]*?\}\s+from\s+['"]\.\.\/assignments\/assignmentsStore['"]/.test(HELPER),
  'helper imports deleteCrewAssignment from assignmentsStore')
assert(/import\s+\{[\s\S]*?deleteEquipmentReservation[\s\S]*?\}\s+from\s+['"]\.\.\/assignments\/assignmentsStore['"]/.test(HELPER),
  'helper imports deleteEquipmentReservation from assignmentsStore')
assert(/import\s+\{[\s\S]*?deleteCalendarEvent[\s\S]*?\}\s+from\s+['"]\.\.\/calendar\/calendarStore['"]/.test(HELPER),
  'helper imports deleteCalendarEvent from calendarStore')

// Order check: in the body, patchEquipmentReservation appears before
// deleteCrewAssignment which appears before deleteEquipmentReservation
// which appears before deleteCalendarEvent.
const patchIdx   = HELPER.search(/patchEquipmentReservation\(/)
const delCrewIdx = HELPER.search(/deleteCrewAssignment\(/)
const delEqIdx   = HELPER.search(/deleteEquipmentReservation\(/)
const delEvIdx   = HELPER.search(/deleteCalendarEvent\(/)
assert(patchIdx >= 0 && delCrewIdx > patchIdx,
  'helper body: patchEquipmentReservation is called before deleteCrewAssignment',
  { patchIdx, delCrewIdx })
assert(delCrewIdx >= 0 && delEqIdx > delCrewIdx,
  'helper body: deleteCrewAssignment is called before deleteEquipmentReservation',
  { delCrewIdx, delEqIdx })
assert(delEqIdx >= 0 && delEvIdx > delEqIdx,
  'helper body: deleteEquipmentReservation is called before deleteCalendarEvent',
  { delEqIdx, delEvIdx })

// Cleanup groups use Promise.allSettled (tolerate transient row failures).
assert(/Promise\.allSettled/.test(HELPER),
  'helper uses Promise.allSettled for the bulk cleanup groups')

// ── TasksManagerModal ──────────────────────────────────────────────────
section('TasksManagerModal — uses cascade, no direct event delete')

const TMM = readFileSync(TMM_PATH, 'utf8')

// Phase 9C.3b — broadened to accept a multi-name import block since
// TasksManagerModal now also pulls buildDeleteConfirmMessage from the
// same helper module.
assert(/import\s*\{[^}]*\bdeleteTaskCascade\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/utils\/tasks\/deleteTaskCascade['"]/.test(TMM),
  'TasksManagerModal imports deleteTaskCascade')
assert(/import\s+\{\s*useAssignmentsData\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/utils\/assignments\/assignmentsStore['"]/.test(TMM),
  'TasksManagerModal imports useAssignmentsData')
assert(/const\s+\{\s*crewAssignments,\s*equipmentReservations\s*\}\s*=\s*useAssignmentsData\(\)/.test(TMM),
  'TasksManagerModal destructures { crewAssignments, equipmentReservations } from useAssignmentsData()')

// handleDelete now calls the cascade helper with the assignments + reservations context.
assert(/await deleteTaskCascade\(ev\.id,\s*\{\s*crewAssignments,\s*equipmentReservations\s*\}\)/.test(TMM),
  'handleDelete: await deleteTaskCascade(ev.id, { crewAssignments, equipmentReservations })')

// And no longer calls deleteCalendarEvent directly (the cascade does it).
assert(!/deleteCalendarEvent\(/.test(TMM),
  'TasksManagerModal no longer calls deleteCalendarEvent directly')

// Phase 9C.3b — TasksManagerModal's inline confirm copy was extracted
// into buildDeleteConfirmMessage. Assert the modal now calls the shared
// helper; the helper's content is asserted separately by
// smoke-display-board-delete.mjs.
assert(/buildDeleteConfirmMessage\(ev\.title,\s*linkedCrewCount,\s*linkedEqCount\)/.test(TMM),
  'TasksManagerModal calls the shared buildDeleteConfirmMessage helper')

// ── OperationsBoard ────────────────────────────────────────────────────
section('OperationsBoard — local-only hide removed, cascade wired')

const OB = readFileSync(OB_PATH, 'utf8')

// Phase 9C.3b — broadened to accept multi-name import (OperationsBoard
// also imports buildDeleteConfirmMessage from the same helper module).
assert(/import\s*\{[^}]*\bdeleteTaskCascade\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/utils\/tasks\/deleteTaskCascade['"]/.test(OB),
  'OperationsBoard imports deleteTaskCascade')

// equipmentReservations is now destructured alongside crewAssignments.
assert(/const\s+\{\s*crewAssignments,\s*equipmentReservations\s*\}\s*=\s*useAssignmentsData\(\)/.test(OB),
  'OperationsBoard destructures equipmentReservations from useAssignmentsData()')

// deletedTaskIds state is gone (the legacy local-only hide). The
// regex below only matches a real `useState(...)` declaration or
// any reference outside a comment line; explanatory Phase 9C.3a
// comment mentions are allowed.
const obCodeOnly = OB
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
assert(!/deletedTaskIds/.test(obCodeOnly),
  'OperationsBoard no longer declares deletedTaskIds state (code-only check)')
assert(!/setDeletedTaskIds/.test(obCodeOnly),
  'OperationsBoard no longer references setDeletedTaskIds (code-only check)')

// handleDelete now calls the cascade helper.
assert(/await deleteTaskCascade\(id,\s*\{\s*crewAssignments,\s*equipmentReservations\s*\}\)/.test(OB),
  'OperationsBoard handleDelete: await deleteTaskCascade(id, { crewAssignments, equipmentReservations })')

// Confirmation modal copy mentions the impact summary surfaces.
assert(/Assignments board/.test(OB),
  'OperationsBoard delete modal copy mentions "Assignments board"')
assert(/Display Board/.test(OB),
  'OperationsBoard delete modal copy mentions "Display Board"')
assert(/crew member/.test(OB),
  'OperationsBoard delete modal copy mentions "crew member" (cascade impact summary)')
assert(/equipment/.test(OB),
  'OperationsBoard delete modal copy mentions "equipment" (cascade impact summary)')

// ── Phase 9C.2 regression couples ──────────────────────────────────────
section('Phase 9C.2 regression — clear button + toast preserved')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
assert(/>Clear<\/button>/.test(DAB),
  "Phase 9C.2: <button>Clear</button> still rendered on Crosswinds")
assert(/`Cleared \$\{emp\.name\}'s assignment\. Equipment unlinked\.`/.test(DAB),
  "Phase 9C.2: clear-with-equipment toast still in source")

// ── Cross-file guards ──────────────────────────────────────────────────
// Phase 9C.3b — DisplayBoard now consumes the Phase 9C.3a cascade and
// shared confirm helper, so the legacy "no Phase 9C.3a edits" guard is
// dropped. DailyAssignmentBoard remains untouched.
section('Cross-file guards — DailyAssignmentBoard / worker / D1 untouched')

assert(!DAB.includes('Phase 9C.3a'),
  'DailyAssignmentBoard.jsx carries no Phase 9C.3a edits')

const CAL_WORKER = readFileSync('worker/api/calendar.js', 'utf8')
assert(!CAL_WORKER.includes('Phase 9C.3a'),
  'worker/api/calendar.js carries no Phase 9C.3a edits')

const CAL_STORE = readFileSync('src/utils/calendar/calendarStore.js', 'utf8')
assert(!CAL_STORE.includes('Phase 9C.3a'),
  'calendarStore.js carries no Phase 9C.3a edits')

const ASN_STORE = readFileSync('src/utils/assignments/assignmentsStore.js', 'utf8')
assert(!ASN_STORE.includes('Phase 9C.3a'),
  'assignmentsStore.js carries no Phase 9C.3a edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
