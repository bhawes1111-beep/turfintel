// Phase 9C.15 — Copy assignments from a chosen source date smoke.
//
//   node scripts/smoke-copy-assignments-from-date.mjs
//
// Adds a "Copy From…" workflow alongside the existing Copy Yesterday
// shortcut on the Daily Assignment Board. The new path lets a
// supervisor copy operator → task pairings from any source date into
// the currently selected board day, with per-option control over
// notes / equipment / skip-vs-overwrite, and reuses every safety path
// the in-house workflow already has (unlink reservations before
// delete, find-or-create destination event with derived sourceId,
// employee-id-first matching).
//
// UI-only sub-phase: no D1 migration, no worker / API edits, no
// kiosk changes, no task_templates schema changes, no translation
// provider changes. Copy Yesterday is preserved verbatim as a one-
// click shortcut.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',       'utf8')
const CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

// ── Header — Copy From… button + Copy Yesterday shortcut preserved ────
section('Header buttons — Copy From… added, Copy Yesterday preserved')

assert(/data-variant="copy-from"/.test(DAB),
  'Copy From… button rendered with data-variant="copy-from"')
assert(/onClick=\{openCopyModal\}/.test(DAB),
  'Copy From… button calls openCopyModal')
assert(/Copy From…/.test(DAB),
  '"Copy From…" label rendered (lets supervisors discover the source-date picker)')

// Copy Yesterday shortcut still present + still calls handleCopyYesterday.
assert(/data-variant="copy"/.test(DAB),
  'Copy Yesterday shortcut button preserved (data-variant="copy")')
assert(/onClick=\{handleCopyYesterday\}/.test(DAB),
  'Copy Yesterday still calls handleCopyYesterday (one-click flow unchanged)')
assert(/async function handleCopyYesterday\(\)/.test(DAB),
  'handleCopyYesterday function preserved')

// ── State — modal open, source date, copy options ────────────────────
section('Modal state — copyModalOpen + copySourceDate + copyOptions')

assert(/const \[copyModalOpen, setCopyModalOpen\]\s*=\s*useState\(false\)/.test(DAB),
  'copyModalOpen state defaults to false')

assert(/const \[copySourceDate, setCopySourceDate\]\s*=\s*useState\(\(\) => shiftDate\(TODAY_ISO\(\), -1\)\)/.test(DAB),
  'copySourceDate state defaults to shiftDate(TODAY_ISO(), -1) — the previous day')

