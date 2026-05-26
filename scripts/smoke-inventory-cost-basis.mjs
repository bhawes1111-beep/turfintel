// Phase 7J (1/?) — Inventory cost-basis stewardship foundation smoke.
//
//   node scripts/smoke-inventory-cost-basis.mjs
//
// Locks:
//   - migration 0045 adds the 4 new cost-basis columns
//   - Worker rowToItem surfaces all 4 fields on the JSON shape
//   - narrow PATCH /api/inventory/:id/cost-basis endpoint exists
//   - endpoint validates: costPerUnit must be null or positive,
//     costUnit required when costPerUnit set, costSource restricted
//     to manual/imported/invoice/unknown, body must include
//     costPerUnit key
//   - endpoint never mutates product_catalog
//   - endpoint never deducts inventory.quantity
//   - endpoint never creates inventory_usage / budget / invoice / ledger
//   - cost-basis columns are NOT in MUTABLE_COLUMNS (generic PATCH
//     can't clobber them)
//   - Worker router wires /cost-basis BEFORE the generic /:id route
//   - inventoryStore exports setInventoryCostBasis with the right
//     fetch contract (PATCH, /cost-basis, optimistic update)
//   - CostBasisEditor component + CSS module exist
//   - editor calls setInventoryCostBasis (no direct fetch / no
//     product-catalog write / no usage / no budget verb)
//   - Inventory item drawer mounts <CostBasisEditor>
//   - boundary copy + allowed vocabulary present; forbidden
//     vocabulary absent
//   - existing /api/inventory/:id/catalog-link route still wired

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration 0045 — additive cost-basis columns ────────────────────────
console.log('— worker/migrations/0045_inventory_cost_basis.sql')
{
  const sql = readFileSync('worker/migrations/0045_inventory_cost_basis.sql', 'utf8')
  for (const col of ['cost_unit', 'cost_source', 'cost_updated_at', 'cost_notes']) {
    assert(new RegExp(`ALTER TABLE inventory_items ADD COLUMN ${col}\\b`).test(sql),
      `migration adds column ${col}`)
  }
  // Additive: never CREATE TABLE / DROP / NOT NULL on these new cols.
  assert(!/CREATE TABLE/i.test(sql), 'migration never CREATE TABLE inventory')
  assert(!/DROP TABLE|DROP COLUMN/i.test(sql), 'migration never DROPs')
  assert(!/NOT NULL/.test(sql), 'new cost-basis columns are nullable (NULL default)')
  // No SQL operations against product_catalog / budget / invoice /
  // ledger surfaces. We strip "-- …" comments first so the doc-only
  // mentions explaining what we *don't* do are not flagged as leaks.
  const sqlCodeOnly = sql.replace(/^\s*--.*$/gm, '')
  for (const word of ['product_catalog', 'budget_entries', 'invoices', 'ledger_entries']) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(sqlCodeOnly),
      `migration SQL never references ${word}`)
  }
  assert(!/CREATE\s+TABLE|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i.test(sqlCodeOnly),
    'migration SQL contains no CREATE / INSERT / UPDATE / DELETE — additive ALTERs only')
}

// ── 2. rowToItem surfaces all 4 new fields ─────────────────────────────────
console.log('— worker/api/inventory.js rowToItem')
{
  const src = readFileSync('worker/api/inventory.js', 'utf8')
  for (const pair of [
    [/costUnit:\s*row\.cost_unit/,                'rowToItem maps row.cost_unit → costUnit'],
    [/costSource:\s*row\.cost_source/,            'rowToItem maps row.cost_source → costSource'],
    [/costUpdatedAt:\s*row\.cost_updated_at/,     'rowToItem maps row.cost_updated_at → costUpdatedAt'],
    [/costNotes:\s*row\.cost_notes/,              'rowToItem maps row.cost_notes → costNotes'],
  ]) {
    const [re, label] = pair
    assert(re.test(src), label)
  }
}

