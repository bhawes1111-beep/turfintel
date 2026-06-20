// Phase S.7b.4 — Hotfix smoke for completed-spray chemical save +
// inventory deduction.
//
//   node scripts/smoke-spray-chemical-save-hotfix.mjs
//
// Pins the three S.7b.4 fixes:
//
//   1. Sheet stale display fix — calendar workspace now stores
//      viewingRecordId (string) and re-derives viewingRecord from
//      useSpraysData() on every render. After patchSpray() updates
//      the store, the next render finds the fresh record and the
//      sheet re-renders with the saved products. No manual sync
//      needed; no close/reopen required.
//
//   2. Belt-and-suspenders refresh — patchSpray() now calls
//      refreshSpraysData() after a products-change PATCH (in
//      addition to the in-place setState merge). Insulates against
//      any drift between PATCH response shape and GET /api/sprays.
//
//   3. Blank-quantity inventory-skip warning — sheet shows a
//      separate amber warning when a row has an inventoryItemId but
//      blank/zero quantity, so the user knows inventory won't be
//      deducted.
//
// Worker pipeline (S.7b.2) unchanged — pinned here as regression
// couples so any drift surfaces loud.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const CW         = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',         'utf8')
const SHEET      = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',     'utf8')
const SHEET_CSS  = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css','utf8')
const STORE      = readFileSync('src/utils/sprays/spraysStore.js',                         'utf8')
const SPRAYS_W   = readFileSync('worker/api/sprays.js',                                    'utf8')
const PERM       = readFileSync('worker/lib/mutationPermissions.js',                       'utf8')
const RECORDS    = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',                   'utf8')
const REPORT     = readFileSync('src/utils/reports/reportBuilder.js',                      'utf8')

// ── No D1 migration / no new endpoints / permission unchanged ─────
section('No D1 migration / worker S.7b.2 path still intact')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// Permission unchanged.
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  '/api/sprays still gated by canEditSprays')

// S.7b.2 worker pipeline intact.
assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() still exported in worker')
assert(/if \(Array\.isArray\(body\.products\)\)/.test(SPRAYS_W),
  'updateSpray() still gates product replacement on body.products')
assert(/return getSpray\(env, id\)/.test(SPRAYS_W),
  'updateSpray() still returns hydrated record via getSpray (response includes joined products + areas)')

// getSpray builds hydrated payload from joined tables.
assert(/fetchProductsForRecords/.test(SPRAYS_W),
  'getSpray() still joins spray_products via fetchProductsForRecords (S.7b.4 verified)')
assert(/fetchAreasForRecords/.test(SPRAYS_W),
  'getSpray() still joins spray_areas via fetchAreasForRecords')

// Replace pipeline still touches spray_products + inventory_usage +
// inventory_items in the audited order.
const replaceBody = SPRAYS_W.match(/async function replaceSprayProducts[\s\S]{0,5000}?\n^\}/m)?.[0] ?? ''
assert(replaceBody.length > 0, 'replaceSprayProducts() body parsed')
assert(/DELETE FROM spray_products WHERE spray_record_id = \?/.test(replaceBody),
  'replaceSprayProducts() still deletes old spray_products rows')
assert(/INSERT INTO spray_products/.test(replaceBody),
  'replaceSprayProducts() still inserts new spray_products rows')
assert(/SELECT \* FROM inventory_usage[\s\S]{0,80}WHERE source_id = \? AND reverted_at IS NULL/.test(replaceBody),
  'replaceSprayProducts() still reads unreverted inventory_usage rows')
assert(/UPDATE inventory_items SET quantity = \?/.test(replaceBody),
  'replaceSprayProducts() still restores + deducts inventory_items.quantity')
assert(/UPDATE inventory_usage SET reverted_at = \?/.test(replaceBody),
  'replaceSprayProducts() still marks old usage rows reverted_at')
assert(/INSERT INTO inventory_usage/.test(replaceBody),
  'replaceSprayProducts() still inserts new inventory_usage rows')
