// Phase 9C.12 — Task template defaults applied on dropdown selection.
//
//   node scripts/smoke-task-template-defaults.mjs
//
// When a supervisor picks a task template for an employee:
//   • Calendar event create uses template.name + defaultStartTime +
//     defaultLocation + defaultNotes (description) + the stable
//     task-template:<id>:<date> sourceId.
//   • New assignment row carries notes pre-filled from the template's
//     defaultNotes (only when there are no existing notes to preserve).
//   • Existing assignment notes are NEVER overwritten across a task
//     switch — the supervisor's customized text always wins.
//   • notesEs is never set in the create payload; the worker stores
//     notes_es as NULL on POST so the cron sweep / scheduleTranslationSweep
//     refills it for opted-in employees.
//   • Translation sweep fires once at the tail when English notes were
//     actually written; the existing debounce window collapses
//     duplicate triggers for rapid multi-row edits.
//
// UI-only sub-phase: no D1 migration, no worker / API edits, no
// kiosk changes, no task_templates schema changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',  'utf8')
const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx',     'utf8')
const STORE = readFileSync('src/utils/tasks/taskTemplateStore.js',          'utf8')

// Extract the two functions so downstream assertions can scope tightly.
// Nested inside the component → closing brace is "  }" at component
// indent, followed by a blank line before the next sibling function.
const pickMatch    = DAB.match(/async function pickOrCreateEventForTask\(template, dateIso\)\s*\{[\s\S]*?\n  \}/)
const pickSrc      = pickMatch ? pickMatch[0] : ''
const handlerMatch = DAB.match(/async function handleQuickTaskChange\(emp, templateId\)\s*\{[\s\S]*?\n  \}/)
const handlerSrc   = handlerMatch ? handlerMatch[0] : ''

// ── pickOrCreateEventForTask — template object signature ──────────────
section('pickOrCreateEventForTask — template-object signature')

assert(pickSrc.length > 0,
  'pickOrCreateEventForTask(template, dateIso) body extracted')

// Defensive guard on shape so a malformed call returns null instead of
// posting a half-baked event.
assert(/if \(!wanted \|\| !dateIso \|\| !template\?\.id\) return null/.test(pickSrc),
  'pickOrCreateEventForTask guards on (wanted, dateIso, template?.id) and returns null when any missing')

