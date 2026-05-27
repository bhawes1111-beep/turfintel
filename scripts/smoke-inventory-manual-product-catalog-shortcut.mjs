// Phase 7Q (2/?) — Manual product entry → catalog link shortcut smoke.
//
//   node scripts/smoke-inventory-manual-product-catalog-shortcut.mjs
//
// Locks:
//   - InventoryProducts gains a `selectedSource` state slot, set to
//     `'manual-add'` after a ManualProductForm save and CLEARED on
//     drawer close + on direct row clicks
//   - CatalogLinkSection accepts the new `sourceContext` + `highlight`
//     props with safe defaults
//   - the next-step banner renders only when `!fk` AND
//     (sourceContext === 'manual-add' || highlight === true)
//   - the banner carries the four spec'd lines verbatim
//   - the banner CTA opens the existing CatalogLinkPicker (onOpenPicker)
//     — it is NOT a separate write path
//   - the pulse highlight is gated to highlight && !fk (linked rows
//     never pulse) and the section root carries a
//     data-source-context attribute for future analytics
//   - no auto-linking: setInventoryCatalogLink is only called from
//     the existing Unlink path, never from the manual-add flow
//   - no new endpoint, no new mutation path, no product_catalog
//     mutation, no Add-to-Inventory-from-Catalog behavior, no spray
//     record / inventory deduction / budget / invoice / ledger /
//     PDF / AI / invoice processing behavior
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 regression guards hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const tab  = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')
const css  = readFileSync('src/pages/Inventory/components/CatalogLinkSection.module.css', 'utf8')

