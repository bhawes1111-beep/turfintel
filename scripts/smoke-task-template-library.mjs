// Phase 9C.11 — Reusable task library (task_templates) smoke.
//
//   node scripts/smoke-task-template-library.mjs
//
// The Daily Assignment Board task dropdown now reads from active
// task_templates rows. The legacy CROSSWINDS_TASK_LIST hardcoded JS
// constant and the per-day calendar_event-as-template flow are retired.
// Supervisors edit the library in the Task Library modal (rewritten
// TasksManagerModal). Selecting a template still creates / finds the
// calendar_event for selectedDate via pickOrCreateEventForTask so the
// downstream crew_assignment + kiosk join paths are unchanged.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIG    = readFileSync('worker/migrations/0051_task_templates.sql',     'utf8')
const API    = readFileSync('worker/api/taskTemplates.js',                   'utf8')
const IDX    = readFileSync('worker/index.js',                               'utf8')
const PERM   = readFileSync('worker/lib/mutationPermissions.js',             'utf8')
const STORE  = readFileSync('src/utils/tasks/taskTemplateStore.js',          'utf8')
const MODAL  = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx',     'utf8')
const DAB    = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',  'utf8')

// ── Migration — 0051_task_templates.sql ───────────────────────────────
section('Migration — task_templates table + seed')

assert(/CREATE TABLE IF NOT EXISTS task_templates/.test(MIG),
  'CREATE TABLE IF NOT EXISTS task_templates exists')

for (const col of [
  'id\\s+TEXT PRIMARY KEY',
  'course_id\\s+TEXT NOT NULL',
  'name\\s+TEXT NOT NULL',
  'category\\s+TEXT',
  'default_start_time\\s+TEXT',
  'default_location\\s+TEXT',
  'default_notes\\s+TEXT',
  'sort_order\\s+INTEGER NOT NULL DEFAULT 0',
  'status\\s+TEXT NOT NULL DEFAULT',
  'created_at\\s+TEXT NOT NULL DEFAULT',
  'updated_at\\s+TEXT NOT NULL DEFAULT',
]) {
  assert(new RegExp(col).test(MIG),
    `task_templates column: ${col.replace(/\\s\+\.\*/g, '').replace(/\\\+/g, ' ')}`)
}

assert(/UNIQUE INDEX[\s\S]{0,200}task_templates\(course_id,\s*name\)/.test(MIG),
  'UNIQUE INDEX on (course_id, name) defined')
assert(/INDEX[\s\S]{0,200}task_templates\(course_id,\s*status\)/.test(MIG),
  'Composite INDEX on (course_id, status) defined for the DAB hot read path')

// Seed: 14 crossroads-gc rows matching the retired CROSSWINDS_TASK_LIST.
for (const name of [
  'Mow Greens', 'Roll Greens', 'Course Setup', 'Bunkers', 'Spray',
  'Hand Water', 'Irrigation', 'Detail Work', 'Mow Tees', 'Mow Fairways',
  'Mow Rough', 'Cups', 'Cleanup', 'Project Work',
]) {
  assert(MIG.includes(`'${name}'`),
    `seed includes "${name}" for crossroads-gc`)
}
assert(/ON CONFLICT\(course_id, name\) DO NOTHING/.test(MIG),
  'seed INSERT uses ON CONFLICT DO NOTHING (idempotent)')

// ── Worker API — taskTemplates.js ─────────────────────────────────────
section('Worker API — taskTemplates.js')

