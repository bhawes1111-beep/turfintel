// Simplified spray / nutrition / resistance workflow smoke.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`) }
}

const spray = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const resistance = readFileSync('src/pages/Spray/tabs/ProgramIntelligence.jsx', 'utf8')
const nutrition = readFileSync('src/pages/PlantNutrition/PlantNutrition.jsx', 'utf8')
const inventory = readFileSync('src/pages/Inventory/Inventory.jsx', 'utf8')

assert(/const SPRAY_TABS = \[\s*'Calendar',\s*'New Application',\s*'Records',\s*'Resistance',\s*'Planning',\s*'Calculator',\s*'Reports',?\s*\]/.test(spray),
  'spray workspace has one flat main navigation')
assert(/activeTab === 'Resistance'\s*&& <ProgramIntelligence \/>/.test(spray),
  'Resistance tab opens resistance management')
assert(!/SPRAY_MORE/.test(spray), 'spray no longer uses a More submenu')
assert(/activeTab === 'Planning'\s*&& <SprayProgramPlanner \/>/.test(spray),
  'Planning opens planned spray tools directly')
assert(/activeTab === 'Calculator'\s*&& <MixCalculator \/>/.test(spray),
  'Calculator opens directly')
assert(/activeTab === 'Reports'\s*&& <SprayReports \/>/.test(spray),
  'Reports opens directly')
assert(/activeTab === 'Calendar'\s*&&\s*\(\s*<SprayCalendarWorkspace/.test(spray),
  'Calendar tab opens the spray calendar workspace')
assert(/showApplicationChecks/.test(builder), 'spray builder has application-checks toggle')
assert(/Show application checks/.test(builder), 'spray builder hides dense checks by default')

assert(/title="Resistance Management"/.test(resistance), 'resistance page has direct title')
assert(/function ResistanceSnapshot/.test(resistance), 'resistance page renders a plain-language snapshot')
assert(/Show detailed chemistry/.test(resistance), 'detailed resistance analytics are collapsible')

assert(/const TABS = \['Overview', 'Log Nutrients', 'Lab Reports', 'Trends', 'Recommendations'\]/.test(nutrition),
  'plant nutrition has simplified 5-tab navigation')
assert(/function LabReportsHub/.test(nutrition), 'lab reports are grouped into one hub')
assert(/<SoilReports \/>[\s\S]*<TissueReports \/>[\s\S]*<WaterReports \/>[\s\S]*<UploadCenter \/>/.test(nutrition),
  'lab reports hub keeps soil, tissue, water, and uploads available')

assert(/const INVENTORY_TABS = \[\s*'Stock',\s*'Low Stock',\s*'Chemicals',\s*'Fertilizer',\s*'Parts',\s*'Fuel',\s*'Purchases',\s*'Cost Review',\s*'Catalog',\s*'Link Review',?\s*\]/.test(inventory),
  'inventory has one simplified flat tab row')
assert(!/const INVENTORY_MORE/.test(inventory),
  'inventory no longer uses a More submenu')
assert(/activeTab === 'Stock'\s*&& <InventoryProducts \{\.\.\.productsProps\} \/>/.test(inventory),
  'Stock tab opens product stock')
assert(/activeTab === 'Cost Review'\s*&& <InventoryCostBasisReview \/>/.test(inventory),
  'Cost Review remains available as a direct tab')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
