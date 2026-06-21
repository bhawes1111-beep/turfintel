// Phase 9C.7 — Per-assignment Spanish regeneration smoke.
//
//   node scripts/smoke-regenerate-spanish-assignment.mjs
//
// The Daily Assignment Board grows a row-level "Regenerate" button
// beside each Spanish notes input. Clicking it:
//   1. PATCHes the row's notes_es to '' (so the sweep's race-safe
//      `WHERE notes_es IS NULL OR TRIM(notes_es) = ''` guard picks
//      it up).
//   2. Calls runTranslationSweep() to fire the same sweep the cron
//      and the global "Translate Now" button use.
//   3. Refreshes assignment data so the new Spanish lands in client
//      state without waiting for the next polling tick.
//
// Safety: if the row already has a Spanish value, the click confirms
// before clobbering. Manual Spanish authoring (9C.5b2) is otherwise
// untouched — only this explicit button can overwrite a non-null
// Spanish value, and only after a user confirm() dialog.
//
// Source-only — no server boot.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DAB     = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',          'utf8')
const DAB_CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css',   'utf8')

// ── State + handler scaffold ──────────────────────────────────────────
section('DailyAssignmentBoard — regeneratingId state + handler')

assert(/const\s+\[regeneratingId,\s*setRegeneratingId\]\s*=\s*useState\(null\)/.test(DAB),
  'const [regeneratingId, setRegeneratingId] = useState(null) declared')

assert(/async\s+function\s+handleRegenerateSpanish\(assignment\)/.test(DAB),
  'async function handleRegenerateSpanish(assignment) defined')

const handlerMatch = DAB.match(/async\s+function\s+handleRegenerateSpanish\(assignment\)[\s\S]*?\n\s{2}\}/)
const handlerSrc   = handlerMatch ? handlerMatch[0] : ''
assert(handlerSrc.length > 0, 'handleRegenerateSpanish body extracted')

// Guards.
assert(/if \(!assignment\?\.id\) return/.test(handlerSrc),
  'handler bails when assignment.id is missing')
assert(/if \(regeneratingId !== null \|\| translating\) return/.test(handlerSrc),
  'handler bails when another regenerate is in flight OR the global translate sweep is running')

// English-required check.
assert(/const\s+englishTrim\s*=\s*\(assignment\.notes\s*\?\?\s*''\)\.trim\(\)/.test(handlerSrc),
  'handler trims assignment.notes to check for English text')
assert(/Add an English note before regenerating Spanish/.test(handlerSrc),
  'handler shows "Add an English note before regenerating Spanish." toast when notes is blank')

// Confirm-before-overwrite.
assert(/const\s+hasSpanish\s*=\s*Boolean\(\(assignment\.notesEs\s*\?\?\s*''\)\.trim\(\)\)/.test(handlerSrc),
  'handler computes hasSpanish from assignment.notesEs')
