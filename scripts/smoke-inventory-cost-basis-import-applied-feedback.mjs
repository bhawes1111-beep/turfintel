// Phase 7L (2/?) — Applied-row refresh + feedback polish smoke.
//
//   node scripts/smoke-inventory-cost-basis-import-applied-feedback.mjs
//
// Locks:
//   - applied state is now a Map<rowIndex, { appliedAt, before, after }>
//     so applied rows can render a timestamp + before/after summary
//   - applyRow captures the live inventory row's pre-apply cost basis
//     into `before` before calling setInventoryCostBasis
//   - applyRow records `after` from the row payload + an ISO
//     appliedAt timestamp on success
//   - clearPreview + previewRows still reset the apply state
//   - totals row gains an Applied counter (between Ready and
//     Unmatched), tied to appliedRows.size
//   - boundary copy refreshed verbatim per the Phase 7L.2 spec
//   - new AppliedSummary / BeforeAfterRow renderers exist, gated to
//     applied rows
//   - timestamp formatter labels recent applies "Applied just now",
//     older applies "Applied <locale string>", and falls back
//     gracefully on bad input
//   - no Apply All / Bulk Apply / Import All / Commit All / Upload
//     button or label added
//   - no new endpoint, no direct fetch, no inventory deduction call,
//     no product_catalog mutation, no budget / invoice / ledger
//     verb, no PDF / AI extraction wording
//   - Phase 7F.4 + Phase 7J.1 regression guards still hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')
const css = readFileSync('src/pages/Inventory/components/CostBasisImportReview.module.css', 'utf8')

// ── 1. State shape — appliedRows is now a Map ─────────────────────────────
console.log('— appliedRows promoted to Map<rowIndex, { appliedAt, before, after }>')
{
  assert(/const\s+\[appliedRows,\s*setAppliedRows\]\s*=\s*useState\(\s*\(\)\s*=>\s*new Map\(\)\s*\)/.test(src),
    'appliedRows initialized via useState(() => new Map())')
  // Phase 7L.1 used Set; the upgrade is real.
  assert(!/setAppliedRows\(\s*new Set\(\)\s*\)/.test(src),
    'no `setAppliedRows(new Set())` calls remain (upgrade is complete)')
  assert(/setAppliedRows\(\s*new Map\(\)\s*\)/.test(src),
    'fresh resets use `new Map()`')
}