assert(/if \(p\.inventoryItemId && p\.quantityUsed != null && Number\(p\.quantityUsed\) > 0\)/.test(replaceBody),
  'replaceSprayProducts() still guards deduction on inventoryItemId + quantityUsed > 0')

// ── FIX 1: Sheet stale display — viewingRecordId pattern ──────────
section('FIX 1: Sheet renders LIVE record (id-based lookup)')

// State is the id, not the snapshot.
assert(/const \[viewingRecordId, setViewingRecordId\] = useState\(null\)/.test(CW),
  'workspace stores viewingRecordId (string) — not the captured record object')

// viewingRecord re-derived from store via useMemo. Any store update
// (patchSpray, refreshSpraysData) re-runs this lookup and the sheet
// receives the fresh record.
assert(/const viewingRecord = useMemo\(\s*\n?\s*\(\) => \(Array\.isArray\(sprays\) \? sprays\.find\(r => r\.id === viewingRecordId\) : null\) \?\? null,\s*\n?\s*\[sprays, viewingRecordId\],\s*\n?\s*\)/.test(CW),
  'viewingRecord = useMemo(() => sprays.find(r => r.id === viewingRecordId)) — depends on [sprays, viewingRecordId]')

// Click handler writes id only.
assert(/setViewingRecordId\(r\.id\)/.test(CW),
  'completed row click writes setViewingRecordId(r.id)')

// Negative pin — no captured record object stored anywhere.
assert(!/setViewingRecord\(r\)/.test(CW),
  'no remaining setViewingRecord(r) captures of stale record objects')
assert(!/const \[viewingRecord, setViewingRecord\]/.test(CW),
  'no remaining captured-record state variable')

// Sheet mount uses the derived viewingRecord (which always reflects store).
assert(/<SprayApplicationSheetModal\s+record=\{viewingRecord\}/.test(CW),
  'sheet still receives record={viewingRecord} (now always live from store)')

// onEdit + onClose clear the id, not a snapshot.
assert(/onEdit=\{\(rec\) => \{ setViewingRecordId\(null\); setEditingRecord\(rec\) \}\}/.test(CW),
  'onEdit clears viewingRecordId then opens edit modal with passed rec')
assert(/onClose=\{\(\) => setViewingRecordId\(null\)\}/.test(CW),
  'onClose clears viewingRecordId')

// ── FIX 2: Belt-and-suspenders refresh after products PATCH ──────
section('FIX 2: patchSpray refreshes spraysStore after products edit')

// patchSpray still does in-place setState merge first.
assert(/setState\(\{ records: state\.records\.map\(r => r\.id === id \? saved : r\) \}\)/.test(STORE),
  'patchSpray still merges the saved record into state (primary path)')

