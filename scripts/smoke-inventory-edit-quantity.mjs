// Phase I.1 — Inventory quantity edit hotfix smoke.
//
//   node scripts/smoke-inventory-edit-quantity.mjs
//
// Root cause pinned (audit invariants):
//   • Worker already supports PATCH on quantity / unit / reorder_level
//     via the existing MUTABLE_COLUMNS whitelist + updateInventory.
//   • Worker mutation rules already gate /api/inventory by
//     canEditInventory.
//   • spraysStore.patchInventory already PATCH-es and optimistically
//     merges; no store changes needed.
//   • The frontend had NO Edit affordance — the Products drawer was
//     read-only and the Chemicals tab was a card list with no buttons.
//
// This phase adds:
//   • EditInventoryQuantityModal component (shared, minimal).
//   • Edit button in the InventoryProducts side drawer (gated by
//     canEditInventory).
//   • Edit button per InventoryChemicals card (same gate).
//   • Save calls patchInventory + triggers refreshInventoryData so
//     the SprayProductPicker reflects the new on-hand quantity on
//     the next subscription tick.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const MODAL     = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx',           'utf8')
const MODAL_CSS = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.module.css',    'utf8')
const PRODUCTS  = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx',                          'utf8')
const CHEMS     = readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx',                         'utf8')
const INV_CSS   = readFileSync('src/pages/Inventory/Inventory.module.css',                                'utf8')
const STORE     = readFileSync('src/utils/inventory/inventoryStore.js',                                   'utf8')
const PICKER    = readFileSync('src/pages/Spray/tabs/SprayProductPicker.jsx',                             'utf8')
const SHEET     = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx',                     'utf8')
const BUILD     = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx',                                'utf8')
const SPRAYS_W  = readFileSync('worker/api/sprays.js',                                                    'utf8')
const INV_W     = readFileSync('worker/api/inventory.js',                                                 'utf8')
const PERM      = readFileSync('worker/lib/mutationPermissions.js',                                       'utf8')

