// Phase 9C.5c3 — Auto-translation cron + provider abstraction smoke.
//
//   node scripts/smoke-auto-translate-cron.mjs
//
// Source-only checks for:
//   1. wrangler.jsonc — AI binding + TRANSLATE_PROVIDER/MODEL/MAX vars
//   2. worker/lib/translate.js — provider abstraction shape
//   3. worker/lib/autoTranslate.js — sweep, employee-needs gate,
//      budget cap, race-safe UPDATE guards
//   4. worker/index.js — scheduled() invokes runAutoTranslateSweep
//   5. worker/api/{assignments,operationsNotes,alerts}.js — English-edit
//      invalidation: PATCH that touches English without matching
//      Spanish in the same body NULLs the cached *_es
//   6. Privacy — translation code never touches private employee fields
//   7. No new D1 migration past 0050

import { readFileSync, readdirSync, existsSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const WRANGLER = readFileSync('wrangler.jsonc', 'utf8')
const TR      = existsSync('worker/lib/translate.js')      ? readFileSync('worker/lib/translate.js',      'utf8') : ''
const AT      = existsSync('worker/lib/autoTranslate.js')  ? readFileSync('worker/lib/autoTranslate.js',  'utf8') : ''
const IDX     = readFileSync('worker/index.js',            'utf8')
const ASN     = readFileSync('worker/api/assignments.js',  'utf8')
const NOTES   = readFileSync('worker/api/operationsNotes.js', 'utf8')
const ALERTS  = readFileSync('worker/api/alerts.js',       'utf8')

// ── wrangler.jsonc — AI binding + translation vars ─────────────────────
section('wrangler.jsonc — AI binding + TRANSLATE_* vars')

assert(/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"\s*\}/.test(WRANGLER),
  'wrangler.jsonc declares { "ai": { "binding": "AI" } }')

assert(/"TRANSLATE_PROVIDER"\s*:\s*"cf-ai"/.test(WRANGLER),
  'wrangler.jsonc vars include TRANSLATE_PROVIDER: "cf-ai"')
// Phase 9C.5c3e — Cloudflare deprecated @cf/meta/llama-3-8b-instruct on
// 2026-05-30 (error 5028). The replacement is the drop-in successor
// @cf/meta/llama-3.1-8b-instruct.
assert(/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3\.1-8b-instruct"/.test(WRANGLER),
  'wrangler.jsonc vars include TRANSLATE_MODEL: "@cf/meta/llama-3.1-8b-instruct"')
// Negative guard — the deprecated model literal must not appear as the
// active TRANSLATE_MODEL value anywhere. (Historical comments still
// allowed; only the JSON value is gated.)
assert(!/"TRANSLATE_MODEL"\s*:\s*"@cf\/meta\/llama-3-8b-instruct"/.test(WRANGLER),
  'wrangler.jsonc TRANSLATE_MODEL is NOT set to the deprecated @cf/meta/llama-3-8b-instruct')
assert(/"TRANSLATE_MAX_PER_RUN"\s*:\s*"\d+"/.test(WRANGLER),
  'wrangler.jsonc vars include TRANSLATE_MAX_PER_RUN: "<integer>"')

// Existing cron still in place (regression).
assert(/"crons"\s*:\s*\[\s*"\*\/30 \* \* \* \*"\s*\]/.test(WRANGLER),
  'existing */30 weather cron still configured')

// ── worker/lib/translate.js — provider abstraction ─────────────────────
section('worker/lib/translate.js — provider abstraction')

assert(TR.length > 0, 'worker/lib/translate.js exists')
assert(/export\s+function\s+getTranslateProvider\(env\)/.test(TR),
  'exports getTranslateProvider(env)')
assert(/export\s+async\s+function\s+translateText\(env,\s*text/.test(TR),
  'exports translateText(env, text, opts)')
assert(/export\s+async\s+function\s+translateBatch\(env,\s*items/.test(TR),
  'exports translateBatch(env, items, opts)')

// cf-ai provider calls env.AI.run.
const cfAiBlock = TR.match(/name === ['"]cf-ai['"][\s\S]*?return\s*\{[\s\S]*?\}\s*\n\s*\}/)?.[0] ?? ''
assert(/env\.AI\.run\(/.test(cfAiBlock) || /env\.AI\.run\(/.test(TR),
  "cf-ai provider invokes env.AI.run(...) for translation")

// none provider returns null.
assert(/name === ['"]none['"][\s\S]{0,300}async translate[\s\S]{0,200}return\s+null/.test(TR),
  "'none' provider is a no-op that returns null")

// Prompt mentions golf course operations + Spanish + key turf terms.
assert(/golf course operations/i.test(TR) && /Spanish/i.test(TR),
  'system prompt mentions "golf course operations" and "Spanish"')
for (const term of ['greens', 'fairway', 'tee', 'bunker', 'REI']) {
  assert(new RegExp(`\\b${term}\\b`).test(TR),
    `system prompt preserves turf term '${term}'`)
}

// Never throws — wrapping try/catch.
assert(/try\s*\{[\s\S]*?env\.AI\.run\([\s\S]*?\}\s*catch/.test(TR),
  'cf-ai translate() wraps env.AI.run in try/catch (never throws)')

// Graceful no-op when AI binding missing.
assert(/if \(!env\?\.AI/.test(TR) || /env\.AI\s*\|\|/.test(TR) || /typeof env\.AI\.run/.test(TR),
  'cf-ai provider gracefully no-ops when env.AI is missing')

// ── worker/lib/autoTranslate.js — sweep logic ──────────────────────────
section('worker/lib/autoTranslate.js — sweep + employee gate + race-safe writes')

assert(AT.length > 0, 'worker/lib/autoTranslate.js exists')
assert(/export\s+async\s+function\s+runAutoTranslateSweep\(env\)/.test(AT),
  'exports runAutoTranslateSweep(env)')

// Employee-needs gate — sweep early-returns when nobody needs translation.
assert(/auto_translate_board_notes\s*=\s*1/.test(AT),
  "sweep checks for auto_translate_board_notes = 1")
assert(/board_language\s*=\s*'es'/.test(AT),
  "sweep checks for board_language = 'es'")
assert(/status\s*=\s*'active'/.test(AT),
  "sweep filters to status = 'active' employees")
assert(/no-employee-needs-translation/.test(AT),
  "sweep records 'no-employee-needs-translation' reason when gate fails")

// Budget cap respected.
assert(/TRANSLATE_MAX_PER_RUN/.test(AT),
  'sweep references env.TRANSLATE_MAX_PER_RUN for budget cap')
assert(/parseInt\(env\?\.TRANSLATE_MAX_PER_RUN/.test(AT),
  'sweep parseInt-parses TRANSLATE_MAX_PER_RUN to a number')

// Kill switch — 'none' provider short-circuits.
assert(/provider-none-killswitch/.test(AT),
  "sweep records 'provider-none-killswitch' when TRANSLATE_PROVIDER='none'")

// Race-safe assignment UPDATE.
assert(/UPDATE crew_assignments[\s\S]{0,200}notes_es\s*=\s*\?[\s\S]{0,200}WHERE id = \?[\s\S]{0,200}\(notes_es IS NULL OR TRIM\(notes_es\) = ''\)/.test(AT),
  'assignment UPDATE has race-safe WHERE guard (notes_es IS NULL OR TRIM(notes_es) = "")')

// Race-safe daily-notes title UPDATE.
assert(/UPDATE operations_daily_notes[\s\S]{0,200}title_es\s*=\s*\?[\s\S]{0,200}WHERE id = \?[\s\S]{0,200}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'daily-notes title UPDATE has race-safe WHERE guard')

// Race-safe daily-notes body UPDATE.
assert(/UPDATE operations_daily_notes[\s\S]{0,200}body_es\s*=\s*\?[\s\S]{0,200}WHERE id = \?[\s\S]{0,200}\(body_es IS NULL OR TRIM\(body_es\) = ''\)/.test(AT),
  'daily-notes body UPDATE has race-safe WHERE guard')

// Race-safe alerts title UPDATE.
assert(/UPDATE alerts[\s\S]{0,200}title_es\s*=\s*\?[\s\S]{0,200}WHERE id = \?[\s\S]{0,200}\(title_es IS NULL OR TRIM\(title_es\) = ''\)/.test(AT),
  'alerts title UPDATE has race-safe WHERE guard')

// Race-safe alerts message UPDATE.
assert(/UPDATE alerts[\s\S]{0,200}message_es\s*=\s*\?[\s\S]{0,200}WHERE id = \?[\s\S]{0,200}\(message_es IS NULL OR TRIM\(message_es\) = ''\)/.test(AT),
  'alerts message UPDATE has race-safe WHERE guard')

// SELECT scope — assignments translate across all dates (Phase 9C.7a).
//
// Phase 9C.5c3a JOINed calendar_events.start_date = today to mirror
// the kiosk's dayCrew derivation. That was correct for the TV view
// but wrong for the Translate Now / Regenerate UX, where supervisors
// expected blank rows for any date to translate. 9C.7a removes the
// calendar_events JOIN entirely and gates eligibility on the linked
// employee's translation prefs instead.
assert(/SELECT[\s\S]{0,400}crew_assignments\s+AS\s+a[\s\S]{0,400}LEFT JOIN\s+crew_employees\s+AS\s+emp/.test(AT),
  'assignments sweep LEFT JOINs crew_assignments → crew_employees (employee opt-in gate)')
assert(/emp\.id\s*=\s*a\.employee_id/.test(AT),
  'employee join uses emp.id = a.employee_id (preferred linkage)')
assert(/emp\.name\s*=\s*a\.employee_name/.test(AT),
  'employee join falls back to emp.name = a.employee_name (legacy rows without employee_id)')
assert(/emp\.status\s*=\s*'active'/.test(AT),
  "assignments sweep requires emp.status = 'active'")
assert(/emp\.auto_translate_board_notes\s*=\s*1/.test(AT),
  'assignments sweep requires emp.auto_translate_board_notes = 1')
assert(/emp\.board_language\s*=\s*'es'/.test(AT),
  "assignments sweep requires emp.board_language = 'es'")
assert(/AND\s+a\.status\s*!=\s*'cancelled'/.test(AT),
  "assignments sweep still excludes a.status = 'cancelled'")

// Negative guards — neither the original 9C.5c3 nor the 9C.5c3a
// date-scoped forms may come back.
assert(!/DATE\(assigned_at\)\s*=\s*\?/.test(AT),
  'old DATE(assigned_at) = ? filter is NOT present (removed by 9C.5c3a, must stay removed)')
assert(!/JOIN\s+calendar_events/.test(AT),
  'assignment sweep no longer JOINs calendar_events (9C.7a — translates across all dates)')
assert(!/e\.start_date\s*=\s*\?/.test(AT),
  'assignment sweep no longer filters by e.start_date = today (9C.7a)')

// SELECT scope — daily notes only translate today.
assert(/SELECT[\s\S]{0,400}operations_daily_notes[\s\S]{0,400}note_date\s*=\s*\?/.test(AT),
  'daily-notes sweep scopes by note_date = today')

// SELECT scope — alerts exclude resolved.
assert(/SELECT[\s\S]{0,400}alerts[\s\S]{0,400}status NOT IN\s*\(\s*'resolved'\s*\)/.test(AT),
  "alerts sweep excludes status IN ('resolved')")

// Never throws — wraps work in try/catch.
assert(/try\s*\{[\s\S]*?\}\s*catch[\s\S]*?summary\.skipped\s*=\s*true/.test(AT),
  'runAutoTranslateSweep wraps work in try/catch; failures set summary.skipped')

// ── Privacy — translation code does NOT touch private employee fields ─
section('Privacy — translation code never touches private employee fields')

// Strip comments from the source before scanning so prose like "// NEVER
// translate pay_rate" doesn't trip the regex checks below. We're hunting
// for ACCESS to these names in CODE, not mentions in comments.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1')      // line comments (avoid http://)
}
const AT_CODE = stripComments(AT)
const TR_CODE = stripComments(TR)

// crew_employees.notes is the per-employee admin notes column. The
// translation sweep MUST NOT read or write it (as a code reference).
const employeeNotesReferences = (AT_CODE.match(/crew_employees\.notes\b/g) ?? []).length
  + (TR_CODE.match(/crew_employees\.notes\b/g) ?? []).length
assert(employeeNotesReferences === 0,
  'translation code does NOT reference crew_employees.notes (admin notes stay private)')

// The 9C.5a.5 private fields must never appear in translation source code.
for (const privateField of ['pay_rate', 'emergency_contact', 'pesticide_license',
                            'payRate', 'emergencyContact', 'pesticideLicense', 'hireDate']) {
  assert(!new RegExp(`\\b${privateField}\\b`).test(AT_CODE) && !new RegExp(`\\b${privateField}\\b`).test(TR_CODE),
    `translation code does NOT reference private field '${privateField}'`)
}

// Translation only reads from public-safe tables. Parse SQL contexts
// explicitly: `FROM <table>` / `JOIN <table>` / `UPDATE <table>` /
// `INSERT INTO <table>`. Phase 9C.5c3a JOINed calendar_events for
// date scope; 9C.7a removed that JOIN and gates eligibility on
// crew_employees prefs instead. calendar_events remains on the
// allow-list as a no-op safety net in case a future phase needs it.
const PUBLIC_TABLES = [
  'crew_assignments',
  'operations_daily_notes',
  'alerts',
  'crew_employees',
  'calendar_events',         // historical (9C.5c3a); not actively used post-9C.7a
]
const sqlTableMatches = [
  ...AT_CODE.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+(\w+)/gi),
]
for (const m of sqlTableMatches) {
  const table = m[1]
  // Skip the `AS` alias keyword which would match the JOIN pattern's
  // first capture group on `crew_assignments AS a` JOIN syntax.
  if (table === 'AS' || /^[a-z]$/.test(table)) continue
  assert(PUBLIC_TABLES.includes(table),
    `autoTranslate SQL targets only public-safe table '${table}'`)
}

// crew_employees access in the employee-needs gate is restricted to the
// translation-prefs columns and status — NOT pay_rate / emergency_contact
// / notes / pesticide_license / phone / email.
const empSelectMatch = AT_CODE.match(/SELECT[\s\S]*?FROM crew_employees[\s\S]*?LIMIT/i)
if (empSelectMatch) {
  const empSelectSrc = empSelectMatch[0]
  for (const forbiddenCol of ['pay_rate', 'emergency_contact', 'notes', 'pesticide_license', 'phone', 'email']) {
    assert(!new RegExp(`\\b${forbiddenCol}\\b`).test(empSelectSrc),
      `crew_employees SELECT for the employee-needs gate does NOT touch '${forbiddenCol}'`)
  }
}

// ── worker/index.js — scheduled() invokes the sweep ────────────────────
section('worker/index.js — scheduled() invokes runAutoTranslateSweep')

assert(/import\s*\{\s*runAutoTranslateSweep\s*\}\s*from\s*['"]\.\/lib\/autoTranslate\.js['"]/.test(IDX),
  'worker/index.js imports runAutoTranslateSweep from ./lib/autoTranslate.js')

const scheduledMatch = IDX.match(/async scheduled\(event, env, ctx\)[\s\S]*?\n\s{2}\},/)
const scheduledSrc   = scheduledMatch ? scheduledMatch[0] : ''
assert(scheduledSrc.length > 0, 'scheduled() handler located')
assert(/runAutoTranslateSweep\(env\)/.test(scheduledSrc),
  'scheduled() handler invokes runAutoTranslateSweep(env)')
// Existing weather job preserved.
assert(/captureWeatherForAllCourses/.test(scheduledSrc),
  'scheduled() still invokes captureWeatherForAllCourses (regression)')
// ctx.waitUntil isolates the translation sweep from the weather job.
assert(/ctx\.waitUntil\(\s*\n?\s*runAutoTranslateSweep/.test(scheduledSrc),
  'translation sweep wrapped in its own ctx.waitUntil (isolated from weather job)')

// ── PATCH English-edit invalidation ────────────────────────────────────
section('English-edit invalidation — PATCHing English NULLs cached *_es')

// assignments.notes → notes_es invalidation.
const updateAsnMatch = ASN.match(/export async function updateCrewAssignment[\s\S]*?\n\}/)
const updateAsn = updateAsnMatch ? updateAsnMatch[0] : ''
assert(updateAsn.length > 0, 'updateCrewAssignment body extracted')
assert(/hasOwnProperty\.call\(body,\s*['"]notes['"]\)\s*\n?\s*&&\s*\n?\s*!Object\.prototype\.hasOwnProperty\.call\(body,\s*['"]notesEs['"]\)/.test(updateAsn),
  'updateCrewAssignment NULLs notes_es when body.notes is set without body.notesEs')
assert(/sets\.push\(['"]notes_es\s*=\s*NULL['"]\)/.test(updateAsn),
  'updateCrewAssignment pushes "notes_es = NULL" into the SET list')

// operations_daily_notes title → title_es invalidation.
const updateNoteMatch = NOTES.match(/export async function updateOperationsNote[\s\S]*?\n\}/)
const updateNote = updateNoteMatch ? updateNoteMatch[0] : ''
assert(updateNote.length > 0, 'updateOperationsNote body extracted')
assert(/hasOwnProperty\.call\(body,\s*['"]title['"]\)\s*\n?\s*&&\s*\n?\s*!Object\.prototype\.hasOwnProperty\.call\(body,\s*['"]titleEs['"]\)/.test(updateNote),
  'updateOperationsNote NULLs title_es when body.title is set without body.titleEs')
assert(/sets\.push\(['"]title_es\s*=\s*NULL['"]\)/.test(updateNote),
  'updateOperationsNote pushes "title_es = NULL" into the SET list')

// operations_daily_notes body → body_es invalidation.
assert(/hasOwnProperty\.call\(body,\s*['"]body['"]\)\s*\n?\s*&&\s*\n?\s*!Object\.prototype\.hasOwnProperty\.call\(body,\s*['"]bodyEs['"]\)/.test(updateNote),
  'updateOperationsNote NULLs body_es when body.body is set without body.bodyEs')
assert(/sets\.push\(['"]body_es\s*=\s*NULL['"]\)/.test(updateNote),
  'updateOperationsNote pushes "body_es = NULL" into the SET list')

// alerts title → title_es invalidation.
const updateAlertMatch = ALERTS.match(/export async function updateAlert[\s\S]*?\n\}/)
const updateAlert = updateAlertMatch ? updateAlertMatch[0] : ''
assert(updateAlert.length > 0, 'updateAlert body extracted')
assert(/hasOwnProperty\.call\(body,\s*['"]title['"]\)\s*\n?\s*&&\s*\n?\s*!Object\.prototype\.hasOwnProperty\.call\(body,\s*['"]titleEs['"]\)/.test(updateAlert),
  'updateAlert NULLs title_es when body.title is set without body.titleEs')
assert(/sets\.push\(['"]title_es\s*=\s*NULL['"]\)/.test(updateAlert),
  'updateAlert pushes "title_es = NULL" into the SET list')

// alerts message → message_es invalidation.
assert(/hasOwnProperty\.call\(body,\s*['"]message['"]\)\s*\n?\s*&&\s*\n?\s*!Object\.prototype\.hasOwnProperty\.call\(body,\s*['"]messageEs['"]\)/.test(updateAlert),
  'updateAlert NULLs message_es when body.message is set without body.messageEs')
assert(/sets\.push\(['"]message_es\s*=\s*NULL['"]\)/.test(updateAlert),
  'updateAlert pushes "message_es = NULL" into the SET list')

// Manual Spanish always wins — when notesEs / titleEs / bodyEs / messageEs
// IS in the PATCH body, the invalidation does NOT fire. The negative-guard
// is enforced by the `&& !hasOwnProperty(...Es)` condition above.

// ── No new D1 migration past 0050 ──────────────────────────────────────
section('No new D1 migration past 0050 (translation cache uses existing *_es columns)')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
const highestMigration = migrationFiles[migrationFiles.length - 1]
assert(highestMigration === '0050_crew_employee_translation_prefs.sql',
  `highest migration is still 0050 (found: ${highestMigration})`)

// ── Cross-file guards — 9C.5c3 is server-only ──────────────────────────
section('Cross-file guards — kiosk render / authoring UI / Employee Mgmt untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/utils/crew/crewStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'worker/api/crew.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5c3'),
    `${path} carries no Phase 9C.5c3 edits (server-only sub-phase)`)
}

// ── 9C.5b1 / 9C.5b3 / 9C.5c1 regression couples ────────────────────────
section('Phase 9C.5b1 / 9C.5b3 / 9C.5c1 regression preservation')

// 9C.5b1: worker mappers expose *_es fields.
assert(/notesEs:\s*row\.notes_es/.test(ASN),
  '9C.5b1: rowToCrewAssignment still maps notesEs')
assert(/titleEs:\s*row\.title_es/.test(NOTES) && /bodyEs:\s*row\.body_es/.test(NOTES),
  '9C.5b1: rowToNote still maps titleEs + bodyEs')
assert(/titleEs:\s*row\.title_es/.test(ALERTS) && /messageEs:\s*row\.message_es/.test(ALERTS),
  '9C.5b1: rowToAlert still maps titleEs + messageEs')

// 9C.5b3: kiosk render helper.
const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
assert(/function\s+formatBilingualText/.test(DB),
  '9C.5b3: formatBilingualText helper preserved')
assert(/const\s+trimmedNotesEs\s*=\s*\(a\.notesEs\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  '9C.5b3: BoardModeCrewBars still computes trimmedNotesEs')

// 9C.5c1: employee translation prefs on the worker side.
const CREW = readFileSync('worker/api/crew.js', 'utf8')
assert(/autoTranslateBoardNotes:\s*row\.auto_translate_board_notes\s*===\s*1/.test(CREW),
  '9C.5c1: rowToEmployee still maps autoTranslateBoardNotes')
assert(/boardLanguage:\s*row\.board_language\s*\?\?\s*['"]en['"]/.test(CREW),
  "9C.5c1: rowToEmployee still maps boardLanguage")

// 9C.5c1: EmployeeFormModal still renders the checkbox + dropdown.
const FORM = readFileSync('src/pages/Employees/components/EmployeeFormModal.jsx', 'utf8')
assert(/Auto-translate board notes/.test(FORM),
  '9C.5c1: EmployeeFormModal still renders the "Auto-translate board notes" checkbox')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