// ── 3. Narrow PATCH endpoint contract ──────────────────────────────────────
console.log('— patchInventoryCostBasis source contract')
{
  const src = readFileSync('worker/api/inventory.js', 'utf8')
  assert(/export\s+async\s+function\s+patchInventoryCostBasis\s*\(/.test(src),
    'exports patchInventoryCostBasis')

  // Body-key guard.
  assert(/Body must include 'costPerUnit'/.test(src),
    'endpoint requires costPerUnit key in body')

  // costPerUnit must be null or finite positive.
  assert(/Number\.isFinite\(num\)/.test(src) && /num\s*<=\s*0/.test(src),
    'endpoint validates costPerUnit is null or finite positive')
  assert(/costPerUnit must be null or a positive finite number/.test(src),
    'endpoint surfaces costPerUnit error message')

  // costUnit required when costPerUnit set.
  assert(/costUnit is required when costPerUnit is set/.test(src),
    'endpoint validates costUnit required when costPerUnit set')

  // costSource restricted vocabulary.
  assert(/COST_SOURCE_VALUES\s*=\s*new Set\(\[\s*'manual',\s*'imported',\s*'invoice',\s*'unknown'\s*\]\)/.test(src),
    'COST_SOURCE_VALUES restricts to manual/imported/invoice/unknown')
  assert(/costSource must be one of manual\s*\/\s*imported\s*\/\s*invoice\s*\/\s*unknown/.test(src),
    'endpoint rejects unknown costSource with the right message')

  // Server-stamped timestamp.
  assert(/stampedAt\s*=\s*costPerUnit\s*===\s*null\s*\?\s*null\s*:\s*new Date\(\)\.toISOString\(\)/.test(src),
    'cost_updated_at is server-stamped (or cleared when costPerUnit=null)')

  // Inventory existence check.
  assert(/SELECT id FROM inventory_items WHERE id = \?/.test(src),
    'endpoint verifies inventory row exists before update')

  // UPDATE only writes the cost-basis cluster (+ updated_at). It must
  // NOT touch quantity, product_catalog_id, or any non-cost column.
  // Scope the regex to the cost-basis function body so we don't pick
  // up updateInventory()'s generic UPDATE earlier in the file.
  const fnForUpdate = src.match(/export\s+async\s+function\s+patchInventoryCostBasis[\s\S]*?\n\}\n/)
  const updateMatch = fnForUpdate && fnForUpdate[0].match(/UPDATE inventory_items[\s\S]*?WHERE id = \?/)
  assert(!!updateMatch, 'UPDATE statement inside patchInventoryCostBasis is present')
  if (updateMatch) {
    const upd = updateMatch[0]
    for (const col of ['cost_per_unit', 'cost_unit', 'cost_source', 'cost_updated_at', 'cost_notes', 'updated_at']) {
      assert(new RegExp(`\\b${col}\\s*=`).test(upd),
        `cost-basis UPDATE writes ${col}`)
    }
    for (const col of ['product_catalog_id', 'quantity', 'name', 'kind', 'category']) {
      assert(!new RegExp(`\\b${col}\\s*=`).test(upd),
        `cost-basis UPDATE never writes ${col}`)
    }
  }

  // Endpoint never deducts inventory.quantity / records usage / mutates catalog.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // Within the patchInventoryCostBasis body, no recordInventoryUsage / inventory_usage / product_catalog mutation.
  const fnMatch = codeOnly.match(/export\s+async\s+function\s+patchInventoryCostBasis[\s\S]*?\n\}\n/)
  assert(!!fnMatch, 'function body extractable')
  if (fnMatch) {
    const body = fnMatch[0]
    assert(!/recordInventoryUsage|inventory_usage/.test(body),
      'patchInventoryCostBasis never references inventory_usage')
    assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(body),
      'patchInventoryCostBasis never writes product_catalog')
    for (const word of ['createBudgetEntry', 'createInvoice', 'createLedgerEntry',
                        'budget_entries', 'invoices', 'ledger_entries']) {
      assert(!new RegExp(`\\b${word}\\b`).test(body),
        `patchInventoryCostBasis never references ${word}`)
    }
    assert(!/UPDATE\s+inventory_items[\s\S]*?\bquantity\s*=/i.test(body),
      'patchInventoryCostBasis never decrements quantity')
  }
}

