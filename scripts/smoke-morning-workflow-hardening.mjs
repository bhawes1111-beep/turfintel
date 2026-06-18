// Phase 9C.16 — Morning workflow hardening smoke.
//
//   node scripts/smoke-morning-workflow-hardening.mjs
//
// Pins the three real-workflow bug fixes a QA pass surfaced after 9C.15:
//
//   1. Copy Yesterday now delegates to copyAssignmentsFromDate so an
//      EMPTY destination board (the common morning case) actually
//      receives assignments. The legacy implementation only carried
//      rows whose task already existed on the destination day, which
//      meant the most useful invocation silently produced
//      "Copied 0 · N skipped."
//
//   2. Copy Yesterday now carries English notes across — the legacy
//      createCrewAssignment call had no `notes:` field, so a key
//      supervisor instruction ("Watch for golfers on 9") dropped
//      every time. The shared helper preserves the manual-Spanish-
//      wins contract by never setting notesEs in the create payload.
//
//   3. Clear Day toast now reports the actual selected date instead
//      of the literal "today" — supervisors prepping tomorrow's board
//      were getting a confusingly worded confirmation.
//
// UI-only sub-phase: no D1 migration, no worker / API edits, no
// kiosk changes, no task_templates schema changes, no translation
// provider changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')

// ── Bug #3/#4 — Copy Yesterday delegates to copyAssignmentsFromDate ──
section('Copy Yesterday — delegates to copyAssignmentsFromDate')

