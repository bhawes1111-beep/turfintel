// Phase S.3 — Spray compliance snapshot smoke.
//
//   node scripts/smoke-spray-compliance-snapshots.mjs
//
// Phase S.1 audited the spray module and found that historically
// critical fields (EPA #, active ingredients, cost) only lived on the
// global product_catalog table — meaning a later catalog correction
// would silently rewrite the meaning of old spray records.
//
// This phase adds additive snapshot columns to spray_records +
// spray_products, wires BuildSpraySheet to capture them, persists
// them in createSpray with best-effort server-side enrichment from
// product_catalog when only a productCatalogId was supplied, and
// surfaces them in SprayRecords' detail view.
//
// Pins enforced by this smoke:
//   • Migration 0052 exists, is ADDITIVE only (no DROP/RENAME/
//     constraint changes), and adds the five spray_products columns
//     plus the four spray_records columns.
//   • createSpray INSERT includes all four new spray_records columns.
//   • createSpray product INSERT includes all five new spray_products
//     columns AND consults tryCatalogEnrich for EPA + active
//     ingredients when productCatalogId is supplied.
//   • Catalog enrichment is best-effort: wrapped in try/catch so a
//     lookup failure never blocks the spray save.
//   • rowToRecord returns the new fields in camelCase, with `?? null`
//     fallbacks so old records (NULL columns) render as null instead
//     of undefined.
//   • MUTABLE_RECORD_COLS allows PATCH on the new record-level fields.
//   • updateSpray honors the new nested conditions.windSpeedMph /
//     conditions.windDirection in addition to the legacy fields.
//   • BuildSpraySheet has applicator license, wind speed, wind
//     direction inputs alongside the preserved free-text wind.
//   • BuildSpraySheet payload sends the new snapshots, recomputes the
//     record-level total cost, and prefills license from the selected
//     operator's pesticideLicense when blank (never overwrites a hand
//     typed license).
//   • SprayRecords detail view surfaces the new fields conditionally
//     (renders "—"-style or hides) so old records stay clean.
//   • product_catalog schema unchanged.
//   • Phase S.2 spray-program permission rules preserved verbatim.
//   • Kiosk / DAB / Task Library / translation contract untouched.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MIG     = readFileSync('worker/migrations/0052_spray_compliance_snapshots.sql', 'utf8')
const SPRAYS  = readFileSync('worker/api/sprays.js', 'utf8')
const BUILD   = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const RECORDS = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx', 'utf8')

// ── Migration 0052 — additive only, exact columns ────────────────────
section('Migration 0052 — additive only, five + four new columns')

// Five spray_products columns.
for (const col of [
  'epa_number_snapshot',
  'active_ingredients_snapshot',
  'product_cost_snapshot',
  'product_cost_unit_snapshot',
  'total_cost_snapshot',
]) {
  assert(new RegExp(`ALTER TABLE spray_products ADD COLUMN ${col}\\b`).test(MIG),
    `0052 adds spray_products.${col}`)
}

// Four spray_records columns.
for (const col of [
  'applicator_license',
  'wind_speed_mph',
  'wind_direction',
  'total_cost_snapshot',
]) {
  assert(new RegExp(`ALTER TABLE spray_records ADD COLUMN ${col}\\b`).test(MIG),
    `0052 adds spray_records.${col}`)
}

// No DROP / RENAME / CHECK / UNIQUE / NOT NULL on the new columns
// (NOT NULL with no DEFAULT would fail on rows that already exist).
assert(!/\bDROP\b/i.test(MIG),
  '0052 contains no DROP statements')
assert(!/\bRENAME\b/i.test(MIG),
  '0052 contains no RENAME statements')
assert(!/ADD COLUMN[\s\S]{0,400}\bNOT NULL\b(?!.*DEFAULT)/i.test(MIG),
  '0052 has no NOT NULL columns without DEFAULT (would break additive guarantee on existing rows)')

// Existing wind column intentionally preserved.
assert(/`?wind`? free-text column is intentionally preserved/i.test(MIG),
  '0052 documents that the legacy free-text wind column is preserved')

