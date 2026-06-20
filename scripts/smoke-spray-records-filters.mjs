// Phase S.5c.1 — Spray Records filters + Needs Info view smoke.
//
//   node scripts/smoke-spray-records-filters.mjs
//
// Pins the new advanced filter row (date range + applicator + product +
// Needs-Info toggle), the Needs Info heuristic, the wiring into the
// existing visible useMemo, and the regression couples around S.5a.1
// (Edit modal, snapshot preservation) + builder calculations.
//
// Safety invariants:
//   • Pure display-only filters — no record mutation.
//   • No worker changes, no migration, no product catalog writes.
//   • BuildSpraySheet, SprayProgramPlanner, MixCalculator unchanged.
//   • S.5a.1 edit modal flow preserved.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  return out
}

const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',         'utf8')
const MODAL    = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx', 'utf8')
const STORE    = readFileSync('src/utils/sprays/spraysStore.js',               'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                          'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                  'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',             'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',              'utf8')

const RECORDS_CODE = stripComments(RECORDS)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── State hooks for the new filters ─────────────────────────────────
section('Filter state hooks defined')

for (const [stateLine, label] of [
  ['const \\[startDate, setStartDate\\]\\s*=\\s*useState\\(\'\'\\)',          'startDate state'],
  ['const \\[endDate, setEndDate\\]\\s*=\\s*useState\\(\'\'\\)',              'endDate state'],
  ['const \\[applicatorFilter, setApplicatorFilter\\]\\s*=\\s*useState\\(\'All\'\\)', 'applicatorFilter state'],
  ['const \\[productFilter, setProductFilter\\]\\s*=\\s*useState\\(\'All\'\\)',       'productFilter state'],
  ['const \\[needsInfoOnly, setNeedsInfoOnly\\]\\s*=\\s*useState\\(false\\)',         'needsInfoOnly state'],
]) {
  assert(new RegExp(stateLine).test(RECORDS), label)
}

// ── Derived options for applicator + product dropdowns ─────────────
section('Derived option lists — alphabetical, blank-skipped')

assert(/const applicatorOptions = useMemo\(\(\) => \{[\s\S]*?\}, \[SPRAY_RECORDS\]\)/.test(RECORDS),
  'applicatorOptions useMemo depends on [SPRAY_RECORDS]')
const appOptsMatch = RECORDS.match(/const applicatorOptions = useMemo\(\(\) => \{([\s\S]*?)\}, \[SPRAY_RECORDS\]\)/)
const appOptsSrc   = appOptsMatch ? appOptsMatch[1] : ''
assert(/const a = \(r\.applicator \?\? ''\)\.trim\(\)/.test(appOptsSrc),
  'applicatorOptions strips whitespace + null')
assert(/if \(a\) set\.add\(a\)/.test(appOptsSrc),
  'applicatorOptions skips blank applicators')
assert(/\.sort\(\(a, b\) => a\.localeCompare\(b\)\)/.test(appOptsSrc),
  'applicatorOptions sorts alphabetically (localeCompare)')
assert(/\['All', \.\.\..*\]/.test(appOptsSrc),
  "applicatorOptions prepends 'All' sentinel")

assert(/const productOptions = useMemo\(\(\) => \{[\s\S]*?\}, \[SPRAY_RECORDS\]\)/.test(RECORDS),
  'productOptions useMemo depends on [SPRAY_RECORDS]')
const prodOptsMatch = RECORDS.match(/const productOptions = useMemo\(\(\) => \{([\s\S]*?)\}, \[SPRAY_RECORDS\]\)/)
const prodOptsSrc   = prodOptsMatch ? prodOptsMatch[1] : ''
assert(/for \(const p of r\.products \?\? \[\]\)/.test(prodOptsSrc),
  'productOptions iterates product rows safely with ?? []')
assert(/\.sort\(\(a, b\) => a\.localeCompare\(b\)\)/.test(prodOptsSrc),
  'productOptions sorts alphabetically')

// ── Auto-swap when start > end ──────────────────────────────────────
section('Auto-swap when startDate > endDate')

assert(/const \[effStart, effEnd\] = useMemo\(\(\) => \{[\s\S]*?if \(startDate && endDate && startDate > endDate\)[\s\S]*?return \[endDate, startDate\][\s\S]*?return \[startDate, endDate\][\s\S]*?\}, \[startDate, endDate\]\)/.test(RECORDS),
  'effStart/effEnd swap when startDate > endDate (friendly auto-swap)')

