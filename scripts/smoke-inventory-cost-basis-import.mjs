// Phase 7K (1/?) — Inventory cost-basis import-mapping smoke.
//
//   node scripts/smoke-inventory-cost-basis-import.mjs
//
// Locks the pure import-mapping helpers + boundaries:
//   - helper exports the spec'd functions + PROGRAM_*_FILTERS-style
//     test surface
//   - helper has no react / fetch / store imports
//   - helper does not mutate inputs (rows or inventoryProducts)
//   - column aliasing maps every documented alias for name / id /
//     cost / unit / source / notes
//   - inventory id match wins over name match
//   - exact normalized name match works (case + whitespace tolerant)
//   - duplicate normalized names mark ambiguous
//   - unknown name marks unmatched
//   - missing/zero/negative/non-numeric cost marks invalid
//   - missing unit marks invalid when cost is set
//   - costSource defaults to 'imported' when omitted; invalid
//     vocabulary surfaces as 'invalid'
//   - review totals add up across statuses
//   - summarizeCostImportReview produces the clean / dirty shapes
//   - no UI shell, no file upload, no write endpoint added in this
//     commit
//   - no recommendation / judgment / invoice / PDF / AI extraction
//     wording added
//   - Phase 7F.4 + Phase 7J.1 narrow endpoints remain the only
//     write paths in their respective areas

import { readFileSync } from 'fs'
import {
  normalizeCostImportColumns,
  mapCostImportRow,
  buildCostImportReview,
  summarizeCostImportReview,
  __TEST,
} from '../src/utils/inventory/costBasisImportMapping.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/inventory/costBasisImportMapping.js (source)')
{
  const src = readFileSync('src/utils/inventory/costBasisImportMapping.js', 'utf8')

  for (const name of [
    'normalizeCostImportColumns',
    'mapCostImportRow',
    'buildCostImportReview',
    'summarizeCostImportReview',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),     'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),                   'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper code-only contains no write method strings')

  // No backdoor verbs / routes / vocabulary.
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
    'setInventoryCostBasis',  // store wrapper — not used in pure helper
    'createBudgetEntry',      'createInvoice',          'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `helper code-only never references ${verb}`)
  }
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    // Phase 7K explicit out-of-scope markers. 'invoice' itself is an
    // allowed costSource LABEL (manual / imported / invoice / unknown),
    // so it stays in the vocabulary. We instead block the workflow
    // verbs that would imply real invoice processing.
    'invoice processing','invoice parser','invoice import',
    'ledger entry','pdf parser','pdfParser','ai extraction',
    'aiExtraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `helper code-only avoids "${word}"`)
  }

  // No /api/ route or UI mount in the pure helper.
  assert(!/\/api\//.test(codeOnly), 'helper never references any /api/ endpoint')
  assert(!/import\s+styles/.test(codeOnly), 'helper does not import any CSS module')
}

// ── 2. normalizeCostImportColumns — alias coverage ────────────────────────
console.log('— normalizeCostImportColumns aliases')
{
  // Every documented alias surface, written in mixed case / underscores
  // so we exercise the normalizer.
  const samples = [
    { row: { 'Item Name': 'Daconil', 'Cost per Unit': '4.25', 'UOM': 'oz', 'Cost Source': 'Invoice', 'Notes': 'PO-1' },
      expect: { name: 'Daconil', costPerUnit: 4.25, costUnit: 'oz', costSource: 'invoice', costNotes: 'PO-1' } },
    { row: { product: 'Heritage', unit_cost: '$12.50', unit: 'lb' },
      expect: { name: 'Heritage', costPerUnit: 12.5, costUnit: 'lb', costSource: null, costNotes: null } },
    { row: { 'Inventory Item ID': 'inv-9', PRICE: '8', 'Unit of Measure': 'gal' },
      expect: { name: null, inventoryItemId: 'inv-9', costPerUnit: 8, costUnit: 'gal' } },
    // Bizarre extras + leading currency + commas.
    { row: { name: '  Barricade  ', cost: ' $ 1,250.75 ', 'cost unit': 'gal/acre', source: 'Manual' },
      expect: { name: 'Barricade', costPerUnit: 1250.75, costUnit: 'gal/acre', costSource: 'manual' } },
  ]
  for (const { row, expect } of samples) {
    const norm = normalizeCostImportColumns(row)
    for (const [k, v] of Object.entries(expect)) {
      assert(norm[k] === v,
        `normalize("${JSON.stringify(row)}") → ${k} = ${JSON.stringify(v)}`,
        norm)
    }
  }
  // Defensive null / non-object.
  const empty = normalizeCostImportColumns(null)
  assert(empty.name === null && empty.costPerUnit === null,
    'null row returns an all-null shape')
}

