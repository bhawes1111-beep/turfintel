// Phase 9B.2 — Inventory tab simplification smoke.
//
//   node scripts/smoke-inventory-tabs.mjs
//
// Source-only checks against src/pages/Inventory/Inventory.jsx +
// Inventory.module.css. Crosswinds (courseId 'crossroads-gc') gets
// a simplified 5-tab nav + a synthetic "More" tab whose body
// renders a secondary pill row for 7 advanced surfaces. Non-
// Crosswinds courses keep the existing 11-tab layout byte-for-byte.
// PageShell.jsx, every Inventory tab component file, App.jsx
// routing, and every store are untouched.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const INV = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')
const CSS = readFileSync('src/pages/Inventory/Inventory.module.css', 'utf8')

// ── Crosswinds gate wiring ──────────────────────────────────────────────
section('Phase 9B.2 — Crosswinds gate wiring')

assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(INV),
  'Inventory.jsx imports useSelectedCourseId')
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(INV),
  "Inventory.jsx declares CROSSWINDS_COURSE_ID = 'crossroads-gc'")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(INV),
  'isCrosswinds boolean is derived from courseId')

// ── Legacy 11-tab list preserved ────────────────────────────────────────
section('Legacy 11-tab list preserved (non-Crosswinds)')

assert(/const\s+LEGACY_TABS\s*=\s*\[/.test(INV),
  'LEGACY_TABS constant exists')
for (const t of [
  'Overview', 'Products', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel',
  'Low Stock', 'Purchase History', 'Catalog', 'Link Review', 'Cost Basis Review',
]) {
  assert(new RegExp(`['"]${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`).test(INV),
    `legacy tab "${t}" present in source`)
}

// ── Crosswinds 5-tab list ───────────────────────────────────────────────
section('Crosswinds visible tabs (exact 5 in order)')

assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Products'\s*,\s*'Low Stock'\s*,\s*'Purchases'\s*,\s*'Cost Review'\s*,\s*'More'\s*\]/.test(INV),
  "CROSSWINDS_TABS = ['Products', 'Low Stock', 'Purchases', 'Cost Review', 'More']")

// ── Crosswinds More inner row (exact 7) ─────────────────────────────────
section('Crosswinds More inner row (exact 7 in order)')

assert(/const\s+CROSSWINDS_MORE\s*=\s*\[\s*'Overview'\s*,\s*'Chemicals'\s*,\s*'Fertilizer'\s*,\s*'Parts'\s*,\s*'Fuel'\s*,\s*'Catalog'\s*,\s*'Link Review'\s*\]/.test(INV),
  "CROSSWINDS_MORE = ['Overview', 'Chemicals', 'Fertilizer', 'Parts', 'Fuel', 'Catalog', 'Link Review']")

// ── Legacy → Crosswinds label remap ─────────────────────────────────────
section('CROSSWINDS_LABEL_REMAP — legacy label translation')

assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Purchase History'\s*:\s*'Purchases'/.test(INV),
  "remap 'Purchase History' → 'Purchases'")