// ── visible useMemo wires every new filter + fixes missing dep ──────
section('visible useMemo wires every new filter (+ SPRAY_RECORDS dep)')

const visibleMatch = RECORDS.match(/const visible = useMemo\(\(\) => \{([\s\S]*?)\}, \[([\s\S]*?)\]\)/)
const visibleBody  = visibleMatch ? visibleMatch[1] : ''
const visibleDeps  = visibleMatch ? visibleMatch[2] : ''
assert(visibleBody.length > 0, 'visible useMemo body extracted')

// Date range — inclusive.
assert(/if \(effStart && \(!r\.date \|\| r\.date < effStart\)\) return false/.test(visibleBody),
  'date range: drops records with no date or date < effStart')
assert(/if \(effEnd\s*&& \(!r\.date \|\| r\.date > effEnd\)\)\s*return false/.test(visibleBody),
  'date range: drops records with no date or date > effEnd')

// Applicator — case-insensitive exact match.
assert(/applicatorFilter !== 'All'[\s\S]{0,400}\(r\.applicator \?\? ''\)\.toLowerCase\(\) !== applicatorQ/.test(visibleBody),
  'applicator filter: case-insensitive exact match against the selected option')

// Product — at least one row matches selected option.
assert(/productFilter !== 'All'[\s\S]{0,400}\(r\.products \?\? \[\]\)\.some\(p => p\?\.name === productFilter\)/.test(visibleBody),
  'product filter: matches at least one product row by name')

// Needs-Info — uses the pure heuristic.
assert(/needsInfoOnly && !recordNeedsInfo\(r\)/.test(visibleBody),
  'needsInfoOnly filter uses recordNeedsInfo(r) pure heuristic')

// Dep list — bug fix: SPRAY_RECORDS now in deps + all new filter
// inputs are tracked so re-renders are deterministic.
assert(/SPRAY_RECORDS/.test(visibleDeps),
  'visible useMemo dep list now includes SPRAY_RECORDS (bug fix from earlier phase)')
for (const dep of ['effStart', 'effEnd', 'applicatorFilter', 'productFilter', 'needsInfoOnly']) {
  assert(visibleDeps.includes(dep),
    `visible useMemo dep list includes ${dep}`)
}

// ── recordNeedsInfo pure helper ─────────────────────────────────────
section('recordNeedsInfo — pure, display-only, no mutation')

assert(/^function recordNeedsInfo\(record\)/m.test(RECORDS),
  'recordNeedsInfo defined as a top-level pure function')

const heuristicMatch = RECORDS.match(/function recordNeedsInfo\(record\)\s*\{([\s\S]*?)\n\}/)
const heuristicSrc   = heuristicMatch ? heuristicMatch[1] : ''
assert(heuristicSrc.length > 0, 'recordNeedsInfo body extracted')

// Only flags completed records.
assert(/if \(record\.status !== 'completed'\) return false/.test(heuristicSrc),
  'recordNeedsInfo only considers status === "completed"')

// Required fields per the spec.
for (const [check, label] of [
  ['if \\(!record\\.date\\)',                                                'date'],
  ['if \\(!record\\.applicator',                                              'applicator'],
  ['if \\(!Array\\.isArray\\(record\\.products\\)',                           'products array'],
  ['if \\(!Array\\.isArray\\(record\\.areas\\)',                              'areas array'],
  ['if \\(!c\\)',                                                             'conditions block'],
  ['if \\(c\\.windSpeedMph == null\\)',                                       'windSpeedMph (S.3)'],
  ['if \\(!c\\.windDirection\\)',                                             'windDirection (S.3)'],
]) {
  assert(new RegExp(check).test(heuristicSrc),
    `recordNeedsInfo checks: ${label}`)
}

// Pure — no mutators anywhere in the helper body.
const heuristicCode = stripComments(heuristicSrc)
assert(!/patchSpray|createSpray|deleteSpray|setRecords|setState/.test(heuristicCode),
  'recordNeedsInfo never mutates records or store state (pure)')

// ── Filter UI controls + accessibility ──────────────────────────────
section('Filter UI — date inputs + dropdowns + Needs Info toggle')

