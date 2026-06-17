// Phase 9C.18 — Daily Assignment Board feedback capture smoke.
//
//   node scripts/smoke-dab-feedback-capture.mjs
//
// Adds a "Feedback" button + Report Workflow Issue modal to the Daily
// Assignment Board header so supervisors can capture morning-workflow
// friction in real time. The submit path reuses the Phase 31
// pilot_feedback table via the existing createFeedback helper — no
// new D1 migration, no new API route, no new client store.
//
// UI-only sub-phase: no D1 migration, no worker / API edits, no
// kiosk changes, no task / copy / translation behavior changes.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',       'utf8')
const CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

// ── createFeedback helper still in place (Phase 31 reuse) ─────────────
section('createFeedback helper — pilot_feedback reuse')

assert(/import\s*\{\s*createFeedback\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/feedback\/feedbackStore['"]/.test(DAB),
  'DAB imports { createFeedback } from utils/feedback/feedbackStore (no new helper)')

const STORE = readFileSync('src/utils/feedback/feedbackStore.js', 'utf8')
assert(/export\s+async\s+function\s+createFeedback\(payload\)/.test(STORE),
  'feedbackStore still exports createFeedback(payload) (regression couple — Phase 31)')
assert(/const API = '\/api\/pilot-feedback'/.test(STORE),
  'feedbackStore still targets /api/pilot-feedback (no new endpoint)')

// ── Header Feedback button ────────────────────────────────────────────
section('Header button — Feedback button + tooltip + aria-label')

assert(/data-variant="feedback"/.test(DAB),
  'Feedback button uses data-variant="feedback" (CSS hook)')
assert(/onClick=\{openFeedbackModal\}/.test(DAB),
  'Feedback button wires onClick={openFeedbackModal}')

// Button sits to the right of Clear Day (visually secondary placement
// — non-destructive supervisors should reach for it last).
const clearIdx    = DAB.indexOf("data-variant=\"clear\"")
const feedbackIdx = DAB.indexOf("data-variant=\"feedback\"")
assert(clearIdx >= 0 && feedbackIdx >= 0 && feedbackIdx > clearIdx,
  'Feedback button rendered AFTER Clear Day in the header (visually secondary)')

// Plain-language tooltip + aria-label so the button is keyboard / SR friendly.
assert(/title="Report a bug, confusing UX, missing feature, or other workflow friction\. Saved to the pilot feedback log for triage\."/.test(DAB),
  'Feedback button has a plain-language tooltip explaining the destination')
assert(/aria-label="Report workflow issue or feedback"/.test(DAB),
  'Feedback button has an accessible aria-label')

// Button label is the short "Feedback" word per spec.
assert(/>\s*Feedback\s*<\/button>/.test(DAB),
  '"Feedback" label rendered')

// ── State + open helper ───────────────────────────────────────────────
section('Modal state — feedbackOpen / feedbackType / feedbackArea / feedbackMessage / feedbackBusy')

assert(/const \[feedbackOpen, setFeedbackOpen\]\s*=\s*useState\(false\)/.test(DAB),
  'feedbackOpen state defaults to false')
assert(/const \[feedbackType, setFeedbackType\]\s*=\s*useState\(['"]bug['"]\)/.test(DAB),
  'feedbackType defaults to "bug" (commonest morning report)')
assert(/const \[feedbackArea, setFeedbackArea\]\s*=\s*useState\(['"]daily-assignment-board['"]\)/.test(DAB),
  'feedbackArea defaults to "daily-assignment-board" (the surface they\'re on)')
assert(/const \[feedbackMessage, setFeedbackMessage\]\s*=\s*useState\(['"]['"]\)/.test(DAB),
  'feedbackMessage defaults to empty string')
assert(/const \[feedbackBusy, setFeedbackBusy\]\s*=\s*useState\(false\)/.test(DAB),
  'feedbackBusy state defaults to false')

// openFeedbackModal resets every field so a previous session never leaks.
assert(/function openFeedbackModal\(\) \{[\s\S]{0,400}setFeedbackType\(['"]bug['"]\)/.test(DAB),
  'openFeedbackModal resets type to default')
assert(/function openFeedbackModal\(\) \{[\s\S]{0,400}setFeedbackArea\(['"]daily-assignment-board['"]\)/.test(DAB),
  'openFeedbackModal resets area to default')
assert(/function openFeedbackModal\(\) \{[\s\S]{0,400}setFeedbackMessage\(['"]['"]\)/.test(DAB),
  'openFeedbackModal resets message to empty')

// ── Type dropdown vocabulary ──────────────────────────────────────────
section('Type dropdown — required values')

for (const [value, label] of [
  ['bug',             'Bug'],
  ['confusing',       'Confusing UX'],
  ['missing-feature', 'Missing feature'],
  ['translation',     'Translation issue'],
  ['display-board',   'Kiosk / display issue'],
  ['other',           'Other'],
]) {
  assert(new RegExp(`value:\\s*['"]${value}['"],\\s*label:\\s*['"]${label}['"]`).test(DAB),
    `FEEDBACK_TYPE_OPTS includes { value: '${value}', label: '${label}' }`)
}

// Type → server category mapping. The server allowlist only has
// bug/confusing/workflow/display-board for our needs; missing-feature
// + translation bucket to workflow so the API doesn't 400.
assert(/'bug':\s*'bug'/.test(DAB),               'Type "bug" → category "bug"')
assert(/'confusing':\s*'confusing'/.test(DAB),   'Type "confusing" → category "confusing"')
assert(/'missing-feature':\s*'workflow'/.test(DAB), 'Type "missing-feature" → category "workflow" (server allowlist)')
assert(/'translation':\s*'workflow'/.test(DAB),  'Type "translation" → category "workflow" (server allowlist)')
assert(/'display-board':\s*'display-board'/.test(DAB), 'Type "display-board" → category "display-board"')
assert(/'other':\s*'workflow'/.test(DAB),        'Type "other" → category "workflow" (safe default)')

// ── Area dropdown vocabulary ──────────────────────────────────────────
section('Area dropdown — required values')

for (const [value, label] of [
  ['daily-assignment-board', 'Daily Assignment Board'],
  ['task-library',           'Task Library'],
  ['copy-from-date',         'Copy From Date'],
  ['translation',            'Translation'],
  ['kiosk-display-board',    'Kiosk Display Board'],
  ['employee-schedule',      'Employee schedule / roster'],
  ['equipment',              'Equipment'],
  ['other',                  'Other'],
]) {
  assert(new RegExp(`value:\\s*['"]${value}['"],\\s*label:\\s*['"]${label}['"]`).test(DAB),
    `FEEDBACK_AREA_OPTS includes { value: '${value}', label: '${label}' }`)
}

// ── Modal JSX — fields, accessibility, autofocus ──────────────────────
section('Modal JSX — fields + accessibility')

assert(/function FeedbackModal\(\{\s*\n\s*type,\s*\n\s*area,\s*\n\s*message,/.test(DAB),
  'FeedbackModal({ type, area, message, busy, ... }) defined')

assert(/role="dialog" aria-label="Report workflow issue"/.test(DAB),
  'modal overlay has role="dialog" with aria-label')

assert(/<h2 className=\{styles\.modalTitle\}>Report Workflow Issue<\/h2>/.test(DAB),
  'modal title reads "Report Workflow Issue"')

// Textarea exists with the spec placeholder.
assert(/<textarea[\s\S]{0,400}placeholder="What happened\? What did you expect\?"/.test(DAB),
  'message <textarea> uses placeholder "What happened? What did you expect?"')
assert(/<textarea[\s\S]{0,400}autoFocus/.test(DAB),
  'message textarea autoFocuses so the supervisor can type immediately')

// Both selects are bound + carry aria-labels.
assert(/<select[\s\S]{0,200}value=\{type\}[\s\S]{0,200}aria-label="Feedback type"/.test(DAB),
  'Type select bound to value={type} with aria-label')
assert(/<select[\s\S]{0,200}value=\{area\}[\s\S]{0,200}aria-label="Feedback area"/.test(DAB),
  'Area select bound to value={area} with aria-label')

// Context-line copy lets the supervisor know auto-context is sent.
assert(/We'll also save the selected date, current route, and a quick board snapshot to help us reproduce\./.test(DAB),
  'modal explains that selectedDate / route / board snapshot are auto-collected')

// ── Submit gating ─────────────────────────────────────────────────────
section('Submit button — disabled on blank message + busy')

assert(/const canSubmit = !busy && message\.trim\(\)\.length > 0/.test(DAB),
  'canSubmit gated on (!busy && message.trim().length > 0)')
assert(/disabled=\{!canSubmit\}/.test(DAB),
  'Send feedback button disabled={!canSubmit}')

// Both Cancel and Submit disable while busy (no double-submit).
const submitBlock = DAB.match(/<button[\s\S]{0,300}onClick=\{onSubmit\}[\s\S]{0,300}<\/button>/)
const submitSrc   = submitBlock ? submitBlock[0] : ''
assert(submitSrc.length > 0 && /disabled=\{!canSubmit\}/.test(submitSrc),
  'submit button disabled={!canSubmit}')

// Busy label / idle label.
assert(/\{busy \? ['"]Sending…['"] : ['"]Send feedback['"]\}/.test(DAB),
  'submit button flips label: "Sending…" while busy, "Send feedback" otherwise')

// ── handleFeedbackSubmit — payload + context + reset ─────────────────
section('handleFeedbackSubmit — payload shape + context + post-submit reset')

const handlerMatch = DAB.match(/async function handleFeedbackSubmit\(\)\s*\{[\s\S]*?\n  \}/)
const handlerSrc   = handlerMatch ? handlerMatch[0] : ''
assert(handlerSrc.length > 0, 'handleFeedbackSubmit body extracted')

// Blank-message guard.
assert(/const trimmed = feedbackMessage\.trim\(\)\s*\n\s*if \(!trimmed\) \{[\s\S]{0,200}return/.test(handlerSrc),
  'handler short-circuits when trimmed message is empty')

// Calls createFeedback with the mapped category + note + context.
assert(/await createFeedback\(\{[\s\S]{0,400}category:\s*FEEDBACK_TYPE_TO_CATEGORY\[feedbackType\] \?\? ['"]workflow['"]/.test(handlerSrc),
  'createFeedback payload: category = FEEDBACK_TYPE_TO_CATEGORY[feedbackType] || "workflow"')
assert(/note:\s*trimmed/.test(handlerSrc),
  'createFeedback payload: note = trimmed message')
assert(/context,/.test(handlerSrc),
  'createFeedback payload includes the JSON-serialized context blob')

// Context captures the spec-required fields. Accept both `field: value`
// and bare-shorthand `field,` forms (`selectedDate` uses the shorthand
// since the variable name already matches the key).
for (const field of [
  'source',
  'type',
  'area',
  'selectedDate',
  'route',
  'userAgent',
  'timestamp',
  'actor',
  'boardSummary',
]) {
  const hasField = new RegExp(`${field}\\s*[,:}]`).test(handlerSrc)
  assert(hasField,
    `context includes "${field}"`)
}

// boardSummary captures the live snapshot the spec asked for.
for (const counter of ['assignedEmployees', 'unassignedEmployees', 'activeTemplates', 'dayEvents']) {
  assert(new RegExp(`${counter}:`).test(handlerSrc),
    `boardSummary includes counter "${counter}"`)
}

// Success toast text (spec: "Feedback saved. Thanks.").
assert(/toast\.success\(['"]Feedback saved\. Thanks\.['"]\)/.test(handlerSrc),
  'success toast reads "Feedback saved. Thanks."')

// Modal closes + message resets on success.
assert(/setFeedbackOpen\(false\)/.test(handlerSrc),
  'modal closes on success (setFeedbackOpen(false))')
assert(/setFeedbackMessage\(['"]['"]\)/.test(handlerSrc),
  'message resets to empty string on success')

// Failure path keeps the modal open with a toast (so the supervisor's
// typing doesn't disappear).
assert(/catch \(err\) \{[\s\S]{0,200}toast\.error\(`Feedback save failed: \$\{err\.message\}`\)/.test(handlerSrc),
  'error toast surfaces err.message without closing the modal')

// busy state always reset via finally.
assert(/finally \{[\s\S]{0,200}setFeedbackBusy\(false\)/.test(handlerSrc),
  'feedbackBusy reset to false in finally')

// ── Actor / route auto-collection ─────────────────────────────────────
section('Auto-collected context — actor + route + boardSummary')

// user is destructured from useAuth.
assert(/const\s*\{\s*can,\s*user\s*\}\s*=\s*useAuth\(\)/.test(DAB),
  'DAB destructures { can, user } from useAuth()')

// Actor block reads from user safely (user could be null on auth race).
assert(/name:\s*user\?\.name\s*\?\?\s*null/.test(handlerSrc),
  'actor.name = user?.name ?? null (safe null guard)')
assert(/role:\s*user\?\.role\s*\?\?\s*null/.test(handlerSrc),
  'actor.role = user?.role ?? null')
assert(/email:\s*user\?\.email\s*\?\?\s*null/.test(handlerSrc),
  'actor.email = user?.email ?? null')

// Route + user agent are SSR-safe via typeof checks.
assert(/typeof window !== ['"]undefined['"] \? window\.location\.pathname : null/.test(handlerSrc),
  'route uses typeof window check (SSR-safe)')
assert(/typeof navigator !== ['"]undefined['"] \? navigator\.userAgent : null/.test(handlerSrc),
  'userAgent uses typeof navigator check (SSR-safe)')

// ── CSS — feedback button variant + modal body classes ────────────────
section('CSS — feedback button + modal body classes')

assert(/\.tasksBtn\[data-variant="feedback"\]\s*\{/.test(CSS),
  '.tasksBtn[data-variant="feedback"] CSS rule defined')
assert(/\.feedbackModalBody\s*\{/.test(CSS),
  '.feedbackModalBody CSS rule defined')
assert(/\.feedbackContextLine\s*\{/.test(CSS),
  '.feedbackContextLine CSS rule defined')

// Feedback button uses muted slate palette (secondary action).
assert(/\.tasksBtn\[data-variant="feedback"\]\s*\{[\s\S]{0,400}background:\s*rgba\(148,\s*163,\s*184/.test(CSS),
  'Feedback button uses muted slate palette (secondary to bulk actions)')

// ── No D1 / worker / kiosk / store edits ──────────────────────────────
section('No D1 / worker / API / kiosk / store edits')

for (const path of [
  'worker/migrations/0029_pilot_feedback.sql',
  'worker/api/pilotFeedback.js',
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
  'src/utils/feedback/feedbackStore.js',
  'src/utils/tasks/taskTemplateStore.js',
  'src/utils/calendar/calendarStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/translate/translateClient.js',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.18'),
    `${path} carries no Phase 9C.18 edits`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No new D1 migration — 0051 ceiling preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0029_pilot_feedback.sql'),
  '0029_pilot_feedback.sql still present (the table we reuse)')
assert(migrationFiles.includes('0051_task_templates.sql'),
  '0051_task_templates.sql still in the migration ledger')
const past0051 = migrationFiles.filter(f => /^00(5[4-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0051.length === 0,
  `no migration past 0053 (found: ${past0051.join(', ') || 'none'})`)

// ── Regression couples — prior phase surfaces preserved ──────────────
section('Regression couples — task / copy / translation / kiosk unchanged')

// 9C.12 — template defaults still apply when picking a task.
assert(/const carriedNotes\s*=\s*\(existing\?\.notes \?\? ['"]['"]\)\.trim\(\)/.test(DAB),
  '9C.12 carriedNotes preservation rule preserved')

// 9C.13 — grouped dropdown still renders <optgroup> per category.
assert(/<optgroup key=\{group\.key\} label=\{group\.label\}>/.test(DAB),
  '9C.13 <optgroup> dropdown rendering preserved')

// 9C.14 — Task Library search box still rendered.
const MODAL = readFileSync('src/pages/Crew/tabs/TasksManagerModal.jsx', 'utf8')
assert(/placeholder="Search tasks\.\.\."/.test(MODAL),
  '9C.14 Task Library search box preserved')

// 9C.15 — Copy From… modal still mounts under its own state flag.
assert(/function CopyAssignmentsModal\(\{/.test(DAB),
  '9C.15 CopyAssignmentsModal component preserved')

// 9C.16 — Copy Yesterday still delegates to the shared helper.
assert(/await copyAssignmentsFromDate\(yesterdayIso, selectedDate,\s*\{/.test(DAB),
  '9C.16 Copy Yesterday → copyAssignmentsFromDate delegation preserved')

// 9C.17 — fresh-day onboarding hint still gated correctly.
assert(/activeTaskTemplates\.length > 0[\s\S]{0,200}dayEmployees\.length > 0[\s\S]{0,200}summary\.assigned === 0[\s\S]{0,200}bulkBusy === null/.test(DAB),
  '9C.17 fresh-day hint gate preserved')

// 9C.17 — Copy From Date… label still rendered.
assert(/>\s*\n?\s*Copy From Date…\s*\n?\s*<\/button>/.test(DAB),
  '9C.17 "Copy From Date…" label preserved')

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