// ── createSpray — record INSERT pins all four new record columns ─────
section('createSpray — record INSERT pins new compliance + cost columns')

assert(/INSERT INTO spray_records[\s\S]{0,800}applicator_license, wind_speed_mph, wind_direction, total_cost_snapshot[\s\S]{0,400}VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/.test(SPRAYS),
  'createSpray INSERT includes the four new spray_records columns + 24-placeholder VALUES tuple')

// Each value-binding has a sensible fallback so missing fields don't crash.
assert(/body\.applicatorLicense\s*\?\?\s*null/.test(SPRAYS),
  'createSpray binds body.applicatorLicense ?? null')
assert(/body\.conditions\?\.windSpeedMph\s*\?\?\s*body\.windSpeedMph\s*\?\?\s*null/.test(SPRAYS),
  'createSpray accepts windSpeedMph via conditions or top-level (?? null)')
assert(/body\.conditions\?\.windDirection\s*\?\?\s*body\.windDirection\s*\?\?\s*null/.test(SPRAYS),
  'createSpray accepts windDirection via conditions or top-level (?? null)')
assert(/body\.totalCostSnapshot\s*\?\?\s*null/.test(SPRAYS),
  'createSpray binds body.totalCostSnapshot ?? null')

// Existing record fields preserved (regression couples).
assert(/INSERT INTO spray_records[\s\S]{0,600}spray_date, start_time, end_time, status/.test(SPRAYS),
  'createSpray INSERT preserves existing record columns (regression couple)')
assert(/INSERT INTO spray_records[\s\S]{0,600}temperature, wind, humidity, soil_temp/.test(SPRAYS),
  'createSpray INSERT preserves the legacy wind free-text column (back-compat)')

// ── createSpray — product INSERT pins all five new product columns ───
section('createSpray — product INSERT pins new product snapshots')

assert(/INSERT INTO spray_products[\s\S]{0,600}epa_number_snapshot, active_ingredients_snapshot,\s*\n\s*product_cost_snapshot, product_cost_unit_snapshot, total_cost_snapshot/.test(SPRAYS),
  'createSpray product INSERT includes the five new spray_products columns')

// ── Best-effort catalog enrichment ───────────────────────────────────
section('Best-effort product_catalog enrichment — does not block save')

assert(/async function tryCatalogEnrich\(env, productCatalogId\)/.test(SPRAYS),
  'tryCatalogEnrich(env, productCatalogId) helper defined')

const enrichMatch = SPRAYS.match(/async function tryCatalogEnrich\(env, productCatalogId\)\s*\{[\s\S]*?\n\}/)
const enrichSrc   = enrichMatch ? enrichMatch[0] : ''
assert(enrichSrc.length > 0, 'tryCatalogEnrich body extracted')

assert(/if \(!productCatalogId\) return null/.test(enrichSrc),
  'helper short-circuits when no catalog id is supplied')