assert(/CROSSWINDS_LABEL_REMAP\s*=\s*\{[\s\S]*?'Cost Basis Review'\s*:\s*'Cost Review'/.test(INV),
  "remap 'Cost Basis Review' → 'Cost Review'")

// ── All 11 tab component imports still present ─────────────────────────
section('All 11 original tab component imports preserved')

for (const comp of [
  'InventoryOverview', 'InventoryProducts', 'InventoryChemicals',
  'InventoryFertilizer', 'InventoryParts', 'InventoryFuel',
  'InventoryLowStock', 'InventoryPurchaseHistory', 'InventoryCatalog',
  'InventoryLinkReview', 'InventoryCostBasisReview',
]) {
  assert(new RegExp(`import\\s+${comp}\\s+from\\s+'.\\/tabs\\/${comp}'`).test(INV),
    `import ${comp} still present`)
}

// ── Crosswinds branch mappings (5 primary + 7 More) ─────────────────────
section('Crosswinds tab → component mappings')

// Primary 5.
assert(/activeTab === 'Products'\s*&&\s*<InventoryProducts \{\.\.\.productsProps\}/.test(INV),
  "Crosswinds 'Products' → <InventoryProducts {...productsProps} />")
assert(/activeTab === 'Low Stock'\s*&&\s*<InventoryLowStock \/>/.test(INV),
  "Crosswinds 'Low Stock' → <InventoryLowStock />")
assert(/activeTab === 'Purchases'\s*&&\s*<InventoryPurchaseHistory \/>/.test(INV),
  "Crosswinds 'Purchases' → <InventoryPurchaseHistory />")
assert(/activeTab === 'Cost Review'\s*&&\s*<InventoryCostBasisReview \/>/.test(INV),
  "Crosswinds 'Cost Review' → <InventoryCostBasisReview />")

// More inner 7.
assert(/moreTab === 'Overview'\s*&&\s*<InventoryOverview \/>/.test(INV),
  "More inner 'Overview' → <InventoryOverview />")
assert(/moreTab === 'Chemicals'[\s\S]{0,80}<InventoryChemicals onOpenCatalog=\{openCatalogProduct\} \/>/.test(INV),
  "More inner 'Chemicals' → <InventoryChemicals onOpenCatalog={openCatalogProduct} />")
assert(/moreTab === 'Fertilizer'[\s\S]{0,80}<InventoryFertilizer onOpenCatalog=\{openCatalogProduct\} \/>/.test(INV),
  "More inner 'Fertilizer' → <InventoryFertilizer onOpenCatalog={openCatalogProduct} />")
assert(/moreTab === 'Parts'\s*&&\s*<InventoryParts \/>/.test(INV),
  "More inner 'Parts' → <InventoryParts />")
assert(/moreTab === 'Fuel'\s*&&\s*<InventoryFuel \/>/.test(INV),
  "More inner 'Fuel' → <InventoryFuel />")
assert(/moreTab === 'Catalog'[\s\S]{0,160}<InventoryCatalog initialSelectedId=\{catalogSeedId\}/.test(INV),
  "More inner 'Catalog' → <InventoryCatalog initialSelectedId={catalogSeedId} ... />")
assert(/moreTab === 'Link Review'[\s\S]{0,80}<InventoryLinkReview onOpenCatalog=\{openCatalogProduct\} \/>/.test(INV),
  "More inner 'Link Review' → <InventoryLinkReview onOpenCatalog={openCatalogProduct} />")

// ── Non-Crosswinds legacy branch maps all 11 originals ─────────────────
section('Non-Crosswinds legacy mappings preserved (all 11)')

const LEGACY_PAIRS = [
  ['Overview',           'InventoryOverview'],
  ['Chemicals',          'InventoryChemicals'],
  ['Fertilizer',         'InventoryFertilizer'],
  ['Parts',              'InventoryParts'],
  ['Fuel',               'InventoryFuel'],
  ['Low Stock',          'InventoryLowStock'],
  ['Purchase History',   'InventoryPurchaseHistory'],
  ['Link Review',        'InventoryLinkReview'],
  ['Cost Basis Review',  'InventoryCostBasisReview'],
]
for (const [label, comp] of LEGACY_PAIRS) {
  const re = new RegExp(`activeTab === '${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'\\s*&&\\s*<${comp}`)
  assert(re.test(INV),
    `legacy '${label}' → <${comp} ...> still rendered`)
}
// Products on legacy branch spreads productsProps just like Crosswinds.
assert(/activeTab === 'Products'\s*&&\s*<InventoryProducts \{\.\.\.productsProps\}/.test(INV),
  "legacy 'Products' → <InventoryProducts {...productsProps} />")
// Catalog on legacy branch carries the catalogSeedId props.
assert(/activeTab === 'Catalog'[\s\S]{0,160}<InventoryCatalog initialSelectedId=\{catalogSeedId\}/.test(INV),
  "legacy 'Catalog' → <InventoryCatalog initialSelectedId={catalogSeedId} ... />")

// ── Tab list branches on isCrosswinds ──────────────────────────────────
section('Tab list selection branches on isCrosswinds')

assert(/const\s+tabs\s*=\s*isCrosswinds \? CROSSWINDS_TABS : LEGACY_TABS/.test(INV),
  'tabs = isCrosswinds ? CROSSWINDS_TABS : LEGACY_TABS')
assert(/tabs=\{tabs\}/.test(INV),
  'PageShell receives tabs={tabs}')

// ── moreTab state ───────────────────────────────────────────────────────
section('moreTab state for the More inner row')

assert(/\[moreTab,\s*setMoreTab\]\s*=\s*useState\(seed\.moreTab\)/.test(INV),
  '[moreTab, setMoreTab] state hook seeded from resolver')

// ── Default tab initializer (course-aware, via resolveSeedTabs) ────────
section('Default tab initializer via resolveSeedTabs')

assert(/function\s+resolveSeedTabs\s*\(\s*seedActive,\s*isCrosswinds\s*\)/.test(INV),
  'resolveSeedTabs(seedActive, isCrosswinds) helper is defined')
// Crosswinds fallback default.
assert(/isCrosswinds[\s\S]{0,200}activeTab:\s*'Products'/.test(INV),
  "Crosswinds default activeTab is 'Products'")
// Non-Crosswinds fallback default.
assert(/activeTab:\s*'Overview',\s*moreTab:\s*'Overview'/.test(INV),
  "Non-Crosswinds default activeTab is 'Overview'")
// Resolver applies the legacy label remap before checking buckets.
assert(/CROSSWINDS_LABEL_REMAP\[seedActive\]\s*\?\?\s*seedActive/.test(INV),
  'resolver applies CROSSWINDS_LABEL_REMAP to translate legacy seeds')
// Resolver routes a More child into (activeTab='More', moreTab=child).
assert(/CROSSWINDS_MORE\.includes\(translated\)[\s\S]{0,120}activeTab:\s*'More',\s*moreTab:\s*translated/.test(INV),
  'resolver routes More-child seeds into (activeTab=More, moreTab=child)')
// Resolver respects a Crosswinds primary tab seed verbatim.
assert(/CROSSWINDS_TABS\.includes\(translated\)[\s\S]{0,120}activeTab:\s*translated/.test(INV),
  'resolver routes Crosswinds primary seed verbatim')

// ── Products deep-link props ───────────────────────────────────────────
section('Products deep-link props preserved')

assert(/const\s+productsProps\s*=\s*\{[\s\S]{0,300}initialSelectedId:\s*seedProduct[\s\S]{0,200}initialFocus:\s*seedFocus[\s\S]{0,200}initialSource:\s*seedSource[\s\S]{0,200}onOpenCatalog:\s*openCatalogProduct/.test(INV),
  'productsProps carries seedProduct, seedFocus, seedSource, onOpenCatalog')
// Both branches spread productsProps onto <InventoryProducts>.
const productsSpreads = (INV.match(/<InventoryProducts \{\.\.\.productsProps\}/g) ?? []).length
assert(productsSpreads === 2,
  '<InventoryProducts {...productsProps} /> rendered in both Crosswinds + legacy branches', productsSpreads)

// ── openCatalogProduct cross-tab handoff ───────────────────────────────
section('openCatalogProduct cross-tab handoff')

assert(/function\s+openCatalogProduct\(productCatalogId\)/.test(INV),
  'openCatalogProduct(productCatalogId) is defined')
// Crosswinds branch routes to More → Catalog.
assert(/openCatalogProduct\([\s\S]{0,800}isCrosswinds[\s\S]{0,120}setActiveTab\('More'\)[\s\S]{0,80}setMoreTab\('Catalog'\)/.test(INV),
  "openCatalogProduct on Crosswinds: setActiveTab('More') + setMoreTab('Catalog')")
// Non-Crosswinds branch still routes directly to Catalog tab.
assert(/openCatalogProduct\([\s\S]{0,800}setActiveTab\('Catalog'\)/.test(INV),
  "openCatalogProduct on non-Crosswinds: setActiveTab('Catalog')")
// catalogSeedId / onConsumeSeed pattern preserved.
assert(/setCatalogSeedId\(productCatalogId\)/.test(INV),
  'openCatalogProduct still seeds catalogSeedId for the receiver')
assert(/onConsumeSeed=\{\(\) => setCatalogSeedId\(null\)\}/.test(INV),
  'onConsumeSeed callback still wired to setCatalogSeedId(null)')

// ── ChemicalImportWizard onSaved handoff ───────────────────────────────
section('Chemical import wizard handoff (Crosswinds → More)')

assert(/function\s+handleChemicalImported\(\)/.test(INV),
  'handleChemicalImported() helper exists')
assert(/handleChemicalImported[\s\S]{0,200}isCrosswinds[\s\S]{0,80}setActiveTab\('More'\)[\s\S]{0,80}setMoreTab\('Chemicals'\)/.test(INV),
  "Crosswinds chemical-import lands on More → Chemicals")
assert(/onSaved=\{handleChemicalImported\}/.test(INV),
  'ChemicalImportWizard onSaved wired to handleChemicalImported')

// ── Orders button rewiring ─────────────────────────────────────────────
section('Header "Orders" button rewiring (Crosswinds → Purchases)')

assert(/setActiveTab\(isCrosswinds \? 'Purchases' : 'Purchase History'\)/.test(INV),
  "'Orders' button: Crosswinds → 'Purchases', legacy → 'Purchase History'")

// ── CSS classes for the More inner row ─────────────────────────────────
section('CSS classes for the More inner row')

for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(new RegExp(`\\.${cls}\\b`).test(CSS),
    `CSS defines .${cls}`)
  assert(new RegExp(`styles\\.${cls}`).test(INV),
    `Inventory.jsx wires styles.${cls}`)
}

// ── Cross-file guards ──────────────────────────────────────────────────
section('Cross-file guards — PageShell + tab components + App untouched')

const PS = readFileSync('src/components/layout/PageShell.jsx', 'utf8')
assert(!PS.includes('Phase 9B.2'),
  'PageShell.jsx carries no Phase 9B.2 edits')

for (const comp of [
  'InventoryOverview', 'InventoryProducts', 'InventoryChemicals',
  'InventoryFertilizer', 'InventoryParts', 'InventoryFuel',
  'InventoryLowStock', 'InventoryPurchaseHistory', 'InventoryCatalog',
  'InventoryLinkReview', 'InventoryCostBasisReview',
]) {
  const src = readFileSync(`src/pages/Inventory/tabs/${comp}.jsx`, 'utf8')
  assert(!src.includes('Phase 9B.2'),
    `src/pages/Inventory/tabs/${comp}.jsx carries no Phase 9B.2 edits`)
}

const APP = readFileSync('src/App.jsx', 'utf8')
assert(/path=["']inventory\/\*["']/.test(APP),
  'App.jsx still mounts <Route path="inventory/*" />')

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
