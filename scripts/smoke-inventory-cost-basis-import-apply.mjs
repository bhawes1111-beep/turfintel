// Phase 7L (1/?) — Single-row Inventory Cost Import Apply smoke.
//
//   node scripts/smoke-inventory-cost-basis-import-apply.mjs
//
// Locks:
//   - CostBasisImportReview now imports + calls setInventoryCostBasis
//     (the Phase 7J.1 narrow store wrapper) — no new endpoint, no
//     direct fetch, no /api/ reference
//   - Apply is per-row + gated to status === 'ready' AND
//     inventoryItemId present
//   - apply payload is exactly
//     { costPerUnit, costUnit, costSource, costNotes }
//   - applied / error / submitting state lives in the component
//   - non-ready rows render no Apply button (the apply block is
//     wrapped in `isReady && !applied`)
//   - Applied marker renders on success (rowAppliedBadge / row_applied)
//   - Inline error renders on failure (rowError with role="alert")
//   - Clear preview resets text + review + applied + errors + submitting
//   - boundary copy updated to the Phase 7L spec verbatim
//   - NO Apply All / Import All / Commit All / Upload affordance
//     anywhere in the component
//   - no new endpoint added in worker/index.js
//   - inventoryStore still exposes ONLY setInventoryCostBasis as the
//     cost-basis write path — no bulkApplyCostBasis / applyCostImport
//     / commitCostImport / uploadCostImport / parseCostImport
//   - no PDF / invoice / AI extraction wording
//   - Phase 7F.4 + Phase 7J.1 regression guards still hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Component imports + payload contract ───────────────────────────────
console.log('— CostBasisImportReview.jsx single-row apply contract')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

  // Phase 7J.1 store wrapper is now imported and used.
  assert(/import\s*\{[^}]*setInventoryCostBasis[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/inventory\/inventoryStore['"]/.test(src),
    'component imports setInventoryCostBasis from inventoryStore')
  assert(/\bsetInventoryCostBasis\s*\(/.test(src),
    'component calls setInventoryCostBasis(...)')

  // The apply call sends the exact payload spec'd by the phase.
  const norm = src.replace(/\s+/g, ' ')
  assert(/setInventoryCostBasis\s*\(\s*row\.inventoryItemId\s*,\s*\{[^}]*costPerUnit:\s*row\.costPerUnit[^}]*\}\s*\)/.test(norm),
    'apply call passes row.inventoryItemId + costPerUnit')
  assert(/costUnit:\s*row\.costUnit/.test(norm),
    'apply payload includes costUnit: row.costUnit')
  assert(/costSource:\s*row\.costSource/.test(norm),
    'apply payload includes costSource: row.costSource')
  assert(/costNotes:\s*row\.costNotes/.test(norm),
    'apply payload includes costNotes: row.costNotes')

  // Apply is gated to ready rows + an inventoryItemId match.
  const fnApply = src.match(/async\s+function\s+applyRow\s*\([\s\S]*?\n\s*\}\n/)
  assert(!!fnApply, 'applyRow() body extractable')
  if (fnApply) {
    const body = fnApply[0]
    assert(/row\.status\s*!==\s*['"]ready['"]/.test(body),
      'applyRow guards on row.status !== "ready"')
    assert(/!row\.inventoryItemId|row\.inventoryItemId\s*==\s*null/.test(body) ||
           /!row\b[\s\S]*?inventoryItemId/.test(body),
      'applyRow guards on missing inventoryItemId')
  }
}

// ── 2. State + reset contract ─────────────────────────────────────────────
console.log('— component state machine')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

  // Phase 7L.2 — appliedRows is now a Map<rowIndex, { appliedAt,
  // before, after }> so applied rows can render the before/after
  // summary. errorRows + submittingIdx unchanged.
  for (const decl of [
    /const\s+\[appliedRows,\s*setAppliedRows\]\s*=\s*useState\(\s*\(\)\s*=>\s*new Map\(\)\s*\)/,
    /const\s+\[errorRows,\s*setErrorRows\]\s*=\s*useState\(\s*\(\)\s*=>\s*new Map\(\)\s*\)/,
    /const\s+\[submittingIdx,\s*setSubmittingIdx\]\s*=\s*useState\(\s*null\s*\)/,
  ]) {
    assert(decl.test(src), `state declared: ${decl.source}`)
  }

  // clearPreview resets every piece of apply state.
  const fnClear = src.match(/function\s+clearPreview\s*\([\s\S]*?\n\s*\}/)
  assert(!!fnClear, 'clearPreview body extractable')
  if (fnClear) {
    const body = fnClear[0]
    assert(/setText\(\s*['"]['"]\s*\)/.test(body),                'clearPreview resets text')
    assert(/setReview\(\s*null\s*\)/.test(body),                  'clearPreview resets review')
    assert(/setAppliedRows\(\s*new Map\(\)\s*\)/.test(body),      'clearPreview resets appliedRows')
    assert(/setErrorRows\(\s*new Map\(\)\s*\)/.test(body),        'clearPreview resets errorRows')
    assert(/setSubmittingIdx\(\s*null\s*\)/.test(body),           'clearPreview resets submittingIdx')
  }

  // previewRows also resets so a fresh paste doesn't carry stale
  // per-rowIndex applied / error markers.
  const fnPreview = src.match(/function\s+previewRows\s*\([\s\S]*?\n\s*\}/)
  assert(!!fnPreview, 'previewRows body extractable')
  if (fnPreview) {
    const body = fnPreview[0]
    assert(/setAppliedRows\(\s*new Map\(\)\s*\)/.test(body),      'previewRows resets appliedRows')
    assert(/setErrorRows\(\s*new Map\(\)\s*\)/.test(body),        'previewRows resets errorRows')
    assert(/setSubmittingIdx\(\s*null\s*\)/.test(body),           'previewRows resets submittingIdx')
  }
}

// ── 3. ReviewRow renders the right affordances per status ─────────────────
console.log('— ReviewRow apply affordances')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

  // Apply button is gated to isReady && !applied.
  assert(/\{\s*isReady\s*&&\s*!applied\s*&&\s*\(/.test(src),
    'Apply button is gated by isReady && !applied')
  // Applied marker is gated to isReady && applied.
  assert(/\{\s*isReady\s*&&\s*applied\s*&&\s*\(/.test(src),
    'Applied marker is gated by isReady && applied')

  // Button label is "Apply cost basis" (or "Saving…" while submitting).
  assert(/>\s*\{submitting\s*\?\s*['"]Saving…['"]\s*:\s*['"]Apply cost basis['"]\s*\}\s*</.test(src) ||
         /Apply cost basis/.test(src) && /Saving…/.test(src),
    'button renders "Apply cost basis" / "Saving…"')

  // Inline error: <p role="alert"> with the styles.rowError class.
  assert(/styles\.rowError/.test(src) && /role=['"]alert['"]/.test(src),
    'inline error renders with role="alert" + styles.rowError')

  // Applied marker uses styles.rowAppliedBadge.
  assert(/styles\.rowAppliedBadge/.test(src),
    'Applied marker uses styles.rowAppliedBadge')

  // Phase 7L.2 — ReviewRow signature now takes appliedEntry (the
  // Map value carrying { appliedAt, before, after }) rather than a
  // bare applied boolean.
  assert(/function\s+ReviewRow\s*\(\s*\{\s*row,\s*appliedEntry\s*=\s*null,\s*error\s*=\s*null,\s*submitting\s*=\s*false,\s*onApply\s*\}\s*\)/.test(src),
    'ReviewRow signature accepts row + appliedEntry + error + submitting + onApply')
}

// ── 4. No bulk-apply / Upload affordance ──────────────────────────────────
console.log('— no bulk-apply / Upload affordance')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

  // Forbidden button labels — block both "Apply All", "Import All",
  // "Commit All", and "Upload All" button text. Strip JSX comments
  // first so the docstring that calls out what we DON'T add does
  // not count as a label leak.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const phrase of ['Apply All', 'Import All', 'Commit All', 'Upload All']) {
    assert(!codeOnly.includes(phrase),
      `no "${phrase}" label in the component (code-only)`)
  }
  // The single-row button label is "Apply cost basis", which contains
  // the word "Apply"; that's the only allowed Apply-prefixed label.
  // We allow that exact label and block any "Apply" appearing before
  // anything other than " cost basis".
  const stray = src.match(/>\s*Apply(?!\s*cost basis)[^<]*</g) ?? []
  assert(stray.length === 0,
    'no "Apply"-prefixed button label other than "Apply cost basis"',
    stray)

  // Bare "Upload" button text guard — the Phase 7K.2 smoke already
  // checked this; reassert for the regression bound.
  assert(!/>\s*Upload\s*</.test(src),
    'no >Upload< JSX text in the component')
}

// ── 5. Boundary copy updated to the Phase 7L wording ──────────────────────
console.log('— Phase 7L boundary copy verbatim')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')
  const norm = src.replace(/\s+/g, ' ')
  // Phase 7L.2 — boundary copy rewritten so the panel reads as
  // an apply-with-confirmation surface, not a review-only preview.
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

// ── 6. CSS module gains the apply surfaces ────────────────────────────────
console.log('— CostBasisImportReview.module.css apply classes')
{
  const css = readFileSync('src/pages/Inventory/components/CostBasisImportReview.module.css', 'utf8')
  for (const cls of [
    'rowActions', 'btnApplyRow', 'rowError', 'row_applied', 'rowAppliedBadge',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Phase 7K.2 classes still defined (regression).
  for (const cls of [
    'panel', 'header', 'title', 'boundaryNote',
    'textarea', 'btnPrimary', 'btnGhost', 'totalsRow',
    'rowList', 'row', 'rowHeader', 'rowStatusBadge',
    'rowStatus_ready', 'rowStatus_unmatched',
    'rowStatus_ambiguous', 'rowStatus_invalid',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css),
      `Phase 7K.2 class .${cls} still defined`)
  }
}

// ── 7. No new endpoint, no new store path ─────────────────────────────────
console.log('— inventory write surface unchanged')
{
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import', '/cost-basis/apply-all',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  // Phase 7J.1 narrow endpoint still wired.
  assert(/patchInventoryCostBasis/.test(worker),
    'worker still wires patchInventoryCostBasis')

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
    'inventoryStore still exposes setInventoryCostBasis')
  // No new exported async function added in this commit.
  const exports = storeCode.match(/export\s+(?:async\s+)?function\s+\w+/g) ?? []
  // sprayProgramStore-style guard — count expectations live in the
  // inventoryStore file directly. Don't lock the count too tight; we
  // just assert no new write verb listed above slipped through. The
  // setInventoryCostBasis assertion above is the positive guard.
  assert(exports.length > 0, 'inventoryStore still exports functions')
}

// ── 8. Component is read-only against the network ─────────────────────────
console.log('— component issues no direct network call')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'component does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'component never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'component issues no direct POST/PATCH/DELETE')

  // No other write verbs — apply path is setInventoryCostBasis only.
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

// ── 9. Phase 7F.4 regression guard ────────────────────────────────────────
console.log('— Phase 7F.4 /completed-link route still wired')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