// ── 3. mapCostImportRow — match + validate behavior ───────────────────────
console.log('— mapCostImportRow runtime behavior')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil', unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft' },
    { id: 'inv-3', name: 'Barricade', unit: 'lb/acre' },
    // Duplicate normalized name → ambiguous when matched by name only.
    { id: 'inv-4', name: 'Specticle' },
    { id: 'inv-5', name: 'SPECTICLE' }, // intentional case-collision
  ]

  // No-mutation guarantee.
  const invSnap = JSON.stringify(inv)

  // (a) id match wins.
  const byId = mapCostImportRow(
    { inventoryItemId: 'inv-1', cost: 5, unit: 'oz/1000 sq ft' },
    inv, { rowIndex: 0 },
  )
  assert(byId.status === 'ready' && byId.inventoryItemId === 'inv-1',
    'id match → ready, links to inv-1')
  assert(byId.inventoryName === 'Daconil', 'inventoryName is carried onto the result')

  // (b) Exact normalized name match.
  const byName = mapCostImportRow(
    { 'Item Name': '  daconil  ', 'Cost per Unit': '4.25', 'Cost Unit': 'oz/1000 sq ft' },
    inv, { rowIndex: 1 },
  )
  assert(byName.status === 'ready' && byName.inventoryItemId === 'inv-1',
    'normalized name match → ready (case + whitespace tolerant)')

  // (c) Ambiguous name.
  const ambig = mapCostImportRow(
    { name: 'specticle', cost: 1, unit: 'lb/acre' },
    inv, { rowIndex: 2 },
  )
  assert(ambig.status === 'ambiguous',
    'duplicate normalized names → ambiguous')
  assert(/Multiple inventory items match/.test(ambig.message),
    'ambiguous message references multiple inventory items')

  // (d) Unmatched name.
  const miss = mapCostImportRow(
    { name: 'Ghostpro', cost: 1, unit: 'oz' },
    inv, { rowIndex: 3 },
  )
  assert(miss.status === 'unmatched',
    'unknown name → unmatched')
  assert(/No inventory item matches/.test(miss.message),
    'unmatched message references "No inventory item matches"')

  // (e) Missing both id and name.
  const blank = mapCostImportRow(
    { cost: 1, unit: 'oz' },
    inv, { rowIndex: 4 },
  )
  assert(blank.status === 'unmatched',
    'no name + no id → unmatched')
  assert(/Row has no item name or inventory id/.test(blank.message),
    'blank-key message names the missing columns')

  // (f) Missing cost.
  const noCost = mapCostImportRow(
    { name: 'Daconil', unit: 'oz/1000 sq ft' },
    inv, { rowIndex: 5 },
  )
  assert(noCost.status === 'invalid' && /Cost value is missing/.test(noCost.message),
    'missing cost → invalid')

  // (g) Zero / negative / non-numeric cost.
  for (const c of [0, -3, 'abc']) {
    const bad = mapCostImportRow(
      { name: 'Daconil', cost: c, unit: 'oz/1000 sq ft' },
      inv,
    )
    assert(bad.status === 'invalid',
      `cost = ${JSON.stringify(c)} → invalid`,
      bad)
  }

  // (h) Missing unit when cost set.
  const noUnit = mapCostImportRow(
    { name: 'Daconil', cost: 4.25 },
    inv, { rowIndex: 9 },
  )
  assert(noUnit.status === 'invalid' && /Unit is required when a cost is set/.test(noUnit.message),
    'missing unit when cost present → invalid')

  // (i) costSource defaults to 'imported' when omitted.
  const defaultSrc = mapCostImportRow(
    { name: 'Heritage', cost: 8, unit: 'oz/1000 sq ft' },
    inv,
  )
  assert(defaultSrc.status === 'ready' && defaultSrc.costSource === 'imported',
    'omitted source defaults to "imported"')

  // (j) Invalid costSource surfaces as invalid.
  const badSrc = mapCostImportRow(
    { name: 'Heritage', cost: 8, unit: 'oz/1000 sq ft', source: 'banana' },
    inv,
  )
  assert(badSrc.status === 'invalid' && /Source must be one of/.test(badSrc.message),
    'invalid source vocabulary → invalid with the right message')

  // (k) Explicit valid source preserved.
  for (const s of ['manual', 'imported', 'invoice', 'unknown']) {
    const r = mapCostImportRow(
      { name: 'Heritage', cost: 8, unit: 'oz/1000 sq ft', source: s.toUpperCase() },
      inv,
    )
    assert(r.status === 'ready' && r.costSource === s,
      `explicit source "${s}" is preserved and lower-cased`,
      r)
  }

  // (l) Notes carried through, trimmed.
  const withNotes = mapCostImportRow(
    { name: 'Heritage', cost: 8, unit: 'oz/1000 sq ft', notes: '  PO #4321  ' },
    inv,
  )
  assert(withNotes.costNotes === 'PO #4321',
    'notes column passes through trimmed')

  // (m) rowIndex carried verbatim.
  const idxed = mapCostImportRow({ name: 'Heritage', cost: 8, unit: 'oz' }, inv, { rowIndex: 42 })
  assert(idxed.rowIndex === 42, 'rowIndex carried onto the result')

  // (n) Defensive: non-array inventoryProducts.
  const noInv = mapCostImportRow({ name: 'Daconil', cost: 1, unit: 'oz' }, null)
  assert(noInv.status === 'unmatched',
    'non-array inventory → unmatched')

  // No mutation on inventoryProducts after all those calls.
  assert(JSON.stringify(inv) === invSnap, 'mapCostImportRow does not mutate inventoryProducts')

  // The COST_SOURCE_VALUES set surfaced by __TEST is exactly the 4
  // allowed labels.
  assert(__TEST?.COST_SOURCE_VALUES instanceof Set, '__TEST.COST_SOURCE_VALUES is a Set')
  assert([...__TEST.COST_SOURCE_VALUES].sort().join(',') === 'imported,invoice,manual,unknown',
    'allowed source labels: manual / imported / invoice / unknown')
}

