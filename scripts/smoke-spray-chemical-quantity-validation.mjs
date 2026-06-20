// Phase S.7b.5 — Chemical editor quantity validation + inventory-
// deduction UX smoke.
//
//   node scripts/smoke-spray-chemical-quantity-validation.mjs
//
// Pins:
//   • rowStatus(r) helper categorizes each draft row into one of:
//     no-link / qty-blank / qty-invalid / qty-nonpositive / ok.
//   • Save handler blocks on qty-blank, qty-invalid, qty-nonpositive
//     with specific toast copy (not generic "blank").
//   • Per-row status line renders one message at a time, distinguishes
//     blank vs zero vs valid, and surfaces live on-hand stock when
//     valid.
//   • Out-of-stock + insufficient-stock sub-warnings render when the
//     picker's inventory item lookup returns 0 or < qty.
//   • Worker rejects inventoryItemId + quantityUsed <= 0 (400) so the
//     server is also the source of truth.
//   • Worker still accepts inventoryItemId + quantityUsed > 0.
//   • Picker selection does NOT default quantityUsed (existing draft
//     value preserved; new rows seed as '').
//   • Save payload still includes the full S.7b.3 picker fields.
//   • Inventory reversal/reapply pipeline still wired.
//   • Build Spray commit path unchanged.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SHEET      = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',     'utf8')
const SHEET_CSS  = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css','utf8')
const PICKER     = readFileSync('src/pages/Spray/tabs/SprayProductPicker.jsx',             'utf8')
const SPRAYS_W   = readFileSync('worker/api/sprays.js',                                    'utf8')
const PERM       = readFileSync('worker/lib/mutationPermissions.js',                       'utf8')
const STORE      = readFileSync('src/utils/sprays/spraysStore.js',                         'utf8')
const RECORDS    = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',                   'utf8')

// ── No D1 migration / permission unchanged ────────────────────────
section('No D1 migration / permission unchanged')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  '/api/sprays still gated by canEditSprays (no permission churn)')

// ── rowStatus helper + branches ───────────────────────────────────
section('rowStatus(r) helper — five categorical branches')

assert(/function rowStatus\(r\)/.test(SHEET),
  'rowStatus(r) helper declared in sheet')

// All five branches.
for (const kind of ['no-link', 'qty-blank', 'qty-invalid', 'qty-nonpositive', 'ok']) {
  assert(new RegExp(`kind:\\s*'${kind}'`).test(SHEET) || new RegExp(`kind === '${kind}'`).test(SHEET),
    `rowStatus emits or matches kind: '${kind}'`)
}

// Functional shape check on the OK branch.
assert(/qty,\s*\n?\s*unit:\s*r\.unit \|\| inv\?\.unit \|\| ''/.test(SHEET),
  "rowStatus 'ok' result carries qty + unit fallback chain (row.unit → inventory.unit → '')")
assert(/low:\s+available != null && available > 0 && available < qty/.test(SHEET),
  "rowStatus 'ok' result computes low: available > 0 && available < qty")
assert(/outOfStock:\s*available != null && available <= 0/.test(SHEET),
  "rowStatus 'ok' result computes outOfStock: available <= 0")

// ── Save handler blocks on bad inventory-linked rows ──────────────
section('Save handler — blocks save on qty-blank / qty-invalid / qty-nonpositive')

assert(/if \(status\.kind === 'qty-invalid'\)/.test(SHEET),
  'save blocks on qty-invalid with toast.error')
assert(/if \(status\.kind === 'qty-blank'\)/.test(SHEET),
  'save blocks on qty-blank with toast.error')
assert(/if \(status\.kind === 'qty-nonpositive'\)/.test(SHEET),
  'save blocks on qty-nonpositive with toast.error')

// Phase S.7b.6 — Toast copy retargeted to "total used" terminology.
assert(/Enter total used or rate for "\$\{r\.name\}" \(linked to inventory\)/.test(SHEET),
  'qty-blank toast: "Enter total used or rate for X (linked to inventory)" (S.7b.6 rewrite)')
assert(/Total used for "\$\{r\.name\}" must be greater than 0/.test(SHEET),
  'qty-nonpositive toast: "Total used for X must be greater than 0" (S.7b.6 rewrite)')
assert(/Total used for "\$\{r\.name\}" must be a number/.test(SHEET),
  'qty-invalid toast: "Total used for X must be a number" (S.7b.6 rewrite)')

// ── Per-row status line copy + visibility ─────────────────────────
section('Per-row status line — distinguishes blank vs zero vs valid')

