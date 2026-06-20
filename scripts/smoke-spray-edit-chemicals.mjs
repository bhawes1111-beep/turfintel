// Phase S.7b.2 — Edit chemicals on completed spray records smoke.
//
//   node scripts/smoke-spray-edit-chemicals.mjs
//
// Pins the safe chemical-edit pipeline end-to-end:
//
//   Worker:
//     • PATCH /api/sprays/:id still gated by canEditSprays via the
//       existing /api/sprays prefix rule (no new mutation rule).
//     • Worker validation: empty products array rejected; each row
//       must have a name; rate/quantity must parse as numbers.
//     • replaceSprayProducts() pipeline: read existing
//       inventory_usage → restore inventory_items.quantity → mark
//       reverted_at → DELETE spray_products → INSERT spray_products
//       + INSERT inventory_usage + UPDATE inventory_items (deduct).
//     • tryCatalogEnrich() reused for snapshot fallback.
//     • totalCostSnapshot recomputed from row totals (NULL when no
//       per-row totals).
//     • Audit reason appended to notes as "Chemical mix edited on
//       YYYY-MM-DD: <reason>" (no new audit table).
//
//   Frontend:
//     • Sheet shows Edit chemicals button only for canEditSprays.
//     • Edit mode renders draftRows with name/type/rate/unit/quantity/
//       total-cost inputs, Add chemical, Remove per row.
//     • Reason field rendered; user-confirmed proceed if blank.
//     • Save calls patchSpray(record.id, { products, editReason? }).
//     • Calendar/Records refresh happens via patchSpray → store update
//       (existing store contract — no new refresh wiring needed).
//
// No new migration. No new endpoint. Permission rule unchanged.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SPRAYS_W   = readFileSync('worker/api/sprays.js',                                    'utf8')
const PERM       = readFileSync('worker/lib/mutationPermissions.js',                       'utf8')
const ROUTER     = readFileSync('worker/index.js',                                         'utf8')
const SHEET      = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',     'utf8')
const SHEET_CSS  = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.module.css','utf8')
const CW         = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx',         'utf8')
const STORE      = readFileSync('src/utils/sprays/spraysStore.js',                         'utf8')
const RECORDS    = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx',                   'utf8')
const REPORT     = readFileSync('src/utils/reports/reportBuilder.js',                      'utf8')

// ── No D1 migration ────────────────────────────────────────────────
section('No D1 migration / no new endpoints / permission unchanged')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// Permission rule for /api/sprays still maps to canEditSprays.
assert(/\['\/api\/sprays',\s*'canEditSprays'\]/.test(PERM),
  '/api/sprays still gated by canEditSprays (no new permission rule needed)')