assert(/try \{[\s\S]{0,400}SELECT epa_number, active_ingredients_json\s*\n\s*FROM product_catalog WHERE id = \?/.test(enrichSrc),
  'helper SELECTs only epa_number + active_ingredients_json (no other catalog fields touched)')
assert(/} catch \{\s*\n[\s\S]{0,400}return null/.test(enrichSrc),
  'helper catches ALL catalog lookup failures and returns null (best-effort, never blocks save)')

// Enrichment is consulted ONLY when caller didn't supply both fields.
assert(/if \(\(epaSnap === null \|\| aiSnap === null\) && p\.productCatalogId\) \{[\s\S]{0,400}tryCatalogEnrich/.test(SPRAYS),
  'createSpray consults tryCatalogEnrich only when caller-supplied epa/ai are null AND productCatalogId is present')

// Caller-supplied values win — enrichment never overrides them.
assert(/let epaSnap\s*=\s*p\.epaNumberSnapshot\s*\?\?\s*null/.test(SPRAYS),
  'caller-supplied p.epaNumberSnapshot is the first preference for epaSnap')
assert(/let aiSnap\s*=\s*p\.activeIngredientsSnapshot\s*\?\?\s*null/.test(SPRAYS),
  'caller-supplied p.activeIngredientsSnapshot is the first preference for aiSnap')

// Cost is never enriched server-side (depends on course-current inventory).
assert(!/tryCatalogEnrich[\s\S]{0,400}cost/i.test(enrichSrc),
  'helper does NOT touch any cost field (cost is course-current; client owns it)')

// ── rowToRecord — new fields exposed, NULL-safe ──────────────────────
section('rowToRecord — new fields exposed in camelCase with ?? null fallbacks')

assert(/windSpeedMph:\s*row\.wind_speed_mph\s*\?\?\s*null/.test(SPRAYS),
  'rowToRecord exposes conditions.windSpeedMph')
assert(/windDirection:\s*row\.wind_direction\s*\?\?\s*null/.test(SPRAYS),
  'rowToRecord exposes conditions.windDirection')
assert(/applicatorLicense:\s*row\.applicator_license\s*\?\?\s*null/.test(SPRAYS),
  'rowToRecord exposes top-level applicatorLicense')
assert(/totalCostSnapshot:\s*row\.total_cost_snapshot\s*\?\?\s*null/.test(SPRAYS),
  'rowToRecord exposes top-level totalCostSnapshot')

for (const [api, col] of [
  ['epaNumberSnapshot',         'epa_number_snapshot'],
  ['activeIngredientsSnapshot', 'active_ingredients_snapshot'],
  ['productCostSnapshot',       'product_cost_snapshot'],
  ['productCostUnitSnapshot',   'product_cost_unit_snapshot'],
  ['totalCostSnapshot',         'total_cost_snapshot'],
]) {
  assert(new RegExp(`${api}:\\s*p\\.${col}\\s*\\?\\?\\s*null`).test(SPRAYS),
    `rowToRecord exposes products[i].${api} = p.${col} ?? null`)
}

// Legacy fields preserved on the read mapper (regression couple).
assert(/wind:\s*row\.wind,/.test(SPRAYS),
  'rowToRecord still exposes legacy conditions.wind (back-compat)')
assert(/temp:\s*row\.temperature,/.test(SPRAYS),
  'rowToRecord still exposes legacy conditions.temp')
assert(/humidity:\s*row\.humidity,/.test(SPRAYS),
  'rowToRecord still exposes legacy conditions.humidity')

// ── MUTABLE_RECORD_COLS — new fields PATCHable ───────────────────────
section('MUTABLE_RECORD_COLS — new record-level fields PATCHable')

for (const [api, col] of [
  ['applicatorLicense', 'applicator_license'],
  ['windSpeedMph',      'wind_speed_mph'],
  ['windDirection',     'wind_direction'],
  ['totalCostSnapshot', 'total_cost_snapshot'],
]) {
  assert(new RegExp(`${api}:\\s*'${col}'`).test(SPRAYS),
    `MUTABLE_RECORD_COLS includes { ${api}: '${col}' }`)
}

// updateSpray's conditions block now flattens windSpeedMph + windDirection.
assert(/body\.conditions\.windSpeedMph\s*!== undefined[\s\S]{0,200}sets\.push\('wind_speed_mph = \?'\)/.test(SPRAYS),
  "updateSpray conditions block flattens conditions.windSpeedMph → wind_speed_mph")
assert(/body\.conditions\.windDirection\s*!== undefined[\s\S]{0,200}sets\.push\('wind_direction = \?'\)/.test(SPRAYS),
  "updateSpray conditions block flattens conditions.windDirection → wind_direction")

// Legacy nested wind / temp / humidity flatten preserved (regression).
assert(/body\.conditions\.wind\s*!== undefined[\s\S]{0,200}sets\.push\('wind = \?'\)/.test(SPRAYS),
  "updateSpray still flattens conditions.wind → wind (legacy free-text)")

// ── BuildSpraySheet — applicator license + structured wind ───────────
section('BuildSpraySheet — applicator license + structured wind inputs')

// Initial draft has the new fields.
assert(/applicatorLicense:\s*['"]['"]/.test(BUILD),
  'makeEmptyDraft seeds applicatorLicense: ""')
assert(/conditions:\s*\{[\s\S]{0,400}windSpeedMph:\s*['"]['"][\s\S]{0,200}windDirection:\s*['"]['"]/.test(BUILD),
  'makeEmptyDraft seeds conditions.windSpeedMph / windDirection')

// Existing wind text field preserved.
assert(/wind:\s*['"]['"]/.test(BUILD),
  'makeEmptyDraft preserves legacy conditions.wind: ""')
assert(/<Field label="Wind">[\s\S]{0,400}value=\{draft\.conditions\.wind\}/.test(BUILD),
  'BuildSpraySheet preserves the existing <Field label="Wind"> free-text input')

// New structured wind fields.
assert(/<Field label="Wind speed \(mph\)">[\s\S]{0,400}value=\{draft\.conditions\.windSpeedMph\}/.test(BUILD),
  'BuildSpraySheet has <Field label="Wind speed (mph)"> bound to draft.conditions.windSpeedMph')
assert(/<Field label="Wind direction">[\s\S]{0,400}value=\{draft\.conditions\.windDirection\}/.test(BUILD),
  'BuildSpraySheet has <Field label="Wind direction"> bound to draft.conditions.windDirection')

// Wind direction options must include the spec list.
for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'Variable', 'Calm']) {
  assert(new RegExp(`['"]${dir}['"]`).test(BUILD),
    `WIND_DIRECTION_OPTS includes '${dir}'`)
}

// Applicator license input.
assert(/<Field label="Applicator license #">[\s\S]{0,400}value=\{draft\.applicatorLicense\}/.test(BUILD),
  'BuildSpraySheet has <Field label="Applicator license #"> bound to draft.applicatorLicense')

// Operator-change handler auto-fills license from crew profile when blank.
assert(/function handleOperatorChange\(name\)/.test(BUILD),
  'handleOperatorChange(name) helper defined')

const handlerMatch = BUILD.match(/function handleOperatorChange\(name\)\s*\{[\s\S]*?\n  \}/)
const handlerSrc   = handlerMatch ? handlerMatch[0] : ''
assert(handlerSrc.length > 0, 'handleOperatorChange body extracted')

assert(/const match = operatorOptions\.find\(opt => opt\.name === name\)/.test(handlerSrc),
  'handleOperatorChange looks up the operator in operatorOptions')
assert(/if \(!prev\.applicatorLicense\?\.trim\(\) && match\?\.pesticideLicense\)/.test(handlerSrc),
  'handler ONLY autofills license when current license is blank (manual edits win)')

// Operator dropdown + fallback input wired to the new handler.
assert(/onChange=\{e => handleOperatorChange\(e\.target\.value\)\}/.test(BUILD),
  'operator <select>/<input> wires onChange to handleOperatorChange')

// operatorOptions carries pesticideLicense for the autofill lookup.
assert(/pesticideLicense:\s*e\.pesticideLicense\s*\?\?\s*null/.test(BUILD),
  'operatorOptions map includes pesticideLicense (carried from crew API)')

// ── BuildSpraySheet — commit payload pins new fields ─────────────────
section('BuildSpraySheet — commit payload includes new fields')

// Record-level compliance + cost on the payload.
assert(/applicatorLicense:\s*draft\.applicatorLicense\?\.trim\(\)\s*\|\|\s*null/.test(BUILD),
  'payload.applicatorLicense = draft.applicatorLicense?.trim() || null (empty → null)')

assert(/windSpeedMph:\s*draft\.conditions\.windSpeedMph\s*\n?\s*\?\s*parseFloat\(draft\.conditions\.windSpeedMph\)\s*\n?\s*:\s*null/.test(BUILD),
  'payload.conditions.windSpeedMph = parseFloat(... || null)')

assert(/windDirection:\s*draft\.conditions\.windDirection\s*\|\|\s*null/.test(BUILD),
  'payload.conditions.windDirection = draft.conditions.windDirection || null')

// Record-level total cost is computed from enrichedRows.
assert(/const recordTotalCost = enrichedRows\.reduce\([\s\S]{0,200}r\.cost/.test(BUILD),
  'payload computes recordTotalCost = enrichedRows.reduce by r.cost')
assert(/totalCostSnapshot:\s*recordTotalCost > 0\s*\?\s*\+recordTotalCost\.toFixed\(2\)\s*:\s*null/.test(BUILD),
  'payload.totalCostSnapshot = recordTotalCost > 0 ? round : null (no misleading $0)')

// Per-product payload includes the snapshot triple.
assert(/productCatalogId:\s*r\.intel\?\.catalogId\s*\?\?\s*null/.test(BUILD),
  'product payload includes productCatalogId = r.intel?.catalogId ?? null (for server enrichment)')
assert(/activeIngredientsSnapshot:\s*r\.intel\?\.activeIngredientSummary\s*\?\?\s*null/.test(BUILD),
  'product payload includes activeIngredientsSnapshot = r.intel?.activeIngredientSummary ?? null')
assert(/productCostSnapshot:\s*r\.inv\?\.costPerUnit\s*\?\?\s*null/.test(BUILD),
  'product payload includes productCostSnapshot = r.inv?.costPerUnit ?? null')
assert(/productCostUnitSnapshot:\s*r\.inv\?\.unit\s*\?\?\s*null/.test(BUILD),
  'product payload includes productCostUnitSnapshot = r.inv?.unit ?? null')
assert(/totalCostSnapshot:\s*typeof r\.cost === 'number'\s*\?\s*r\.cost\s*:\s*null/.test(BUILD),
  'product payload includes totalCostSnapshot = typeof r.cost === "number" ? r.cost : null')

// Existing payload fields preserved (regression couple).
assert(/applicator:\s*draft\.operator/.test(BUILD),
  'payload.applicator = draft.operator (regression — legacy alias preserved)')
assert(/rei:\s*summary\.maxRei/.test(BUILD),
  'payload.rei = summary.maxRei (regression)')

// ── SprayRecords detail view — new fields surface when present ───────
section('SprayRecords detail view — applicator license + cost + structured wind + per-product compliance')

// License renders ONLY when selected.applicatorLicense is truthy.
assert(/\{selected\.applicatorLicense\s*&&\s*\(\s*\n?\s*<div className=\{styles\.modalField\}>\s*\n?\s*<span className=\{styles\.modalFieldLabel\}>Applicator License #/.test(RECORDS),
  'SprayRecords renders Applicator License # only when populated (clean old records)')

// Total cost renders ONLY when present (and != null).
assert(/\{selected\.totalCostSnapshot != null\s*&&\s*\(\s*\n?\s*<div className=\{styles\.modalField\}>\s*\n?\s*<span className=\{styles\.modalFieldLabel\}>Estimated Cost/.test(RECORDS),
  'SprayRecords renders Estimated Cost only when totalCostSnapshot != null')

// Structured wind renders ONLY when one of the structured fields is populated.
assert(/\(selected\.conditions\.windSpeedMph != null \|\| selected\.conditions\.windDirection\)/.test(RECORDS),
  'SprayRecords renders structured Wind cell only when speed OR direction is populated')

// Per-product row builds compliance parts conditionally.
assert(/const complianceParts = \[\]/.test(RECORDS),
  'per-product row builds complianceParts array (only non-blank pieces appended)')
assert(/if \(p\.epaNumberSnapshot\)\s*complianceParts\.push\(`EPA \$\{p\.epaNumberSnapshot\}`\)/.test(RECORDS),
  'per-product row appends "EPA <number>" when epaNumberSnapshot is present')
assert(/if \(p\.activeIngredientsSnapshot\)\s*complianceParts\.push\(p\.activeIngredientsSnapshot\)/.test(RECORDS),
  'per-product row appends activeIngredientsSnapshot when present')
assert(/if \(p\.totalCostSnapshot != null\)\s*complianceParts\.push\(`\$\$\{p\.totalCostSnapshot\.toFixed\(2\)\}`\)/.test(RECORDS),
  'per-product row appends $<cost> when totalCostSnapshot is populated')

// Existing layout preserved (regression couples).
assert(/<h3 className=\{styles\.modalSectionTitle\}>Product\{selected\.products\.length > 1 \? 's' : ''\}<\/h3>/.test(RECORDS),
  'Product(s) section title preserved')
assert(/<span className=\{styles\.modalFieldLabel\}>Carrier Volume<\/span>/.test(RECORDS),
  'Carrier Volume label preserved')

// ── product_catalog schema untouched ──────────────────────────────────
section('product_catalog schema untouched')

assert(!/ALTER TABLE product_catalog/i.test(MIG),
  '0052 does not ALTER product_catalog')

const catalogMig = readFileSync('worker/migrations/0043_product_catalog.sql', 'utf8')
assert(catalogMig.includes('CREATE TABLE IF NOT EXISTS product_catalog'),
  '0043_product_catalog.sql still creates product_catalog (no schema change)')
assert(!catalogMig.includes('Phase S.3'),
  '0043_product_catalog.sql carries no Phase S.3 edits')

const catalogApi = readFileSync('worker/api/productCatalog.js', 'utf8')
assert(!catalogApi.includes('Phase S.3'),
  'worker/api/productCatalog.js carries no Phase S.3 edits')

// ── Phase S.2 spray-program permissions preserved ────────────────────
section('Phase S.2 spray-program permission rules preserved verbatim')

const PERM = readFileSync('worker/lib/mutationPermissions.js', 'utf8')
assert(/\['\/api\/spray-programs',\s*'canEditSprays'\]/.test(PERM),
  "regression: ['/api/spray-programs', 'canEditSprays'] preserved")
assert(/\['\/api\/spray-program-items',\s*'canEditSprays'\]/.test(PERM),
  "regression: ['/api/spray-program-items', 'canEditSprays'] preserved")
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  "regression: ['/api/sprays', 'canEditSprays'] preserved")
assert(!PERM.includes('Phase S.3'),
  'worker/lib/mutationPermissions.js carries no Phase S.3 edits')

// ── No DAB / kiosk / Task Library edits ──────────────────────────────
section('No DAB / kiosk / Task Library / translation edits')

for (const path of [
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.module.css',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
  'src/pages/Crew/tabs/TasksManagerModal.jsx',
  'src/utils/translate/translateClient.js',
  'src/utils/tasks/taskTemplateStore.js',
  'worker/api/taskTemplates.js',
  'worker/api/assignments.js',
  'worker/api/operationsNotes.js',
  'worker/api/alerts.js',
  'worker/api/crew.js',
  'worker/lib/translate.js',
  'worker/lib/autoTranslate.js',
  'wrangler.jsonc',
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/utils/sprayPrograms/sprayProgramStore.js',
  'src/utils/productCatalog/productCatalogStore.js',
  'src/utils/sprays/spraysStore.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.3'),
    `${path} carries no Phase S.3 edits`)
}

// ── Migrations ledger — 0052 is the new ceiling ──────────────────────
section('Migrations ledger — 0052 ceiling')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0052_spray_compliance_snapshots.sql'),
  '0052_spray_compliance_snapshots.sql present in worker/migrations')
const past0052 = migrationFiles.filter(f => /^00(5[4-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0052.length === 0,
  `no migration past 0053 (found: ${past0052.join(', ') || 'none'})`)

// ── Spray-schema regression couples — original tables intact ─────────
section('Spray schema regression couples — old migrations unchanged')

const m0006 = readFileSync('worker/migrations/0006_sprays.sql', 'utf8')
assert(/CREATE TABLE IF NOT EXISTS spray_records/.test(m0006),
  '0006_sprays.sql still creates spray_records')
assert(/CREATE TABLE IF NOT EXISTS spray_products/.test(m0006),
  '0006_sprays.sql still creates spray_products')
assert(!m0006.includes('Phase S.3'),
  '0006_sprays.sql carries no Phase S.3 edits')

const m0044 = readFileSync('worker/migrations/0044_spray_programs.sql', 'utf8')
assert(!m0044.includes('Phase S.3'),
  '0044_spray_programs.sql carries no Phase S.3 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
