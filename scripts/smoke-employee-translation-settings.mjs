// Phase 9C.5c1 — Employee translation settings smoke.
//
//   node scripts/smoke-employee-translation-settings.mjs
//
// Storage + UI for per-employee board-translation preferences. No
// translation provider is added, no kiosk render gating fires yet;
// this sub-phase just lets a supervisor configure the preference.
//
// The two new fields:
//   crew_employees.auto_translate_board_notes  INTEGER NOT NULL DEFAULT 0
//   crew_employees.board_language              TEXT DEFAULT 'en'
//
// Both are classified PUBLIC-safe (kiosk-rendering hints), so they
// appear OUTSIDE the canViewPrivate branch in worker/api/crew.js's
// rowToEmployee — the anonymous kiosk needs to read them in 9C.5c4.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIGRATION_PATH = 'worker/migrations/0050_crew_employee_translation_prefs.sql'
const CREW_PATH      = 'worker/api/crew.js'
const FORM_PATH      = 'src/pages/Employees/components/EmployeeFormModal.jsx'
const CSS_PATH       = 'src/pages/Employees/Employees.module.css'

// ── Migration 0050 exists with the expected ALTER TABLE statements ─────
section('Migration 0050_crew_employee_translation_prefs.sql')

let MIGRATION = ''
try { MIGRATION = readFileSync(MIGRATION_PATH, 'utf8') } catch { /* asserted below */ }
assert(MIGRATION.length > 0, `${MIGRATION_PATH} exists`)

assert(/ALTER TABLE\s+crew_employees\s+ADD COLUMN\s+auto_translate_board_notes\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i.test(MIGRATION),
  'migration adds auto_translate_board_notes INTEGER NOT NULL DEFAULT 0')