// ── 1. selectedSource state + lifecycle ──────────────────────────────────
console.log('— InventoryProducts selectedSource lifecycle')
{
  assert(/const\s+\[selectedSource,\s*setSelectedSource\]\s*=\s*useState\(\s*null\s*\)/.test(tab),
    'selectedSource state declared (default null)')

  // Manual-add save path sets selectedSource = 'manual-add'.
  const savedFn = tab.match(/onSaved=\{[\s\S]*?\}\s*\n\s+onCancel=/)
  assert(!!savedFn, 'ManualProductForm onSaved handler extractable')
  if (savedFn) {
    const body = savedFn[0]
    assert(/setSelectedId\(saved\.id\)/.test(body),
      'manual-add still opens the new row\'s drawer via setSelectedId')
    assert(/setSelectedSource\(\s*['"]manual-add['"]\s*\)/.test(body),
      "manual-add marks the drawer with setSelectedSource('manual-add')")
  }

  // Direct row clicks clear the source so unrelated browsing
  // never shows the next-step banner.
  assert(/onClick=\{\(\)\s*=>\s*\{\s*setSelectedId\(p\.id\);\s*setSelectedSource\(null\)\s*\}\}/.test(tab),
    'direct row click clears selectedSource to null')

  // Drawer close clears the source too. Both close handlers (the
  // SideDrawer onClose and the SideDrawer.Header onClose) clear it.
  const closeMatches = tab.match(/setSelectedId\(null\);\s*setSelectedSource\(null\)/g) ?? []
  assert(closeMatches.length >= 2,
    `both drawer close handlers clear selectedSource (found ${closeMatches.length})`)
}

// ── 2. CatalogLinkSection prop wiring ────────────────────────────────────
console.log('— CatalogLinkSection prop contract')
{
  // Signature accepts the new props with safe defaults.
  assert(/function\s+CatalogLinkSection\s*\(\{\s*inventoryItem,\s*onOpenPicker,\s*onUnlink,\s*sourceContext\s*=\s*null,\s*highlight\s*=\s*false\s*\}\)/.test(tab),
    'CatalogLinkSection signature accepts sourceContext + highlight (with defaults)')

  // The drawer mounts it with the computed highlight.
  assert(/<CatalogLinkSection[\s\S]*?sourceContext=\{selectedSource\}[\s\S]*?highlight=\{selectedSource\s*===\s*['"]manual-add['"]\s*&&\s*!selected\.productCatalogId\}/.test(tab),
    'drawer passes sourceContext + highlight props with the manual-add gate')

  // The section root carries a data-source-context attribute.
  assert(/data-source-context=\{sourceContext\s*\?\?\s*undefined\}/.test(tab),
    'section root emits data-source-context attribute')

  // Pulse class is gated to highlight && !fk so linked rows never
  // pulse.
  assert(/highlight\s*&&\s*!fk\s*\?\s*linkStyles\.nextStepPulse/.test(tab),
    'pulse class gated to highlight && !fk')
}

// ── 3. Next-step banner gating + copy ────────────────────────────────────
console.log('— next-step banner gating + copy')
{
  // Gating expression: !fk && (sourceContext === 'manual-add' || highlight === true)
  assert(/showNextStepBanner\s*=\s*!fk\s*&&\s*\(sourceContext\s*===\s*['"]manual-add['"]\s*\|\|\s*highlight\s*===\s*true\)/.test(tab),
    'showNextStepBanner gate matches spec (!fk && (manual-add || highlight))')

  // Banner JSX wraps the four spec lines verbatim.
  const norm = tab.replace(/\s+/g, ' ')
  for (const line of [
    'Next step: link catalog intelligence.',
    'Catalog links provide read-only agronomic intelligence.',
    'This does not change inventory stock.',
    'Product Catalog remains read-only.',
  ]) {
    assert(norm.includes(line),
      `banner line verbatim: "${line}"`)
  }

  // CTA inside the banner opens the existing picker (onOpenPicker),
  // not a separate write path. The block runs from
  // `{showNextStepBanner && (` through the matching closing `)}`,
  // which contains a single </div> + a final `)}` line.
  const bannerBlock = tab.match(/\{showNextStepBanner\s*&&\s*\(\s*[\s\S]*?<\/div>\s*\)\}/)
  assert(!!bannerBlock, 'banner JSX block extractable')
  if (bannerBlock) {
    const body = bannerBlock[0]
    assert(/onClick=\{onOpenPicker\}/.test(body),
      'banner CTA wires onClick={onOpenPicker}')
    assert(/📋 Link catalog intelligence/.test(body),
      'banner CTA labeled "📋 Link catalog intelligence"')
    // No new write verb in the banner branch.
    for (const verb of [
      'setInventoryCatalogLink', 'setInventoryCostBasis',
      'createInventory', 'recordInventoryUsage',
    ]) {
      assert(!new RegExp(`\\b${verb}\\b`).test(body),
        `banner JSX never references ${verb}`)
    }
  }

  // Linked rows never trigger the banner branch — the !fk gate is
  // explicit; the empty-state branch is a separate conditional.
  assert(/\{!fk\s*&&\s*!showNextStepBanner\s*&&\s*\(/.test(tab),
    'unlinked empty-state branch is mutually exclusive with the banner')
}

// ── 4. CSS module gains the next-step classes ────────────────────────────
console.log('— CatalogLinkSection.module.css gains next-step classes')
{
  for (const cls of [
    'nextStepBanner', 'nextStepBannerLine', 'nextStepPulse',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css),
      `CSS defines .${cls}`)
  }
  assert(/@keyframes\s+ipCatalogPulse\b/.test(css),
    'CSS defines @keyframes ipCatalogPulse')
  assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
    'CSS honors prefers-reduced-motion: reduce')
}

// ── 5. No auto-linking + no Add-to-Inventory from catalog added ──────────
console.log('— manual-add never auto-links the new row')
{
  // The ManualProductForm save flow does NOT call
  // setInventoryCatalogLink anywhere in the JSX.
  const form = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
  const formCode = form
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bsetInventoryCatalogLink\b/.test(formCode),
    'ManualProductForm never references setInventoryCatalogLink')

  // InventoryProducts' onSaved branch does not call
  // setInventoryCatalogLink either.
  const onSavedSlice = tab.match(/onSaved=\{[\s\S]*?\}\s*\n\s+onCancel=/)
  if (onSavedSlice) {
    assert(!/setInventoryCatalogLink/.test(onSavedSlice[0]),
      'onSaved handler never calls setInventoryCatalogLink')
  }

  // No "Add to Inventory from Catalog" affordance anywhere.
  const tabCode = tab
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const phrase of [
    'Add to Inventory', 'Add-to-Inventory', 'createInventoryFromCatalog',
    'autoLinkCatalog', 'autoLink',
  ]) {
    assert(!new RegExp(`\\b${phrase}\\b`).test(tabCode),
      `InventoryProducts never references ${phrase}`)
  }
}

// ── 6. No new endpoint / no behavior expansion in this commit ────────────
console.log('— no new endpoint, no new mutation path')
{
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/api/inventory/auto-link', '/api/inventory/from-catalog',
    '/api/catalog/add-to-inventory', '/catalog-shortcut',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  // Phase 7C.2 + Phase 7J.1 + Phase 7M.1 still wired.
  assert(/patchInventoryCatalogLink/.test(worker),
    'Phase 7C.2 patchInventoryCatalogLink still wired')
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // worker/api/inventory.js avoids the forbidden surfaces.
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

  // Phase 7F.4 still wired.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

// ── 7. Stewardship vocabulary lock for the new copy ──────────────────────
console.log('— stewardship vocabulary lock for the catalog-shortcut copy')
{
  const tabCode = tab
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
    'auto-apply', 'auto-link',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(tabCode), `InventoryProducts code-only avoids "${word}"`)
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