// No-link warning copy preserved.
assert(/Not linked to inventory — record will save but no inventory deduction/.test(SHEET),
  'no-link status copy preserved')

// Distinct blank vs zero copy (S.7b.6 — "total used" terminology).
assert(/Enter total used or rate to calculate inventory deduction/.test(SHEET),
  'qty-blank status: "Enter total used or rate to calculate inventory deduction." (S.7b.6 rewrite)')
assert(/Total used must be greater than 0 to deduct inventory/.test(SHEET),
  'qty-nonpositive status: "Total used must be greater than 0 to deduct inventory." (S.7b.6 rewrite)')
assert(/Total used must be a number/.test(SHEET),
  'qty-invalid status: "Total used must be a number." (S.7b.6 rewrite)')

// Valid row shows on-hand info.
assert(/Will deduct \{s\.qty\}/.test(SHEET),
  'valid row status: "Will deduct N..."')
assert(/\$\{s\.available\}/.test(SHEET) && /on hand/.test(SHEET),
  'valid row status shows live on-hand quantity (s.available)')

// Out-of-stock + insufficient sub-warnings.
assert(/Selected product has 0 on hand/.test(SHEET),
  'out-of-stock sub-warning copy present')
assert(/Insufficient stock for full deduction/.test(SHEET),
  'insufficient-stock sub-warning copy present')

// ── CSS classes ──────────────────────────────────────────────────
section('CSS — blocking + status-line classes defined')

