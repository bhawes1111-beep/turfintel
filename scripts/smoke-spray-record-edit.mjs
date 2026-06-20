// Phase S.5a.1 — Edit Saved Spray Records smoke.
//
//   node scripts/smoke-spray-record-edit.mjs
//
// Pins the new EditSprayRecordModal component + Records-list / detail-
// modal entry points + the safety invariants required by the spec:
//
//   • Snapshot fields (EPA #, active ingredients, product cost,
//     product cost unit, total cost snapshots) are NEVER sent in
//     the PATCH body.
//   • Product rows are read-only with a clear "later phase" notice.
//   • No new worker endpoint added — uses the existing patchSpray
//     store helper which targets PATCH /api/sprays/:id.
//   • No D1 migration.
//   • No product catalog write code added.
//   • Worker mutation permissions unchanged.
//   • BuildSpraySheet / SprayProgramPlanner / MixCalculator carry
//     no Phase S.5a.1 edits.

import { readFileSync, readdirSync } from 'fs'
import {
  isMutationAllowed,
  matchRule,
} from '../worker/lib/mutationPermissions.js'

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

const MODAL    = readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx', 'utf8')
const RECORDS  = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',         'utf8')
const STORE    = readFileSync('src/utils/sprays/spraysStore.js',               'utf8')
const SPRAYS_W = readFileSync('worker/api/sprays.js',                          'utf8')
const PC_W     = readFileSync('worker/api/productCatalog.js',                  'utf8')
const PERM     = readFileSync('worker/lib/mutationPermissions.js',             'utf8')
const SHELL    = readFileSync('src/pages/Spray/Spray.jsx',                     'utf8')
const CSS      = readFileSync('src/pages/Spray/Spray.module.css',              'utf8')

const MODAL_CODE = stripComments(MODAL)

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// ── EditSprayRecordModal component shape ────────────────────────────
section('EditSprayRecordModal — component + signature')

assert(/export default function EditSprayRecordModal\(\{ record, onClose, onSaved \}\)/.test(MODAL),
  'EditSprayRecordModal exported with ({ record, onClose, onSaved }) signature')
assert(/role="dialog"/.test(MODAL),
  'modal carries role="dialog" + aria-modal for screen readers')
assert(/aria-label="Edit spray record"/.test(MODAL),
  'modal has aria-label="Edit spray record"')

// Title + subtitle surface the record context.
assert(/<h2 className=\{styles\.modalTitle\}>Edit Spray Record<\/h2>/.test(MODAL),
  'modal title reads "Edit Spray Record"')
assert(/record\.products[\s\S]{0,200}record\.date/.test(MODAL),
  'modal subtitle surfaces product names + record date')

// ── Editable fields are present ─────────────────────────────────────
section('Editable fields — application details, weather, notes')

for (const field of [
  'date', 'startTime', 'endTime', 'applicator', 'applicatorLicense',
  'targetPest', 'status', 'notes',
  'temp', 'wind', 'windSpeedMph', 'windDirection', 'humidity', 'soilTemp',
]) {
  assert(new RegExp(`setField\\(['"]${field}['"]`).test(MODAL),
    `editable field "${field}" wired via setField`)
}

// Status options match the worker enum.
for (const s of ['completed', 'in-progress', 'planned', 'pending-review']) {
  assert(new RegExp(`value:\\s*['"]${s}['"]`).test(MODAL),
    `STATUS_OPTIONS includes "${s}"`)
}

// Wind direction is a select with the 8 cardinal directions.
assert(/WIND_DIRECTIONS\s*=\s*\['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'\]/.test(MODAL),
  'wind direction dropdown carries the 8 cardinal directions')

// Required date validation.
assert(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(MODAL),
  'date validated against /^\\d{4}-\\d{2}-\\d{2}$/')
assert(/\/\^\\d\{2\}:\\d\{2\}\$\//.test(MODAL),
  'time validated against /^\\d{2}:\\d{2}$/ (HH:MM)')

// ── Snapshot preservation — never sent in PATCH ─────────────────────
section('Snapshot preservation — buildPatchPayload never echoes snapshot fields')

assert(/function buildPatchPayload\(formState\)/.test(MODAL),
  'pure helper buildPatchPayload(formState) defined for testability')

// Negative pins: payload body contains none of the snapshot field keys.
const payloadMatch = MODAL.match(/function buildPatchPayload\(formState\)\s*\{[\s\S]*?\n\}/)
const payloadSrc   = payloadMatch ? payloadMatch[0] : ''
assert(payloadSrc.length > 0, 'buildPatchPayload body extracted')

for (const snap of [
  'epaNumberSnapshot',
  'activeIngredientsSnapshot',
  'productCostSnapshot',
  'productCostUnitSnapshot',
  'totalCostSnapshot',
  'rei',         // computed at write — never sent in PATCH from edit modal
  'phi',
]) {
  assert(!new RegExp(`\\b${snap}\\b`).test(payloadSrc),
    `buildPatchPayload does NOT include ${snap} (frozen at write)`)
}

