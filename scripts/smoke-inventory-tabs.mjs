// Simplified Inventory tab navigation smoke.
//
//   node scripts/smoke-inventory-tabs.mjs

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n-- ${name} --`) }

const INV = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')
const CSS = readFileSync('src/pages/Inventory/Inventory.module.css', 'utf8')
const FERTILIZER = readFileSync('src/pages/Inventory/tabs/InventoryFertilizer.jsx', 'utf8')

const FLAT_TABS = [
  'Stock',
  'Low Stock',
  'Chemicals',
  'Fertilizer',
  'Parts',
  'Fuel',
  'Purchases',
  'Cost Review',
  'Catalog',
  'Link Review',
]

section('Flat inventory tabs')
const tabsMatch = INV.match(/const\s+INVENTORY_TABS\s*=\s*\[([\s\S]*?)\]/)
assert(!!tabsMatch, 'INVENTORY_TABS constant exists')
for (const label of FLAT_TABS) {
  assert(tabsMatch && new RegExp(`'${label}'`).test(tabsMatch[1]), `${label} is in the main tab row`)
}
assert(tabsMatch && FLAT_TABS.every((label, i) => tabsMatch[1].indexOf(`'${label}'`) >= 0
    && (i === 0 || tabsMatch[1].indexOf(`'${FLAT_TABS[i - 1]}'`) < tabsMatch[1].indexOf(`'${label}'`))),
  'flat tabs stay in the expected order')
assert(/tabs=\{INVENTORY_TABS\}/.test(INV),
  'PageShell receives the flat inventory tabs')
assert(/description="Check stock, watch low items, and review purchases\."/.test(INV),
  'Inventory header copy is simplified')

section('Removed More menu')
assert(!/const\s+INVENTORY_MORE\b/.test(INV), 'INVENTORY_MORE is removed')
assert(!/\bmoreTab\b/.test(INV), 'moreTab state is removed')
assert(!/\bsetMoreTab\b/.test(INV), 'setMoreTab is removed')
assert(!/activeTab === 'More'/.test(INV), 'no More tab render branch remains')
assert(!/styles\.moreInner|styles\.moreNav|styles\.moreNavBtn/.test(INV),
  'Inventory.jsx no longer wires More row CSS')

section('Tab mappings')
assert(/activeTab === 'Stock'\s*&& <InventoryProducts \{\.\.\.productsProps\} \/>/.test(INV),
  'Stock mounts <InventoryProducts {...productsProps} />')
assert(/activeTab === 'Low Stock'\s*&& <InventoryLowStock \/>/.test(INV),
  'Low Stock mounts <InventoryLowStock />')
assert(/activeTab === 'Chemicals'[\s\S]{0,90}<InventoryChemicals onOpenCatalog=\{openCatalogProduct\} \/>/.test(INV),
  'Chemicals mounts <InventoryChemicals />')
assert(/activeTab === 'Fertilizer'[\s\S]{0,90}<InventoryFertilizer onOpenCatalog=\{openCatalogProduct\} \/>/.test(INV),
  'Fertilizer mounts <InventoryFertilizer />')
assert(/activeTab === 'Parts'\s*&& <InventoryParts \/>/.test(INV),
  'Parts mounts <InventoryParts />')
assert(/activeTab === 'Fuel'\s*&& <InventoryFuel \/>/.test(INV),
  'Fuel mounts <InventoryFuel />')
assert(/activeTab === 'Purchases'\s*&& <InventoryPurchaseHistory \/>/.test(INV),
  'Purchases mounts <InventoryPurchaseHistory />')
assert(/activeTab === 'Cost Review'\s*&& <InventoryCostBasisReview \/>/.test(INV),
  'Cost Review mounts <InventoryCostBasisReview />')
assert(/activeTab === 'Catalog'[\s\S]{0,180}<InventoryCatalog initialSelectedId=\{catalogSeedId\}/.test(INV),
  'Catalog mounts <InventoryCatalog />')
assert(/activeTab === 'Link Review'[\s\S]{0,90}<InventoryLinkReview onOpenCatalog=\{openCatalogProduct\}/.test(INV),
  'Link Review mounts <InventoryLinkReview />')

section('Legacy links')
for (const [oldKey, newKey] of [
  ['Products', 'Stock'],
  ['Overview', 'Stock'],
  ['Purchase History', 'Purchases'],
  ['Cost Basis Review', 'Cost Review'],
  ['More', 'Stock'],
]) {
  const re = new RegExp(`'${oldKey}'[^,}]*:\\s*'${newKey}'`)
  assert(re.test(INV), `${oldKey} maps to ${newKey}`)
}
assert(/return INVENTORY_TABS\.includes\(translated\) \? translated : 'Stock'/.test(INV),
  'Inventory defaults unsupported tabs to Stock')

section('Header actions')
assert(!/ChemicalImportWizard/.test(INV),
  'Inventory no longer imports or mounts the PDF chemical wizard')
assert(!/Add Chemical from PDF/.test(INV),
  'Inventory header does not show Add Chemical from PDF')
assert(!/WorkspaceActions/.test(INV),
  'Inventory no longer imports WorkspaceActions')
assert(!/actions=\{/.test(INV),
  'Inventory header shortcuts are removed')
assert(!/onClick=\{\(\) => setActiveTab\('Low Stock'\)\}/.test(INV),
  'Low Stock is no longer duplicated as a header action')
assert(!/onClick=\{\(\) => setActiveTab\('Purchases'\)\}/.test(INV),
  'Orders/Purchases is no longer duplicated as a header action')
assert(/setActiveTab\('Catalog'\)/.test(INV),
  'Catalog chip handoff points directly to Catalog')

section('Fertilizer actions')
assert(/import \{ deleteInventory, useInventoryData \}/.test(FERTILIZER),
  'Fertilizer tab imports the shared deleteInventory action')
assert(/async function handleDeleteItem\(item\)/.test(FERTILIZER),
  'Fertilizer tab has a delete handler')
assert(/Delete \$\{item\.name\} from fertilizer inventory/.test(FERTILIZER),
  'Fertilizer delete asks for confirmation')
assert(/className=\{`\$\{styles\.cardEditBtn\} \$\{styles\.cardDeleteBtn\}`\}/.test(FERTILIZER),
  'Fertilizer cards render a delete button next to edit')
assert(/\.cardDeleteBtn\b/.test(CSS),
  'Inventory CSS defines fertilizer card delete button styling')

section('No course fork')
assert(!/import\s*\{\s*useSelectedCourseId/.test(INV), 'useSelectedCourseId is not imported')
assert(!/const\s+CROSSWINDS_COURSE_ID/.test(INV), 'CROSSWINDS_COURSE_ID constant is not used')
assert(!/const\s+CROSSWINDS_TABS/.test(INV), 'CROSSWINDS_TABS constant is not used')
assert(!/const\s+CROSSWINDS_MORE/.test(INV), 'CROSSWINDS_MORE constant is not used')
assert(!/const\s+LEGACY_TABS/.test(INV), 'LEGACY_TABS constant is not used')
assert(!/\bisCrosswinds\b\s*=/.test(INV), 'isCrosswinds branch is not used')

section('More row styling removed')
for (const cls of ['moreInner', 'moreNav', 'moreNavBtn']) {
  assert(!new RegExp(`\\.${cls}\\b`).test(CSS), `CSS no longer defines .${cls}`)
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