// ── 2. applyRow captures before/after + appliedAt timestamp ───────────────
console.log('— applyRow captures before snapshot + after payload + ISO timestamp')
{
  // Match through the very next "  }" (two-space indent + }) followed
  // by a blank line — that's the function's closing brace because
  // every other } in the body sits at deeper indentation.
  const fn = src.match(/async\s+function\s+applyRow\s*\([\s\S]*?\n  \}\n/)
  assert(!!fn, 'applyRow body extractable')
  if (fn) {
    const body = fn[0]

    // Live inventory row lookup before the apply call. The exact
    // expression in the source is
    //   (inventoryItems ?? []).find(i => i?.id === row.inventoryItemId)
    // so we match on the function-body chunk that asserts the lookup
    // is done against inventoryItems and keyed by row.inventoryItemId.
    assert(/inventoryItems[\s\S]*?\.find\([\s\S]*?i\?\.id\s*===\s*row\.inventoryItemId/.test(body),
      'applyRow looks up the live inventory row by id before applying')

    // Before snapshot pulls the cost-basis cluster from the live row.
    assert(/const\s+before\s*=/.test(body),
      'applyRow declares `const before = …`')
    for (const field of ['costPerUnit', 'costUnit', 'costSource', 'costNotes', 'costUpdatedAt']) {
      // Each before field is sourced from the live inventory row (with
      // sensible nullish fallbacks for unit).
      assert(new RegExp(`${field}:\\s*liveRow\\.${field === 'costUnit'
        ? '(?:costUnit\\s*\\?\\?\\s*liveRow\\.unit|costUnit)'
        : field}`).test(body),
        `before.${field} sourced from liveRow.${field}`)
    }

    // After payload mirrors the row contract.
    assert(/const\s+after\s*=\s*\{[^}]*costPerUnit:\s*row\.costPerUnit/.test(body),
      'after.costPerUnit = row.costPerUnit')
    for (const field of ['costUnit', 'costSource', 'costNotes']) {
      assert(new RegExp(`${field}:\\s*row\\.${field}`).test(body),
        `after.${field} = row.${field}`)
    }

    // Map.set with appliedAt + before + after on success.
    assert(/nextApplied\s*=\s*new Map\(appliedRows\)/.test(body),
      'success branch clones appliedRows into a fresh Map')
    assert(/nextApplied\.set\(\s*row\.rowIndex\s*,\s*\{[\s\S]*appliedAt:\s*new Date\(\)\.toISOString\(\)/.test(body),
      'success branch records appliedAt = new Date().toISOString()')
    assert(/before,/.test(body) && /after,/.test(body),
      'success branch stores `before` + `after` on the Map entry')

    // Failure branch does NOT add an applied entry.
    const catchBlk = body.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\}/)
    assert(!!catchBlk, 'catch block extractable')
    if (catchBlk) {
      assert(!/setAppliedRows/.test(catchBlk[0]),
        'failure branch never touches appliedRows')
      assert(/setErrorRows/.test(catchBlk[0]),
        'failure branch records err in errorRows')
    }
  }
}

// ── 3. TotalsRow gains an Applied counter ─────────────────────────────────
console.log('— TotalsRow renders Applied counter')
{
  assert(/function\s+TotalsRow\s*\(\s*\{\s*totals,\s*appliedCount\s*=\s*0\s*\}\s*\)/.test(src),
    'TotalsRow signature includes appliedCount = 0')
  assert(/<Tile\s+label=['"]Applied['"]\s+value=\{appliedCount\}/.test(src),
    'TotalsRow renders <Tile label="Applied" value={appliedCount} />')
  assert(/<TotalsRow\s+totals=\{review\.totals\}\s+appliedCount=\{appliedRows\.size\}\s*\/>/.test(src),
    'TotalsRow mounted with appliedCount={appliedRows.size}')
}

// ── 4. AppliedSummary + BeforeAfterRow rendering ──────────────────────────
console.log('— AppliedSummary + BeforeAfterRow exist and are gated to applied rows')
{
  assert(/function\s+AppliedSummary\s*\(\s*\{\s*entry\s*\}\s*\)/.test(src),
    'AppliedSummary({ entry }) defined')
  assert(/function\s+BeforeAfterRow\s*\(\s*\{\s*label,\s*before,\s*after\s*\}\s*\)/.test(src),
    'BeforeAfterRow({ label, before, after }) defined')

  // ReviewRow now mounts <AppliedSummary entry={appliedEntry} />
  // when isReady && applied.
  assert(/<AppliedSummary\s+entry=\{appliedEntry\}\s*\/>/.test(src),
    'ReviewRow mounts <AppliedSummary entry={appliedEntry} />')

  // ReviewRow signature locked.
  assert(/function\s+ReviewRow\s*\(\s*\{\s*row,\s*appliedEntry\s*=\s*null,\s*error\s*=\s*null,\s*submitting\s*=\s*false,\s*onApply\s*\}\s*\)/.test(src),
    'ReviewRow accepts row + appliedEntry + error + submitting + onApply')

  // Applied summary header includes the badge + timestamp.
  assert(/styles\.appliedHeader/.test(src) && /styles\.appliedTimestamp/.test(src) && /styles\.rowAppliedBadge/.test(src),
    'AppliedSummary header pieces present (badge + timestamp + container)')

  // Before/after grid is conditional on the matched inventory row
  // having a prior costPerUnit; otherwise a "New …" KV list renders.
  assert(/hadPriorCost\s*=\s*before\s*&&\s*before\.costPerUnit\s*!=\s*null/.test(src),
    'hadPriorCost gate uses before.costPerUnit != null')
  assert(/hadPriorCost\s*\?\s*\(/.test(src),
    'AppliedSummary uses the gate to branch between before/after grid and new-only list')
  assert(/<BeforeAfterRow\s+label=['"]Cost['"]/.test(src),
    'BeforeAfterRow Cost line rendered when prior cost exists')
  assert(/<BeforeAfterRow\s+label=['"]Unit['"]/.test(src),
    'BeforeAfterRow Unit line rendered when prior cost exists')
  assert(/<BeforeAfterRow\s+label=['"]Source['"]/.test(src),
    'BeforeAfterRow Source line rendered when prior cost exists')
  assert(/<KV\s+label=['"]New cost['"]/.test(src),
    'new-only KV list renders "New cost" when there was no prior cost')
}

// ── 5. formatAppliedAt fallbacks ──────────────────────────────────────────
console.log('— formatAppliedAt produces friendly strings + safe fallbacks')
{
  const fn = src.match(/function\s+formatAppliedAt\s*\(\s*iso\s*\)\s*\{([\s\S]*?)\n\}/)
  assert(!!fn, 'formatAppliedAt body extractable')
  if (fn) {
    const body = fn[1]
    assert(/Applied just now/.test(body),
      'recent applies render "Applied just now"')
    assert(/toLocaleString/.test(body),
      'older applies render via toLocaleString')
    assert(/return\s+`Applied\s+\$\{iso\}`/.test(body) ||
           /catch\s*\{[\s\S]*?Applied/.test(body),
      'try/catch fallback still labels the value "Applied …"')
    assert(/Number\.isFinite\(ts\)/.test(body),
      'function guards against unparseable ISO strings')
  }
}

// ── 6. CSS module gains the applied-feedback classes ──────────────────────
console.log('— CSS module gains applied-feedback classes')
{
  for (const cls of [
    'appliedSummary', 'appliedHeader', 'appliedTimestamp',
    'beforeAfterGrid', 'beforeAfterRow', 'beforeAfterValue',
    'beforeValue', 'beforeAfterArrow', 'afterValue',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Mobile breakpoint: 540px keeps existing 3-up; new 760px goes 6-up.
  assert(/@media\s*\(min-width:\s*540px\)/.test(css),
    'CSS keeps the 540px breakpoint')
  assert(/@media\s*\(min-width:\s*760px\)/.test(css),
    'CSS adds the 760px 6-tile breakpoint for the Applied counter')
}

// ── 7. Boundary copy verbatim ─────────────────────────────────────────────
console.log('— Phase 7L.2 boundary copy verbatim')
{
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Applied rows update inventory cost basis only.',
    'This does not create budget entries.',
    'Inventory is not deducted.',
    'Review one row at a time before applying.',
  ]) {
    assert(norm.includes(phrase),
      `boundary copy verbatim: "${phrase}"`)
  }
}

// ── 8. No bulk-apply / Upload affordance regression ───────────────────────
console.log('— no Apply All / Bulk Apply / Import All / Commit All / Upload affordance')
{
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const phrase of ['Apply All', 'Bulk Apply', 'Import All', 'Commit All', 'Upload All']) {
    assert(!codeOnly.includes(phrase),
      `no "${phrase}" label in the component (code-only)`)
  }
  // The single-row button label remains exactly "Apply cost basis"
  // (Phase 7L.1). Any other Apply-prefixed JSX text is a leak.
  const stray = src.match(/>\s*Apply(?!\s*cost basis)[^<]*</g) ?? []
  assert(stray.length === 0,
    'no "Apply"-prefixed JSX text other than "Apply cost basis"',
    stray)
  assert(!/>\s*Upload\s*</.test(src),
    'no >Upload< JSX text in the component')
}

// ── 9. Component still issues no direct network call / no new write verb ──
console.log('— component still has no direct fetch / no forbidden verbs')
{
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(!/\bfetch\(/.test(codeOnly),
    'component does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'component never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'component issues no direct POST/PATCH/DELETE')

  for (const verb of [
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

// ── 10. Worker / store regression guards ──────────────────────────────────
console.log('— no new endpoint / bulk endpoint / store write path added')
{
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import', '/cost-basis/apply-all',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  assert(/patchInventoryCostBasis/.test(worker),
    'worker still wires patchInventoryCostBasis (regression guard)')

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
  assert(/setInventoryCostBasis/.test(storeCode),
    'Phase 7J.1 setInventoryCostBasis wrapper still present')

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
  assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(apiCode),
    'worker/api/inventory.js never writes product_catalog')
}

// ── 11. Phase 7F.4 regression guard ───────────────────────────────────────
console.log('— Phase 7F.4 /completed-link route still wired')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