// New: after the merge, if products OR areas were in the payload,
// force a refreshSpraysData() to re-pull from the worker. Non-fatal
// catch. Phase S.7c added the areas branch.
assert(/if \(Array\.isArray\(updates\?\.products\) \|\| Array\.isArray\(updates\?\.areas\)\) \{\s*\n?\s*refreshSpraysData\(\)\.catch\(/.test(STORE),
  'patchSpray triggers refreshSpraysData() when products OR areas were edited (S.7b.4 + S.7c)')

// patchSpray still returns the saved record so callers can use it
// directly (sheet handler awaits the promise).
assert(/return saved/.test(STORE),
  'patchSpray still returns the saved record so callers can chain on it')

// ── FIX 3: Blank-quantity inventory-skip warning ──────────────────
section('FIX 3: Sheet warns when row has inventory link but blank/invalid quantity')

// Phase S.7b.5 — Per-row warning markup was unified into a single
// rowStatus()-driven render. The old chemNoQuantityWarn span is
// kept as a CSS fallback but the render path is now the blocking
// warn class. Specific copy is still pinned, just on the new tree.
// Phase S.7b.6 — Copy retargeted to "total used" terminology.
assert(/Enter total used or rate to calculate inventory deduction/.test(SHEET),
  'blank-quantity warning copy (S.7b.6 rewrite): "Enter total used or rate…")')
assert(/Total used must be greater than 0 to deduct inventory/.test(SHEET),
  'zero/negative-quantity warning copy (S.7b.6 rewrite): "Total used must be greater than 0…"')
assert(/chemBlockingWarn/.test(SHEET) && /chemBlockingWarn/.test(SHEET_CSS),
  '.chemBlockingWarn class rendered + styled for save-blocking states')

// rowStatus() helper covers all the conditional branches the old
// inline regex used to enforce.
assert(/function rowStatus\(r\)/.test(SHEET),
  'rowStatus(r) helper drives every per-row warning + the save-block decision (S.7b.5)')
assert(/kind === 'qty-blank'/.test(SHEET) && /kind === 'qty-nonpositive'/.test(SHEET),
  'rowStatus distinguishes qty-blank vs qty-nonpositive (S.7b.5)')

// ── Save handler still calls patchSpray with products payload ────
section('Sheet save handler — unchanged payload shape (regression couple)')

assert(/products: draftRows\.map/.test(SHEET),
  'payload.products built from draftRows')
assert(/await patchSpray\(record\.id, payload\)/.test(SHEET),
  'save calls patchSpray(record.id, payload)')

// All critical fields still in payload. Phase S.7b.6 maps rate via
// formatRateLabel(r.rate, r.rateUnit) and quantityUsed via r.totalUsed.
for (const field of ['inventoryItemId', 'productCatalogId', 'name', 'unit']) {
  assert(new RegExp(`${field}:\\s*r\\.${field}|${field}:\\s*String\\(r\\.${field}\\)`).test(SHEET),
    `save payload includes ${field}`)
}
assert(/quantityUsed:\s+r\.totalUsed/.test(SHEET),
  'save payload maps totalUsed → quantityUsed (S.7b.6 rename)')
assert(/rate:\s+r\.rate === '' \|\| r\.rate == null \? null : formatRateLabel/.test(SHEET),
  'save payload formats rate as label string (S.7b.6 — matches BuildSpraySheet commit shape)')

// Toast + state cleanup on success.
assert(/toast\.success\?\.\(`Updated chemicals for spray on \$\{record\.date\}`\)/.test(SHEET),
  'success toast names the spray date')
assert(/setEditMode\(false\)/.test(SHEET),
  'success exits edit mode → next render shows view mode with saved products')

// ── Records + reports refresh via the same store ─────────────────
section('Records tab + reports reflect saved products (subscriber refresh)')

assert(/useSpraysData/.test(RECORDS),
  'Records still subscribes to useSpraysData (re-renders on patchSpray)')
assert(/buildSprayCompliancePacket/.test(REPORT),
  'Compliance Packet builder still exported (reads current store on each build)')
assert(/buildSprayProductUsageReport/.test(REPORT),
  'Product Usage Report builder still exported (reads current store on each build)')

// ── Build Spray commit pipeline untouched ─────────────────────────
section('Build Spray commit pipeline untouched')

assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray() still exported')
const createBody = SPRAYS_W.match(/export async function createSpray[\s\S]{0,5000}?\n^\}/m)?.[0] ?? ''
assert(!/replaceSprayProducts/.test(createBody),
  'createSpray() does NOT delegate to replaceSprayProducts (commit path untouched)')

// deleteSpray reversal unchanged.
const deleteBody = SPRAYS_W.match(/export async function deleteSpray[\s\S]{0,3000}?\n^\}/m)?.[0] ?? ''
assert(/inventory_usage/.test(deleteBody),
  'deleteSpray() inventory reversal pipeline preserved')

// ── Read-only viewer gating still in place ───────────────────────
section('Read-only viewer gating — preserved')

assert(/\{canEdit && canEditSprays && !editMode && \(/.test(SHEET),
  'Edit chemicals button still gated by canEdit && canEditSprays && !editMode')
assert(/canEdit=\{canEditSprays\}/.test(CW),
  'workspace passes canEdit={canEditSprays}')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7b.4'),   'DAB carries no Phase S.7b.4 edits')
assert(!KIOSK.includes('Phase S.7b.4'), 'kiosk carries no Phase S.7b.4 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
