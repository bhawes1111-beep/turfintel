// Phase 9C.5b1 — Bilingual kiosk fields storage + worker API smoke.
//
//   node scripts/smoke-bilingual-kiosk-fields.mjs
//
// Server-only sub-phase: adds nullable Spanish translation columns
// for the three crew-visible kiosk content surfaces, plus the worker
// mapper / CORE_COLUMNS / INSERT wiring so the new fields flow
// through PATCH and POST. No client UI changes, no kiosk render
// changes, no employee toggle, no external translation API.
//
// Source-only — does not boot a server.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIGRATION_PATH = 'worker/migrations/0049_bilingual_kiosk_fields.sql'
const ASN_PATH       = 'worker/api/assignments.js'
const NOTES_PATH     = 'worker/api/operationsNotes.js'
const ALERTS_PATH    = 'worker/api/alerts.js'

// ── Migration 0049 exists with the expected ALTER TABLE statements ─────
section('Migration 0049_bilingual_kiosk_fields.sql')

let MIGRATION = ''
try { MIGRATION = readFileSync(MIGRATION_PATH, 'utf8') }
catch { /* asserted below */ }
assert(MIGRATION.length > 0, `${MIGRATION_PATH} exists`)

// Five ALTER TABLE ADD COLUMN statements, each nullable TEXT.
const expected = [
  { table: 'crew_assignments',       column: 'notes_es'   },
  { table: 'operations_daily_notes', column: 'title_es'   },
  { table: 'operations_daily_notes', column: 'body_es'    },
  { table: 'alerts',                 column: 'title_es'   },
  { table: 'alerts',                 column: 'message_es' },
]
for (const { table, column } of expected) {
  const re = new RegExp(`ALTER TABLE\\s+${table}\\s+ADD COLUMN\\s+${column}\\s+TEXT\\s*;`)
  assert(re.test(MIGRATION),
    `migration adds ${table}.${column} as nullable TEXT (no NOT NULL, no DEFAULT)`)
}

// Negative — the migration must NOT touch crew_employees (the 9C.5a.5
// privacy contract is unaffected by this storage sub-phase).
assert(!/\bcrew_employees\b/i.test(MIGRATION),
  'migration does NOT touch crew_employees (9C.5a.5 privacy gate preserved)')

// Negative — the migration must NOT create a generic translations table.
// Stay with one-column-per-language for now (per the 9C.5 plan).
assert(!/CREATE TABLE[\s\S]{0,200}translations?\b/i.test(MIGRATION),
  'migration does NOT create a generic translations table')

// Negative — no NOT NULL on any new column (existing rows must stay valid).
assert(!/ADD COLUMN[\s\S]{0,80}NOT NULL/i.test(MIGRATION),
  'no ADD COLUMN ... NOT NULL in this migration (existing rows stay valid)')

// Negative — no CREATE INDEX on any new column.
assert(!/CREATE\s+(?:UNIQUE\s+)?INDEX[\s\S]{0,200}_es\b/i.test(MIGRATION),
  'no CREATE INDEX on the new *_es columns (kiosk reads alongside parent row)')

// Migration is the latest one.
const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
const highestMigration = migrationFiles[migrationFiles.length - 1]
assert(highestMigration === '0049_bilingual_kiosk_fields.sql',
  `0049_bilingual_kiosk_fields.sql is the highest migration (found: ${highestMigration})`)

// ── worker/api/assignments.js wiring ───────────────────────────────────
section('worker/api/assignments.js — notesEs mapper + writer')

const ASN = readFileSync(ASN_PATH, 'utf8')

// Mapper exposes notesEs.
assert(/rowToCrewAssignment[\s\S]*?notesEs:\s*row\.notes_es/.test(ASN),
  'rowToCrewAssignment maps notesEs: row.notes_es')

