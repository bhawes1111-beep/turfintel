// Phase 9C.7a — Assignment translation sweep crosses all dates.
//
//   node scripts/smoke-translate-all-assignment-dates.mjs
//
// Pins the post-9C.7a assignment sweep shape and the negative guards
// that block the 9C.5c3 / 9C.5c3a date-scoped predecessors from
// silently coming back. The kiosk's date-anchored dayCrew derivation
// stays unchanged; only the cron / Translate Now / Regenerate code
// path widens to all eligible rows.
//
// Eligibility rule (all four conditions on the row + employee join
// must be true for a row to translate):
//   • a.notes IS NOT NULL AND TRIM(a.notes) != ''
//   • a.notes_es IS NULL OR TRIM(a.notes_es) = '' (manual override
//     protection — preserves 9C.5b2 contract)
//   • a.status != 'cancelled'
//   • emp.status = 'active'
//     AND emp.auto_translate_board_notes = 1
//     AND emp.board_language = 'es'

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const AT  = readFileSync('worker/lib/autoTranslate.js',                                'utf8')
const IDX = readFileSync('worker/index.js',                                            'utf8')
const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',               'utf8')

// Extract the sweepAssignments function body so we scope assertions
// to that specific SQL block (not the daily-notes or alerts sweeps,
// which keep their existing date / lifecycle scope).
const sweepMatch = AT.match(/async function sweepAssignments\(env,\s*budget\)\s*\{[\s\S]*?\n\}/)
const sweepSrc   = sweepMatch ? sweepMatch[0] : ''

// ── Sweep widened to all dates (negative guards) ──────────────────────
section('sweepAssignments — date-scoping removed')

assert(sweepSrc.length > 0, 'sweepAssignments function body located')

assert(!/JOIN\s+calendar_events/.test(sweepSrc),
  'sweepAssignments does NOT JOIN calendar_events (9C.7a — translates across all dates)')
assert(!/e\.start_date\s*=\s*\?/.test(sweepSrc),
  'sweepAssignments does NOT filter by e.start_date = ? (9C.7a)')
assert(!/DATE\(assigned_at\)\s*=\s*\?/.test(sweepSrc),
  'sweepAssignments does NOT filter by DATE(assigned_at) = ? (legacy 9C.5c3 form blocked)')
assert(!/AND\s+e\.start_date\b/.test(sweepSrc),
  'sweepAssignments does NOT reference e.start_date at all')

// The bind list no longer passes `today` as the first arg; the only
// parameter should be `budget`. Confirm by checking the .bind(...) call.
const bindMatch = sweepSrc.match(/\.bind\(([^)]*)\)/)
const bindArgs  = bindMatch ? bindMatch[1].trim() : ''
assert(bindArgs === 'budget',
  `sweepAssignments .bind(...) takes only budget (found: "${bindArgs}")`)

// ── Employee opt-in JOIN ──────────────────────────────────────────────
section('sweepAssignments — employee opt-in JOIN gates eligibility')

assert(/LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(sweepSrc),
  'sweepAssignments LEFT JOINs crew_employees AS emp')

// Join condition: prefer employee_id, fall back to employee_name.
assert(/emp\.id\s*=\s*a\.employee_id/.test(sweepSrc),
  "join condition includes emp.id = a.employee_id (preferred linkage)")
assert(/emp\.name\s*=\s*a\.employee_name/.test(sweepSrc),
  "join condition includes emp.name = a.employee_name (legacy fallback)")
assert(/emp\.id\s*=\s*a\.employee_id[\s\S]{0,80}OR[\s\S]{0,80}emp\.name\s*=\s*a\.employee_name/i.test(sweepSrc),
  'join uses OR between emp.id and emp.name (handles legacy rows without employee_id)')

// Employee predicates.
assert(/emp\.status\s*=\s*'active'/.test(sweepSrc),
  "sweep requires emp.status = 'active'")
assert(/emp\.auto_translate_board_notes\s*=\s*1/.test(sweepSrc),
  'sweep requires emp.auto_translate_board_notes = 1')
assert(/emp\.board_language\s*=\s*'es'/.test(sweepSrc),
  "sweep requires emp.board_language = 'es'")

// ── Assignment-side predicates preserved ──────────────────────────────
section('sweepAssignments — notes / blank-es / cancelled predicates preserved')

assert(/a\.notes\s+IS\s+NOT\s+NULL/.test(sweepSrc),
  'sweep requires a.notes IS NOT NULL')
assert(/TRIM\(a\.notes\)\s*!=\s*''/.test(sweepSrc),
  "sweep requires TRIM(a.notes) != ''")
assert(/a\.notes_es\s+IS\s+NULL\s+OR\s+TRIM\(a\.notes_es\)\s*=\s*''/.test(sweepSrc),
  "sweep blank-Spanish filter: a.notes_es IS NULL OR TRIM(a.notes_es) = ''")
assert(/a\.status\s*!=\s*'cancelled'/.test(sweepSrc),
  "sweep requires a.status != 'cancelled'")

// ── Manual override protection — UPDATE guard unchanged ──────────────
section('Manual override protection — UPDATE guard preserved')

assert(/UPDATE crew_assignments[\s\S]{0,400}notes_es\s*=\s*\?[\s\S]{0,400}WHERE id = \?[\s\S]{0,200}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(sweepSrc),
  'crew_assignments UPDATE still guarded by `WHERE id = ? AND (notes_es IS NULL OR TRIM(notes_es) = "")`')