assert(/window\.confirm\(['"]Replace this Spanish note with a new auto-translation\?['"]\)/.test(handlerSrc),
  'handler confirms before overwriting an existing Spanish value')
assert(/if \(hasSpanish && !window\.confirm/.test(handlerSrc),
  'confirm only fires when Spanish is already populated (silent regenerate on blank Spanish)')

// Step 1 — clear notes_es.
assert(/await\s+patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*['"]['"]?\s*\}\)/.test(handlerSrc) ||
       /await\s+patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*['"]['"]?\s*,?\s*\}\)/.test(handlerSrc),
  'handler PATCHes notesEs to empty string before triggering the sweep')

// Step 2 — fire the sweep.
assert(/await\s+runTranslationSweep\(\)/.test(handlerSrc),
  'handler awaits runTranslationSweep() (same call as global Translate Now)')

// Step 3 — refresh assignments.
assert(/await\s+refreshAssignmentsData\(\)/.test(handlerSrc),
  'handler awaits refreshAssignmentsData() after the sweep')

// In-flight state + reset in finally.
assert(/setRegeneratingId\(assignment\.id\)/.test(handlerSrc),
  'handler sets setRegeneratingId(assignment.id) at start')
assert(/finally\s*\{[\s\S]{0,200}setRegeneratingId\(null\)/.test(handlerSrc),
  'handler resets setRegeneratingId(null) in finally')

// Success / info / skipped feedback.
assert(/Spanish translation regenerated/.test(handlerSrc),
  'handler shows "Spanish translation regenerated." toast on success')
assert(/summary\?\.assignments\?\.translated\s*>\s*0/.test(handlerSrc),
  'handler branches on summary.assignments.translated > 0')
assert(/No new Spanish translation was generated/.test(handlerSrc) ||
       /Translation skipped:/.test(handlerSrc),
  'handler surfaces a no-op / skipped reason when the sweep translated 0 rows')

// 401 / 403 / generic error toasts (reuses same shape as Translate Now).
assert(/err\?\.status === 401/.test(handlerSrc),
  'handler branches on err.status === 401')
assert(/err\?\.status === 403/.test(handlerSrc),
  'handler branches on err.status === 403')

// ── Button render — gated, labeled, disabled correctly ───────────────
section('DailyAssignmentBoard — Regenerate button render')

// Button wrapped in canTranslate conditional.
assert(/\{canTranslate && \(\s*\n?\s*<button\b[\s\S]{0,1200}data-variant="regenerate"/.test(DAB),
  'button is conditionally rendered via {canTranslate && (<button data-variant="regenerate" ...>...)}')

// Button uses the new variant class.
assert(/className=\{styles\.notesRegenerateBtn\}/.test(DAB),
  'button uses className={styles.notesRegenerateBtn}')

// Button onClick wires to handler with the assignment.
assert(/onClick=\{\(\)\s*=>\s*handleRegenerateSpanish\(assignment\)\}/.test(DAB),
  'button onClick={() => handleRegenerateSpanish(assignment)}')

// Loading + idle labels.
assert(/regeneratingId === assignment\.id \? ['"]Regenerating…['"] : ['"]Regenerate['"]/.test(DAB),
  'button label flips: "Regenerating…" while busy, "Regenerate" otherwise')

// Disabled conditions — all four must be present.
const buttonMatch = DAB.match(/<button\b[\s\S]{0,1200}data-variant="regenerate"[\s\S]*?<\/button>/)
const buttonSrc   = buttonMatch ? buttonMatch[0] : ''
assert(buttonSrc.length > 0, 'regenerate button JSX slice extracted')

assert(/regeneratingId === assignment\.id/.test(buttonSrc),
  'button disabled when this row is currently regenerating')
assert(/translating/.test(buttonSrc),
  'button disabled when the global Translate Now is running')
assert(/regeneratingId !== null/.test(buttonSrc),
  'button disabled when ANY row is currently regenerating')
assert(/!\(assignment\.notes\s*\?\?\s*''\)\.trim\(\)/.test(buttonSrc),
  'button disabled when assignment has no English notes')

// Tooltip + aria-label.
assert(/title="Clear and regenerate this Spanish note"/.test(buttonSrc),
  'button has tooltip title="Clear and regenerate this Spanish note"')
assert(/aria-label=\{`Regenerate Spanish notes for \$\{emp\.name\}`\}/.test(buttonSrc),
  'button has aria-label="Regenerate Spanish notes for ${emp.name}"')

// Button lives next to the Spanish input — both inside .notesStack.
// We assert that the button appears AFTER the notesInputEs in the
// rendered JSX so it sits below / beside it visually.
const cellMatch = DAB.match(/\{isCrosswinds && \(\s*<td className=\{styles\.notesCell\}>[\s\S]*?<\/td>/)
const cellSrc   = cellMatch ? cellMatch[0] : ''
const inputEsIdx = cellSrc.indexOf('notesInputEs')
const regenIdx   = cellSrc.indexOf('notesRegenerateBtn')
assert(inputEsIdx >= 0 && regenIdx >= 0 && regenIdx > inputEsIdx,
  'Regenerate button is rendered AFTER (visually beside/below) the Spanish notes input inside .notesStack')

// ── CSS — .notesRegenerateBtn variant ──────────────────────────────────
section('CSS — .notesRegenerateBtn defined')

assert(/\.notesRegenerateBtn\s*\{/.test(DAB_CSS),
  '.notesRegenerateBtn class defined')

// Hover, focus-visible, disabled states.
assert(/\.notesRegenerateBtn:hover:not\(:disabled\)\s*\{/.test(DAB_CSS),
  '.notesRegenerateBtn:hover:not(:disabled) rule defined')
assert(/\.notesRegenerateBtn:focus-visible\s*\{/.test(DAB_CSS),
  '.notesRegenerateBtn:focus-visible rule defined')
assert(/\.notesRegenerateBtn:disabled\s*\{/.test(DAB_CSS),
  '.notesRegenerateBtn:disabled rule defined')

// Mobile breakpoint includes the new class.
assert(/@media\s*\(\s*max-width:\s*600px\s*\)\s*\{[\s\S]{0,600}\.notesRegenerateBtn/.test(DAB_CSS),
  '@media (max-width: 600px) tightens .notesRegenerateBtn on phones')

// Regression — earlier classes still defined.
assert(/\.notesStack\s*\{/.test(DAB_CSS), '.notesStack still defined (9C.5b2)')
assert(/\.notesInputEs\s*\{/.test(DAB_CSS), '.notesInputEs still defined (9C.5b2)')
assert(/\.notesInput\s*\{/.test(DAB_CSS), '.notesInput still defined (9C.5b2)')

// ── Permission — canTranslate gate matches global Translate Now ────────
section('Permission — canTranslate (canSystemSettings) gate')

assert(/const\s+canTranslate\s*=\s*can\(['"]canSystemSettings['"]\)/.test(DAB),
  "canTranslate = can('canSystemSettings') (9C.5d permission gate reused)")

// Both the global Translate Now AND the per-row Regenerate are wrapped
// in the same canTranslate gate. Phase 9C.17 lengthened the button's
// title attribute, so the window is widened from 400 to 800 chars.
const translateNowGate = (DAB.match(/\{canTranslate && \(\s*\n?\s*<button[\s\S]{0,800}Translate Now/g) ?? []).length
assert(translateNowGate >= 1,
  'global Translate Now button still wrapped in {canTranslate && (...)}')

// ── Manual Spanish override protection — sweep SQL unchanged ──────────
section('Manual override protection — autoTranslate sweep SQL unchanged')

const AT = readFileSync('worker/lib/autoTranslate.js', 'utf8')
assert(/UPDATE crew_assignments[\s\S]{0,400}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'crew_assignments UPDATE still guarded by notes_es IS NULL OR TRIM = ""')
assert(/UPDATE operations_daily_notes[\s\S]{0,400}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'operations_daily_notes title_es UPDATE still guarded')
assert(/UPDATE alerts[\s\S]{0,400}\(message_es IS NULL OR TRIM\(message_es\) = ''\)/.test(AT),
  'alerts message_es UPDATE still guarded')

// ── No kiosk DisplayBoard changes ─────────────────────────────────────
section('Public kiosk DisplayBoard — view-only invariant preserved')

const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const earlyReturnMatch = DB.match(/if \(boardMode && !printMode\)\s*\{\s*return \(([\s\S]*?<\/div>)\s*\)\s*\}/)
const earlyReturnJsx   = earlyReturnMatch ? earlyReturnMatch[1] : ''
assert(earlyReturnJsx.length > 0, 'kiosk early-return JSX extracted')

for (const forbidden of [
  'Regenerate', 'Regenerating…', 'notesRegenerateBtn',
  'handleRegenerateSpanish', 'regeneratingId',
]) {
  assert(!earlyReturnJsx.includes(forbidden),
    `kiosk early return does NOT include "${forbidden}" (view-only invariant)`)
}

// Whole DisplayBoard.jsx file shouldn't gain a Phase 9C.7 marker.
// (Later sub-phases like Phase 9C.7a / 9C.7b are explicitly allowed —
// the regex requires no letter immediately after the 7.)
assert(!/Phase 9C\.7(?![a-z\d])/.test(DB),
  'DisplayBoard.jsx carries no Phase 9C.7 edits (kiosk untouched; sub-phases allowed)')

// ── Worker endpoint unchanged ─────────────────────────────────────────
section('Worker endpoint /api/admin/translate/run preserved unchanged')

const IDX = readFileSync('worker/index.js', 'utf8')
assert(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]/.test(IDX),
  '9C.5c3b: POST /api/admin/translate/run route preserved')
assert(/actorHasPermission\(actor,\s*['"]canSystemSettings['"]\)/.test(IDX),
  '9C.5c3b: canSystemSettings auth gate preserved')

assert(!/Phase 9C\.7(?![a-z\d])/.test(IDX),
  'worker/index.js carries no Phase 9C.7 edits (UI-only sub-phase; sub-phases allowed)')

// ── No new D1 migration ───────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no migration past 0055 (0054_shift_templates accepted) (found: ${newMigrations.join(', ') || 'none'})`)

// ── Cross-file guards — UI-only sub-phase ──────────────────────────────
section('Cross-file guards — Employee Mgmt / worker / kiosk untouched')

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
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!/Phase 9C\.7(?![a-z\d])/.test(src),
    `${path} carries no Phase 9C.7 edits (UI-only sub-phase; sub-phases allowed)`)
}

// ── Global Translate Now (9C.5d) still in place ───────────────────────
section('Global Translate Now button (9C.5d) — still in place')

assert(/data-variant="translate"/.test(DAB),
  'global Translate Now button still uses data-variant="translate"')
assert(/async function handleTranslateNow\(\)/.test(DAB),
  'global handleTranslateNow() function still defined')
assert(/runTranslationSweep/.test(DAB),
  'global Translate Now still calls runTranslationSweep (shared with regenerate)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