assert(/\.chemBlockingWarn\s*\{/.test(SHEET_CSS),
  '.chemBlockingWarn class defined (red bg for save-blocking states)')
assert(/\.chemStatusLine\s*\{/.test(SHEET_CSS),
  '.chemStatusLine class defined (calm informational style)')
assert(/\.chemStatusSubWarn\s*\{/.test(SHEET_CSS),
  '.chemStatusSubWarn class defined (sub-line warning color)')

// Legacy classes still present (graceful fallback).
assert(/\.chemNoInventoryWarn\s*\{/.test(SHEET_CSS),
  '.chemNoInventoryWarn class preserved')

// ── Worker validation (server-side source of truth) ───────────────
section('Worker — rejects inventoryItemId + quantityUsed <= 0')

assert(/if \(p\.inventoryItemId && \(p\.quantityUsed == null \|\| Number\(p\.quantityUsed\) <= 0\)\)/.test(SPRAYS_W),
  'worker checks inventoryItemId + (quantityUsed null OR <= 0) (S.7b.5)')
assert(/Inventory-linked product rows require quantityUsed greater than 0/.test(SPRAYS_W),
  'worker 400 message: "Inventory-linked product rows require quantityUsed greater than 0"')

// Existing validation chain preserved.
assert(/Each product row requires a name/.test(SPRAYS_W),
  'worker name-required validation preserved (regression couple)')
assert(/Invalid quantityUsed for/.test(SPRAYS_W),
  'worker NaN-quantityUsed validation preserved')
assert(/Invalid rate for/.test(SPRAYS_W),
  'worker NaN-rate validation preserved')

// ── Worker accepts valid rows + replaceSprayProducts intact ───────
section('Worker — accepts valid rows; replacement pipeline intact')

assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() still exported')
assert(/if \(p\.inventoryItemId && p\.quantityUsed != null && Number\(p\.quantityUsed\) > 0\)/.test(SPRAYS_W),
  'replaceSprayProducts() still guards deduction on inventoryItemId + qty > 0')
assert(/DELETE FROM spray_products WHERE spray_record_id = \?/.test(SPRAYS_W),
  'replaceSprayProducts() still DELETEs old product rows')
assert(/INSERT INTO spray_products/.test(SPRAYS_W),
  'replaceSprayProducts() still INSERTs new product rows')
assert(/INSERT INTO inventory_usage/.test(SPRAYS_W),
  'replaceSprayProducts() still INSERTs new inventory_usage rows')
assert(/SELECT \* FROM inventory_usage[\s\S]{0,80}WHERE source_id = \? AND reverted_at IS NULL/.test(SPRAYS_W),
  'replaceSprayProducts() still reverses unreverted inventory_usage')

// ── Picker default behavior ───────────────────────────────────────
section('Picker — does NOT default quantityUsed when product is selected')

// mapInventoryItemToProductRow returns id/catalogId/name/type/unit only.
assert(/inventoryItemId:\s*item\.id/.test(PICKER) &&
       /productCatalogId:\s*item\.productCatalogId/.test(PICKER) &&
       /name:\s*item\.name/.test(PICKER) &&
       /type:\s*item\.category/.test(PICKER) &&
       /unit:\s*item\.unit \?\? 'oz'/.test(PICKER),
  'mapInventoryItemToProductRow sets {inventoryItemId, productCatalogId, name, type, unit} only')
assert(!/quantityUsed:/.test(PICKER),
  'mapInventoryItemToProductRow does NOT touch quantityUsed (preserves user input)')

// Phase S.7b.6 — addDraftRow seeds totalUsed (renamed from
// quantityUsed in-editor). Save handler maps totalUsed → quantityUsed
// in the payload before sending to the worker.
assert(/function addDraftRow\(\)[\s\S]{0,500}totalUsed: '',/.test(SHEET),
  'addDraftRow seeds totalUsed as empty string (forces user input — no silent default of 0)')

// ── Save payload still complete (S.7b.3 regression couple) ────────
section('Save payload — all picker fields still sent')

// Phase S.7b.6 — quantityUsed payload is now derived from r.totalUsed
// (renamed in-editor), and rate is formatted as a label string via
// formatRateLabel(r.rate, r.rateUnit) to match BuildSpraySheet's
// commit-time write shape.
for (const field of ['inventoryItemId', 'productCatalogId', 'name', 'unit']) {
  assert(new RegExp(`${field}:\\s*r\\.${field}|${field}:\\s*String\\(r\\.${field}\\)`).test(SHEET),
    `save payload includes ${field}`)
}
assert(/quantityUsed:\s+r\.totalUsed === '' \|\| r\.totalUsed == null \? null : Number\(r\.totalUsed\)/.test(SHEET),
  'save payload maps totalUsed → quantityUsed (worker contract unchanged)')
assert(/rate:\s+r\.rate === '' \|\| r\.rate == null \? null : formatRateLabel\(r\.rate, r\.rateUnit\)/.test(SHEET),
  'save payload formats rate as label string via formatRateLabel(r.rate, r.rateUnit) — matches BuildSpraySheet commit shape')
assert(/rateUnit:\s+r\.rateUnit \?\? null/.test(SHEET),
  'save payload includes rateUnit')

// ── Sheet refresh after save (S.7b.4 regression couple) ───────────
section('Sheet refresh after save — patchSpray + store update preserved')

assert(/await patchSpray\(record\.id, payload\)/.test(SHEET),
  'save still calls patchSpray(record.id, payload)')
// Phase S.7c — refresh also fires on areas edits.
assert(/if \(Array\.isArray\(updates\?\.products\) \|\| Array\.isArray\(updates\?\.areas\)\) \{\s*\n?\s*refreshSpraysData\(\)\.catch\(/.test(STORE),
  'patchSpray triggers refreshSpraysData() after products OR areas PATCH (S.7b.4 + S.7c)')
assert(/const \[viewingRecordId, setViewingRecordId\] = useState\(null\)/.test(readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx', 'utf8')),
  'calendar workspace still uses id-based lookup (S.7b.4 fix preserved)')

// ── Build Spray commit path untouched ─────────────────────────────
section('Build Spray commit path untouched')

assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray() still exported')
const createBody = SPRAYS_W.match(/export async function createSpray[\s\S]{0,5000}?\n^\}/m)?.[0] ?? ''
assert(!/replaceSprayProducts/.test(createBody),
  'createSpray() does NOT delegate to replaceSprayProducts')
// Build Spray commit-time validation is unchanged — only updateSpray
// tightened. (Commit-time UI builds qty from rate × area math so
// rows never reach the worker with qty 0.)
assert(!createBody.includes('Inventory-linked product rows require quantityUsed'),
  'createSpray does NOT add the inventory-linked qty check (commit path validates differently in BuildSpraySheet)')

// ── Read-only viewers still gated out ─────────────────────────────
section('Read-only viewers — still blocked from chemical editor')

assert(/\{canEdit && canEditSprays && !editMode && \(/.test(SHEET),
  'Edit chemicals button gated by canEdit && canEditSprays && !editMode')

// ── Records tab + EditSprayRecordModal preserved (S.5a.1) ─────────
section('Records edit modal preserved (regression couple)')

assert(/<EditSprayRecordModal[\s\S]{0,300}record=\{editing\}/.test(RECORDS),
  'SprayRecords still mounts EditSprayRecordModal unchanged')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7b.5'),   'DAB carries no Phase S.7b.5 edits')
assert(!KIOSK.includes('Phase S.7b.5'), 'kiosk carries no Phase S.7b.5 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
