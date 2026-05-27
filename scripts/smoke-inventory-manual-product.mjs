// Phase 7Q (1/?) — Manual product entry workflow smoke.
//
//   node scripts/smoke-inventory-manual-product.mjs
//
// Locks:
//   - ManualProductForm component exists and renders the spec'd
//     fields (name + kind + category + quantity + unit + vendor +
//     location + notes + costPerUnit + costUnit + costSource +
//     costNotes)
//   - the form uses createInventory for the row save and
//     setInventoryCostBasis (via the narrow PATCH endpoint) for
//     the cost cluster — with changeSource='manual' so the audit
//     row records it
//   - the form does not deduct inventory, does not create a spray
//     record, does not mutate product_catalog, does not write a
//     budget / invoice / ledger row, and does not parse PDFs /
//     invoices / use AI extraction
//   - the form carries the four pilot helper copy lines verbatim
//   - InventoryProducts.jsx mounts <ManualProductForm /> behind a
//     collapsible "+ Add product manually" toggle on the count row
//   - the empty state copy steers the pilot toward adding real
//     Crosswinds products
//   - the Catalog Link drawer section carries the
//     "Catalog links provide read-only agronomic intelligence"
//     helper copy
//   - CostBasisEditor still renders with the cost-basis copy
//     "Cost basis supports planning estimates."
//   - no new endpoint added in worker/index.js
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 regression guards hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. ManualProductForm source contracts ────────────────────────────────
console.log('— src/pages/Inventory/components/ManualProductForm.jsx (source)')
{
  const src = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')

  assert(/export\s+default\s+function\s+ManualProductForm\s*\(/.test(src),
    'default exports ManualProductForm')

  // Uses createInventory for the row save AND lazily imports
  // setInventoryCostBasis for the cost cluster.
  assert(/import\s*\{\s*createInventory\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore['"]/.test(src),
    'form imports createInventory from inventoryStore')
  assert(/await\s+createInventory\(/.test(src),
    'form calls createInventory(...) on submit')
  assert(/import\(['"]\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore['"]\)/.test(src),
    'form dynamically imports setInventoryCostBasis for the cost-cluster commit')
  assert(/setInventoryCostBasis\s*\(/.test(src),
    'form calls setInventoryCostBasis when cost is provided')
  assert(/changeSource:\s*'manual'/.test(src),
    "form sends changeSource: 'manual' on the cost-basis commit")

  // Required + optional fields per spec.
  for (const field of [
    'name', 'kind', 'category', 'unit', 'quantity',
    'location', 'vendor', 'notes',
    'costPerUnit', 'costUnit', 'costSource', 'costNotes',
  ]) {
    assert(new RegExp(`\\b${field}\\b`).test(src),
      `form handles ${field} field`)
  }
  // Kind options must include the three spec'd values.
  for (const v of ["'chemical'", "'fertilizer'", "'product'"]) {
    assert(src.includes(`value: ${v}`),
      `kind option ${v} present`)
  }

  // Pilot helper copy verbatim — all four lines from the spec.
  const norm = src.replace(/\s+/g, ' ')
  for (const line of [
    'Add real Crosswinds products used in the next 30 days first.',
    'Cost basis supports planning estimates.',
    'Catalog links provide read-only agronomic intelligence.',
    'Inventory stock is not deducted from planned spray programs.',
  ]) {
    assert(norm.includes(line),
      `pilot helper copy verbatim: "${line}"`)
  }

  // Strict invariants.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'form does not call fetch() directly (uses store functions)')
  assert(!/\/api\//.test(codeOnly),
    'form never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'form issues no direct POST/PATCH/DELETE')

  // Forbidden write verbs.
  for (const verb of [
    'recordInventoryUsage', 'createSpray', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'patchInventoryCostBasis', 'patchInventoryCatalogLink',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'parsePdf', 'parseInvoice', 'extractWithAi',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `form never references ${verb}`)
  }
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
    assert(!re.test(codeOnly), `form code-only avoids "${word}"`)
  }
}

// ── 2. CSS module classes ────────────────────────────────────────────────
console.log('— ManualProductForm.module.css contracts')
{
  const css = readFileSync('src/pages/Inventory/components/ManualProductForm.module.css', 'utf8')
  for (const cls of [
    'form', 'header', 'title', 'subtitle',
    'section', 'sectionLegend', 'sectionNote',
    'fieldRow', 'field', 'fieldLabel', 'required', 'input',
    'pilotNotes', 'pilotNote',
    'errorBanner', 'actions', 'btnPrimary', 'btnGhost',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  assert(/@media\s*\(max-width:\s*600px\)/.test(css),
    'CSS defines mobile breakpoint at 600px')
}

// ── 3. InventoryProducts mounts + empty-state polish ─────────────────────
console.log('— InventoryProducts mounts <ManualProductForm /> + improved empty state')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')

  assert(/import\s+ManualProductForm\s+from\s+['"]\.\.\/components\/ManualProductForm['"]/.test(src),
    'InventoryProducts imports ManualProductForm')
  assert(/const\s+\[addingProduct,\s*setAddingProduct\]\s*=\s*useState\(false\)/.test(src),
    'addingProduct state declared (default false)')
  assert(/<ManualProductForm[\s\S]*?onSaved=\{[\s\S]*?\}[\s\S]*?onCancel=\{[\s\S]*?\}/.test(src),
    'InventoryProducts mounts <ManualProductForm ... onSaved=... onCancel=... />')

  // Toggle button label.
  assert(/>\s*\+ Add product manually\s*</.test(src),
    'count-row button labeled "+ Add product manually"')

  // Saved row auto-opens its drawer.
  assert(/if\s*\(saved\?\.id\)\s*setSelectedId\(saved\.id\)/.test(src),
    'on save, the form opens the new row\'s drawer via setSelectedId(saved.id)')

  // Empty state copy steers the pilot to real Crosswinds products.
  const norm = src.replace(/\s+/g, ' ')
  assert(norm.includes('Add real Crosswinds chemicals, fertilizers'),
    'empty state copy steers the pilot to real Crosswinds products')

  // Catalog Link section carries the spec's helper copy.
  assert(norm.includes('Catalog links provide read-only agronomic intelligence'),
    'Catalog Link section carries the "read-only agronomic intelligence" helper copy')

  // Mount/render structure didn't accidentally bypass the empty
  // state when items exist — we still render the same list.
  assert(/\{visible\.map\(p\s*=>/.test(src),
    'product list rendering preserved')

  // No new write verbs leaked into the tab.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'recordInventoryUsage', 'createSpray', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'patchInventoryCostBasis', 'patchInventoryCatalogLink',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'parsePdf', 'parseInvoice', 'extractWithAi',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `InventoryProducts never references ${verb}`)
  }
}

// ── 4. Inventory.module.css count-row + add-button classes ───────────────
console.log('— Inventory.module.css count-row classes')
{
  const css = readFileSync('src/pages/Inventory/Inventory.module.css', 'utf8')
  for (const cls of ['ipCount', 'ipCountRow', 'ipAddBtn']) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 5. CostBasisEditor still carries the planning-estimates copy ─────────
console.log('— CostBasisEditor still carries pilot copy')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisEditor.jsx', 'utf8')
  const norm = src.replace(/\s+/g, ' ')
  assert(norm.includes('Cost basis supports planning estimates.'),
    'CostBasisEditor still pins "Cost basis supports planning estimates."')
}

// ── 6. No new endpoint / no behavior expansion in this commit ────────────
console.log('— no new endpoint / no behavior expansion')
{
  const worker = readFileSync('worker/index.js', 'utf8')
  // No NEW endpoints introduced in this commit. The Phase 19
  // /api/inventory/import-label/* routes are pre-existing (PDF
  // wizard) and stay wired — we only confirm no fresh bulk /
  // manual-product / cost-import path appeared.
  for (const route of [
    '/api/inventory/manual',
    '/api/inventory/bulk',
    '/api/inventory/cost-import',
    '/api/cost-import',
    '/manual-product',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  // Phase 7J.1 + 7M.1 endpoints still wired.
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // worker/api/inventory.js still avoids PDF / invoice / AI verbs.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js never references ${verb}`)
  }
  assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(apiCode),
    'worker/api/inventory.js never writes product_catalog')

  // Phase 7F.4 regression guard.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
