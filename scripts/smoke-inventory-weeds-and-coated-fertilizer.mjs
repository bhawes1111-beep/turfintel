import { readFileSync } from 'node:fs'

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok - ${message}`)
}

const weeds = readFileSync('src/utils/inventory/weedTargets.js', 'utf8')
const weedEditor = readFileSync('src/pages/Inventory/components/WeedTargetsEditor.jsx', 'utf8')
const coatings = readFileSync('src/utils/inventory/fertilizerCoatings.js', 'utf8')
const coatingEditor = readFileSync('src/pages/Inventory/components/FertilizerCoatingEditor.jsx', 'utf8')
const manual = readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const edit = readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const chemicals = readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx', 'utf8')
const fertilizer = readFileSync('src/pages/Inventory/tabs/InventoryFertilizer.jsx', 'utf8')
const api = readFileSync('worker/api/inventory.js', 'utf8')
const migration = readFileSync('worker/migrations/0070_inventory_weeds_and_coated_fertilizer.sql', 'utf8')
const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')

const weedValues = [...weeds.matchAll(/value:\s*'([^']+)'/g)].map(match => match[1])
assert(new Set(weedValues).size === weedValues.length,
  'weed option values are unique')

for (const token of [
  'annual_bluegrass',
  'annual_trampweed',
  'alexandergrass',
  'crabgrass',
  'southern_crabgrass',
  'smooth_crabgrass',
  'broadleaf_signalgrass',
  'goosegrass',
  'globe_sedge',
  'nutsedge',
  'green_kyllinga',
  'florida_betony',
  'florida_beggarweed',
  'florida_pusley',
  'spotted_spurge',
  'chamberbitter',
  'doveweed',
  'dollarweed',
  'white_clover',
  'oxalis',
  'henbit',
  'common_chickweed',
  'virginia_buttonweed',
  'wild_garlic',
  'wild_onion',
  'lawn_burweed',
  'sandbur',
  'torpedograss',
  'annual_grassy_weeds',
  'annual_broadleaf_weeds',
]) {
  assert(weeds.includes(token), `turf weed option exists: ${token}`)
}

for (const token of ['pre_emergent', 'post_emergent', 'pre_post_emergent', 'suppression']) {
  assert(weeds.includes(token), `weed control timing exists: ${token}`)
}

assert(/normalizeWeedTargets/.test(weeds) && /formatWeedTargetSummary/.test(weeds),
  'weed utility normalizes and summarizes rows')
assert(/weed:\s*''/.test(weeds),
  'new weed rows start blank instead of defaulting to alligatorweed')
assert(/keepEmpty/.test(weeds) && /\.filter\(row => keepEmpty \|\| row\.weed\)/.test(weeds),
  'weed utility keeps blank rows only while editing')
assert(/editableRows\(value\)/.test(weedEditor) && /function replaceRows\(nextRows\)[\s\S]*?onChange\?\.\(nextRows\)/.test(weedEditor),
  'weed editor keeps a blank searchable row while typing')
assert(/type="text"/.test(weedEditor) && /placeholder="Type to search or add\.\.\."/.test(weedEditor),
  'weed editor renders a plain text search field so spaces work')
assert(/onKeyDown=\{e => e\.stopPropagation\(\)\}/.test(weedEditor),
  'weed editor keeps keyboard typing inside the search field')
assert(/searchMatches\(row\)\.map/.test(weedEditor) && /className=\{styles\.weedSearchMenu\}/.test(weedEditor),
  'weed editor renders its own searchable option menu')
assert(/WEED_CONTROL_TIMINGS\.map/.test(weedEditor),
  'weed editor renders pre/post control dropdown')
assert(/onClick=\{addRow\}/.test(weedEditor) && /Remove/.test(weedEditor),
  'weed editor can add and remove rows')
assert(/Add "\{String\(row\.weed\)\.trim\(\)\}" to list/.test(weedEditor) && /setCustomOptions/.test(weedEditor),
  'weed editor can add custom weed text to the local list')
assert(/weedTargetRow/.test(weedEditor),
  'weed editor uses the polished weed row layout')

for (const token of [
  'sulfur_coated_urea',
  'polymer_coated_urea',
  'polymer_sulfur_coated_urea',
  'coated_nitrogen_blend',
  'resin_coated_fertilizer',
  'controlled_release_coated_fertilizer',
]) {
  assert(coatings.includes(token), `coated fertilizer option exists: ${token}`)
}

assert(/normalizeFertilizerCoating/.test(coatings) && /formatFertilizerCoatingSummary/.test(coatings),
  'fertilizer coating utility normalizes and summarizes details')
assert(/FERTILIZER_COATING_TYPES\.map/.test(coatingEditor) && /COATED_NUTRIENT_OPTIONS\.map/.test(coatingEditor),
  'coated fertilizer editor renders coating and nutrient dropdowns')
assert(/Coated percent/.test(coatingEditor) && /Release days/.test(coatingEditor),
  'coated fertilizer editor captures percent and release window')

for (const [name, source] of [['manual add', manual], ['edit modal', edit]]) {
  assert(/WeedTargetsEditor/.test(source), `${name} renders weed target editor`)
  assert(/weedTargets:\s*form\.kind === 'chemical' \? normalizeWeedTargets/.test(source),
    `${name} saves weed targets only for chemicals`)
  assert(/<legend>Weeds controlled<\/legend>/.test(source),
    `${name} labels the weeds controlled section`)
  assert(/FertilizerCoatingEditor/.test(source), `${name} renders coated fertilizer editor`)
  assert(/fertilizerCoating:\s*form\.kind === 'fertilizer' \? normalizeFertilizerCoating/.test(source),
    `${name} saves coating only for fertilizers`)
  assert(/<legend>Coated fertilizer<\/legend>/.test(source),
    `${name} labels the coated fertilizer section`)
}

assert(/formatWeedTargetSummary\(c\.weedTargets\)/.test(chemicals),
  'chemical cards display weed summaries')
assert(/formatFertilizerCoatingSummary\(f\.fertilizerCoating\)/.test(fertilizer),
  'fertilizer cards display coating summaries')
assert(/weedTargets:\s*'weed_targets'/.test(api),
  'inventory API accepts weedTargets updates')
assert(/fertilizerCoating:\s*'fertilizer_coating'/.test(api),
  'inventory API accepts fertilizerCoating updates')
assert(/weedTargets = \[\][\s\S]*?JSON\.parse\(row\.weed_targets\)/.test(api),
  'inventory API parses weed_targets JSON')
assert(/fertilizerCoating = null[\s\S]*?JSON\.parse\(row\.fertilizer_coating\)/.test(api),
  'inventory API parses fertilizer_coating JSON')
assert(/apiKey === 'relatedUsage'[\s\S]*?apiKey === 'weedTargets'[\s\S]*?apiKey === 'fertilizerCoating'/.test(api),
  'inventory API stringifies weedTargets and fertilizerCoating JSON on patch')
assert(/ADD COLUMN weed_targets TEXT/.test(migration) && /ADD COLUMN fertilizer_coating TEXT/.test(migration),
  'migration adds weed and coating columns')
assert(/normalizeWeedTargets\(row\?\.inv\?\.weedTargets\)/.test(builder),
  'application builder reads inventory weed targets')
assert(/weedLabel\(target\.weed\)/.test(builder),
  'application builder uses weed names in target treatment')