// Per-product snapshot keys also never sent.
for (const snap of ['epaNumber', 'activeIngredients', 'productCatalogId', 'inventoryItemId']) {
  assert(!new RegExp(`\\b${snap}\\b`).test(payloadSrc),
    `buildPatchPayload does NOT echo per-product snapshot key "${snap}"`)
}

// Positive pin — payload carries only the allowed editable fields.
for (const key of [
  'date', 'startTime', 'endTime', 'applicator', 'applicatorLicense',
  'targetPest', 'status', 'notes',
]) {
  assert(new RegExp(`${key}:\\s*formState\\.${key}`).test(payloadSrc),
    `buildPatchPayload echoes editable field "${key}"`)
}

// Conditions object includes the 6 worker-supported sub-keys.
assert(/conditions:\s*\{[\s\S]{0,800}temp:[\s\S]{0,800}wind:[\s\S]{0,800}windSpeedMph:[\s\S]{0,800}windDirection:[\s\S]{0,800}humidity:[\s\S]{0,800}soilTemp:/.test(payloadSrc),
  'payload.conditions carries temp / wind / windSpeedMph / windDirection / humidity / soilTemp')

// ── Product mix is read-only ────────────────────────────────────────
section('Product mix — read-only in this phase')

assert(/Product mix \(read-only\)/.test(MODAL),
  'product section header reads "Product mix (read-only)"')
// Phase S.7c — Product mix copy now points to the full spray sheet's
// Edit chemicals action (chemical editing shipped in S.7b.2/3/4/5/6).
assert(/Product mix edits live in the full spray sheet's <strong>Edit chemicals<\/strong> action/.test(MODAL),
  'product mix copy points to full sheet Edit chemicals action (S.7c rewrite)')

// Negative pin — the modal never mutates product rows.
assert(!/setField\(['"]products['"]/.test(MODAL_CODE),
  'modal does not call setField("products", ...) — products are not editable')
assert(!/setProducts|patchProductRow|removeProductRow/.test(MODAL_CODE),
  'modal does not define product-row mutators')

// ── Store helper / API helper behavior ──────────────────────────────
section('patchSpray — existing store helper, no new endpoint added')

assert(/import \{ patchSpray, refreshSpraysData \} from '\.\.\/\.\.\/\.\.\/utils\/sprays\/spraysStore'/.test(MODAL),
  'modal imports the existing patchSpray + refreshSpraysData helpers')
assert(/await patchSpray\(record\.id, payload\)/.test(MODAL),
  'modal Save calls patchSpray(record.id, payload)')

// patchSpray itself targets the existing PATCH /api/sprays/:id route.
assert(/export async function patchSpray\(id, updates\)/.test(STORE),
  'patchSpray(id, updates) still defined in the spray store')
assert(/method:\s*'PATCH'/.test(STORE),
  'patchSpray uses PATCH method')
assert(/`\$\{API\}\/\$\{encodeURIComponent\(id\)\}`/.test(STORE),
  'patchSpray targets /api/sprays/:id (existing endpoint)')

// Worker side: updateSpray endpoint exists + accepts only its
// MUTABLE_RECORD_COLS whitelist (snapshots not in the list).
assert(/export async function updateSpray\(env, id, request\)/.test(SPRAYS_W),
  'worker updateSpray exported (regression couple)')
assert(/MUTABLE_RECORD_COLS\s*=\s*\{/.test(SPRAYS_W),
  'worker whitelists mutable fields via MUTABLE_RECORD_COLS')

// Worker mutation rule unchanged — sprays still gated by canEditSprays.
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  "MUTATION_RULES gates /api/sprays by canEditSprays (regression couple)")
assert(matchRule('/api/sprays/spray-abc-123') === 'canEditSprays',
  "matchRule('/api/sprays/<id>') === 'canEditSprays'")

const SUPER = { role: 'superintendent' }
const CREW  = { role: 'crew' }
assert(isMutationAllowed(SUPER, '/api/sprays/spray-abc-123', 'PATCH') === true,
  'PATCH /api/sprays/:id allowed for superintendent')
assert(isMutationAllowed(CREW, '/api/sprays/spray-abc-123', 'PATCH') === false,
  'PATCH /api/sprays/:id denied for crew (worker-enforced)')

// ── No product catalog write code added ─────────────────────────────
section('Product catalog — read-only (S.5a.1 explicitly scoped out)')

assert(!/createProductCatalog|updateProductCatalog|deleteProductCatalog/.test(MODAL_CODE),
  'EditSprayRecordModal does not call any product catalog write helper')
assert(!/createProductCatalog|updateProductCatalog|deleteProductCatalog/.test(SPRAYS_W),
  'worker/api/sprays.js does not call any product catalog write helper')

// Worker product catalog file still has only read endpoints — no new
// write functions added.
const pcExports = (PC_W.match(/^export async function (\w+)/gm) ?? [])
  .map(line => line.replace('export async function ', ''))
assert(pcExports.includes('listProductCatalog'),
  'productCatalog.js still exports listProductCatalog (regression)')
assert(pcExports.includes('getProductCatalog'),
  'productCatalog.js still exports getProductCatalog (regression)')
const pcWrites = pcExports.filter(name => /^(create|update|delete)/.test(name))
assert(pcWrites.length === 0,
  `productCatalog.js exports NO write helpers (got: ${pcWrites.join(', ') || 'none'})`)

// ── SprayRecords integration ────────────────────────────────────────
section('SprayRecords — Edit button on each card + on detail modal')

assert(/import EditSprayRecordModal from '\.\/EditSprayRecordModal'/.test(RECORDS),
  'SprayRecords imports EditSprayRecordModal')
assert(/const \[editing, setEditing\]\s*=\s*useState\(null\)/.test(RECORDS),
  'SprayRecords tracks editing target via useState(null)')

// Card-row Edit button — stopPropagation prevents detail modal trigger.
assert(/<button[\s\S]{0,400}className=\{styles\.recordEditBtn\}[\s\S]{0,400}onClick=\{e => \{ e\.stopPropagation\(\); setEditing\(r\) \}\}/.test(RECORDS),
  'record card Edit button calls e.stopPropagation() then setEditing(r)')
assert(/aria-label=\{`Edit spray record from \$\{r\.date\}`\}/.test(RECORDS),
  'card Edit button has a per-row aria-label')

// Detail-modal Edit button — opens editor + closes detail.
assert(/setEditing\(selected\); setSelected\(null\)/.test(RECORDS),
  'detail modal Edit button: setEditing(selected) + setSelected(null) (single flow)')

// EditSprayRecordModal mounts when `editing` is truthy.
assert(/\{editing && \(\s*\n\s*<EditSprayRecordModal/.test(RECORDS),
  '<EditSprayRecordModal> mounts behind {editing && (...)}')
assert(/record=\{editing\}/.test(RECORDS),
  'EditSprayRecordModal receives record={editing}')
assert(/onClose=\{\(\) => setEditing\(null\)\}/.test(RECORDS),
  'EditSprayRecordModal onClose clears editing state')

// CSS class for the record-card Edit button.
assert(/\.recordEditBtn\s*\{/.test(CSS),
  'CSS .recordEditBtn rule defined')

// ── Modal form CSS classes ──────────────────────────────────────────
section('Modal CSS — form layout + footer + mobile breakpoint')

for (const cls of [
  'editFieldGrid', 'editField', 'editFieldWide', 'editNotes',
  'editHint', 'editProductList', 'editProductRow',
  'modalFooter', 'modalPrimaryBtn', 'modalSecondaryBtn',
]) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(CSS),
    `CSS .${cls} rule defined`)
}

// Mobile (≤ 600px) collapses the form grid + stretches footer buttons.
const mobileMatch = CSS.match(/@media \(max-width:\s*600px\)\s*\{[\s\S]*?\.editFieldGrid[\s\S]*?\n\}/)
assert(mobileMatch !== null,
  'Spray.module.css has a mobile block that re-styles .editFieldGrid')
assert(/\.editFieldGrid\s*\{\s*grid-template-columns:\s*1fr;?\s*\}/.test(CSS),
  'mobile .editFieldGrid collapses to a single column')

// ── Builder calculations + program planner + workspace untouched ────
section('Out-of-scope surfaces carry no Phase S.5a.1 edits')

for (const path of [
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
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
  assert(!src.includes('Phase S.5a.1'),
    `${path} carries no Phase S.5a.1 edits`)
}

// Spray.jsx (the shell) wasn't touched either — the modal lives in
// SprayRecords.jsx render branch.
assert(!SHELL.includes('Phase S.5a.1'),
  'Spray.jsx shell carries no Phase S.5a.1 edits')

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
  assert(!src.includes('Phase S.5a.1'),
    `${path} carries no Phase S.5a.1 edits`)
}

// Spray stores untouched (we used the existing patchSpray).
const PROGRAM_STORE = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
assert(!STORE.includes('Phase S.5a.1'),
  'src/utils/sprays/spraysStore.js carries no Phase S.5a.1 edits')
assert(!PROGRAM_STORE.includes('Phase S.5a.1'),
  'src/utils/sprayPrograms/sprayProgramStore.js carries no Phase S.5a.1 edits')

// ── DAB + kiosk untouched ───────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.5a.1'),   'DAB carries no Phase S.5a.1 edits')
assert(!KIOSK.includes('Phase S.5a.1'), 'kiosk carries no Phase S.5a.1 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
