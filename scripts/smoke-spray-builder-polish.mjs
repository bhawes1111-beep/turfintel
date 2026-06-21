// Phase S.5b.1 — Spray Builder UX cleanup smoke.
//
//   node scripts/smoke-spray-builder-polish.mjs
//
// Pins:
//   • Draft-saved indicator (state + render + reset paths).
//   • End Time draft field + input + commit payload key.
//   • Soil Temperature conditions field + input + commit payload key.
//   • Wind / conditions notes relabel without dropping the data column.
//   • All existing S.3 / S.5a.1 / S.5c.* invariants preserved.
//   • No worker, no migration, no product catalog writes.

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

const BUILD    = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',         'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',                 'utf8')
const MODAL    = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx',    'utf8')
const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',            'utf8')
const STORE    = readFileSync('src/utils/sprays/spraysStore.js',                  'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                             'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                     'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',                'utf8')

const BUILD_CODE = stripComments(BUILD)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

// ── makeEmptyDraft extended with endTime + soilTemp ─────────────────
section('makeEmptyDraft — endTime + conditions.soilTemp added')

assert(/endTime:\s*['"]['"]/.test(BUILD),
  "makeEmptyDraft includes endTime: ''")
assert(/conditions:\s*\{[\s\S]{0,200}soilTemp:\s*['"]['"]/.test(BUILD),
  "makeEmptyDraft includes conditions.soilTemp: ''")
// Negative pin: doesn't disturb existing fields.
assert(/conditions:\s*\{[\s\S]{0,200}temp:\s*['"]['"][\s\S]{0,200}wind:\s*['"]['"][\s\S]{0,200}windSpeedMph:\s*['"]['"][\s\S]{0,200}windDirection:\s*['"]['"][\s\S]{0,200}humidity:\s*['"]['"][\s\S]{0,200}soilTemp:\s*['"]['"]/.test(BUILD),
  'conditions block keeps the original 5 keys + appends soilTemp')

// ── End Time input wired ────────────────────────────────────────────
section('End Time input — JSX + patchDraft binding')

assert(/<Field label="Start time">/.test(BUILD),
  '"Time of application" label renamed to "Start time" for symmetry with End time')
assert(/<Field label="End time">[\s\S]{0,400}type="time"[\s\S]{0,400}value=\{draft\.endTime\}[\s\S]{0,400}onChange=\{e => patchDraft\(\{ endTime: e\.target\.value \}\)\}/.test(BUILD),
  '<Field label="End time"> bound to draft.endTime via patchDraft')

// ── Soil Temperature input wired ────────────────────────────────────
section('Soil Temperature input — JSX + patchConditions binding')

assert(/<Field label="Soil temperature \(°F\)">[\s\S]{0,400}value=\{draft\.conditions\.soilTemp\}[\s\S]{0,400}onChange=\{e => patchConditions\(\{ soilTemp: e\.target\.value \}\)\}/.test(BUILD),
  '<Field label="Soil temperature (°F)"> bound to draft.conditions.soilTemp via patchConditions')

// ── Wind cleanup — relabel preserves the data column ────────────────
section('Wind / conditions notes — relabeled but data column preserved')

assert(/<Field label="Wind \/ conditions notes">[\s\S]{0,400}value=\{draft\.conditions\.wind\}/.test(BUILD),
  'free-text wind input relabeled "Wind / conditions notes" but still bound to draft.conditions.wind')

// Structured wind speed + direction still primary.
assert(/<Field label="Wind speed \(mph\)">[\s\S]{0,400}value=\{draft\.conditions\.windSpeedMph\}/.test(BUILD),
  'structured wind speed input preserved')
assert(/<Field label="Wind direction">[\s\S]{0,400}value=\{draft\.conditions\.windDirection\}/.test(BUILD),
  'structured wind direction input preserved')

// Negative pin: the bare "Wind" label is gone (replaced by the
// clearer label). Catches a future regression that quietly reverts.
assert(!/<Field label="Wind">/.test(BUILD),
  'bare "Wind" label removed in favor of "Wind / conditions notes"')

// ── Commit payload — endTime + conditions.soilTemp included ─────────
section('Commit payload — endTime + soilTemp sent through createSpray')

// Locate the createSpray payload block by anchoring on `applicationName`.
const payloadMatch = BUILD.match(/const payload = \{[\s\S]*?\n\s{6}\}/)
const payloadSrc   = payloadMatch ? payloadMatch[0] : ''
assert(payloadSrc.length > 0, 'commit payload block extracted')

assert(/endTime:\s*draft\.endTime \|\| null/.test(payloadSrc),
  'commit payload includes endTime: draft.endTime || null')
assert(/soilTemp:\s*draft\.conditions\.soilTemp\s*\?\s*parseFloat\(draft\.conditions\.soilTemp\)\s*:\s*null/.test(payloadSrc),
  'commit payload includes conditions.soilTemp parsed to float or null')

// Existing payload fields preserved (regression couples).
for (const key of [
  'date',
  'startTime',
  'applicator',
  'applicatorLicense',
  'status:\\s*[\'"]completed[\'"]',
  'totalCostSnapshot',
  'notes',
  'products:',
]) {
  assert(new RegExp(key).test(payloadSrc),
    `commit payload still includes existing key: ${key}`)
}

// Conditions block still carries the legacy + structured fields.
assert(/conditions:\s*\{[\s\S]{0,800}temp:[\s\S]{0,400}wind:[\s\S]{0,400}windSpeedMph:[\s\S]{0,400}windDirection:[\s\S]{0,400}humidity:[\s\S]{0,400}soilTemp:/.test(payloadSrc),
  'commit payload.conditions includes temp / wind / windSpeedMph / windDirection / humidity / soilTemp')

// ── Worker model supports both fields (regression couples) ──────────
section('Worker model — endTime + soilTemp supported in existing schema')

// MUTABLE_RECORD_COLS already maps endTime → end_time + soil_temp
// support exists in the conditions branch.
assert(/endTime:\s*['"]end_time['"]/.test(SPRAYS_W),
  'worker MUTABLE_RECORD_COLS maps endTime → end_time (no schema change needed)')
assert(/body\.conditions\.soilTemp[\s\S]{0,200}sets\.push\('soil_temp = \?'\)/.test(SPRAYS_W),
  'worker updateSpray accepts conditions.soilTemp (no schema change needed)')
// createSpray INSERT carries end_time + soil_temp columns.
assert(/INSERT INTO spray_records[\s\S]{0,800}spray_date, start_time, end_time, status[\s\S]{0,400}temperature, wind, humidity, soil_temp/.test(SPRAYS_W),
  'worker createSpray INSERT carries end_time + soil_temp columns (S.3 baseline)')

// ── EditSprayRecordModal still has the matching fields ──────────────
section('EditSprayRecordModal — endTime + soilTemp inputs preserved')

assert(/setField\(['"]endTime['"]/.test(MODAL),
  'edit modal still wires endTime field (S.5a.1 regression couple)')
assert(/setField\(['"]soilTemp['"]/.test(MODAL),
  'edit modal still wires soilTemp field (S.5a.1 regression couple)')

// ── Draft saved indicator ───────────────────────────────────────────
section('Draft saved indicator — state + autosave update + render + reset')

// State.
assert(/const \[draftSavedAt, setDraftSavedAt\] = useState\(null\)/.test(BUILD),
  'draftSavedAt state defined via useState(null)')

// Autosave effect updates the timestamp after a successful write.
const effMatch = BUILD.match(/useEffect\(\(\) => \{\s*\n\s*if \(typeof localStorage === 'undefined'\) return[\s\S]*?\n\s{2}\}, \[draft\]\)/)
const effSrc   = effMatch ? effMatch[0] : ''
assert(effSrc.length > 0, 'autosave effect body extracted')
assert(/localStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(draft\)\)/.test(effSrc),
  'autosave still writes to localStorage')
assert(/setDraftSavedAt\(new Date\(\)\)/.test(effSrc),
  'autosave sets draftSavedAt = new Date() after a successful write')
// Synchronous write — no "saving…" spinner state.
assert(!/setDraftSaving|saving:\s*true/.test(effSrc),
  'autosave does NOT introduce a "saving" in-flight state (localStorage is synchronous)')

// Render — green pill / amber unsaved-changes pill.
assert(/<span className=\{styles\.naDraftSavedHint\} aria-live="polite">/.test(BUILD),
  'draft saved indicator renders with aria-live="polite"')
assert(/Draft saved locally at \$\{draftSavedAt\.toLocaleTimeString/.test(BUILD),
  'indicator surfaces formatted local time when draftSavedAt is set')
assert(/'Unsaved changes'/.test(BUILD),
  'indicator surfaces "Unsaved changes" when draftSavedAt is null')

// Reset paths.
assert(/function clearDraft\(\)[\s\S]{0,500}setDraftSavedAt\(null\)/.test(BUILD),
  'clearDraft() resets draftSavedAt to null')
// The commit reset is preceded by a Phase S.5b.1 comment. Loose match.
assert(/setDraft\(makeEmptyDraft\(\)\)[\s\S]{0,200}setDraftSavedAt\(null\)/.test(BUILD),
  'commit pipeline resets draftSavedAt after a successful commit')

// CSS for the indicator + flex-wrap on action row.
assert(/\.naDraftSavedHint\s*\{/.test(CSS),
  'CSS .naDraftSavedHint rule defined')
assert(/\.naActionRow\s*\{[\s\S]{0,400}flex-wrap:\s*wrap/.test(CSS),
  '.naActionRow has flex-wrap: wrap so the indicator drops to its own line on narrow viewports')

// ── Snapshot integrity + product/inventory regression ──────────────
section('Snapshot integrity + product/inventory pipeline unchanged')

// Product row mapper — EPA is enriched server-side from productCatalogId
// (no direct client-side epaNumberSnapshot field), but the builder
// still sends the catalog id + AI summary + cost snapshots.
assert(/productCatalogId:\s*r\.intel\?\.catalogId/.test(BUILD),
  'commit payload products still pass productCatalogId so the worker can enrich EPA (S.3)')
assert(/activeIngredientsSnapshot:\s*r\.intel\?\.activeIngredientSummary/.test(BUILD),
  'commit payload products still carry activeIngredientsSnapshot (S.3)')
assert(/productCostSnapshot:\s*r\.inv\?\.costPerUnit/.test(BUILD),
  'commit payload products still carry productCostSnapshot (S.3)')
assert(/totalCostSnapshot:\s*typeof r\.cost === 'number'/.test(BUILD),
  'commit payload products still carry totalCostSnapshot (S.3)')

// Inventory deduction pipeline still wired.
assert(/recordInventoryUsage\(\{/.test(BUILD),
  'commit pipeline still calls recordInventoryUsage per product (regression)')

// REI alert + calendar event creation still wired.
assert(/createCalendarEvent\(/.test(BUILD),
  'commit still creates a calendar event (regression)')
assert(/createAlert\(/.test(BUILD),
  'commit still creates an REI alert when summary.maxRei > 0 (regression)')

// ── Records — edit modal + filters + exports preserved ─────────────
section('SprayRecords surfaces preserved (regression couples)')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords still imports EditSprayRecordModal (S.5a.1)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportPacketBtn\}/.test(RECORDS),
  'Export Compliance Packet button still rendered (S.5c.2)')
assert(/<button[\s\S]{0,400}className=\{styles\.exportUsageBtn\}/.test(RECORDS),
  'Export Product Usage button still rendered (S.5c.3)')
for (const dep of ['effStart', 'effEnd', 'applicatorFilter', 'productFilter', 'needsInfoOnly']) {
  assert(RECORDS.includes(dep),
    `S.5c.1 filter input still wired: ${dep}`)
}

// Edit modal snapshot exclusion still in place.
const editPayloadMatch = MODAL.match(/function buildPatchPayload\(formState\)\s*\{[\s\S]*?\n\}/)
const editPayloadSrc   = editPayloadMatch ? editPayloadMatch[0] : ''
for (const snap of [
  'epaNumberSnapshot', 'activeIngredientsSnapshot',
  'productCostSnapshot', 'productCostUnitSnapshot', 'totalCostSnapshot',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(editPayloadSrc),
    `edit modal buildPatchPayload still does NOT echo ${snap}`)
}

// ── Scope guards ────────────────────────────────────────────────────
section('Scope guards — no worker / migration / catalog / store edits')

// Worker side unchanged.
for (const path of [
  'worker/index.js',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5b.1'),
    `${path} carries no Phase S.5b.1 edits`)
}

// Product catalog still read-only.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js still exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// Worker permission rule unchanged.
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES still gates /api/sprays by canEditSprays")

// Spray store untouched.
assert(!STORE.includes('Phase S.5b.1'),
  'src/utils/sprays/spraysStore.js carries no Phase S.5b.1 edits')

// Other spray surfaces untouched.
for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/EditSprayRecordModal.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'src/pages/Spray/tabs/SprayProgramCalendar.jsx',
  'src/pages/Spray/tabs/MixCalculator.jsx',
  'src/pages/Spray/tabs/ProgramIntelligence.jsx',
  'src/pages/Spray/tabs/SprayWorkspace.jsx',
  'src/pages/Spray/tabs/SprayCalendar.jsx',
  'src/pages/Spray/tabs/SprayOverview.jsx',
  'src/pages/Spray/tabs/PlannedPrograms.jsx',
  'src/pages/Spray/tabs/SprayReports.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase S.5b.1'),
    `${path} carries no Phase S.5b.1 edits`)
}

// ── Cross-vertical guards ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5b.1'),   'DAB carries no Phase S.5b.1 edits')
assert(!KIOSK.includes('Phase S.5b.1'), 'kiosk carries no Phase S.5b.1 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
