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

console.log('— Phase 7W.2 polish (UI/UX)')
{
  const src = readFileSync(TAB, 'utf8')

  // Summary cards rendered above the bucket grid.
  assert(/function\s+SummaryCards\b/.test(src) && /<SummaryCards\b/.test(src),
    'SummaryCards component defined and rendered')
  assert(/Missing cost basis/.test(src) && /Package size needed/.test(src)
      && /Standalone price/.test(src) && /Conversion needed/.test(src)
      && /Already costed/.test(src) && /Estimated program cost/.test(src),
    'summary cards cover the six required labels (incl. Estimated program cost)')

  // Filter chips for bucket navigation.
  assert(/function\s+FilterChips\b/.test(src) && /<FilterChips\b/.test(src),
    'FilterChips component defined and rendered')
  for (const label of ['All', 'Missing cost', 'Package size', 'Standalone price', 'Conversion', 'Name reconcile', 'Already costed']) {
    assert(new RegExp(`label:\\s*['"]${label}['"]`).test(src),
      `filter chip label "${label}" present`)
  }
  assert(/activeFilter/.test(src) && /setActiveFilter/.test(src),
    'tab maintains an activeFilter state for chip selection')

  // Status badge rendered next to product name.
  assert(/BUCKET_BADGE/.test(src) && /statusBadge\b/.test(src),
    'status badge map + element present in the row')

  // Plain-language action labels.
  assert(/Apply cost basis/.test(src), 'Apply button uses "Apply cost basis"')
  assert(/Preview cost/.test(src),      'shows "Preview cost" when no derivation yet')
  assert(/Clear draft/.test(src),       '"Clear draft" label present')
  assert(/Review item/.test(src),       '"Review item" label present (was "Open in Products editor")')

  // Apply-blocker reason helper with plain-language reasons.
  assert(/function\s+applyBlockerReason\b/.test(src),
    'applyBlockerReason helper defined')
  for (const reason of [
    'Enter package size first.',
    'Standalone price required.',
    'Resolve name match first.',
    'Already costed.',
  ]) {
    assert(src.includes(reason), `blocker reason "${reason}" present`)
  }

  // Updated boundary copy.
  assert(/Applying cost basis updates inventory product pricing only/.test(src),
    'boundary note copy updated per spec')
}