for (const fn of ['listTaskTemplates', 'getTaskTemplate', 'createTaskTemplate', 'updateTaskTemplate']) {
  assert(new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`).test(API),
    `API exports async function ${fn}`)
}

assert(/SELECT \* FROM task_templates[\s\S]{0,400}ORDER BY sort_order ASC, name ASC/.test(API),
  'listTaskTemplates orders by sort_order ASC then name ASC')

assert(/if \(opts\.status !== 'all'\)[\s\S]{0,200}status = 'active'/.test(API),
  "listTaskTemplates defaults to status='active' (hot DAB dropdown path)")

assert(/INSERT INTO task_templates[\s\S]{0,400}course_id, name, category, default_start_time/.test(API),
  'createTaskTemplate INSERT includes course_id + all template fields')

assert(/UNIQUE/.test(API) && /existing[\s\S]{0,200}course_id = \? AND name = \?/.test(API),
  'createTaskTemplate handles UNIQUE collision by returning the existing row')

assert(/UPDATE task_templates SET[\s\S]{0,400}WHERE id = \?/.test(API),
  'updateTaskTemplate uses parameterized UPDATE … WHERE id = ?')

assert(/updated_at = datetime\('now'\)/.test(API),
  "updateTaskTemplate stamps updated_at = datetime('now')")

// No DELETE handler — archive only.
assert(!/export\s+async\s+function\s+deleteTaskTemplate\b/.test(API),
  'no deleteTaskTemplate export (archive-only contract)')
assert(/Archive is just a PATCH/.test(API),
  'archive-only contract documented in source')

// ── worker/index.js — route registration ──────────────────────────────
section('worker/index.js — route registration')

assert(/import\s*\{\s*[\s\S]*?listTaskTemplates,\s*\n\s*getTaskTemplate,\s*\n\s*createTaskTemplate,\s*\n\s*updateTaskTemplate,\s*\n\}\s*from\s*['"]\.\/api\/taskTemplates\.js['"]/.test(IDX),
  'worker/index.js imports task-templates handlers')

assert(/pathname === '\/api\/task-templates'/.test(IDX),
  "router matches pathname === '/api/task-templates'")
assert(/listTaskTemplates\(env,\s*courseId,\s*\{\s*status\s*\}\)/.test(IDX),
  'GET /api/task-templates passes { status } to listTaskTemplates (Tasks tab archived toggle)')
assert(/createTaskTemplate\(env,\s*request\)/.test(IDX),
  'POST /api/task-templates wires to createTaskTemplate')

assert(/\/\^\\\/api\\\/task-templates\\\/\(\[\^\/\]\+\)\$\//.test(IDX),
  'router matches /api/task-templates/:id via regex')
assert(/updateTaskTemplate\(env,\s*id,\s*request\)/.test(IDX),
  'PATCH /api/task-templates/:id wires to updateTaskTemplate')

// ── worker/lib/mutationPermissions.js — canEditAssignments gate ───────
section('mutationPermissions — canEditAssignments gates task-templates')

assert(/\[\s*'\/api\/task-templates',\s*'canEditAssignments'\s*\]/.test(PERM),
  "MUTATION_RULES entry: ['/api/task-templates', 'canEditAssignments']")

// ── Client store — taskTemplateStore.js ───────────────────────────────
section('Client store — useTaskTemplatesData hook + CRUD helpers')

for (const fn of [
  'useTaskTemplatesData', 'refreshTaskTemplatesData',
  'createTaskTemplate',  'patchTaskTemplate',
  'archiveTaskTemplate', 'unarchiveTaskTemplate',
]) {
  assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(STORE),
    `store exports ${fn}`)
}

assert(/withCourseScope\(API\)/.test(STORE),
  'store wraps reads via withCourseScope (Phase 5.7 course scoping)')
assert(/subscribeCourseChange/.test(STORE),
  'store re-fetches when the selected course changes')
assert(/mutationHeaders\(\)/.test(STORE),
  'writes attach mutationHeaders() (session-cookie auth)')

assert(/archiveTaskTemplate[\s\S]{0,200}patchTaskTemplate\(id,\s*\{\s*status:\s*['"]archived['"]\s*\}\)/.test(STORE),
  "archiveTaskTemplate is a PATCH { status: 'archived' }")

// includeArchived flag for the Tasks tab "show archived" toggle.
assert(/includeArchived/.test(STORE),
  'store tracks includeArchived flag for Tasks tab show-archived toggle')
assert(/status=all/.test(STORE),
  'refreshTaskTemplatesData appends ?status=all when includeArchived')

// ── TasksManagerModal — manages templates, not per-day events ─────────
section('TasksManagerModal — Task Library editor (templates)')

assert(/import\s*\{[\s\S]*?useTaskTemplatesData[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/tasks\/taskTemplateStore['"]/.test(MODAL),
  'TasksManagerModal imports useTaskTemplatesData from the task-template store')

// Old per-day API surface must be gone.
assert(!/createCalendarEvent|patchCalendarEvent/.test(MODAL),
  'TasksManagerModal no longer imports calendar event mutation helpers (per-day flow retired)')
assert(!/from\s*['"]\.\.\/\.\.\/\.\.\/utils\/calendar\/calendarStore['"]/.test(MODAL),
  'TasksManagerModal no longer imports from calendarStore')
assert(!/dayEvents\b/.test(MODAL),
  'TasksManagerModal no longer references dayEvents prop')

// CRUD wiring.
assert(/createTaskTemplate\(payload\)|createTaskTemplate\(/.test(MODAL),
  'TasksManagerModal calls createTaskTemplate on new save')
assert(/patchTaskTemplate\(draft\.id,\s*payload\)/.test(MODAL),
  'TasksManagerModal calls patchTaskTemplate on edit save')
assert(/archiveTaskTemplate\(t\.id\)/.test(MODAL),
  'TasksManagerModal calls archiveTaskTemplate for the Archive button')
assert(/unarchiveTaskTemplate\(t\.id\)/.test(MODAL),
  'TasksManagerModal calls unarchiveTaskTemplate for the Reactivate button')

// Auto-translate sweep still wired post-save (regression couple from 9C.8).
assert(/scheduleTranslationSweep\(\)/.test(MODAL),
  '9C.8 scheduleTranslationSweep still fires after template save')
assert(/canTranslate\s*=\s*can\(['"]canSystemSettings['"]\)/.test(MODAL),
  '9C.8 sweep gated on canSystemSettings (no 403 for non-admin)')

// Header copy changed from "Manage Tasks" / per-day to "Task Library".
assert(/Task Library/.test(MODAL),
  'TasksManagerModal header reads "Task Library" (not per-day "Manage Tasks")')

// ── DailyAssignmentBoard — dropdown reads from task templates ────────
section('DailyAssignmentBoard — dropdown wired to task_templates')

assert(/import\s*\{\s*useTaskTemplatesData\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/tasks\/taskTemplateStore['"]/.test(DAB),
  'DAB imports useTaskTemplatesData')

assert(/const\s*\{\s*templates:\s*taskTemplates\s*\}\s*=\s*useTaskTemplatesData\(\)/.test(DAB),
  'DAB destructures { templates: taskTemplates } from useTaskTemplatesData()')

// activeTaskTemplates derivation — active only, sorted by sortOrder then name.
assert(/const\s+activeTaskTemplates\s*=\s*useMemo/.test(DAB),
  'activeTaskTemplates useMemo defined')
assert(/\.filter\(t => t\.status === 'active'\)/.test(DAB),
  'activeTaskTemplates filters to status === "active" (excludes archived)')
assert(/const\s+sa\s*=\s*a\.sortOrder\s*\?\?\s*0[\s\S]{0,200}const\s+sb\s*=\s*b\.sortOrder\s*\?\?\s*0[\s\S]{0,200}sa\s*-\s*sb/.test(DAB),
  'activeTaskTemplates sorts by sortOrder asc')

// Hardcoded list retired.
assert(!/const\s+CROSSWINDS_TASK_LIST\s*=/.test(DAB),
  'legacy CROSSWINDS_TASK_LIST JS constant removed')
assert(!/CROSSWINDS_TASK_LIST/.test(DAB),
  'no remaining CROSSWINDS_TASK_LIST references in DAB')

// Dropdown JSX reads template options. Phase 9C.13 nested the flat
// activeTaskTemplates.map inside a groupedActiveTaskTemplates.map so
// each category renders as an <optgroup>; the inner per-template
// <option> shape is unchanged.
assert(/groupedActiveTaskTemplates\.map\(group =>/.test(DAB),
  'task dropdown maps over groupedActiveTaskTemplates (Phase 9C.13 optgroup buckets)')
assert(/group\.templates\.map\(tmpl =>/.test(DAB),
  'inside each optgroup, options come from group.templates.map(tmpl => ...)')
assert(/<option key=\{tmpl\.id\} value=\{tmpl\.id\}>\{tmpl\.name\}<\/option>/.test(DAB),
  '<option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option> shape preserved inside optgroups')
assert(/<option value="">— Unassigned —<\/option>/.test(DAB),
  'dropdown includes blank — Unassigned — option')

// onChange routes to handleQuickTaskChange (single unified flow).
assert(/onChange=\{e => handleQuickTaskChange\(emp, e\.target\.value\)\}/.test(DAB),
  'dropdown onChange unifies via handleQuickTaskChange')

// Value resolves back to a templateId by case-insensitive title match.
assert(/activeTaskTemplates\.find\(tmpl =>[\s\S]{0,200}\(tmpl\.name \?\? ['"]['"]\)\.trim\(\)\.toLowerCase\(\) === t,?\s*\)\?\.id/.test(DAB),
  'dropdown value resolves linked event → matching template id (case-insensitive)')

// Both branches collapsed: no more isCrosswinds ? curated : dayEvents.
assert(!/CROSSWINDS_TASK_LIST\.map/.test(DAB),
  'no remaining CROSSWINDS_TASK_LIST.map() in DAB JSX')
assert(!/dropdownOptionsFor\(/.test(DAB),
  'no remaining dropdownOptionsFor() calls (legacy per-day filter helper removed)')

// ── handleQuickTaskChange + pickOrCreateEventForTask plumbing ─────────
section('Assignment / calendar-event creation behavior')

assert(/async function handleQuickTaskChange\(emp, templateId\)/.test(DAB),
  'handleQuickTaskChange signature accepts (emp, templateId)')
assert(/activeTaskTemplates\.find\(t => t\.id === templateId\)/.test(DAB),
  'handleQuickTaskChange looks up the template by id')
// Phase 9C.12 — pickOrCreateEventForTask now takes the template object
// directly (so it can read defaultStartTime/defaultLocation/defaultNotes).
assert(/pickOrCreateEventForTask\(template, selectedDate\)/.test(DAB),
  'handleQuickTaskChange calls pickOrCreateEventForTask(template, selectedDate)')
// handleTaskChange is gone; handleQuickTaskChange does the
// createCrewAssignment write directly so it can carry notes across the
// delete+recreate boundary.
assert(/await createCrewAssignment\(\{[\s\S]{0,400}calendarEventId:\s*event\.id/.test(DAB),
  'handleQuickTaskChange calls createCrewAssignment with calendarEventId: event.id')

// Stable sourceId keyed by template id prevents duplicate calendar_events.
assert(/`task-template:\$\{template\.id\}:\$\{dateIso\}`/.test(DAB),
  'pickOrCreateEventForTask uses stable sourceId task-template:<template.id>:<date>')
assert(/const existing = events\.find\(e =>[\s\S]{0,400}\(e\.eventType === 'crew'\)/.test(DAB),
  'pickOrCreateEventForTask reuses an existing crew event for (date, title) before creating')

// Empty selection still routes to handleClear (existing flow).
assert(/if \(!templateId\) return handleClear\(emp\)/.test(DAB),
  'empty dropdown selection routes to handleClear (existing flow)')

// ── Existing assignment display still works ───────────────────────────
section('Existing assignment display preserved (regression couple)')

// Assignments are still keyed by calendarEventId → events lookup.
assert(/assignment\.calendarEventId/.test(DAB),
  'rows still resolve assignments via calendarEventId')
assert(/events\.find\(e => e\.id === assignment\.calendarEventId\)/.test(DAB),
  'rows still look up the event by assignment.calendarEventId for the title')
assert(/dayEvents = useMemo\(/.test(DAB),
  'dayEvents memo preserved (assignment rendering + Display Board joins still need it)')

// ── Kiosk untouched ───────────────────────────────────────────────────
section('Kiosk / Display Board untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.11'),
    `${path} carries no Phase 9C.11 edits`)
  assert(!src.includes('useTaskTemplatesData'),
    `${path} does not consume the task templates store`)
}

// ── Translation behavior preserved ────────────────────────────────────
section('Translation behavior — 9C.8 sweep + autoTranslate guards intact')

const CLIENT = readFileSync('src/utils/translate/translateClient.js', 'utf8')
assert(/export\s+function\s+scheduleTranslationSweep/.test(CLIENT),
  'scheduleTranslationSweep helper still exported (regression couple)')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'race-safe crew_assignments.notes_es UPDATE guard still intact')

// ── No new D1 columns or other migrations past 0051 ───────────────────
section('Migrations ledger — 0051 is the new ceiling')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql present in worker/migrations')
const past0051 = migrationFiles.filter(f => /^00(5[3-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migrations past 0052 (Phase S.3 spray_compliance_snapshots accepted) (found: ${past0051.join(', ') || 'none'})`)

// ── Cross-file negatives ──────────────────────────────────────────────
section('Cross-file negatives — surfaces not in scope')

for (const path of [
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'src/utils/calendar/calendarStore.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/api/assignments.js',
  'worker/api/calendar.js',
  'worker/lib/autoTranslate.js',
  'worker/lib/translate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.11'),
    `${path} carries no Phase 9C.11 edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