// ── No D1 migration / permission unchanged ────────────────────────
section('No D1 migration / permission unchanged')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0054 = migrationFiles.filter(f => /^00(5[5-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0054.length === 0,
  `no migration past 0054 (found: ${past0054.join(', ') || 'none'})`)

// I.1 is a frontend-only phase. Worker is unchanged.
for (const path of [
  'worker/index.js',
  'worker/api/inventory.js',
  'worker/api/sprays.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase I.1'),
    `${path} carries no Phase I.1 edits (frontend-only)`)
}

// Permission rule unchanged.
assert(/\['\/api\/inventory',\s*'canEditInventory'\]/.test(PERM),
  '/api/inventory still gated by canEditInventory (worker source of truth)')

// ── Worker PATCH support (audit invariant) ────────────────────────
section('Worker — updateInventory already accepts quantity / unit / reorderLevel')

assert(/quantity:\s*'quantity'/.test(INV_W),
  'MUTABLE_COLUMNS includes quantity → quantity (PATCH-able)')
assert(/unit:\s*'unit'/.test(INV_W),
  'MUTABLE_COLUMNS includes unit → unit')
assert(/reorderLevel:\s*'reorder_level'/.test(INV_W),
  'MUTABLE_COLUMNS includes reorderLevel → reorder_level')
assert(/export async function updateInventory\(env, id, request\)/.test(INV_W),
  'updateInventory(env, id, request) still exported')

// Store helper unchanged but verified.
assert(/export async function patchInventory\(id, updates\)/.test(STORE),
  'patchInventory(id, updates) still exported')
assert(/method:\s*['"]PATCH['"]/.test(STORE),
  'patchInventory sends PATCH /api/inventory/:id')

// ── New EditInventoryQuantityModal component ──────────────────────
section('EditInventoryQuantityModal — minimal shared edit modal')

assert(/^export default function EditInventoryQuantityModal\(\{ item, onClose, onSaved \}\)/m.test(MODAL),
  'modal accepts { item, onClose, onSaved } props')
assert(/role="dialog"\s+aria-modal="true"/.test(MODAL),
  'modal uses role="dialog" + aria-modal="true"')
assert(/data-modal="edit-inventory-quantity"/.test(MODAL),
  'modal carries data-modal="edit-inventory-quantity" hook')
assert(MODAL_CSS.length > 400, 'modal CSS module has substantive content')

// Form fields present.
assert(/aria-label="Quantity on hand"/.test(MODAL),
  'quantity input has aria-label')
assert(/aria-label="Stocking unit"/.test(MODAL),
  'unit input has aria-label')
assert(/aria-label="Reorder level"/.test(MODAL),
  'reorder level input has aria-label')

// Validation — non-numeric, negative.
assert(/Quantity on hand must be a number/.test(MODAL),
  'modal rejects non-numeric quantity')
assert(/Quantity on hand cannot be negative/.test(MODAL),
  'modal rejects negative quantity')

// Save path.
assert(/import \{ patchInventory, refreshInventoryData \} from '\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore'/.test(MODAL),
  'modal imports patchInventory + refreshInventoryData')
assert(/const saved = await patchInventory\(item\.id, payload\)/.test(MODAL),
  'modal calls patchInventory(item.id, payload)')
assert(/refreshInventoryData\(\)\.catch\(/.test(MODAL),
  'modal triggers refreshInventoryData() after save (belt-and-suspenders for spray picker)')
assert(/Updated inventory for \$\{item\.name\}/.test(MODAL),
  'success toast names the item')

// ── InventoryProducts wiring ──────────────────────────────────────
section('InventoryProducts — Edit button in drawer (gated by canEditInventory)')

assert(/import EditInventoryQuantityModal from '\.\.\/components\/EditInventoryQuantityModal'/.test(PRODUCTS),
  'InventoryProducts imports the new modal')
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(PRODUCTS),
  'InventoryProducts imports useAuth for permission gate')

assert(/const \[editingItem, setEditingItem\] = useState\(null\)/.test(PRODUCTS),
  'editingItem state declared (null when modal closed)')
assert(/const \{ can \} = useAuth\(\)/.test(PRODUCTS) && /const canEditInventory = can\('canEditInventory'\)/.test(PRODUCTS),
  'derives canEditInventory from can("canEditInventory")')

// Edit button rendered in drawer body, gated.
assert(/\{canEditInventory && \(\s*\n?\s*<div className=\{styles\.ipModalEditRow\}>[\s\S]{0,500}onClick=\{\(\) => setEditingItem\(selected\)\}/.test(PRODUCTS),
  'Edit button rendered when canEditInventory; click wires setEditingItem(selected)')
assert(/>\s*Edit quantity \/ unit\s*</.test(PRODUCTS),
  'Edit button text reads "Edit quantity / unit"')

// Modal mount.
assert(/\{editingItem && \(\s*\n?\s*<EditInventoryQuantityModal[\s\S]{0,300}item=\{editingItem\}[\s\S]{0,300}onClose=\{\(\) => setEditingItem\(null\)\}/.test(PRODUCTS),
  'modal mount: item={editingItem} + onClose clears state')

// CSS classes present.
assert(/\.ipModalEditRow\s*\{/.test(INV_CSS),
  '.ipModalEditRow class defined in Inventory.module.css')
assert(/\.ipModalEditBtn\s*\{/.test(INV_CSS),
  '.ipModalEditBtn class defined')

// ── InventoryChemicals wiring ─────────────────────────────────────
section('InventoryChemicals — Edit button per card (gated)')

assert(/import EditInventoryQuantityModal from '\.\.\/components\/EditInventoryQuantityModal'/.test(CHEMS),
  'InventoryChemicals imports the modal')
assert(/import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext'/.test(CHEMS),
  'InventoryChemicals imports useAuth')
assert(/const \[editingItem, setEditingItem\] = useState\(null\)/.test(CHEMS),
  'editingItem state declared')
assert(/const canEditInventory = can\('canEditInventory'\)/.test(CHEMS),
  'derives canEditInventory')

// Per-card Edit button.
assert(/\{canEditInventory && \(\s*\n?\s*<div className=\{styles\.cardEditBtnRow\}>[\s\S]{0,400}onClick=\{\(\) => setEditingItem\(c\)\}/.test(CHEMS),
  'Edit button rendered per chemical card when canEditInventory')
assert(/>\s*Edit quantity\s*</.test(CHEMS),
  'Edit button text reads "Edit quantity"')

// Modal mount.
assert(/\{editingItem && \(\s*\n?\s*<EditInventoryQuantityModal[\s\S]{0,300}item=\{editingItem\}/.test(CHEMS),
  'modal mount in InventoryChemicals')

// CSS classes for chemicals.
assert(/\.cardEditBtnRow\s*\{/.test(INV_CSS),
  '.cardEditBtnRow class defined')
assert(/\.cardEditBtn\s*\{/.test(INV_CSS),
  '.cardEditBtn class defined')

// ── Spray product picker compatibility ────────────────────────────
section('Spray product picker — reads live inventory.quantity')

// Picker uses useInventoryData → same store as the edit modal mutates.
assert(/import \{ useInventoryData \} from '\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore'/.test(PICKER),
  'SprayProductPicker reads useInventoryData (same store updated by Edit modal)')
assert(/p\.quantity != null \? ` \(\$\{p\.quantity\} \$\{p\.unit \?\? ''\}\)`/.test(PICKER),
  'picker label reads p.quantity (new on-hand reflects immediately on next render)')

// Sheet chemical editor + BuildSpraySheet both consume the picker.
assert(/import SprayProductPicker, \{\s*\n?\s*mapInventoryItemToProductRow,\s*\n?\s*useSprayProductOptions,\s*\n?\s*\} from '\.\/SprayProductPicker'/.test(SHEET),
  'completed-spray chemical editor uses the shared picker (S.7b.3 couple)')
assert(/import SprayProductPicker, \{\s*\n?\s*useSprayProductOptions,\s*\n?\s*mapInventoryItemToProductRow,\s*\n?\s*\} from '\.\/SprayProductPicker'/.test(BUILD),
  'BuildSpraySheet uses the shared picker (S.7b.3 couple)')

// Sheet's per-row status line reads the live on-hand quantity.
assert(/const inv\s+= inventoryById\.get\(r\.inventoryItemId\)/.test(SHEET),
  'sheet looks up live inventory by id when computing rowStatus')

// ── Spray inventory deduction path unchanged ──────────────────────
section('Spray deduction + reversal pipelines unchanged')

assert(/export async function createSpray\b/.test(SPRAYS_W),
  'worker createSpray() still exported (commit-time deduction path)')
assert(/inventory_item_id/.test(SPRAYS_W),
  'worker createSpray still wires inventory_item_id on spray_products')
assert(/export async function deleteSpray\b/.test(SPRAYS_W),
  'worker deleteSpray() still exported (reversal path)')
// replaceSprayProducts (S.7b.2) intact.
assert(/async function replaceSprayProducts\(env, sprayId, products\)/.test(SPRAYS_W),
  'replaceSprayProducts() pipeline unchanged (S.7b.2 couple)')
assert(/INSERT INTO inventory_usage/.test(SPRAYS_W),
  'inventory_usage ledger writes intact')
assert(/SELECT \* FROM inventory_usage[\s\S]{0,80}WHERE source_id = \? AND reverted_at IS NULL/.test(SPRAYS_W),
  'inventory_usage reversal SELECT intact')

// ── inventory_usage history NOT touched by edit modal ─────────────
section('Edit modal does NOT touch inventory_usage history')

// The modal only PATCHes inventory_items (via patchInventory which
// hits /api/inventory/:id). It does NOT call recordInventoryUsage,
// listInventoryUsage, or any usage-related helper.
assert(!/inventory_usage/.test(MODAL),
  'modal source contains no reference to inventory_usage (history untouched)')
assert(!/recordInventoryUsage/.test(MODAL),
  'modal does not call recordInventoryUsage')

// ── Cross-vertical guards ─────────────────────────────────────────
section('Cross-vertical guards — DAB + kiosk untouched')

const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const KIOSK = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',      'utf8')
assert(!DAB.includes('Phase I.1'),   'DAB carries no Phase I.1 edits')
assert(!KIOSK.includes('Phase I.1'), 'kiosk carries no Phase I.1 edits')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