assert(/async function handleCopyYesterday\(\) \{/.test(DAB),
  'handleCopyYesterday function still present (button preserved, behavior swapped)')

// Extract the function body so we can scope the regression assertions.
const yMatch = DAB.match(/async function handleCopyYesterday\(\) \{[\s\S]*?\n  \}/)
const ySrc   = yMatch ? yMatch[0] : ''
assert(ySrc.length > 0, 'handleCopyYesterday body extracted')

// Delegates to the shared helper — no more inline ydEvents / ydEventIds
// duplicate logic that diverged from copyAssignmentsFromDate.
assert(/await copyAssignmentsFromDate\(yesterdayIso, selectedDate,\s*\{/.test(ySrc),
  'handleCopyYesterday calls copyAssignmentsFromDate(yesterdayIso, selectedDate, options)')

// Default options match the historical intent: copy tasks + notes +
// equipment, skip pre-assigned employees, never silently overwrite.
for (const [key, val] of [
  ['copyTasks',         'true'],
  ['copyNotes',         'true'],
  ['copyEquipment',     'true'],
  ['skipExisting',      'true'],
  ['overwriteExisting', 'false'],
]) {
  assert(new RegExp(`${key}:\\s*${val}`).test(ySrc),
    `Copy Yesterday default option: ${key}: ${val}`)
}

// Legacy inline ydEvents / dayEvents.find shape is gone — would
// silently skip every operator on an empty destination board.
assert(!/ydEvents = events\.filter/.test(ySrc),
  'legacy ydEvents = events.filter(...) inline lookup removed')
assert(!/dayEvents\.find\(e =>\s*\(e\.title \?\? ''\)\.trim\(\)\.toLowerCase\(\) === oldTitle/.test(ySrc),
  'legacy dayEvents.find by title (which required pre-existing destination event) removed')
assert(!/`Copied \$\{copied\} assignment\$\{copied !== 1 \? 's' : ''\} from yesterday/.test(ySrc),
  'legacy "from yesterday" toast removed — shared helper reports actual src→dest dates')

// shiftDate(selectedDate, -1) still derives "yesterday" relative to
// the currently selected date, not real-today, so a supervisor
// prepping next Monday still gets next Sunday as the source.
assert(/const yesterdayIso = shiftDate\(selectedDate, -1\)/.test(ySrc),
  'yesterdayIso = shiftDate(selectedDate, -1) — relative to selectedDate, not real-today')

// ── Bug #4 deep-dive — notes carry across via the shared helper ──────
section('Notes carry — shared helper writes notes into createCrewAssignment')

// The shared helper's createCrewAssignment payload includes the notes
// field; pin it here so a future refactor can't quietly drop notes
// back to the legacy "always null" shape. The helper itself is also
// covered by smoke-copy-assignments-from-date.mjs but pinning the
// regression couple twice keeps the bug from sneaking back in.
const helperMatch = DAB.match(/async function copyAssignmentsFromDate\(sourceDate, destinationDate, options\)\s*\{[\s\S]*?\n  \}/)
const helperSrc   = helperMatch ? helperMatch[0] : ''
assert(helperSrc.length > 0, 'copyAssignmentsFromDate body extracted')

assert(/notes:\s*options\.copyNotes \? \(oldA\.notes \?\? null\) : null/.test(helperSrc),
  'helper still gates notes copy on options.copyNotes (Copy Yesterday passes true → notes carry)')
assert(!/\bnotesEs\b/.test(helperSrc),
  'helper still does NOT set notesEs (Copy Yesterday inherits the manual-Spanish-wins contract)')

// ── Bug #3 deep-dive — destination event find-or-create ──────────────
section('Destination event creation — find-or-create instead of skip-when-missing')

assert(/async function pickOrCreateDestinationEvent\(sourceEvent, destDate\)/.test(DAB),
  'pickOrCreateDestinationEvent helper still present')
assert(/await pickOrCreateDestinationEvent\(oldEvent, destinationDate\)/.test(helperSrc),
  'copyAssignmentsFromDate uses pickOrCreateDestinationEvent for every source row (empty-board case handled)')

// The find-or-create flow: scan for an existing destination event,
// otherwise mint one via createCalendarEvent.
assert(/const reused = events\.find\(e =>[\s\S]{0,400}\(e\.eventType === \(sourceEvent\.eventType \|\| ['"]crew['"]\)\)/.test(DAB),
  'pickOrCreateDestinationEvent reuses an existing destination event when title+eventType match')
assert(/return await createCalendarEvent\(\{[\s\S]{0,400}sourceId:\s*deriveDestinationSourceId\(sourceEvent, destDate\)/.test(DAB),
  'pickOrCreateDestinationEvent mints a fresh event when none exists (with derived sourceId)')

// ── Bug #6 — Clear Day toast quotes selectedDate ─────────────────────
section('Clear Day toast — uses prettyDate(selectedDate), not literal "today"')

const clearMatch = DAB.match(/async function handleClearDay\(\)\s*\{[\s\S]*?\n  \}/)
const clearSrc   = clearMatch ? clearMatch[0] : ''
assert(clearSrc.length > 0, 'handleClearDay body extracted')

assert(/`Cleared \$\{cleared\} assignment\$\{cleared !== 1 \? 's' : ''\} for \$\{prettyDate\(selectedDate\)\}`/.test(clearSrc),
  'Clear Day toast reports the actual selectedDate (not "for today")')
assert(!/for today`/.test(clearSrc),
  'legacy "for today" literal removed from Clear Day toast')

// Confirm dialog already correctly uses prettyDate(selectedDate) — pin
// as a regression couple so a future refactor doesn't diverge.
assert(/confirm\(`Clear all assignments for \$\{prettyDate\(selectedDate\)\}\?`\)/.test(clearSrc),
  'Clear Day confirm dialog still uses prettyDate(selectedDate) (regression couple — confirm + toast now speak the same language)')

// ── Existing regression couples — 9C.12 / 9C.13 / 9C.14 / 9C.15 ──────
section('Regression couples — prior phase surfaces preserved')

assert(/async function handleQuickTaskChange\(emp, templateId\)/.test(DAB),
  '9C.12 handleQuickTaskChange signature preserved')
assert(/const groupedActiveTaskTemplates\s*=\s*useMemo/.test(DAB),
  '9C.13 grouped dropdown memo preserved')
assert(/<optgroup key=\{group\.key\} label=\{group\.label\}>/.test(DAB),
  '9C.13 <optgroup> dropdown rendering preserved')

const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx', 'utf8')
assert(/placeholder="Search tasks\.\.\."/.test(MODAL),
  '9C.14 Task Library search box preserved')

assert(/function CopyAssignmentsModal\(\{/.test(DAB),
  '9C.15 CopyAssignmentsModal component preserved')

// Carrying notes across a switch (template-default behavior from 9C.12)
// is preserved alongside the new Copy Yesterday → helper delegation.
assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 carriedNotes preservation rule preserved')

// 9C.15 confirm dialog before overwrite still required.
assert(/if \(options\.overwriteExisting && destAssignByEmp\.size > 0\) \{[\s\S]{0,400}if \(!confirm\(/.test(helperSrc),
  '9C.15 overwrite confirm dialog still required for Copy From… flow')

// ── No D1 / worker / kiosk / store edits ──────────────────────────────
section('No D1 / worker / kiosk / store / translation edits')

for (const path of [
  'worker/api/taskTemplates.js',
  'worker/api/assignments.js',
  'worker/api/calendar.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/index.js',
  'worker/lib/mutationPermissions.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/utils/translate/translateClient.js',
  'src/utils/tasks/taskTemplateStore.js',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.16'),
    `${path} carries no Phase 9C.16 edits`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0054 (found: ${past0051.join(', ') || 'none'})`)

// ── Translation contract regression couples ───────────────────────────
section('Translation contract — race-safe NULL guards intact')

const ASSIGN_API = readFileSync('worker/api/assignments.js', 'utf8')
assert(/Object\.prototype\.hasOwnProperty\.call\(body, 'notes'\)[\s\S]{0,200}!Object\.prototype\.hasOwnProperty\.call\(body, 'notesEs'\)[\s\S]{0,200}notes_es = NULL/.test(ASSIGN_API),
  'crew_assignments PATCH: English-edit-without-Spanish still NULLs notes_es (9C.5c3)')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'autoTranslate UPDATE guard for crew_assignments.notes_es still intact')

const CLIENT = readFileSync('src/utils/translate/translateClient.js', 'utf8')
assert(/export\s+function\s+scheduleTranslationSweep/.test(CLIENT),
  'scheduleTranslationSweep helper still exported')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
