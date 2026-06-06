// Phase 9C.3c — Tasks tab add / manage task access smoke.
//
//   node scripts/smoke-tasks-tab-add-manage.mjs
//
// Source-only checks against OperationsBoard.jsx + its CSS. The
// task-first board (the canonical 'board' tab, labeled "Tasks" on
// Crosswinds via Phase 9B.6) gains two new affordances:
//   1. A fixed-position "+ Add Task" FAB that scrolls to the
//      existing addTaskRef anchor.
//   2. A "Manage Tasks" secondary button inside the add-task form's
//      button row that opens the existing TasksManagerModal.
//
// No new edit/delete logic. TasksManagerModal owns rename via
// patchCalendarEvent and delete via deleteTaskCascade (Phase 9C.3a).
// DisplayBoard, DailyAssignmentBoard, and the worker are untouched.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const OB  = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')
const CSS = readFileSync('src/pages/Operations/OperationsBoard.module.css', 'utf8')

// ── Imports + state wiring ─────────────────────────────────────────────
section('OperationsBoard imports + new state')

assert(/import\s+TasksManagerModal\s+from\s+['"]\.\.\/Crew\/tabs\/TasksManagerModal['"]/.test(OB),
  'OperationsBoard imports TasksManagerModal from ../Crew/tabs/TasksManagerModal')

assert(/const\s+\[tasksModalOpen,\s*setTasksModalOpen\]\s*=\s*useState\(false\)/.test(OB),
  '[tasksModalOpen, setTasksModalOpen] = useState(false)')

// ── dayCalendarEvents useMemo derivation ───────────────────────────────
section('dayCalendarEvents derivation')

assert(/const\s+dayCalendarEvents\s*=\s*useMemo\(/.test(OB),
  'dayCalendarEvents useMemo defined')
assert(/calendarEvents[\s\S]{0,200}\.filter\(e => \(e\.startDate \?\? e\.date\) === selectedDate\)/.test(OB),
  'dayCalendarEvents filters by (e.startDate ?? e.date) === selectedDate')
assert(/e\.status !== 'cancelled' && e\.status !== 'completed'/.test(OB),
  'dayCalendarEvents excludes cancelled / completed events')
assert(/\[calendarEvents,\s*selectedDate\]/.test(OB),
  'dayCalendarEvents useMemo depends on [calendarEvents, selectedDate]')

// ── Manage Tasks button inside obAddTaskBtns ───────────────────────────
section('Manage Tasks button')

assert(/className=\{styles\.obManageTasksBtn\}/.test(OB),
  'Manage Tasks button uses styles.obManageTasksBtn')
assert(/onClick=\{\(\) => setTasksModalOpen\(true\)\}/.test(OB),
  'Manage Tasks button onClick calls setTasksModalOpen(true)')
assert(/Manage Tasks/.test(OB),
  'button label "Manage Tasks" present in source')

// Button sits inside the existing obAddTaskBtns row. Verify both the
// row class and the Manage Tasks button appear near each other.
assert(/styles\.obAddTaskBtns\}[\s\S]{0,800}styles\.obManageTasksBtn/.test(OB),
  'Manage Tasks button is rendered inside the obAddTaskBtns row')

// ── Floating "+ Add Task" FAB ──────────────────────────────────────────
section('Floating + Add Task FAB')

assert(/className=\{styles\.obAddTaskFab\}/.test(OB),
  'FAB uses styles.obAddTaskFab')
assert(/onClick=\{\(\) => addTaskRef\.current\?\.scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'start'\s*\}\)\}/.test(OB),
  "FAB onClick scrolls to addTaskRef with behavior:'smooth', block:'start'")
assert(/aria-label="Jump to Add Task"/.test(OB),
  'FAB has aria-label="Jump to Add Task"')
// FAB label is the "+ Add Task" copy per spec.
assert(/>\s*\+ Add Task\s*</.test(OB),
  'FAB label reads "+ Add Task"')

// ── TasksManagerModal conditional mount ───────────────────────────────
section('TasksManagerModal conditional mount')

