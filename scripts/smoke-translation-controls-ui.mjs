// Phase 9C.5d — Translation Controls UI smoke.
//
//   node scripts/smoke-translation-controls-ui.mjs
//
// Surfaces the manual translation sweep as a Daily Assignment Board
// button so supervisors don't need DevTools. Source-only checks
// against the DAB JSX + CSS + the new translateClient.js helper.
//
// The button:
//   • Is conditionally rendered behind can('canSystemSettings') (owner_admin).
//   • Calls runTranslationSweep() → POST /api/admin/translate/run.
//   • Shows "Translating…" while in-flight and disables itself.
//   • Routes the response into toast messages for the four canonical
//     outcomes: skipped/no-employee, skipped/killswitch, all-up-to-date,
//     translated > 0 success.
//   • Handles 401 / 403 / generic error with distinct toast copy.
//   • Refreshes the three crew-visible stores on success so the new
//     *_es values land in client state without a polling round-trip.
//
// View-only kiosk invariant: the boardMode early-return MUST NOT
// reference the new button, the endpoint, or the helper.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB     = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',          'utf8')
const DAB_CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css',   'utf8')
const CLIENT  = readFileSync('src/utils/translate/translateClient.js',                'utf8')

// ── translateClient.js — endpoint shape ────────────────────────────────
section('translateClient.js — POST /api/admin/translate/run helper')

assert(/export\s+async\s+function\s+runTranslationSweep\s*\(\s*\)/.test(CLIENT),
  'runTranslationSweep() is exported')