assert(/ALTER TABLE\s+crew_employees\s+ADD COLUMN\s+board_language\s+TEXT\s+DEFAULT\s+['"]en['"]/i.test(MIGRATION),
  "migration adds board_language TEXT DEFAULT 'en'")

// Negative — migration touches only crew_employees.
const otherTables = [...MIGRATION.matchAll(/ALTER\s+TABLE\s+(\w+)/gi)].map(m => m[1])
const nonEmpTables = otherTables.filter(t => t !== 'crew_employees')
assert(nonEmpTables.length === 0,
  `migration touches only crew_employees (found other tables: ${nonEmpTables.join(', ') || 'none'})`)

// Negative — no translations table created, no FK, no index.
assert(!/CREATE TABLE[\s\S]{0,200}translations?\b/i.test(MIGRATION),
  'migration does NOT create a generic translations table')
assert(!/CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(MIGRATION),
  'migration does NOT add an index on the new columns')

// Migration is the latest one.
const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
const highestMigration = migrationFiles[migrationFiles.length - 1]
assert((highestMigration === '0050_crew_employee_translation_prefs.sql' || highestMigration === '0051_task_templates.sql' || highestMigration === '0052_spray_compliance_snapshots.sql' || highestMigration === '0053_employee_schedule_overrides.sql' || highestMigration === '0054_shift_templates.sql'),
  `0050-0054 is the highest migration (found: ${highestMigration})`)

// ── Worker rowToEmployee exposes the new fields PUBLICLY ───────────────
section('worker/api/crew.js — rowToEmployee exposes public-safe prefs')

const CREW = readFileSync(CREW_PATH, 'utf8')
const rowToEmpMatch = CREW.match(/function rowToEmployee\([\s\S]*?\n\}\n/)
const rowToEmpSrc   = rowToEmpMatch ? rowToEmpMatch[0] : ''
assert(rowToEmpSrc.length > 0, 'rowToEmployee function body extracted')

// Both fields mapped from snake_case row → camelCase API.
assert(/autoTranslateBoardNotes:\s*row\.auto_translate_board_notes\s*===\s*1/.test(rowToEmpSrc),
  'rowToEmployee maps autoTranslateBoardNotes: row.auto_translate_board_notes === 1 (boolean normalization)')
assert(/boardLanguage:\s*row\.board_language\s*\?\?\s*['"]en['"]/.test(rowToEmpSrc),
  "rowToEmployee maps boardLanguage: row.board_language ?? 'en' (defaults to en when NULL)")

// CRITICAL — both fields are OUTSIDE the if (canViewPrivate) block.
const ifBranchMatch = rowToEmpSrc.match(/if \(canViewPrivate\)\s*\{([\s\S]*?)\}\s*return out/)
const ifBranchSrc   = ifBranchMatch ? ifBranchMatch[1] : ''
const unconditionalHalf = rowToEmpSrc.slice(0, rowToEmpSrc.indexOf('if (canViewPrivate)'))

assert(/autoTranslateBoardNotes:/.test(unconditionalHalf),
  'autoTranslateBoardNotes is in the unconditional/public half of rowToEmployee')
assert(/boardLanguage:/.test(unconditionalHalf),
  'boardLanguage is in the unconditional/public half of rowToEmployee')
assert(!/out\.autoTranslateBoardNotes\s*=/.test(ifBranchSrc),
  'autoTranslateBoardNotes is NOT inside the canViewPrivate branch (public-safe)')
assert(!/out\.boardLanguage\s*=/.test(ifBranchSrc),
  'boardLanguage is NOT inside the canViewPrivate branch (public-safe)')

// Existing private fields remain gated (9C.5a.5 regression).
for (const privateField of ['payRate', 'emergencyContact', 'pesticideLicense', 'phone', 'email', 'hireDate']) {
  assert(new RegExp(`out\\.${privateField}\\s*=`).test(ifBranchSrc),
    `9C.5a.5 regression: ${privateField} still inside canViewPrivate branch`)
}

// ── CORE_COLUMNS includes the new keys ─────────────────────────────────
section('worker/api/crew.js — CORE_COLUMNS includes new keys')

assert(/CORE_COLUMNS\s*=\s*\{[\s\S]*?autoTranslateBoardNotes:\s*['"]auto_translate_board_notes['"][\s\S]*?\}/.test(CREW),
  "CORE_COLUMNS includes autoTranslateBoardNotes: 'auto_translate_board_notes'")
assert(/CORE_COLUMNS\s*=\s*\{[\s\S]*?boardLanguage:\s*['"]board_language['"][\s\S]*?\}/.test(CREW),
  "CORE_COLUMNS includes boardLanguage: 'board_language'")

// ── PATCH normalizes the boolean to 0/1 ────────────────────────────────
section('worker/api/crew.js — updateCrewEmployee normalizes boolean to 0/1')

const updateMatch = CREW.match(/export async function updateCrewEmployee[\s\S]*?\n\}/)
const updateSrc   = updateMatch ? updateMatch[0] : ''
assert(updateSrc.length > 0, 'updateCrewEmployee body extracted')

// Some kind of normalize-to-0/1 logic exists for the boolean field.
// Accept any of: BOOLEAN_COLUMNS Set lookup, explicit autoTranslateBoardNotes
// branch, or inline `? 1 : 0` conversion.
const hasBooleanNormalization =
  /BOOLEAN_COLUMNS\.has\(apiKey\)/.test(updateSrc) ||
  /apiKey === ['"]autoTranslateBoardNotes['"]/.test(updateSrc) ||
  /body\.autoTranslateBoardNotes\s*\?\s*1\s*:\s*0/.test(updateSrc) ||
  /normalizeBoolean/.test(updateSrc)

assert(hasBooleanNormalization,
  'updateCrewEmployee normalizes autoTranslateBoardNotes to 0/1 before binding (via BOOLEAN_COLUMNS, inline ternary, or helper)')

// ── createCrewEmployee INSERT includes both columns ────────────────────
section('worker/api/crew.js — createCrewEmployee INSERT widened')

const createMatch = CREW.match(/export async function createCrewEmployee[\s\S]*?\n\}/)
const createSrc   = createMatch ? createMatch[0] : ''

assert(/INSERT INTO crew_employees \([\s\S]*?auto_translate_board_notes[\s\S]*?board_language/.test(createSrc),
  'createCrewEmployee INSERT column list includes auto_translate_board_notes and board_language')

assert(/body\.autoTranslateBoardNotes\s*\?\s*1\s*:\s*0/.test(createSrc),
  'createCrewEmployee bind list converts body.autoTranslateBoardNotes to 1/0')
assert(/body\.boardLanguage\s*\?\?\s*['"]en['"]/.test(createSrc),
  "createCrewEmployee bind list defaults body.boardLanguage to 'en'")

// Column / placeholder count alignment.
const insertCols = (createSrc.match(/INSERT INTO crew_employees \(([\s\S]*?)\) VALUES/) ?? ['',''])[1]
const insertVals = (createSrc.match(/VALUES \(([\s\S]*?)\)/) ?? ['',''])[1]
const colCount = insertCols.split(',').filter(s => s.trim().length > 0).length
const valCount = (insertVals.match(/\?/g) ?? []).length
assert(colCount === valCount,
  `createCrewEmployee INSERT column/placeholder count matches (cols=${colCount}, vals=${valCount})`)

// ── EmployeeFormModal — initial/payload + UI ──────────────────────────
section('EmployeeFormModal — makeInitial / toPayload include new fields')

const FORM = readFileSync(FORM_PATH, 'utf8')

// makeInitial.
const makeInitialMatch = FORM.match(/function makeInitial\(employee\)\s*\{[\s\S]*?\n\}/)
const makeInitialSrc   = makeInitialMatch ? makeInitialMatch[0] : ''
assert(/autoTranslateBoardNotes:\s*Boolean\(employee\?\.autoTranslateBoardNotes\)/.test(makeInitialSrc),
  'makeInitial hydrates autoTranslateBoardNotes: Boolean(employee?.autoTranslateBoardNotes)')
assert(/boardLanguage:\s*employee\?\.boardLanguage\s*\?\?\s*['"]en['"]/.test(makeInitialSrc),
  "makeInitial hydrates boardLanguage: employee?.boardLanguage ?? 'en'")

// toPayload.
const toPayloadMatch = FORM.match(/function toPayload\(form\)\s*\{[\s\S]*?\n\}/)
const toPayloadSrc   = toPayloadMatch ? toPayloadMatch[0] : ''
assert(/autoTranslateBoardNotes:\s*Boolean\(form\.autoTranslateBoardNotes\)/.test(toPayloadSrc),
  'toPayload sends autoTranslateBoardNotes: Boolean(form.autoTranslateBoardNotes)')
assert(/boardLanguage:\s*form\.boardLanguage\s*\|\|\s*['"]en['"]/.test(toPayloadSrc),
  "toPayload sends boardLanguage: form.boardLanguage || 'en'")

// ── EmployeeFormModal — JSX render ─────────────────────────────────────
section('EmployeeFormModal — checkbox + language dropdown render')

// Checkbox bound to form.autoTranslateBoardNotes.
assert(/<input\s*\n?\s*type="checkbox"[\s\S]{0,400}checked=\{form\.autoTranslateBoardNotes\}/.test(FORM),
  'checkbox is bound to form.autoTranslateBoardNotes via checked={...}')
assert(/onChange=\{e\s*=>\s*setField\(['"]autoTranslateBoardNotes['"],\s*e\.target\.checked\)\}/.test(FORM),
  'checkbox onChange writes form.autoTranslateBoardNotes via setField(...)')

// Checkbox carries the spec-d label.
assert(/Auto-translate board notes/.test(FORM),
  '"Auto-translate board notes" label copy is present')

// Language select bound to form.boardLanguage.
assert(/<select[\s\S]{0,400}value=\{form\.boardLanguage\}[\s\S]{0,400}onChange=\{e\s*=>\s*setField\(['"]boardLanguage['"]/.test(FORM),
  'language <select> is bound to form.boardLanguage')

// Language options table.
assert(/value:\s*['"]en['"],\s*label:\s*['"]English['"]/.test(FORM),
  "language options include { value: 'en', label: 'English' }")
assert(/value:\s*['"]es['"],\s*label:\s*['"]Spanish['"]/.test(FORM),
  "language options include { value: 'es', label: 'Spanish' }")

// Helper text mentions board notes and task notes.
assert(/board notes/i.test(FORM) && /task notes/i.test(FORM),
  "helper text mentions both 'board notes' and 'task notes'")
assert(/styles\.translationHint/.test(FORM),
  'helper text rendered via styles.translationHint')

// Cancel / Save buttons preserved (regression).
assert(/className=\{styles\.btnSecondary\}[\s\S]{0,200}Cancel/.test(FORM),
  'Cancel button preserved')
assert(/className=\{styles\.btnPrimary\}/.test(FORM) &&
       /(Save Changes|Hire Employee|Save changes)/.test(FORM),
  'Save / Hire button preserved')

// ── CSS — .translationHint exists ──────────────────────────────────────
section('CSS — .translationHint defined')

const CSS = readFileSync(CSS_PATH, 'utf8')
assert(/\.translationHint\s*\{/.test(CSS),
  '.translationHint class defined')

// Visual differentiation from the private notice (different color tint).
const hintMatch = CSS.match(/\.translationHint\s*\{[\s\S]*?\n\}/)
const hintSrc   = hintMatch ? hintMatch[0] : ''
assert(/color:\s*rgba\(74,\s*222,\s*128/.test(hintSrc) ||
       /color:\s*rgba\(\s*\d+,\s*222,\s*\d+/.test(hintSrc),
  '.translationHint uses a green-tinted color (distinct from amber .privateNotice)')

// Regression — .privateNotice still defined.
assert(/\.privateNotice\s*\{/.test(CSS),
  '.privateNotice still defined (regression)')

// ── Cross-file guards — 9C.5c1 is storage + UI only ────────────────────
section('Cross-file guards — kiosk render / authoring / worker untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/utils/crew/crewStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5c1'),
    `${path} carries no Phase 9C.5c1 edits (storage + employee UI only)`)
}

// ── No external translation / AI dependency added ──────────────────────
section('No external translation / i18n / Workers AI dependency added')

const pkg     = readFileSync('package.json',    'utf8')
const wrangler = readFileSync('wrangler.jsonc', 'utf8')
for (const term of ['i18next', 'react-intl', 'formatjs', '@cloudflare/ai', 'workers-ai', 'm2m100', 'openai', 'google-cloud-translate', 'deepl']) {
  assert(!pkg.includes(term),
    `package.json does NOT depend on "${term}" (translation provider deferred)`)
}
// Phase 9C.5c1 was provider-agnostic; the AI binding lands in 9C.5c3.
// 9C.5c1 only stores the per-employee preference; whether a provider is
// configured does not affect the employee form behavior asserted above.
assert(!/OPENAI_API_KEY|DEEPL_API_KEY|GOOGLE_TRANSLATE/i.test(wrangler),
  'wrangler.jsonc does NOT reference a non-CF translation-provider secret')

// ── 9C.5a.5 + 9C.5b1/b2/b3 regression preservation ─────────────────────
section('Phase 9C.5a.5 + 9C.5b1/b2/b3 regression couples')

// 9C.5a.5 privacy gate.
assert(/function rowToEmployee\(row,\s*canViewPrivate/.test(CREW),
  '9C.5a.5: rowToEmployee(row, canViewPrivate) signature preserved')

// 9C.5b1 worker mappers.
const ASN    = readFileSync('worker/api/assignments.js',      'utf8')
const NOTES  = readFileSync('worker/api/operationsNotes.js',  'utf8')
const ALERTS = readFileSync('worker/api/alerts.js',           'utf8')

assert(/notesEs:\s*row\.notes_es/.test(ASN),
  '9C.5b1: rowToCrewAssignment still maps notesEs')
assert(/titleEs:\s*row\.title_es/.test(NOTES) && /bodyEs:\s*row\.body_es/.test(NOTES),
  '9C.5b1: rowToNote still maps titleEs + bodyEs')
assert(/titleEs:\s*row\.title_es/.test(ALERTS) && /messageEs:\s*row\.message_es/.test(ALERTS),
  '9C.5b1: rowToAlert still maps titleEs + messageEs')

// 9C.5b2 authoring still in place.
const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
assert(/await patchCrewAssignment\(assignment\.id,\s*\{\s*notesEs:\s*next\s*\}\)/.test(DAB),
  '9C.5b2: DAB handleNotesEsBlur still PATCHes { notesEs: next }')

// 9C.5b3 kiosk render still in place.
const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
assert(/function\s+formatBilingualText/.test(DB),
  '9C.5b3: formatBilingualText helper still defined in DisplayBoard.jsx')
assert(/const\s+trimmedNotesEs\s*=\s*\(a\.notesEs\s*\?\?\s*''\)\.trim\(\)/.test(DB),
  '9C.5b3: BoardModeCrewBars still computes trimmedNotesEs')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
