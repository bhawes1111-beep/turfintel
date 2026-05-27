// Phase 7M (1/?) — Inventory cost-basis audit trail smoke.
//
//   node scripts/smoke-inventory-cost-basis-audit.mjs
//
// Locks:
//   - migration 0046 creates inventory_cost_basis_audit with the spec'd
//     columns + an (inventory_item_id, changed_at DESC) index
//   - migration is additive (CREATE TABLE / CREATE INDEX only; no DML,
//     no product_catalog / budget / invoice / ledger touches)
//   - PATCH endpoint captures the FULL pre-update state, runs the
//     UPDATE, then writes the audit row with previous_* / new_* /
//     change_source / changed_at
//   - changeSource is restricted to manual / import-single-row /
//     unknown; default 'manual' when omitted
//   - audit insert failure surfaces _costBasisAuditError on the body
//     without losing the inventory update
//   - new GET /api/inventory/:id/cost-basis-audit route is wired
//     BEFORE the generic /:id route + the existing /cost-basis route
//   - listInventoryCostBasisAudit handler returns newest-first
//     (ORDER BY datetime(changed_at) DESC)
//   - rowToCostBasisAudit surfaces the camelCased fields
//   - inventoryStore exports listInventoryCostBasisAudit and the
//     setInventoryCostBasis wrapper threads changeSource onto the
//     PATCH body when supplied
//   - CostBasisEditor sends changeSource: 'manual' on both
//     save and clear flows
//   - CostBasisImportReview sends changeSource: 'import-single-row'
//   - CostBasisEditor renders the "Cost basis history" panel + the
//     empty-state copy "No cost basis changes recorded yet."
//   - history panel CSS surface present
//   - boundary invariants hold: no budget / invoice / ledger writes,
//     no inventory deduction, no product_catalog mutation, no PDF /
//     AI extraction wording, no bulk apply, no new write verbs in
//     inventoryStore beyond setInventoryCostBasis
//   - Phase 7F.4 + Phase 7J.1 regression guards still hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration 0046 — additive audit-table schema ──────────────────────
console.log('— worker/migrations/0046_inventory_cost_basis_audit.sql')
{
  const sql = readFileSync('worker/migrations/0046_inventory_cost_basis_audit.sql', 'utf8')

  // Table + spec'd columns.
  assert(/CREATE TABLE IF NOT EXISTS inventory_cost_basis_audit/.test(sql),
    'CREATE TABLE inventory_cost_basis_audit (idempotent)')
  for (const col of [
    'id', 'inventory_item_id', 'course_id',
    'previous_cost_per_unit', 'previous_cost_unit',
    'previous_cost_source',   'previous_cost_notes',
    'new_cost_per_unit', 'new_cost_unit',
    'new_cost_source',   'new_cost_notes',
    'change_source', 'changed_at', 'changed_by', 'notes',
  ]) {
    assert(new RegExp(`\\b${col}\\b`).test(sql),
      `migration defines column ${col}`)
  }
  // Required + default fields.
  assert(/inventory_item_id\s+TEXT\s+NOT NULL/.test(sql),
    'inventory_item_id is NOT NULL')
  assert(/change_source\s+TEXT\s+NOT NULL\s+DEFAULT\s+'unknown'/.test(sql),
    "change_source defaults to 'unknown' (no silent NULLs)")
  assert(/changed_at\s+TEXT\s+NOT NULL/.test(sql),
    'changed_at is NOT NULL')

  // Index for the per-item "newest first" read.
  assert(/CREATE INDEX IF NOT EXISTS idx_inv_cost_basis_audit_item_changed/.test(sql),
    'index idx_inv_cost_basis_audit_item_changed defined')
  assert(/inventory_item_id,\s*changed_at\s+DESC/i.test(sql),
    'index keys on (inventory_item_id, changed_at DESC)')

  // Additive only — no DML, no other-table touches in SQL operations.
  const sqlCodeOnly = sql.replace(/^\s*--.*$/gm, '')
  assert(!/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i.test(sqlCodeOnly),
    'migration SQL contains no DML (CREATE statements only)')
  for (const word of ['product_catalog', 'budget_entries', 'invoices', 'ledger_entries']) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(sqlCodeOnly),
      `migration SQL never references ${word}`)
  }
}

