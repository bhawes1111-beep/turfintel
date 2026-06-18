// Phase 9C.17 — Morning workflow UX polish smoke.
//
//   node scripts/smoke-morning-workflow-ux-polish.mjs
//
// Light UX pass on the post-9C.10–9C.16 Daily Assignment Board:
//
//   • Every header action button gets a clear, plain-language title
//     attribute. The Translate Now / Copy Yesterday / Clear Day
//     tooltips no longer say "today" when the supervisor is on a
//     different selectedDate.
//   • Copy From… button label renamed to "Copy From Date…" for
//     discoverability — the trailing ellipsis already signaled a
//     dialog, but the explicit "Date" word matches the modal verb.
//   • Translate Now also gates on bulkBusy so a copy or clear can't
//     race with a translation sweep mid-flight.
//   • Copy modal: Skip-existing gains a <small> helper line for parity
//     with the other options; Overwrite gains an extra ⚠ glyph plus a
//     danger-tinted background container when selected so the
//     destructive choice is unmistakable.
//   • Fresh-day onboarding hint above the assignment table when the
//     supervisor lands on a day with employees + templates + zero
//     assignments — points at Copy Yesterday / Copy From Date… / per-
//     row dropdowns so a clean board reads as "what next" instead of
//     "nothing here".
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

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',       'utf8')
const CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

// ── Header buttons — labels + tooltips ────────────────────────────────
section('Header buttons — plain-language labels + tooltips')

// Today button gains a title attribute (was missing entirely).
assert(/className=\{styles\.todayBtn\}[\s\S]{0,300}title="Jump back to today's board"/.test(DAB),
  'Today button has a clear title attribute')

// Tasks button title updated for clarity (mentions Task Library by name).
assert(/title="Open the Task Library — add, rename, or archive[\s\S]{0,200}operator's dropdown"/.test(DAB),
  'Tasks button title explains the Task Library role')

// Translate Now title no longer says literal "today" — uses "this day's"
// so the wording stays accurate when the supervisor navigated forward.
assert(/title="Translate this day's English notes to Spanish/.test(DAB),
  'Translate Now title uses "this day\'s" (not literal "today")')
assert(/Safe to run as often as you like/.test(DAB),
  'Translate Now title reassures the supervisor it\'s idempotent')

// Translate Now now also gates on bulkBusy so a copy/clear can't race
// against an in-flight translate sweep.
assert(/disabled=\{translating \|\| bulkBusy !== null\}/.test(DAB),
  'Translate Now button disabled when translating || bulkBusy !== null')

// Copy Yesterday title updated to "selected day" (Phase 9C.16 wording
// fix carries forward into the tooltip).
assert(/One-click copy of yesterday's[\s\S]{0,200}into the selected day/.test(DAB),
  'Copy Yesterday title says "into the selected day" (not "into today")')
assert(/Existing assignments on the selected day are kept\./.test(DAB),
  'Copy Yesterday title clarifies that existing destination rows are preserved')

// Copy From… button is now labeled "Copy From Date…" per spec — the
// trailing word "Date" makes the action self-describing.
assert(/data-variant="copy-from"[\s\S]{0,400}>\s*\n?\s*Copy From Date…\s*\n?\s*<\/button>/.test(DAB),
  '"Copy From Date…" label rendered (was "Copy From…")')
// Old label removed.
assert(!/>\s*Copy From…\s*<\/button>/.test(DAB),
  'legacy "Copy From…" label removed')
assert(/title="Pick any past date and copy its assignments/.test(DAB),
  'Copy From Date… title explains date-picking + per-option behavior')

// Clear Day title is more descriptive about what stays and what goes.
assert(/title="Remove every operator assignment for the selected day\. Tasks and equipment stay/.test(DAB),
  'Clear Day title clarifies tasks/equipment remain, only operator pairings clear')

// Bulk-busy gating preserved on all three bulk-action buttons.
const copyDis        = /onClick=\{handleCopyYesterday\}[\s\S]{0,200}disabled=\{bulkBusy !== null\}/.test(DAB)
const copyFromDis    = /onClick=\{openCopyModal\}[\s\S]{0,200}disabled=\{bulkBusy !== null\}/.test(DAB)
const clearDayDis    = /onClick=\{handleClearDay\}[\s\S]{0,200}disabled=\{bulkBusy !== null\}/.test(DAB)
assert(copyDis,     'Copy Yesterday disabled when bulkBusy !== null')
assert(copyFromDis, 'Copy From Date… disabled when bulkBusy !== null')
assert(clearDayDis, 'Clear Day disabled when bulkBusy !== null')

// ── Copy modal — Skip-existing helper text + overwrite warning ───────
section('Copy modal — Skip-existing helper + stronger Overwrite warning')

// Skip-existing label gains a <small> line for parity with the other
// options + plain-language explanation.
assert(/Skip employees who already have an assignment \(recommended\)<\/span>\s*\n\s*<small>Any operator who already has a task on the selected day is left alone\. Only unassigned operators receive a copied row\./.test(DAB),
  'Skip-existing radio has plain-language <small> helper text')

// Overwrite warning text gains an extra ⚠ glyph in the title.
assert(/<span data-tone="warn">⚠ Overwrite existing destination assignments<\/span>/.test(DAB),
  'Overwrite radio label leads with a ⚠ warning glyph')

// Overwrite label gets a copyOptionDanger class when selected, so the
// destructive choice is visually unmistakable even before the user
// reads the helper copy.
assert(/className=\{options\.overwriteExisting \? styles\.copyOptionDanger : undefined\}/.test(DAB),
  'Overwrite radio label conditionally adds styles.copyOptionDanger when active')