assert(/<input\s*\n\s*type="date"\s*\n\s*value=\{startDate\}/.test(RECORDS),
  'From date input bound to startDate state')
assert(/<input\s*\n\s*type="date"\s*\n\s*value=\{endDate\}/.test(RECORDS),
  'To date input bound to endDate state')
assert(/aria-label="Filter records on or after date"/.test(RECORDS),
  'From date input has an aria-label')
assert(/aria-label="Filter records on or before date"/.test(RECORDS),
  'To date input has an aria-label')

// Clear dates button only renders when a date is set.
assert(/\(startDate \|\| endDate\) && \(\s*\n\s*<button[\s\S]{0,400}Clear dates/.test(RECORDS),
  'Clear dates button renders only when start/end is set')
assert(/onClick=\{clearDates\}/.test(RECORDS),
  'Clear dates button wired to clearDates()')

// Applicator dropdown.
assert(/<select\s*\n\s*value=\{applicatorFilter\}/.test(RECORDS),
  'applicator <select> bound to applicatorFilter')
assert(/applicatorOptions\.map\(opt =>/.test(RECORDS),
  'applicator dropdown maps applicatorOptions')
assert(/opt === 'All' \? 'All applicators' : opt/.test(RECORDS),
  "applicator dropdown labels 'All' as 'All applicators'")

// Product dropdown.
assert(/<select\s*\n\s*value=\{productFilter\}/.test(RECORDS),
  'product <select> bound to productFilter')
assert(/productOptions\.map\(opt =>/.test(RECORDS),
  'product dropdown maps productOptions')

// Needs Info toggle.
assert(/onClick=\{\(\) => setNeedsInfoOnly\(v => !v\)\}/.test(RECORDS),
  'Needs Info button toggles needsInfoOnly')
assert(/aria-pressed=\{needsInfoOnly\}/.test(RECORDS),
  'Needs Info button has aria-pressed (button group accessibility)')
assert(/Needs Info/.test(RECORDS),
  'Needs Info button label')

// Clear-all and anyFilterActive.
assert(/const anyFilterActive =\s*\n\s*typeFilter !== 'All' \|\| statusFilter !== 'All' \|\| !!search \|\|\s*\n\s*!!startDate \|\| !!endDate \|\|\s*\n\s*applicatorFilter !== 'All' \|\| productFilter !== 'All' \|\|\s*\n\s*needsInfoOnly/.test(RECORDS),
  'anyFilterActive accounts for every filter input (including S.5c.1 additions)')
assert(/function clearAllFilters\(\)/.test(RECORDS),
  'clearAllFilters helper defined')
assert(/onClick=\{clearAllFilters\}/.test(RECORDS),
  '"Clear all" button wired to clearAllFilters()')

// Record count + filtered suffix now keys off anyFilterActive.
assert(/\{anyFilterActive \? ' \(filtered\)' : ''\}/.test(RECORDS),
  'record count "(filtered)" suffix keyed off anyFilterActive')

// ── S.5a.1 edit modal regression couple ─────────────────────────────
section('S.5a.1 Edit Spray Record modal preserved (regression couple)')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal (S.5a.1)')
assert(/const \[editing, setEditing\]\s*=\s*useState\(null\)/.test(RECORDS),
  'editing state still tracked (S.5a.1)')
assert(/<button[\s\S]{0,400}className=\{styles\.recordEditBtn\}[\s\S]{0,400}onClick=\{e => \{ e\.stopPropagation\(\); setEditing\(r\) \}\}/.test(RECORDS),
  'record card Edit button still uses stopPropagation + setEditing(r)')
assert(/\{editing && \(\s*\n\s*<EditSprayRecordModal/.test(RECORDS),
  'EditSprayRecordModal still mounts behind {editing && (...)}')
// Modal still uses patchSpray only.
assert(/import \{ patchSpray, refreshSpraysData \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/spraysStore'/.test(MODAL),
  'edit modal still imports patchSpray (existing endpoint, no new helper)')
assert(/await patchSpray\(record\.id, payload\)/.test(MODAL),
  'edit modal Save still calls patchSpray(record.id, payload)')

// Snapshot fields still not sent in PATCH payload.
const payloadMatch = MODAL.match(/function buildPatchPayload\(formState\)\s*\{[\s\S]*?\n\}/)
const payloadSrc   = payloadMatch ? payloadMatch[0] : ''
for (const snap of [
  'epaNumberSnapshot',
  'activeIngredientsSnapshot',
  'productCostSnapshot',
  'productCostUnitSnapshot',
  'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(payloadSrc),
    `buildPatchPayload still does NOT include ${snap} (snapshot frozen)`)
}

// Generate Report still wired.
assert(/onClick=\{\(\) => generateApplicationReport\(selected\)\}/.test(RECORDS),
  'Generate Report button still wired to generateApplicationReport(selected)')
assert(/buildSpraySummaryReport\(/.test(RECORDS),
  'buildSpraySummaryReport still called (regression couple)')

// ── Worker / store / catalog regression ─────────────────────────────
section('Worker / store / catalog scope guards')

assert(/export async function updateSpray\(env, id, request\)/.test(SPRAYS_W),
  'worker updateSpray still exported (regression)')
assert(/MUTABLE_RECORD_COLS\s*=\s*\{/.test(SPRAYS_W),
  'worker still whitelists mutable fields via MUTABLE_RECORD_COLS')
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/sprays by canEditSprays")

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
assert(pcExports.includes('listProductCatalog'),
  'productCatalog.js still exports listProductCatalog')
assert(pcExports.includes('getProductCatalog'),
  'productCatalog.js still exports getProductCatalog')
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Records source carries no product catalog mutator calls.
assert(!/createProductCatalog|updateProductCatalog|deleteProductCatalog/.test(RECORDS_CODE),
  'SprayRecords does not call any product catalog write helper')

// Records source does not mutate spray records anywhere (filtering only).
const visibleCode = stripComments(visibleBody)
assert(!/createSpray|patchSpray|deleteSpray/.test(visibleCode),
  'visible useMemo never mutates records (display-only)')

// ── Out-of-scope surfaces carry no Phase S.5c.1 edits ───────────────
section('Out-of-scope surfaces carry no Phase S.5c.1 edits')

for (const path of [
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
  'src/pages/Spray/Spray.jsx',
  'src/utils/sprays/spraysStore.js',
  'src/utils/sprayPrograms/sprayProgramStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5c.1'),
    `${path} carries no Phase S.5c.1 edits`)
}

// Worker side untouched.
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5c.1'),
    `${path} carries no Phase S.5c.1 edits`)
}

// ── CSS — advanced filter row + Needs Info toggle + mobile stack ────
section('CSS — advanced filter row + mobile stacking')

for (const cls of [
  'advancedFilterRow', 'advFilterField', 'advFilterClearBtn', 'needsInfoToggle',
]) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS .${cls} rule defined`)
}

// Needs-Info active state uses the rose compliance color (matches the
// existing S.4 Workspace + S.5a.1 read-only banner palette).
assert(/\.needsInfoToggle\.filterBtnActive,[\s\S]{0,200}\.needsInfoToggle\[aria-pressed="true"\]\s*\{[\s\S]{0,400}rgba\(244,\s*63,\s*94/.test(CSS),
  '.needsInfoToggle active state uses the rose compliance color')

// Mobile (≤ 600px) — full-width inputs + stretched buttons.
const mobileMatch = CSS.match(/@media \(max-width:\s*600px\)\s*\{[\s\S]*?\.advancedFilterRow[\s\S]*?\n\}/)
assert(mobileMatch !== null,
  'Spray.module.css has a mobile block targeting .advancedFilterRow')
assert(/\.advancedFilterRow\s*\{[\s\S]{0,300}flex-direction:\s*column/.test(CSS),
  'mobile .advancedFilterRow stacks vertically')
assert(/\.advFilterField input\[type="date"\],[\s\S]{0,200}\.advFilterField select\s*\{[\s\S]{0,400}width:\s*100%/.test(CSS),
  'mobile .advFilterField inputs go full-width')
assert(/\.advFilterClearBtn,[\s\S]{0,200}\.needsInfoToggle\s*\{[\s\S]{0,300}align-self:\s*stretch/.test(CSS),
  'mobile Clear / Needs-Info buttons stretch to row width')

// ── DAB + kiosk untouched ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5c.1'),   'DAB carries no Phase S.5c.1 edits')
assert(!KIOSK.includes('Phase S.5c.1'), 'kiosk carries no Phase S.5c.1 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