// ── 2. Worker endpoint contract ───────────────────────────────────────────
console.log('— worker/api/inventory.js — patchInventoryCostBasis audit wiring')
{
  const src = readFileSync('worker/api/inventory.js', 'utf8')

  // change_source vocabulary set is server-validated.
  assert(/CHANGE_SOURCE_VALUES\s*=\s*new Set\(\[\s*'manual',\s*'import-single-row',\s*'unknown'\s*\]\)/.test(src),
    "CHANGE_SOURCE_VALUES = { manual, import-single-row, unknown }")
  assert(/changeSource must be one of manual\s*\/\s*import-single-row\s*\/\s*unknown/.test(src),
    'endpoint rejects unknown changeSource with the right message')
  // Default 'manual' when omitted.
  assert(/if\s*\(!changeSource\)\s*changeSource\s*=\s*'manual'/.test(src),
    "endpoint defaults changeSource to 'manual' when omitted")

  // Pre-update SELECT pulls the full previous cost-basis state.
  assert(/SELECT\s+id,\s+course_id,\s+cost_per_unit,\s+cost_unit,\s+cost_source,\s+cost_notes[\s\S]*FROM inventory_items WHERE id = \?/.test(src),
    'pre-update SELECT reads id + course_id + cost-basis columns')

  // Audit INSERT runs AFTER the UPDATE.
  const fn = src.match(/export\s+async\s+function\s+patchInventoryCostBasis[\s\S]*?\n\}\n/)
  assert(!!fn, 'patchInventoryCostBasis body extractable')
  if (fn) {
    const body = fn[0]
    const updateIdx = body.indexOf('UPDATE inventory_items')
    const insertIdx = body.indexOf('INSERT INTO inventory_cost_basis_audit')
    assert(updateIdx > 0 && insertIdx > updateIdx,
      'audit INSERT runs after the inventory UPDATE',
      { updateIdx, insertIdx })
    // INSERT body lists each spec'd column.
    for (const col of [
      'previous_cost_per_unit', 'previous_cost_unit',
      'previous_cost_source',   'previous_cost_notes',
      'new_cost_per_unit', 'new_cost_unit',
      'new_cost_source',   'new_cost_notes',
      'change_source', 'changed_at', 'changed_by', 'notes',
    ]) {
      assert(new RegExp(`\\b${col}\\b`).test(body),
        `audit INSERT column ${col}`)
    }
    // Failure mode: surfaces _costBasisAuditError without losing the
    // inventory update.
    assert(/let\s+auditError\s*=\s*null/.test(body),
      'audit failure tracked in a local auditError variable')
    assert(/_costBasisAuditError:\s*auditError/.test(body),
      'audit failure surfaces on the response body (_costBasisAuditError)')
    // Failure path returns 200-ish JSON (no early notFound)
    assert(/if\s*\(auditError\)\s*\{[\s\S]*return\s+json\(/.test(body),
      'audit failure branch returns json() with the fresh item')

    // change_source value passed to the INSERT.
    assert(/changeSource,?\s*\n\s*changedAt/.test(body),
      'audit INSERT binds changeSource + changedAt in order')

    // No budget / invoice / ledger write paths inside the function.
    for (const word of [
      'budget_entries', 'invoices', 'ledger_entries',
      'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
      'recordInventoryUsage',
    ]) {
      assert(!new RegExp(`\\b${word}\\b`).test(body),
        `patchInventoryCostBasis body never references ${word}`)
    }
    // UPDATE never touches product_catalog or quantity (regression).
    assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/.test(body),
      'audit-aware patch still never writes product_catalog')
    assert(!/UPDATE\s+inventory_items[\s\S]*?\bquantity\s*=/.test(body),
      'audit-aware patch still never decrements quantity')
  }

  // GET handler + mapper.
  assert(/export\s+async\s+function\s+listInventoryCostBasisAudit\s*\(/.test(src),
    'exports listInventoryCostBasisAudit')
  assert(/ORDER BY\s+datetime\(changed_at\)\s+DESC/.test(src),
    'GET handler orders by datetime(changed_at) DESC (newest first)')
  assert(/function\s+rowToCostBasisAudit\s*\(/.test(src),
    'rowToCostBasisAudit mapper defined')
  // Mapper surfaces every camelCased field consumers need.
  for (const camel of [
    'inventoryItemId', 'previousCostPerUnit', 'previousCostUnit',
    'previousCostSource', 'previousCostNotes',
    'newCostPerUnit', 'newCostUnit',
    'newCostSource', 'newCostNotes',
    'changeSource', 'changedAt', 'changedBy', 'notes',
  ]) {
    assert(new RegExp(`\\b${camel}:`).test(src),
      `rowToCostBasisAudit emits ${camel}`)
  }
}

// ── 3. Worker router wiring ───────────────────────────────────────────────
console.log('— worker/index.js — /cost-basis-audit route precedence')
{
  const src = readFileSync('worker/index.js', 'utf8')
  assert(/listInventoryCostBasisAudit/.test(src),
    'worker imports listInventoryCostBasisAudit')
  assert(/\/cost-basis-audit\$/.test(src) || /\/cost-basis-audit/.test(src),
    'worker matches /api/inventory/:id/cost-basis-audit path')
  assert(/return\s+listInventoryCostBasisAudit\(env, id\)/.test(src),
    'GET dispatches to listInventoryCostBasisAudit(env, id)')

  // Audit route appears BEFORE the generic /:id handler (otherwise
  // 'cost-basis-audit' would be swallowed as a sub-id).
  const auditIdx = src.indexOf('listInventoryCostBasisAudit(env, id)')
  const genericIdx = src.indexOf('return getInventory(env, id)')
  assert(auditIdx > 0 && genericIdx > auditIdx,
    'audit GET handler wired before the generic /:id handler',
    { auditIdx, genericIdx })

  // Phase 7J.1 patch handler still wired (regression).
  assert(/patchInventoryCostBasis/.test(src),
    'patchInventoryCostBasis still wired (regression guard)')
}

// ── 4. inventoryStore — wrapper + reader ──────────────────────────────────
console.log('— src/utils/inventory/inventoryStore.js')
{
  const src = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')

  assert(/export\s+async\s+function\s+listInventoryCostBasisAudit\s*\(/.test(src),
    'inventoryStore exports listInventoryCostBasisAudit(inventoryItemId)')
  assert(/cost-basis-audit/.test(src),
    'reader references the /cost-basis-audit path')

  // setInventoryCostBasis threads changeSource onto the body when
  // supplied; default behavior (no key) is preserved.
  assert(/const\s+changeSource\s*=\s*patch\?\.changeSource\s*\?\?\s*null/.test(src),
    'wrapper reads patch.changeSource with a null fallback')
  assert(/if\s*\(changeSource\s*!=\s*null\)\s*body\.changeSource\s*=\s*changeSource/.test(src),
    'wrapper attaches changeSource onto the body only when supplied')

  // Defensive: store never reaches for budget / invoice / ledger /
  // PDF / AI verbs.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'bulkApplyCostBasis', 'applyCostImport', 'commitCostImport',
    'uploadCostImport',   'parseCostImport',
    'parseInvoice', 'parsePdf', 'extractWithAi',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `inventoryStore never references ${verb}`)
  }
}

// ── 5. CostBasisEditor sends changeSource: 'manual' on both flows ─────────
console.log('— CostBasisEditor changeSource attribution + history panel')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisEditor.jsx', 'utf8')

  // Both save (submit) and clear (clearBasis) paths send 'manual'.
  const matches = src.match(/changeSource:\s*'manual'/g) ?? []
  assert(matches.length === 2,
    `editor sends changeSource: 'manual' on both save + clear flows (found ${matches.length})`)

  // Reader import + usage.
  assert(/import\s*\{[^}]*listInventoryCostBasisAudit[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore['"]/.test(src),
    'editor imports listInventoryCostBasisAudit from inventoryStore')
  assert(/await\s+listInventoryCostBasisAudit\(item\.id\)/.test(src),
    'editor calls listInventoryCostBasisAudit(item.id)')

  // History state + lazy fetch.
  assert(/const\s+\[historyOpen,\s*setHistoryOpen\]\s*=\s*useState\(false\)/.test(src),
    'historyOpen state declared (default false)')
  assert(/const\s+\[historyRows,\s*setHistoryRows\]\s*=\s*useState\(\[\]\)/.test(src),
    'historyRows state declared (default [])')

  // History panel + empty-state copy verbatim.
  assert(/<CostBasisHistoryPanel\b/.test(src),
    'editor mounts <CostBasisHistoryPanel>')
  assert(/No cost basis changes recorded yet\./.test(src),
    'editor renders the empty-state copy verbatim')
  assert(/Cost basis history/.test(src),
    'editor renders the "Cost basis history" panel title')

  // Refresh-on-save when the panel is open.
  const refreshHits = src.match(/if\s*\(historyOpen\)\s*refreshHistory\(\)/g) ?? []
  assert(refreshHits.length === 2,
    `editor refreshes history after both save + clear when panel open (found ${refreshHits.length})`)

  // No new write verbs / no direct /api/ or fetch from the editor.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'editor still does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'editor still references no /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'editor issues no direct POST/PATCH/DELETE')

  // Stewardship vocabulary lock.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `editor code-only avoids "${word}"`)
  }
}

// ── 6. CostBasisImportReview sends changeSource: 'import-single-row' ──────
console.log('— CostBasisImportReview changeSource attribution')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

  assert(/changeSource:\s*'import-single-row'/.test(src),
    "import review apply sends changeSource: 'import-single-row'")
  // No other changeSource value in the file (defends against
  // accidental cross-contamination).
  const allCs = src.match(/changeSource:\s*'[^']+'/g) ?? []
  assert(allCs.length === 1 && allCs[0] === "changeSource: 'import-single-row'",
    'no other changeSource label appears in CostBasisImportReview', allCs)
}

// ── 7. Editor CSS gains history-panel classes ─────────────────────────────
console.log('— CostBasisEditor.module.css history classes')
{
  const css = readFileSync('src/pages/Inventory/components/CostBasisEditor.module.css', 'utf8')
  for (const cls of [
    'history', 'historyToggle', 'historyToggleLabel', 'historyToggleChevron',
    'historyBody', 'historyEmpty',
    'historyList', 'historyRow', 'historyHeader',
    'historyTimestamp', 'historySourceChip',
    'historyKv', 'historyActions',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 8. Forbidden-write invariants across surfaces ─────────────────────────
console.log('— Phase 7F.4 + Phase 7J.1 + audit boundary regression guards')
{
  // /completed-link still the sole linkedSprayRecordId write site.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // Phase 7J.1 narrow cost-basis endpoint still wired (regression).
  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'worker still wires patchInventoryCostBasis (regression)')

  // No new bulk endpoint.
  for (const route of [
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import', '/cost-basis/apply-all',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js still never wires ${route}`)
  }

  // worker/api/inventory.js avoids PDF / invoice parser / AI verbs.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js still never references ${verb}`)
  }
  // Product catalog mutation guard.
  assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(apiCode),
    'worker/api/inventory.js never writes product_catalog')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
