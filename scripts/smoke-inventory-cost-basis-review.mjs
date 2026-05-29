// Phase 7W.1 — In-app Cost Basis Review tab smoke.
//
//   node scripts/smoke-inventory-cost-basis-review.mjs
//
// Locks the read/write-safety invariants of the new Inventory tab.
//
//   - the tab + CSS exist and the Inventory page wires them in
//   - the only write path is the existing setInventoryCostBasis
//     (Phase 7J.1 PATCH /api/inventory/:id/cost-basis); no direct fetch,
//     no D1, no new route, no migration touched
//   - package-size + standalone-price stay UI-only (localStorage); no
//     schema column reference appears in the component source
//   - no inventory-deduction / usage / spray-program-item mutation
//     vocabulary anywhere in the new file
//   - DO-NOT-MERGE / name-reconcile / standalone-required hints are
//     present and key off the expected product names
//   - the existing CostBasisEditor + setInventoryCostBasis are still in
//     place (regression guard)
//   - the program still seeds exactly 153 items (no seed change)

import { readFileSync, statSync } from 'fs'

const TAB    = 'src/pages/Inventory/tabs/InventoryCostBasisReview.jsx'
const CSS    = 'src/pages/Inventory/tabs/InventoryCostBasisReview.module.css'
const PAGE   = 'src/pages/Inventory/Inventory.jsx'
const STORE  = 'src/utils/inventory/inventoryStore.js'
const EDITOR = 'src/pages/Inventory/components/CostBasisEditor.jsx'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

console.log('— Inventory Cost Basis Review tab source')
{
  let stat = null
  try { stat = statSync(TAB) } catch {}
  assert(!!stat && stat.size > 0, 'tab JSX exists and is non-empty')

  let cssStat = null
  try { cssStat = statSync(CSS) } catch {}
  assert(!!cssStat && cssStat.size > 0, 'tab CSS module exists and is non-empty')

  const src = readFileSync(TAB, 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // Default export.
  assert(/export\s+default\s+function\s+InventoryCostBasisReview\b/.test(src),
    'tab default-exports the React component')

  // The ONLY write path is the existing Phase 7J.1 helper.
  assert(/setInventoryCostBasis\(/.test(code),
    'tab calls the existing setInventoryCostBasis helper')
  // No direct PATCH / fetch / D1 / new route.
  assert(!/\bfetch\(/.test(code),
    'tab never calls fetch() directly (writes go through setInventoryCostBasis)')
  assert(!/\benv\.DB\b/.test(code) && !/from\s+['"]node:sqlite['"]/.test(code),
    'tab never touches D1 directly')
  assert(!/api\/inventory\/.*\/cost-basis/.test(code)
      || /setInventoryCostBasis/.test(code),
    'tab does not bypass the cost-basis endpoint with a hand-rolled URL')

  // The audit path is preserved (changeSource set so 7M.1 attribution
  // lands correctly).
  assert(/changeSource:\s*['"]manual['"]/.test(src),
    'tab tags writes with changeSource:\'manual\' for 7M.1 attribution')

  // No deduction / usage / spray-program-item mutation verbs.
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `tab never references ${verb}`)
  }

  // No new database schema reference — package_size / standalone_price
  // are UI-only drafts (localStorage), not D1 columns.
  for (const col of ['package_size', 'package_size_unit', 'standalone_price']) {
    assert(!new RegExp(`\\b${col}\\b`).test(code),
      `tab does not reference a non-existent ${col} D1 column`)
  }
  assert(/localStorage|STORAGE_KEY/.test(src),
    'tab persists drafts in localStorage (UI-only, no D1)')

  // Confirm-overwrite path exists (per spec: never overwrite non-null
  // cost basis without confirmation).
  assert(/ConfirmOverwriteDialog/.test(src) || /confirmOverwrite/i.test(src),
    'tab has a confirm-overwrite dialog/path for non-null cost basis')

  // DO-NOT-MERGE / name-reconcile / standalone-required hints.
  for (const name of ['Ampliphy 18', 'Veriphy 18']) {
    assert(src.includes(`'${name}'`),
      `tab DO-NOT-MERGE set includes ${name}`)
  }
  assert(src.includes('Prothioconazole'),
    'tab name-reconcile hint includes Prothioconazole')
  for (const name of ['Appear', 'Daconil Action', 'Secure Action', 'Fosetyl Al', 'Segway']) {
    assert(src.includes(`'${name}'`),
      `tab standalone-required hint includes ${name}`)
  }

  // Six buckets in spec order.
  for (const title of [
    'Missing cost basis',
    'Cost basis found — conversion needed',
    'Package size needed',
    'Standalone price needed',
    'Name reconciliation needed',
    'Already costed',
  ]) {
    assert(src.includes(title), `bucket title present: "${title}"`)
  }

  // The derive helper supports the supported unit conversions only;
  // never crosses volume↔weight implicitly (we route to costUnit by the
  // packageSizeUnit string).
  assert(/gal\/case/.test(src) && /lb\/bag/.test(src) && /lb\/pack/.test(src),
    'derive helper handles gal/case, lb/bag, lb/pack')
}

console.log('— Inventory page wiring')
{
  const page = readFileSync(PAGE, 'utf8')
  assert(/import\s+InventoryCostBasisReview\b/.test(page),
    'Inventory page imports InventoryCostBasisReview')
  assert(/['"]Cost Basis Review['"]/.test(page),
    'Inventory TABS includes "Cost Basis Review"')
  assert(/activeTab === 'Cost Basis Review'\s*&&\s*<InventoryCostBasisReview/.test(page),
    'Inventory page mounts InventoryCostBasisReview when its tab is active')
}

console.log('— write-path regression guards (Phase 7J.1 + 7M.1 still wired)')
{
  const store = readFileSync(STORE, 'utf8')
  assert(/export\s+async\s+function\s+setInventoryCostBasis\b/.test(store),
    'setInventoryCostBasis still exported from inventoryStore.js')
  assert(/\/cost-basis\b/.test(store),
    'inventoryStore still references the /cost-basis route')

  const editor = readFileSync(EDITOR, 'utf8')
  assert(/setInventoryCostBasis\(/.test(editor),
    'existing CostBasisEditor still uses setInventoryCostBasis')

  // Worker glue still wired (7J.1 + 7M.1).
  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // No NEW deduction/usage was added on the spray-programs surface, and
  // no new budget/invoice/ledger route was added to inventory.js this
  // phase. (recordInventoryUsage is intentionally defined in
  // worker/api/inventory.js — that's its home since Phase 5 — so we
  // don't gate on its presence there; we only ensure the cost-basis
  // PATCH path didn't grow a budget/ledger surface.)
  const invApi = readFileSync('worker/api/inventory.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(invApi),
      `worker/api/inventory.js still never references ${verb}`)
  }
  const sprayProgApi = readFileSync('worker/api/sprayPrograms.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'recordInventoryUsage', 'deductInventory',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(sprayProgApi),
      `worker/api/sprayPrograms.js still never references ${verb}`)
  }
}

console.log('— program seed invariant')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    'Crosswinds seed still defines exactly 153 spray_program_items rows', itemRows.length)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
