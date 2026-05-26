// Phase 7K (2/?) — Cost Import Review preview UI smoke.
//
//   node scripts/smoke-inventory-cost-basis-import-preview.mjs
//
// Locks:
//   - simpleCsvRows.parseSimpleCsv handles a header row + cells with
//     whitespace, skips empty body lines, never throws on bad input
//   - CostBasisImportReview default-exports the component
//   - component renders the "Cost Import Review" title + boundary
//     copy + textarea + Preview rows + Clear preview buttons
//   - NO Apply / Import / Save / Commit / Upload button or label
//   - component calls buildCostImportReview against live inventory
//   - totals / status badges (ready / unmatched / ambiguous /
//     invalid) are renderable through the rowStatus_* classes
//   - the panel is mounted from InventoryProducts
//   - component issues no fetch / no /api/ / no method strings
//   - component never references setInventoryCostBasis (no apply
//     path), recordInventoryUsage, product_catalog mutations, or
//     budget / invoice / ledger create verbs
//   - Phase 7K stewardship vocabulary lock holds (no AI extraction /
//     OCR / PDF parser / tesseract / openai)
//   - Phase 7F.4 + Phase 7J.1 narrow endpoints remain the only write
//     paths in their respective surfaces

import { readFileSync } from 'fs'
import {
  parseSimpleCsv,
  __TEST,
} from '../src/utils/inventory/simpleCsvRows.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. simpleCsvRows.parseSimpleCsv contract ──────────────────────────────
console.log('— src/utils/inventory/simpleCsvRows.js parseSimpleCsv')
{
  const src = readFileSync('src/utils/inventory/simpleCsvRows.js', 'utf8')
  assert(/export\s+function\s+parseSimpleCsv\s*\(/.test(src),
    'exports parseSimpleCsv')

  // Pure: no fetch / store / react / mutation surface.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly), 'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),               'helper does not fetch')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper code-only contains no write method strings')

  // Behavior.
  const happy = parseSimpleCsv([
    'item,cost per unit,unit,source,notes',
    'Daconil Action,82.50,gal,imported,2026 quote',
    'Heritage,12.00,oz/1000 sq ft,manual,',
  ].join('\n'))
  assert(happy.length === 2, 'parses two body rows', happy.length)
  assert(happy[0]['item'] === 'Daconil Action',         'preserves item value')
  assert(happy[0]['cost per unit'] === '82.50',         'preserves cost-per-unit value')
  assert(happy[0]['source'] === 'imported',             'preserves source value')
  assert(happy[1]['notes'] === '',                      'empty cell becomes empty string')

  // Trim whitespace + skip blank lines.
  const messy = parseSimpleCsv('  item,cost,unit  \n\n   Daconil  ,  4.25 , oz \n\n')
  assert(messy.length === 1,                            'blank body lines skipped')
  assert(messy[0]['item'] === 'Daconil',                'cells trimmed (item)')
  assert(messy[0]['cost'] === '4.25',                   'cells trimmed (cost)')
  assert(messy[0]['unit'] === 'oz',                     'cells trimmed (unit)')

  // Defensive null / empty / non-string returns [].
  assert(parseSimpleCsv(null).length === 0,             'null input returns []')
  assert(parseSimpleCsv('').length === 0,               'empty input returns []')
  assert(parseSimpleCsv('    \n\n\n').length === 0,     'whitespace-only input returns []')

  // Header-only returns [].
  assert(parseSimpleCsv('item,cost,unit').length === 0, 'header-only input returns []')

  // No throw on a single garbage line.
  let threw = false
  try { parseSimpleCsv(',,,,\n,,') } catch { threw = true }
  assert(!threw, 'never throws on malformed body')

  // __TEST surface present (used by smoke; defensive guard).
  assert(typeof __TEST?.splitCells === 'function',
    '__TEST.splitCells is exposed for smoke coverage')
}

// ── 2. CostBasisImportReview component contract ───────────────────────────
console.log('— src/pages/Inventory/components/CostBasisImportReview.jsx (source)')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

  assert(/export\s+default\s+function\s+CostBasisImportReview\s*\(/.test(src),
    'default exports CostBasisImportReview')

  // Title + boundary copy verbatim.
  const norm = src.replace(/\s+/g, ' ')
  assert(norm.includes('Cost Import Review'),
    'header renders "Cost Import Review" title')
  for (const phrase of [
    'Review only — no inventory changes are made.',
    'This does not create budget entries.',
    'This does not process invoices.',
    'Only exact inventory ID or exact name matches are reviewed.',
  ]) {
    assert(norm.includes(phrase),
      `boundary copy verbatim: "${phrase}"`)
  }

  // Sample placeholder.
  assert(/item,cost per unit,unit,source,notes/.test(src),
    'placeholder includes the sample header row')
  assert(/Daconil Action,82\.50,gal,imported,2026 quote/.test(src),
    'placeholder includes the sample body row')

  // Required affordances.
  assert(/<textarea\b/.test(src),                   'textarea present')
  // Labels live as JSX text children of <button>; allow surrounding
  // whitespace / newlines between the > and the label text.
  assert(/>\s*Preview rows\s*</.test(src),          'Preview rows button present')
  assert(/>\s*Clear preview\s*</.test(src),         'Clear preview button present')

  // FORBIDDEN button labels — guard the Apply boundary.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // Look at JSX text content + onClick names: we just block the
  // exact button labels.
  for (const verb of ['Apply', 'Import', 'Save', 'Commit', 'Upload']) {
    // Match a closing > then the verb, then either non-letter (close
    // tag, whitespace, "rows", etc.) — defends against verb appearing
    // in identifier suffixes.
    const re = new RegExp(`>${verb}\\b`)
    assert(!re.test(src),
      `no >"${verb}" button label / JSX text in the component`)
  }

  // Helper reuse.
  assert(/from\s+['"]\.\.\/\.\.\/\.\.\/utils\/inventory\/costBasisImportMapping['"]/.test(src),
    'component imports costBasisImportMapping helpers')
  assert(/\bbuildCostImportReview\b/.test(src),
    'component calls buildCostImportReview')
  assert(/\bsummarizeCostImportReview\b/.test(src),
    'component calls summarizeCostImportReview')
  assert(/from\s+['"]\.\.\/\.\.\/\.\.\/utils\/inventory\/simpleCsvRows['"]/.test(src),
    'component imports parseSimpleCsv')

  // Read-only / no write surface.
  assert(!/\bfetch\(/.test(codeOnly),
    'component does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'component never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'component issues no direct POST/PATCH/DELETE')

  // No write verbs — most importantly no Phase 7J.1 store wrapper
  // (this commit is review-only).
  for (const verb of [
    'setInventoryCostBasis',
    'recordInventoryUsage',
    'createInventoryItem', 'updateInventoryItem', 'deleteInventoryItem',
    'createSpray',         'createCalendarEvent',
    'createBudgetEntry',   'createInvoice',     'createLedgerEntry',
    'patchInventoryCostBasis', 'patchInventoryCatalogLink',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `component never references ${verb}`)
  }

  // Phase 7K out-of-scope language stays out.
  for (const word of [
    'invoice processing','invoice parser','invoice import',
    'ledger entry','pdf parser','pdfParser',
    'ai extraction','aiExtraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly),
      `component code-only avoids "${word}"`)
  }

  // Stewardship vocabulary lock.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly),
      `component code-only avoids "${word}"`)
  }
}

// ── 3. CSS module contracts ───────────────────────────────────────────────
console.log('— CostBasisImportReview.module.css contracts')
{
  const css = readFileSync('src/pages/Inventory/components/CostBasisImportReview.module.css', 'utf8')
  for (const cls of [
    'panel', 'header', 'title',
    'summaryBadge', 'summaryBadgeOk', 'summaryBadgeWarn',
    'boundaryNote',
    'textareaWrap', 'textareaLabel', 'textarea',
    'actions', 'btnPrimary', 'btnGhost',
    'totalsRow', 'tile', 'tileValue', 'tileLabel',
    'tile_ok', 'tile_warn', 'tile_muted',
    'rowList', 'row',
    'row_ready', 'row_unmatched', 'row_ambiguous', 'row_invalid',
    'rowHeader', 'rowIndex', 'rowStatusBadge',
    'rowStatus_ready', 'rowStatus_unmatched',
    'rowStatus_ambiguous', 'rowStatus_invalid',
    'rowKv', 'kvRow', 'kvLabel', 'kvValue', 'rowMessage', 'empty',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Mobile-first breakpoint at 540px.
  assert(/@media\s*\(min-width:\s*540px\)/.test(css),
    'CSS defines mobile breakpoint at 540px')
}

// ── 4. InventoryProducts mounts the review panel ──────────────────────────
console.log('— InventoryProducts mounts <CostBasisImportReview />')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')
  assert(/import\s+CostBasisImportReview\s+from\s+['"]\.\.\/components\/CostBasisImportReview['"]/.test(src),
    'InventoryProducts imports CostBasisImportReview')
  assert(/<CostBasisImportReview\s*\/>/.test(src),
    'InventoryProducts mounts <CostBasisImportReview />')
}

// ── 5. Forbidden-write regression guards ──────────────────────────────────
console.log('— Phase 7F.4 + Phase 7J.1 + cost-import regression guards')
{
  // /completed-link still the only linkedSprayRecordId write site.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // Phase 7J.1 narrow cost-basis endpoint still the only cost write.
  const worker = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(worker),
    'worker still wires patchInventoryCostBasis')
  for (const route of [
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js still never wires ${route}`)
  }

  // inventoryStore still exposes only setInventoryCostBasis; no
  // bulk-apply / commit / upload wrappers were added.
  const store = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  const storeCode = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'bulkApplyCostBasis', 'applyCostImport', 'commitCostImport',
    'uploadCostImport',   'parseCostImport',
    'parseInvoice', 'parsePdf', 'extractWithAi',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(storeCode),
      `inventoryStore still never references ${verb}`)
  }
  assert(/setInventoryCostBasis/.test(store),
    'Phase 7J.1 setInventoryCostBasis wrapper still present')

  // worker/api/inventory.js still avoids the out-of-scope surfaces.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
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