// copyOptions has all five required toggles + spec-recommended defaults.
assert(/const \[copyOptions, setCopyOptions\]\s*=\s*useState\(\{[\s\S]{0,400}copyTasks:\s*true/.test(DAB),
  'copyOptions.copyTasks defaults to true')
assert(/copyNotes:\s*true/.test(DAB),
  'copyOptions.copyNotes defaults to true')
assert(/copyEquipment:\s*false/.test(DAB),
  'copyOptions.copyEquipment defaults to false (v1 unchecked per spec)')
assert(/skipExisting:\s*true/.test(DAB),
  'copyOptions.skipExisting defaults to true (safe default)')
assert(/overwriteExisting:\s*false/.test(DAB),
  'copyOptions.overwriteExisting defaults to false (never silently rewrite)')

// openCopyModal recomputes the default source date on each open so a
// stale value never carries across sessions.
assert(/function openCopyModal\(\) \{[\s\S]{0,400}setCopySourceDate\(shiftDate\(selectedDate, -1\)\)/.test(DAB),
  'openCopyModal recomputes copySourceDate = shiftDate(selectedDate, -1) on each open')
assert(/setCopyOptions\(prev => \(\{ \.\.\.prev, overwriteExisting: false \}\)\)/.test(DAB),
  'openCopyModal forces overwriteExisting to false on open (defense against a stale toggle)')

// ── copyAssignmentsFromDate — core batch helper ───────────────────────
section('copyAssignmentsFromDate(sourceDate, destinationDate, options)')

assert(/async function copyAssignmentsFromDate\(sourceDate, destinationDate, options\)/.test(DAB),
  'copyAssignmentsFromDate signature accepts (sourceDate, destinationDate, options)')

// Pull out the helper body for the rest of the assertions.
const helperMatch = DAB.match(/async function copyAssignmentsFromDate\(sourceDate, destinationDate, options\)\s*\{[\s\S]*?\n  \}/)
const helperSrc   = helperMatch ? helperMatch[0] : ''
assert(helperSrc.length > 0, 'copyAssignmentsFromDate body extracted')

// Defensive entry guards — both dates required, same-day no-op.
assert(/if \(!sourceDate \|\| !destinationDate\) \{[\s\S]{0,200}toast\.error/.test(helperSrc),
  'helper guards against missing source/destination dates')
assert(/if \(sourceDate === destinationDate\) \{[\s\S]{0,200}toast\.info/.test(helperSrc),
  'helper short-circuits when source === destination')

// Source lookup — filter events + assignments by source date.
assert(/const srcEvents = events\.filter\(e => \(e\.startDate \?\? e\.date\) === sourceDate\)/.test(helperSrc),
  'helper filters events by sourceDate')
assert(/const srcAssignments = crewAssignments\.filter\(a =>\s*\n\s*a\.status !== ['"]cancelled['"][\s\S]{0,200}srcEventIds\.has\(a\.calendarEventId\)/.test(helperSrc),
  'helper filters assignments to source events and excludes cancelled')

// Destination conflict map — keyed by employeeId (fallback to name).
assert(/const destAssignByEmp = new Map\(\)/.test(helperSrc),
  'helper builds destAssignByEmp Map for conflict detection')
assert(/const key = a\.employeeId \|\| a\.employeeName/.test(helperSrc),
  'destAssignByEmp keyed by employeeId with employeeName fallback')

// Source-empty short circuit + clean toast.
assert(/if \(srcAssignments\.length === 0\) \{[\s\S]{0,200}toast\.info\([`'"]No assignments on \$\{sourceDate\}/.test(helperSrc),
  'helper info-toasts when source has no assignments to copy')

// ── Conflict handling — skip vs overwrite ─────────────────────────────
section('Conflict handling — skip default + confirm before overwrite')

// Default path: existing destination row + no overwrite = skip.
assert(/if \(destExisting && !options\.overwriteExisting\) \{\s*\n\s*skipped\+\+\s*\n\s*continue\s*\n\s*\}/.test(helperSrc),
  'default behavior skips when destination already has an assignment for this employee')

// Overwrite path is explicitly gated on a confirm dialog so a
// supervisor never silently rewrites a day.
assert(/if \(options\.overwriteExisting && destAssignByEmp\.size > 0\) \{[\s\S]{0,400}if \(!confirm\(/.test(helperSrc),
  'overwriteExisting path requires confirm() before running when destination has rows')
assert(/This will replace \$\{destAssignByEmp\.size\} existing assignment/.test(helperSrc),
  'confirm dialog quotes the actual count of destination rows that will be replaced')

// Overwrite uses the safe unlink-then-delete pair (regression couple
// from 9C.2 / 9C.12).
assert(/if \(destExisting && options\.overwriteExisting\) \{[\s\S]{0,300}await unlinkReservationsFor\(destExisting\.id\)[\s\S]{0,200}await deleteCrewAssignment\(destExisting\.id\)/.test(helperSrc),
  'overwrite path: unlinkReservationsFor → deleteCrewAssignment (equipment released back to task)')

// ── Employee match — id first, name fallback ──────────────────────────
section('Employee match — id-first with name fallback')

assert(/const empStillThere = oldA\.employeeId\s*\n\s*\? employees\.find\(e => e\.id === oldA\.employeeId && e\.status !== ['"]inactive['"]\)/.test(helperSrc),
  'employee match: id-first lookup against active employees')
assert(/: employees\.find\(e => e\.name === oldA\.employeeName && e\.status !== ['"]inactive['"]\)/.test(helperSrc),
  'employee match: falls back to name for legacy rows without an id')
assert(/if \(!empStillThere\) \{ skipped\+\+; continue \}/.test(helperSrc),
  'helper skips when no active employee matches')

// ── Destination event reuse + sourceId derivation ────────────────────
section('Destination calendar_event reuse + sourceId derivation')

assert(/async function pickOrCreateDestinationEvent\(sourceEvent, destDate\)/.test(DAB),
  'pickOrCreateDestinationEvent(sourceEvent, destDate) defined')

// Find-or-create shape mirrors pickOrCreateEventForTask so a copied
// row and a dropdown-assigned row collapse onto the same event.
assert(/const reused = events\.find\(e =>[\s\S]{0,400}\(e\.eventType === \(sourceEvent\.eventType \|\| ['"]crew['"]\)\)/.test(DAB),
  'pickOrCreateDestinationEvent reuses an existing event for (destDate, title, eventType) before creating')

// Template-aware sourceId rewrite: task-template:<id>:<srcDate> →
// task-template:<id>:<destDate>.
assert(/function deriveDestinationSourceId\(sourceEvent, destDate\)/.test(DAB),
  'deriveDestinationSourceId(sourceEvent, destDate) defined')
assert(/const tmplMatch = raw\.match\(\/\^task-template:\(\[\^:\]\+\):\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\)/.test(DAB),
  'deriveDestinationSourceId regex matches task-template:<id>:<YYYY-MM-DD>')
assert(/if \(tmplMatch\) return `task-template:\$\{tmplMatch\[1\]\}:\$\{destDate\}`/.test(DAB),
  'deriveDestinationSourceId rewrites to task-template:<id>:<destDate>')

// Fallback for ad-hoc events without a template-derived sourceId.
assert(/return `copied-task:\$\{sourceEvent\.id\}:\$\{destDate\}`/.test(DAB),
  'deriveDestinationSourceId falls back to copied-task:<srcEventId>:<destDate> for non-template events')

// New events carry across title/startTime/location/description so
// the destination calendar entry looks correct even before any
// downstream dropdown opens it.
assert(/await createCalendarEvent\(\{[\s\S]{0,600}title:\s*sourceEvent\.title[\s\S]{0,400}startDate:\s*destDate[\s\S]{0,400}sourceId:\s*deriveDestinationSourceId\(sourceEvent, destDate\)/.test(DAB),
  'pickOrCreateDestinationEvent createCalendarEvent payload pulls title/startDate/sourceId from helpers')
assert(/startTime:\s*sourceEvent\.startTime \|\| null/.test(DAB),
  'createCalendarEvent payload carries source startTime || null')
assert(/location:\s*sourceEvent\.location\s*\|\| null/.test(DAB),
  'createCalendarEvent payload carries source location || null')
assert(/description:\s*sourceEvent\.description \|\| null/.test(DAB),
  'createCalendarEvent payload carries source description || null')

// ── Assignment create — status reset + notes opt + no Spanish ────────
section('createCrewAssignment — status reset + notes optional + no notesEs')

assert(/await createCrewAssignment\(\{[\s\S]{0,400}calendarEventId:\s*destEvent\.id/.test(helperSrc),
  'createCrewAssignment uses the resolved destination event id')
assert(/employeeId:\s*oldA\.employeeId \?\? empStillThere\.id/.test(helperSrc),
  'createCrewAssignment uses oldA.employeeId with the matched-employee fallback')

// Copied rows always start as 'assigned' — no completed/in-progress
// state carries across days.
assert(/status:\s*['"]assigned['"]/.test(helperSrc),
  "copied assignment status is hardcoded to 'assigned' (does not carry source row's status)")

// Notes are opt-in.
assert(/notes:\s*options\.copyNotes \? \(oldA\.notes \?\? null\) : null/.test(helperSrc),
  'notes copy is gated by options.copyNotes — falls to null when off')

// notesEs is NEVER copied. Smoke positively guards by scanning the
// whole helper body for any notesEs reference.
assert(!/\bnotesEs\b/.test(helperSrc),
  'helper does NOT set notesEs anywhere (worker NULLs notes_es and cron sweep refills it)')

// ── Equipment copy — opt-in only ──────────────────────────────────────
section('Equipment copy — opt-in via copyEquipment')

assert(/if \(options\.copyEquipment\)/.test(helperSrc),
  'equipment block guarded by options.copyEquipment')
assert(/createEquipmentReservation\(\{/.test(helperSrc),
  'equipment copy uses createEquipmentReservation')
assert(/patchEquipmentReservation\(newR\.id,\s*\{\s*crewAssignmentId:\s*newA\.id\s*\}\)/.test(helperSrc),
  'equipment dedupe-PATCH path preserved (worker dedupes by event+equipment_name; we PATCH the operator link)')

// ── Translation sweep — once after batch, gated ──────────────────────
section('Translation sweep — once after batch, gated on (copied + copyNotes + canTranslate)')

assert(/if \(copied > 0 && options\.copyNotes && canTranslate\) \{\s*\n\s*scheduleTranslationSweep\(\)/.test(helperSrc),
  'scheduleTranslationSweep() called exactly once after the batch when copied>0 && copyNotes && canTranslate')

// Helper never calls the translation provider directly — everything
// goes through the worker via the sweep helper.
assert(!/translateText|env\.AI|TRANSLATE_/.test(helperSrc),
  'helper never calls the translation provider directly')

// ── Result reporting ──────────────────────────────────────────────────
section('Result reporting — toast summarizes copied / overwritten / skipped / failed')

assert(/let copied = 0, skipped = 0, overwritten = 0, failed = 0/.test(helperSrc),
  'helper tracks copied / skipped / overwritten / failed counters')
assert(/toast\.success\(parts\.join\(' · '\)\)/.test(helperSrc),
  'helper assembles the toast as parts.join(" · ")')
assert(/`Copied \$\{copied\} assignment\$\{copied !== 1 \? 's' : ''\} from \$\{sourceDate\} to \$\{destinationDate\}`/.test(helperSrc),
  'toast leads with "Copied N assignment(s) from <src> to <dest>"')

// ── CopyAssignmentsModal component ────────────────────────────────────
section('CopyAssignmentsModal — JSX + accessibility + safety')

assert(/function CopyAssignmentsModal\(\{[\s\S]{0,400}sourceDate,[\s\S]{0,400}destinationDate,[\s\S]{0,400}options,/.test(DAB),
  'CopyAssignmentsModal({ sourceDate, destinationDate, options, ... }) defined')

assert(/role="dialog" aria-label="Copy assignments"/.test(DAB),
  'modal overlay carries role="dialog" with an accessible label')

// Source date input — bound to sourceDate state, capped at destDate so
// the supervisor can't accidentally pick a future day.
assert(/<input\s+type="date"[\s\S]{0,400}value=\{sourceDate\}[\s\S]{0,400}max=\{destinationDate\}/.test(DAB),
  'source date input is bound to sourceDate and clamped via max={destinationDate}')

// Destination date input is read-only — supervisor must navigate the
// DAB header to change the destination.
assert(/<input\s+type="date"[\s\S]{0,400}value=\{destinationDate\}[\s\S]{0,400}readOnly/.test(DAB),
  'destination date input renders read-only (driven by selectedDate, not editable in the modal)')

// All five options visible as form controls.
for (const opt of ['copyTasks', 'copyNotes', 'copyEquipment', 'skipExisting', 'overwriteExisting']) {
  assert(new RegExp(`options\\.${opt}`).test(DAB),
    `modal renders a control bound to options.${opt}`)
}

// Skip vs overwrite are wired as a mutually exclusive radio pair at
// the UX level, so the supervisor's intent is unambiguous.
assert(/function setSkipExisting\(next\) \{[\s\S]{0,400}overwriteExisting:\s*next \? false : prev\.overwriteExisting/.test(DAB),
  'setSkipExisting toggles overwriteExisting off when skip is selected')
assert(/function setOverwriteExisting\(next\) \{[\s\S]{0,400}skipExisting:\s*next \? false : prev\.skipExisting/.test(DAB),
  'setOverwriteExisting toggles skipExisting off when overwrite is selected')

// Copy button is disabled on same-day or zero-source.
assert(/disabled=\{busy \|\| sameDay \|\| sourceCount === 0\}/.test(DAB),
  'Copy button disabled when busy / sameDay / sourceCount === 0')

// Cancel + Copy both render inside the modal footer.
assert(/Cancel/.test(DAB) && /onClick=\{onCopy\}/.test(DAB),
  'Cancel + Copy buttons rendered')

// ── CSS — new modal classes defined ───────────────────────────────────
section('CSS — Copy modal classes defined')

for (const cls of [
  'copyModalBody',
  'copyDateRow',
  'copyArrow',
  'copyCountsLine',
  'copyOptions',
]) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS rule .${cls} defined`)
}

// Date row uses a 1fr-auto-1fr grid so source/arrow/destination read
// as a clear left-to-right flow.
assert(/\.copyDateRow\s*\{[\s\S]{0,400}grid-template-columns:\s*1fr\s+auto\s+1fr/.test(CSS),
  '.copyDateRow uses 1fr auto 1fr grid (source → arrow → destination)')

// Mobile fallback stacks the row vertically.
assert(/@media\s*\(max-width:\s*600px\)\s*\{[\s\S]{0,400}\.copyDateRow\s*\{[\s\S]{0,200}grid-template-columns:\s*1fr/.test(CSS),
  '@media (max-width: 600px) stacks copyDateRow into a single column')

// modalFooter gains gap: 8px so Cancel + Copy don't touch on
// short-width modals (regression couple — preserves the new gap).
assert(/\.modalFooter\s*\{[\s\S]{0,200}gap:\s*8px/.test(CSS),
  '.modalFooter now sets gap: 8px so footer buttons don\'t touch')

// ── Cross-file guards ─────────────────────────────────────────────────
section('Cross-file guards — no worker / kiosk / store edits')

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
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/utils/tasks/taskTemplateStore.js',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/translate/translateClient.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.15'),
    `${path} carries no Phase 9C.15 edits`)
}

// ── No D1 migration ───────────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[3-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0052 (found: ${past0051.join(', ') || 'none'})`)

// ── Translation contract regression couples ───────────────────────────
section('Translation contract — race-safe NULL guards intact')

const ASSIGN_API = readFileSync('worker/api/assignments.js', 'utf8')
assert(/Object\.prototype\.hasOwnProperty\.call\(body, 'notes'\)[\s\S]{0,200}!Object\.prototype\.hasOwnProperty\.call\(body, 'notesEs'\)[\s\S]{0,200}notes_es = NULL/.test(ASSIGN_API),
  'crew_assignments PATCH: English-edit-without-Spanish still NULLs notes_es (9C.5c3 invariant)')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'autoTranslate UPDATE guard for crew_assignments.notes_es still intact')

const CLIENT = readFileSync('src/utils/translate/translateClient.js', 'utf8')
assert(/export\s+function\s+scheduleTranslationSweep/.test(CLIENT),
  'scheduleTranslationSweep helper still exported')

// ── Existing assignment surfaces preserved ────────────────────────────
section('Regression couples — 9C.12/9C.13/9C.14 surfaces preserved')

assert(/async function handleQuickTaskChange\(emp, templateId\)/.test(DAB),
  '9C.12 handleQuickTaskChange signature preserved')
assert(/const groupedActiveTaskTemplates\s*=\s*useMemo/.test(DAB),
  '9C.13 grouped dropdown memo preserved')
assert(/<optgroup key=\{group\.key\} label=\{group\.label\}>/.test(DAB),
  '9C.13 <optgroup> dropdown rendering preserved')

const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx', 'utf8')
assert(/placeholder="Search tasks\.\.\."/.test(MODAL),
  '9C.14 Task Library search box preserved')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
