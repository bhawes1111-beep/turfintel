import { readFileSync } from 'fs'

let passed = 0
let failed = 0

function assert(cond, label) {
  if (cond) {
    passed += 1
    console.log(`  OK ${label}`)
  } else {
    failed += 1
    console.error(`  NO ${label}`)
  }
}

const modal = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const manualForm = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const products = readFileSync('src/pages/Inventory/tabs/InventoryProducts.jsx', 'utf8')
const chemicals = readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx', 'utf8')
const fertilizer = readFileSync('src/pages/Inventory/tabs/InventoryFertilizer.jsx', 'utf8')
const parts = readFileSync('src/pages/Inventory/tabs/InventoryParts.jsx', 'utf8')
const fuel = readFileSync('src/pages/Inventory/tabs/InventoryFuel.jsx', 'utf8')
const worker = readFileSync('worker/api/inventory.js', 'utf8')
const migration = readFileSync('worker/migrations/0059_inventory_container_sizes.sql', 'utf8')
const countMigration = readFileSync('worker/migrations/0060_inventory_container_counts.sql', 'utf8')
const modalCss = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.module.css', 'utf8')
const sideDrawer = readFileSync('src/components/primitives/SideDrawer/SideDrawer.jsx', 'utf8')
const sideDrawerCss = readFileSync('src/components/primitives/SideDrawer/SideDrawer.module.css', 'utf8')
const containerSize = readFileSync('src/utils/inventory/containerSize.js', 'utf8')

console.log('\nInventory full edit modal')
assert(/setInventoryCostBasis/.test(modal), 'edits cost basis through the narrow cost path')
assert(/patchInventory\(item\.id, payload\)/.test(modal), 'saves common fields through inventory patch')
assert(/aria-label="Inventory item name"/.test(modal), 'edits item name')
assert(/aria-label="Inventory type"/.test(modal), 'edits inventory type')
assert(/aria-label="Inventory category"/.test(modal), 'edits category')
assert(/aria-label="Containers on hand"/.test(modal), 'edits container count')
assert(/aria-label="Size per container"/.test(modal), 'edits size per container')
assert(/aria-label="Stocking unit"/.test(modal), 'edits unit')
assert(/aria-label="Price per container"/.test(modal), 'edits price per container')
assert(/calculateUnitCost/.test(modal), 'derives per-unit cost from package price')
assert(/aria-label="Reorder level"/.test(modal), 'edits reorder level')
assert(/aria-label="Storage location"/.test(modal), 'edits location')
assert(/aria-label="Vendor"/.test(modal), 'edits vendor')
assert(/aria-label="General inventory notes"/.test(modal), 'edits notes')
assert(/aria-label="EPA number"/.test(modal), 'edits chemical details')
assert(/<legend>Nutrient sources<\/legend>/.test(modal), 'edits structured nutrient source details')
assert(/aria-label="Part number"/.test(modal), 'edits part details')
assert(/aria-label="Tank capacity"/.test(modal), 'edits fuel details')
assert(/z-index:\s*1200/.test(modalCss), 'edit modal sits above the inventory side drawer')
assert(!/onClick=\{handleBackdrop\}/.test(modal), 'edit modal does not close when clicking outside')
assert(!/const backdropClick/.test(sideDrawer), 'shared side drawer does not close from backdrop click')
assert(/cursor:\s*default/.test(sideDrawerCss), 'side drawer backdrop does not invite click-to-close')

console.log('\nManual add product modal')
assert(/data-modal="add-inventory-product"/.test(manualForm), 'manual add uses modal shell')
assert(/\.\/EditInventoryQuantityModal\.module\.css/.test(manualForm), 'manual add reuses edit modal styling')
assert(/createInventory/.test(manualForm), 'manual add still creates inventory items')
assert(/setInventoryCostBasis/.test(manualForm), 'manual add still saves cost basis')
assert(/aria-label="Inventory item name"/.test(manualForm), 'manual add captures item name')
assert(/aria-label="Inventory type"/.test(manualForm), 'manual add captures inventory type')
assert(/aria-label="Containers on hand"/.test(manualForm), 'manual add captures container count')
assert(/aria-label="Size per container"/.test(manualForm), 'manual add captures size per container')
assert(/aria-label="Price per container"/.test(manualForm), 'manual add captures price per container')
assert(/calculateUnitCost/.test(manualForm), 'manual add derives per-unit cost from package price')
assert(/aria-label="Reorder level"/.test(manualForm), 'manual add captures reorder level')
assert(/aria-label="EPA number"/.test(manualForm), 'manual add captures chemical details')
assert(/<legend>Nutrient sources<\/legend>/.test(manualForm), 'manual add captures structured nutrient source details')
assert(/aria-label="Part number"/.test(manualForm), 'manual add captures part details')
assert(/aria-label="Tank capacity"/.test(manualForm), 'manual add captures fuel details')

console.log('\nInventory tab wiring')
for (const [name, source] of [
  ['Stock', products],
  ['Chemicals', chemicals],
  ['Fertilizer', fertilizer],
  ['Parts', parts],
  ['Fuel', fuel],
]) {
  assert(/EditInventoryQuantityModal/.test(source), `${name} imports or renders the shared editor`)
  assert(/can\('canEditInventory'\)/.test(source), `${name} keeps edit access permission-gated`)
  assert(/Edit item/.test(source), `${name} shows an Edit item button`)
}

console.log('\nWorker coverage')
for (const field of [
  'kind',
  'name',
  'category',
  'unit',
  'containerCount',
  'containerSize',
  'containerUnit',
  'containerType',
  'containerPrice',
  'quantity',
  'reorderLevel',
  'location',
  'vendor',
  'notes',
  'manufacturer',
  'epaNumber',
  'expiryDate',
  'partNumber',
  'equipment',
  'analysis',
  'nitrogenSource',
  'tankCapacity',
  'currentLevel',
  'lastFill',
  'relatedUsage',
]) {
  assert(new RegExp(`${field}:\\s*'`).test(worker), `worker accepts ${field}`)
}

console.log('\nPackage size persistence and display')
assert(/container_size TEXT/.test(migration), 'migration adds container size column')
assert(/container_unit TEXT/.test(migration), 'migration adds container unit column')
assert(/container_type TEXT/.test(migration), 'migration adds container type column')
assert(/container_count REAL/.test(countMigration), 'migration adds container count column')
assert(/container_price REAL/.test(countMigration), 'migration adds container price column')
assert(/containerSize:\s*row\.container_size/.test(worker), 'worker maps package size from D1')
assert(/containerCount:\s*row\.container_count/.test(worker), 'worker maps container count from D1')
assert(/containerPrice:\s*row\.container_price/.test(worker), 'worker maps container price from D1')
assert(/body\.containerSize/.test(worker), 'worker inserts package size on create')
assert(/body\.containerCount/.test(worker), 'worker inserts container count on create')
assert(/body\.containerPrice/.test(worker), 'worker inserts container price on create')
assert(/formatContainerSize/.test(containerSize), 'shared package-size formatter exists')
assert(/calculateContainerTotal/.test(containerSize), 'shared total inventory calculator exists')
assert(/calculateUnitCost/.test(containerSize), 'shared package price to unit cost calculator exists')
assert(/calculateContainerInventoryValue/.test(containerSize), 'shared package inventory value calculator exists')
assert(/formatContainerSize/.test(products), 'products view displays package size')
assert(/formatContainerSize/.test(chemicals), 'chemicals view displays package size')
assert(/formatContainerSize/.test(fertilizer), 'fertilizer view displays package size')
assert(/formatContainerSize/.test(parts), 'parts view displays package size')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