// ── 4. MUTABLE_COLUMNS excludes the new cost-basis cluster ─────────────────
console.log('— MUTABLE_COLUMNS scope')
{
  const src = readFileSync('worker/api/inventory.js', 'utf8')
  const mut = src.match(/const MUTABLE_COLUMNS\s*=\s*\{([\s\S]*?)\}/)
  assert(!!mut, 'MUTABLE_COLUMNS object present')
  if (mut) {
    const body = mut[1]
    // costPerUnit was already present pre-7J (legacy editor); the new
    // 4 stewardship columns must NOT join it.
    for (const apiKey of ['costUnit', 'costSource', 'costUpdatedAt', 'costNotes']) {
      assert(!new RegExp(`\\b${apiKey}:`).test(body),
        `MUTABLE_COLUMNS does not include ${apiKey}`)
    }
  }
}

// ── 5. Router wires /cost-basis BEFORE /:id ────────────────────────────────
console.log('— worker/index.js routing')
{
  const src = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(src),
    'worker imports patchInventoryCostBasis')
  assert(/\/\^\\\/api\\\/inventory\\\/\(\[\^\/\]\+\)\\\/cost-basis\$\//.test(src) ||
    /\/api\/inventory\/[^/]+\/cost-basis/.test(src) ||
    /\/cost-basis\$/.test(src),
    'worker registers /api/inventory/:id/cost-basis route')

  // /cost-basis route appears BEFORE the generic /:id route, so the
  // generic handler doesn't swallow 'cost-basis' as a sub-id.
  const idxCostBasis = src.indexOf("/cost-basis$")
  const idxGenericId = src.search(/\/\^\\\/api\\\/inventory\\\/\(\[\^\/\]\+\)\$\//)
  // Fallback ordering check using direct substring search.
  const idxCostBasisHandler = src.indexOf('patchInventoryCostBasis(env, id, request)')
  const idxGenericHandler   = src.indexOf('return getInventory(env, id)')
  assert(idxCostBasisHandler > 0 && idxGenericHandler > 0 && idxCostBasisHandler < idxGenericHandler,
    '/cost-basis handler is wired before the generic /:id handler',
    { idxCostBasisHandler, idxGenericHandler })

  // Existing catalog-link route still present.
  assert(/patchInventoryCatalogLink/.test(src),
    'existing catalog-link route still wired (regression guard)')
}

