// Phase 7J (2/?) — Cost Basis Review deep-link polish smoke.
//
//   node scripts/smoke-inventory-cost-basis-deep-link.mjs
//
// Locks:
//   - Cost Basis Review's openInventoryItem navigates with
//     state.focus === 'cost-basis' AND
//     state.source === 'spray-program-cost-basis-review' AND
//     keeps the Phase 7C.2 state shape (activeTab + productId)
//   - Inventory.jsx reads focus/source from location.state and
//     threads them to InventoryProducts as initialFocus +
//     initialSource (initialSelectedId path preserved)
//   - InventoryProducts mounts <CostBasisEditor> with
//     focusIntent + sourceContext + highlight props
//   - CostBasisEditor accepts the new props with sensible defaults
//   - CostBasisEditor renders the Phase 7J.2 review banner ONLY
//     when fromReview is true (no banner without the markers)
//   - banner copy is verbatim: "Review this inventory cost basis…"
//     and "Cost basis supports planning estimates and does not
//     create budget entries."
//   - Phase 7J.1 boundary copy + Phase 7J.1 save path remain
//     intact (no new endpoint, no new write call site, still
//     setInventoryCostBasis only)
//   - direct Inventory usage still works without source state
//   - generic InventoryProducts users don't get focusIntent /
//     sourceContext / highlight side effects accidentally
//   - no budget / invoice / ledger / inventory deduction /
//     product_catalog mutation added
//   - no recommendation / judgment vocabulary added
//   - Phase 7F.4 /completed-link route still wired
//   - Phase 7J.1 PATCH /api/inventory/:id/cost-basis still wired

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Spray Program Planner navigate state ───────────────────────────────
console.log('— SprayProgramPlanner openInventoryItem deep-link state')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')

  // Capture the openInventoryItem body so we can lock the navigate state
  // verbatim.
  const fn = src.match(/function\s+openInventoryItem\s*\([\s\S]*?\n\s*\}\n/)
  assert(!!fn, 'openInventoryItem body extractable')
  if (fn) {
    const body = fn[0]
    assert(/navigate\(['"]\/inventory['"]/.test(body),
      'navigates to /inventory')
    assert(/activeTab:\s*['"]Products['"]/.test(body),
      "state.activeTab === 'Products'")
    assert(/productId:\s*inventoryItemId/.test(body),
      'state.productId === inventoryItemId')
    assert(/focus:\s*['"]cost-basis['"]/.test(body),
      "state.focus === 'cost-basis'")
    assert(/source:\s*['"]spray-program-cost-basis-review['"]/.test(body),
      "state.source === 'spray-program-cost-basis-review'")
  }
}

// ── 2. Inventory.jsx reads + threads focus/source ─────────────────────────
console.log('— Inventory.jsx location.state plumbing')
{
  const src = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')

  assert(/location\.state\?\.focus/.test(src),
    'Inventory.jsx reads location.state.focus')
  assert(/location\.state\?\.source/.test(src),
    'Inventory.jsx reads location.state.source')
  assert(/seedFocus/.test(src) && /seedSource/.test(src),
    'Inventory.jsx assigns local seedFocus + seedSource')

  // Threaded through to InventoryProducts.
  const products = src.match(/<InventoryProducts[\s\S]*?\/>/)
  assert(!!products, '<InventoryProducts ... /> mount is intact')
  if (products) {
    const m = products[0]
    assert(/initialSelectedId=\{seedProduct\}/.test(m),
      'InventoryProducts still receives initialSelectedId={seedProduct}')
    assert(/initialFocus=\{seedFocus\}/.test(m),
      'InventoryProducts receives initialFocus={seedFocus}')
    assert(/initialSource=\{seedSource\}/.test(m),
      'InventoryProducts receives initialSource={seedSource}')
    assert(/onOpenCatalog=\{openCatalogProduct\}/.test(m),
      'InventoryProducts still receives onOpenCatalog (regression)')
  }
}

// ── 3. InventoryProducts threads to CostBasisEditor ───────────────────────
console.log('— InventoryProducts thread to CostBasisEditor')
{
  const src = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')

  assert(/initialFocus\s*=\s*null/.test(src),
    'InventoryProducts default-initialises initialFocus = null')
  assert(/initialSource\s*=\s*null/.test(src),
    'InventoryProducts default-initialises initialSource = null')

  const mount = src.match(/<CostBasisEditor[\s\S]*?\/>/)
  assert(!!mount, '<CostBasisEditor ... /> mount is intact')
  if (mount) {
    const m = mount[0]
    assert(/item=\{selected\}/.test(m),         'editor receives item={selected}')
    assert(/focusIntent=\{initialFocus\}/.test(m),
      'editor receives focusIntent={initialFocus}')
    assert(/sourceContext=\{initialSource\}/.test(m),
      'editor receives sourceContext={initialSource}')
    assert(/highlight=\{initialFocus\s*===\s*['"]cost-basis['"]\s*&&\s*selected\?\.id\s*===\s*initialSelectedId\}/.test(m),
      'editor receives highlight = (focus === cost-basis && selected.id === initialSelectedId)')
  }
}

// ── 4. CostBasisEditor accepts + renders deep-link context ────────────────
console.log('— CostBasisEditor deep-link contract')
{
  const src = readFileSync('src/pages/Inventory/components/CostBasisEditor.jsx', 'utf8')

  // Props with safe defaults.
  assert(/focusIntent\s*=\s*null/.test(src) &&
         /sourceContext\s*=\s*null/.test(src) &&
         /highlight\s*=\s*false/.test(src),
    'CostBasisEditor declares focusIntent / sourceContext / highlight with safe defaults')

  // fromReview gate.
  assert(/sourceContext\s*===\s*['"]spray-program-cost-basis-review['"]/.test(src),
    'fromReview gate matches the source marker')
  assert(/focusIntent\s*===\s*['"]cost-basis['"]/.test(src),
    'fromReview gate also accepts focus marker')

  // Banner copy verbatim.
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Review this inventory cost basis for spray program estimates.',
    'Cost basis supports planning estimates and does not create budget entries.',
  ]) {
    assert(norm.includes(phrase), `banner copy verbatim: "${phrase}"`)
  }

  // Phase 7J.1 boundary copy still pinned.
  for (const phrase of [
    'Cost basis supports planning estimates.',
    'This does not create budget entries.',
    'This does not deduct inventory.',
    'Product Catalog is not used as a price source.',
  ]) {
    assert(norm.includes(phrase), `Phase 7J.1 boundary copy still verbatim: "${phrase}"`)
  }

  // Pulse highlight is opt-in and scoped to highlight=true.
  assert(/setPulse\(true\)/.test(src) && /highlight\]/.test(src) || /highlight,\s*item\?\.id\]/.test(src),
    'highlight=true triggers the pulse useEffect')
  assert(/scrollIntoView/.test(src),
    'highlight branch attempts scrollIntoView (defensive try/catch)')

  // The banner ONLY renders when fromReview is true.
  const bannerBlockMatch = src.match(/\{fromReview\s*&&\s*\(\s*<div[\s\S]*?<\/div>\s*\)\}/)
  assert(!!bannerBlockMatch, 'review banner JSX is guarded by fromReview')

  // Phase 7J.1 save path is still the ONLY mutation in this component:
  // - imports setInventoryCostBasis
  // - calls it for both edit + clear flows
  // - no other write verb, no /api/, no direct fetch, no method strings.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(/setInventoryCostBasis\b/.test(codeOnly),
    'editor still imports + calls setInventoryCostBasis')
  assert(!/\bfetch\(/.test(codeOnly),
    'editor still does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'editor still references no /api/ endpoint')
  for (const verb of [
    'recordInventoryUsage', 'createInventoryItem', 'updateInventoryItem',
    'deleteInventoryItem',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'getCatalogProductById',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `editor never references ${verb}`)
  }
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'editor issues no direct POST/PATCH/DELETE')

  // Stewardship vocabulary lock — re-asserted to cover the new banner
  // text added in this commit.
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

// ── 5. CSS module gains the deep-link surfaces ────────────────────────────
console.log('— CostBasisEditor.module.css deep-link classes')
{
  const css = readFileSync('src/pages/Inventory/components/CostBasisEditor.module.css', 'utf8')
  for (const cls of [
    'reviewBanner', 'reviewBannerLine', 'costBasisPulse',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  assert(/@keyframes\s+cbPulse\b/.test(css),
    'CSS defines @keyframes cbPulse')
  assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
    'CSS respects prefers-reduced-motion: reduce')
  // Phase 7J.1 classes preserved (regression guard).
  for (const cls of [
    'costBasis', 'header', 'title',
    'kv', 'form', 'field', 'input',
    'btnPrimary', 'btnGhost', 'btnDangerGhost',
    'boundaryNote',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css),
      `Phase 7J.1 class .${cls} still defined`)
  }
}

// ── 6. Direct Inventory usage still works ─────────────────────────────────
console.log('— direct Inventory entry preserved')
{
  // When the user opens /inventory directly (no route state) the
  // existing flow continues to work: seedTab defaults to 'Overview',
  // seedProduct = null, seedFocus = null, seedSource = null.
  // InventoryProducts receives nulls and CostBasisEditor's
  // fromReview gate stays false, so neither the banner nor the
  // pulse triggers.
  const src = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')
  assert(/seedTab\s*=\s*TABS\.includes\(location\.state\?\.activeTab\)\s*\?\s*location\.state\.activeTab\s*:\s*['"]Overview['"]/.test(src),
    'seedTab still defaults to Overview when state.activeTab is absent')
  assert(/seedProduct\s*=\s*location\.state\?\.productId\s*\?\?\s*null/.test(src),
    'seedProduct still defaults to null')
  // The new keys also default to null.
  assert(/seedFocus\s*=\s*location\.state\?\.focus\s*\?\?\s*null/.test(src),
    'seedFocus defaults to null')
  assert(/seedSource\s*=\s*location\.state\?\.source\s*\?\?\s*null/.test(src),
    'seedSource defaults to null')
}

// ── 7. Forbidden-write regression guards ──────────────────────────────────
console.log('— Phase 7F.4 + cost-basis + catalog regression guards')
{
  // /completed-link still the only linkedSprayRecordId write site.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // Phase 7J.1 narrow cost-basis endpoint still wired.
  const wIdx = readFileSync('worker/index.js', 'utf8')
  assert(/patchInventoryCostBasis/.test(wIdx),
    'worker still wires patchInventoryCostBasis')
  assert(/cost-basis\$/.test(wIdx) || /\/cost-basis/.test(wIdx),
    'worker still routes /api/inventory/:id/cost-basis')

  // Phase 7J.1 store wrapper still the only client-side write path.
  const store = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
  assert(/setInventoryCostBasis/.test(store),
    'inventoryStore still exports setInventoryCostBasis')
  assert(/cost-basis/.test(store),
    'inventoryStore wrapper still targets /cost-basis')

  // No new endpoint added in this commit.
  const workerApi = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = workerApi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // Count export async function declarations in worker/api/inventory.js
  // to lock the surface size. Phase 7J.1 introduced exactly 8 exported
  // handlers: rowToItem, listInventory, getInventory, createInventory,
  // updateInventory, patchInventoryCatalogLink, patchInventoryCostBasis,
  // deleteInventory, listInventoryUsage, recordInventoryUsage.
  const exports = apiCode.match(/export\s+(?:async\s+)?function\s+\w+/g) ?? []
  assert(exports.length === 10,
    `worker/api/inventory.js still exports the same 10 handlers (got ${exports.length})`,
    exports.map(s => s.replace('export ', '')))

  // No budget / invoice / ledger surface.
  for (const route of ['/api/budget', '/api/invoices', '/api/ledger']) {
    assert(!apiCode.includes(route),
      `worker/api/inventory.js still avoids ${route}`)
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
