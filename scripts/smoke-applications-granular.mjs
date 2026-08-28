import { readFileSync } from 'node:fs'

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    passed += 1
    console.log(`ok - ${message}`)
    return
  }
  failed += 1
  console.error(`FAIL: ${message}`)
}

const shell = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const records = readFileSync('src/pages/Spray/tabs/SprayRecords.jsx', 'utf8')
const calendar = readFileSync('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx', 'utf8')
const sheet = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx', 'utf8')
const sidebar = readFileSync('src/components/layout/Sidebar.jsx', 'utf8')
const commands = readFileSync('src/utils/command/commandRegistry.js', 'utf8')
const css = readFileSync('src/pages/Spray/Spray.module.css', 'utf8')

assert(/title="Applications"/.test(shell), 'main page title is Applications')
assert(/liquid sprays and granular applications/.test(shell), 'page description mentions liquid and granular applications')
assert(/label:\s*'Applications'/.test(sidebar), 'sidebar label is Applications')
assert(/label:\s*'Applications'/.test(commands), 'command palette label is Applications')

assert(/const APPLICATION_TYPES\s*=\s*\[[\s\S]*value:\s*'liquid'[\s\S]*value:\s*'granular'/.test(builder),
  'builder has liquid and granular application type choices')
assert(/applicationType:\s*'liquid'/.test(builder), 'new drafts default to liquid application')
assert(/function ApplicationTypeSelector/.test(builder) && /role="radiogroup"/.test(builder),
  'application type selector is rendered as a clear two-choice control')
assert(/const isLiquidApplication = applicationType === 'liquid'/.test(builder),
  'builder derives liquid mode from the selected application type')
assert(/isLiquidApplication \? isSprayerEquipment : isGranularEquipment/.test(builder),
  'equipment picker switches between sprayers and granular equipment')
assert(/label=\{isLiquidApplication \? 'Spray rig' : 'Application equipment'\}/.test(builder),
  'equipment field label changes by application type')

assert(/\{isLiquidApplication && \([\s\S]*?<Field label="Carrier rate">/.test(builder),
  'carrier rate controls only show for liquid applications')
assert(/\{isLiquidApplication && \([\s\S]*?<Field label="Tank capacity \(gal\)">/.test(builder),
  'tank capacity only shows for liquid applications')
assert(/\{isLiquidApplication && \([\s\S]*?<LoadPlanPanel/.test(builder),
  'load plan only shows for liquid applications')
assert(/summary\.isLiquidApplication \? 'Nutrients in tank' : 'Nutrients applied'/.test(builder),
  'nutrient wording changes for granular applications')
assert(/applicationName:\s*`\$\{applicationTypeLabel\(applicationType\)\} -/.test(builder),
  'saved records include application type in the name')
assert(/carrierVolume:\s*isLiquidApplication \? formatCarrierSummary\(draft, summary\) : 'Granular application'/.test(builder),
  'granular records save without liquid carrier volume')
assert(/totalVolume:\s*isLiquidApplication \? summary\.totalCarrierGal : null/.test(builder),
  'granular records save without total water volume')
assert(/Save & Log Application/.test(builder), 'final action says Save & Log Application')

assert(/isGranular \? 'Granular' : 'Tank Mix'/.test(records),
  'records badge identifies granular records')
assert(/Application Calendar/.test(calendar) && /Start New Application/.test(calendar),
  'calendar workspace uses application wording')
assert(/aria-label=\{`View application record/.test(calendar),
  'calendar row opens an application record')

assert(/aria-label="Application record sheet"/.test(sheet), 'record modal dialog uses application wording')
assert(/Edit products/.test(sheet) && /Delete Application/.test(sheet), 'record modal actions use product/application wording')
assert(/Application Type/.test(sheet) && /isGranularApplication \? 'Granular' : 'Liquid Spray'/.test(sheet),
  'print sheet and details show application type')
assert(/Applied areas/.test(sheet) && /Applied Areas/.test(sheet), 'record modal and print sheet use applied areas wording')

assert(/\.naApplicationTypeGroup/.test(css) && /@media \(max-width: 600px\)[\s\S]*\.naApplicationTypeGroup[\s\S]*grid-template-columns: 1fr/.test(css),
  'application type selector is styled and stacks on mobile')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