// No new endpoint added.
const sprayRoutes = (ROUTER.match(/\/api\/sprays[^'"`]*/g) ?? []).filter(r => !r.includes('-program'))
const uniqueRoutes = new Set(sprayRoutes)
assert(!ROUTER.includes('/api/sprays/${'),
  'no template-literal /api/sprays/... routes (no new endpoint)')
// Existing routes preserved.
assert(/pathname === '\/api\/sprays'/.test(ROUTER),
  '/api/sprays collection route preserved')
assert(/const sprayMatch = pathname\.match\(/.test(ROUTER) && /if \(method === 'PATCH'\)\s+return updateSpray/.test(ROUTER),
  '/api/sprays/:id PATCH still routed to updateSpray (no new endpoint)')

// ── Worker validation ─────────────────────────────────────────────
section('Worker — body.products validation')

assert(/if \(Array\.isArray\(body\.products\)\)/.test(SPRAYS_W),
  'updateSpray() gates product replacement on Array.isArray(body.products)')
assert(/Completed spray must have at least one product row/.test(SPRAYS_W),
  'worker rejects empty products array (400 badRequest)')
assert(/Each product row requires a name/.test(SPRAYS_W),
  'worker rejects rows missing a name (400 badRequest)')
assert(/Invalid quantityUsed for/.test(SPRAYS_W),
  'worker rejects non-numeric quantityUsed (400 badRequest)')
assert(/Invalid rate for/.test(SPRAYS_W),
  'worker rejects non-numeric rate (400 badRequest)')

// ── Worker — replaceSprayProducts pipeline ────────────────────────
section('Worker — replaceSprayProducts() pipeline')

assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() helper exists with documented signature')

const replaceBody = SPRAYS_W.match(/async function replaceSprayProducts[\s\S]{0,5000}?\n^\}/m)?.[0] ?? ''
assert(replaceBody.length > 0, 'replaceSprayProducts() body parsed')

// 1. Reverse old inventory.
assert(/SELECT \* FROM inventory_usage[\s\S]{0,80}WHERE source_id = \? AND reverted_at IS NULL/.test(replaceBody),
  'step 1: reads unreverted inventory_usage rows for this spray')

// 2. Restore inventory_items.quantity by name match.
assert(/SELECT id, quantity FROM inventory_items WHERE name = \?/.test(replaceBody),
  'step 2a: looks up inventory_items by exact name')
assert(/LOWER\(name\) = LOWER\(\?\)/.test(replaceBody),
  'step 2b: falls back to case-insensitive match (matches deleteSpray pattern)')
assert(/UPDATE inventory_items SET quantity = \?[\s\S]{0,80}WHERE id = \?/.test(replaceBody),
  'step 2c: restores inventory_items.quantity for reversed rows')
assert(/UPDATE inventory_usage SET reverted_at = \?/.test(replaceBody),
  'step 3: marks old usage rows reverted_at = now')

// 4. Drop old product rows.
assert(/DELETE FROM spray_products WHERE spray_record_id = \?/.test(replaceBody),
  'step 4: deletes old spray_products rows')

// 5. Insert new product rows.
assert(/INSERT INTO spray_products[\s\S]{0,400}VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/.test(replaceBody),
  'step 5: inserts new spray_products rows (13 columns — same as createSpray)')

// 6. Snapshot resolution mirrors createSpray.
assert(/tryCatalogEnrich/.test(replaceBody),
  'step 6: uses tryCatalogEnrich(env, productCatalogId) for EPA + active-ingredient fallback')
assert(/epaSnap = p\.epaNumberSnapshot/.test(replaceBody) && /aiSnap\s*= p\.activeIngredientsSnapshot/.test(replaceBody),
  'caller-supplied snapshots take precedence over catalog enrichment')

// 7. Deduct new inventory + insert new usage row only when both
//    inventoryItemId AND quantityUsed > 0 are present.
assert(/if \(p\.inventoryItemId && p\.quantityUsed != null && Number\(p\.quantityUsed\) > 0\)/.test(replaceBody),
  'step 7: deduct/log only when inventoryItemId + quantityUsed > 0 (matches createSpray behavior)')
assert(/INSERT INTO inventory_usage/.test(replaceBody),
  'step 7b: inserts new inventory_usage rows for the new mix')
assert(/source_id/.test(replaceBody),
  'new usage rows tied to the spray via source_id (so future deleteSpray reverses correctly)')

// ── Worker — total_cost recompute + audit reason ──────────────────
section('Worker — total_cost recompute + audit reason')

assert(/sets\.push\('total_cost_snapshot = \?'\)/.test(SPRAYS_W),
  'total_cost_snapshot recomputed via UPDATE')
assert(/body\.products\.reduce\([\s\S]{0,200}sum \+ \(Number\(p\.totalCostSnapshot\) \|\| 0\)/.test(SPRAYS_W),
  'total_cost recomputed by summing per-row totalCostSnapshot')
assert(/recomputed > 0 \? recomputed : null/.test(SPRAYS_W),
  'total_cost stays NULL when no per-row totals provided (avoids 0.00 false-positive)')
assert(/!Object\.prototype\.hasOwnProperty\.call\(body, 'totalCostSnapshot'\)/.test(SPRAYS_W),
  'recompute skipped when caller explicitly PATCHes totalCostSnapshot (caller wins)')

// Audit reason → notes append.
assert(/if \(productEditApplied && body\.editReason/.test(SPRAYS_W),
  'audit-reason append only when products were also replaced')
assert(/Chemical mix edited on \$\{ts\}: \$\{reason\}/.test(SPRAYS_W),
  'notes append uses "Chemical mix edited on YYYY-MM-DD: <reason>" template')
// No new audit table.
assert(!/CREATE TABLE.*audit/.test(SPRAYS_W),
  'no new audit table created (reason lives inside existing notes column)')

// ── Frontend — sheet edit chemicals UI ────────────────────────────
section('Frontend — Edit chemicals UI gated + functional')

assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(SHEET),
  'sheet imports useAuth from AuthContext')
assert(/const canEditSprays = can\('canEditSprays'\)/.test(SHEET),
  'sheet derives canEditSprays from can("canEditSprays")')

// Edit chemicals button visibility: canEdit (parent decided) + canEditSprays + !editMode.
assert(/\{canEdit && canEditSprays && !editMode && \(\s*\n?\s*<button[\s\S]{0,400}onClick=\{startEditingChemicals\}/.test(SHEET),
  'Edit chemicals button gated by canEdit && canEditSprays && !editMode')

// Read-only viewer protection — no startEditingChemicals reachable.
assert(/\{canEdit && !editMode && \(/.test(SHEET),
  'Application-fields Edit button also gated by canEdit && !editMode')

// Add / Remove controls.
assert(/>\s*\+ Add chemical\s*</.test(SHEET),
  'Add chemical button text rendered')
assert(/onClick=\{addDraftRow\}/.test(SHEET),
  'Add wires addDraftRow()')
assert(/onClick=\{\(\) => removeDraftRow\(i\)\}/.test(SHEET),
  'Per-row Remove wires removeDraftRow(i)')

// Phase S.7b.6 — type + unit still go through patchDraftRow; rate,
// totalUsed, and rateUnit go through dedicated math handlers that
// trigger bidirectional auto-calc.
for (const field of ['type', 'unit']) {
  assert(new RegExp(`patchDraftRow\\(i, \\{ ${field}:`).test(SHEET),
    `field editor for ${field} wired through patchDraftRow`)
}
assert(/editTotalUsed\(i, e\.target\.value\)/.test(SHEET),
  'totalUsed input wires editTotalUsed() (bidirectional math handler — S.7b.6)')
assert(/editRate\(i, e\.target\.value\)/.test(SHEET),
  'rate input wires editRate() (bidirectional math handler — S.7b.6)')
assert(/editRateUnit\(i, e\.target\.value\)/.test(SHEET),
  'rate unit select wires editRateUnit() (rebases math on unit change — S.7b.6)')

// Reason for change field.
assert(/Reason for chemical change/.test(SHEET),
  'Reason for chemical change label rendered')
assert(/aria-label="Reason for chemical change"/.test(SHEET),
  'reason textarea has accessible aria-label')

// Save handler.
assert(/async function handleSaveChemicals\(\)/.test(SHEET),
  'handleSaveChemicals() declared')
assert(/await patchSpray\(record\.id, payload\)/.test(SHEET),
  'save calls patchSpray(record.id, payload)')
assert(/payload\.editReason = editReason\.trim\(\)/.test(SHEET),
  'editReason included in payload only when non-blank')
assert(/products: draftRows\.map/.test(SHEET),
  'payload.products built from draftRows')

// Client-side validation parity with worker.
assert(/Completed spray must have at least one product row/.test(SHEET),
  'client toasts "at least one product row" before send')
assert(/Each product row needs a name/.test(SHEET),
  'client toasts "Each product row needs a name" before send')

// Cancel preserves record.
assert(/function cancelEditingChemicals\(\)/.test(SHEET),
  'cancelEditingChemicals() clears draft + reason + exits edit mode')

// ── Read-only viewers see no edit controls ────────────────────────
section('Read-only viewers — no edit controls reachable')

// Both buttons (application + chemical edit) require canEdit.
// In the calendar workspace, canEdit is set to canEditSprays — so
// read-only viewers see neither.
assert(/canEdit=\{canEditSprays\}/.test(CW),
  'calendar workspace passes canEdit={canEditSprays} (read-only users see neither edit button)')

// ── Save flow refreshes calendar + Records via store ──────────────
section('Save flow — patchSpray drives store update → all subscribers refresh')

assert(/export async function patchSpray\(id, updates\)/.test(STORE),
  'patchSpray(id, updates) exported from spraysStore')
assert(/method:\s*['"]PATCH['"]/.test(STORE),
  'patchSpray sends PATCH /api/sprays/:id')
assert(/setState\(\{ records: state\.records\.map\(r => r\.id === id \? saved : r\) \}\)/.test(STORE),
  'patchSpray replaces the in-store record on success → useSpraysData() subscribers re-render')

// Calendar workspace + Records both subscribe to the same store, so
// a single patchSpray call refreshes both surfaces.
assert(/useSpraysData/.test(CW),
  'calendar workspace subscribes to useSpraysData (refreshes on patch)')
assert(/useSpraysData/.test(RECORDS),
  'Records tab subscribes to useSpraysData (refreshes on patch)')

// Reports read from the same store at render time.
assert(/buildSprayCompliancePacket/.test(REPORT),
  'Compliance Packet builder still exported (will reflect new products on next build)')
assert(/buildSprayProductUsageReport/.test(REPORT),
  'Product Usage Report builder still exported (will reflect new products on next build)')

// ── Embedded builder + commit pipeline preserved ──────────────────
section('Embedded BuildSpraySheet + commit pipeline preserved')

assert(/<BuildSpraySheet initialDate=\{selectedDate\} onCommit=\{handleEmbeddedCommit\} \/>/.test(CW),
  'embedded BuildSpraySheet still in place (S.7 couple)')
assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray() still exported (commit path untouched)')
// createSpray still wires its own inventory deduction (NOT delegating
// to replaceSprayProducts).
const createBody = SPRAYS_W.match(/export async function createSpray[\s\S]{0,5000}?\n^\}/m)?.[0] ?? ''
assert(!/replaceSprayProducts/.test(createBody),
  'createSpray() does NOT delegate to replaceSprayProducts (commit pipeline untouched)')

// ── Records tab + EditSprayRecordModal preserved ──────────────────
section('Records tab + EditSprayRecordModal preserved')

assert(/<EditSprayRecordModal[\s\S]{0,300}record=\{editing\}[\s\S]{0,300}onClose=\{\(\) => setEditing\(null\)\}[\s\S]{0,300}onSaved=\{\(\) => setEditing\(null\)\}/.test(RECORDS),
  'SprayRecords still mounts EditSprayRecordModal with identical handlers')

// ── CSS for chemical editor present ───────────────────────────────
section('CSS — chemical editor classes defined')

for (const cls of ['chemEditWarn', 'chemEditList', 'chemEditRow', 'chemEditField', 'chemRemoveBtn', 'chemReasonField', 'chemEditActions']) {
  assert(new RegExp(`\\.${cls}\\s*\\{`).test(SHEET_CSS),
    `.${cls} class defined`)
}

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase S.7b.2'),   'DAB carries no Phase S.7b.2 edits')
assert(!KIOSK.includes('Phase S.7b.2'), 'kiosk carries no Phase S.7b.2 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