assert(/data-overwrite-active=\{options\.overwriteExisting \? ['"]true['"] : undefined\}/.test(DAB),
  'Overwrite radio label exposes data-overwrite-active="true" for hooks/testing')

// Overwrite helper now mentions equipment release order + the confirm
// dialog explicitly so there are no surprises.
assert(/Every existing operator on the selected day will be replaced with the source row\.\s*\n?\s*Equipment is unlinked and released back to the task first\. A final confirm dialog appears before anything is replaced\./.test(DAB),
  'Overwrite helper explains replacement scope + equipment unlink order + final confirm')

// ── Fresh-day onboarding hint above the table ─────────────────────────
section('Fresh-day onboarding hint — surfaces recovery paths on an empty board')

// Hint only renders when there ARE templates + employees but zero
// assignments yet, so it doesn't compete with the more critical
// "No active task templates" or "No active employees" empty states.
assert(/activeTaskTemplates\.length > 0[\s\S]{0,200}dayEmployees\.length > 0[\s\S]{0,200}summary\.assigned === 0[\s\S]{0,200}bulkBusy === null/.test(DAB),
  'hint gated on (templates>0 && employees>0 && summary.assigned===0 && bulkBusy===null)')

// Hint copy mentions all three recovery paths by name so the supervisor
// can pick the one they need.
assert(/No assignments for \{prettyDate\(selectedDate\)\} yet\./.test(DAB),
  'hint quotes the selectedDate prettyDate (matches Clear Day / Copy From Date wording)')
assert(/<strong>Copy Yesterday<\/strong>/.test(DAB),
  'hint mentions Copy Yesterday by name (matches header button label)')
assert(/<strong>Copy From Date…<\/strong>/.test(DAB),
  'hint mentions Copy From Date… by name (matches header button label)')
assert(/pick a task\s*\n?\s*for each operator from the dropdowns below/.test(DAB),
  'hint mentions the per-row dropdowns as the third recovery path')

// Hint uses the styles.emptyHint class (new in 9C.17).
assert(/className=\{styles\.emptyHint\}/.test(DAB),
  'hint renders inside <p className={styles.emptyHint}>')

// ── CSS — new classes + existing CSS preserved ────────────────────────
section('CSS — emptyHint + copyOptionDanger defined')

assert(/\.emptyHint\s*\{/.test(CSS),
  '.emptyHint CSS rule defined')
assert(/\.emptyHint\s*\{[\s\S]{0,400}background:\s*rgba\(34,\s*197,\s*94/.test(CSS),
  '.emptyHint uses a soft green tint (not the muted .empty dashed style)')
assert(/\.emptyHint strong\s*\{[\s\S]{0,200}color:\s*#4ade80/.test(CSS),
  '.emptyHint strong text picks up the kiosk-green accent color')

assert(/\.copyOptions label\.copyOptionDanger\s*\{/.test(CSS),
  '.copyOptions label.copyOptionDanger CSS rule defined')
assert(/\.copyOptions label\.copyOptionDanger\s*\{[\s\S]{0,400}background:\s*rgba\(239,\s*68,\s*68/.test(CSS),
  '.copyOptionDanger uses a red danger-tint background when overwrite is selected')

// Existing .empty class still present — regression couple so a careless
// edit doesn't accidentally rename or drop the muted empty-state
// styling used elsewhere.
assert(/\.empty\s*\{[\s\S]{0,200}border:\s*1px dashed/.test(CSS),
  '.empty class (dashed muted variant) preserved')

// ── Regression couples — 9C.12 / 9C.13 / 9C.14 / 9C.15 / 9C.16 ───────
section('Regression couples — prior phase surfaces preserved')

assert(/async function handleQuickTaskChange\(emp, templateId\)/.test(DAB),
  '9C.12 handleQuickTaskChange signature preserved')
assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 carriedNotes preservation rule preserved')

assert(/const groupedActiveTaskTemplates\s*=\s*useMemo/.test(DAB),
  '9C.13 grouped dropdown memo preserved')
assert(/<optgroup key=\{group\.key\} label=\{group\.label\}>/.test(DAB),
  '9C.13 <optgroup> dropdown rendering preserved')

const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx', 'utf8')
assert(/placeholder="Search tasks\.\.\."/.test(MODAL),
  '9C.14 Task Library search box preserved')

assert(/function CopyAssignmentsModal\(\{/.test(DAB),
  '9C.15 CopyAssignmentsModal component preserved')
assert(/async function copyAssignmentsFromDate\(sourceDate, destinationDate, options\)/.test(DAB),
  '9C.15 copyAssignmentsFromDate helper signature preserved')

// Copy Yesterday delegation from 9C.16 preserved — must still call
// the shared helper with the same default options.
assert(/await copyAssignmentsFromDate\(yesterdayIso, selectedDate,\s*\{/.test(DAB),
  '9C.16 Copy Yesterday → copyAssignmentsFromDate delegation preserved')
assert(/copyTasks:\s*true,\s*\n\s*copyNotes:\s*true,\s*\n\s*copyEquipment:\s*true,\s*\n\s*skipExisting:\s*true,\s*\n\s*overwriteExisting:\s*false,/.test(DAB),
  '9C.16 Copy Yesterday defaults (tasks+notes+equipment+skip+no-overwrite) preserved')

// Clear Day toast wording fix (9C.16) preserved.
assert(/`Cleared \$\{cleared\} assignment\$\{cleared !== 1 \? 's' : ''\} for \$\{prettyDate\(selectedDate\)\}`/.test(DAB),
  '9C.16 Clear Day toast uses prettyDate(selectedDate) (not literal "today")')

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
  assert(!src.includes('Phase 9C.17'),
    `${path} carries no Phase 9C.17 edits`)
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