// Title comes from the template, not from an arbitrary string param.
assert(/const wanted = \(template\?\.name \?\? ['"]['"]\)\.trim\(\)\.toLowerCase\(\)/.test(pickSrc),
  'pickOrCreateEventForTask derives wanted-title from template.name')

// Find-or-create — existing crew event for (date, title) is reused so
// two operators picking the same template on the same day collapse to
// one calendar_event (defence-in-depth against the server dedupe).
assert(/const existing = events\.find\(e =>[\s\S]{0,400}\(e\.eventType === 'crew'\)/.test(pickSrc),
  'pickOrCreateEventForTask reuses an existing crew event for (date, title) before creating')

// Stable sourceId keyed by template id.
assert(/sourceId:\s*`task-template:\$\{template\.id\}:\$\{dateIso\}`/.test(pickSrc),
  'pickOrCreateEventForTask uses sourceId task-template:<template.id>:<dateIso>')

// ── pickOrCreateEventForTask — template defaults on event create ──────
section('pickOrCreateEventForTask — defaults applied on event create')

assert(/title:\s*template\.name/.test(pickSrc),
  'event title comes from template.name')
assert(/startDate:\s*dateIso/.test(pickSrc),
  'event startDate is the selected date')
assert(/startTime:\s*template\.defaultStartTime \|\| null/.test(pickSrc),
  'event startTime uses template.defaultStartTime when present (|| null otherwise)')
assert(/location:\s*template\.defaultLocation\s*\|\| null/.test(pickSrc),
  'event location uses template.defaultLocation when present')
assert(/description:\s*template\.defaultNotes\s*\|\| null/.test(pickSrc),
  'event description uses template.defaultNotes when present')
assert(/eventType:\s*'crew'/.test(pickSrc),
  "eventType still pinned to 'crew'")
assert(/sourceModule:\s*'assignment-board'/.test(pickSrc),
  "sourceModule still pinned to 'assignment-board'")

// ── handleQuickTaskChange — entry guards ──────────────────────────────
section('handleQuickTaskChange — entry guards')

assert(handlerSrc.length > 0,
  'handleQuickTaskChange(emp, templateId) body extracted')

assert(/if \(!templateId\) return handleClear\(emp\)/.test(handlerSrc),
  'blank dropdown selection clears via the existing handleClear path')

assert(/const template = activeTaskTemplates\.find\(t => t\.id === templateId\)/.test(handlerSrc),
  'handleQuickTaskChange resolves the template from activeTaskTemplates')

assert(/if \(!template\)[\s\S]{0,200}toast\.error\(['"`]Task assignment failed: template not found/.test(handlerSrc),
  'handleQuickTaskChange toasts a clean error when the template id is unknown (e.g. archived mid-session)')

// Same-event no-op guard (handles dropdown re-firing the same value).
assert(/if \(existing && existing\.calendarEventId === event\.id\) return/.test(handlerSrc),
  'handleQuickTaskChange no-ops when assignment is already on the same event')

// ── handleQuickTaskChange — notes carry / template default ───────────
section('handleQuickTaskChange — notes preservation + default application')

// Compute carriedNotes from the existing row's notes (trimmed).
assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(handlerSrc),
  'carriedNotes = (existing?.notes ?? "").trim() — read off existing row before delete')

// Compute defaultNotes from the template (trimmed) — empty string is
// treated the same as absent so a whitespace-only default does not
// produce a whitespace-only notes value.
assert(/const defaultNotes\s*=\s*\(template\.defaultNotes \?\? ['"]['"]\)\.trim\(\)/.test(handlerSrc),
  'defaultNotes = (template.defaultNotes ?? "").trim()')

// notesToWrite picks the existing carriedNotes first, then the
// template's default, then null.
assert(/const notesToWrite\s*=\s*carriedNotes \|\| defaultNotes \|\| null/.test(handlerSrc),
  'notesToWrite = carriedNotes || defaultNotes || null (preservation wins over default; null when neither)')

// createCrewAssignment payload includes notes.
assert(/await createCrewAssignment\(\{[\s\S]{0,400}\bnotes:\s*notesToWrite/.test(handlerSrc),
  'createCrewAssignment payload includes notes: notesToWrite')

// Critically — notesEs is NOT in the create payload. The worker stores
// notes_es as NULL on POST and the cron sweep / scheduleTranslationSweep
// path refills it for opted-in employees. Setting it here would
// stomp the cron path's race-safe NULL-guard.
assert(!/\bnotesEs\b/.test(handlerSrc),
  'createCrewAssignment payload does NOT set notesEs (cron sweep refills it)')

// Old assignment is unlinked + deleted BEFORE create. The unlink-then-
// delete order keeps equipment available at the task level for the
// next operator to claim (preserved from 9C.2).
assert(/if \(existing\) \{[\s\S]{0,400}await unlinkReservationsFor\(existing\.id\)[\s\S]{0,200}await deleteCrewAssignment\(existing\.id\)/.test(handlerSrc),
  'existing assignment: unlinkReservationsFor → deleteCrewAssignment, in that order')

// ── handleQuickTaskChange — translation sweep ─────────────────────────
section('handleQuickTaskChange — translation sweep wiring')

// Sweep only fires when English notes were actually written. A blank
// notesToWrite (no existing + no template default) means no English
// content changed → no sweep call → no duplicate trigger.
assert(/if \(notesToWrite && canTranslate\) \{\s*\n\s*scheduleTranslationSweep\(\)/.test(handlerSrc),
  'scheduleTranslationSweep() fires only when notesToWrite is non-null AND canTranslate is true')

// The sweep helper still comes from translateClient (regression couple
// from 9C.8 — same debounce window collapses duplicate triggers).
assert(/import\s*\{[\s\S]*?scheduleTranslationSweep[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/translate\/translateClient['"]/.test(DAB),
  '9C.8 scheduleTranslationSweep still imported from translateClient (regression couple)')

// Translation provider is NOT called directly from handleQuickTaskChange.
// Everything goes through the worker via the sweep helper.
assert(!/translateText|runTranslation\(|env\.AI|TRANSLATE_/.test(handlerSrc),
  'handleQuickTaskChange does not call the translation provider directly')

// ── Existing dropdown behavior preserved ──────────────────────────────
section('Existing dropdown behavior preserved')

// Archived templates still excluded from the dropdown (9C.11 regression
// couple — defensive filter on the client side in addition to the
// server-side ?status=all opt-in).
assert(/\.filter\(t => t\.status === 'active'\)/.test(DAB),
  'activeTaskTemplates filters to status === "active" (archived excluded)')

// Phase 9C.13 wrapped the per-template <option> map in a per-category
// <optgroup>. The unified template-driven flow (no regression back to
// per-day events) is preserved.
assert(/groupedActiveTaskTemplates\.map\(group =>/.test(DAB),
  'task dropdown still maps over template buckets (Phase 9C.13 grouped form)')

// Blank — Unassigned — option still present so clearing remains possible.
assert(/<option value="">— Unassigned —<\/option>/.test(DAB),
  'dropdown still includes the blank — Unassigned — option')

// ── handleClear — simplified inline form (no handleTaskChange) ────────
section('handleClear — simplified inline form')

const clearMatch = DAB.match(/async function handleClear\(emp\)\s*\{[\s\S]*?\n  \}/)
const clearSrc   = clearMatch ? clearMatch[0] : ''
assert(clearSrc.length > 0, 'handleClear body extracted')

assert(!/handleTaskChange/.test(clearSrc),
  'handleClear does NOT delegate to the retired handleTaskChange')
assert(/await unlinkReservationsFor\(existing\.id\)[\s\S]{0,200}await deleteCrewAssignment\(existing\.id\)/.test(clearSrc),
  'handleClear runs unlinkReservationsFor → deleteCrewAssignment')
assert(/if \(!existing\) return/.test(clearSrc),
  'handleClear short-circuits when there is no existing assignment')

// Legacy handleTaskChange helper retired entirely.
assert(!/async function handleTaskChange\(/.test(DAB),
  'legacy handleTaskChange function removed (its create-new branch became dead code once 9C.12 took over assignment creation)')

// ── TasksManagerModal — default fields still saved ────────────────────
section('TasksManagerModal — default fields still saved on template add/edit')

for (const field of ['name', 'category', 'defaultStartTime', 'defaultLocation', 'defaultNotes', 'sortOrder']) {
  assert(new RegExp(`setField\\(['"]${field}['"]`).test(MODAL) || new RegExp(`draft\\.${field}`).test(MODAL),
    `TasksManagerModal draft surface includes ${field}`)
}

// Save payload still routes all three default fields through to the API.
assert(/defaultStartTime:\s*draft\.defaultStartTime \|\| null/.test(MODAL),
  'modal save payload: defaultStartTime || null')
assert(/defaultLocation:\s*draft\.defaultLocation\.trim\(\) \|\| null/.test(MODAL),
  'modal save payload: defaultLocation.trim() || null')
assert(/defaultNotes:\s*draft\.defaultNotes\.trim\(\) \|\| null/.test(MODAL),
  'modal save payload: defaultNotes.trim() || null')

// Store still exposes the helpers untouched.
for (const fn of ['useTaskTemplatesData', 'refreshTaskTemplatesData',
                  'createTaskTemplate', 'patchTaskTemplate',
                  'archiveTaskTemplate', 'unarchiveTaskTemplate']) {
  assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(STORE),
    `taskTemplateStore still exports ${fn} (regression couple)`)
}

// ── No D1 migration ───────────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[2-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0051 (found: ${past0051.join(', ') || 'none'})`)

// ── No worker / API edits ─────────────────────────────────────────────
section('No worker / API edits — 9C.12 is UI-only')

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
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.12'),
    `${path} carries no Phase 9C.12 edits`)
}

// task_templates schema is untouched — the 0051 migration is the only
// place the table is defined and no later migration alters its columns.
assert(!/ALTER TABLE task_templates/i.test(readFileSync('worker/migrations/0051_task_templates.sql', 'utf8')),
  '0051 migration does not ALTER task_templates (additive-only contract)')

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

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