// ── 6. inventoryStore client wrapper ───────────────────────────────────────
console.log('— src/utils/inventory/inventoryStore.js')
{
  const src = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')

  assert(/export\s+async\s+function\s+setInventoryCostBasis\s*\(/.test(src),
    'exports setInventoryCostBasis(id, patch)')
  // Targets the narrow endpoint.
  assert(/\/cost-basis['"`]/.test(src) || /cost-basis/.test(src),
    'wrapper references /cost-basis path')
  assert(/method:\s*['"]PATCH['"]/.test(src),
    'wrapper uses PATCH method')
  // Sends the right body keys.
  for (const key of ['costPerUnit', 'costUnit', 'costSource', 'costNotes']) {
    assert(new RegExp(`\\b${key}\\b`).test(src),
      `wrapper body includes ${key}`)
  }
  // Optimistic update path.
  assert(/setState\(\{\s*items:\s*optimistic/.test(src),
    'wrapper writes an optimistic local update before the request')
  // Rollback path on error.
  assert(/setState\(\{\s*items:\s*prev,\s*error:\s*err\.message\s*\}\)/.test(src),
    'wrapper rolls back local items on error')

  // No inventory-usage / catalog-write side trips.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const fnMatch = codeOnly.match(/export\s+async\s+function\s+setInventoryCostBasis[\s\S]*?\n\}\n/)
  assert(!!fnMatch, 'setInventoryCostBasis body extractable')
  if (fnMatch) {
    const body = fnMatch[0]
    for (const word of [
      'recordInventoryUsage', 'product-catalog',
      'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
      '/api/budget', '/api/invoices', '/api/ledger',
    ]) {
      assert(!new RegExp(`${escapeRe(word)}`).test(body),
        `setInventoryCostBasis never references ${word}`)
    }
  }
}

// ── 7. CostBasisEditor UI ──────────────────────────────────────────────────
console.log('— src/pages/Inventory/components/CostBasisEditor.jsx')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisEditor.jsx', 'utf8')

  assert(/export\s+default\s+function\s+CostBasisEditor\s*\(/.test(src),
    'CostBasisEditor default-exports the component')
  assert(/setInventoryCostBasis/.test(src),
    'editor imports + calls setInventoryCostBasis')
  // No direct fetch / no /api/ references / no react-router navigation /
  // no product-catalog mutation.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'editor does not call fetch() directly (uses the store wrapper)')
  assert(!/\/api\//.test(codeOnly),
    'editor never references any /api/ endpoint')
  for (const verb of [
    'recordInventoryUsage', 'createInventoryItem', 'updateInventoryItem',
    'deleteInventoryItem',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'getCatalogProductById',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `editor never references ${verb}`)
  }
  // No POST/PATCH/DELETE method strings directly in the editor.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'editor issues no direct POST/PATCH/DELETE')

  // Boundary copy verbatim.
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Cost basis supports planning estimates.',
    'This does not create budget entries.',
    'This does not deduct inventory.',
    'Product Catalog is not used as a price source.',
  ]) {
    assert(norm.includes(phrase), `boundary copy verbatim: "${phrase}"`)
  }

  // The four allowed COST_SOURCE_OPTIONS values appear.
  for (const v of ['manual', 'imported', 'invoice', 'unknown']) {
    assert(new RegExp(`value:\\s*['"]${v}['"]`).test(src),
      `editor offers source option "${v}"`)
  }

  // Clear-basis affordance + edit button.
  assert(/Clear cost basis/.test(src),       'editor renders "Clear cost basis" button')
  assert(/Edit cost basis|Add cost basis/.test(src), 'editor renders Edit/Add button')

  // Stewardship vocabulary lock.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `no "${word}" wording in editor code`)
  }
}

// ── 8. CostBasisEditor CSS module ──────────────────────────────────────────
console.log('— CostBasisEditor.module.css contracts')
{
  const css = readFileSync('src/pages/Inventory/components/CostBasisEditor.module.css', 'utf8')
  for (const cls of [
    'costBasis', 'header', 'title',
    'kv', 'kvRow', 'kvLabel', 'kvValue', 'kvNotes', 'notesRow',
    'form', 'field', 'fieldLabel', 'input',
    'actions', 'btnPrimary', 'btnGhost', 'btnDangerGhost',
    'errorBanner', 'boundaryNote',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 9. Inventory item drawer mounts the editor ─────────────────────────────
console.log('— Inventory drawer wiring')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')
  assert(/import\s+CostBasisEditor\s+from\s+['"]\.\.\/components\/CostBasisEditor['"]/.test(src),
    'InventoryProducts imports CostBasisEditor')
  assert(/<CostBasisEditor\s+item=\{selected\}/.test(src),
    'InventoryProducts mounts <CostBasisEditor item={selected} />')
}

// ── 10. Forbidden-write regression guards across surfaces ──────────────────
console.log('— Phase 7F.4 + product-catalog regression guards')
{
  const store = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(store),
    'Phase 7F.4 /completed-link route still present')

  // The new cost-basis editor / store wrapper must not have introduced
  // a back-door write into the product catalog.
  const wrapper = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  const wrapperCode = wrapper
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // setInventoryCostBasis body specifically:
  const fnSlice = wrapperCode.match(/export\s+async\s+function\s+setInventoryCostBasis[\s\S]*?\n\}\n/)
  if (fnSlice) {
    assert(!/product-catalog/.test(fnSlice[0]),
      'setInventoryCostBasis body never references /api/product-catalog')
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

// Local helper — escape regex specials in keyword string.
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