// ── TRANSLATE_MAX_PER_RUN budget still respected ─────────────────────
section('TRANSLATE_MAX_PER_RUN budget — still capped per run')

// The budget cap is enforced at the runAutoTranslateSweep level.
assert(/TRANSLATE_MAX_PER_RUN/.test(AT),
  'autoTranslate.js references env.TRANSLATE_MAX_PER_RUN for budget cap')
assert(/parseInt\(env\?\.TRANSLATE_MAX_PER_RUN/.test(AT),
  'budget parsed via parseInt(env.TRANSLATE_MAX_PER_RUN, 10)')
// The sweep's LIMIT ? caps each individual run.
assert(/LIMIT\s+\?/.test(sweepSrc),
  'sweepAssignments uses LIMIT ? to cap rows per run')

// ── Daily notes + alerts sweeps unchanged ─────────────────────────────
section('Daily notes + alerts sweeps — scope unchanged (regression couples)')

const dailyMatch = AT.match(/async function sweepDailyNotes\(env,\s*budget\)\s*\{[\s\S]*?\n\}/)
const dailySrc   = dailyMatch ? dailyMatch[0] : ''
assert(/note_date\s*=\s*\?/.test(dailySrc),
  'daily-notes sweep still scopes by note_date = today (operations notes stay date-scoped per spec)')
assert(/status\s*=\s*'active'/.test(dailySrc),
  "daily-notes sweep still requires status = 'active'")

const alertsMatch = AT.match(/async function sweepAlerts\(env,\s*budget\)\s*\{[\s\S]*?\n\}/)
const alertsSrc   = alertsMatch ? alertsMatch[0] : ''
assert(/status\s+NOT\s+IN\s*\(\s*'resolved'\s*\)/.test(alertsSrc),
  "alerts sweep still excludes status IN ('resolved') (lifecycle-based, no change)")

// ── Cron + manual endpoint both still call the shared sweep ──────────
section('Cron + manual trigger both invoke runAutoTranslateSweep(env)')

assert(/runAutoTranslateSweep\(env\)/.test(IDX),
  'worker/index.js still calls runAutoTranslateSweep(env)')

// The cron scheduled handler.
const scheduledMatch = IDX.match(/async scheduled\(event, env, ctx\)[\s\S]*?\n\s{2}\},/)
const scheduledSrc   = scheduledMatch ? scheduledMatch[0] : ''
assert(/runAutoTranslateSweep\(env\)/.test(scheduledSrc),
  'scheduled() handler still invokes runAutoTranslateSweep(env)')

// The manual /api/admin/translate/run handler.
const manualMatch = IDX.match(/pathname === ['"]\/api\/admin\/translate\/run['"]\s*&&\s*method === ['"]POST['"]\s*\)\s*\{[\s\S]*?\n\s{2}\}/)
const manualSrc   = manualMatch ? manualMatch[0] : ''
assert(/runAutoTranslateSweep\(env\)/.test(manualSrc) ||
       /runAutoTranslateSweep\(debugEnv\)/.test(manualSrc) ||
       /runAutoTranslateSweep\(fakeEnv\)/.test(manualSrc),
  'manual trigger handler still calls runAutoTranslateSweep (shared with cron)')

// ── Regenerate button still clears notesEs + calls sweep ─────────────
section('Per-row Regenerate (9C.7) — unchanged code path')

const regenMatch = DAB.match(/async function handleRegenerateSpanish\(assignment\)[\s\S]*?\n\s{2}\}/)
const regenSrc   = regenMatch ? regenMatch[0] : ''
assert(regenSrc.length > 0, 'handleRegenerateSpanish body located in DailyAssignmentBoard.jsx')

assert(/await\s+patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*['"]['"]?\s*\}\)/.test(regenSrc),
  'Regenerate still PATCHes notesEs to empty string before sweeping')
assert(/await\s+runTranslationSweep\(\)/.test(regenSrc),
  'Regenerate still calls runTranslationSweep() (now date-agnostic — picks up any blank eligible row)')

// ── No D1 migration ───────────────────────────────────────────────────
section('No D1 schema change — migrations ledger preserved')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0050_crew_employee_translation_prefs.sql'),
  '0050_crew_employee_translation_prefs.sql still in the migration ledger')
const newMigrations = migrationFiles.filter(f => /^00(5[1-9]|[6-9]\d|\d{3,})/.test(f))
assert(newMigrations.length === 0,
  `no new migration past 0050 (found: ${newMigrations.join(', ') || 'none'})`)

// ── Cross-file guards — autoTranslate.js only ─────────────────────────
section('Cross-file guards — 9C.7a touches only worker/lib/autoTranslate.js')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'src/utils/crew/crewStore.js',
  'src/utils/translate/translateClient.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/lib/translate.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.7a'),
    `${path} carries no Phase 9C.7a edits (worker/lib/autoTranslate.js only)`)
}

// ── Sweep entry point intact ──────────────────────────────────────────
section('runAutoTranslateSweep entry point intact')

assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env\)/.test(AT),
  'runAutoTranslateSweep(env) still exported')
assert(/anyEmployeeNeedsTranslation\(env\)/.test(AT),
  'sweep still early-returns when no employee needs translation (cheap no-op)')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