assert(/\{tasksModalOpen && \(\s*<TasksManagerModal/.test(OB),
  '{tasksModalOpen && <TasksManagerModal ... />} conditional mount')
assert(/<TasksManagerModal[\s\S]{0,400}selectedDate=\{selectedDate\}/.test(OB),
  'TasksManagerModal receives selectedDate={selectedDate}')
assert(/<TasksManagerModal[\s\S]{0,400}dayEvents=\{dayCalendarEvents\}/.test(OB),
  'TasksManagerModal receives dayEvents={dayCalendarEvents}')
assert(/<TasksManagerModal[\s\S]{0,400}onClose=\{\(\) => setTasksModalOpen\(false\)\}/.test(OB),
  'TasksManagerModal onClose={() => setTasksModalOpen(false)}')

// ── Regression couples ────────────────────────────────────────────────
section('Regression couples — header "+ Task" button, addTaskRef, 9C.3a cascade')

// Existing "+ Task" page-header button still wired to setActiveTab('board')
// + scrollIntoView. Phase 9C.3c left this unchanged.
assert(/setActiveTab\('board'\)[\s\S]{0,200}scrollIntoView\(\{\s*behavior:\s*'smooth'/.test(OB),
  "header + Task button still calls setActiveTab('board') + addTaskRef scrollIntoView")

// addTaskRef declaration + attachment to obAddTask preserved.
assert(/const\s+addTaskRef\s*=\s*useRef\(null\)/.test(OB),
  'addTaskRef = useRef(null) declared')
assert(/<div className=\{styles\.obAddTask\} ref=\{addTaskRef\}>/.test(OB),
  'addTaskRef attached to <div styles.obAddTask>')

// Phase 9C.3a delete cascade still in source.
assert(/await deleteTaskCascade\(id,\s*\{\s*crewAssignments,\s*equipmentReservations\s*\}\)/.test(OB),
  'Phase 9C.3a: handleDelete still calls deleteTaskCascade(id, { crewAssignments, equipmentReservations })')

// ── CSS — new classes ─────────────────────────────────────────────────
section('CSS — .obAddTaskFab + .obManageTasksBtn + mobile hide')

assert(/\.obAddTaskFab\s*\{/.test(CSS),
  '.obAddTaskFab class defined')
assert(/\.obAddTaskFab[\s\S]{0,400}position:\s*fixed/.test(CSS),
  '.obAddTaskFab uses position: fixed')
assert(/\.obAddTaskFab[\s\S]{0,400}right:\s*24px[\s\S]{0,200}bottom:\s*24px/.test(CSS),
  '.obAddTaskFab anchored bottom-right (right: 24px; bottom: 24px)')
assert(/\.obAddTaskFab[\s\S]{0,400}z-index:\s*40/.test(CSS),
  '.obAddTaskFab z-index 40 (below modal backdrops)')

assert(/\.obManageTasksBtn\s*\{/.test(CSS),
  '.obManageTasksBtn class defined')

// Mobile hide rule for the FAB.
assert(/@media\s*\(\s*max-width:\s*600px\s*\)\s*\{[\s\S]{0,200}\.obAddTaskFab\s*\{\s*display:\s*none/.test(CSS),
  '@media (max-width: 600px) { .obAddTaskFab { display: none } } — FAB hidden on phones')

// ── Cross-file guards ─────────────────────────────────────────────────
section('Cross-file guards — DisplayBoard / DAB / TasksManagerModal / worker untouched')

const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
assert(!DB.includes('Phase 9C.3c'),
  'DisplayBoard.jsx carries no Phase 9C.3c edits')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
assert(!DAB.includes('Phase 9C.3c'),
  'DailyAssignmentBoard.jsx carries no Phase 9C.3c edits')

const TMM = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx', 'utf8')
assert(!TMM.includes('Phase 9C.3c'),
  'TasksManagerModal.jsx carries no Phase 9C.3c edits (modal internals reused as-is)')

const WORKER = readFileSync('worker/api/calendar.js', 'utf8')
assert(!WORKER.includes('Phase 9C.3c'),
  'worker/api/calendar.js carries no Phase 9C.3c edits')

const CAL_STORE = readFileSync('src/utils/calendar/calendarStore.js', 'utf8')
assert(!CAL_STORE.includes('Phase 9C.3c'),
  'calendarStore.js carries no Phase 9C.3c edits')

const ASN_STORE = readFileSync('src/utils/assignments/assignmentsStore.js', 'utf8')
assert(!ASN_STORE.includes('Phase 9C.3c'),
  'assignmentsStore.js carries no Phase 9C.3c edits')

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