console.log('— Phase 7W.3 draft controls')
{
  const src = readFileSync(TAB, 'utf8')

  // Draft summary strip rendered + computed.
  assert(/function\s+DraftControlsStrip\b/.test(src) && /<DraftControlsStrip\b/.test(src),
    'DraftControlsStrip component defined and rendered')
  assert(/const\s+draftSummary\s*=\s*useMemo/.test(src),
    'tab memoizes draftSummary (filled / previewed / blocked)')

  // Draft-saved indicator + last-saved time wiring.
  assert(/Draft saved in this browser/.test(src),
    'tab shows "Draft saved in this browser" indicator')
  assert(/lastSavedAt/.test(src) && /setLastSavedAt/.test(src),
    'tab tracks lastSavedAt state')
  assert(/showDraftSavedFlash/.test(src) || /draftStatSavedFlash/.test(src),
    'tab carries a transient saved-flash signal')

  // Drafts-only toggle wired to BucketCard filtering.
  assert(/draftsOnly/.test(src) && /setDraftsOnly/.test(src),
    'tab maintains a draftsOnly state')
  assert(/Drafts only/.test(src),
    'Drafts only toggle label present')
  assert(/draftsOnly\s*\?\s*items\.filter\(/.test(src) || /draftsOnly\s*&&\s*items\.length/.test(src),
    'BucketCard filters rows by draftsOnly when enabled')

  // Clear all + confirmation gate (per spec: clear all REQUIRES confirmation).
  assert(/Clear all drafts/.test(src),
    '"Clear all drafts" button label present')
  assert(/function\s+ConfirmClearAllDialog\b/.test(src),
    'ConfirmClearAllDialog component defined')
  assert(/<ConfirmClearAllDialog\b/.test(src),
    'ConfirmClearAllDialog mounted')
  assert(/confirmClearAll/.test(src) && /setConfirmClearAll/.test(src),
    'clear-all wiring has a confirm gate (no direct wipe)')
  // The onClearAll handler must open the dialog, not clear directly.
  assert(/onClearAll=\{\s*\(\)\s*=>\s*setConfirmClearAll\(true\)\s*\}/.test(src),
    'top-level "Clear all" button only opens the confirm dialog')

  // Per-row clear-draft button is still present.
  assert(/Clear draft/.test(src),
    '"Clear draft" per-row label still present')

  // Export — browser-only via Blob + URL.createObjectURL; no API call.
  assert(/Export drafts/.test(src),
    'Export drafts button label present')
  assert(/function\s+exportDraftsCsv\b/.test(src),
    'exportDraftsCsv function defined')
  assert(/new Blob\(/.test(src) && /URL\.createObjectURL\(/.test(src),
    'export uses Blob + URL.createObjectURL (browser-only)')
  assert(!/await\s+fetch\(/.test(src),
    'export does NOT call fetch — browser-only download')

  // localStorage key unchanged.
  assert(/STORAGE_KEY\s*=\s*['"]turfintel:costBasisReviewDrafts\/v1['"]/.test(src),
    'localStorage key remains turfintel:costBasisReviewDrafts/v1')

  // isMeaningfulDraft helper exists so empty drafts don't inflate counts.
  assert(/function\s+isMeaningfulDraft\b/.test(src),
    'isMeaningfulDraft helper defined for stable counts')
}

console.log('— Phase 7X.1 Field Walk Mode')
{
  const src = readFileSync(TAB, 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // Entry button — labeled "Field Walk Mode" and routed through
  // onOpenFieldWalk → openFieldWalk(); never auto-applies.
  assert(/Field Walk Mode/.test(src),
    '"Field Walk Mode" button label present in DraftControlsStrip')
  assert(/function\s+openFieldWalk\b/.test(src),
    'openFieldWalk handler defined')
  assert(/onOpenFieldWalk=\{\s*openFieldWalk\s*\}/.test(src),
    'DraftControlsStrip receives openFieldWalk as onOpenFieldWalk')

  // Field Walk state machinery.
  assert(/fieldWalkOpen/.test(src) && /setFieldWalkOpen/.test(src),
    'tab maintains fieldWalkOpen state')
  assert(/fieldWalkCursor/.test(src) && /setFieldWalkCursor/.test(src),
    'tab maintains a fieldWalkCursor for queue navigation')
  assert(/fieldWalkIncludeCosted/.test(src),
    'tab has an include-already-costed toggle for Field Walk scope')

  // Queue builder defaults to the four "needs confirmation" buckets
  // and excludes already-costed unless the steward opts in.
  assert(/fieldWalkQueue/.test(src) && /useMemo/.test(src),
    'fieldWalkQueue is memoized')
  assert(/['"]missing['"]\s*,\s*['"]conversion['"]\s*,\s*['"]packageSize['"]\s*,\s*['"]standalone['"]\s*,\s*['"]name['"]/.test(src),
    'default queue covers the four needs-confirmation buckets (plus name)')

  // Panel + per-product card components rendered.
  assert(/function\s+FieldWalkPanel\b/.test(src) && /<FieldWalkPanel\b/.test(src),
    'FieldWalkPanel component defined and rendered')
  assert(/function\s+FieldWalkCard\b/.test(src) && /<FieldWalkCard\b/.test(src),
    'FieldWalkCard component defined and rendered')

  // Navigation + exit controls present (per spec: Previous / Next / Skip / Exit).
  for (const label of ['Previous', 'Skip', 'Next', 'Exit Field Walk Mode']) {
    assert(src.includes(label), `Field Walk control label "${label}" present`)
  }
  assert(/Mark reviewed/.test(src),
    '"Mark reviewed" action label present')

  // Mark-reviewed writes to localStorage (via setDraft) — not to D1.
  assert(/function\s+markReviewed\b/.test(src) && /setDraft\(invId,\s*\{\s*reviewed:\s*true/.test(src),
    'markReviewed updates the per-row draft (localStorage), not D1')

  // SAFETY: Field Walk never auto-applies cost basis. The only
  // setInventoryCostBasis call lives in the existing applyDerivedCost
  // handler, and the Field Walk components do not call onApply.
  const fieldWalkBlock = src.slice(src.indexOf('function FieldWalkPanel'), src.indexOf('function formatSavedAt'))
  assert(!/setInventoryCostBasis\(/.test(fieldWalkBlock),
    'Field Walk components NEVER call setInventoryCostBasis')
  assert(!/applyDerivedCost/.test(fieldWalkBlock),
    'Field Walk components NEVER invoke applyDerivedCost')
  assert(!/onApply/.test(fieldWalkBlock),
    'Field Walk components carry no onApply prop')

  // Reviewed marker is back-compat (additive boolean on the draft).
  // isMeaningfulDraft accepts reviewed===true so older drafts without
  // the field still behave as before.
  assert(/d\.reviewed\s*===\s*true/.test(src),
    'isMeaningfulDraft treats reviewed===true as meaningful (back-compat)')

  // Export covers the reviewed marker.
  assert(/['"]reviewed['"]\s*,\s*['"]reviewedAt['"]/.test(src)
      || /reviewed:\s*d\.reviewed\s*\?\s*['"]yes['"]/.test(src),
    'export drafts CSV includes reviewed columns')

  // DO-NOT-MERGE and standalone / name-reconcile warnings render
  // inside the Field Walk card.
  assert(/Do NOT merge/.test(src), 'Field Walk card includes DO NOT MERGE warning copy')
  assert(/Name reconciliation needed/.test(src),
    'Field Walk card includes name-reconciliation warning copy')
  assert(/Standalone vendor price required/.test(src),
    'Field Walk card includes standalone-required warning copy')

  // localStorage key is still the same (no migration).
  assert(/turfintel:costBasisReviewDrafts\/v1/.test(src),
    'localStorage key unchanged')

  // No forbidden surfaces (deduction / usage / spray-program mutation
  // / new routes / migrations) anywhere in the file.
  for (const verb of [
    'recordInventoryUsage', 'deductInventory', 'createSpray',
    'createInventoryItem', 'updateInventoryItem', 'mergeAlias',
    'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `tab still never references ${verb}`)
  }
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