assert(/['"]\/api\/admin\/translate\/run['"]/.test(CLIENT),
  'helper targets /api/admin/translate/run')

assert(/method:\s*['"]POST['"]/.test(CLIENT),
  'helper uses method: "POST"')

assert(/credentials:\s*['"]same-origin['"]/.test(CLIENT),
  "helper sends credentials: 'same-origin'")

assert(/headers:\s*mutationHeaders\(\)/.test(CLIENT),
  'helper sends headers: mutationHeaders() (Content-Type + optional x-admin-key)')

// Non-2xx throws with a .status property so the DAB caller can branch
// on 401 / 403 without parsing message text.
assert(/class\s+TranslateError\s+extends\s+Error/.test(CLIENT) ||
       /TranslateError/.test(CLIENT),
  'helper defines a TranslateError class so callers can branch on err.status')
assert(/this\.status\s*=\s*status/.test(CLIENT),
  'TranslateError carries a .status property')

// ── DAB imports — auth + refresh hooks ────────────────────────────────
section('DailyAssignmentBoard — imports for translation flow')

assert(/import\s*\{\s*useAuth\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/context\/AuthContext['"]/.test(DAB),
  'DAB imports { useAuth } from ../../../context/AuthContext')

// Phase 9C.8 — the import list widened to include scheduleTranslationSweep.
// Accept either the single-import form (legacy) or the multi-import form.
assert(/import\s*\{[^}]*\brunTranslationSweep\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/translate\/translateClient['"]/.test(DAB),
  'DAB imports { runTranslationSweep, ... } from ../../../utils/translate/translateClient')

// Refresh hooks for the three crew-visible stores.
assert(/refreshAssignmentsData/.test(DAB),
  'DAB imports refreshAssignmentsData (for post-success store refresh)')
assert(/import\s*\{\s*refreshOperationsNotesData\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/operations\/notesStore['"]/.test(DAB),
  'DAB imports { refreshOperationsNotesData } from ../../../utils/operations/notesStore')
assert(/import\s*\{\s*refreshAlertsData\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/alerts\/alertsStore['"]/.test(DAB),
  'DAB imports { refreshAlertsData } from ../../../utils/alerts/alertsStore')

// ── DAB state + permission gate ───────────────────────────────────────
section('DailyAssignmentBoard — auth gate + translating state')

assert(/const\s*\{\s*can\s*\}\s*=\s*useAuth\(\)/.test(DAB),
  'DAB destructures const { can } = useAuth()')

assert(/const\s+canTranslate\s*=\s*can\(['"]canSystemSettings['"]\)/.test(DAB),
  "DAB computes const canTranslate = can('canSystemSettings')")

assert(/const\s+\[translating,\s*setTranslating\]\s*=\s*useState\(false\)/.test(DAB),
  'DAB declares [translating, setTranslating] = useState(false)')

// ── DAB handleTranslateNow — toast branches + refresh ────────────────
section('DailyAssignmentBoard — handleTranslateNow click handler')

const handlerMatch = DAB.match(/async function handleTranslateNow\([\s\S]*?\n\s{2}\}/)
const handlerSrc   = handlerMatch ? handlerMatch[0] : ''
assert(handlerSrc.length > 0, 'handleTranslateNow body extracted')

// In-flight guard.
assert(/if \(translating\) return/.test(handlerSrc),
  'handler bails when translating is already true (no concurrent fires)')

// Sets in-flight true at top, false in finally.
assert(/setTranslating\(true\)/.test(handlerSrc),
  'handler sets translating=true at start')
assert(/finally\s*\{[\s\S]{0,200}setTranslating\(false\)/.test(handlerSrc),
  'handler resets translating=false in finally')

// Calls the helper.
assert(/await\s+runTranslationSweep\(\)/.test(handlerSrc),
  'handler awaits runTranslationSweep()')

// Skipped branches.
assert(/summary\?\.skipped/.test(handlerSrc),
  'handler checks summary.skipped')
assert(/no-employee-needs-translation/.test(handlerSrc),
  "handler branches on reason 'no-employee-needs-translation'")
assert(/No employee on today's board needs Spanish/.test(handlerSrc),
  "handler shows 'No employee on today's board needs Spanish translation.' toast")
assert(/provider-none-killswitch/.test(handlerSrc),
  "handler branches on reason 'provider-none-killswitch'")
assert(/Auto-translation is currently disabled/.test(handlerSrc),
  "handler shows 'Auto-translation is currently disabled.' toast")

// All-up-to-date branch.
assert(/All translations are up to date/.test(handlerSrc),
  "handler shows 'All translations are up to date.' toast when total === 0")

// Success branch — counts for all three tables.
assert(/Translation complete[\s\S]{0,200}\$\{asnT\}[\s\S]{0,40}assignments/.test(handlerSrc),
  'success toast includes ${asnT} assignments')
assert(/Translation complete[\s\S]{0,200}\$\{noteT\}[\s\S]{0,40}daily notes/.test(handlerSrc),
  'success toast includes ${noteT} daily notes')
assert(/Translation complete[\s\S]{0,200}\$\{alrT\}[\s\S]{0,40}alerts/.test(handlerSrc),
  'success toast includes ${alrT} alerts')

// Store refresh after success.
assert(/refreshAssignmentsData\(\)/.test(handlerSrc),
  'handler calls refreshAssignmentsData() after success')
assert(/refreshOperationsNotesData\(\)/.test(handlerSrc),
  'handler calls refreshOperationsNotesData() after success')
assert(/refreshAlertsData\(\)/.test(handlerSrc),
  'handler calls refreshAlertsData() after success')

// Error branches.
assert(/err\?\.status === 401/.test(handlerSrc),
  'handler branches on err.status === 401')
assert(/Sign in required/.test(handlerSrc),
  "handler shows 'Sign in required.' toast for 401")
assert(/err\?\.status === 403/.test(handlerSrc),
  'handler branches on err.status === 403')
assert(/don't have permission to run translations/.test(handlerSrc),
  "handler shows 'You don't have permission to run translations.' toast for 403")
assert(/Translation failed. Try again/.test(handlerSrc),
  "handler shows 'Translation failed. Try again.' toast for other errors")

// ── DAB button JSX ────────────────────────────────────────────────────
section('DailyAssignmentBoard — Translate Now button JSX')

// Button wrapped in canTranslate conditional.
assert(/\{canTranslate && \(\s*\n?\s*<button/.test(DAB),
  'button is conditionally rendered via {canTranslate && (<button>...)}')

// Button uses the translate variant.
assert(/data-variant="translate"/.test(DAB),
  'button has data-variant="translate"')

// Button uses the existing tasksBtn class for layout consistency.
assert(/className=\{styles\.tasksBtn\}[\s\S]{0,400}data-variant="translate"/.test(DAB),
  'button uses styles.tasksBtn className (layout consistency)')

// Button label flips on translating state.
assert(/\{translating \? ['"]Translating…['"] : ['"]Translate Now['"]\}/.test(DAB),
  'button label flips: "Translating…" while busy, "Translate Now" otherwise')

// Button onClick wires to handler.
assert(/onClick=\{handleTranslateNow\}/.test(DAB),
  'button onClick={handleTranslateNow}')

// Button disabled while translating. Phase 9C.17 added a bulkBusy
// term so a translate sweep can't race with an in-flight copy/clear;
// accept either shape.
assert(/disabled=\{translating(?:\s*\|\|\s*bulkBusy !== null)?\}/.test(DAB),
  'button disabled while translating (Phase 9C.17 also gates on bulkBusy)')

// Tooltip / aria title. Phase 9C.17 reworded "today's" → "this day's"
// so the tooltip stays accurate when the supervisor is on a different
// selectedDate. Pin the new wording; the old literal is intentionally
// retired.
assert(/title="Translate this day's English notes to Spanish for opted-in crew/.test(DAB),
  'button tooltip uses "this day\'s English notes" (Phase 9C.17 — accurate across all selectedDates)')

// ── CSS — translate variant style ─────────────────────────────────────
section('CSS — .tasksBtn[data-variant="translate"] defined')

assert(/\.tasksBtn\[data-variant="translate"\]\s*\{/.test(DAB_CSS),
  '.tasksBtn[data-variant="translate"] rule defined')

// Green/turf color family (distinguishes from blue copy / red clear).
assert(/\.tasksBtn\[data-variant="translate"\]\s*\{[\s\S]{0,300}rgba\(74,\s*222,\s*128/.test(DAB_CSS),
  '.tasksBtn[data-variant="translate"] uses green color family (rgba(74, 222, 128, ...))')

// Hover state present.
assert(/\.tasksBtn\[data-variant="translate"\]:hover:not\(:disabled\)\s*\{/.test(DAB_CSS),
  '.tasksBtn[data-variant="translate"]:hover:not(:disabled) rule defined')

// Regression — other variants still defined.
assert(/\.tasksBtn\[data-variant="copy"\]\s*\{/.test(DAB_CSS),
  'regression: .tasksBtn[data-variant="copy"] still defined')
assert(/\.tasksBtn\[data-variant="clear"\]\s*\{/.test(DAB_CSS),
  'regression: .tasksBtn[data-variant="clear"] still defined')

// ── Public kiosk stays view-only ───────────────────────────────────────
section('DisplayBoard kiosk — view-only, no Translate Now affordance')

const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?<\/div>)\s*\)\s*\}/)
const earlyReturnJsx   = earlyReturnMatch ? earlyReturnMatch[1] : ''
assert(earlyReturnJsx.length > 0, 'kiosk early-return JSX extracted')

for (const forbidden of [
  'Translate Now', 'Translating…',
  '/api/admin/translate/run', 'runTranslationSweep',
  'handleTranslateNow', 'canSystemSettings',
]) {
  assert(!earlyReturnJsx.includes(forbidden),
    `kiosk early return does NOT include "${forbidden}" (view-only invariant)`)
}

// Whole DisplayBoard.jsx file shouldn't gain a Phase 9C.5d marker.
assert(!DB.includes('Phase 9C.5d'),
  'DisplayBoard.jsx carries no Phase 9C.5d edits (kiosk untouched)')

// ── Worker endpoint unchanged ─────────────────────────────────────────
section('Worker endpoint /api/admin/translate/run preserved unchanged')

const IDX = readFileSync('worker/index.js', 'utf8')

assert(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]/.test(IDX),
  '9C.5c3b: POST /api/admin/translate/run route preserved')
assert(/actorHasPermission\(actor,\s*['"]canSystemSettings['"]\)/.test(IDX),
  '9C.5c3b: canSystemSettings auth gate preserved')

assert(!IDX.includes('Phase 9C.5d'),
  'worker/index.js carries no Phase 9C.5d edits (UI-only sub-phase)')

// ── Provider / model unchanged ────────────────────────────────────────
section('Provider / model unchanged from 9C.5c3e/c3f')

const WRANGLER = readFileSync('wrangler.jsonc', 'utf8')
assert(/"TRANSLATE_PROVIDER"\s*:\s*"cf-ai"/.test(WRANGLER),
  'wrangler.jsonc still configures TRANSLATE_PROVIDER: "cf-ai"')
assert(/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3\.1-8b-instruct"/.test(WRANGLER),
  'wrangler.jsonc still configures TRANSLATE_MODEL: "@cf/meta/llama-3.1-8b-instruct"')
assert(/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"\s*\}/.test(WRANGLER),
  'wrangler.jsonc still binds env.AI')

// Worker library files carry no 9C.5d marker.
for (const path of ['worker/lib/translate.js', 'worker/lib/autoTranslate.js']) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5d'),
    `${path} carries no Phase 9C.5d edits`)
}

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[2-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0051 (0051_task_templates accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── Cross-file guards — UI-only sub-phase ──────────────────────────────
section('Cross-file guards — Employee Mgmt / authoring / API untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'src/utils/crew/crewStore.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5d'),
    `${path} carries no Phase 9C.5d edits (UI-only sub-phase)`)
}

// ── 9C.5b2 / 9C.5c1 / 9C.5c3* regression couples ──────────────────────
section('Earlier-phase regression couples')

// 9C.5b2 authoring still in place.
assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*next\s*\}\)/.test(DAB),
  '9C.5b2: DAB handleNotesEsBlur still PATCHes { notesEs: next }')

// 9C.5c1 employee translation prefs intact.
const CREW = readFileSync('worker/api/crew.js', 'utf8')
assert(/autoTranslateBoardNotes:\s*row\.auto_translate_board_notes\s*===\s*1/.test(CREW),
  '9C.5c1: rowToEmployee still maps autoTranslateBoardNotes')

// 9C.5c3a JOIN scope intact.
const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
// Phase 9C.7a — sweep no longer JOINs calendar_events; employee opt-in
// gate via crew_employees replaces date-scoping.
assert(/LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(AT),
  '9C.7a: assignment sweep LEFT JOINs crew_employees (employee opt-in gate)')

// 9C.5c3c / c3d parser + two-payload retry intact.
const TR = readFileSync('worker/lib/translate.js', 'utf8')
assert(/export\s+function\s+extractAiText/.test(TR),
  '9C.5c3c: extractAiText still exported')
assert(/async function runAiCall\(env,\s*model,\s*mode,\s*payload/.test(TR),
  '9C.5c3d: runAiCall helper still defined')
assert(/export\s+function\s+getLastTranslateAttempts/.test(TR),
  '9C.5c3d: getLastTranslateAttempts still exported')

// 9C.5c3f prompt examples intact (one canary).
assert(/Corta el par 3 y después el campo de campeonato/.test(TR),
  '9C.5c3f: canonical Spanish example still in prompt')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