// ── 4. buildCostImportReview — totals + grouping ──────────────────────────
console.log('— buildCostImportReview totals')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft' },
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft' },
    { id: 'inv-A', name: 'TwinName' },
    { id: 'inv-B', name: 'twinname' }, // collides on normalize → ambiguous
  ]
  const rows = [
    { name: 'Daconil',  cost: '4.25', unit: 'oz/1000 sq ft' },                  // ready
    { name: 'Heritage', cost: 8,      unit: 'oz/1000 sq ft', source: 'INVOICE' }, // ready
    { name: 'Ghost',    cost: 1,      unit: 'oz' },                              // unmatched
    { name: 'TwinName', cost: 1,      unit: 'oz' },                              // ambiguous
    { name: 'Daconil',  cost: -2,     unit: 'oz/1000 sq ft' },                  // invalid (negative)
    { name: 'Heritage',                unit: 'oz/1000 sq ft' },                 // invalid (missing cost)
  ]

  // No-mutation guards.
  const invSnap  = JSON.stringify(inv)
  const rowsSnap = JSON.stringify(rows)

  const review = buildCostImportReview(rows, inv)
  assert(JSON.stringify(inv) === invSnap,  'review does not mutate inventoryProducts')
  assert(JSON.stringify(rows) === rowsSnap, 'review does not mutate rows')

  const t = review.totals
  assert(t.rowsReviewed === 6, 'rowsReviewed = 6', t.rowsReviewed)
  assert(t.ready       === 2, 'ready = 2',       t.ready)
  assert(t.unmatched   === 1, 'unmatched = 1',   t.unmatched)
  assert(t.ambiguous   === 1, 'ambiguous = 1',   t.ambiguous)
  assert(t.invalid     === 2, 'invalid = 2',     t.invalid)
  assert(t.ready + t.unmatched + t.ambiguous + t.invalid === t.rowsReviewed,
    'totals add up to rowsReviewed')

  // Per-row order + rowIndex preservation.
  assert(review.rows.length === rows.length,
    'one review row per input row')
  for (let i = 0; i < review.rows.length; i++) {
    assert(review.rows[i].rowIndex === i,
      `review.rows[${i}].rowIndex === ${i}`)
  }
}