// CREW_CORE_COLUMNS includes the PATCH-able column.
assert(/CREW_CORE_COLUMNS\s*=\s*\{[\s\S]*?notesEs:\s*['"]notes_es['"][\s\S]*?\}/.test(ASN),
  "CREW_CORE_COLUMNS includes notesEs: 'notes_es'")

// INSERT column list adds notes_es; bind list adds body.notesEs ?? null.
const createAsnMatch = ASN.match(/export async function createCrewAssignment\([\s\S]*?\n\}/)
const createAsn = createAsnMatch ? createAsnMatch[0] : ''
assert(/INSERT INTO crew_assignments \(\s*[\s\S]*?notes_es[\s\S]*?course_id/.test(createAsn),
  'createCrewAssignment INSERT column list includes notes_es')
assert(/body\.notesEs\s*\?\?\s*null/.test(createAsn),
  'createCrewAssignment bind list includes body.notesEs ?? null')

// Placeholder count matches column count — guard against silent misalignment.
// The new INSERT adds one column and one bind placeholder.
const asnInsertCols = (createAsn.match(/INSERT INTO crew_assignments \(([\s\S]*?)\) VALUES/) ?? ['',''])[1]
const asnInsertVals = (createAsn.match(/VALUES \(([\s\S]*?)\)/) ?? ['',''])[1]
const asnColCount = asnInsertCols.split(',').filter(s => s.trim().length > 0).length
const asnValCount = (asnInsertVals.match(/\?/g) ?? []).length
assert(asnColCount === asnValCount,
  `createCrewAssignment INSERT column/placeholder count matches (cols=${asnColCount}, vals=${asnValCount})`)

// ── worker/api/operationsNotes.js wiring ───────────────────────────────
section('worker/api/operationsNotes.js — titleEs/bodyEs mapper + writer')

const NOTES = readFileSync(NOTES_PATH, 'utf8')

assert(/rowToNote[\s\S]*?titleEs:\s*row\.title_es/.test(NOTES),
  'rowToNote maps titleEs: row.title_es')
assert(/rowToNote[\s\S]*?bodyEs:\s*row\.body_es/.test(NOTES),
  'rowToNote maps bodyEs: row.body_es')

assert(/CORE_COLUMNS\s*=\s*\{[\s\S]*?titleEs:\s*['"]title_es['"][\s\S]*?\}/.test(NOTES),
  "CORE_COLUMNS includes titleEs: 'title_es'")
assert(/CORE_COLUMNS\s*=\s*\{[\s\S]*?bodyEs:\s*['"]body_es['"][\s\S]*?\}/.test(NOTES),
  "CORE_COLUMNS includes bodyEs: 'body_es'")

const createNoteMatch = NOTES.match(/export async function createOperationsNote\([\s\S]*?\n\}/)
const createNote = createNoteMatch ? createNoteMatch[0] : ''
assert(/INSERT INTO operations_daily_notes \(\s*[\s\S]*?title_es[\s\S]*?body_es/.test(createNote),
  'createOperationsNote INSERT column list includes title_es and body_es')
assert(/body\.titleEs\s*\?\?\s*null/.test(createNote),
  'createOperationsNote bind list includes body.titleEs ?? null')
assert(/body\.bodyEs\s*\?\?\s*null/.test(createNote),
  'createOperationsNote bind list includes body.bodyEs ?? null')

const noteInsertCols = (createNote.match(/INSERT INTO operations_daily_notes \(([\s\S]*?)\) VALUES/) ?? ['',''])[1]
const noteInsertVals = (createNote.match(/VALUES \(([\s\S]*?)\)/) ?? ['',''])[1]
const noteColCount = noteInsertCols.split(',').filter(s => s.trim().length > 0).length
const noteValCount = (noteInsertVals.match(/\?/g) ?? []).length
assert(noteColCount === noteValCount,
  `createOperationsNote INSERT column/placeholder count matches (cols=${noteColCount}, vals=${noteValCount})`)

// ── worker/api/alerts.js wiring ────────────────────────────────────────
section('worker/api/alerts.js — titleEs/messageEs mapper + writer')

const ALERTS = readFileSync(ALERTS_PATH, 'utf8')

assert(/rowToAlert[\s\S]*?titleEs:\s*row\.title_es/.test(ALERTS),
  'rowToAlert maps titleEs: row.title_es')
assert(/rowToAlert[\s\S]*?messageEs:\s*row\.message_es/.test(ALERTS),
  'rowToAlert maps messageEs: row.message_es')

assert(/CORE_COLUMNS\s*=\s*\{[\s\S]*?titleEs:\s*['"]title_es['"][\s\S]*?\}/.test(ALERTS),
  "CORE_COLUMNS includes titleEs: 'title_es'")
assert(/CORE_COLUMNS\s*=\s*\{[\s\S]*?messageEs:\s*['"]message_es['"][\s\S]*?\}/.test(ALERTS),
  "CORE_COLUMNS includes messageEs: 'message_es'")

const createAlertMatch = ALERTS.match(/export async function createAlert\([\s\S]*?\n\}/)
const createAlert = createAlertMatch ? createAlertMatch[0] : ''
assert(/INSERT INTO alerts \(\s*[\s\S]*?title_es[\s\S]*?message_es/.test(createAlert),
  'createAlert INSERT column list includes title_es and message_es')
assert(/body\.titleEs\s*\?\?\s*null/.test(createAlert),
  'createAlert bind list includes body.titleEs ?? null')
assert(/body\.messageEs\s*\?\?\s*null/.test(createAlert),
  'createAlert bind list includes body.messageEs ?? null')

const alertInsertCols = (createAlert.match(/INSERT INTO alerts \(([\s\S]*?)\) VALUES/) ?? ['',''])[1]
const alertInsertVals = (createAlert.match(/VALUES \(([\s\S]*?)\)/) ?? ['',''])[1]
const alertColCount = alertInsertCols.split(',').filter(s => s.trim().length > 0).length
const alertValCount = (alertInsertVals.match(/\?/g) ?? []).length
assert(alertColCount === alertValCount,
  `createAlert INSERT column/placeholder count matches (cols=${alertColCount}, vals=${alertValCount})`)

// ── Cross-file guards — Phase 9C.5b1 is server-only ────────────────────
section('Cross-file guards — kiosk JSX / UI / Employee Mgmt untouched')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Operations/DailyBriefingPanel.jsx',
  'src/pages/Operations/OperationsBoard.jsx',
  'src/pages/Employees/components/EmployeeFormModal.jsx',
  'src/utils/crew/crewStore.js',
  'src/utils/assignments/assignmentsStore.js',
  'src/utils/operations/notesStore.js',
  'src/utils/alerts/alertsStore.js',
  'worker/api/crew.js',
  'worker/index.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9C.5b1'),
    `${path} carries no Phase 9C.5b1 edits (storage-only sub-phase)`)
}

// ── No external translation / i18n / AI dependency added ───────────────
section('No external translation / i18n / Workers AI dependency added')

const pkg     = readFileSync('package.json', 'utf8')
const wrangler = readFileSync('wrangler.jsonc', 'utf8')
for (const term of ['i18next', 'react-intl', 'formatjs', '@cloudflare/ai', 'workers-ai', 'm2m100']) {
  assert(!pkg.includes(term),
    `package.json does NOT depend on "${term}" (manual stored translations only)`)
}
assert(!/\bAI\s*:\s*\{/.test(wrangler) && !/binding[\s\S]{0,40}["']AI["']/.test(wrangler),
  'wrangler.jsonc does NOT bind a Workers AI service (no external translation path)')

// ── Privacy contract — kiosk crew employee gate still intact ───────────
section('Phase 9C.5a.5 crew employee privacy contract — still intact')

const CREW = readFileSync('worker/api/crew.js', 'utf8')
assert(/function rowToEmployee\(row,\s*canViewPrivate/.test(CREW),
  '9C.5a.5: rowToEmployee(row, canViewPrivate) signature preserved')
assert(/if \(canViewPrivate\)\s*\{[\s\S]{0,400}out\.payRate\s*=\s*row\.pay_rate/.test(CREW),
  '9C.5a.5: payRate still gated behind if (canViewPrivate) — no leakage from this sub-phase')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