// ── 5. summarizeCostImportReview ──────────────────────────────────────────
console.log('— summarizeCostImportReview')
{
  // No review.
  const e = summarizeCostImportReview(null)
  assert(e.isClean === true && /No import review available/.test(e.message),
    'null review → clean placeholder')

  // No rows.
  const z = summarizeCostImportReview({ totals: { rowsReviewed: 0, ready: 0, unmatched: 0, ambiguous: 0, invalid: 0 }, rows: [] })
  assert(z.isClean === true && /No rows in this import/.test(z.message),
    'empty review → clean placeholder')

  // All ready.
  const clean = summarizeCostImportReview({
    totals: { rowsReviewed: 3, ready: 3, unmatched: 0, ambiguous: 0, invalid: 0 },
    rows: [],
  })
  assert(clean.isClean === true && /3 of 3 rows ready to apply/.test(clean.message),
    'all-ready review → clean message')

  // Mixed.
  const mixed = summarizeCostImportReview({
    totals: { rowsReviewed: 5, ready: 2, unmatched: 1, ambiguous: 1, invalid: 1 },
    rows: [],
  })
  assert(mixed.isClean === false,
    'mixed review → not clean')
  assert(/2 ready · 1 unmatched · 1 ambiguous · 1 invalid \(of 5\)/.test(mixed.message),
    'mixed review message lists every counter')
}

// ── 6. No UI shell / no write endpoint added ──────────────────────────────
console.log('— Phase 7K boundary: no UI / no write / no AI extraction added')
{
  // No new files under src/components/inventory/CostBasis*Import* or
  // src/pages/Inventory/components/CostBasis*Import*.
  // We scan the inventory store + worker API to make sure no new
  // bulk-apply endpoint or route exists yet.
  const store = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  const storeCode = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'bulkApplyCostBasis', 'applyCostImport', 'commitCostImport',
    'uploadCostImport',  'parseCostImport', 'parseInvoice', 'parsePdf',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(storeCode),
      `inventoryStore never references ${verb}`)
  }
  // Phase 7J.1 narrow endpoint still wired as the only cost-basis write
  // surface.
  assert(/setInventoryCostBasis/.test(store) && /cost-basis/.test(store),
    'Phase 7J.1 narrow cost-basis store wrapper still wired (regression guard)')

  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  // Phase 7J.1 narrow endpoint still wired.
  assert(/patchInventoryCostBasis/.test(worker),
    'worker still wires patchInventoryCostBasis (regression guard)')

  // No PDF / invoice / AI extraction surfaces.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js never references ${verb}`)
  }
}

// ── 7. Phase 7F.4 regression guard ────────────────────────────────────────
console.log('— Phase 7F.4 /completed-link route still wired')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
